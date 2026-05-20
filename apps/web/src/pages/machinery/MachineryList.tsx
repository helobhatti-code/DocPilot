import { useQuery } from '@tanstack/react-query';
import { Construction, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Column, DataTable } from '@/components/DataTable';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { bandStyle } from '@/lib/expiryBand';
import type { HeavyMachinery, MachineryStatus, Paginated } from '@/lib/types';

const STATUS_STYLE: Record<MachineryStatus, { bg: string; text: string }> = {
  ACTIVE:          { bg: 'bg-emerald-400/10', text: 'text-emerald-400' },
  IDLE:            { bg: 'bg-yellow-400/10',  text: 'text-yellow-400'  },
  MAINTENANCE:     { bg: 'bg-orange-400/10',  text: 'text-orange-400'  },
  OUT_OF_SERVICE:  { bg: 'bg-rose-500/10',    text: 'text-rose-500'    },
};

function ExpiryCell({ date, band }: { date?: string | null; band?: string | null }) {
  if (!date || !band) return <span className="text-text-secondary text-xs">—</span>;
  const { bg, text, label } = bandStyle(band as any);
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-mono">{date.slice(0, 10)}</div>
      <span className={clsx('inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold', bg, text)}>
        {label}
      </span>
    </div>
  );
}

export default function MachineryList() {
  const nav             = useNavigate();
  const [q, setQ]       = useState('');
  const [page, setPage] = useState(1);
  const pageSize        = 25;

  const params: Record<string, unknown> = { page, pageSize };
  if (q.trim()) params.q = q.trim();

  const { data, isLoading } = useQuery({
    queryKey: ['heavy-machinery', params],
    queryFn: async () => (await api.get('/heavy-machinery', { params })).data as Paginated<HeavyMachinery>,
    placeholderData: (prev) => prev,
  });

  const items = data?.items ?? [];
  const columns: Column<HeavyMachinery>[] = [
    { key: 'sn',         header: 'S/N',           render: (m) => <span className="text-text-secondary text-xs">{(page - 1) * pageSize + items.indexOf(m) + 1}</span>, width: '40px' },
    { key: 'type',       header: 'Machine Type',  render: (m) => <span className="font-medium text-sm">{m.machineType}</span> },
    { key: 'make',       header: 'Make / Model',  render: (m) => <span className="text-sm">{m.make}{m.model ? ` / ${m.model}` : ''}</span> },
    { key: 'serial',     header: 'Serial No.',    render: (m) => <span className="text-xs font-mono">{m.serialNumber}</span> },
    { key: 'plate',      header: 'Plate No.',     render: (m) => <span className="text-xs font-mono">{m.plateNumber ?? '—'}</span> },
    { key: 'operator',   header: 'Operator',      render: (m) => <span className="text-sm">{m.assignedOperator ?? '—'}</span> },
    { key: 'status',     header: 'Status',        render: (m) => {
      const s = STATUS_STYLE[m.status] ?? STATUS_STYLE.ACTIVE;
      return <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded', s.bg, s.text)}>{m.status.replace('_', ' ')}</span>;
    }},
    { key: 'inspection', header: 'Inspection Exp', render: (m) => <ExpiryCell date={m.inspectionExpiryDate} band={m.inspectionExpiryBand} /> },
    { key: 'rta',        header: 'RTA Exp',        render: (m) => <ExpiryCell date={m.rtaRegistrationExpiryDate} band={m.rtaRegistrationExpiryBand} /> },
    { key: 'insurance',  header: 'Insurance Exp',  render: (m) => <ExpiryCell date={m.insuranceExpiryDate} band={m.insuranceExpiryBand} /> },
    { key: 'civdef',     header: 'Civil Def. Exp', render: (m) => <ExpiryCell date={m.civilDefenseExpiryDate} band={m.civilDefenseExpiryBand} /> },
    { key: 'worst',      header: 'Overall',        render: (m) => {
      const { bg, text, label } = bandStyle(m.worstExpiryBand as any);
      return <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded', bg, text)}>{label}</span>;
    }},
    { key: 'edit',       header: '',               render: (m) => (
      <button
        onClick={() => nav(`/machinery/${m.id}/edit`)}
        className="text-xs px-2 py-1 rounded bg-bg-input hover:bg-brand-orange/10 text-text-secondary hover:text-brand-orange transition-colors"
      >
        Edit
      </button>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Construction size={22} className="text-brand-orange" />
            Heavy Machinery
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">Track machinery, certifications and compliance dates.</p>
        </div>
        <button
          onClick={() => nav('/machinery/new')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> Add Machinery
        </button>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search type, make, serial, operator…"
          className="w-full pl-10 pr-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary placeholder-text-secondary focus:border-brand-orange focus:outline-none transition-colors"
        />
      </div>

      <DataTable<HeavyMachinery>
        columns={columns}
        rows={items}
        rowKey={(m) => m.id}
        loading={isLoading}
        onRowClick={(m) => nav(`/machinery/${m.id}/edit`)}
      />

      {(data?.total ?? 0) > pageSize && (
        <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPage={setPage} onPageSize={() => {}} />
      )}
    </div>
  );
}
