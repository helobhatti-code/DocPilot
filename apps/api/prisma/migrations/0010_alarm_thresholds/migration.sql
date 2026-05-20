-- Migration 0010: Per-docKind alarm threshold configuration.
-- Allows ADMIN users to override the default 30/14/7-day expiry bands
-- on a per-document-kind basis within their tenant.

CREATE TABLE alarm_threshold_configs (
  id         TEXT        NOT NULL,
  tenant_id  CHAR(36)    NOT NULL,
  doc_kind   TEXT        NOT NULL,
  band1_days INTEGER     NOT NULL DEFAULT 30,
  band2_days INTEGER     NOT NULL DEFAULT 14,
  band3_days INTEGER     NOT NULL DEFAULT 7,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,

  CONSTRAINT alarm_threshold_configs_pkey PRIMARY KEY (id),
  CONSTRAINT alarm_threshold_configs_tenant_doc_key UNIQUE (tenant_id, doc_kind),
  CONSTRAINT alarm_threshold_configs_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  -- Enforce strictly-descending bands at the DB level (defence-in-depth; API layer also validates)
  CONSTRAINT alarm_threshold_configs_bands_order_chk
    CHECK (band1_days > band2_days AND band2_days > band3_days AND band3_days > 0)
);

CREATE INDEX alarm_threshold_configs_tenant_idx ON alarm_threshold_configs(tenant_id);

-- Tenant RLS (mirrors existing pattern — primary isolation via Prisma middleware)
ALTER TABLE alarm_threshold_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY alarm_threshold_configs_tenant_isolation ON alarm_threshold_configs
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );
