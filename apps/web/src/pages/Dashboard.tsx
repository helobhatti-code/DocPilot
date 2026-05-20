import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bell,
  Clock,
  ExternalLink,
  FileX,
  PackageCheck,
  PieChart as PieIcon,
  ShieldAlert,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import clsx from 'clsx';
import { api } from '@/lib/api';

function getExpiryUrl(source: string, sourceId: string): string {
  switch (source) {
    case 'gate_pass':        return `/passes/${sourceId}`;
    case 'vehicle':          return `/vehicles/${sourceId}/edit`;
    case 'machinery':        return `/machinery/${sourceId}/edit`;
    case 'employee':         return `/employees/${sourceId}/edit`;
    case 'company_document': return `/company-documents/${sourceId}/edit`;
    default: return '/expiry-dashboard';
  }
}
import { CUSTODY_COLORS, ZONE_COLORS } from '@/lib/constants';
import { actionLabel, entityLabel } from '@/lib/auditLabels';
import type { CustodyStatus, ExpiryItem, ZoneCode } from '@/lib/types';

// ── Brand colours ──────────────────────────────────────────────────────────
const C = {
  active:   '#2D7DD2',   // Brand Mid blue
  expiring: '#F47316',   // Brand Orange
  expired:  '#FC5185',   // Rose
  pending:  '#ECC94B',   // Amber
  handover: '#A78BFA',   // Violet
};

interface KpiPayload {
  activePasses: number;
  expiringSoon: number;
  expiringWithin7: number;
  expired: number;
  pendingActions: number;
  pendingHandover: number;
}
interface TimelinePoint  { weekStart: string; label: string; count: number }
interface ZonePoint      { zone: ZoneCode; count: number }
interface CustodyPoint   { custodyStatus: CustodyStatus; count: number }
interface ActivityEntry  {
  id: string; action: string; entityType?: string | null;
  entityId?: string | null; actor?: { id: string; name: string; email: string } | null;
  details?: unknown; createdAt: string;
}
interface NotificationItem {
  id: string; type: string; title: string; message: string;
  isRead: boolean; createdAt: string; entityId?: string | null;
}
interface UpcomingDeletions { withinNext30Days: number; nextDeletionDate: string | null }
interface SubcontractorComplianceItem {
  id: string; name: string; total: number; active: number;
  expiring: number; expired: number; complianceScore: number;
  health: 'good' | 'warn' | 'risk';
}

