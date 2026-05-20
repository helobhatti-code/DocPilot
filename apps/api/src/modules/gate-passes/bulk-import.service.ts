import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AirportCode, GatePassStatus, Prisma, ZoneCode } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';

const ALL_ZONE_COLUMNS: ZoneCode[] = [
  'AP', 'AR', 'CO', 'TT', 'AT', 'BS', 'TW', 'PX', 'CT', 'GW',
  'EYE', 'BHS', 'CBP', 'BHS_CBP', 'PA', 'FF', 'TL',
];

const ALL_AIRPORTS: AirportCode[] = ['AUH', 'AAN', 'SIR', 'AZI', 'ZDY', 'ALL'];

interface ParsedRow {
  rowNumber: number;
  serialNumber?: string;
  companyName?: string;
  staffName?: string;
  designation?: string;
  nationality?: string;
  passNumber?: string;
  organization?: string;
  department?: string;
  airport?: string;
  zoneCodes: ZoneCode[];
  issueDate?: string;
  expiryDate?: string;
  passStatus?: string;
  passIsWith?: string;
  errors: string[];
  ok: boolean;
}

export interface BulkImportPreview {
  headers: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: ParsedRow[];
}

export interface BulkImportResult {
  imported: number;
  skipped: number;
  failures: { rowNumber: number; reason: string }[];
}

const HEADER_ALIASES: Record<string, string> = {
  's/n': 'serialNumber',
  'sno': 'serialNumber',
  'sl no': 'serialNumber',
  'serial number': 'serialNumber',
  'company name': 'companyName',
  'company': 'companyName',
  'name': 'staffName',
  'staff name': 'staffName',
  'gatepass no.': 'passNumber',
  'gatepass no': 'passNumber',
  'gatepass number': 'passNumber',
  'pass number': 'passNumber',
  'pass no': 'passNumber',
  'org': 'organization',
  'organization': 'organization',
  'dep': 'department',
  'department': 'department',
  'issue date': 'issueDate',
  'exp date': 'expiryDate',
  'expiry date': 'expiryDate',
  'expiration date': 'expiryDate',
  'pass status': 'passStatus',
  'status': 'passStatus',
  'pass is with': 'passIsWith',
  'custody': 'passIsWith',
  'airport': 'airport',
  'designation': 'designation',
  'job title': 'designation',
  'position': 'designation',
  'nationality': 'nationality',
  'nation': 'nationality',
};

