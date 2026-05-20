import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, Ban, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { CustodyBadge, ZoneList } from '@/components/Badge';
import { ConfirmModal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';
import { api } from '@/lib/api';
import { GatePass } from '@/lib/types';

interface CancellationRow extends GatePass {
  daysSinceCancellationRequested: number;
  isOverdue: boolean;
  cancellationRequestedAt?: string | null;
  cancellationReason?: string | null;
}

export default function CancellationsPage() {
  const qc = useQueryClient();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [completeFor, setCompleteFor] = useState<CancellationRow | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['cancellations-queue', overdueOnly],
    queryFn: async () =>
      (await api.get('/gate-passes/queues/cancellations', {
        params: overdueOnly ? { overdueOnly: 'true' } : {},
      })).data as CancellationRow[],
  });

  const complete = useMutation({
    mutationFn: async (id: string) => api.post(`/gate-passes/${id}/cancellation/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cancellations-queue'] });
      qc.invalidateQueries({ queryKey: ['gate-passes'] });
      toast.success('Cancellation completed');
      setCompleteFor(null);
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message ?? 'Completion failed');
    },
  });

  const overdueCount = items.filter((p) => p.isOverdue).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cancellation Queue</h1>
          <p className="text-sm text-text-secondary">
            {items.length} pending · {overdueCount > 0 && (
              <span className="text-status-expired">{overdueCount} overdue (&gt;7 days)</span>
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
            className="accent-accent-primary"
          />
          Show overdue only
        </label>
      </div>

      {isLoading ? (
        <div className="text-text-secondary">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Ban}
          title={overdueOnly ? 'No overdue cancellations' : 'Queue is empty'}
          description="Pending cancellations will appear here."
        />
      ) : (
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-input text-text-secondary">
              <tr>
                <th className="text-left px-4 py-2">Pass #</th>
                <th className="text-left px-4 py-2">Staff</th>
                <th className="text-left px-4 py-2">Zones</th>
                <th className="text-left px-4 py-2">Reason</th>
                <th className="text-left px-4 py-2">Requested</th>
                <th className="text-left px-4 py-2">Custody</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const canComplete = p.custodyStatus === 'SURRENDERED_TO_AUTHORITY';
                return (
                  <tr
                    key={p.id}
                    className={clsx(
                      'border-t border-border hover:bg-bg-input/30',
                      p.isOverdue && 'bg-status-expired/5',
                    )}
                  >
                    <td className="px-4 py-2 font-mono">
                      <Link to={`/passes/${p.id}`} className="text-accent-primary hover:underline">
                        {p.passNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{p.staff.name}</td>
                    <td className="px-4 py-2"><ZoneList codes={p.zones.map((z) => z.zoneCode)} /></td>
                    <td className="px-4 py-2 text-text-secondary truncate max-w-xs" title={p.cancellationReason ?? ''}>
                      {p.cancellationReason ?? '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span className={clsx(p.isOverdue ? 'text-status-expired font-medium' : 'text-text-secondary')}>
                        {p.daysSinceCancellationRequested}d ago
                        {p.isOverdue && <AlertTriangle size={12} className="inline ml-1" />}
                      </span>
                    </td>
                    <td className="px-4 py-2"><CustodyBadge status={p.custodyStatus} /></td>
                    <td className="px-4 py-2 flex gap-2 justify-end">
                      <button
                        onClick={() => setCompleteFor(p)}
                        disabled={!canComplete}
                        title={canComplete ? undefined : 'Surrender pass to authority before completing'}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-white bg-status-completed disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 size={12} /> Complete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={!!completeFor}
        onClose={() => setCompleteFor(null)}
        onConfirm={() => completeFor && complete.mutate(completeFor.id)}
        title={completeFor ? `Complete cancellation for ${completeFor.passNumber}` : ''}
        message="This marks the pass as CANCELLED and schedules data deletion per tenant retention policy. Continue?"
        confirmLabel="Complete cancellation"
      />
    </div>
  );
}
