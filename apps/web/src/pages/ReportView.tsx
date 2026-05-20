import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Filter as FilterIcon,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { actionLabel, entityLabel } from '@/lib/auditLabels';
import { CUSTODY_COLORS, STATUS_COLORS, ZONE_COLORS } from '@/lib/constants';

type ReportType =
  | 'pass-register'
  | 'expiry'
  | 'compliance'
  | 'custody'
  | 'pending-handover'
  | 'retention'
  | 'zone-access'
  | 'staff-history'
  | 'subcontractor'
  | 'audit-trail'
  | 'vehicles-expiry'
  | 'machinery-compliance'
  | 'employees-visa-status'
  | 'company-docs-compliance'
  | 'master-expiry';

interface ReportColumn {
  key: string;
  label: string;
  width?: number;
  format?: 'date' | 'datetime' | 'number' | 'text' | 'pill';
}

interface ReportResult {
  type: ReportType;
  title: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  total: number;
  groups?: { key: string; label: string; rows: Record<string, unknown>[] }[];
  summary?: Record<string, number | string>;
  filters?: Record<string, unknown>;
}

const REPORT_LABELS: Record<ReportType, { title: string; description: string }> = {
  'pass-register':            { title: 'Pass Register',                description: 'Every pass with all fields.' },
  expiry:                     { title: 'Expiry Report',                description: 'Passes expiring soon, grouped by bucket.' },
  compliance:                 { title: 'Compliance Report',            description: 'Overdue renewals, cancellations and handovers.' },
  custody:                    { title: 'Custody Report',               description: 'Passes grouped by custody status.' },
  'pending-handover':         { title: 'Pending Handover',             description: 'Passes returned to company awaiting authority surrender.' },
  retention:                  { title: 'Data Retention',               description: 'Cancelled passes with scheduled deletion dates.' },
  'zone-access':              { title: 'Zone Access',                  description: 'Active passes broken down by zone.' },
  'staff-history':            { title: 'Staff Pass History',           description: 'All passes ever issued to a single staff member.' },
  subcontractor:              { title: 'Subcontractor Report',         description: 'Per-org compliance scoring.' },
  'audit-trail':              { title: 'Audit Trail',                  description: 'Searchable record of every system action.' },
  'vehicles-expiry':          { title: 'Vehicles Expiry',              description: 'Vehicles with documents expiring within the selected window.' },
  'machinery-compliance':     { title: 'Machinery Compliance',         description: 'All active machinery with every certificate band.' },
  'employees-visa-status':    { title: 'Employees Visa Status',        description: 'Active employees sorted by visa expiry urgency.' },
  'company-docs-compliance':  { title: 'Company Docs Compliance',      description: 'Company compliance documents with expiry bands.' },
  'master-expiry':            { title: 'Master Expiry Report',         description: 'Everything expiring across all modules in one export.' },
};

const VALID_TYPES = Object.keys(REPORT_LABELS) as ReportType[];

interface FilterState {
  q: string;
  from: string;
  to: string;
  airport: string;
  zone: string;
  custodyStatus: string;
  company: string;
  staffId: string;
  subcontractorOrgId: string;
  action: string;
  // New-report filters
  daysAhead: string;
  band: string;
  docType: string;
  companyId: string;
}

const EMPTY_FILTERS: FilterState = {
  q: '', from: '', to: '', airport: '', zone: '', custodyStatus: '',
  company: '', staffId: '', subcontractorOrgId: '', action: '',
  daysAhead: '', band: '', docType: '', companyId: '',
};

