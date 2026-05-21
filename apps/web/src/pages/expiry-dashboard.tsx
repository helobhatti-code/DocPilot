import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Timer,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Column, DataTable } from '@/components/DataTable';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { bandStyle } from '@/lib/expiryBand';
import type { ExpiryBand, ExpiryItem, ExpirySummary, Paginated } from '@/lib/types';

// ─── Deep-link helper ─────────────────────────────────────────────────────────

function getEditUrl(source: string, sourceId: string): string {
  switch (source) {
    case 'gate_pass':        return `/passes/${sourceId}`;
    case 'vehicle':          return `/vehicles/${sourceId}/edit`;
    case 'machinery':        return `/machinery/${sourceId}/edit`;
    case 'employee':         return `/employees/${sourceId}/edit`;
    case 'company_document': return `/company-documents/${sourceId}/edit`;
    default: return '/';
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  gate_pass:        'Gate Pass',
  vehicle:          'Vehicle',
  machinery:        'Machinery',
  employee:         'Employee',
  company_document: 'Company Doc',
};

const SOURCE_COLORS: Record<string, string> = {
  gate_pass:        '#2D7DD2',
  vehicle:          '#F47316',
  machinery:        '#ECC94B',
  employee:         '#48BB78',
  company_document: '#A78BFA',
};

const BAND_LABELS: Record<string, string> = {
  expired: 'Expired',
  '7d':    'Within 7 Days',
  '14d':   'Within 14 Days',
  '30d':   'Within 30 Days',
};

const ALL_SOURCES = Object.keys(SOURCE_LABELS);
const ALL_BANDS   = ['expired', '7d', '14d', '30d'] as const;

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, loading, accent, icon: Icon, onClick,
}: {
  label: string; value: number; loading?: boolean;
  accent: string; icon: typeof Clock; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-bg-card border border-border rounded-xl p-4 hover:border-white/20 transition-all"
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0"
          style={{ background: `${accent}22`, color: accent }}
        >
          <Icon size={18} />
        </div>
        <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary leading-tight">
          {label}
        </div>
      </div>
      <div className="text-3xl font-bold tabular-nums" style={{ color: accent }}>
        {loading ? '–' : value.toLocaleString()}
      </div>
      <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full w-full rounded-full opacity-60"
          style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      </div>
    </button>
  );
}

// ─── Band chip ────────────────────────────────────────────────────────────────

function BandChip({ band }: { band?: ExpiryBand | null }) {
  const { bg, text, label } = bandStyle(band ?? null);
  return (
    <span className={clsx('inline-flex px-2 py-0.5 rounded text-[11px] font-semibold', bg, text)}>
      {label}
    </span>
  );
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const color = SOURCE_COLORS[source] ?? '#888';
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold"
      style={{ background: `${color}22`, color }}
    >
      {SOURCE_LABELS[source] ?? source}
    </span>
  );
}

// ─── Stacked bar chart ────────────────────────────────────────────────────────

