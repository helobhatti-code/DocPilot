import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

export interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  sub?: string;
  accent: string;
  to?: string;
}

export function KpiTile({ icon: Icon, label, value, sub, accent, to }: KpiTileProps) {
  const inner = (
    <div className="bg-bg-card border border-border rounded-xl p-4 hover:border-white/20 transition-all">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl grid place-items-center"
          style={{ background: `${accent}22`, color: accent }}>
          <Icon size={18} />
        </div>
        <div className="text-[11px] font-bold uppercase tracking-label text-text-secondary leading-tight">{label}</div>
      </div>
      <div className="text-3xl font-bold tabular-nums" style={{ color: accent }}>{value}</div>
      {sub && <div className="mt-2 text-xs text-text-secondary">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export function Panel({ title, subtitle, children, right, className }: {
  title: string; subtitle?: string; children: React.ReactNode;
  right?: React.ReactNode; className?: string;
}) {
  return (
    <section className={clsx('bg-bg-card border border-border rounded-xl p-5', className)}>
      <header className="flex items-start justify-between mb-4">
        <div>
          <div className="font-semibold text-sm">{title}</div>
          {subtitle && <div className="text-xs text-text-secondary mt-0.5">{subtitle}</div>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

export function EmptyPanel({ message = 'No data yet' }: { message?: string }) {
  return (
    <div className="grid place-items-center text-text-secondary text-sm py-8">
      {message}
    </div>
  );
}

const BAND_COLORS: Record<string, string> = {
  expired: '#FC5185',
  '7d':    '#F47316',
  '14d':   '#ECC94B',
  '30d':   '#FBBF24',
  valid:   '#22C55E',
};

export function BandBars({ byBand }: { byBand: Record<string, number> }) {
  const order = ['expired', '7d', '14d', '30d', 'valid'] as const;
  const total = order.reduce((s, k) => s + (byBand[k] ?? 0), 0);
  if (total === 0) return <EmptyPanel />;
  return (
    <div className="space-y-2.5 py-1">
      {order.map((k) => {
        const v = byBand[k] ?? 0;
        const pct = total ? (v / total) * 100 : 0;
        return (
          <div key={k} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary uppercase tracking-wide">{k === 'valid' ? 'Valid' : k === 'expired' ? 'Expired' : `≤ ${k}`}</span>
              <span className="font-mono font-semibold" style={{ color: BAND_COLORS[k] }}>{v}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: BAND_COLORS[k] }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CountList({ items, emptyMessage }: {
  items: { id: string; label: string; daysUntilExpiry: number | null; to?: string }[];
  emptyMessage?: string;
}) {
  if (items.length === 0) return <EmptyPanel message={emptyMessage} />;
  return (
    <ul className="divide-y divide-border">
      {items.map((it) => (
        <li key={it.id} className="py-2.5 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{it.label}</div>
          </div>
          {it.daysUntilExpiry !== null && (
            <span className={clsx(
              'text-xs font-mono font-bold tabular-nums',
              it.daysUntilExpiry < 0 ? 'text-rose-500' : it.daysUntilExpiry <= 7 ? 'text-orange-400' : 'text-text-secondary',
            )}>
              {it.daysUntilExpiry < 0 ? `${Math.abs(it.daysUntilExpiry)}d ago` : `${it.daysUntilExpiry}d`}
            </span>
          )}
          {it.to && (
            <Link to={it.to} className="text-xs text-accent-blue hover:underline">→</Link>
          )}
        </li>
      ))}
    </ul>
  );
}
