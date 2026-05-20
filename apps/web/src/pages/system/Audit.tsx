import { useQuery } from '@tanstack/react-query';
import { Download, ScrollText, Search } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { EmptyState } from '@/components/EmptyState';
import { Pagination } from '@/components/Pagination';
import { TableSkeleton } from '@/components/Skeleton';
import { api } from '@/lib/api';
import { actionLabel, entityLabel } from '@/lib/auditLabels';
import { Paginated } from '@/lib/types';

interface AuditEntry {
  id: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  user?: { id: string; name: string; email: string; role: string } | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
}

const ACTION_PRESETS = [
  '', 'LOGIN', 'GATE_PASS', 'CUSTODY', 'BULK_RENEWAL', 'BULK_CANCELLATION',
  'BULK_IMPORT', 'TENANT_RETENTION_UPDATED', 'TENANT_PROFILE_UPDATED',
  'TENANT_PASS_CONFIG_UPDATED', 'PERMISSION', 'AUDIT_LOG_EXPORTED',
];

export default function AuditPage() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expanded, setExpanded] = useState<string | null>(null);

  const params = useMemo(() => {
    const p: Record<string, unknown> = { page, pageSize };
    if (q) p.q = q;
    if (action) p.action = action;
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [q, action, from, to, page, pageSize]);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: async () => (await api.get('/audit-logs', { params })).data as Paginated<AuditEntry>,
  });

  const rows = data?.items ?? [];

  const exportXlsx = async () => {
    try {
      const res = await api.get('/audit-logs/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message ?? 'Export failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Audit Log</h1>
          <p className="text-sm text-text-secondary">Immutable record of system activity.</p>
        </div>
        <button
          onClick={exportXlsx}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border text-sm hover:bg-bg-input"
        >
          <Download size={14} /> Export to Excel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search user, action, entity ID…"
            className="w-full pl-10 pr-3 py-2 bg-bg-input border border-border rounded-lg outline-none focus:border-accent-primary text-sm"
          />
        </div>
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
          className="bg-bg-input border border-border rounded-lg px-3 py-2 text-sm"
        >
          {ACTION_PRESETS.map((a) => <option key={a} value={a}>{a || 'All actions'}</option>)}
        </select>
        <input
          type="date" value={from}
          onChange={(e) => { setFrom(e.target.value); setPage(1); }}
          className="bg-bg-input border border-border rounded-lg px-3 py-2 text-sm"
          placeholder="From"
        />
        <input
          type="date" value={to}
          onChange={(e) => { setTo(e.target.value); setPage(1); }}
          className="bg-bg-input border border-border rounded-lg px-3 py-2 text-sm"
          placeholder="To"
        />
      </div>

      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-bg-input text-text-secondary">
              <tr>
                <th className="text-left px-4 py-2">Timestamp</th>
                <th className="text-left px-4 py-2">User</th>
                <th className="text-left px-4 py-2">Action</th>
                <th className="text-left px-4 py-2">Entity</th>
                <th className="text-left px-4 py-2">IP</th>
                <th className="text-left px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-4"><TableSkeleton rows={6} cols={5} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6}>
                  <EmptyState
                    icon={ScrollText}
                    title="No audit entries"
                    description="Mutating actions will appear here. Try clearing filters."
                  />
                </td></tr>
              ) : rows.map((r) => (
                <React.Fragment key={r.id}>
                  <tr className="border-t border-border align-top hover:bg-bg-input/40">
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2">
                      {r.user ? (
                        <div>
                          <div className="font-medium">{r.user.name}</div>
                          <div className="text-xs text-text-secondary">{r.user.email}</div>
                        </div>
                      ) : <span className="text-text-secondary">system</span>}
                    </td>
                    <td className="px-4 py-2">
                      <span title={r.action} className="text-sm">{actionLabel(r.action)}</span>
                    </td>
                    <td className="px-4 py-2 text-text-secondary">
                      {entityLabel(r.entityType, r.entityId) || '—'}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-text-secondary">{r.ipAddress ?? '—'}</td>
                    <td className="px-4 py-2">
                      {r.details && (
                        <button
                          className="text-xs text-accent-primary hover:underline"
                          onClick={() => setExpanded((e) => (e === r.id ? null : r.id))}
                        >
                          {expanded === r.id ? 'Hide' : 'Details'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="border-t border-border bg-bg-input/30">
                      <td colSpan={6} className="px-4 py-2">
                        <pre className="text-xs whitespace-pre-wrap font-mono text-text-secondary overflow-x-auto">
                          {JSON.stringify(r.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPage={setPage}
        onPageSize={(s) => { setPageSize(s); setPage(1); }}
      />
    </div>
  );
}
