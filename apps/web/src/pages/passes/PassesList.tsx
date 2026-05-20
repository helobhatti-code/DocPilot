import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Filter, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Column, DataTable } from '@/components/DataTable';
import { AirportBadge, CustodyBadge, StatusBadge, ZoneList } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { FilterPanel } from '@/components/FilterPanel';
import { Modal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { AIRPORTS, ZONE_ORDER, ZONE_COLORS, STATUS_COLORS, CUSTODY_COLORS } from '@/lib/constants';
import {
  AirportCode, CustodyStatus, GatePass, GatePassStatus, Paginated, ZoneCode,
} from '@/lib/types';

interface BulkBlocked { passId: string; reason: string }
interface BulkRenewalResult { submitted: string[]; blocked: BulkBlocked[] }
interface BulkCancellationResult { cancelled: string[]; blocked: BulkBlocked[] }
interface BulkCustodyResult { updated: string[]; blocked: BulkBlocked[] }
type BulkOp = 'renewal' | 'cancellation' | 'custody' | null;

interface Filters {
  q?: string;
  status?: GatePassStatus[];
  zone?: ZoneCode;
  airport?: AirportCode;
  company?: string;
  custodyStatus?: CustodyStatus;
  expiryFrom?: string;
  expiryTo?: string;
  pendingHandover?: boolean;
}

export default function PassesList() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  // Read every supported filter from the URL on mount so deep-links from the
  // dashboard KPI cards (e.g. /passes?status=EXPIRY_30&status=EXPIRY_15&...)
  // and shareable filtered views actually apply.
  const [filters, setFilters] = useState<Filters>(() => {
    const statusList = params.getAll('status').filter(Boolean) as GatePassStatus[];
    return {
      q:               params.get('q') ?? undefined,
      status:          statusList.length ? statusList : undefined,
      zone:            (params.get('zone') as ZoneCode | null) ?? undefined,
      airport:         (params.get('airport') as AirportCode | null) ?? undefined,
      company:         params.get('company') ?? undefined,
      custodyStatus:   (params.get('custodyStatus') as CustodyStatus | null) ?? undefined,
      expiryFrom:      params.get('expiryFrom') ?? undefined,
      expiryTo:        params.get('expiryTo') ?? undefined,
      pendingHandover: params.get('pendingHandover') === 'true' ? true : undefined,
    };
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 'N' shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA')) return;
      if (e.key === 'n' || e.key === 'N') nav('/passes/new');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nav]);

  const queryParams = useMemo(() => {
    const p: Record<string, unknown> = { page, pageSize };
    if (filters.q) p.q = filters.q;
    if (filters.status?.length) p.status = filters.status;
    if (filters.zone) p.zone = filters.zone;
    if (filters.airport) p.airport = filters.airport;
    if (filters.company) p.company = filters.company;
    if (filters.custodyStatus) p.custodyStatus = filters.custodyStatus;
    if (filters.expiryFrom) p.expiryFrom = filters.expiryFrom;
    if (filters.expiryTo) p.expiryTo = filters.expiryTo;
    if (filters.pendingHandover) p.pendingHandover = true;
    return p;
  }, [filters, page, pageSize]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['gate-passes', queryParams],
    queryFn: async () => (await api.get('/gate-passes', { params: queryParams })).data as Paginated<GatePass>,
    retry: 2,
    retryDelay: (attempt) => Math.min(3000 * 2 ** attempt, 15000), // 3s, 6s
  });

  const rows = data?.items ?? [];

  const cols: Column<GatePass>[] = [
    { key: 'passNumber', header: 'Pass #', render: (r) => <span className="font-mono">{r.passNumber}</span> },
    { key: 'staff', header: 'Staff', render: (r) => (
      <div className="flex items-center gap-2">
        {r.staff.photoUrl
          ? <img src={r.staff.photoUrl} className="w-7 h-7 rounded-full object-cover" alt="" />
          : <div className="w-7 h-7 rounded-full bg-bg-input grid place-items-center text-xs">{r.staff.name.charAt(0)}</div>}
        <div>
          <div>{r.staff.name}</div>
          <div className="text-xs text-text-secondary">{r.staff.designation ?? ''}</div>
        </div>
      </div>
    )},
    { key: 'company', header: 'Company', render: (r) => r.staff.companyName ?? r.organization ?? '—' },
    { key: 'airport', header: 'Airport', render: (r) => <AirportBadge code={r.airport} /> },
    { key: 'zones', header: 'Zones', render: (r) => <ZoneList codes={r.zones.map((z) => z.zoneCode)} /> },
    { key: 'issue', header: 'Issued', render: (r) => r.issueDate.slice(0, 10) },
    { key: 'expiry', header: 'Expiry', render: (r) => r.expiryDate.slice(0, 10) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'custody', header: 'Custody', render: (r) => <CustodyBadge status={r.custodyStatus} /> },
  ];

  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Gate Passes</h1>
          <p className="text-sm text-text-secondary">Search, filter, and manage all passes.</p>
        </div>
        <button
          onClick={() => nav('/passes/new')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-primary text-white text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} /> New Pass
        </button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
          <input
            value={filters.q ?? ''}
            onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); setParams({ q: e.target.value }); }}
            placeholder="Search by pass #, staff, company, department…"
            className="w-full pl-10 pr-3 py-2 bg-bg-input border border-border rounded-lg outline-none focus:border-accent-primary"
          />
        </div>
        <button
          onClick={() => setFilterOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-bg-card hover:bg-bg-input text-sm"
        >
          <Filter size={16} /> Filters
        </button>
      </div>

      {isError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-bg-card border border-border rounded-xl">
          <div className="text-4xl">⚠️</div>
          <div className="text-center">
            <p className="font-semibold">Could not load passes</p>
            <p className="text-text-secondary text-sm mt-1">The server may be starting up on the free tier. Please wait a moment and try again.</p>
          </div>
          <button onClick={() => refetch()} className="px-4 py-2 rounded-lg bg-brand-orange text-white text-sm font-semibold hover:bg-brand-orange-dark transition-colors">
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-brand-orange border-t-transparent animate-spin" />
          <p className="text-text-secondary text-sm">Loading passes…</p>
          <p className="text-text-secondary text-xs">Server may be waking up — this can take up to 50 seconds on the free tier.</p>
        </div>
      ) : !isLoading && total === 0 && !filters.q ? (
        <EmptyState
          icon={BadgeCheck}
          title="No gate passes yet"
          description="Create your first pass to start tracking access for staff."
          action={
            <button onClick={() => nav('/passes/new')} className="px-4 py-2 rounded-lg bg-accent-primary text-white text-sm">
              Create your first pass
            </button>
          }
        />
      ) : (
        <>
          <DataTable
            columns={cols}
            rows={rows}
            rowKey={(r) => r.id}
            selectable
            selectedIds={selected}
            onSelect={(id, c) => { const next = new Set(selected); c ? next.add(id) : next.delete(id); setSelected(next); }}
            onSelectAll={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())}
            onRowClick={(r) => nav(`/passes/${r.id}`)}
            loading={isLoading}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPage={setPage}
            onPageSize={(s) => { setPageSize(s); setPage(1); }}
          />
        </>
      )}

      {selected.size > 0 && (
        <BulkActionBar
          selected={selected}
          onClear={() => setSelected(new Set())}
        />
      )}

      <FilterPanel
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        footer={
          <>
            <button onClick={() => { setFilters({ q: filters.q }); setPage(1); }} className="px-3 py-1.5 rounded-lg border border-border text-sm">
              Reset
            </button>
            <button onClick={() => setFilterOpen(false)} className="px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm">
              Apply
            </button>
          </>
        }
      >
        <FilterGroup label="Status">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_COLORS) as GatePassStatus[]).map((s) => {
              const checked = filters.status?.includes(s) ?? false;
              return (
                <label key={s} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const set = new Set(filters.status ?? []);
                      e.target.checked ? set.add(s) : set.delete(s);
                      setFilters({ ...filters, status: Array.from(set) });
                    }}
                    className="accent-accent-primary"
                  />
                  <span className="px-2 py-0.5 rounded text-white" style={{ background: STATUS_COLORS[s].bg }}>{STATUS_COLORS[s].label}</span>
                </label>
              );
            })}
          </div>
        </FilterGroup>

        <FilterGroup label="Airport">
          <select
            value={filters.airport ?? ''}
            onChange={(e) => setFilters({ ...filters, airport: (e.target.value || undefined) as AirportCode | undefined })}
            className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="">Any</option>
            {AIRPORTS.map((a) => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
          </select>
        </FilterGroup>

        <FilterGroup label="Zone">
          <div className="flex flex-wrap gap-1.5">
            {ZONE_ORDER.map((z) => {
              const active = filters.zone === z;
              return (
                <button
                  key={z}
                  onClick={() => setFilters({ ...filters, zone: active ? undefined : z })}
                  className="px-2 py-1 rounded text-xs text-white"
                  style={{ background: ZONE_COLORS[z].bg, opacity: active ? 1 : 0.6 }}
                >
                  {ZONE_COLORS[z].label}
                </button>
              );
            })}
          </div>
        </FilterGroup>

        <FilterGroup label="Company">
          <input
            value={filters.company ?? ''}
            onChange={(e) => setFilters({ ...filters, company: e.target.value || undefined })}
            className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
          />
        </FilterGroup>

        <FilterGroup label="Custody status">
          <select
            value={filters.custodyStatus ?? ''}
            onChange={(e) => setFilters({ ...filters, custodyStatus: (e.target.value || undefined) as CustodyStatus | undefined })}
            className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="">Any</option>
            {(Object.keys(CUSTODY_COLORS) as CustodyStatus[]).map((c) => (
              <option key={c} value={c}>{CUSTODY_COLORS[c].label}</option>
            ))}
          </select>
        </FilterGroup>

        <FilterGroup label="Expiry range">
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={filters.expiryFrom ?? ''} onChange={(e) => setFilters({ ...filters, expiryFrom: e.target.value || undefined })}
              className="bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm" />
            <input type="date" value={filters.expiryTo ?? ''} onChange={(e) => setFilters({ ...filters, expiryTo: e.target.value || undefined })}
              className="bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm" />
          </div>
        </FilterGroup>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.pendingHandover ?? false}
            onChange={(e) => setFilters({ ...filters, pendingHandover: e.target.checked })}
            className="accent-accent-primary"
          />
          Pending authority handover only
        </label>
      </FilterPanel>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-text-secondary mb-1.5">{label}</div>
      {children}
    </div>
  );
}