export default function Dashboard() {
  const navigate = useNavigate();

  const kpis         = useQuery({ queryKey: ['dashboard','kpis'],                    queryFn: async () => (await api.get('/dashboard/kpis')).data as KpiPayload });
  const timeline     = useQuery({ queryKey: ['dashboard','expiry-timeline'],          queryFn: async () => (await api.get('/dashboard/expiry-timeline')).data as TimelinePoint[] });
  const zones        = useQuery({ queryKey: ['dashboard','zone-distribution'],         queryFn: async () => (await api.get('/dashboard/zone-distribution')).data as ZonePoint[] });
  const custody      = useQuery({ queryKey: ['dashboard','custody-breakdown'],         queryFn: async () => (await api.get('/dashboard/custody-breakdown')).data as CustodyPoint[] });
  const activity     = useQuery({ queryKey: ['dashboard','recent-activity'],           queryFn: async () => (await api.get('/dashboard/recent-activity')).data as ActivityEntry[] });
  const upcoming     = useQuery({ queryKey: ['dashboard','upcoming-deletions'],        queryFn: async () => (await api.get('/dashboard/upcoming-deletions')).data as UpcomingDeletions });
  const subs         = useQuery({ queryKey: ['dashboard','subcontractor-compliance'],  queryFn: async () => (await api.get('/dashboard/subcontractor-compliance')).data as SubcontractorComplianceItem[] });
  const notifications = useQuery({
    queryKey: ['dashboard','recent-notifications'],
    queryFn: async () => (await api.get('/notifications/recent')).data as { items: NotificationItem[] },
    select: (d) => (d?.items ?? []).filter((n) => !n.isRead).slice(0, 5),
  });

  const k = kpis.data;

  const expiringThisWeek = useQuery({
    queryKey: ['expiry-this-week'],
    queryFn: async () =>
      (await api.get('/expiry', { params: { band: 'expired,7d', pageSize: 5, page: 1 } })).data as {
        items: ExpiryItem[];
      },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  // ── Distribution data for the overview chart ───────────────────────────
  const distData = k
    ? [
        { name: 'Active',         value: k.activePasses,    color: C.active   },
        { name: 'Expiring Soon',  value: k.expiringSoon,    color: C.expiring },
        { name: 'Expired',        value: k.expired,         color: C.expired  },
        { name: 'Pending Actions',value: k.pendingActions,  color: C.pending  },
        { name: 'Pending Handover',value: k.pendingHandover, color: C.handover },
      ]
    : [];
  const total = distData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-heading">DocPilot</h1>
        <p className="text-text-secondary text-sm mt-0.5">
          Operational overview — gate passes, compliance and authority handover.
        </p>
      </div>

      {/* ── KPI ROW ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={BadgeCheck}   label="Active Passes"    value={k?.activePasses    ?? 0} loading={kpis.isLoading} accent={C.active}   onClick={() => navigate('/passes?status=VALID&status=EXPIRY_30&status=EXPIRY_15&status=EXPIRY_7')} />
        <KpiCard icon={Clock}        label="Expiring Soon"    value={k?.expiringSoon    ?? 0} loading={kpis.isLoading} accent={C.expiring} subBadge={k?.expiringWithin7 ? `${k.expiringWithin7} within 7 d` : undefined} onClick={() => navigate('/passes?status=EXPIRY_30&status=EXPIRY_15&status=EXPIRY_7')} />
        <KpiCard icon={FileX}        label="Expired"          value={k?.expired         ?? 0} loading={kpis.isLoading} accent={C.expired}  onClick={() => navigate('/passes?status=EXPIRED')} />
        <KpiCard icon={ShieldAlert}  label="Pending Actions"  value={k?.pendingActions  ?? 0} loading={kpis.isLoading} accent={C.pending}  onClick={() => navigate('/passes?status=RENEWAL_SUBMITTED&status=CANCELLATION_REQUESTED')} />
        <KpiCard icon={PackageCheck} label="Pending Handover" value={k?.pendingHandover ?? 0} loading={kpis.isLoading} accent={C.handover} onClick={() => navigate('/passes?custodyStatus=RETURNED_TO_COMPANY')} />
      </div>

      {/* ── EXPIRING THIS WEEK ───────────────────────────────────────────── */}
      <Panel
        title="Expiring This Week"
        subtitle="Urgent items across all modules (expired + within 7 days)"
        icon={ShieldAlert}
        right={<Link to="/expiry-dashboard" className="text-xs text-accent-blue hover:underline">View all →</Link>}
      >
        {(expiringThisWeek.data?.items?.length ?? 0) === 0 ? (
          <Empty message={expiringThisWeek.isLoading ? 'Loading…' : 'Nothing expiring this week.'} />
        ) : (
          <ul className="divide-y divide-border">
            {(expiringThisWeek.data?.items ?? []).map((item) => (
              <li key={`${item.source}_${item.source_id}_${item.doc_kind}`}
                className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.display_name}</div>
                  <div className="text-xs text-text-secondary mt-0.5">{item.doc_kind}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={clsx(
                    'text-xs font-mono font-bold tabular-nums',
                    item.days_until_expiry < 0 ? 'text-rose-500' : 'text-orange-400',
                  )}>
                    {item.days_until_expiry < 0 ? `${Math.abs(item.days_until_expiry)}d ago` : `${item.days_until_expiry}d`}
                  </span>
                  <Link
                    to={getExpiryUrl(item.source, item.source_id)}
                    className="p-1.5 rounded hover:bg-bg-input text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <ExternalLink size={13} />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ── PASS STATUS OVERVIEW (graph in the KPI area) ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Donut chart */}
        <Panel title="Pass Status Distribution" subtitle="All passes by current status" icon={PieIcon}>
          <div className="flex items-center gap-4">
            <div className="w-40 h-40 flex-shrink-0">
              {total > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={38}
                      outerRadius={62}
                      paddingAngle={2}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {distData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }}
                      formatter={(v: number, n) => [`${v} (${total ? ((v/total)*100).toFixed(0) : 0}%)`, n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-24 h-24 rounded-full border-4 border-border flex items-center justify-center text-xs text-text-secondary">No data</div>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2.5 min-w-0">
              {distData.map((d) => (
                <div key={d.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-text-secondary leading-tight">{d.name}</span>
                    <span className="font-mono font-semibold flex-shrink-0" style={{ color: d.color }}>{d.value}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: total ? `${(d.value / total) * 100}%` : '0%', background: d.color }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-1 text-[11px] text-text-secondary">
                Total: <span className="font-mono font-bold text-text-primary">{total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </Panel>

        {/* Stacked horizontal breakdown bar */}
        <Panel title="Pass Health Bar" subtitle="Proportional status breakdown at a glance" className="lg:col-span-2">
          <div className="space-y-5 py-2">
            {/* Big stacked bar */}
            <div>
              <div className="flex h-8 rounded-xl overflow-hidden gap-0.5">
                {distData.map((d) =>
                  total && d.value > 0 ? (
                    <div
                      key={d.name}
                      title={`${d.name}: ${d.value}`}
                      className="transition-all duration-700 first:rounded-l-xl last:rounded-r-xl"
                      style={{ width: `${(d.value / total) * 100}%`, background: d.color }}
                    />
                  ) : null
                )}
                {total === 0 && (
                  <div className="flex-1 bg-white/8 rounded-xl flex items-center justify-center text-xs text-text-secondary">
                    No passes yet
                  </div>
                )}
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
                {distData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
                    {d.name}
                    <span className="font-mono font-semibold" style={{ color: d.color }}>{d.value}</span>
                    {total > 0 && (
                      <span className="text-white/30">({((d.value / total) * 100).toFixed(0)}%)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Mini per-status bars */}
            <div className="grid grid-cols-5 gap-3">
              {distData.map((d) => (
                <div key={d.name} className="flex flex-col items-center gap-1.5">
                  <div className="w-full h-20 bg-white/5 rounded-lg overflow-hidden flex flex-col-reverse">
                    <div
                      className="w-full rounded-lg transition-all duration-700"
                      style={{
                        height: total ? `${Math.max((d.value / Math.max(...distData.map(x => x.value), 1)) * 100, d.value > 0 ? 8 : 0)}%` : '0%',
                        background: `linear-gradient(to top, ${d.color}, ${d.color}88)`,
                      }}
                    />
                  </div>
                  <span className="font-mono text-sm font-bold" style={{ color: d.color }}>{d.value}</span>
                  <span className="text-[10px] text-text-secondary text-center leading-tight">{d.name.split(' ').map((w,i) => i === 0 ? w : <br key={i}/>)}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* ── CHARTS ROW ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Expiry Timeline" subtitle="Passes expiring per week, next 12 weeks">
          <div className="h-64">
            {timeline.data && timeline.data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline.data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--text-secondary)" fontSize={11} />
                  <YAxis stroke="var(--text-secondary)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
                    labelFormatter={(l, p) => { const d = p?.[0]?.payload as TimelinePoint | undefined; return d ? `${l} (w/o ${d.weekStart})` : String(l); }} />
                  <Line type="monotone" dataKey="count" stroke={C.expiring} strokeWidth={2}
                    dot={{ r: 3, fill: C.expiring }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Empty message={timeline.isLoading ? 'Loading…' : 'No upcoming expirations.'} />
            )}
          </div>
        </Panel>

        <Panel title="Zone Access Distribution" subtitle="Active passes per zone">
          <div className="h-64">
            {zones.data && zones.data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zones.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="zone" stroke="var(--text-secondary)" fontSize={11} />
                  <YAxis stroke="var(--text-secondary)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {zones.data.map((z, i) => (
                      <Cell key={i} fill={ZONE_COLORS[z.zone]?.bg ?? '#888'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty message={zones.isLoading ? 'Loading…' : 'No active passes yet.'} />
            )}
          </div>
        </Panel>
      </div>

      {/* ── ACTIVITY + NOTIFICATIONS ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Recent Activity" subtitle="Last 10 audit entries" icon={Activity}
          right={<Link to="/system/audit" className="text-xs text-accent-blue hover:underline">View all</Link>}>
          {(activity.data?.length ?? 0) === 0 ? (
            <Empty message={activity.isLoading ? 'Loading…' : 'No recent activity.'} />
          ) : (
            <ul className="divide-y divide-border">
              {activity.data!.map((a) => (
                <li key={a.id} className="py-2.5 flex items-start gap-3">
                  <Avatar name={a.actor?.name ?? 'System'} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="font-medium">{a.actor?.name ?? 'System'}</span>
                      <span className="text-text-secondary"> · </span>
                      <span>{actionLabel(a.action)}</span>
                    </div>
                    <div className="text-xs text-text-secondary">{entityLabel(a.entityType, a.entityId) || '—'}</div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-bg-input text-text-secondary">{relativeTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Notifications" subtitle="Last 5 unread" icon={Bell}
          right={<Link to="/notifications" className="text-xs text-accent-blue hover:underline">View all</Link>}>
          {(notifications.data?.length ?? 0) === 0 ? (
            <Empty message={notifications.isLoading ? 'Loading…' : 'You are all caught up.'} />
          ) : (
            <ul className="divide-y divide-border">
              {notifications.data!.map((n) => (
                <li key={n.id} className="py-2.5">
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-xs text-text-secondary line-clamp-2">{n.message}</div>
                  <div className="text-[10px] text-text-secondary mt-0.5">{relativeTime(n.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── BOTTOM ROW ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Custody Breakdown" subtitle="Where pass cards live right now">
          <div className="h-56">
            {custody.data && custody.data.some((d) => d.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={custody.data} dataKey="count" nameKey="custodyStatus" innerRadius={48} outerRadius={80} paddingAngle={2}>
                    {custody.data.map((c, i) => (
                      <Cell key={i} fill={CUSTODY_COLORS[c.custodyStatus]?.bg ?? '#888'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
                    formatter={(value, _name, p) => {
                      const status = p?.payload?.custodyStatus as CustodyStatus | undefined;
                      return [value, status ? CUSTODY_COLORS[status].label : 'count'];
                    }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty message={custody.isLoading ? 'Loading…' : 'No custody data.'} />
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            {(custody.data ?? []).map((c) => (
              <div key={c.custodyStatus} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CUSTODY_COLORS[c.custodyStatus]?.bg ?? '#888' }} />
                <span className="text-text-secondary">{CUSTODY_COLORS[c.custodyStatus]?.label}</span>
                <span className="ml-auto font-mono">{c.count}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Upcoming Auto-Deletions" subtitle="Cancelled passes scheduled to purge" icon={Trash2}>
          <div className="flex flex-col items-start justify-center h-56 gap-2">
            <div className="text-5xl font-bold tabular-nums" style={{ color: upcoming.data?.withinNext30Days ? C.expired : 'var(--text-secondary)' }}>
              {upcoming.data?.withinNext30Days ?? 0}
            </div>
            <div className="text-sm text-text-secondary">within next 30 days</div>
            {upcoming.data?.nextDeletionDate && (
              <div className="text-xs text-text-secondary">
                Next purge: <span className="font-mono text-text-primary">{upcoming.data.nextDeletionDate.slice(0, 10)}</span>
              </div>
            )}
            <Link to="/reports/retention" className="mt-3 text-xs text-accent-blue hover:underline">Open retention report →</Link>
          </div>
        </Panel>

        <Panel title="Subcontractor Compliance" subtitle="Active vs. risky passes per org" icon={AlertTriangle}>
          {(subs.data?.length ?? 0) === 0 ? (
            <Empty message={subs.isLoading ? 'Loading…' : 'No subcontractors yet.'} />
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {subs.data!.map((s) => <SubcontractorCard key={s.id} item={s} />)}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, loading, accent, onClick, subBadge }: {
  icon: LucideIcon; label: string; value: number; loading?: boolean;
  accent: string; onClick?: () => void; subBadge?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className="text-left bg-bg-card border border-border rounded-xl p-4 hover:border-white/20 hover:shadow-card-hover transition-all group"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0"
          style={{ background: `${accent}22`, color: accent }}>
          <Icon size={18} />
        </div>
        <div className="text-[11px] font-bold uppercase tracking-label text-text-secondary leading-tight">{label}</div>
      </div>
      <div className="text-3xl font-bold tabular-nums" style={{ color: accent }}>
        {loading ? '–' : value.toLocaleString()}
      </div>
      {/* mini accent bar at bottom */}
      <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full w-full rounded-full opacity-60 transition-all"
          style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      </div>
      {subBadge && (
        <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold"
          style={{ background: `${accent}22`, color: accent }}>{subBadge}</div>
      )}
    </button>
  );
}

function Panel({ title, subtitle, icon: Icon, right, children, className }: {
  title: string; subtitle?: string; icon?: LucideIcon;
  right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={clsx('bg-bg-card border border-border rounded-xl p-5', className)}>
      <header className="flex items-start justify-between mb-4">
        <div>
          <div className="font-semibold flex items-center gap-2 text-sm">
            {Icon && <Icon size={15} className="text-accent-primary" />}
            {title}
          </div>
          {subtitle && <div className="text-xs text-text-secondary mt-0.5">{subtitle}</div>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function Empty({ message }: { message: string }) {
  return <div className="grid place-items-center h-full text-text-secondary text-sm py-8">{message}</div>;
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-bg-input grid place-items-center text-xs font-semibold text-text-secondary flex-shrink-0">
      {initials || '·'}
    </div>
  );
}

function SubcontractorCard({ item }: { item: SubcontractorComplianceItem }) {
  const barColor = item.health === 'good' ? '#48BB78' : item.health === 'warn' ? '#ECC94B' : '#FC5185';
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-sm truncate">{item.name}</div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded flex-shrink-0"
          style={{ background: `${barColor}22`, color: barColor }}>{item.complianceScore}%</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="Active"   value={item.active}   color={C.active}   />
        <Stat label="Expiring" value={item.expiring} color={C.expiring} />
        <Stat label="Expired"  value={item.expired}  color={C.expired}  />
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-bg-input overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${item.complianceScore}%`, background: barColor }} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-text-secondary uppercase tracking-wide text-[10px]">{label}</span>
      <span className="font-mono font-semibold text-sm" style={{ color }}>{value}</span>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const sec = Math.floor(diff / 1000);
  if (sec < 60)   return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60)   return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24)    return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 7)   return `${days}d`;
  return new Date(iso).toISOString().slice(0, 10);
}
