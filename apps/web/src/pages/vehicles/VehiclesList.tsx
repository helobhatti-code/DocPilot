import { useQuery } from '@tanstack/react-query';
import { Car, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Column, DataTable } from '@/components/DataTable';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { bandStyle } from '@/lib/expiryBand';
import type { Paginated, Vehicle } from '@/lib/types';

type Tab = 'ALL' | 'PRIVATE' | 'COMPANY';

function ExpiryCell({ date, band }: { date: string | null | undefined; band: string | null | undefined }) {
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

function MawaqifCell({ active, date, band }: { active: boolean; date?: string | null; band?: string | null }) {
  if (!active) return <span className="text-text-secondary text-xs">No</span>;
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-emerald-400 font-semibold">Yes</div>
      {date && <ExpiryCell date={date} band={band} />}
    </div>
  );
}

export default function VehiclesList() {
  const nav           = useNavigate();
  const [tab, setTab] = useState<Tab>('ALL');
  const [q, setQ]     = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const params: Record<string, unknown> = { page, pageSize };
  if (tab !== 'ALL')    params.vehicleType = tab;
  if (q.trim())         params.q           = q.trim();

  const { data, isLoading } = useQuery({
    queryKey: ['vehicles', params],
    queryFn: async () => (await api.get('/vehicles', { params })).data as Paginated<Vehicle>,
    placeholderData: (prev) => prev,
  });

  const items = data?.items ?? [];
  const columns: Column<Vehicle>[] = [
    { key: 'sn',         header: 'S/N',           render: (v) => <span className="text-text-secondary text-xs">{(page - 1) * pageSize + items.indexOf(v) + 1}</span>, width: '40px' },
    { key: 'owner',      header: 'Owner',          render: (v) => <span className="font-medium text-sm">{v.ownerName}</span> },
    { key: 'driver',     header: 'Driver',         render: (v) => <span className="text-sm">{v.driverName ?? '—'}</span> },
    { key: 'form',       header: 'Form',           render: (v) => v.formAttachmentId
      ? <a href={v.formAttachmentId} target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline text-xs">View</a>
      : <span className="text-text-secondary text-xs">—</span> },
    { key: 'make',       header: 'Car Make',       render: (v) => <span className="text-sm">{v.carMake}</span> },
    { key: 'emirate',    header: 'Plate Emirate',  render: (v) => <span className="text-sm font-mono">{v.plateEmirate}</span> },
    { key: 'plate',      header: 'Plate No.',      render: (v) => <span className="text-sm font-mono font-semibold">{v.plateNumber}</span> },
    { key: 'carLic',     header: 'Car License',    render: (v) => v.carLicenseAttachmentId
      ? <a href={v.carLicenseAttachmentId} target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline text-xs">{v.carLicenseNo}</a>
      : <span className="text-xs">{v.carLicenseNo}</span> },
    { key: 'carExpiry',  header: 'Car Lic. Exp',   render: (v) => <ExpiryCell date={v.carLicenseExpiryDate} band={v.carLicenseExpiryBand} /> },
    { key: 'insType',    header: 'Insurance Type', render: (v) => <span className="text-xs">{v.insuranceType}</span> },
    { key: 'insExpiry',  header: 'Insurance Exp',  render: (v) => <ExpiryCell date={v.insuranceExpiryDate} band={v.insuranceExpiryBand} /> },
    { key: 'resMawaqif', header: 'Res. Mawaqif',   render: (v) => <MawaqifCell active={v.hasResidentialMawaqif} date={v.residentialMawaqifExpiryDate} band={v.residentialMawaqifExpiryBand} /> },
    { key: 'resMawExp',  header: 'Res. Mawaqif Exp', render: (v) => v.hasResidentialMawaqif ? <ExpiryCell date={v.residentialMawaqifExpiryDate} band={v.residentialMawaqifExpiryBand} /> : <span className="text-text-secondary text-xs">—</span> },
    { key: 'norMawaqif', header: 'Normal Mawaqif', render: (v) => <MawaqifCell active={v.hasNormalMawaqif} date={v.normalMawaqifExpiryDate} band={v.normalMawaqifExpiryBand} /> },
    { key: 'norMawExp',  header: 'Normal Mawaqif Exp', render: (v) => v.hasNormalMawaqif ? <ExpiryCell date={v.normalMawaqifExpiryDate} band={v.normalMawaqifExpiryBand} /> : <span className="text-text-secondary text-xs">—</span> },
    { key: 'edit',       header: '',               render: (v) => (
      <button
        onClick={() => nav(`/vehicles/${v.id}/edit`)}
        className="text-xs px-2 py-1 rounded bg-bg-input hover:bg-brand-orange/10 text-text-secondary hover:text-brand-orange transition-colors"
      >
        Edit
      </button>
    ) },
  ];

  const TAB_ITEMS: { value: Tab; label: string }[] = [
    { value: 'ALL',     label: 'All Vehicles' },
    { value: 'PRIVATE', label: 'Private Cars' },
    { value: 'COMPANY', label: 'Company Cars' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Car size={22} className="text-brand-orange" />
            Vehicles
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">Manage vehicle fleet, car licenses and insurance.</p>
        </div>
        <button
          onClick={() => nav('/vehicles/new')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> Add New Vehicle
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 border-b border-border">
        {TAB_ITEMS.map((t) => (
          <button
            key={t.value}
            onClick={() => { setTab(t.value); setPage(1); }}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t.value
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search plate number, make, owner…"
            className="w-full pl-10 pr-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary placeholder-text-secondary focus:border-brand-orange focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Table */}
      <DataTable<Vehicle>
        columns={columns}
        rows={items}
        rowKey={(v) => v.id}
        loading={isLoading}
        onRowClick={(v) => nav(`/vehicles/${v.id}/edit`)}
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
    </div>
  );
}
