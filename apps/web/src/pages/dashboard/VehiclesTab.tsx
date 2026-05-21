import { useQuery } from '@tanstack/react-query';
import { Car, ShieldAlert, Building2, Briefcase } from 'lucide-react';
import { api } from '@/lib/api';
import { KpiTile, Panel, BandBars, CountList, EmptyPanel } from './shared';

interface VehicleStats {
  total: number;
  byType: { PRIVATE: number; COMPANY: number };
  byEmirate: Record<string, number>;
  byBand: Record<string, number>;
  expiringWithin30: number;
  soonest: { id: string; label: string; daysUntilExpiry: number | null }[];
  recentlyUpdated: { id: string; label: string; updatedAt: string }[];
}

export default function VehiclesTab() {
  const { data } = useQuery<VehicleStats>({
    queryKey: ['stats', 'vehicles'],
    queryFn: async () => (await api.get('/vehicles/stats')).data,
  });

  if (!data) return <EmptyPanel message="Loading vehicle stats…" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile icon={Car}         label="Total Vehicles" value={data.total} accent="#06B6D4" to="/vehicles" />
        <KpiTile icon={Briefcase}   label="Private"        value={data.byType.PRIVATE ?? 0} accent="#A78BFA" />
        <KpiTile icon={Building2}   label="Company"        value={data.byType.COMPANY ?? 0} accent="#2D7DD2" />
        <KpiTile icon={ShieldAlert} label="Expiring (30d)" value={data.expiringWithin30} accent="#F47316" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Document Expiry Bands" subtitle="License, insurance, mawaqif">
          <BandBars byBand={data.byBand} />
        </Panel>
        <Panel title="By Plate Emirate" subtitle="Where your fleet is registered">
          {Object.keys(data.byEmirate).length === 0
            ? <EmptyPanel />
            : (
              <ul className="space-y-2 text-sm">
                {Object.entries(data.byEmirate)
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Expiring Soonest" subtitle="Top 5">
          <CountList
            items={data.soonest.map((s) => ({ ...s, to: `/vehicles/${s.id}/edit` }))}
            emptyMessage="No data yet — no vehicles approaching expiry."
          />
        </Panel>
        <Panel title="Recently Updated" subtitle="Top 5">
          {data.recentlyUpdated.length === 0 ? <EmptyPanel /> : (
            <ul className="divide-y divide-border">
              {data.recentlyUpdated.map((r) => (
                <li key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium truncate">{r.label}</span>
                  <span className="text-[10px] text-text-secondary">{new Date(r.updatedAt).toISOString().slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
