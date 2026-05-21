import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export const ONBOARDING_STAGES = [
  'VISIT_VISA_PENDING',
  'VISIT_VISA_VALID',
  'VISIT_VISA_EXPIRED',
  'VISIT_VISA_CANCELLED',
  'WORK_PERMIT_PENDING',
  'WORK_PERMIT_APPROVED',
  'WORK_PERMIT_REJECTED',
  'MEDICAL_PENDING',
  'MEDICAL_COMPLETED',
  'INSURANCE_PENDING',
  'INSURANCE_COMPLETED',
  'RESIDENCY_PENDING',
  'RESIDENCY_COMPLETED',
  'EID_PENDING',
  'EID_DELIVERED',
  'ONBOARDED',
  'CANCELLED',
] as const;

export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

export const ONBOARDING_TASK_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;

export type OnboardingTaskStatus = (typeof ONBOARDING_TASK_STATUSES)[number];

export class AdvanceOnboardingDto {
  @ApiProperty({ enum: ONBOARDING_STAGES })
  @IsIn([...ONBOARDING_STAGES])
  stage!: OnboardingStage;

  @ApiProperty({ enum: ONBOARDING_TASK_STATUSES })
  @IsIn([...ONBOARDING_TASK_STATUSES])
  status!: OnboardingTaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachmentId?: string;
}

export class CancelVisaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class InitiateOnboardingDto {
  @ApiPropertyOptional({ description: 'Mark this existing employee as a new employee entering the onboarding workflow' })
  @IsOptional()
  @IsBoolean()
  isNewEmployee?: boolean;
}
