-- Rename seeded admin from "GPMS Administrator" to "CrewPass Administrator"
UPDATE users
SET name = 'CrewPass Administrator'
WHERE name = 'GPMS Administrator'
  AND email = 'admin@gpms.com';