@Injectable()
export class BulkImportService {
  private readonly logger = new Logger(BulkImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async parseAndValidate(actor: AuthUser, buffer: Buffer): Promise<BulkImportPreview> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Empty file');
    }
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch (e) {
      throw new BadRequestException(`Invalid .xlsx file: ${(e as Error).message}`);
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Workbook has no sheets');

    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? '').trim();
    });
    const colMap = this.buildColumnMap(headers);

    const passNumbers = new Set<string>();
    const existingPassNumbers = new Set(
      (await this.prisma.gatePass.findMany({ select: { passNumber: true } }))
        .map((p) => p.passNumber),
    );

    const rows: ParsedRow[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (!row.hasValues) continue;
      const parsed = this.parseRow(row, colMap, headers, passNumbers, existingPassNumbers);
      parsed.rowNumber = r;
      rows.push(parsed);
    }

    const validRows = rows.filter((r) => r.ok).length;
    return {
      headers,
      totalRows: rows.length,
      validRows,
      invalidRows: rows.length - validRows,
      rows,
    };
  }

  async commit(actor: AuthUser, parsed: ParsedRow[]): Promise<BulkImportResult> {
    const valid = parsed.filter((r) => r.ok);
    const failures: { rowNumber: number; reason: string }[] = [];
    let imported = 0;

    // Pre-load tenant name so rows matching it are treated as Own (no sub-contractor link)
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { name: true },
    });
    const tenantNameKey = tenant?.name.toLowerCase().trim() ?? '';

    // Pre-load existing subcontractor orgs for name-matching (determines Own vs Sub)
    const subOrgs = await this.prisma.subcontractorOrg.findMany({
      where: { tenantId: actor.tenantId, isActive: true },
      select: { id: true, name: true },
    });
    const subOrgByName = new Map(subOrgs.map((o) => [o.name.toLowerCase().trim(), o.id]));

    // Auto-create sub-contractor orgs for any company name that isn't already known
    // and doesn't match the tenant's own name. Preserves the user's original casing.
    const unknownCompanyNames = new Map<string, string>(); // key → display name
    for (const row of valid) {
      const raw = row.companyName?.trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (key === tenantNameKey) continue;
      if (subOrgByName.has(key)) continue;
      if (!unknownCompanyNames.has(key)) unknownCompanyNames.set(key, raw);
    }
    for (const [key, displayName] of unknownCompanyNames) {
      const created = await this.prisma.subcontractorOrg.create({
        data: {
          tenantId: actor.tenantId,
          name: displayName,
        } as Prisma.SubcontractorOrgUncheckedCreateInput,
        select: { id: true },
      });
      subOrgByName.set(key, created.id);
    }

    for (const row of valid) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Match company name → subcontractorOrgId (case-insensitive).
          // Tenant's own name → Own (null). Anything else → linked sub org
          // (either pre-existing or auto-created above).
          const companyKey = row.companyName?.toLowerCase().trim() ?? '';
          const subcontractorOrgId =
            companyKey && companyKey !== tenantNameKey
              ? (subOrgByName.get(companyKey) ?? null)
              : null;

          // Find or create staff
          let staff = await tx.staff.findFirst({
            where: {
              name: row.staffName!,
              tenantId: actor.tenantId,
              companyName: row.companyName ?? null,
            },
            select: { id: true },
          });
          if (!staff) {
            staff = await tx.staff.create({
              data: {
                tenantId: actor.tenantId,
                name: row.staffName!,
                companyName: row.companyName ?? null,
                designation: row.designation ?? null,
                nationality: row.nationality ?? null,
                subcontractorOrgId,
              } as Prisma.StaffUncheckedCreateInput,
              select: { id: true },
            });
          }

          await tx.gatePass.create({
            data: {
              tenantId: actor.tenantId,
              passNumber: row.passNumber!,
              staffId: staff.id,
              organization: row.organization ?? null,
              department: row.department ?? null,
              airport: (row.airport as AirportCode) ?? AirportCode.AUH,
              issueDate: new Date(row.issueDate!),
              expiryDate: new Date(row.expiryDate!),
              status: this.mapStatus(row.passStatus, new Date(row.expiryDate!)),
              custodyStatus: this.mapCustody(row.passIsWith),
              zones: { create: row.zoneCodes.map((z) => ({ zoneCode: z })) },
              custodyHistory: {
                create: {
                  tenantId: actor.tenantId,
                  toStatus: this.mapCustody(row.passIsWith),
                  changedById: actor.id,
                  notes: 'Imported from Excel',
                },
              },
            } as unknown as Prisma.GatePassUncheckedCreateInput,
          });
        });
        imported += 1;
      } catch (e) {
        failures.push({ rowNumber: row.rowNumber, reason: (e as Error).message });
      }
    }

    // Post-commit: recompute expiry-bucket statuses for every non-terminal
    // pass in this tenant. Cheap O(passes) sweep that fixes any historical
    // rows still stored as VALID despite being inside an expiry window
    // (e.g. rows from older imports before the status mapping was fixed,
    // or tenants whose scheduled status-engine cron isn't running because
    // Redis isn't provisioned).
    const refreshed = await this.refreshExpiryStatuses(actor.tenantId);
    if (refreshed > 0) {
      this.logger.log(`Bulk import: refreshed ${refreshed} stale statuses for tenant ${actor.tenantId}`);
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        userId: actor.id,
        action: 'BULK_IMPORT_GATE_PASSES',
        entityType: 'GatePass',
        details: {
          attempted: valid.length,
          imported,
          failed: failures.length,
        } as Prisma.InputJsonValue,
      } as unknown as Prisma.AuditLogUncheckedCreateInput,
    });

    return { imported, skipped: parsed.length - imported, failures };
  }

  buildTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DocPilot';
    const ws = wb.addWorksheet('Gate Passes');
    const headers = [
      'S/N',
      'Company Name',
      'Name',
      'Designation',
      'Nationality',
      'Gatepass No.',
      'Org',
      'Dep',
      ...ALL_ZONE_COLUMNS,
      'Issue Date',
      'Exp Date',
      'Pass Status',
      'Pass Is With',
      'Airport',
    ];
    ws.addRow(headers);
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    } as unknown as Record<string, unknown>;
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Sample row
    ws.addRow([
      '1',
      'Almira',           // Use a subcontractor org name → auto-links subcontractorOrgId
      'John Doe',
      'Civil Engineer',
      'UAE',
      '123456',
      'Maintenance',
      'Operations',
      ...ALL_ZONE_COLUMNS.map((z) => (['AP', 'AR'].includes(z) ? 'Y' : '')),
      '2026-05-01',
      '2026-11-01',
      'VALID',
      'WITH_COMPANY',
      'AUH',
    ]);

    ws.columns.forEach((c) => {
      c.width = Math.max(12, (c.header?.toString().length ?? 0) + 4);
    });

    return wb.xlsx.writeBuffer().then((buf) => Buffer.from(buf as ArrayBuffer));
  }

  private buildColumnMap(headers: string[]): Map<string, number> {
    const map = new Map<string, number>();
    headers.forEach((h, idx) => {
      const key = HEADER_ALIASES[h.toLowerCase().trim()];
      if (key) map.set(key, idx);
      // Zone columns by exact code
      const upper = h.toUpperCase().trim();
      if (ALL_ZONE_COLUMNS.includes(upper as ZoneCode)) {
        map.set(`zone:${upper}`, idx);
      }
    });
    return map;
  }

  private parseRow(
    row: ExcelJS.Row,
    colMap: Map<string, number>,
    headers: string[],
    seenPassNumbers: Set<string>,
    existingPassNumbers: Set<string>,
  ): ParsedRow {
    const get = (key: string): string | undefined => {
      const idx = colMap.get(key);
      if (idx === undefined) return undefined;
      const cell = row.getCell(idx + 1);
      const v = cell.value;
      if (v === null || v === undefined) return undefined;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === 'object' && 'text' in v) return String((v as { text: string }).text);
      if (typeof v === 'object' && 'result' in v) return String((v as { result: unknown }).result);
      return String(v).trim();
    };

    const errors: string[] = [];
    const serialNumber = get('serialNumber');
    const companyName = get('companyName');
    const staffName = get('staffName');
    const designation = get('designation');
    const nationality = get('nationality');
    const passNumber = (get('passNumber') ?? '').replace(/[^\d]/g, '').padStart(6, '0');
    const organization = get('organization');
    const department = get('department');
    const airport = (get('airport') ?? 'AUH').toUpperCase();
    const issueDate = this.normalizeDate(get('issueDate'));
    const expiryDate = this.normalizeDate(get('expiryDate'));
    const passStatus = get('passStatus');
    const passIsWith = get('passIsWith');

    if (!staffName) errors.push('Name is required');
    if (!passNumber || !/^\d{6}$/.test(passNumber)) errors.push('Gatepass No. must be 6 digits');
    if (!issueDate) errors.push('Issue Date invalid or missing');
    if (!expiryDate) errors.push('Exp Date invalid or missing');
    if (issueDate && expiryDate && new Date(expiryDate) <= new Date(issueDate)) {
      errors.push('Exp Date must be after Issue Date');
    }
    if (!ALL_AIRPORTS.includes(airport as AirportCode)) {
      errors.push(`Airport "${airport}" is invalid (allowed: ${ALL_AIRPORTS.join(', ')})`);
    }
    if (passNumber) {
      if (seenPassNumbers.has(passNumber)) {
        errors.push(`Duplicate Gatepass No. ${passNumber} within this file`);
      } else {
        seenPassNumbers.add(passNumber);
      }
      if (existingPassNumbers.has(passNumber)) {
        errors.push(`Gatepass No. ${passNumber} already exists for this tenant`);
      }
    }

    const zoneCodes: ZoneCode[] = [];
    for (const z of ALL_ZONE_COLUMNS) {
      const idx = colMap.get(`zone:${z}`);
      if (idx === undefined) continue;
      const v = row.getCell(idx + 1).value;
      if (v === null || v === undefined || v === '') continue;
      const s = String(v).trim().toLowerCase();
      if (s === 'y' || s === 'yes' || s === '1' || s === 'true' || s === 'x' || s === '✓') {
        zoneCodes.push(z);
      }
    }
    if (zoneCodes.length === 0) errors.push('At least one zone is required (mark Y/X in zone column)');

    return {
      rowNumber: row.number,
      serialNumber,
      companyName,
      staffName,
      designation,
      nationality,
      passNumber,
      organization,
      department,
      airport,
      zoneCodes,
      issueDate,
      expiryDate,
      passStatus,
      passIsWith,
      errors,
      ok: errors.length === 0,
    };
  }

  private normalizeDate(v?: string): string | undefined {
    if (!v) return undefined;
    const s = v.trim();
    // Already ISO date
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // DD/MM/YYYY or DD-MM-YYYY
    const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const y = yyyy.length === 2 ? `20${yyyy}` : yyyy;
      return `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
    return undefined;
  }

  /**
   * Sweep every non-terminal pass in the tenant and re-derive its status
   * from the current expiry date. Returns the number of rows whose stored
   * status diverged from the computed one (i.e. how many were corrected).
   */
  private async refreshExpiryStatuses(tenantId: string): Promise<number> {
    const TIME_BUCKETS: GatePassStatus[] = [
      GatePassStatus.VALID,
      GatePassStatus.EXPIRY_30,
      GatePassStatus.EXPIRY_15,
      GatePassStatus.EXPIRY_7,
      GatePassStatus.EXPIRED,
    ];
    const candidates = await this.prisma.gatePass.findMany({
      where: { tenantId, status: { in: TIME_BUCKETS } },
      select: { id: true, status: true, expiryDate: true },
    });
    let updated = 0;
    for (const p of candidates) {
      const computed = this.mapStatus(undefined, p.expiryDate);
      if (computed !== p.status) {
        await this.prisma.gatePass.update({
          where: { id: p.id },
          data: { status: computed },
        });
        updated += 1;
      }
    }
    return updated;
  }

  /**
   * Expiry-derived statuses (VALID / EXPIRY_30 / EXPIRY_15 / EXPIRY_7 /
   * EXPIRED) are always computed from the actual expiry date — the Excel
   * "Pass Status" column is ignored for those because users typically type
   * "VALID" on every row regardless of the date.
   *
   * Terminal / non-time statuses (CANCELLED, RENEWED, SUSPENDED,
   * RENEWAL_SUBMITTED, RENEWAL_APPROVED, CANCELLATION_REQUESTED) are
   * honoured from Excel as overrides since they cannot be derived from a
   * date.
   */
  private mapStatus(raw: string | undefined, expiry: Date): GatePassStatus {
    const s = (raw ?? '').toUpperCase().trim();
    const TIME_DERIVED = new Set<string>([
      GatePassStatus.VALID,
      GatePassStatus.EXPIRY_30,
      GatePassStatus.EXPIRY_15,
      GatePassStatus.EXPIRY_7,
      GatePassStatus.EXPIRED,
    ]);
    // Respect terminal / lifecycle overrides from Excel (e.g. SUSPENDED).
    if (s in GatePassStatus && !TIME_DERIVED.has(s)) {
      return s as GatePassStatus;
    }
    // Always compute expiry-bucket status from the real expiry date.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
    if (days < 0) return GatePassStatus.EXPIRED;
    if (days <= 7) return GatePassStatus.EXPIRY_7;
    if (days <= 15) return GatePassStatus.EXPIRY_15;
    if (days <= 30) return GatePassStatus.EXPIRY_30;
    return GatePassStatus.VALID;
  }

  private mapCustody(raw: string | undefined): 'WITH_COMPANY' | 'WITH_PERSON' | 'RETURNED_TO_COMPANY' | 'SURRENDERED_TO_AUTHORITY' {
    const s = (raw ?? '').toUpperCase().trim().replace(/\s+/g, '_');
    if (s === 'COMPANY' || s === 'WITH_COMPANY') return 'WITH_COMPANY';
    if (s === 'PERSON' || s === 'WITH_PERSON' || s === 'STAFF') return 'WITH_PERSON';
    if (s === 'RETURNED' || s === 'RETURNED_TO_COMPANY') return 'RETURNED_TO_COMPANY';
    if (s === 'AUTHORITY' || s === 'SURRENDERED' || s === 'SURRENDERED_TO_AUTHORITY') {
      return 'SURRENDERED_TO_AUTHORITY';
    }
    return 'WITH_COMPANY';
  }
}
