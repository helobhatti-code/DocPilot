import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, Menu, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { ThemeToggle } from '@/components/ThemeToggle';

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
interface RecentResponse {
  items: NotificationRow[];
  unreadCount: number;
}

export function TopBar({ onMenuClick }: { onMenuClick?: () => void } = {}) {
  const nav = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  /* Keyboard shortcut: press "/" to focus search */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* Click-outside to close bell panel */
  useEffect(() => {
    if (!bellOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!bellRef.current?.contains(e.target as Node)) setBellOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [bellOpen]);

  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = searchRef.current?.value?.trim();
    if (q) nav(`/passes?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="h-14 border-b border-border bg-bg-card px-4 flex items-center gap-3">
      {/* Mobile menu button */}
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="p-2 rounded-lg hover:bg-white/8 lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
      )}

      {/* Search — left side */}
      <form onSubmit={onSearch} className="flex-1 max-w-md relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
        <input
          ref={searchRef}
          placeholder="Search passes, staff, companies… ( / )"
          className="w-full pl-10 pr-3 py-2 bg-bg-input border border-border rounded-lg text-sm outline-none
            focus:border-brand-orange transition-colors text-text-primary placeholder-text-secondary"
        />
      </form>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side: Theme toggle + Bell */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notification bell */}
        <div ref={bellRef} className="relative">
          <BellButton open={bellOpen} onToggle={() => setBellOpen((v) => !v)} />
          {bellOpen && <BellPanel onClose={() => setBellOpen(false)} />}
        </div>
      </div>
    </header>
  );
}

/* ── Bell button with unread badge ──────────────────────────────────────── */
function BellButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { data } = useQuery({
    queryKey: ['notifications-recent'],
    queryFn: async () => (await api.get('/notifications/recent')).data as RecentResponse,
    refetchInterval: 30_000,   // refresh every 30 s
  });
  const unread = data?.unreadCount ?? 0;

  return (
    <button
      onClick={onToggle}
      className={clsx(
        'relative p-2 rounded-lg transition-colors',
        open
          ? 'bg-bg-input text-text-primary'
          : 'text-text-secondary hover:bg-bg-input hover:text-text-primary',
      )}
      aria-label="Notifications"
    >
      <Bell size={18} />
      {unread > 0 && (
        <span className="absolute top-1 right-1 min-w-4 h-4 px-1 bg-brand-orange text-white text-[10px] font-bold rounded-full grid place-items-center leading-none">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

/* ── Notification dropdown panel ─────────────────────────────────────────── */
function BellPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications-recent'],
    queryFn: async () => (await api.get('/notifications/recent')).data as RecentResponse,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-recent'] }),
  });

  const markAll = useMutation({
    mutationFn: async () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-recent'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const items  = data?.items      ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <div className="absolute right-0 mt-2 w-96 bg-bg-card border border-border rounded-xl shadow-card-hover z-50 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <div className="font-semibold text-sm">Notifications</div>
          <div className="text-xs text-text-secondary">
            {unread > 0 ? `${unread} unread` : 'All caught up ✓'}
          </div>
        </div>
        {unread > 0 && (
          <button
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="text-xs text-brand-mid hover:text-brand-orange transition-colors disabled:opacity-50"
          >
            Mark all read
          </button>
        )}
      </header>

      {/* List */}
      <div className="max-h-[420px] overflow-y-auto">
        {isLoading ? (
          <div className="p-6 text-sm text-text-secondary text-center">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <Bell size={28} className="mx-auto mb-2 text-text-secondary opacity-40" />
            <div className="text-sm text-text-secondary">No notifications yet.</div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <BellItem
                key={n.id}
                n={n}
                onClick={() => {
                  if (!n.isRead) markRead.mutate(n.id);
                  onClose();
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-2.5 text-center bg-bg-input/40">
        <Link
          to="/notifications"
          onClick={onClose}
          className="text-xs text-brand-mid hover:text-brand-orange transition-colors"
        >
          View all notifications →
        </Link>
      </footer>
    </div>
  );
}

/* ── Single notification row ─────────────────────────────────────────────── */
function BellItem({ n, onClick }: { n: NotificationRow; onClick: () => void }) {
  const url =
    n.entityType === 'GatePass' && n.entityId
      ? `/passes/${n.entityId}`
      : '/notifications';

  return (
    <li className={clsx(!n.isRead && 'bg-brand-orange/5')}>
      <Link
        to={url}
        onClick={onClick}
        className="flex items-start gap-3 px-4 py-3 hover:bg-bg-input transition-colors"
      >
        {/* Unread dot */}
        <span
          className={clsx(
            'mt-1.5 w-2 h-2 rounded-full flex-shrink-0',
            n.isRead ? 'bg-transparent' : 'bg-brand-orange',
          )}
        />
        <div className="flex-1 min-w-0">
          <div className={clsx('text-sm truncate', !n.isRead && 'font-semibold')}>{n.title}</div>
          <div className="text-xs text-text-secondary truncate mt-0.5">{n.message}</div>
          <div className="text-[11px] text-text-secondary mt-1">{relativeTime(n.createdAt)}</div>
        </div>
      </Link>
    </li>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
