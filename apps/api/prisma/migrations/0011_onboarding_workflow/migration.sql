-- Migration 0011: New Employees onboarding workflow (Phase 2).
-- Adds sequential state-machine tracking for new employees through visa,
-- work permit, medical, insurance, residency, and EID stages.
--
-- All statements are idempotent so the migration can be re-applied safely
-- if a previous run failed partway through (heal-prisma-migrations.cjs at
-- boot rolls back failed rows so migrate deploy will retry them).

-- 1. Add new notification type to the enum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ONBOARDING_VISA_GRACE_ALARM';

-- 2. Add onboarding fields to the employees table
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_new_employee          BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_state         TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_grace_ends_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS employees_tenant_is_new_employee_idx
  ON employees(tenant_id, is_new_employee);

-- 3. Create the onboarding_tasks table
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id            TEXT        NOT NULL,
  tenant_id     CHAR(36)    NOT NULL,
  company_id    TEXT        NOT NULL,
  employee_id   TEXT        NOT NULL,
  stage         TEXT        NOT NULL,
  status        TEXT        NOT NULL,
  completed_at  TIMESTAMPTZ,
  completed_by  TEXT,
  attachment_id TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT onboarding_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT onboarding_tasks_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT onboarding_tasks_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS onboarding_tasks_tenant_id_idx
  ON onboarding_tasks(tenant_id);

CREATE INDEX IF NOT EXISTS onboarding_tasks_employee_id_idx
  ON onboarding_tasks(employee_id);

CREATE INDEX IF NOT EXISTS onboarding_tasks_employee_stage_idx
  ON onboarding_tasks(employee_id, stage);

-- 4. Enable RLS on onboarding_tasks (idempotent)
ALTER TABLE onboarding_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY onboarding_tasks_tenant_isolation ON onboarding_tasks
    USING (
      current_setting('app.bypass_rls', TRUE) = 'on'
      OR tenant_id = current_setting('app.tenant_id', TRUE)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
