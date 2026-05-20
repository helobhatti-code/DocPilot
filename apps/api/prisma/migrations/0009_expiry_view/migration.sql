-- Migration 0009: Company Documents table, ExpiryNotificationLog, DOCUMENT_EXPIRY_ALERT enum,
--                 expiry_items_v VIEW, get_expiry_band helper function, and all RLS policies.

-- ─── 1. Enums for company_documents ──────────────────────────────────────────

CREATE TYPE company_doc_type AS ENUM (
  'TRADE_LICENSE', 'ESTABLISHMENT_CARD', 'CLASSIFICATION',
  'CIVIL_DEFENSE', 'POWER_OF_ATTORNEY', 'OFFICE_TENANCY'
);

CREATE TYPE doc_status AS ENUM (
  'VALID', 'EXPIRING_SOON', 'EXPIRED', 'UNDER_RENEWAL'
);

-- ─── 2. company_documents table ───────────────────────────────────────────────

CREATE TABLE company_documents (
  id              TEXT              NOT NULL,
  tenant_id       CHAR(36)          NOT NULL,
  company_id      TEXT              NOT NULL,
  doc_type        company_doc_type  NOT NULL,
  doc_name        TEXT              NOT NULL,
  doc_number      TEXT,
  issue_date      DATE,
  expiry_date     DATE              NOT NULL,
  status          doc_status        NOT NULL DEFAULT 'VALID',
  attachment_id   TEXT,
  metadata        JSONB,
  is_active       BOOLEAN           NOT NULL DEFAULT TRUE,
  remarks         TEXT,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),
  created_by      TEXT,
  previous_doc_id TEXT,

  CONSTRAINT company_documents_pkey PRIMARY KEY (id),
  CONSTRAINT company_documents_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT company_documents_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT company_documents_previous_doc_id_fkey
    FOREIGN KEY (previous_doc_id) REFERENCES company_documents(id)
);

CREATE INDEX company_documents_tenant_id_idx       ON company_documents(tenant_id);
CREATE INDEX company_documents_company_id_idx      ON company_documents(company_id);
CREATE INDEX company_documents_tenant_doc_type_idx ON company_documents(tenant_id, doc_type);
CREATE INDEX company_documents_tenant_status_idx   ON company_documents(tenant_id, status);
CREATE INDEX company_documents_tenant_expiry_idx   ON company_documents(tenant_id, expiry_date);

-- Tenant RLS
ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_documents_tenant_isolation ON company_documents
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

-- Company RLS
CREATE POLICY company_documents_company_isolation ON company_documents
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

-- ─── 3. Add DOCUMENT_EXPIRY_ALERT to notification_type enum ──────────────────

ALTER TYPE notification_type ADD VALUE 'DOCUMENT_EXPIRY_ALERT';

-- ─── 4. expiry_notification_logs table ────────────────────────────────────────