// ----- bulk action bar + modals -----

function BulkActionBar({ selected, onClear }: { selected: Set<string>; onClear: () => void }) {
  const qc = useQueryClient();
  const [op, setOp] = useState<BulkOp>(null);
  const ids = Array.from(selected);

  const renewal = useMutation({
    mutationFn: async () =>
      (await api.post('/gate-passes/bulk/renewal', { passIds: ids })).data as BulkRenewalResult,
    onSuccess: (res) => {
      reportBulkResult({
        success: res.submitted.length,
        blocked: res.blocked,
        successLabel: 'submitted for renewal',
      });
      qc.invalidateQueries({ queryKey: ['gate-passes'] });
      qc.invalidateQueries({ queryKey: ['renewals-queue'] });
      onClear();
      setOp(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Bulk renewal failed'),
  });

  const cancellation = useMutation({
    mutationFn: async (reason: string) =>
      (await api.post('/gate-passes/bulk/cancellation', { passIds: ids, reason })).data as BulkCancellationResult,
    onSuccess: (res) => {
      reportBulkResult({
        success: res.cancelled.length,
        blocked: res.blocked,
        successLabel: 'queued for cancellation',
      });
      qc.invalidateQueries({ queryKey: ['gate-passes'] });
      qc.invalidateQueries({ queryKey: ['cancellations-queue'] });
      onClear();
      setOp(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Bulk cancellation failed'),
  });

  const custody = useMutation({
    mutationFn: async (custodyStatus: CustodyStatus) =>
      (await api.post('/gate-passes/bulk/custody', { passIds: ids, custodyStatus })).data as BulkCustodyResult,
    onSuccess: (res) => {
      reportBulkResult({
        success: res.updated.length,
        blocked: res.blocked,
        successLabel: 'custody updated',
      });
      qc.invalidateQueries({ queryKey: ['gate-passes'] });
      onClear();
      setOp(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Bulk custody failed'),
  });

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 bg-bg-card border border-border rounded-xl shadow-xl px-4 py-3 flex items-center gap-3">
        <span className="text-sm">{selected.size} selected</span>
        <button onClick={() => setOp('renewal')} className="px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm">
          Bulk Renewal
        </button>
        <button onClick={() => setOp('cancellation')} className="px-3 py-1.5 rounded-lg bg-status-expired text-white text-sm">
          Bulk Cancel
        </button>
        <button onClick={() => setOp('custody')} className="px-3 py-1.5 rounded-lg border border-border text-sm">
          Bulk Custody
        </button>
        <button onClick={onClear} className="px-2 py-1.5 text-sm text-text-secondary">Clear</button>
      </div>

      <BulkRenewalModal
        open={op === 'renewal'}
        count={selected.size}
        onClose={() => setOp(null)}
        onConfirm={() => renewal.mutate()}
        pending={renewal.isPending}
      />
      <BulkCancellationModal
        open={op === 'cancellation'}
        count={selected.size}
        onClose={() => setOp(null)}
        onConfirm={(reason) => cancellation.mutate(reason)}
        pending={cancellation.isPending}
      />
      <BulkCustodyModal
        open={op === 'custody'}
        count={selected.size}
        onClose={() => setOp(null)}
        onConfirm={(status) => custody.mutate(status)}
        pending={custody.isPending}
      />
    </>
  );
}

function reportBulkResult({
  success, blocked, successLabel,
}: { success: number; blocked: BulkBlocked[]; successLabel: string }) {
  if (success > 0 && blocked.length === 0) {
    toast.success(`${success} pass${success === 1 ? '' : 'es'} ${successLabel}`);
    return;
  }
  if (success > 0 && blocked.length > 0) {
    toast(`${success} ${successLabel}, ${blocked.length} skipped`, { icon: '⚠' });
    return;
  }
  toast.error(`All ${blocked.length} skipped — first reason: ${blocked[0]?.reason ?? 'unknown'}`);
}

function BulkRenewalModal({
  open, count, onClose, onConfirm, pending,
}: { open: boolean; count: number; onClose: () => void; onConfirm: () => void; pending: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Submit renewal for ${count} pass${count === 1 ? '' : 'es'}`}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-border text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm disabled:opacity-50"
          >
            {pending ? 'Submitting…' : 'Submit Renewals'}
          </button>
        </>
      }
    >
      <p className="text-sm text-text-secondary">
        Each pass must be within 7 days of expiry. Passes outside the renewal window will be skipped and listed in the result.
      </p>
    </Modal>
  );
}

function BulkCancellationModal({
  open, count, onClose, onConfirm, pending,
}: { open: boolean; count: number; onClose: () => void; onConfirm: (reason: string) => void; pending: boolean }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ reason: string }>();
  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={`Request cancellation for ${count} pass${count === 1 ? '' : 'es'}`}
      footer={
        <>
          <button onClick={() => { reset(); onClose(); }} className="px-3 py-1.5 rounded-lg border border-border text-sm">Cancel</button>
          <button
            onClick={handleSubmit((v) => { onConfirm(v.reason); reset(); })}
            disabled={pending}
            className="px-3 py-1.5 rounded-lg bg-status-expired text-white text-sm disabled:opacity-50"
          >
            {pending ? 'Working…' : 'Request Cancellation'}
          </button>
        </>
      }
    >
      <div className="space-y-2 text-sm">
        <p className="text-text-secondary">
          Passes that are already cancelled, requested for cancellation, or renewed will be skipped.
        </p>
        <label className="block text-text-secondary">Reason (required, applied to all)</label>
        <textarea
          {...register('reason', { required: true, minLength: 3 })}
          rows={3}
          className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 outline-none focus:border-accent-primary"
        />
        {errors.reason && <p className="text-xs text-status-expired">A reason of at least 3 characters is required.</p>}
      </div>
    </Modal>
  );
}

function BulkCustodyModal({
  open, count, onClose, onConfirm, pending,
}: { open: boolean; count: number; onClose: () => void; onConfirm: (s: CustodyStatus) => void; pending: boolean }) {
  const [status, setStatus] = useState<CustodyStatus>('WITH_PERSON');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Update custody for ${count} pass${count === 1 ? '' : 'es'}`}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-border text-sm">Cancel</button>
          <button
            onClick={() => onConfirm(status)}
            disabled={pending}
            className="px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm disabled:opacity-50"
          >
            {pending ? 'Updating…' : 'Update Custody'}
          </button>
        </>
      }
    >
      <div className="space-y-2 text-sm">
        <label className="block text-text-secondary">New custody status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as CustodyStatus)}
          className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5"
        >
          <option value="WITH_COMPANY">With Company</option>
          <option value="WITH_PERSON">With Person</option>
          <option value="RETURNED_TO_COMPANY">Returned to Company</option>
        </select>
        <p className="text-xs text-text-secondary">
          Authority handover requires per-pass officer/reference data and isn't available in bulk.
        </p>
      </div>
    </Modal>
  );
}
