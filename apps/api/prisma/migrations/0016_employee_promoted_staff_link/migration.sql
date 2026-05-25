-- Migration 0016: Track when a new-hire Employee has been promoted to an active Staff record.
-- When the onboarding stage advances to EID_DELIVERED, a Staff row is auto-created
-- and its id is stored here so the promotion stays idempotent.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS promoted_staff_id CHAR(36);