export default function ReportView() {
  const { type } = useParams<{ type: string }>();
  const isValid = type && (VALID_TYPES as string[]).includes(type);

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [submitted, setSubmitted] = useState<FilterState>(EMPTY_FILTERS);
  const [exporting, setExporting] = useState(false);

  if (!isValid) {
    return <Navigate to="/reports" replace />;
  }
  const reportType = type as ReportType;
  const meta = REPORT_LABELS[reportType];

  const params = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(submitted)) {
      if (v) out[k] = v;
    }
    return out;
  }, [submitted]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['report', reportType, params],
    queryFn: async () => (await api.get(`/reports/${reportType}`, { params })).data as ReportResult,
  });

  // staff-history requires a staffId — surface clearly.
  const requiresStaffId = reportType === 'staff-history';
  const missingStaffId = requiresStaffId && !submitted.staffId;

  useEffect(() => {
    setFilters(EMPTY_FILTERS);
    setSubmitted(EMPTY_FILTERS);
  }, [reportType]);

  const onExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(true);
    try {
      const res = await api.get(`/reports/${reportType}/export`, {
        params: { ...params, format },
        responseType: 'blob',
      });
      const mime =
        format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf';
      const blob = new Blob([res.data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} ready`);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message ?? 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const onPrint = () => {
    if (!data) return;
    const win = window.open('', '_blank', 'width=1024,height=768');
    if (!win) {
      toast.error('Pop-ups blocked — allow pop-ups to print.');
      return;
    }
    win.document.write(buildPrintHtml(data));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  };

  const allRows = data?.rows ?? [];
  const groups = data?.groups;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/reports" className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-accent-primary mb-1">
            <ArrowLeft size={12} /> Reports
          </Link>
          <h1 className="text-2xl font-semibold">{data?.title ?? meta.title}</h1>
          <p className="text-xs text-text-secondary">{meta.description}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-bg-input disabled:opacity-50"
          >
            <RefreshCw size={14} className={clsx(isFetching && 'animate-spin')} /> Refresh
          </button>
          <button
            onClick={onPrint}
            disabled={!data}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-bg-input disabled:opacity-50"
          >
            <Printer size={14} /> Print
          </button>
          <ExportMenu disabled={exporting || !data} onSelect={onExport} />
        </div>
      </div>

      <FilterPanel
        type={reportType}
        value={filters}
        onChange={setFilters}
        onApply={() => setSubmitted(filters)}
        onReset={() => {
          setFilters(EMPTY_FILTERS);
          setSubmitted(EMPTY_FILTERS);
        }}
      />

      {missingStaffId ? (
        <div className="bg-bg-card border border-border rounded-xl p-8 text-center text-text-secondary">
          Provide a Staff ID in the filters to load this report.
        </div>
      ) : isLoading ? (
        <div className="bg-bg-card border border-border rounded-xl p-8 text-center text-text-secondary">Loading…</div>
      ) : !data ? (
        <div className="bg-bg-card border border-border rounded-xl p-8 text-center text-text-secondary">No data.</div>
      ) : (
        <>
          {data.summary && Object.keys(data.summary).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {Object.entries(data.summary).map(([k, v]) => {
                // If this summary key is a zone code, paint the card with the
                // canonical zone palette so Zone Access matches the chips used
                // throughout the rest of the app.
                const zoneColor = (ZONE_COLORS as Record<string, { bg: string; label: string }>)[k];
                return (
                  <div
                    key={k}
                    className="rounded-lg p-3 border bg-bg-card"
                    style={zoneColor
                      ? { borderColor: zoneColor.bg, background: `${zoneColor.bg}1A` }
                      : undefined}
                  >
                    {zoneColor ? (
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
                        style={{ background: zoneColor.bg }}
                      >
                        {zoneColor.label}
                      </span>
                    ) : (
                      <div className="text-[10px] uppercase tracking-wide text-text-secondary">{k}</div>
                    )}
                    <div
                      className="font-semibold tabular-nums mt-1 text-lg"
                      style={zoneColor ? { color: zoneColor.bg } : undefined}
                    >
                      {String(v)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-border flex items-center justify-between text-xs text-text-secondary">
              <span>{data.total} record(s)</span>
              <span>Generated {new Date(data.generatedAt).toLocaleString()}</span>
            </div>

            {groups && groups.length > 0 ? (
              <div className="divide-y divide-border">
                {groups.map((g) => (
                  <div key={g.key}>
                    <div className="px-4 py-2 bg-bg-input text-sm font-semibold flex items-center justify-between">
                      <span>{g.label}</span>
                      <span className="text-text-secondary text-xs">{g.rows.length}</span>
                    </div>
                    <ReportTable columns={data.columns} rows={g.rows} />
                  </div>
                ))}
              </div>
            ) : allRows.length === 0 ? (
              <div className="p-10 text-center text-text-secondary text-sm">No records match your filters.</div>
            ) : (
              <ReportTable columns={data.columns} rows={allRows} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReportTable({
  columns,
  rows,
}: {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-bg-input/50 text-text-secondary">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className="text-left font-semibold px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border hover:bg-bg-input/40">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 align-top whitespace-nowrap">
                  <Cell column={c} value={r[c.key]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ column, value }: { column: ReportColumn; value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-text-secondary">—</span>;
  }
  const text = String(value);

  // Audit-trail humanization — convert raw codes to plain English. The raw
  // code is preserved as a hover tooltip for anyone who needs to debug or
  // copy the original value, but not shown inline.
  if (column.key === 'action') {
    return <span title={text}>{actionLabel(text)}</span>;
  }
  if (column.key === 'entityType') {
    return <span>{entityLabel(text) || text}</span>;
  }
  if (column.key === 'entityId') {
    // Full UUID is noise; show a short prefix and keep the full value on hover.
    return <span title={text} className="font-mono text-xs">{text.slice(0, 8)}…</span>;
  }
  if (column.key === 'details') {
    const pretty = prettyDetails(text);
    if (!pretty) return <span className="text-text-secondary">—</span>;
    return <span title={text} className="block max-w-[40ch] truncate text-xs">{pretty}</span>;
  }

  if (column.format === 'pill') {
    const color = pillColor(column.key, text);
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap"
        style={{ background: `${color}25`, color }}
      >
        {pillLabel(column.key, text)}
      </span>
    );
  }

  if (column.format === 'datetime') {
    return <span className="font-mono text-xs">{new Date(text).toLocaleString()}</span>;
  }
  if (column.format === 'date') {
    return <span className="font-mono text-xs">{text}</span>;
  }
  if (column.format === 'number') {
    return <span className="font-mono tabular-nums">{text}</span>;
  }
  if (column.key === 'passNumber') {
    return <span className="font-mono">{text}</span>;
  }

  return <span title={text} className="block max-w-[40ch] truncate">{text}</span>;
}

// Human-readable labels for known audit detail keys. Unknown keys fall back
// to a camelCase / snake_case splitter that produces "Sentence case".
const DETAIL_KEY_LABELS: Record<string, string> = {
  passNumber: 'Pass number',
  newPassNumber: 'New pass number',
  newPassId: 'New pass ID',
  newIssueDate: 'New issue date',
  issueDate: 'Issue date',
  expiryDate: 'Expiry date',
  staffId: 'Staff ID',
  staffName: 'Staff',
  airport: 'Airport',
  zone: 'Zone',
  zoneCodes: 'Zones',
  company: 'Company',
  organization: 'Organisation',
  department: 'Department',
  role: 'Role',
  reason: 'Reason',
  notes: 'Notes',
  type: 'Type',
  name: 'Name',
  email: 'Email',
  isActive: 'Active',
  failed: 'Failed',
  imported: 'Imported',
  attempted: 'Attempted',
  rows: 'Rows',
  fileName: 'File',
  mimeType: 'File type',
  handoverUnsignedUrl: 'Unsigned handover',
  handoverSignedUrl: 'Signed handover',
  receiptScanUrl: 'Receipt',
  passScanFrontUrl: 'Front scan',
  passScanBackUrl: 'Back scan',
  dataDeletionScheduledAt: 'Deletion scheduled',
  cancellationRequestedAt: 'Cancellation requested',
  authorityHandoverDate: 'Authority handover',
  custodyStatus: 'Custody',
  status: 'Status',
};

function humanizeDetailKey(k: string): string {
  if (DETAIL_KEY_LABELS[k]) return DETAIL_KEY_LABELS[k];
  const spaced = k
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function humanizeDetailValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.length === 0 ? 'none' : `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'object') return `{${Object.keys(v as object).length} fields}`;
  const s = String(v);
  // Trim URLs / file paths to just the file name
  if (s.startsWith('/') || s.startsWith('http://') || s.startsWith('https://')) {
    const base = s.split('?')[0].split('/').filter(Boolean).pop() ?? s;
    if (UUID_RE.test(base.replace(/\.[a-z0-9]+$/i, ''))) return '(file)';
    return base.length > 24 ? `${base.slice(0, 18)}…` : base;
  }
  // ISO timestamps → date only
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  // UUIDs → short prefix
  if (UUID_RE.test(s)) return `${s.slice(0, 8)}…`;
  // Long strings → truncate
  if (s.length > 32) return `${s.slice(0, 32)}…`;
  return s;
}