CREATE TABLE expiry_notification_logs (
  id           TEXT        NOT NULL,
  tenant_id    CHAR(36)    NOT NULL,
  source       TEXT        NOT NULL,
  source_id    TEXT        NOT NULL,
  doc_kind     TEXT        NOT NULL,
  band         TEXT        NOT NULL,
  notified_on  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT expiry_notification_logs_pkey PRIMARY KEY (id),
  CONSTRAINT expiry_notification_logs_tenant_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- One notification per (tenant, item, band) per calendar day — prevents duplicate
-- alerts if the sweep runs more than once on the same day (e.g. after a restart).
CREATE UNIQUE INDEX expiry_notification_logs_dedup_idx
  ON expiry_notification_logs (tenant_id, source, source_id, doc_kind, band, (notified_on::date));

-- ─── 5. get_expiry_band helper ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_expiry_band(days INTEGER)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE
    WHEN days < 0   THEN 'expired'
    WHEN days <= 7  THEN '7d'
    WHEN days <= 14 THEN '14d'
    WHEN days <= 30 THEN '30d'
    ELSE                 'valid'
  END;
$$;

-- ─── 6. expiry_items_v VIEW ───────────────────────────────────────────────────
-- security_barrier prevents optimizer from pushing outer WHERE clauses inside
-- the view, which could bypass the base-table RLS checks.

CREATE VIEW expiry_items_v WITH (security_barrier = true) AS

  -- Gate passes ─────────────────────────────────────────────────────────────
  SELECT
    'gate_pass'::TEXT                                                            AS source,
    gp.id::TEXT                                                                  AS source_id,
    gp.tenant_id::TEXT                                                           AS tenant_id,
    gp.company_id::TEXT                                                          AS company_id,
    'GATE_PASS'::TEXT                                                            AS doc_kind,
    COALESCE(s.company_name || ' – ', '') || s.name || ' – Pass #' || gp.pass_number
                                                                                AS display_name,
    gp.expiry_date                                                               AS expiry_date,
    (gp.expiry_date - CURRENT_DATE)::INTEGER                                     AS days_until_expiry
  FROM gate_passes gp
  JOIN staff s ON s.id = gp.staff_id
  WHERE gp.status::TEXT NOT IN ('CANCELLED', 'RENEWED', 'SUSPENDED')

UNION ALL

  -- Vehicles: car licence ────────────────────────────────────────────────────
  SELECT
    'vehicle'::TEXT, v.id::TEXT, v.tenant_id::TEXT, v.company_id::TEXT,
    'CAR_LICENSE'::TEXT,
    v.car_make || ' – ' || v.plate_number || ' – Car License',
    v.car_license_expiry_date,
    (v.car_license_expiry_date - CURRENT_DATE)::INTEGER
  FROM vehicles v
  WHERE v.is_active = TRUE

UNION ALL

  -- Vehicles: insurance ─────────────────────────────────────────────────────
  SELECT
    'vehicle'::TEXT, v.id::TEXT, v.tenant_id::TEXT, v.company_id::TEXT,
    'VEHICLE_INSURANCE'::TEXT,
    v.car_make || ' – ' || v.plate_number || ' – Insurance',
    v.insurance_expiry_date,
    (v.insurance_expiry_date - CURRENT_DATE)::INTEGER
  FROM vehicles v
  WHERE v.is_active = TRUE

UNION ALL

  -- Vehicles: residential mawaqif (only if enabled) ─────────────────────────
  SELECT
    'vehicle'::TEXT, v.id::TEXT, v.tenant_id::TEXT, v.company_id::TEXT,
    'RESIDENTIAL_MAWAQIF'::TEXT,
    v.car_make || ' – ' || v.plate_number || ' – Residential Mawaqif',
    v.residential_mawaqif_expiry_date,
    (v.residential_mawaqif_expiry_date - CURRENT_DATE)::INTEGER
  FROM vehicles v
  WHERE v.is_active = TRUE
    AND v.has_residential_mawaqif = TRUE
    AND v.residential_mawaqif_expiry_date IS NOT NULL

UNION ALL

  -- Vehicles: normal mawaqif (only if enabled) ──────────────────────────────
  SELECT
    'vehicle'::TEXT, v.id::TEXT, v.tenant_id::TEXT, v.company_id::TEXT,
    'NORMAL_MAWAQIF'::TEXT,
    v.car_make || ' – ' || v.plate_number || ' – Normal Mawaqif',
    v.normal_mawaqif_expiry_date,
    (v.normal_mawaqif_expiry_date - CURRENT_DATE)::INTEGER
  FROM vehicles v
  WHERE v.is_active = TRUE
    AND v.has_normal_mawaqif = TRUE
    AND v.normal_mawaqif_expiry_date IS NOT NULL

UNION ALL

  -- Heavy machinery: operator licence ──────────────────────────────────────
  SELECT
    'machinery'::TEXT, hm.id::TEXT, hm.tenant_id::TEXT, hm.company_id::TEXT,
    'OPERATOR_LICENSE'::TEXT,
    hm.make || ' ' || hm.machine_type || ' #' || hm.serial_number || ' – Operator License',
    hm.operator_license_expiry_date,
    (hm.operator_license_expiry_date - CURRENT_DATE)::INTEGER
  FROM heavy_machinery hm
  WHERE hm.is_active = TRUE
    AND hm.operator_license_expiry_date IS NOT NULL

UNION ALL

  -- Heavy machinery: inspection cert ────────────────────────────────────────
  SELECT
    'machinery'::TEXT, hm.id::TEXT, hm.tenant_id::TEXT, hm.company_id::TEXT,
    'INSPECTION_CERT'::TEXT,
    hm.make || ' ' || hm.machine_type || ' #' || hm.serial_number || ' – Inspection Cert',
    hm.inspection_expiry_date,
    (hm.inspection_expiry_date - CURRENT_DATE)::INTEGER
  FROM heavy_machinery hm
  WHERE hm.is_active = TRUE
    AND hm.inspection_expiry_date IS NOT NULL

UNION ALL

  -- Heavy machinery: RTA registration ──────────────────────────────────────
  SELECT
    'machinery'::TEXT, hm.id::TEXT, hm.tenant_id::TEXT, hm.company_id::TEXT,
    'RTA_REGISTRATION'::TEXT,
    hm.make || ' ' || hm.machine_type || ' #' || hm.serial_number || ' – RTA Registration',
    hm.rta_registration_expiry_date,
    (hm.rta_registration_expiry_date - CURRENT_DATE)::INTEGER
  FROM heavy_machinery hm
  WHERE hm.is_active = TRUE
    AND hm.rta_registration_expiry_date IS NOT NULL

UNION ALL

  -- Heavy machinery: lifting test ───────────────────────────────────────────
  SELECT
    'machinery'::TEXT, hm.id::TEXT, hm.tenant_id::TEXT, hm.company_id::TEXT,
    'LIFTING_TEST'::TEXT,
    hm.make || ' ' || hm.machine_type || ' #' || hm.serial_number || ' – Lifting Test',
    hm.lifting_test_expiry_date,
    (hm.lifting_test_expiry_date - CURRENT_DATE)::INTEGER
  FROM heavy_machinery hm
  WHERE hm.is_active = TRUE
    AND hm.lifting_test_expiry_date IS NOT NULL

UNION ALL

  -- Heavy machinery: insurance ──────────────────────────────────────────────
  SELECT
    'machinery'::TEXT, hm.id::TEXT, hm.tenant_id::TEXT, hm.company_id::TEXT,
    'MACHINERY_INSURANCE'::TEXT,
    hm.make || ' ' || hm.machine_type || ' #' || hm.serial_number || ' – Insurance',
    hm.insurance_expiry_date,
    (hm.insurance_expiry_date - CURRENT_DATE)::INTEGER
  FROM heavy_machinery hm
  WHERE hm.is_active = TRUE
    AND hm.insurance_expiry_date IS NOT NULL

UNION ALL

  -- Heavy machinery: civil defence ──────────────────────────────────────────
  SELECT
    'machinery'::TEXT, hm.id::TEXT, hm.tenant_id::TEXT, hm.company_id::TEXT,
    'CIVIL_DEFENSE'::TEXT,
    hm.make || ' ' || hm.machine_type || ' #' || hm.serial_number || ' – Civil Defense',
    hm.civil_defense_expiry_date,
    (hm.civil_defense_expiry_date - CURRENT_DATE)::INTEGER
  FROM heavy_machinery hm
  WHERE hm.is_active = TRUE
    AND hm.civil_defense_expiry_date IS NOT NULL

UNION ALL

  -- Employees: visa (always set) ────────────────────────────────────────────
  SELECT
    'employee'::TEXT, e.id::TEXT, e.tenant_id::TEXT, e.company_id::TEXT,
    'VISA'::TEXT,
    e.name || ' – Visa',
    e.visa_expiry_date,
    (e.visa_expiry_date - CURRENT_DATE)::INTEGER
  FROM employees e
  WHERE e.is_active = TRUE

UNION ALL

  -- Employees: Emirates ID (optional) ──────────────────────────────────────
  SELECT
    'employee'::TEXT, e.id::TEXT, e.tenant_id::TEXT, e.company_id::TEXT,
    'EMIRATES_ID'::TEXT,
    e.name || ' – Emirates ID',
    e.emirates_id_expiry_date,
    (e.emirates_id_expiry_date - CURRENT_DATE)::INTEGER
  FROM employees e
  WHERE e.is_active = TRUE
    AND e.emirates_id_expiry_date IS NOT NULL

UNION ALL

  -- Employees: labor card (optional) ────────────────────────────────────────
  SELECT
    'employee'::TEXT, e.id::TEXT, e.tenant_id::TEXT, e.company_id::TEXT,
    'LABOR_CARD'::TEXT,
    e.name || ' – Labor Card',
    e.labor_card_expiry_date,
    (e.labor_card_expiry_date - CURRENT_DATE)::INTEGER
  FROM employees e
  WHERE e.is_active = TRUE
    AND e.labor_card_expiry_date IS NOT NULL

UNION ALL

  -- Employees: passport (optional) ──────────────────────────────────────────
  SELECT
    'employee'::TEXT, e.id::TEXT, e.tenant_id::TEXT, e.company_id::TEXT,
    'PASSPORT'::TEXT,
    e.name || ' – Passport',
    e.passport_expiry_date,
    (e.passport_expiry_date - CURRENT_DATE)::INTEGER
  FROM employees e
  WHERE e.is_active = TRUE
    AND e.passport_expiry_date IS NOT NULL

UNION ALL

  -- Company documents: main expiry ──────────────────────────────────────────
  SELECT
    'company_document'::TEXT, cd.id::TEXT, cd.tenant_id::TEXT, cd.company_id::TEXT,
    cd.doc_type::TEXT,
    cd.doc_name,
    cd.expiry_date,
    (cd.expiry_date - CURRENT_DATE)::INTEGER
  FROM company_documents cd
  WHERE cd.is_active = TRUE

UNION ALL

  -- Company documents: CIVIL_DEFENSE Hassantuk sub-expiry ───────────────────
  SELECT
    'company_document'::TEXT, cd.id::TEXT, cd.tenant_id::TEXT, cd.company_id::TEXT,
    'HASSANTUK'::TEXT,
    cd.doc_name || ' – Hassantuk',
    (cd.metadata->>'hassantukExpiryDate')::DATE,
    ((cd.metadata->>'hassantukExpiryDate')::DATE - CURRENT_DATE)::INTEGER
  FROM company_documents cd
  WHERE cd.is_active = TRUE
    AND cd.doc_type::TEXT = 'CIVIL_DEFENSE'
    AND cd.metadata IS NOT NULL
    AND cd.metadata->>'hassantukExpiryDate' IS NOT NULL
    AND (cd.metadata->>'hassantukExpiryDate') <> ''
;
