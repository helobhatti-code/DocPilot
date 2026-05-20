-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'PM', 'HR', 'SECRETARY', 'VIEWER', 'SUBCONTRACTOR');

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('DARK', 'LIGHT');

-- CreateEnum
CREATE TYPE "AirportCode" AS ENUM ('AUH', 'AAN', 'SIR', 'AZI', 'ZDY', 'ALL');

-- CreateEnum
CREATE TYPE "ZoneCode" AS ENUM ('AP', 'AR', 'CO', 'TT', 'AT', 'BS', 'TW', 'PX', 'CT', 'GW', 'EYE', 'ALL_ZONES', 'BHS', 'CBP', 'BHS_CBP', 'PA', 'FF', 'TL');

-- CreateEnum
CREATE TYPE "GatePassStatus" AS ENUM ('VALID', 'EXPIRY_30', 'EXPIRY_15', 'EXPIRY_7', 'EXPIRED', 'RENEWAL_SUBMITTED', 'RENEWAL_APPROVED', 'RENEWED', 'CANCELLATION_REQUESTED', 'CANCELLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CustodyStatus" AS ENUM ('WITH_COMPANY', 'WITH_PERSON', 'RETURNED_TO_COMPANY', 'SURRENDERED_TO_AUTHORITY');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PASS_SCAN_FRONT', 'PASS_SCAN_BACK', 'RECEIPT', 'STAFF_PHOTO', 'HANDOVER_UNSIGNED', 'HANDOVER_SIGNED', 'CANCELLATION_CONFIRMATION', 'SUPPORTING');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('EXPIRY_30', 'EXPIRY_15', 'EXPIRY_7', 'EXPIRY_0', 'OVERDUE_CANCELLATION', 'OVERDUE_HANDOVER', 'STAFF_OFFBOARDING', 'CUSTODY_CHANGE', 'RENEWAL_APPROVED', 'RENEWAL_REJECTED', 'CANCELLATION_CONFIRMED', 'PERMISSION_CHANGE', 'DATA_DELETION_WARNING', 'INVITATION');