function ExpiryByModuleChart({ summary }: { summary?: ExpirySummary }) {
  if (!summary) return null;


  // We need per-band, per-source breakdown — but summary only has totals by band and source.
  // Since we only have aggregated totals from /expiry/summary, show a horizontal bar
  // with totals per source stacked together (we can't cross-break without additional query).
  // Instead, show byBand as the X axis and sources as stacked segments using bySource proportions.
  const totalByBand: Record<string, number> = {
    expired: summary.byBand.expired,
    '7d':    summary.byBand['7d'],
    '14d':   summary.byBand['14d'],
    '30d':   summary.byBand['30d'],
  };

  // Flatten: one bar per band, total count
  const barData = ALL_BANDS.map((band) => ({
    band: BAND_LABELS[band],
    count: totalByBand[band] ?? 0,
  }));

  const BAND_COLORS: Record<string, string> = {
    'Expired':        '#FC5185',
    'Within 7 Days':  '#F47316',
    'Within 14 Days': '#ECC94B',
    'Within 30 Days': '#2D7DD2',
  };

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <div className="font-semibold text-sm mb-1">Expiries by Band</div>
      <div className="text-xs text-text-secondary mb-4">All modules — total items per urgency band</div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} layout="vertical" margin={{ left: 12, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" stroke="var(--text-secondary)" fontSize={11} allowDecimals={false} />
            <YAxis type="category" dataKey="band" stroke="var(--text-secondary)" fontSize={11} width={100} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {barData.map((entry, i) => (
                <Cell key={i} fill={BAND_COLORS[entry.band] ?? '#888'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Module breakdown chart ───────────────────────────────────────────────────

function ExpiryBySourceChart({ summary }: { summary?: ExpirySummary }) {
  if (!summary) return null;
  const data = ALL_SOURCES.map((src) => ({
    source: SOURCE_LABELS[src] ?? src,
    count:  (summary.bySource as Record<string, number>)[src] ?? 0,
  })).filter((d) => d.count > 0);

  if (data.length === 0) return null;

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <div className="font-semibold text-sm mb-1">Expiries by Module</div>
      <div className="text-xs text-text-secondary mb-4">Total alertable items per data module</div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="source" stroke="var(--text-secondary)" fontSize={11} />
            <YAxis stroke="var(--text-secondary)" fontSize={11} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => {
                const src = ALL_SOURCES.find((s) => SOURCE_LABELS[s] === entry.source) ?? '';
                return <Cell key={i} fill={SOURCE_COLORS[src] ?? '#888'} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExpiryDashboard() {
  const nav = useNavigate();

  const [activeSources, setActiveSources] = useState<Set<string>>(new Set(ALL_SOURCES));
  const [activeBands,   setActiveBands]   = useState<Set<string>>(new Set(ALL_BANDS));
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const toggleSource = (src: string) =>
    setActiveSources((prev) => {
      const next = new Set(prev);
      next.has(src) ? next.delete(src) : next.add(src);
      return next;
    });

  const toggleBand = (band: string) =>
    setActiveBands((prev) => {
      const next = new Set(prev);
      next.has(band) ? next.delete(band) : next.add(band);
      return next;
    });

  // Build query params
  const bandsStr   = [...activeBands].join(',');
  const sourcesStr = [...activeSources].join(',');

  const listParams: Record<string, unknown> = { page, pageSize };
  if (bandsStr)   listParams.band   = bandsStr;
  if (sourcesStr) listParams.source = activeSources.size < ALL_SOURCES.length ? [...activeSources][0] : undefined;

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary, dataUpdatedAt } = useQuery({
    queryKey: ['expiry-summary'],
    queryFn: async () => (await api.get('/expiry/summary')).data as ExpirySummary,
    refetchInterval: 5 * 60_000,
  });

  const { data: listData, isLoading: listLoading, refetch: refetchList } = useQuery({
    queryKey: ['expiry-list', listParams],
    queryFn: async () => (await api.get('/expiry', { params: listParams })).data as Paginated<ExpiryItem>,
    placeholderData: (prev) => prev,
  });

  const refresh = () => { void refetchSummary(); void refetchList(); };
  const items   = listData?.items ?? [];
  const lastRefreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : '–';

  const columns: Column<ExpiryItem>[] = [
    {
      key: 'module', header: 'Module', width: '120px',
      render: (r) => <SourceBadge source={r.source} />,
    },
    {
      key: 'display_name', header: 'Display Name',
      render: (r) => <span className="text-sm font-medium">{r.display_name}</span>,
    },
    {
      key: 'doc_kind', header: 'Doc Kind',
      render: (r) => <span className="text-xs font-mono">{r.doc_kind}</span>,
    },
    {
      key: 'expiry_date', header: 'Expiry Date',
      render: (r) => <span className="text-xs font-mono">{String(r.expiry_date).slice(0, 10)}</span>,
    },
    {
      key: 'days', header: 'Days',
      render: (r) => (
        <span className={clsx(
          'text-sm font-mono font-bold tabular-nums',
          r.days_until_expiry < 0 ? 'text-rose-500' : r.days_until_expiry <= 7 ? 'text-orange-400' : 'text-text-primary',
        )}>
          {r.days_until_expiry}
        </span>
      ),
    },
    {
      key: 'band', header: 'Band',
      render: (r) => <BandChip band={r.band} />,
    },
    {
      key: 'action', header: '', width: '60px',
      render: (r) => (
        <Link
          to={getEditUrl(r.source, r.source_id)}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-bg-input hover:bg-brand-orange/10 text-text-secondary hover:text-brand-orange transition-colors"
        >
          <ExternalLink size={12} /> View
        </Link>
      ),
    },
  ];

  const s = summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert size={22} className="text-brand-orange" />
            Expiry Dashboard
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            All expiring items across passes, vehicles, machinery, employees, and company documents.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-secondary">Last refreshed: {lastRefreshed}</span>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={AlertTriangle}  label="Expired"
          value={s?.byBand.expired ?? 0} loading={summaryLoading}
          accent="#FC5185"
          onClick={() => setActiveBands(new Set(['expired']))}
        />
        <KpiCard
          icon={ShieldAlert}    label="Expiring in 7 Days"
          value={s?.byBand['7d'] ?? 0} loading={summaryLoading}
          accent="#F47316"
          onClick={() => setActiveBands(new Set(['7d']))}
        />
        <KpiCard
          icon={Timer}          label="Expiring in 14 Days"
          value={s?.byBand['14d'] ?? 0} loading={summaryLoading}
          accent="#ECC94B"
          onClick={() => setActiveBands(new Set(['14d']))}
        />
        <KpiCard
          icon={Clock}          label="Expiring in 30 Days"
          value={s?.byBand['30d'] ?? 0} loading={summaryLoading}
          accent="#2D7DD2"
          onClick={() => setActiveBands(new Set(['30d']))}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExpiryByModuleChart summary={summary} />
        <ExpiryBySourceChart summary={summary} />
      </div>

      {/* Filter chips */}
      <div className="bg-bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
          Filter by Module
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_SOURCES.map((src) => {
            const active = activeSources.has(src);
            const color  = SOURCE_COLORS[src];
            return (
              <button
                key={src}
                onClick={() => { toggleSource(src); setPage(1); }}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border transition-all"
                style={active
                  ? { background: `${color}22`, color, borderColor: color }
                  : { background: 'transparent', color: 'var(--text-secondary)', borderColor: 'var(--border)' }
                }
              >
                {SOURCE_LABELS[src]}
              </button>
            );
          })}
        </div>

        <div className="text-xs font-semibold uppercase tracking-widest text-text-secondary mt-1">
          Filter by Band
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_BANDS.map((band) => {
            const active = activeBands.has(band);
            const { bg, text, label } = bandStyle(band as ExpiryBand);
            return (
              <button
                key={band}
                onClick={() => { toggleBand(band); setPage(1); }}
                className={clsx(
                  'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border transition-all',
                  active ? `${bg} ${text} border-transparent` : 'border-border text-text-secondary',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <DataTable<ExpiryItem>
        columns={columns}
        rows={items}
        rowKey={(r) => `${r.source}_${r.source_id}_${r.doc_kind}`}
        loading={listLoading}
        onRowClick={(r) => nav(getEditUrl(r.source, r.source_id))}
      />

      {/* Pagination */}
      {(listData?.total ?? 0) > pageSize && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={listData?.total ?? 0}
          onPage={setPage}
          onPageSize={() => {}}
        />
      )}
    </div>
  );
}
