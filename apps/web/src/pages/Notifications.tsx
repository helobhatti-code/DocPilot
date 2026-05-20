import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/EmptyState';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  entityId?: string | null;
  entityType?: string | null;
  isRead: boolean;
  createdAt: string;
}

interface ListResponse {
  items: NotificationRow[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}

const TYPE_OPTIONS = [
  '', 'EXPIRY_30', 'EXPIRY_15', 'EXPIRY_7', 'EXPIRY_0',
  'OVERDUE_CANCELLATION', 'OVERDUE_HANDOVER', 'STAFF_OFFBOARDING',
  'CUSTODY_CHANGE', 'RENEWAL_APPROVED', 'RENEWAL_REJECTED',
  'CANCELLATION_CONFIRMED', 'PERMISSION_CHANGE', 'DATA_DELETION_WARNING',
  'INVITATION',
];

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [type, setType] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const queryParams = useMemo(() => {
    const p: Record<string, unknown> = { page, pageSize };
    if (type) p.type = type;
    if (unreadOnly) p.unreadOnly = 'true';
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [type, unreadOnly, from, to, page, pageSize]);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', queryParams],
    queryFn: async () => (await api.get('/notifications', { params: queryParams })).data as ListResponse,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAllRead = useMutation({
    mutationFn: async () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-recent'] });
      setSelected(new Set());
    },
  });
  const bulkMarkRead = useMutation({
    mutationFn: async (ids: string[]) => api.post('/notifications/read-bulk', { ids }),
    onSuccess: (res: any) => {
      toast.success(`Marked ${res.data?.marked ?? 0} as read`);
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-recent'] });
      setSelected(new Set());
    },
  });

  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  const toggleAll = (checked: boolean) =>
    setSelected(checked ? new Set(items.map((i) => i.id)) : new Set());
  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    checked ? next.add(id) : next.delete(id);
    setSelected(next);
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-text-secondary">
            {unread > 0 ? `${unread} unread` : 'All caught up'}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-bg-input"
          >
            <CheckCheck size={14} /> Mark all as read
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 bg-bg-card border border-border rounded-xl p-3">
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
        >
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t || 'All types'}</option>)}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => { setFrom(e.target.value); setPage(1); }}
          className="bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => { setTo(e.target.value); setPage(1); }}
          className="bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm"
        />
        <label className="flex items-center gap-2 text-sm px-2">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }}
            className="accent-accent-primary"
          />
          Unread only
        </label>
        {(type || unreadOnly || from || to) && (
          <button
            onClick={() => { setType(''); setUnreadOnly(false); setFrom(''); setTo(''); setPage(1); }}
            className="text-xs text-text-secondary hover:underline ml-auto"
          >
            Reset
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="bg-bg-card border border-border rounded-xl px-4 py-2 flex items-center gap-3">
          <span className="text-sm">{selected.size} selected</span>
          <button
            onClick={() => bulkMarkRead.mutate(Array.from(selected))}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm"
          >
            <Check size={12} /> Mark as read
          </button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-text-secondary ml-auto hover:underline">
            Clear
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-text-secondary">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="Nothing matches the current filters." />
      ) : (
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-border flex items-center gap-3 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={selected.size === items.length && items.length > 0}
              onChange={(e) => toggleAll(e.target.checked)}
              className="accent-accent-primary"
            />
            Select all on this page
          </div>
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li
                key={n.id}
                className={clsx('px-4 py-3 flex items-start gap-3 hover:bg-bg-input/30', !n.isRead && 'bg-accent-primary/5')}
              >
                <input
                  type="checkbox"
                  checked={selected.has(n.id)}
                  onChange={(e) => toggleOne(n.id, e.target.checked)}
                  className="accent-accent-primary mt-1.5"
                />
                <div className={clsx('w-2 h-2 rounded-full mt-2', n.isRead ? 'bg-bg-input' : 'bg-accent-primary')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-medium">{n.title}</div>
                    <div className="text-xs text-text-secondary flex-shrink-0">
                      <span className="font-mono mr-2">{n.type}</span>
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <p className="text-sm text-text-secondary mt-0.5">{n.message}</p>
                  {n.entityType === 'GatePass' && n.entityId && (
                    <Link
                      to={`/passes/${n.entityId}`}
                      onClick={() => !n.isRead && markRead.mutate(n.id)}
                      className="inline-block mt-2 text-xs text-accent-primary hover:underline"
                    >
                      View pass →
                    </Link>
                  )}
                </div>
                {!n.isRead && (
                  <button
                    onClick={() => markRead.mutate(n.id)}
                    className="flex-shrink-0 p-1.5 rounded hover:bg-bg-input text-text-secondary"
                    title="Mark as read"
                  >
                    <Check size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && data.total > pageSize && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data.total}
          onPage={setPage}
          onPageSize={(s) => { setPageSize(s); setPage(1); }}
        />
      )}
    </div>
  );
}
