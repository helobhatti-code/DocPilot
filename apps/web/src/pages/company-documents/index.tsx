import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Filter,
  Plus,
  FileText,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Column, DataTable } from '@/components/DataTable';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { bandStyle } from '@/lib/expiryBand';
import type {
  CompanyDocument,
  CompanyDocType,
  DocStatus,
  ExpiryBand,
  Paginated,
} from '@/lib/types';
import toast from 'react-hot-toast';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { key: CompanyDocType; label: string }[] = [
  { key: 'TRADE_LICENSE',     label: 'Trade License'      },
  { key: 'ESTABLISHMENT_CARD', label: 'Establishment Card' },
  { key: 'CLASSIFICATION',    label: 'Classification'     },
  { key: 'CIVIL_DEFENSE',     label: 'Civil Defense'      },
  { key: 'POWER_OF_ATTORNEY', label: 'Power of Attorney'  },
  { key: 'OFFICE_TENANCY',    label: 'Office Tenancy'     },
];

const STATUS_CHIP: Record<DocStatus, { bg: string; text: string; label: string }> = {
  VALID:          { bg: 'bg-emerald-400/10', text: 'text-emerald-400', label: 'Valid'          },
  EXPIRING_SOON:  { bg: 'bg-yellow-400/10',  text: 'text-yellow-400',  label: 'Expiring Soon'  },
  EXPIRED:        { bg: 'bg-rose-500/10',    text: 'text-rose-500',    label: 'Expired'        },
  UNDER_RENEWAL:  { bg: 'bg-sky-400/10',     text: 'text-sky-400',     label: 'Under Renewal'  },
};

const EXPIRY_BANDS: { key: string; label: string }[] = [
  { key: 'valid',   label: 'Valid (>30d)'    },
  { key: '30d',     label: 'Within 30 days'  },
  { key: '14d',     label: 'Within 14 days'  },
  { key: '7d',      label: 'Within 7 days'   },
  { key: 'expired', label: 'Expired'         },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusChip({ status }: { status: DocStatus }) {
  const s = STATUS_CHIP[status] ?? STATUS_CHIP.VALID;
  return (
    <span className={clsx('inline-flex px-2 py-0.5 rounded text-[11px] font-semibold', s.bg, s.text)}>
      {s.label}
    </span>
  );
}

function ExpiryCell({ date, band }: { date: string; band?: ExpiryBand | null }) {
  const { bg, text, label } = bandStyle(band ?? null);
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-mono">{date.slice(0, 10)}</div>
      <span className={clsx('inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold', bg, text)}>
        {label}
      </span>
    </div>
  );
}

function AttachmentLink({ url, label }: { url?: string | null; label: string }) {
  if (!url) return <span className="text-text-secondary text-xs">—</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="text-accent-blue hover:underline text-xs">
      {label}
    </a>
  );
}

// ─── Filter drawer ────────────────────────────────────────────────────────────

