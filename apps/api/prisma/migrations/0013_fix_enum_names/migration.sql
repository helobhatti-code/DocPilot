-- Migration 0013: Rename lowercase enum types to PascalCase names that Prisma expects.
-- Prisma generates queries like '..'::"CompanyDocType" and '..'::"DocStatus"
-- but 0009 created them as company_doc_type and doc_status.

ALTER TYPE company_doc_type RENAME TO "CompanyDocType";
ALTER TYPE doc_status       RENAME TO "DocStatus";
