import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '@/lib/api';
import type { OnboardingStage } from '@/lib/types';

// Stage labels (same source of truth as NewHireForm)
const STAGE_LABELS: Record<string, string> = {
  VISIT_VISA_PENDING:   'Visit Visa — Pending',
  VISIT_VISA_VALID:     'Visit Visa — Valid',
  VISIT_VISA_EXPIRED:   'Visit Visa — Expired',
  VISIT_VISA_CANCELLED: 'Visit Visa — Cancelled',
  WORK_PERMIT_PENDING:  'Work Permit — Pending',
  WORK_PERMIT_APPROVED: 'Work Permit — Approved',
  WORK_PERMIT_REJECTED: 'Work Permit — Rejected',
  MEDICAL_PENDING:      'Medical — Pending',
  MEDICAL_COMPLETED:    'Medical — Completed',
  INSURANCE_PENDING:    'Insurance — Pending',
  INSURANCE_COMPLETED:  'Insurance — Completed',
  RESIDENCY_PENDING:    'Residency — Pending',
  RESIDENCY_COMPLETED:  'Residency — Completed',
  EID_PENDING:          'EID — Pending',
  EID_DELIVERED:        'EID — Delivered',
  ONBOARDED:            'Onboarded',
  CANCELLED:            'Cancelled',
};

// Next-stage options keyed by current stage. null → starting from nothing.
const NEXT_STAGES: Record<string, OnboardingStage[]> = {
  '__none__':           ['VISIT_VISA_PENDING'],
  VISIT_VISA_PENDING:   ['VISIT_VISA_VALID', 'VISIT_VISA_CANCELLED'],
  VISIT_VISA_VALID:     ['VISIT_VISA_EXPIRED', 'WORK_PERMIT_PENDING'],
  VISIT_VISA_EXPIRED:   ['WORK_PERMIT_PENDING', 'VISIT_VISA_CANCELLED'],
  VISIT_VISA_CANCELLED: [],
  WORK_PERMIT_PENDING:  ['WORK_PERMIT_APPROVED', 'WORK_PERMIT_REJECTED'],
  WORK_PERMIT_APPROVED: ['MEDICAL_PENDING'],
  WORK_PERMIT_REJECTED: [],
  MEDICAL_PENDING:      ['MEDICAL_COMPLETED'],
  MEDICAL_COMPLETED:    ['INSURANCE_PENDING'],
  INSURANCE_PENDING:    ['INSURANCE_COMPLETED'],
  INSURANCE_COMPLETED:  ['RESIDENCY_PENDING'],
  RESIDENCY_PENDING:    ['RESIDENCY_COMPLETED'],
  RESIDENCY_COMPLETED:  ['EID_PENDING'],
  EID_PENDING:          ['EID_DELIVERED'],
  EID_DELIVERED:        ['ONBOARDED'],
  ONBOARDED:            [],
  CANCELLED:            [],
};

