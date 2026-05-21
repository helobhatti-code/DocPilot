import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '@/lib/api';
import type { Employee, OnboardingStage, Paginated } from '@/lib/types';

// ─── Stage ordering + display labels ─────────────────────────────────────────

interface StageConfig {
  stage: OnboardingStage;
  label: string;
  phase: string;
}

const STAGE_ORDER: StageConfig[] = [
  { stage: 'VISIT_VISA_PENDING',    label: 'Visit Visa — Pending',    phase: 'Visa' },
  { stage: 'VISIT_VISA_VALID',      label: 'Visit Visa — Valid',       phase: 'Visa' },
  { stage: 'VISIT_VISA_EXPIRED',    label: 'Visit Visa — Expired',     phase: 'Visa' },
  { stage: 'VISIT_VISA_CANCELLED',  label: 'Visit Visa — Cancelled',   phase: 'Visa' },
  { stage: 'WORK_PERMIT_PENDING',   label: 'Work Permit — Pending',    phase: 'Work Permit' },
  { stage: 'WORK_PERMIT_APPROVED',  label: 'Work Permit — Approved',   phase: 'Work Permit' },
  { stage: 'WORK_PERMIT_REJECTED',  label: 'Work Permit — Rejected',   phase: 'Work Permit' },
  { stage: 'MEDICAL_PENDING',       label: 'Medical — Pending',        phase: 'Medical' },
  { stage: 'MEDICAL_COMPLETED',     label: 'Medical — Completed',      phase: 'Medical' },
  { stage: 'INSURANCE_PENDING',     label: 'Insurance — Pending',      phase: 'Insurance' },
  { stage: 'INSURANCE_COMPLETED',   label: 'Insurance — Completed',    phase: 'Insurance' },
  { stage: 'RESIDENCY_PENDING',     label: 'Residency — Pending',      phase: 'Residency' },
  { stage: 'RESIDENCY_COMPLETED',   label: 'Residency — Completed',    phase: 'Residency' },
  { stage: 'EID_PENDING',           label: 'EID — Pending',            phase: 'EID' },
  { stage: 'EID_DELIVERED',         label: 'EID — Delivered',          phase: 'EID' },
  { stage: 'ONBOARDED',             label: 'Onboarded',                phase: 'Done' },
  { stage: 'CANCELLED',             label: 'Cancelled',                phase: 'Cancelled' },
];

// ─── Colour coding (matches spec: green/orange/red/grey) ─────────────────────

function stageColor(stage: OnboardingStage | null | undefined): {
  bg: string; text: string; border: string; dot: string;
} {
  if (!stage) return { bg: 'bg-bg-input', text: 'text-text-secondary', border: 'border-border', dot: 'bg-gray-500' };

  if (stage === 'ONBOARDED') {
    return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500' };
  }
  if (stage === 'CANCELLED' || stage === 'VISIT_VISA_CANCELLED' || stage === 'VISIT_VISA_EXPIRED' || stage === 'WORK_PERMIT_REJECTED') {
    return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-500' };
  }
  if (stage.endsWith('_COMPLETED') || stage.endsWith('_VALID') || stage.endsWith('_APPROVED') || stage === 'EID_DELIVERED') {
    return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500' };
  }
  if (stage.endsWith('_PENDING')) {
    return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500' };
  }
  return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-500' };
}

// ─── Stage pill ───────────────────────────────────────────────────────────────

function StagePill({ stage }: { stage: OnboardingStage | null | undefined }) {
  const { bg, text, dot } = stageColor(stage);
  const label = STAGE_ORDER.find((s) => s.stage === stage)?.label ?? stage ?? 'Not started';
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold', bg, text)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', dot)} />
      {label}
    </span>
  );
}

// ─── Grace period badge ───────────────────────────────────────────────────────

function GraceBadge({ endsAt }: { endsAt: string }) {
  const days = Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / (24 * 3600 * 1000)));
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-400">
      <AlertTriangle size={10} />
      Grace: {days}d left
    </span>
  );
}

// ─── Employee row ─────────────────────────────────────────────────────────────

