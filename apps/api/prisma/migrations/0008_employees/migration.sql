-- Add Employees module (direct company staff with Emirates ID / Visa / Labor Card tracking).
-- Distinct from Staff (subcontractor workers used for gate passes — see staff table).
-- Both tenant RLS and company RLS policies mirror migrations 0002 and 0006.

-- ─── Enum type ────────────────────────────────────────────────────────────────

CREATE TYPE employee_status AS ENUM ('ACTIVE', 'ON_LEAVE', 'TERMINATED');

-- ─── employees table ──────────────────────────────────────────────────────────

CREATE TABLE employees (
  id                        TEXT            NOT NULL,
  tenant_id                 CHAR(36)        NOT NULL,
  company_id                TEXT            NOT NULL,
  name                      TEXT            NOT NULL,
  designation               TEXT            NOT NULL,
  emirates_id_no            TEXT            NOT NULL,
  emirates_id_expiry_date   DATE,
  emirates_id_attachment_id TEXT,
  visa_no                   TEXT,
  visa_expiry_date          DATE            NOT NULL,
  visa_attachment_id        TEXT,
  labor_card_no             TEXT,
  labor_card_expiry_date    DATE,
  labor_card_attachment_id  TEXT,
  passport_no               TEXT,
  passport_expiry_date      DATE,
  passport_attachment_id    TEXT,
  phone                     TEXT,
  email                     TEXT,
  join_date                 DATE,
  status                    employee_status NOT NULL DEFAULT 'ACTIVE',
  is_active                 BOOLEAN         NOT NULL DEFAULT true,
  remarks                   TEXT,
  created_at                TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ     NOT NULL DEFAULT now(),
  created_by                TEXT,

  CONSTRAINT employees_pkey PRIMARY KEY (id),
  CONSTRAINT employees_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT employees_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE INDEX employees_tenant_id_idx    ON employees(tenant_id);
CREATE INDEX employees_company_id_idx   ON employees(company_id);
CREATE INDEX employees_tenant_eid_idx   ON employees(tenant_id, emirates_id_no);

-- ─── Tenant RLS ───────────────────────────────────────────────────────────────

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY employees_tenant_isolation ON employees
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

-- ─── Company RLS ─────────────────────────────────────────────────────────────

CREATE POLICY employees_company_isolation ON employees
  USING (
    current_setting('app.bypass_company', true)::boolean IS TRUE
    OR company_id::text = current_setting('app.company_id', true)
    OR current_setting('app.company_id', true) = ''
  )
  WITH CHECK (
    current_setting('app.bypass_company', true)::boolean IS TRUE
    OR company_id::text = current_setting('app.company_id', true)
    OR current_setting('app.company_id', true) = ''
  );
