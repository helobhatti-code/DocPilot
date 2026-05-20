-- Remove FORCE ROW LEVEL SECURITY from all tenant-scoped tables.
--
-- Background: FORCE RLS applies RLS even to the table owner (the application
-- DB role). The app sets app.bypass_rls for system ops (runUnscoped) and is
-- supposed to set app.tenant_id per-request — but Prisma's connection pool
-- makes session-GUC injection unreliable without wrapping every query in an
-- explicit transaction.
--
-- Practical fix: revert to standard RLS (without FORCE). The table owner
-- (application DB role) bypasses RLS by default, so all app queries work.
-- Tenant isolation is enforced at the application layer by Prisma middleware.
-- The RLS policies remain as defence-in-depth for any direct DB access that
-- does NOT use the owner role.

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
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
