-- Migration 0012: Extend staff with personType + direct-employee document fields.
-- Backfills existing staff as SUBCONTRACTOR, then enforces NOT NULL.
-- Updates expiry_items_v so employee expiry rows come from staff (person_type='DIRECT_EMPLOYEE')
-- rather than the separate employees table.

-- ─── 1. PersonType enum ───────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PersonType" AS ENUM ('DIRECT_EMPLOYEE', 'SUBCONTRACTOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. Add columns (nullable first, then backfill, then enforce) ─────────────

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS person_type               "PersonType",
  ADD COLUMN IF NOT EXISTS emirates_id_no            TEXT,
  ADD COLUMN IF NOT EXISTS emirates_id_expiry_date   DATE,
  ADD COLUMN IF NOT EXISTS emirates_id_attachment_id TEXT,
  ADD COLUMN IF NOT EXISTS visa_no                   TEXT,
  ADD COLUMN IF NOT EXISTS visa_expiry_date          DATE,
  ADD COLUMN IF NOT EXISTS visa_attachment_id        TEXT,
  ADD COLUMN IF NOT EXISTS labor_card_no             TEXT,
  ADD COLUMN IF NOT EXISTS labor_card_expiry_date    DATE,
  ADD COLUMN IF NOT EXISTS labor_card_attachment_id  TEXT,
  ADD COLUMN IF NOT EXISTS passport_no               TEXT,
  ADD COLUMN IF NOT EXISTS passport_expiry_date      DATE,
  ADD COLUMN IF NOT EXISTS passport_attachment_id    TEXT;

-- Backfill: existing rows are subcontractors (the original purpose of this table)
UPDATE staff SET person_type = 'SUBCONTRACTOR'::"PersonType" WHERE person_type IS NULL;

-- Enforce NOT NULL + default
ALTER TABLE staff
  ALTER COLUMN person_type SET DEFAULT 'SUBCONTRACTOR'::"PersonType",
  ALTER COLUMN person_type SET NOT NULL;

-- Index for the new filter path
CREATE INDEX IF NOT EXISTS staff_tenant_person_type_idx ON staff(tenant_id, person_type);

-- ─── 3. Replace expiry_items_v: employee rows now source from staff ───────────
-- Same UNION shape as 0009; only the employee sub-queries change.

CREATE OR REPLACE VIEW expiry_items_v WITH (security_barrier = true) AS

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

  SELECT
    'vehicle'::TEXT, v.id::TEXT, v.tenant_id::TEXT, v.company_id::TEXT,
    'CAR_LICENSE'::TEXT,
    v.car_make || ' – ' || v.plate_number || ' – Car License',
    v.car_license_expiry_date,
    (v.car_license_expiry_date - CURRENT_DATE)::INTEGER
  FROM vehicles v
  WHERE v.is_active = TRUE

UNION ALL

  SELECT
    'vehicle'::TEXT, v.id::TEXT, v.tenant_id::TEXT, v.company_id::TEXT,
    'VEHICLE_INSURANCE'::TEXT,
    v.car_make || ' – ' || v.plate_number || ' – Insurance',
    v.insurance_expiry_date,
    (v.insurance_expiry_date - CURRENT_DATE)::INTEGER
  FROM vehicles v
  WHERE v.is_active = TRUE

UNION ALL

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

  -- Direct-employee staff: visa ───────────────────────────────────────────
  SELECT
    'employee'::TEXT, s.id::TEXT, s.tenant_id::TEXT, s.company_id::TEXT,
    'VISA'::TEXT,
    s.name || ' – Visa',
    s.visa_expiry_date,
    (s.visa_expiry_date - CURRENT_DATE)::INTEGER
  FROM staff s
  WHERE s.is_active = TRUE
    AND s.person_type = 'DIRECT_EMPLOYEE'::"PersonType"
    AND s.visa_expiry_date IS NOT NULL

UNION ALL

  -- Direct-employee staff: Emirates ID ────────────────────────────────────
  SELECT
    'employee'::TEXT, s.id::TEXT, s.tenant_id::TEXT, s.company_id::TEXT,
    'EMIRATES_ID'::TEXT,
    s.name || ' – Emirates ID',
    s.emirates_id_expiry_date,
    (s.emirates_id_expiry_date - CURRENT_DATE)::INTEGER
  FROM staff s
  WHERE s.is_active = TRUE
    AND s.person_type = 'DIRECT_EMPLOYEE'::"PersonType"
    AND s.emirates_id_expiry_date IS NOT NULL

UNION ALL

  -- Direct-employee staff: labor card ──────────────────────────────────────
  SELECT
    'employee'::TEXT, s.id::TEXT, s.tenant_id::TEXT, s.company_id::TEXT,
    'LABOR_CARD'::TEXT,
    s.name || ' – Labor Card',
    s.labor_card_expiry_date,
    (s.labor_card_expiry_date - CURRENT_DATE)::INTEGER
  FROM staff s
  WHERE s.is_active = TRUE
    AND s.person_type = 'DIRECT_EMPLOYEE'::"PersonType"
    AND s.labor_card_expiry_date IS NOT NULL

UNION ALL

  -- Direct-employee staff: passport ────────────────────────────────────────
  SELECT
    'employee'::TEXT, s.id::TEXT, s.tenant_id::TEXT, s.company_id::TEXT,
    'PASSPORT'::TEXT,
    s.name || ' – Passport',
    s.passport_expiry_date,
    (s.passport_expiry_date - CURRENT_DATE)::INTEGER
  FROM staff s
  WHERE s.is_active = TRUE
    AND s.person_type = 'DIRECT_EMPLOYEE'::"PersonType"
    AND s.passport_expiry_date IS NOT NULL

UNION ALL

  SELECT
    'company_document'::TEXT, cd.id::TEXT, cd.tenant_id::TEXT, cd.company_id::TEXT,
    cd.doc_type::TEXT,
    cd.doc_name,
    cd.expiry_date,
    (cd.expiry_date - CURRENT_DATE)::INTEGER
  FROM company_documents cd
  WHERE cd.is_active = TRUE

UNION ALL

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
