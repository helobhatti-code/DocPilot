-- Promote the seeded platform admin to SUPER_ADMIN so the Master Control Panel is accessible.
-- SUPER_ADMIN can see all tenants and access /super-admin route.
UPDATE users
SET role = 'SUPER_ADMIN'
WHERE email = 'admin@gpms.com'
  AND role = 'ADMIN';
