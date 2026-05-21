import { useQuery } from '@tanstack/react-query';
import { FolderOpen, CheckCircle2, AlertTriangle, FileX } from 'lucide-react';
import { api } from '@/lib/api';
import { KpiTile, Panel, BandBars, CountList, EmptyPanel } from './shared';

interface DocStats {
  total: number;
  valid: number;
  expiringSoon: number;
  expired: number;
  byType: Record<string, number>;
  byBand: Record<string, number>;
  soonest: { id: string; label: string; daysUntilExpiry: number }[];
}

const TYPE_LABELS: Record<string, string> = {
  TRADE_LICENSE:      'Trade License',
  ESTABLISHMENT_CARD: 'Establishment Card',
  CLASSIFICATION:     'Classification',
  CIVIL_DEFENSE:      'Civil Defense',
  POWER_OF_ATTORNEY:  'Power of Attorney',
  OFFICE_TENANCY:     'Office Tenancy',
};

export default function CompanyDocsTab() {
  const { data } = useQuery<DocStats>({
    queryKey: ['stats', 'company-documents'],
    queryFn: async () => (await api.get('/company-documents/stats')).data,
  });

  if (!data) return <EmptyPanel message="Loading company doc stats…" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile icon={FolderOpen}    label="Total Docs"     value={data.total}        accent="#5EEAD4" to="/company-documents" />
        <KpiTile icon={CheckCircle2}  label="Valid"          value={data.valid}        accent="#22C55E" />
        <KpiTile icon={AlertTriangle} label="Expiring Soon"  value={data.expiringSoon} accent="#F47316" />
        <KpiTile icon={FileX}         label="Expired"        value={data.expired}      accent="#FC5185" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="By Document Type" subtitle="Trade License, Establishment Card, etc.">
          {Object.keys(data.byType).length === 0
            ? <EmptyPanel />
            : (
              <ul className="space-y-2 text-sm">
                {Object.entries(data.byType)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between">
                      <span className="text-text-secondary">{TYPE_LABELS[k] ?? k}</span>
                      <span className="font-mono font-semibold">{v}</span>
                    </li>
                  ))}
              </ul>
            )}
        </Panel>
        <Panel title="Expiry Bands" subtitle="Document status distribution">
          <BandBars byBand={data.byBand} />
        </Panel>
      </div>

      <Panel title="Expiring Soonest" subtitle="Top 5">
        <CountList
          items={data.soonest.map((s) => ({
            id: s.id,
            label: s.label,
            daysUntilExpiry: s.daysUntilExpiry,
            to: `/company-documents/${s.id}/edit`,
          }))}
          emptyMessage="No data yet — no company documents added."
        />
      </Panel>
    </div>
  );
}
