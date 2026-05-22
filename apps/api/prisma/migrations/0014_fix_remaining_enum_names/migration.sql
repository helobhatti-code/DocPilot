-- Migration 0014: Rename remaining lowercase enum types to PascalCase names that Prisma expects.
-- Prisma generates casts like '..'::"MachineryStatus" but migrations 0007/0008 created
-- them as machinery_status, vehicle_type, insurance_type, employee_status.

ALTER TYPE machinery_status RENAME TO "MachineryStatus";
ALTER TYPE vehicle_type     RENAME TO "VehicleType";
ALTER TYPE insurance_type   RENAME TO "InsuranceType";
ALTER TYPE employee_status  RENAME TO "EmployeeStatus";
