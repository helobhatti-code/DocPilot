-- Add Vehicles and Heavy Machinery modules.
-- Both tables are scoped by tenant_id AND company_id, with matching RLS policies
-- that mirror the patterns from migration 0002 (tenant) and 0006 (company).

-- ─── Enum types ───────────────────────────────────────────────────────────────

CREATE TYPE vehicle_type AS ENUM ('PRIVATE', 'COMPANY');
CREATE TYPE insurance_type AS ENUM ('COMPREHENSIVE', 'THIRD_PARTY');
CREATE TYPE machinery_status AS ENUM ('ACTIVE', 'IDLE', 'MAINTENANCE', 'OUT_OF_SERVICE');

-- ─── vehicles table ───────────────────────────────────────────────────────────

CREATE TABLE vehicles (
  id                              TEXT         NOT NULL,
  tenant_id                       CHAR(36)     NOT NULL,
  company_id                      TEXT,
  vehicle_type                    vehicle_type NOT NULL,
  owner_name                      TEXT         NOT NULL,
  driver_name                     TEXT,
  car_make                        TEXT         NOT NULL,
  car_model                       TEXT,
  plate_emirate                   TEXT         NOT NULL,
  plate_category                  TEXT,
  plate_number                    TEXT         NOT NULL,
  car_license_no                  TEXT         NOT NULL,
  car_license_expiry_date         DATE         NOT NULL,
  car_license_attachment_id       TEXT,
  insurance_type                  insurance_type NOT NULL,
  insurance_policy_no             TEXT,
  insurance_expiry_date           DATE         NOT NULL,
  insurance_attachment_id         TEXT,
  has_residential_mawaqif         BOOLEAN      NOT NULL DEFAULT false,
  residential_mawaqif_expiry_date DATE,
  has_normal_mawaqif              BOOLEAN      NOT NULL DEFAULT false,
  normal_mawaqif_expiry_date      DATE,
  form_attachment_id              TEXT,
  is_active                       BOOLEAN      NOT NULL DEFAULT true,
  remarks                         TEXT,
  created_at                      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by                      TEXT,

  CONSTRAINT vehicles_pkey PRIMARY KEY (id),
  CONSTRAINT vehicles_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT vehicles_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE INDEX vehicles_tenant_id_idx ON vehicles(tenant_id);
CREATE INDEX vehicles_company_id_idx ON vehicles(company_id);
CREATE INDEX vehicles_tenant_plate_idx ON vehicles(tenant_id, plate_number);

-- ─── heavy_machinery table ────────────────────────────────────────────────────

CREATE TABLE heavy_machinery (
  id                              TEXT             NOT NULL,
  tenant_id                       CHAR(36)         NOT NULL,
  company_id                      TEXT,
  machine_type                    TEXT             NOT NULL,
  make                            TEXT             NOT NULL,
  model                           TEXT,
  manufacture_year                INT,
  serial_number                   TEXT             NOT NULL,
  plate_number                    TEXT,
  assigned_operator               TEXT,
  current_location                TEXT,
  project_site                    TEXT,
  status                          machinery_status NOT NULL DEFAULT 'ACTIVE',
  operator_license_no             TEXT,
  operator_license_expiry_date    DATE,
  operator_license_attachment_id  TEXT,
  inspection_certificate_no       TEXT,
  inspection_expiry_date          DATE,
  inspection_attachment_id        TEXT,
  rta_registration_no             TEXT,
  rta_registration_expiry_date    DATE,
  rta_registration_attachment_id  TEXT,
  lifting_test_certificate_no     TEXT,
  lifting_test_expiry_date        DATE,
  lifting_test_attachment_id      TEXT,
  insurance_type                  insurance_type,
  insurance_expiry_date           DATE,
  insurance_attachment_id         TEXT,
  civil_defense_expiry_date       DATE,
  civil_defense_attachment_id     TEXT,
  photo_attachment_id             TEXT,
  is_active                       BOOLEAN          NOT NULL DEFAULT true,
  remarks                         TEXT,
  created_at                      TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ      NOT NULL DEFAULT now(),
  created_by                      TEXT,

  CONSTRAINT heavy_machinery_pkey PRIMARY KEY (id),
  CONSTRAINT heavy_machinery_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT heavy_machinery_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE INDEX heavy_machinery_tenant_id_idx ON heavy_machinery(tenant_id);
CREATE INDEX heavy_machinery_company_id_idx ON heavy_machinery(company_id);

-- ─── Tenant RLS ───────────────────────────────────────────────────────────────
-- Mirrors migration 0002 pattern — defence-in-depth for non-owner DB connections.

ALTER TABLE vehicles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE heavy_machinery ENABLE ROW LEVEL SECURITY;

CREATE POLICY vehicles_tenant_isolation ON vehicles
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

CREATE POLICY heavy_machinery_tenant_isolation ON heavy_machinery
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

-- ─── Company RLS ─────────────────────────────────────────────────────────────
-- Mirrors migration 0006 pattern.

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['vehicles', 'heavy_machinery'];
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