/**
 * Flatten an audit-log `details` JSON blob into a compact, plain-English
 * "Label: value" string. The interceptor wraps payloads in `{ body: {...} }`
 * so we unwrap that first. Empty bodies render as a dash.
 */
function prettyDetails(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!parsed || typeof parsed !== 'object') return raw;

  let obj = parsed as Record<string, unknown>;
  if (obj.body && typeof obj.body === 'object' && Object.keys(obj).length === 1) {
    obj = obj.body as Record<string, unknown>;
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) return '';

  return keys
    .map((k) => `${humanizeDetailKey(k)}: ${humanizeDetailValue(obj[k])}`)
    .join(' · ');
}

function pillColor(key: string, value: string): string {
  if (key === 'status' && (STATUS_COLORS as Record<string, { bg: string }>)[value]) {
    return (STATUS_COLORS as Record<string, { bg: string }>)[value].bg;
  }
  if (key === 'custodyStatus' && (CUSTODY_COLORS as Record<string, { bg: string }>)[value]) {
    return (CUSTODY_COLORS as Record<string, { bg: string }>)[value].bg;
  }
  if (key === 'zone' && (ZONE_COLORS as Record<string, { bg: string }>)[value]) {
    return (ZONE_COLORS as Record<string, { bg: string }>)[value].bg;
  }
  if (key === 'overdue') return value === 'Yes' ? '#FC5185' : '#48BB78';
  if (key === 'category') return value.startsWith('Overdue') ? '#FC5185' : '#ED8936';
  if (key === 'isActive') return value === 'Active' ? '#48BB78' : '#9CA3AF';
  if (key === 'bucket') {
    if (value === 'Within 7 days') return '#FC5185';
    if (value === 'Within 15 days') return '#ED8936';
    if (value === 'Within 30 days') return '#ECC94B';
    return '#FC5185';
  }
  return '#4A5568';
}

