-- Migration 0015: Support new-hire creation where Emirates ID and visa are not yet issued.
-- - Relax emirates_id_no and visa_expiry_date to nullable (filled in later as onboarding progresses).
-- - Add nationality column for capturing nationality at hire time.

ALTER TABLE employees ALTER COLUMN emirates_id_no   DROP NOT NULL;
ALTER TABLE employees ALTER COLUMN visa_expiry_date DROP NOT NULL;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationality TEXT;