function EmployeeRow({ emp, onClick }: { emp: Employee; onClick: () => void }) {
  const { border } = stageColor(emp.onboardingState);
  const hasGrace = emp.onboardingState === 'VISIT_VISA_CANCELLED' && emp.cancellationGraceEndsAt;

  return (
    <tr
      className={clsx('border-l-2 cursor-pointer hover:bg-bg-input/60 transition-colors', border)}
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <div className="font-medium text-sm text-text-primary">{emp.name}</div>
        <div className="text-xs text-text-secondary">{emp.designation}</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <StagePill stage={emp.onboardingState} />
          {hasGrace && <GraceBadge endsAt={emp.cancellationGraceEndsAt!} />}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-text-secondary font-mono">{emp.emiratesIdNo}</td>
      <td className="px-4 py-3 text-xs text-text-secondary">{emp.joinDate?.slice(0, 10) ?? '—'}</td>
      <td className="px-4 py-3">
        <button
          className="text-xs px-2.5 py-1 rounded bg-bg-input hover:bg-brand-orange/10 text-text-secondary hover:text-brand-orange transition-colors"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        >
          View
        </button>
      </td>
    </tr>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({ config, employees, onSelect }: {
  config: StageConfig;
  employees: Employee[];
  onSelect: (emp: Employee) => void;
}) {
  const { bg, text, border } = stageColor(config.stage);
  return (
    <div className={clsx('flex-shrink-0 w-52 rounded-lg border', border, bg)}>
      <div className={clsx('px-3 py-2 border-b text-[11px] font-bold uppercase tracking-wide', border, text)}>
        {config.label}
        <span className="ml-1.5 opacity-60">({employees.length})</span>
      </div>
      <div className="p-2 space-y-1.5 max-h-80 overflow-y-auto">
        {employees.length === 0 && (
          <p className="text-[10px] text-text-secondary text-center py-4">Empty</p>
        )}
        {employees.map((emp) => (
          <div
            key={emp.id}
            onClick={() => onSelect(emp)}
            className="p-2 rounded bg-bg-surface border border-border hover:border-brand-orange/40 cursor-pointer transition-colors"
          >
            <div className="text-xs font-medium text-text-primary truncate">{emp.name}</div>
            <div className="text-[10px] text-text-secondary truncate">{emp.designation}</div>
            {emp.onboardingState === 'VISIT_VISA_CANCELLED' && emp.cancellationGraceEndsAt && (
              <div className="mt-1">
                <GraceBadge endsAt={emp.cancellationGraceEndsAt} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── View toggle ─────────────────────────────────────────────────────────────

type ViewMode = 'table' | 'kanban';

// ─── Main component ───────────────────────────────────────────────────────────

export default function NewEmployeesPipeline() {
  const nav     = useNavigate();
  const [view, setView] = React.useState<ViewMode>('table');

  const { data, isLoading } = useQuery({
    queryKey: ['employees', 'new'],
    queryFn: async () =>
      (await api.get('/employees', { params: { isNewEmployee: true, pageSize: 200 } }))
        .data as Paginated<Employee>,
    refetchInterval: 60_000,
  });

  const employees = data?.items ?? [];

  // Group by onboardingState for kanban
  const byStage = React.useMemo(() => {
    const map = new Map<OnboardingStage | 'unset', Employee[]>();
    for (const emp of employees) {
      const key = emp.onboardingState ?? 'unset';
      const arr = map.get(key as OnboardingStage) ?? [];
      arr.push(emp);
      map.set(key as OnboardingStage, arr);
    }
    return map;
  }, [employees]);

  const summary = React.useMemo(() => ({
    total:     employees.length,
    onboarded: employees.filter((e) => e.onboardingState === 'ONBOARDED').length,
    inGrace:   employees.filter((e) => e.onboardingState === 'VISIT_VISA_CANCELLED').length,
    cancelled: employees.filter((e) => e.onboardingState === 'CANCELLED').length,
  }), [employees]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-secondary text-sm">
        Loading onboarding pipeline…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total',     value: summary.total,     color: 'text-text-primary' },
          { label: 'Onboarded', value: summary.onboarded, color: 'text-emerald-400' },
          { label: 'In Grace',  value: summary.inGrace,   color: 'text-red-400' },
          { label: 'Cancelled', value: summary.cancelled, color: 'text-red-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-bg-input rounded-lg p-3 border border-border">
            <div className={clsx('text-2xl font-bold', color)}>{value}</div>
            <div className="text-xs text-text-secondary mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          {employees.length === 0
            ? 'No new employees in the onboarding pipeline yet.'
            : `${employees.length} employee${employees.length !== 1 ? 's' : ''} in pipeline`}
        </p>
        <div className="flex gap-1 p-0.5 bg-bg-input rounded-lg border border-border">
          {(['table', 'kanban'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={clsx(
                'px-3 py-1 rounded text-xs font-medium capitalize transition-colors',
                view === v
                  ? 'bg-brand-orange text-white'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* TABLE VIEW */}
      {view === 'table' && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-bg-input">
              <tr>
                {['Name / Designation', 'Onboarding Stage', 'Emirates ID', 'Join Date', ''].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-text-secondary">
                    <UserPlus size={32} className="mx-auto mb-2 opacity-30" />
                    No new employees yet. Mark an employee as &quot;New Employee&quot; to start onboarding.
                  </td>
                </tr>
              )}
              {employees.map((emp) => (
                <EmployeeRow
                  key={emp.id}
                  emp={emp}
                  onClick={() => nav(`/employees/${emp.id}/edit`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* KANBAN VIEW */}
      {view === 'kanban' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {STAGE_ORDER.map((config) => (
              <KanbanColumn
                key={config.stage}
                config={config}
                employees={byStage.get(config.stage) ?? []}
                onSelect={(emp) => nav(`/employees/${emp.id}/edit`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// React import for hooks used in JSX (Vite + React 17+ automatic JSX transform
// means we don't need the explicit import, but we reference React.useState directly
// above — pull it in)
import React from 'react';
