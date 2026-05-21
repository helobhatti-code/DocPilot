/**
 * OnboardingService unit tests.
 *
 * Covered scenarios:
 *   1. Gate rule: cannot advance to MEDICAL_PENDING without WORK_PERMIT_APPROVED COMPLETED → 400
 *   2. cancelVisa sets cancellationGraceEndsAt = now + 15 days
 *   3. runGracePeriodSweep: after grace period ends, employee transitions to CANCELLED
 *   4. Happy path: VISIT_VISA_VALID → WORK_PERMIT_APPROVED → MEDICAL_COMPLETED → ... → ONBOARDED
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { makeMockPrisma, makeUser, TENANT_ID } from '../../../test/helpers';

const EMPLOYEE_ID = 'emp-0001';
const COMPANY_ID  = 'co-0001';

function buildSvc() {
  const prisma = makeMockPrisma();
  const notifications = { dispatch: jest.fn().mockResolvedValue({ sent: 1, deduped: 0 }) };
  const svc = new OnboardingService(prisma as unknown as never, notifications as unknown as never);
  return { prisma, svc, notifications };
}

function makeEmployee(overrides: Partial<any> = {}) {
  return {
    id:                      EMPLOYEE_ID,
    tenantId:                TENANT_ID,
    companyId:               COMPANY_ID,
    name:                    'Ali Hassan',
    isNewEmployee:           true,
    onboardingState:         null,
    cancellationGraceEndsAt: null,
    isActive:                true,
    ...overrides,
  };
}

function makeTask(overrides: Partial<any> = {}) {
  return {
    id:           'task-01',
    tenantId:     TENANT_ID,
    companyId:    COMPANY_ID,
    employeeId:   EMPLOYEE_ID,
    stage:        'VISIT_VISA_VALID',
    status:       'COMPLETED',
    completedAt:  new Date(),
    completedBy:  makeUser().id,
    attachmentId: null,
    notes:        null,
    createdAt:    new Date(),
    updatedAt:    new Date(),
    ...overrides,
  };
}

// ─── 1. Gate rule: MEDICAL_PENDING blocked without WORK_PERMIT_APPROVED ───────

describe('OnboardingService — gate rules', () => {
  it('throws 400 when advancing to MEDICAL_PENDING without WORK_PERMIT_APPROVED COMPLETED', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.findUnique.mockResolvedValue(makeEmployee());
    // No WORK_PERMIT_APPROVED task exists
    prisma.onboardingTask.findFirst.mockResolvedValue(null);

    await expect(
      svc.advance(makeUser(), EMPLOYEE_ID, { stage: 'MEDICAL_PENDING', status: 'IN_PROGRESS' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const call = svc.advance(makeUser(), EMPLOYEE_ID, { stage: 'MEDICAL_PENDING', status: 'IN_PROGRESS' });
    await expect(call).rejects.toMatchObject({
      message: expect.stringContaining('WORK_PERMIT_APPROVED'),
    });
  });

  it('allows MEDICAL_PENDING when WORK_PERMIT_APPROVED is COMPLETED', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.findUnique.mockResolvedValue(makeEmployee({ onboardingState: 'WORK_PERMIT_APPROVED' }));
    // Gate check: WORK_PERMIT_APPROVED task exists and is COMPLETED
    prisma.onboardingTask.findFirst
      .mockResolvedValueOnce(makeTask({ stage: 'WORK_PERMIT_APPROVED', status: 'COMPLETED' })) // gate check
      .mockResolvedValueOnce(null); // existing task check (none yet)
    prisma.onboardingTask.create.mockResolvedValue(makeTask({ stage: 'MEDICAL_PENDING', status: 'IN_PROGRESS' }));
    prisma.employee.update.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    // Intercept $transaction and invoke the callback with the mock prisma
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));

    const result = await svc.advance(makeUser(), EMPLOYEE_ID, {
      stage: 'MEDICAL_PENDING',
      status: 'IN_PROGRESS',
    });

    expect(result.task.stage).toBe('MEDICAL_PENDING');
  });

  it('throws 400 when advancing to INSURANCE_PENDING without MEDICAL_COMPLETED', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.findUnique.mockResolvedValue(makeEmployee({ onboardingState: 'MEDICAL_PENDING' }));
    prisma.onboardingTask.findFirst.mockResolvedValue(null); // no MEDICAL_COMPLETED task

    await expect(
      svc.advance(makeUser(), EMPLOYEE_ID, { stage: 'INSURANCE_PENDING', status: 'IN_PROGRESS' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFoundException for an unknown employee', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(
      svc.advance(makeUser(), EMPLOYEE_ID, { stage: 'VISIT_VISA_VALID', status: 'COMPLETED' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── 2. cancelVisa sets cancellationGraceEndsAt = now + 15 days ───────────────

describe('OnboardingService — visa cancellation grace period', () => {
  it('sets cancellationGraceEndsAt to exactly 15 days from now', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.findUnique.mockResolvedValue(makeEmployee());
    prisma.onboardingTask.create.mockResolvedValue(makeTask({ stage: 'VISIT_VISA_CANCELLED', status: 'CANCELLED' }));
    prisma.employee.update.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));

    const before = Date.now();
    const result = await svc.cancelVisa(makeUser(), EMPLOYEE_ID, { notes: 'Visa rejected' });
    const after  = Date.now();

    const graceTs = new Date(result.employee.cancellationGraceEndsAt).getTime();
    const expectedMin = before  + 15 * 24 * 3600 * 1000;
    const expectedMax = after   + 15 * 24 * 3600 * 1000;

    expect(graceTs).toBeGreaterThanOrEqual(expectedMin);
    expect(graceTs).toBeLessThanOrEqual(expectedMax);
    expect(result.employee.onboardingState).toBe('VISIT_VISA_CANCELLED');
    expect(result.employee.graceDaysRemaining).toBe(15);
  });

  it('throws ConflictException if visa cancellation is already recorded', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.findUnique.mockResolvedValue(
      makeEmployee({ onboardingState: 'VISIT_VISA_CANCELLED' }),
    );

    await expect(
      svc.cancelVisa(makeUser(), EMPLOYEE_ID, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws ConflictException if employee is already in terminal CANCELLED state', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.findUnique.mockResolvedValue(
      makeEmployee({ onboardingState: 'CANCELLED' }),
    );

    await expect(
      svc.cancelVisa(makeUser(), EMPLOYEE_ID, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

// ─── 3. Grace sweep: expired grace → CANCELLED; active grace → alarm ──────────

describe('OnboardingService — grace period sweep', () => {
  it('transitions employee to CANCELLED when grace period has expired', async () => {
    const { prisma, svc, notifications } = buildSvc();
    const graceEndsAt = new Date(Date.now() - 1000); // expired 1 second ago

    prisma.employee.findMany.mockResolvedValue([
      makeEmployee({ onboardingState: 'VISIT_VISA_CANCELLED', cancellationGraceEndsAt: graceEndsAt }),
    ]);
    prisma.employee.update.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});
    prisma.runUnscoped.mockImplementation(async (fn: any) => fn());

    const result = await svc.runGracePeriodSweep();

    expect(result.expired).toBe(1);
    expect(result.alarmed).toBe(0);
    const updateCall = prisma.employee.update.mock.calls[0][0];
    expect(updateCall.data.onboardingState).toBe('CANCELLED');
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('fires ONBOARDING_VISA_GRACE_ALARM when grace period is still active', async () => {
    const { prisma, svc, notifications } = buildSvc();
    const graceEndsAt = new Date(Date.now() + 5 * 24 * 3600 * 1000); // 5 days from now

    prisma.employee.findMany.mockResolvedValue([
      makeEmployee({ onboardingState: 'VISIT_VISA_CANCELLED', cancellationGraceEndsAt: graceEndsAt }),
    ]);
    prisma.runUnscoped.mockImplementation(async (fn: any) => fn());

    const result = await svc.runGracePeriodSweep();

    expect(result.expired).toBe(0);
    expect(result.alarmed).toBe(1);
    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ONBOARDING_VISA_GRACE_ALARM',
        entityId: EMPLOYEE_ID,
      }),
    );
  });
});

// ─── 4. Happy path: VISIT_VISA_VALID → ONBOARDED ─────────────────────────────

describe('OnboardingService — happy path sequence', () => {
  /**
   * Simulates the full happy-path sequence through the state machine.
   * Each advance call is stubbed so the gate-prerequisite task appears as
   * COMPLETED before the next step is attempted.
   */
  const SEQUENCE: Array<{ stage: string; gate?: string }> = [
    { stage: 'VISIT_VISA_VALID' },
    { stage: 'WORK_PERMIT_PENDING' },
    { stage: 'WORK_PERMIT_APPROVED' },
    { stage: 'MEDICAL_PENDING',      gate: 'WORK_PERMIT_APPROVED' },
    { stage: 'MEDICAL_COMPLETED',    gate: 'WORK_PERMIT_APPROVED' },
    { stage: 'INSURANCE_PENDING',    gate: 'MEDICAL_COMPLETED' },
    { stage: 'INSURANCE_COMPLETED',  gate: 'MEDICAL_COMPLETED' },
    { stage: 'RESIDENCY_PENDING',    gate: 'INSURANCE_COMPLETED' },
    { stage: 'RESIDENCY_COMPLETED',  gate: 'INSURANCE_COMPLETED' },
    { stage: 'EID_PENDING',          gate: 'RESIDENCY_COMPLETED' },
    { stage: 'EID_DELIVERED',        gate: 'RESIDENCY_COMPLETED' },
    { stage: 'ONBOARDED',            gate: 'EID_DELIVERED' },
  ];

  it('advances through all stages without throwing', async () => {
    const { prisma, svc } = buildSvc();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.employee.update.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    for (const step of SEQUENCE) {
      prisma.employee.findUnique.mockResolvedValue(
        makeEmployee({ onboardingState: step.stage === 'VISIT_VISA_VALID' ? null : SEQUENCE[SEQUENCE.indexOf(step) - 1].stage }),
      );

      // If this step has a gate, make the prerequisite task appear as COMPLETED
      if (step.gate) {
        prisma.onboardingTask.findFirst
          .mockResolvedValueOnce(makeTask({ stage: step.gate, status: 'COMPLETED' })) // gate check
          .mockResolvedValueOnce(null); // existing task for this stage
      } else {
        prisma.onboardingTask.findFirst.mockResolvedValue(null);
      }

      prisma.onboardingTask.create.mockResolvedValue(makeTask({ stage: step.stage, status: 'COMPLETED' }));

      const result = await svc.advance(makeUser(), EMPLOYEE_ID, {
        stage: step.stage as any,
        status: 'COMPLETED',
      });

      expect(result.task.stage).toBe(step.stage);
    }

    // Last stage must be ONBOARDED
    const last = SEQUENCE[SEQUENCE.length - 1];
    expect(last.stage).toBe('ONBOARDED');
  });
});
