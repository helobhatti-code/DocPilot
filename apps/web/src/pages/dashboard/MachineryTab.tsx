import { useQuery } from '@tanstack/react-query';
import { Construction, Activity, PauseCircle, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { KpiTile, Panel, BandBars, CountList, EmptyPanel } from './shared';

interface MachineryStats {
  total: number;
  active: number;
  idleOrMaintenance: number;
  expiringWithin30: number;
  byStatus: Record<string, number>;
  byBand: Record<string, number>;
  bySite: Record<string, number>;
  soonest: { id: string; label: string; daysUntilExpiry: number | null }[];
}

export default function MachineryTab() {
  const { data } = useQuery<MachineryStats>({
    queryKey: ['stats', 'heavy-machinery'],
    queryFn: async () => (await api.get('/heavy-machinery/stats')).data,
  });

  if (!data) return <EmptyPanel message="Loading machinery stats…" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile icon={Construction} label="Total Machines"    value={data.total} accent="#EAB308" to="/machinery" />
        <KpiTile icon={Activity}     label="Active"            value={data.active} accent="#22C55E" />
        <KpiTile icon={PauseCircle}  label="Idle / Maint."     value={data.idleOrMaintenance} accent="#A78BFA" />
        <KpiTile icon={ShieldAlert}  label="Expiring (30d)"    value={data.expiringWithin30} accent="#F47316" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="By Status" subtitle="Operational state breakdown">
          {Object.values(data.byStatus).every((v) => v === 0)
            ? <EmptyPanel />
            : (
              <ul className="space-y-2 text-sm">
                {Object.entries(data.byStatus).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between">
                    <span className="text-text-secondary">{k.replace(/_/g, ' ')}</span>
                    <span className="font-mono font-semibold">{v}</span>
                  </li>
                ))}
              </ul>
            )}
        </Panel>
        <Panel title="Certificate Expiry Bands" subtitle="All inspection / RTA / insurance certs">
          <BandBars byBand={data.byBand} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="By Project Site" subtitle="Where machines are assigned">
          {Object.keys(data.bySite).length === 0
            ? <EmptyPanel />
            : (
              <ul className="space-y-2 text-sm">
                {Object.entries(data.bySite)
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
        <Panel title="Expiring Soonest" subtitle="Top 5">
          <CountList
            items={data.soonest.map((s) => ({ ...s, to: `/machinery/${s.id}/edit` }))}
            emptyMessage="No data yet."
          />
        </Panel>
      </div>
    </div>
  );
}
