-- Row-Level Security policies for tenant-scoped tables.
-- Defense-in-depth: even if Prisma middleware is bypassed, RLS enforces tenant isolation.
--
-- Each request sets the session GUC: SET LOCAL app.tenant_id = '<uuid>';
-- The API also sets app.bypass_rls = 'on' for super-admin / system jobs.

-- Helper: enable RLS on a table and add a "tenant matches GUC" policy.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'users',
    'subcontractor_orgs',
    'staff',
    'gate_passes',
    'custody_history',
    'documents',
    'notifications',
    'notification_templates',
    'role_permissions',
    'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format($f$
      CREATE POLICY %I_tenant_isolation ON %I
        USING (
          current_setting('app.bypass_rls', true) = 'on'
          OR tenant_id::text = current_setting('app.tenant_id', true)
        )
        WITH CHECK (
          current_setting('app.bypass_rls', true) = 'on'
          OR tenant_id::text = current_setting('app.tenant_id', true)
        )
    $f$, t, t);
  END LOOP;
END $$;
