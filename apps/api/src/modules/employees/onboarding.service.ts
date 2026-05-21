import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotificationEngine } from '@/modules/notifications/notification-engine.service';
import {
  AdvanceOnboardingDto,
  CancelVisaDto,
  OnboardingStage,
} from './dto/onboarding.dto';

// ─── State machine gate rules ────────────────────────────────────────────────
//
// Each entry maps a stage to the prerequisite stage that must have a COMPLETED
// task before this stage can be advanced to.
//
// Rule interpretation:
//   "MEDICAL stages cannot start until WORK_PERMIT_APPROVED"
//   → both MEDICAL_PENDING and MEDICAL_COMPLETED are gated behind WORK_PERMIT_APPROVED
//
const STAGE_GATE: Partial<Record<OnboardingStage, OnboardingStage>> = {
  MEDICAL_PENDING:     'WORK_PERMIT_APPROVED',
  MEDICAL_COMPLETED:   'WORK_PERMIT_APPROVED',
  INSURANCE_PENDING:   'MEDICAL_COMPLETED',
  INSURANCE_COMPLETED: 'MEDICAL_COMPLETED',
  RESIDENCY_PENDING:   'INSURANCE_COMPLETED',
  RESIDENCY_COMPLETED: 'INSURANCE_COMPLETED',
  EID_PENDING:         'RESIDENCY_COMPLETED',
  EID_DELIVERED:       'RESIDENCY_COMPLETED',
  ONBOARDED:           'EID_DELIVERED',
};

const GRACE_PERIOD_DAYS = 15;

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationEngine,
  ) {}

  // ─── GET /employees/:id/onboarding ────────────────────────────────────────

  async getOnboardingState(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        name: true,
        isNewEmployee: true,
        onboardingState: true,
        cancellationGraceEndsAt: true,
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const tasks = await this.prisma.onboardingTask.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'asc' },
    });

    const graceEndsAt = employee.cancellationGraceEndsAt;
    const graceDaysRemaining =
      graceEndsAt
        ? Math.max(0, Math.ceil((graceEndsAt.getTime() - Date.now()) / (24 * 3600 * 1000)))
        : null;

    return {
      employeeId,
      employeeName: employee.name,
      isNewEmployee: employee.isNewEmployee,
      currentState: employee.onboardingState,
      cancellationGraceEndsAt: graceEndsAt?.toISOString() ?? null,
      graceDaysRemaining,
      tasks,
    };
  }

  // ─── POST /employees/:id/onboarding/advance ───────────────────────────────

  async advance(actor: AuthUser, employeeId: string, dto: AdvanceOnboardingDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, tenantId: true, companyId: true, name: true, onboardingState: true, isActive: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (!employee.isActive) throw new BadRequestException('Cannot advance onboarding for an inactive employee');

    if (employee.onboardingState === 'CANCELLED') {
      throw new ConflictException('Onboarding is in a terminal CANCELLED state and cannot be advanced');
    }

    await this.assertGatePassed(employeeId, dto.stage);

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Upsert the task for this stage. If one already exists, update it.
      const existing = await tx.onboardingTask.findFirst({
        where: { employeeId, stage: dto.stage },
        select: { id: true },
      });

      let task;
      if (existing) {
        task = await tx.onboardingTask.update({
          where: { id: existing.id },
          data: {
            status: dto.status,
            notes: dto.notes ?? undefined,
            attachmentId: dto.attachmentId ?? undefined,
            completedAt: dto.status === 'COMPLETED' ? now : null,
            completedBy: dto.status === 'COMPLETED' ? actor.id : null,
          },
        });
      } else {
        task = await tx.onboardingTask.create({
          data: {
            tenantId: employee.tenantId,
            companyId: employee.companyId,
            employeeId,
            stage: dto.stage,
            status: dto.status,
            notes: dto.notes ?? null,
            attachmentId: dto.attachmentId ?? null,
            completedAt: dto.status === 'COMPLETED' ? now : null,
            completedBy: dto.status === 'COMPLETED' ? actor.id : null,
          } as Prisma.OnboardingTaskUncheckedCreateInput,
        });
      }

      // Update employee.onboardingState if this is a forward progression
      const updateData: Prisma.EmployeeUpdateInput = {
        onboardingState: dto.stage,
        isNewEmployee: true,
      };
      if (dto.stage === 'ONBOARDED' && dto.status === 'COMPLETED') {
        updateData.onboardingState = 'ONBOARDED';
      }

      await tx.employee.update({
        where: { id: employeeId },
        data: updateData,
      });

      await tx.auditLog.create({
        data: {
          tenantId: employee.tenantId,
          userId: actor.id,
          action: 'ONBOARDING_ADVANCED',
          entityType: 'Employee',
          entityId: employeeId,
          details: {
            stage: dto.stage,
            status: dto.status,
            employeeName: employee.name,
          } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });

      return { employee: { id: employeeId, onboardingState: dto.stage }, task };
    });
  }

  // ─── POST /employees/:id/onboarding/cancel ────────────────────────────────

  async cancelVisa(actor: AuthUser, employeeId: string, dto: CancelVisaDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, tenantId: true, companyId: true, name: true, onboardingState: true, isActive: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.onboardingState === 'CANCELLED') {
      throw new ConflictException('Onboarding is already in a terminal CANCELLED state');
    }
    if (employee.onboardingState === 'VISIT_VISA_CANCELLED') {
      throw new ConflictException('Visit visa cancellation already recorded');
    }

    const graceEndsAt = addDays(new Date(), GRACE_PERIOD_DAYS);

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.onboardingTask.create({
        data: {
          tenantId: employee.tenantId,
          companyId: employee.companyId,
          employeeId,
          stage: 'VISIT_VISA_CANCELLED',
          status: 'CANCELLED',
          notes: dto.notes ?? null,
          completedAt: new Date(),
          completedBy: actor.id,
        } as Prisma.OnboardingTaskUncheckedCreateInput,
      });

      await tx.employee.update({
        where: { id: employeeId },
        data: {
          onboardingState: 'VISIT_VISA_CANCELLED',
          cancellationGraceEndsAt: graceEndsAt,
          isNewEmployee: true,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: employee.tenantId,
          userId: actor.id,
          action: 'ONBOARDING_VISA_CANCELLED',
          entityType: 'Employee',
          entityId: employeeId,
          details: {
            employeeName: employee.name,
            graceEndsAt: graceEndsAt.toISOString(),
            reason: dto.notes ?? 'Visit visa cancelled',
          } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });

      return {
        employee: {
          id: employeeId,
          onboardingState: 'VISIT_VISA_CANCELLED',
          cancellationGraceEndsAt: graceEndsAt.toISOString(),
          graceDaysRemaining: GRACE_PERIOD_DAYS,
        },
        task,
      };
    });
  }

  // ─── Called by the daily grace-sweep cron job ─────────────────────────────

  /**
   * Processes all employees in VISIT_VISA_CANCELLED state:
   *   - Grace expired → transition to terminal CANCELLED, log audit entry
   *   - Grace still active → fire daily ONBOARDING_VISA_GRACE_ALARM notification
   *
   * Runs tenant-agnostically via runUnscoped.
   */
  async runGracePeriodSweep(): Promise<{ expired: number; alarmed: number }> {
    return this.prisma.runUnscoped(async () => {
      const now = new Date();
      let expired = 0;
      let alarmed = 0;

      const employees = await this.prisma.employee.findMany({
        where: {
          onboardingState: 'VISIT_VISA_CANCELLED',
          isNewEmployee: true,
          cancellationGraceEndsAt: { not: null },
        },
        select: {
          id: true,
          tenantId: true,
          name: true,
          cancellationGraceEndsAt: true,
        },
      });

      for (const emp of employees) {
        if (!emp.cancellationGraceEndsAt) continue;

        if (emp.cancellationGraceEndsAt <= now) {
          // Grace period expired — transition to terminal CANCELLED
          await this.prisma.employee.update({
            where: { id: emp.id },
            data: { onboardingState: 'CANCELLED' },
          });
          await this.prisma.auditLog.create({
            data: {
              tenantId: emp.tenantId,
              action: 'ONBOARDING_GRACE_EXPIRED',
              entityType: 'Employee',
              entityId: emp.id,
              details: {
                employeeName: emp.name,
                graceEndsAt: emp.cancellationGraceEndsAt.toISOString(),
              } as Prisma.InputJsonValue,
            } as unknown as Prisma.AuditLogUncheckedCreateInput,
          });
          expired++;
          this.logger.log(`Grace expired for employee ${emp.id} (${emp.name}) — transitioned to CANCELLED`);
        } else {
          // Still in grace period — fire daily alarm
          const daysRemaining = Math.ceil(
            (emp.cancellationGraceEndsAt.getTime() - now.getTime()) / (24 * 3600 * 1000),
          );
          this.notifications
            .dispatch({
              tenantId: emp.tenantId,
              type: NotificationType.ONBOARDING_VISA_GRACE_ALARM,
              entityId: emp.id,
              entityType: 'Employee',
              variables: {
                employeeName: emp.name,
                graceEndsAt: emp.cancellationGraceEndsAt.toISOString().slice(0, 10),
                daysRemaining: String(daysRemaining),
                actionUrl: `/employees/${emp.id}`,
              },
            })
            .catch((e) =>
              this.logger.warn(`Grace alarm dispatch failed for ${emp.id}: ${(e as Error).message}`),
            );
          alarmed++;
        }
      }

      this.logger.log(`Grace sweep complete: ${expired} expired, ${alarmed} alarms fired`);
      return { expired, alarmed };
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async assertGatePassed(employeeId: string, stage: OnboardingStage): Promise<void> {
    const requiredStage = STAGE_GATE[stage];
    if (!requiredStage) return; // no gate for this stage

    const prerequisite = await this.prisma.onboardingTask.findFirst({
      where: { employeeId, stage: requiredStage, status: 'COMPLETED' },
      select: { id: true },
    });

    if (!prerequisite) {
      throw new BadRequestException(
        `Cannot advance to ${stage}: stage "${requiredStage}" must be COMPLETED first`,
      );
    }
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
