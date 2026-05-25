export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'PM'
  | 'HR'
  | 'SECRETARY'
  | 'VIEWER'
  | 'SUBCONTRACTOR';

export type ThemePreference = 'DARK' | 'LIGHT';

export type AirportCode = 'AUH' | 'AAN' | 'SIR' | 'AZI' | 'ZDY' | 'ALL';

export type ZoneCode =
  | 'AP' | 'AR' | 'CO' | 'TT' | 'AT' | 'BS' | 'TW' | 'PX' | 'CT' | 'GW'
  | 'EYE' | 'ALL_ZONES' | 'BHS' | 'CBP' | 'BHS_CBP' | 'PA' | 'FF' | 'TL';

export type GatePassStatus =
  | 'VALID' | 'EXPIRY_30' | 'EXPIRY_15' | 'EXPIRY_7' | 'EXPIRED'
  | 'RENEWAL_SUBMITTED' | 'RENEWAL_APPROVED' | 'RENEWED'
  | 'CANCELLATION_REQUESTED' | 'CANCELLED' | 'SUSPENDED';

export type CustodyStatus =
  | 'WITH_COMPANY' | 'WITH_PERSON' | 'RETURNED_TO_COMPANY' | 'SURRENDERED_TO_AUTHORITY';

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  themePreference: ThemePreference;
  subcontractorOrgId?: string | null;
}

export type PersonType = 'DIRECT_EMPLOYEE' | 'SUBCONTRACTOR';

export interface Staff {
  id: string;
  name: string;
  nationality?: string | null;
  designation?: string | null;
  companyName?: string | null;
  photoUrl?: string | null;
  isActive: boolean;
  lastWorkingDay?: string | null;
  subcontractorOrgId?: string | null;
  personType: PersonType;
  emiratesIdNo?: string | null;
  emiratesIdExpiryDate?: string | null;
  emiratesIdAttachmentId?: string | null;
  visaNo?: string | null;
  visaExpiryDate?: string | null;
  visaAttachmentId?: string | null;
  laborCardNo?: string | null;
  laborCardExpiryDate?: string | null;
  laborCardAttachmentId?: string | null;
  passportNo?: string | null;
  passportExpiryDate?: string | null;
  passportAttachmentId?: string | null;
  // computed for DIRECT_EMPLOYEE rows (null for SUBCONTRACTOR)
  visaExpiryBand?: ExpiryBand | null;
  emiratesIdExpiryBand?: ExpiryBand | null;
  laborCardExpiryBand?: ExpiryBand | null;
  passportExpiryBand?: ExpiryBand | null;
  worstExpiryBand?: ExpiryBand | null;
}

export interface SubcontractorOrg {
  id: string;
  name: string;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isActive: boolean;
}

export interface GatePass {
  id: string;
  passNumber: string;
  organization?: string | null;
  department?: string | null;
  airport: AirportCode;
  issueDate: string;
  expiryDate: string;
  status: GatePassStatus;
  custodyStatus: CustodyStatus;
  passScanFrontUrl?: string | null;
  passScanBackUrl?: string | null;
  receiptScanUrl?: string | null;
  handoverUnsignedUrl?: string | null;
  handoverSignedUrl?: string | null;
  authorityHandoverDate?: string | null;
  authorityOfficerName?: string | null;
  authorityReferenceNumber?: string | null;
  cancellationRequestedAt?: string | null;
  cancellationReason?: string | null;
  cancellationCompletedAt?: string | null;
  dataDeletionScheduledAt?: string | null;
  zones: { zoneCode: ZoneCode }[];
  staff: Staff;
  documents?: GatePassDocument[];
  custodyHistory?: CustodyEvent[];
}

export interface GatePassDocument {
  id: string;
  type: string;
  fileUrl: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  createdAt: string;
}

