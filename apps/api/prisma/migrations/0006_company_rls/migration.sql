-- Introduce Company hierarchy: Group → Company → Data
--
-- Each Tenant (Group) contains one or more Companies (subsidiaries/branches).
-- GatePass, Staff, and SubcontractorOrg gain a nullable company_id for per-company scoping.
-- RLS policies for company isolation are added as defence-in-depth (primary isolation
-- is handled by Prisma middleware, same pattern as tenant RLS in migration 0002).

-- ─── New tables ────────────────────────────────────────────────────────────────

CREATE TABLE companies (
  id               TEXT         NOT NULL,
  tenant_id        CHAR(36)     NOT NULL,
  name             TEXT         NOT NULL,
  code             TEXT         NOT NULL,
  trade_license_no TEXT,
  address          TEXT,
  phone            TEXT,
  email            TEXT,
  logo_url         TEXT,
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT companies_pkey PRIMARY KEY (id),
  CONSTRAINT companies_tenant_id_code_key UNIQUE (tenant_id, code),
  CONSTRAINT companies_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX companies_tenant_id_idx ON companies(tenant_id);

CREATE TABLE user_company_access (
  id           TEXT         NOT NULL,
  user_id      CHAR(36)     NOT NULL,
  company_id   TEXT         NOT NULL,
  access_level TEXT         NOT NULL DEFAULT 'MEMBER',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT user_company_access_pkey PRIMARY KEY (id),
  CONSTRAINT user_company_access_user_id_company_id_key UNIQUE (user_id, company_id),
  CONSTRAINT user_company_access_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_company_access_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX user_company_access_user_id_idx ON user_company_access(user_id);
CREATE INDEX user_company_access_company_id_idx ON user_company_access(company_id);

-- ─── Column additions ──────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN can_access_all_companies BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE gate_passes
  ADD COLUMN company_id TEXT,
  ADD CONSTRAINT gate_passes_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE staff
  ADD COLUMN company_id TEXT,
  ADD CONSTRAINT staff_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE subcontractor_orgs
  ADD COLUMN company_id TEXT,
  ADD CONSTRAINT subcontractor_orgs_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id);

-- ─── RLS: tenant isolation for companies table ─────────────────────────────────
-- (mirrors the pattern in migration 0002 for the other tenant-scoped tables)

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_tenant_isolation ON companies
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

-- ─── RLS: company-level isolation on company-scoped tables ─────────────────────
-- A row is visible when:
--   • bypass_company is set to a truthy value  (super-admin / system ops), OR
--   • company_id is NULL                        (pre-migration / unassigned rows), OR
--   • company_id matches the request GUC        (normal company-scoped request), OR
--   • company_id GUC is empty string            (tenant-wide request, no company filter)
--
-- Primary isolation is enforced by Prisma middleware; these policies are
-- defence-in-depth for direct non-owner DB connections.

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['gate_passes', 'staff', 'subcontractor_orgs'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format($f$
      CREATE POLICY %I_company_isolation ON %I
        USING (
          current_setting('app.bypass_company', true)::boolean IS TRUE
          OR company_id IS NULL
          OR company_id::text = current_setting('app.company_id', true)
          OR current_setting('app.company_id', true) = ''
        )
        WITH CHECK (
          current_setting('app.bypass_company', true)::boolean IS TRUE
          OR company_id IS NULL
          OR company_id::text = current_setting('app.company_id', true)
          OR current_setting('app.company_id', true) = ''
        )
    $f$, t, t);
  END LOOP;
END $$;
