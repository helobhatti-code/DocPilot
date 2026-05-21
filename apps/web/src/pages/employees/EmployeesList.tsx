import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Column, DataTable } from '@/components/DataTable';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { bandStyle } from '@/lib/expiryBand';
import type { Employee, ExpiryBand, Paginated } from '@/lib/types';
import NewEmployeesPipeline from './NewEmployeesPipeline';

// ─── Expiry cell with 30-day visa alarm label ─────────────────────────────────

function VisaExpiryCell({ date, band }: { date: string | null | undefined; band: ExpiryBand | null | undefined }) {
  if (!date || !band) return <span className="text-text-secondary text-xs">—</span>;
  const { bg, text, label } = bandStyle(band);
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-mono">{date.slice(0, 10)}</div>
      <span className={clsx('inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold', bg, text)}>
        {label}
      </span>
      {band === '30d' && (
        <div className="text-[9px] text-yellow-400 font-semibold uppercase tracking-wide leading-tight">
          Should be alarmed a month earlier
        </div>
      )}
    </div>
  );
}

function AttachmentLink({ url, label }: { url?: string | null; label: string }) {
  if (!url) return <span className="text-text-secondary text-xs">—</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="text-accent-blue hover:underline text-xs inline-flex items-center gap-0.5">
      {label}
    </a>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'existing' | 'new';

export default function EmployeesList() {
  const nav              = useNavigate();
  const [tab, setTab]    = useState<Tab>('existing');
  const [q, setQ]        = useState('');
  const [page, setPage]  = useState(1);
  const pageSize         = 25;

  const params: Record<string, unknown> = { page, pageSize };
  if (q.trim()) params.q = q.trim();

  const { data, isLoading } = useQuery({
    queryKey: ['employees', params],
    queryFn: async () => (await api.get('/employees', { params })).data as Paginated<Employee>,
    placeholderData: (prev) => prev,
  });

  const items = data?.items ?? [];

  const columns: Column<Employee>[] = [
    { key: 'sn',         header: 'S/N',            render: (e) => <span className="text-text-secondary text-xs">{(page - 1) * pageSize + items.indexOf(e) + 1}</span>, width: '40px' },
    { key: 'name',       header: 'Name',            render: (e) => <span className="font-medium text-sm">{e.name}</span> },
    { key: 'desig',      header: 'Designation',     render: (e) => <span className="text-sm">{e.designation}</span> },
    { key: 'eid',        header: 'Emirates ID No.', render: (e) => <span className="text-xs font-mono">{e.emiratesIdNo}</span> },
    { key: 'viewId',     header: 'View ID',         render: (e) => <AttachmentLink url={e.emiratesIdAttachmentId} label="View ID" /> },
    { key: 'visaExp',    header: 'Visa Expiry Date',render: (e) => <VisaExpiryCell date={e.visaExpiryDate} band={e.visaExpiryBand} /> },
    { key: 'viewVisa',   header: 'View Visa',       render: (e) => <AttachmentLink url={e.visaAttachmentId} label="View Visa" /> },
    { key: 'laborNo',    header: 'Labor Card No.',  render: (e) => <span className="text-xs">{e.laborCardNo ?? '—'}</span> },
    { key: 'viewLabor',  header: 'View Labor Card', render: (e) => <AttachmentLink url={e.laborCardAttachmentId} label="View" /> },
    { key: 'edit',       header: '',                render: (e) => (
      <button
        onClick={() => nav(`/employees/${e.id}/edit`)}
        className="text-xs px-2 py-1 rounded bg-bg-input hover:bg-brand-orange/10 text-text-secondary hover:text-brand-orange transition-colors"
      >
        Edit
      </button>
    )},
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users size={22} className="text-brand-orange" />
            Employees
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Direct company employees — Emirates ID, Visa, Labor Card compliance.
          </p>
        </div>
        <button
          onClick={() => nav('/employees/new')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> Add New Employee
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 border-b border-border">
        {([
          { id: 'existing', label: 'Existing Employees' },
          { id: 'new',      label: 'New Employees' },
        ] as { id: Tab; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setPage(1); setQ(''); }}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === id
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* New Employees tab — pipeline view */}
      {tab === 'new' && <NewEmployeesPipeline />}

      {/* Existing Employees tab — search + table */}
      {tab === 'existing' && (
        <>
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Search by name, designation, or Emirates ID…"
              className="w-full pl-10 pr-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary placeholder-text-secondary focus:border-brand-orange focus:outline-none transition-colors"
            />
          </div>

          <DataTable<Employee>
            columns={columns}
            rows={items}
            rowKey={(e) => e.id}
            loading={isLoading}
            onRowClick={(e) => nav(`/employees/${e.id}/edit`)}
          />

          {(data?.total ?? 0) > pageSize && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={data?.total ?? 0}
              onPage={setPage}
              onPageSize={() => {}}
            />
          )}
        </>
      )}
    </div>
  );
}