export interface CustodyEvent {
  id: string;
  fromStatus: CustodyStatus | null;
  toStatus: CustodyStatus;
  authorityHandoverDate?: string | null;
  authorityOfficerName?: string | null;
  authorityReferenceNumber?: string | null;
  notes?: string | null;
  createdAt: string;
  changedBy?: { id: string; name: string; email: string };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';

export type OnboardingStage =
  | 'VISIT_VISA_PENDING'
  | 'VISIT_VISA_VALID'
  | 'VISIT_VISA_EXPIRED'
  | 'VISIT_VISA_CANCELLED'
  | 'WORK_PERMIT_PENDING'
  | 'WORK_PERMIT_APPROVED'
  | 'WORK_PERMIT_REJECTED'
  | 'MEDICAL_PENDING'
  | 'MEDICAL_COMPLETED'
  | 'INSURANCE_PENDING'
  | 'INSURANCE_COMPLETED'
  | 'RESIDENCY_PENDING'
  | 'RESIDENCY_COMPLETED'
  | 'EID_PENDING'
  | 'EID_DELIVERED'
  | 'ONBOARDED'
  | 'CANCELLED';

export type OnboardingTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

export interface OnboardingTask {
  id:           string;
  employeeId:   string;
  stage:        OnboardingStage;
  status:       OnboardingTaskStatus;
  completedAt?: string | null;
  completedBy?: string | null;
  attachmentId?: string | null;
  notes?:       string | null;
  createdAt:    string;
  updatedAt:    string;
}

export interface OnboardingState {
  employeeId:               string;
  employeeName:             string;
  isNewEmployee:            boolean;
  currentState:             OnboardingStage | null;
  cancellationGraceEndsAt?: string | null;
  graceDaysRemaining?:      number | null;
  tasks:                    OnboardingTask[];
}

export interface Employee {
  id:                      string;
  tenantId:                string;
  companyId:               string;
  name:                    string;
  designation:             string;
  nationality?:            string | null;
  emiratesIdNo?:           string | null;
  emiratesIdExpiryDate?:   string | null;
  emiratesIdAttachmentId?: string | null;
  visaNo?:                 string | null;
  visaExpiryDate?:         string | null;
  visaAttachmentId?:       string | null;
  laborCardNo?:            string | null;
  laborCardExpiryDate?:    string | null;
  laborCardAttachmentId?:  string | null;
  passportNo?:             string | null;
  passportExpiryDate?:     string | null;
  passportAttachmentId?:   string | null;
  phone?:                  string | null;
  email?:                  string | null;
  joinDate?:               string | null;
  status:                  EmployeeStatus;
  isActive:                boolean;
  isNewEmployee:           boolean;
  onboardingState?:        OnboardingStage | null;
  cancellationGraceEndsAt?: string | null;
  remarks?:                string | null;
  createdAt:               string;
  updatedAt:               string;
  // computed bands
  visaExpiryBand:          ExpiryBand | null;
  emiratesIdExpiryBand:    ExpiryBand | null;
  laborCardExpiryBand:     ExpiryBand | null;
  passportExpiryBand:      ExpiryBand | null;
  worstExpiryBand:         ExpiryBand;
}

export type VehicleType    = 'PRIVATE' | 'COMPANY';
export type InsuranceType  = 'COMPREHENSIVE' | 'THIRD_PARTY';
export type MachineryStatus = 'ACTIVE' | 'IDLE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
export type ExpiryBand     = 'valid' | '30d' | '14d' | '7d' | 'expired';

export interface Vehicle {
  id:                           string;
  tenantId:                     string;
  companyId?:                   string | null;
  vehicleType:                  VehicleType;
  ownerName:                    string;
  driverName?:                  string | null;
  carMake:                      string;
  carModel?:                    string | null;
  plateEmirate:                 string;
  plateCategory?:               string | null;
  plateNumber:                  string;
  carLicenseNo:                 string;
  carLicenseExpiryDate:         string;
  carLicenseAttachmentId?:      string | null;
  insuranceType:                InsuranceType;
  insurancePolicyNo?:           string | null;
  insuranceExpiryDate:          string;
  insuranceAttachmentId?:       string | null;
  hasResidentialMawaqif:        boolean;
  residentialMawaqifExpiryDate?: string | null;
  hasNormalMawaqif:             boolean;
  normalMawaqifExpiryDate?:     string | null;
  formAttachmentId?:            string | null;
  isActive:                     boolean;
  remarks?:                     string | null;
  createdAt:                    string;
  updatedAt:                    string;
  // computed bands from API
  carLicenseExpiryBand:         ExpiryBand;
  insuranceExpiryBand:          ExpiryBand;
  residentialMawaqifExpiryBand: ExpiryBand | null;
  normalMawaqifExpiryBand:      ExpiryBand | null;
  worstExpiryBand:              ExpiryBand;
}

// ─── Expiry Dashboard ─────────────────────────────────────────────────────────

export type ExpirySource =
  | 'gate_pass' | 'vehicle' | 'machinery' | 'employee' | 'company_document';

export interface ExpiryItem {
  source:            ExpirySource;
  source_id:         string;
  tenant_id:         string;
  company_id:        string | null;
  doc_kind:          string;
  display_name:      string;
  expiry_date:       string;
  days_until_expiry: number;
  band:              ExpiryBand;
}

export interface ExpirySummary {
  byBand:   { expired: number; '7d': number; '14d': number; '30d': number; valid: number };
  bySource: { gate_pass: number; vehicle: number; machinery: number; employee: number; company_document: number };
}

// ─── Company Documents ────────────────────────────────────────────────────────

export type CompanyDocType =
  | 'TRADE_LICENSE'
  | 'ESTABLISHMENT_CARD'
  | 'CLASSIFICATION'
  | 'CIVIL_DEFENSE'
  | 'POWER_OF_ATTORNEY'
  | 'OFFICE_TENANCY';

export type DocStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'UNDER_RENEWAL';

export interface CompanyDocument {
  id:            string;
  tenantId:      string;
  companyId:     string;
  docType:       CompanyDocType;
  docName:       string;
  docNumber?:    string | null;
  issueDate?:    string | null;
  expiryDate:    string;
  status:        DocStatus;
  attachmentId?: string | null;
  metadata?:     Record<string, unknown> | null;
  isActive:      boolean;
  remarks?:      string | null;
  createdAt:     string;
  updatedAt:     string;
  createdBy?:    string | null;
  previousDocId?: string | null;
  company?:      { id: string; name: string; code: string };
  // computed bands from API
  expiryBand:    ExpiryBand;
  // CIVIL_DEFENSE only
  mainExpiryBand?:      ExpiryBand | null;
  hassantukExpiryBand?: ExpiryBand | null;
}

export interface HeavyMachinery {
  id:                           string;
  tenantId:                     string;
  companyId?:                   string | null;
  machineType:                  string;
  make:                         string;
  model?:                       string | null;
  manufactureYear?:             number | null;
  serialNumber:                 string;
  plateNumber?:                 string | null;
  assignedOperator?:            string | null;
  currentLocation?:             string | null;
  projectSite?:                 string | null;
  status:                       MachineryStatus;
  operatorLicenseNo?:           string | null;
  operatorLicenseExpiryDate?:   string | null;
  inspectionCertificateNo?:     string | null;
  inspectionExpiryDate?:        string | null;
  rtaRegistrationNo?:           string | null;
  rtaRegistrationExpiryDate?:   string | null;
  liftingTestCertificateNo?:    string | null;
  liftingTestExpiryDate?:       string | null;
  insuranceType?:               InsuranceType | null;
  insuranceExpiryDate?:         string | null;
  civilDefenseExpiryDate?:      string | null;
  isActive:                     boolean;
  remarks?:                     string | null;
  createdAt:                    string;
  updatedAt:                    string;
  // computed bands
  operatorLicenseExpiryBand:    ExpiryBand | null;
  inspectionExpiryBand:         ExpiryBand | null;
  rtaRegistrationExpiryBand:    ExpiryBand | null;
  liftingTestExpiryBand:        ExpiryBand | null;
  insuranceExpiryBand:          ExpiryBand | null;
  civilDefenseExpiryBand:       ExpiryBand | null;
  worstExpiryBand:              ExpiryBand;
}
