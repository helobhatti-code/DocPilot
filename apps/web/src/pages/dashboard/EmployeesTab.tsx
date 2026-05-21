import { useQuery } from '@tanstack/react-query';
import { UserCircle, FileWarning, Calendar, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { KpiTile, Panel, BandBars, CountList, EmptyPanel } from './shared';

interface StaffStats {
  total: number;
  headcount: number;
  byDesignation: Record<string, number>;
  byBand: Record<string, number>;
  visaExpiringSoon: number;
  eidExpiringSoon: number;
  expiredDocs: number;
  soonest: {
    id: string;
    name: string;
    designation: string | null;
    daysUntilExpiry: number | null;
  }[];
}

export default function EmployeesTab() {
  const { data } = useQuery<StaffStats>({
    queryKey: ['stats', 'staff', 'employees'],
    queryFn: async () =>
      (await api.get('/staff/stats', { params: { personType: 'DIRECT_EMPLOYEE' } })).data,
  });

  if (!data) return <EmptyPanel message="Loading employee stats…" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile icon={UserCircle}   label="Headcount"          value={data.headcount} accent="#22C55E" to="/staff?personType=DIRECT_EMPLOYEE" />
        <KpiTile icon={Calendar}     label="Visa Expiring (30d)" value={data.visaExpiringSoon} accent="#F47316" />
        <KpiTile icon={ShieldAlert}  label="EID Expiring (30d)" value={data.eidExpiringSoon} accent="#FBBF24" />
        <KpiTile icon={FileWarning}  label="Expired Docs"        value={data.expiredDocs} accent="#FC5185" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Document Expiry Bands" subtitle="Across visa, EID, labor card, passport">
          <BandBars byBand={data.byBand} />
        </Panel>
        <Panel title="By Designation" subtitle="Headcount per role">
          {Object.keys(data.byDesignation).length === 0
            ? <EmptyPanel />
            : (
              <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
                {Object.entries(data.byDesignation)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between">
                      <span className="text-text-secondary">{k}</span>
                      <span className="font-mono font-semibold">{v}</span>
                    </li>
                  ))}
              </ul>
            )}
        </Panel>
      </div>

      <Panel title="Expiring Soonest" subtitle="Top 5 employees by nearest doc expiry">
        <CountList
          items={data.soonest.map((s) => ({
            id: s.id,
            label: `${s.name}${s.designation ? ` — ${s.designation}` : ''}`,
            daysUntilExpiry: s.daysUntilExpiry,
            to: `/staff?personType=DIRECT_EMPLOYEE`,
          }))}
          emptyMessage="No data yet — no employees added."
        />
      </Panel>
    </div>
  );
}