function pillLabel(key: string, value: string): string {
  if (key === 'status' && (STATUS_COLORS as Record<string, { label: string }>)[value]) {
    return (STATUS_COLORS as Record<string, { label: string }>)[value].label;
  }
  if (key === 'custodyStatus' && (CUSTODY_COLORS as Record<string, { label: string }>)[value]) {
    return (CUSTODY_COLORS as Record<string, { label: string }>)[value].label;
  }
  return value;
}

// ---------------------------------------------------------------------------

function FilterPanel({
  type,
  value,
  onChange,
  onApply,
  onReset,
}: {
  type: ReportType;
  value: FilterState;
  onChange: (v: FilterState) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <section className="bg-bg-card border border-border rounded-xl p-4">
      <header className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold flex items-center gap-2">
          <FilterIcon size={14} className="text-accent-primary" /> Filters
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            className="text-xs px-2 py-1 rounded text-text-secondary hover:bg-bg-input"
          >
            Reset
          </button>
          <button
            onClick={onApply}
            className="text-xs px-3 py-1.5 rounded bg-accent-primary text-white hover:opacity-90"
          >
            Apply
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Search">
          <input
            value={value.q}
            onChange={(e) => set('q', e.target.value)}
            placeholder="Pass #, name, company…"
            className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
          />
        </Field>

        {type === 'staff-history' && (
          <Field label="Staff ID *">
            <input
              value={value.staffId}
              onChange={(e) => set('staffId', e.target.value)}
              placeholder="UUID"
              className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm font-mono"
            />
          </Field>
        )}

        {type === 'subcontractor' && (
          <Field label="Subcontractor Org ID">
            <input
              value={value.subcontractorOrgId}
              onChange={(e) => set('subcontractorOrgId', e.target.value)}
              placeholder="UUID (optional)"
              className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm font-mono"
            />
          </Field>
        )}

        {type === 'audit-trail' && (
          <Field label="Action">
            <input
              value={value.action}
              onChange={(e) => set('action', e.target.value)}
              placeholder="e.g. CUSTODY_DELIVER"
              className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
            />
          </Field>
        )}

        <Field label="From">
          <input
            type="date"
            value={value.from}
            onChange={(e) => set('from', e.target.value)}
            className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={value.to}
            onChange={(e) => set('to', e.target.value)}
            className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
          />
        </Field>

        {(type === 'pass-register' || type === 'expiry' || type === 'custody' || type === 'zone-access') && (
          <>
            <Field label="Airport">
              <select
                value={value.airport}
                onChange={(e) => set('airport', e.target.value)}
                className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="">All</option>
                {['AUH','AAN','SIR','AZI','ZDY','ALL'].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Zone">
              <select
                value={value.zone}
                onChange={(e) => set('zone', e.target.value)}
                className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="">All</option>
                {Object.keys(ZONE_COLORS).map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </Field>
          </>
        )}

        {(type === 'pass-register' || type === 'custody' || type === 'pending-handover') && (
          <Field label="Custody Status">
            <select
              value={value.custodyStatus}
              onChange={(e) => set('custodyStatus', e.target.value)}
              className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              {Object.keys(CUSTODY_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        )}

        <Field label="Company">
          <input
            value={value.company}
            onChange={(e) => set('company', e.target.value)}
            placeholder="Company name contains…"
            className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
          />
        </Field>

        {/* ── New-report filters ────────────────────────────────────────────── */}

        {type === 'vehicles-expiry' && (
          <Field label="Days Ahead">
            <input
              type="number"
              min={1}
              max={365}
              value={value.daysAhead}
              onChange={(e) => set('daysAhead', e.target.value)}
              placeholder="30"
              className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
            />
          </Field>
        )}

        {(type === 'employees-visa-status' || type === 'company-docs-compliance' || type === 'master-expiry') && (
          <Field label="Band Filter">
            <select
              value={value.band}
              onChange={(e) => set('band', e.target.value)}
              className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">All bands</option>
              <option value="expired">Expired</option>
              <option value="7d">Within 7 days</option>
              <option value="14d">Within 14 days</option>
              <option value="30d">Within 30 days</option>
              <option value="expired,7d">Expired + 7d</option>
              <option value="expired,7d,14d,30d">All alertable</option>
            </select>
          </Field>
        )}

        {type === 'company-docs-compliance' && (
          <Field label="Doc Type">
            <select
              value={value.docType}
              onChange={(e) => set('docType', e.target.value)}
              className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">All types</option>
              {['TRADE_LICENSE','ESTABLISHMENT_CARD','CLASSIFICATION','CIVIL_DEFENSE',
                'POWER_OF_ATTORNEY','OFFICE_TENANCY'].map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </Field>
        )}

        {(type === 'vehicles-expiry' || type === 'machinery-compliance' ||
          type === 'employees-visa-status' || type === 'company-docs-compliance' ||
          type === 'master-expiry') && (
          <Field label="Company ID">
            <input
              value={value.companyId}
              onChange={(e) => set('companyId', e.target.value)}
              placeholder="Company cuid (optional)"
              className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm font-mono"
            />
          </Field>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------

function ExportMenu({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (f: 'xlsx' | 'pdf') => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm disabled:opacity-50"
      >
        <Download size={14} /> Export <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-1 w-40 bg-bg-card border border-border rounded-lg shadow-lg z-20 overflow-hidden">
            <button
              onClick={() => { setOpen(false); onSelect('xlsx'); }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-bg-input"
            >
              Excel (.xlsx)
            </button>
            <button
              onClick={() => { setOpen(false); onSelect('pdf'); }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-bg-input"
            >
              PDF (.pdf)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Print view — light-themed standalone HTML
// ---------------------------------------------------------------------------

function buildPrintHtml(report: ReportResult): string {
  const escape = (s: unknown) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const tableHtml = (rows: Record<string, unknown>[]) => `
    <table>
      <thead><tr>${report.columns.map((c) => `<th>${escape(c.label)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map((r) => `<tr>${report.columns.map((c) => `<td>${escape(r[c.key])}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>`;

  const summary = report.summary
    ? `<div class="summary">${Object.entries(report.summary)
        .map(([k, v]) => `<div><span>${escape(k)}</span><strong>${escape(v)}</strong></div>`)
        .join('')}</div>`
    : '';

  const filters = report.filters && Object.keys(report.filters).length > 0
    ? `<div class="filters">Filters: ${Object.entries(report.filters)
        .map(([k, v]) => `<span><b>${escape(k)}</b>: ${escape(v)}</span>`).join(' • ')}</div>`
    : '';

  const body = report.groups && report.groups.length > 0
    ? report.groups.map((g) => `<h2>${escape(g.label)} <span class="muted">(${g.rows.length})</span></h2>${tableHtml(g.rows)}`).join('')
    : tableHtml(report.rows);

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(report.title)}</title>
    <style>
      body { font: 12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color: #111; padding: 18px; background:#fff; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      h2 { font-size: 13px; margin: 14px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #00D4AA; }
      .muted { color:#888; font-weight: normal; }
      .meta { color:#666; font-size: 11px; margin-bottom: 10px; }
      .summary { display:flex; gap:8px; flex-wrap:wrap; margin: 8px 0 14px; }
      .summary div { background:#f4f4f5; border-radius:4px; padding:6px 10px; font-size:11px; display:flex; flex-direction:column; }
      .summary span { color:#666; text-transform:uppercase; letter-spacing:.04em; font-size:9px; }
      .summary strong { font-size:13px; }
      .filters { font-size:11px; color:#333; padding:6px 8px; background:#fafafa; border-radius:4px; margin-bottom:10px; }
      table { width:100%; border-collapse:collapse; margin: 4px 0 14px; }
      th { background:#1F2937; color:#fff; text-align:left; padding:6px 8px; font-size:10px; }
      td { padding:5px 8px; border-bottom:1px solid #e5e7eb; font-size:10px; vertical-align: top; }
      tr:nth-child(even) td { background:#fafafa; }
      @media print { body { padding: 0; } }
    </style>
    </head><body>
      <h1>${escape(report.title)}</h1>
      <div class="meta">Generated ${new Date(report.generatedAt).toLocaleString()} • ${report.total} record(s)</div>
      ${filters}
      ${summary}
      ${body}
    </body></html>`;
}
