import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  Bell,
  Car,
  Construction,
  ExternalLink,
  FolderOpen,
  ShieldAlert,
  UserCircle,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { actionLabel, entityLabel } from '@/lib/auditLabels';
import type { ExpiryItem } from '@/lib/types';

interface ActivityEntry {
  id: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  actor?: { id: string; name: string; email: string } | null;
  details?: unknown;
  createdAt: string;
}
interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  entityId?: string | null;
}

function getExpiryUrl(source: string, sourceId: string): string {
  switch (source) {
    case 'gate_pass':        return `/passes/${sourceId}`;
    case 'vehicle':          return `/vehicles/${sourceId}/edit`;
    case 'machinery':        return `/machinery/${sourceId}/edit`;
    case 'employee':         return `/staff`;
    case 'company_document': return `/company-documents/${sourceId}/edit`;
    default: return '/dashboard';
  }
}

export default function OverviewTab() {
  // Cross-module counts (each tile clicks through to its module list)
  const vehicleStats   = useQuery({ queryKey: ['stats', 'vehicles'],          queryFn: async () => (await api.get('/vehicles/stats')).data });
  const machineryStats = useQuery({ queryKey: ['stats', 'heavy-machinery'],   queryFn: async () => (await api.get('/heavy-machinery/stats')).data });
  const peopleStats    = useQuery({ queryKey: ['stats', 'staff', 'employees'], queryFn: async () => (await api.get('/staff/stats', { params: { personType: 'DIRECT_EMPLOYEE' } })).data });
  const companyDocs    = useQuery({ queryKey: ['stats', 'company-documents'], queryFn: async () => (await api.get('/company-documents/stats')).data });

  const expiringThisWeek = useQuery({
    queryKey: ['expiry-this-week'],
    queryFn: async () =>
      (await api.get('/expiry', { params: { band: 'expired,7d', pageSize: 5, page: 1 } })).data as {
        items: ExpiryItem[];
      },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const activity = useQuery({
    queryKey: ['dashboard', 'recent-activity'],
    queryFn: async () => (await api.get('/dashboard/recent-activity')).data as ActivityEntry[],
  });

  const notifications = useQuery({
    queryKey: ['dashboard', 'recent-notifications'],
    queryFn: async () => (await api.get('/notifications/recent')).data as { items: NotificationItem[] },
    select: (d) => (d?.items ?? []).filter((n) => !n.isRead).slice(0, 5),
  });

  return (
    <div className="space-y-6">
      {/* Cross-module KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Car}          label="Vehicles"      value={vehicleStats.data?.total ?? 0}   sub={`${vehicleStats.data?.expiringWithin30 ?? 0} expiring soon`} accent="#06B6D4" to="/vehicles" />
        <Kpi icon={Construction} label="Machinery"     value={machineryStats.data?.total ?? 0} sub={`${machineryStats.data?.expiringWithin30 ?? 0} expiring soon`} accent="#EAB308" to="/machinery" />
        <Kpi icon={UserCircle}   label="Employees"     value={peopleStats.data?.headcount ?? 0} sub={`${peopleStats.data?.visaExpiringSoon ?? 0} visa expiring`} accent="#22C55E" to="/staff?personType=DIRECT_EMPLOYEE" />
        <Kpi icon={FolderOpen}   label="Company Docs"  value={companyDocs.data?.total ?? 0}    sub={`${companyDocs.data?.expiringSoon ?? 0} expiring soon`} accent="#5EEAD4" to="/company-documents" />
      </div>

      {/* Expiring This Week */}
      <Panel
        title="Expiring This Week"
        subtitle="Urgent items across all modules (expired + within 7 days)"
        icon={ShieldAlert}
      >
        {(expiringThisWeek.data?.items?.length ?? 0) === 0 ? (
          <Empty message={expiringThisWeek.isLoading ? 'Loading…' : 'No data yet — nothing expiring this week.'} />
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

      {/* Recent Activity + Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          title="Recent Activity"
          subtitle="Last 10 audit entries"
          icon={Activity}
          right={<Link to="/system/audit" className="text-xs text-accent-blue hover:underline">View all</Link>}
        >
          {(activity.data?.length ?? 0) === 0 ? (
            <Empty message={activity.isLoading ? 'Loading…' : 'No data yet — no recent activity.'} />
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

        <Panel
          title="Notifications"
          subtitle="Last 5 unread"
          icon={Bell}
          right={<Link to="/notifications" className="text-xs text-accent-blue hover:underline">View all</Link>}
        >
          {(notifications.data?.length ?? 0) === 0 ? (
            <Empty message={notifications.isLoading ? 'Loading…' : 'No data yet — you are all caught up.'} />
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
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent, to }: {
  icon: LucideIcon; label: string; value: number; sub: string; accent: string; to: string;
}) {
  return (
    <Link to={to} className="bg-bg-card border border-border rounded-xl p-4 hover:border-white/20 transition-all">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl grid place-items-center"
          style={{ background: `${accent}22`, color: accent }}>
          <Icon size={18} />
        </div>
        <div className="text-[11px] font-bold uppercase tracking-label text-text-secondary leading-tight">{label}</div>
      </div>
      <div className="text-3xl font-bold tabular-nums" style={{ color: accent }}>{value.toLocaleString()}</div>
      <div className="mt-2 text-xs text-text-secondary">{sub}</div>
    </Link>
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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toISOString().slice(0, 10);
}