function FilterDrawer({
  open,
  status,
  expiryBand,
  onStatus,
  onBand,
  onClose,
}: {
  open: boolean;
  status: DocStatus | '';
  expiryBand: string;
  onStatus: (v: DocStatus | '') => void;
  onBand: (v: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-72 bg-bg-card border-l border-border p-5 flex flex-col gap-5 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Filters</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest text-text-secondary mb-2">Status</label>
          <select
            value={status}
            onChange={(e) => onStatus(e.target.value as DocStatus | '')}
            className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:border-brand-orange"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_CHIP).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest text-text-secondary mb-2">Expiry Band</label>
          <select
            value={expiryBand}
            onChange={(e) => onBand(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:border-brand-orange"
          >
            <option value="">All bands</option>
            {EXPIRY_BANDS.map((b) => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => { onStatus(''); onBand(''); onClose(); }}
          className="mt-auto text-sm text-text-secondary hover:text-text-primary underline underline-offset-2"
        >
          Clear all filters
        </button>
      </aside>
    </div>
  );
}

// ─── Columns builder ──────────────────────────────────────────────────────────

function buildColumns(
  activeTab: CompanyDocType,
  onEdit: (d: CompanyDocument) => void,
  index: (d: CompanyDocument) => number,
): Column<CompanyDocument>[] {
  const base: Column<CompanyDocument>[] = [
    {
      key: 'sn', header: 'S/N', width: '40px',
      render: (d) => <span className="text-text-secondary text-xs">{index(d)}</span>,
    },
    {
      key: 'docName', header: 'Doc Name',
      render: (d) => <span className="font-medium text-sm">{d.docName}</span>,
    },
    {
      key: 'docNumber', header: 'Doc Number',
      render: (d) => <span className="text-xs font-mono">{d.docNumber ?? '—'}</span>,
    },
    {
      key: 'view', header: 'View',
      render: (d) => <AttachmentLink url={d.attachmentId} label="View" />,
    },
    {
      key: 'expiryDate', header: 'Exp Date',
      render: (d) => <ExpiryCell date={d.expiryDate} band={d.expiryBand} />,
    },
    {
      key: 'status', header: 'Status',
      render: (d) => <StatusChip status={d.status} />,
    },
    {
      key: 'edit', header: '', width: '60px',
      render: (d) => (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(d); }}
          className="text-xs px-2 py-1 rounded bg-bg-input hover:bg-brand-orange/10 text-text-secondary hover:text-brand-orange transition-colors"
        >
          Edit
        </button>
      ),
    },
  ];

  if (activeTab === 'CIVIL_DEFENSE') {
    const meta = (d: CompanyDocument) => (d.metadata ?? {}) as Record<string, string>;
    base.splice(4, 0,
      {
        key: 'hassantukNo', header: 'Hassantuk Cert No.',
        render: (d) => <span className="text-xs font-mono">{meta(d).hassantukCertificateNo ?? '—'}</span>,
      },
      {
        key: 'viewHassantuk', header: 'View Hassantuk',
        render: (d) => <AttachmentLink url={d.attachmentId} label="View" />,
      },
      {
        key: 'hassantukExp', header: 'Hassantuk Exp Date',
        render: (d) => (
          meta(d).hassantukExpiryDate
            ? <ExpiryCell date={meta(d).hassantukExpiryDate} band={d.hassantukExpiryBand} />
            : <span className="text-text-secondary text-xs">—</span>
        ),
      },
    );
  }

  if (activeTab === 'POWER_OF_ATTORNEY') {
    const meta = (d: CompanyDocument) => (d.metadata ?? {}) as Record<string, unknown>;
    base.splice(3, 0,
      {
        key: 'attorneyType', header: 'Attorney Type',
        render: (d) => (
          <span className={clsx(
            'inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold',
            (meta(d).attorneyType as string) === 'LIMITED'
              ? 'bg-indigo-400/10 text-indigo-400'
              : 'bg-purple-400/10 text-purple-400',
          )}>
            {(meta(d).attorneyType as string) ?? '—'}
          </span>
        ),
      },
      {
        key: 'parties', header: 'Parties',
        render: (d) => {
          const parties = (meta(d).parties ?? []) as { name: string }[];
          return (
            <span className="text-xs">{parties.map((p) => p.name).join(', ') || '—'}</span>
          );
        },
      },
    );
  }

  if (activeTab === 'OFFICE_TENANCY') {
    base.splice(3, 0, {
      key: 'viewTenancy', header: 'View Tenancy Contract',
      render: (d) => <AttachmentLink url={d.attachmentId} label="View Contract" />,
    });
  }

  return base;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanyDocumentsList() {
  const nav = useNavigate();
  const qc  = useQueryClient();

  const [activeTab,  setActiveTab]  = useState<CompanyDocType>('TRADE_LICENSE');
  const [page,       setPage]       = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<DocStatus | ''>('');
  const [filterBand,   setFilterBand]   = useState('');

  const pageSize = 25;

  const params: Record<string, unknown> = { docType: activeTab, page, pageSize };
  if (filterStatus) params.status = filterStatus;
  if (filterBand)   params.expiryBand = filterBand;

  const { data, isLoading } = useQuery({
    queryKey: ['company-documents', params],
    queryFn: async () =>
      (await api.get('/company-documents', { params })).data as Paginated<CompanyDocument>,
    placeholderData: (prev) => prev,
  });

  const items = data?.items ?? [];

  const handleEdit = (d: CompanyDocument) => nav(`/company-documents/${d.id}/edit`);
  const idxOf = (d: CompanyDocument) => (page - 1) * pageSize + items.indexOf(d) + 1;
  const columns = buildColumns(activeTab, handleEdit, idxOf);

  const activeFilters = [filterStatus, filterBand].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText size={22} className="text-brand-orange" />
            Company Documents
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Corporate compliance documents — trade license, civil defense, POA and more.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterOpen(true)}
            className={clsx(
              'relative inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
              activeFilters > 0
                ? 'border-brand-orange text-brand-orange bg-brand-orange/5'
                : 'border-border text-text-secondary hover:text-text-primary',
            )}
          >
            <Filter size={15} />
            Filters
            {activeFilters > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-brand-orange text-white text-[9px] font-bold grid place-items-center">
                {activeFilters}
              </span>
            )}
          </button>
          <button
            onClick={() => nav('/company-documents/new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold transition-colors"
          >
            <Plus size={16} /> Add New Document
          </button>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(1); }}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
              activeTab === tab.key
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <DataTable<CompanyDocument>
        columns={columns}
        rows={items}
        rowKey={(d) => d.id}
        loading={isLoading}
        onRowClick={handleEdit}
      />

      {/* Pagination */}
      {(data?.total ?? 0) > pageSize && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data?.total ?? 0}
          onPage={setPage}
          onPageSize={() => {}}
        />
      )}

      {/* Filter drawer */}
      <FilterDrawer
        open={filterOpen}
        status={filterStatus}
        expiryBand={filterBand}
        onStatus={setFilterStatus}
        onBand={setFilterBand}
        onClose={() => setFilterOpen(false)}
      />
    </div>
  );
}