function stageColor(stage: string | null | undefined) {
  if (!stage) return { bg: 'bg-bg-input', text: 'text-text-secondary', dot: 'bg-gray-500' };
  if (stage === 'ONBOARDED' || stage === 'EID_DELIVERED' || stage.endsWith('_COMPLETED') || stage.endsWith('_APPROVED') || stage.endsWith('_VALID')) {
    return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' };
  }
  if (stage === 'CANCELLED' || stage === 'VISIT_VISA_CANCELLED' || stage === 'VISIT_VISA_EXPIRED' || stage === 'WORK_PERMIT_REJECTED') {
    return { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' };
  }
  if (stage.endsWith('_PENDING')) {
    return { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500' };
  }
  return { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-500' };
}

interface OnboardingState {
  employeeId: string;
  employeeName: string;
  isNewEmployee: boolean;
  currentState: OnboardingStage | null;
  tasks: Array<{
    id: string;
    stage: string;
    status: string;
    completedAt: string | null;
    notes: string | null;
  }>;
}

export function OnboardingPanel({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const [advancing, setAdvancing] = useState<OnboardingStage | null>(null);
  const [notes, setNotes] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['employee-onboarding', employeeId],
    queryFn: async () => (await api.get(`/employees/${employeeId}/onboarding`)).data as OnboardingState,
    retry: 1,
  });

  const advance = useMutation({
    mutationFn: async (stage: OnboardingStage) =>
      api.post(`/employees/${employeeId}/onboarding/advance`, {
        stage,
        status: 'COMPLETED',
        notes: notes || undefined,
      }),
    onSuccess: (res) => {
      const promoted = (res.data as { promotedToStaff?: boolean })?.promotedToStaff;
      if (promoted) {
        toast.success('EID delivered — promoted to active staff', { duration: 5000 });
      } else {
        toast.success('Stage advanced');
      }
      qc.invalidateQueries({ queryKey: ['employee', employeeId] });
      qc.invalidateQueries({ queryKey: ['employee-onboarding', employeeId] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['staff'] });
      setAdvancing(null);
      setNotes('');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message ?? 'Failed to advance stage';
      toast.error(Array.isArray(msg) ? msg.join('; ') : String(msg));
    },
  });

  if (isLoading) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-5 text-sm text-text-secondary">
        Loading onboarding state…
      </div>
    );
  }

  if (error || !data) {
    const msg = (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
      ?? (error as { message?: string })?.message
      ?? 'Unknown error';
    return (
      <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-5 text-sm text-rose-300">
        <div className="font-semibold mb-1">Could not load onboarding state</div>
        <div className="text-xs">{msg}</div>
      </div>
    );
  }

  // Show panel for any employee that's in the onboarding pipeline OR was once.
  // We keep showing it after promotion so the audit trail is still visible.
  if (!data.isNewEmployee && !data.currentState && data.tasks.length === 0) return null;

  const currentKey = data.currentState ?? '__none__';
  const nextOptions = NEXT_STAGES[currentKey] ?? [];
  const currentColor = stageColor(data.currentState);
  const isTerminal = data.currentState === 'ONBOARDED' || data.currentState === 'CANCELLED';

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-brand-orange/15 flex items-center justify-center">
            <Sparkles size={16} className="text-brand-orange" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Onboarding Pipeline</h2>
            <p className="text-xs text-text-secondary">
              {data.isNewEmployee ? 'Active in new-hire pipeline' : 'Promoted to active staff'}
            </p>
          </div>
        </div>
        <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', currentColor.bg, currentColor.text)}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', currentColor.dot)} />
          {data.currentState ? STAGE_LABELS[data.currentState] : 'Not started'}
        </span>
      </div>

      {/* Completed tasks timeline */}
      {data.tasks.length > 0 && (
        <div className="border-t border-border pt-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-2">
            Completed Steps
          </div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {data.tasks
              .filter((t) => t.status === 'COMPLETED')
              .map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
                  <span className="text-text-primary">{STAGE_LABELS[t.stage] ?? t.stage}</span>
                  {t.completedAt && (
                    <span className="text-text-secondary text-[10px]">
                      {new Date(t.completedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Next-stage actions */}
      {!isTerminal && nextOptions.length > 0 && (
        <div className="border-t border-border pt-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-2">
            Advance To
          </div>
          {advancing ? (
            <div className="space-y-3">
              <div className="text-sm">
                Advancing to <span className="font-semibold text-text-primary">{STAGE_LABELS[advancing]}</span>
              </div>
              {advancing === 'EID_DELIVERED' && (
                <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                  Once marked, this hire is automatically promoted to <strong>active staff</strong> and removed from the new-hire pipeline.
                </div>
              )}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)…"
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:border-brand-orange resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setAdvancing(null); setNotes(''); }}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate(advancing)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {advance.isPending ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                  Confirm
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {nextOptions.map((stage) => {
                const c = stageColor(stage);
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => setAdvancing(stage)}
                    className={clsx(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-opacity-20',
                      c.bg,
                      c.text,
                      'border-current/30',
                    )}
                  >
                    <ArrowRight size={11} />
                    {STAGE_LABELS[stage]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isTerminal && (
        <div className="border-t border-border pt-3 text-xs text-text-secondary">
          {data.currentState === 'ONBOARDED'
            ? 'Onboarding complete — this employee is fully onboarded.'
            : 'Onboarding was cancelled.'}
        </div>
      )}
    </div>
  );
}