-- CreateTable
CREATE TABLE "tenants" (
    "id" CHAR(36) NOT NULL,
    "name" TEXT NOT NULL,
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{"retention_period_days": 30, "pass_validity_months": 6}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" CHAR(36) NOT NULL,
    "tenant_id" CHAR(36) NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL,
    "subcontractor_org_id" CHAR(36),
    "theme_preference" "ThemePreference" NOT NULL DEFAULT 'DARK',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "invitation_token" TEXT,
    "invitation_expires_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_orgs" (
    "id" CHAR(36) NOT NULL,
    "tenant_id" CHAR(36) NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcontractor_orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" CHAR(36) NOT NULL,
    "tenant_id" CHAR(36) NOT NULL,
    "name" TEXT NOT NULL,
    "nationality" TEXT,
    "designation" TEXT,
    "company_name" TEXT,
    "subcontractor_org_id" CHAR(36),
    "photo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_working_day" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_passes" (
    "id" CHAR(36) NOT NULL,
    "tenant_id" CHAR(36) NOT NULL,
    "pass_number" TEXT NOT NULL,
    "staff_id" CHAR(36) NOT NULL,
    "organization" TEXT,
    "department" TEXT,
    "airport" "AirportCode" NOT NULL,
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "status" "GatePassStatus" NOT NULL DEFAULT 'VALID',
    "custody_status" "CustodyStatus" NOT NULL DEFAULT 'WITH_COMPANY',
    "pass_scan_front_url" TEXT,
    "pass_scan_back_url" TEXT,
    "receipt_scan_url" TEXT,
    "handover_unsigned_url" TEXT,
    "handover_signed_url" TEXT,
    "authority_handover_date" DATE,
    "authority_officer_name" TEXT,
    "authority_reference_number" TEXT,
    "renewal_submitted_at" TIMESTAMP(3),
    "renewal_approved_at" TIMESTAMP(3),
    "renewal_rejected_at" TIMESTAMP(3),
    "renewal_rejection_reason" TEXT,
    "renewed_from_pass_id" CHAR(36),
    "cancellation_requested_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "cancellation_completed_at" TIMESTAMP(3),
    "data_deletion_scheduled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_pass_zones" (
    "id" CHAR(36) NOT NULL,
    "gate_pass_id" CHAR(36) NOT NULL,
    "zone_code" "ZoneCode" NOT NULL,

    CONSTRAINT "gate_pass_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_history" (
    "id" CHAR(36) NOT NULL,
    "gate_pass_id" CHAR(36) NOT NULL,
    "tenant_id" CHAR(36) NOT NULL,
    "from_status" "CustodyStatus",
    "to_status" "CustodyStatus" NOT NULL,
    "changed_by" CHAR(36) NOT NULL,
    "authority_handover_date" DATE,
    "authority_officer_name" TEXT,
    "authority_reference_number" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" CHAR(36) NOT NULL,
    "tenant_id" CHAR(36) NOT NULL,
    "gate_pass_id" CHAR(36),
    "type" "DocumentType" NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by" CHAR(36) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" CHAR(36) NOT NULL,
    "tenant_id" CHAR(36) NOT NULL,
    "user_id" CHAR(36) NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" CHAR(36),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" CHAR(36) NOT NULL,
    "tenant_id" CHAR(36) NOT NULL,
    "type" "NotificationType" NOT NULL,
    "subject_template" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "is_customized" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" CHAR(36) NOT NULL,
    "tenant_id" CHAR(36) NOT NULL,
    "role" "UserRole" NOT NULL,
    "module" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" CHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" CHAR(36) NOT NULL,
    "tenant_id" CHAR(36) NOT NULL,
    "user_id" CHAR(36),
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_invitation_token_key" ON "users"("invitation_token");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "subcontractor_orgs_tenant_id_idx" ON "subcontractor_orgs"("tenant_id");

-- CreateIndex
CREATE INDEX "staff_tenant_id_idx" ON "staff"("tenant_id");

-- CreateIndex
CREATE INDEX "staff_tenant_id_name_idx" ON "staff"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "gate_passes_tenant_id_idx" ON "gate_passes"("tenant_id");

-- CreateIndex
CREATE INDEX "gate_passes_tenant_id_status_idx" ON "gate_passes"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "gate_passes_tenant_id_expiry_date_idx" ON "gate_passes"("tenant_id", "expiry_date");

-- CreateIndex
CREATE INDEX "gate_passes_tenant_id_custody_status_idx" ON "gate_passes"("tenant_id", "custody_status");

-- CreateIndex
CREATE INDEX "gate_passes_tenant_id_cancellation_requested_at_idx" ON "gate_passes"("tenant_id", "cancellation_requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "gate_passes_tenant_id_pass_number_key" ON "gate_passes"("tenant_id", "pass_number");

-- CreateIndex
CREATE INDEX "gate_pass_zones_gate_pass_id_idx" ON "gate_pass_zones"("gate_pass_id");

-- CreateIndex
CREATE UNIQUE INDEX "gate_pass_zones_gate_pass_id_zone_code_key" ON "gate_pass_zones"("gate_pass_id", "zone_code");

-- CreateIndex
CREATE INDEX "custody_history_tenant_id_idx" ON "custody_history"("tenant_id");

-- CreateIndex
CREATE INDEX "custody_history_gate_pass_id_idx" ON "custody_history"("gate_pass_id");

-- CreateIndex
CREATE INDEX "documents_tenant_id_idx" ON "documents"("tenant_id");

-- CreateIndex
CREATE INDEX "documents_gate_pass_id_idx" ON "documents"("gate_pass_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_idx" ON "notifications"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_is_read_idx" ON "notifications"("tenant_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_tenant_id_type_key" ON "notification_templates"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "role_permissions_tenant_id_role_idx" ON "role_permissions"("tenant_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_tenant_id_role_module_feature_key" ON "role_permissions"("tenant_id", "role", "module", "feature");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entity_type_entity_id_idx" ON "audit_logs"("tenant_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_subcontractor_org_id_fkey" FOREIGN KEY ("subcontractor_org_id") REFERENCES "subcontractor_orgs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_orgs" ADD CONSTRAINT "subcontractor_orgs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_subcontractor_org_id_fkey" FOREIGN KEY ("subcontractor_org_id") REFERENCES "subcontractor_orgs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_zones" ADD CONSTRAINT "gate_pass_zones_gate_pass_id_fkey" FOREIGN KEY ("gate_pass_id") REFERENCES "gate_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_history" ADD CONSTRAINT "custody_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_history" ADD CONSTRAINT "custody_history_gate_pass_id_fkey" FOREIGN KEY ("gate_pass_id") REFERENCES "gate_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_history" ADD CONSTRAINT "custody_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_gate_pass_id_fkey" FOREIGN KEY ("gate_pass_id") REFERENCES "gate_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

