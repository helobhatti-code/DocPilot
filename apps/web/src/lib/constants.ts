import { AirportCode, CustodyStatus, GatePassStatus, ZoneCode } from './types';

export const STATUS_COLORS: Record<GatePassStatus, { bg: string; label: string }> = {
  VALID:                  { bg: '#48BB78', label: 'Valid' },
  EXPIRY_30:              { bg: '#ECC94B', label: '30 days' },
  EXPIRY_15:              { bg: '#ED8936', label: '15 days' },
  EXPIRY_7:               { bg: '#FC5185', label: '7 days' },
  EXPIRED:                { bg: '#FC5185', label: 'Expired' },
  RENEWAL_SUBMITTED:      { bg: '#4299E1', label: 'Renewal Submitted' },
  RENEWAL_APPROVED:       { bg: '#4299E1', label: 'Renewal Approved' },
  RENEWED:                { bg: '#48BB78', label: 'Renewed' },
  CANCELLATION_REQUESTED: { bg: '#ED8936', label: 'Cancellation Requested' },
  CANCELLED:              { bg: '#4A5568', label: 'Cancelled' },
  SUSPENDED:              { bg: '#FC5185', label: 'Suspended' },
};

export const CUSTODY_COLORS: Record<CustodyStatus, { bg: string; label: string }> = {
  WITH_COMPANY:            { bg: '#4299E1', label: 'With Company' },
  WITH_PERSON:             { bg: '#48BB78', label: 'With Person' },
  RETURNED_TO_COMPANY:     { bg: '#ECC94B', label: 'Returned' },
  SURRENDERED_TO_AUTHORITY:{ bg: '#48BB78', label: 'Surrendered' },
};

export const ZONE_COLORS: Record<ZoneCode, { bg: string; label: string; name: string }> = {
  AP:        { bg: '#3B82F6', label: 'AP',  name: 'Apron' },
  AR:        { bg: '#EF4444', label: 'AR',  name: 'Arrivals' },
  CO:        { bg: '#10B981', label: 'CO',  name: 'Cargo' },
  TT:        { bg: '#8B5CF6', label: 'TT',  name: 'Transit' },
  AT:        { bg: '#F97316', label: 'AT',  name: 'ATC' },
  BS:        { bg: '#14B8A6', label: 'BS',  name: 'Baggage Sorting' },
  TW:        { bg: '#1E3A8A', label: 'TW',  name: 'Tower' },
  PX:        { bg: '#7F1D1D', label: 'PX',  name: 'Passenger' },
  CT:        { bg: '#808000', label: 'CT',  name: 'Control Tower' },
  GW:        { bg: '#78350F', label: 'GW',  name: 'Gateway' },
  EYE:       { bg: '#7DD3FC', label: 'EYE', name: 'Surveillance' },
  ALL_ZONES: { bg: '#FFD700', label: 'ALL', name: 'All Zones' },
  BHS:       { bg: '#9CA3AF', label: 'BHS', name: 'Baggage Handling' },
  CBP:       { bg: '#4B5563', label: 'CBP', name: 'Customs' },
  BHS_CBP:   { bg: '#374151', label: 'BHS+CBP', name: 'BHS + CBP' },
  PA:        { bg: '#EC4899', label: 'PA',  name: 'Public Area' },
  FF:        { bg: '#DC143C', label: 'FF',  name: 'Fire & Rescue' },
  TL:        { bg: '#06B6D4', label: 'TL',  name: 'Terminal' },
};

export const AIRPORTS: { code: AirportCode; name: string }[] = [
  { code: 'AUH', name: 'Abu Dhabi International' },
  { code: 'AAN', name: 'Al Ain International' },
  { code: 'SIR', name: 'Sir Bani Yas' },
  { code: 'AZI', name: 'Al Bateen Executive' },
  { code: 'ZDY', name: 'Delma' },
  { code: 'ALL', name: 'All Airports' },
];

// Per-airport color palette, themed to each airport's identity.
// AUH — Abu Dhabi heritage teal/green; AAN — oasis amber; SIR — island sea;
// AZI — executive indigo; ZDY — desert sienna; ALL — brand orange (meta).
export const AIRPORT_COLORS: Record<AirportCode, { bg: string; label: string; name: string }> = {
  AUH: { bg: '#0A6E5C', label: 'AUH', name: 'Abu Dhabi International' },
  AAN: { bg: '#B45309', label: 'AAN', name: 'Al Ain International' },
  SIR: { bg: '#0E7490', label: 'SIR', name: 'Sir Bani Yas' },
  AZI: { bg: '#312E81', label: 'AZI', name: 'Al Bateen Executive' },
  ZDY: { bg: '#7C2D12', label: 'ZDY', name: 'Delma' },
  ALL: { bg: '#F47316', label: 'ALL', name: 'All Airports' },
};

export const ZONE_ORDER: ZoneCode[] = [
  'AP','AR','CO','TT','AT','BS','TW','PX','CT','GW',
  'EYE','ALL_ZONES','BHS','CBP','BHS_CBP','PA','FF','TL',
];
