import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, RotateCcw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThresholdRow {
  docKind:      string;
  band1Days:    number;
  band2Days:    number;
  band3Days:    number;
  isOverridden: boolean;
  updatedAt:    string | null;
}

// ─── Doc kind labels ──────────────────────────────────────────────────────────

const DOC_KIND_LABELS: Record<string, string> = {
  GATE_PASS:           'Gate Pass',
  CAR_LICENSE:         'Car License',
  VEHICLE_INSURANCE:   'Vehicle Insurance',
  RESIDENTIAL_MAWAQIF: 'Residential Mawaqif',
  NORMAL_MAWAQIF:      'Normal Mawaqif',
  OPERATOR_LICENSE:    'Operator License',
  INSPECTION_CERT:     'Inspection Certificate',
  RTA_REGISTRATION:    'RTA Registration',
  LIFTING_TEST:        'Lifting Test',
  MACHINERY_INSURANCE: 'Machinery Insurance',
  CIVIL_DEFENSE:       'Civil Defense',
  VISA:                'Visa',
  EMIRATES_ID:         'Emirates ID',
  LABOR_CARD:          'Labor Card',
  PASSPORT:            'Passport',
  TRADE_LICENSE:       'Trade License',
  ESTABLISHMENT_CARD:  'Establishment Card',
  CLASSIFICATION:      'Classification',
  POWER_OF_ATTORNEY:   'Power of Attorney',
  OFFICE_TENANCY:      'Office Tenancy',
  HASSANTUK:           'Hassantuk Certificate',
};

const GROUP_LABELS: Record<string, string[]> = {
  'Gate Pass':       ['GATE_PASS'],
  'Vehicles':        ['CAR_LICENSE', 'VEHICLE_INSURANCE', 'RESIDENTIAL_MAWAQIF', 'NORMAL_MAWAQIF'],
  'Heavy Machinery': ['OPERATOR_LICENSE', 'INSPECTION_CERT', 'RTA_REGISTRATION', 'LIFTING_TEST', 'MACHINERY_INSURANCE', 'CIVIL_DEFENSE'],
  'Employees':       ['VISA', 'EMIRATES_ID', 'LABOR_CARD', 'PASSPORT'],
  'Company Docs':    ['TRADE_LICENSE', 'ESTABLISHMENT_CARD', 'CLASSIFICATION', 'POWER_OF_ATTORNEY', 'OFFICE_TENANCY', 'HASSANTUK'],
};

// ─── Row editing state ────────────────────────────────────────────────────────

interface EditState {
  band1: string;
  band2: string;
  band3: string;
}

function validateEdit(e: EditState): string | null {
  const b1 = parseInt(e.band1, 10);
  const b2 = parseInt(e.band2, 10);
  const b3 = parseInt(e.band3, 10);
  if (Number.isNaN(b1) || Number.isNaN(b2) || Number.isNaN(b3)) return 'All values must be whole numbers';
  if (b1 < 1 || b2 < 1 || b3 < 1)  return 'All values must be ≥ 1';
  if (b1 > 365 || b2 > 365 || b3 > 365) return 'All values must be ≤ 365';
  if (!(b1 > b2 && b2 > b3)) return 'Band 1 > Band 2 > Band 3 required';
  return null;
}

// ─── Single row component ─────────────────────────────────────────────────────

function ThresholdRowEditor({
  row,
  onSaved,
}: {
  row: ThresholdRow;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<EditState>({
    band1: String(row.band1Days),
    band2: String(row.band2Days),
    band3: String(row.band3Days),
  });
  const [touched, setTouched] = useState(false);
  const error = touched ? validateEdit(edit) : null;

  useEffect(() => {
    setEdit({ band1: String(row.band1Days), band2: String(row.band2Days), band3: String(row.band3Days) });
    setTouched(false);
  }, [row.band1Days, row.band2Days, row.band3Days]);

  const isDirty =
    edit.band1 !== String(row.band1Days) ||
    edit.band2 !== String(row.band2Days) ||
    edit.band3 !== String(row.band3Days);

  const save = useMutation({
    mutationFn: async () => {
      const b1 = parseInt(edit.band1, 10);
      const b2 = parseInt(edit.band2, 10);
      const b3 = parseInt(edit.band3, 10);
      return api.put(`/tenants/me/alarm-thresholds/${row.docKind}`, {
        band1Days: b1,
        band2Days: b2,
        band3Days: b3,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alarm-thresholds'] });
      toast.success(`${DOC_KIND_LABELS[row.docKind] ?? row.docKind} thresholds saved`);
      onSaved();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string | string[] } } })
        .response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join('; ') : String(msg ?? 'Save failed'));
    },
  });

  const reset = useMutation({
    mutationFn: async () => api.delete(`/tenants/me/alarm-thresholds/${row.docKind}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alarm-thresholds'] });
      toast.success(`${DOC_KIND_LABELS[row.docKind] ?? row.docKind} reset to defaults`);
    },
    onError: () => toast.error('Reset failed'),
  });

  const inputCls = (hasError: boolean) =>
    clsx(
      'w-16 text-center px-2 py-1.5 rounded-lg bg-bg-input border text-sm font-mono transition-colors focus:outline-none',
      hasError ? 'border-rose-500 focus:border-rose-400' : 'border-border focus:border-brand-orange',
    );

  const handleChange = (field: keyof EditState, value: string) => {
    setEdit((prev) => ({ ...prev, [field]: value }));
    setTouched(true);
  };

  const handleSave = () => {
    setTouched(true);
    if (validateEdit(edit)) return;
    save.mutate();
  };

  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-bg-input/30 transition-colors">
      {/* Doc Kind */}
      <td className="py-3 px-4">
        <div className="text-sm font-medium">{DOC_KIND_LABELS[row.docKind] ?? row.docKind}</div>
        <div className="text-[11px] text-text-secondary font-mono">{row.docKind}</div>
      </td>

      {/* Band 1 input */}
      <td className="py-3 px-3 text-center">
        <input
          type="number"
          min={1}
          max={365}
          value={edit.band1}
          onChange={(e) => handleChange('band1', e.target.value)}
          className={inputCls(!!error && touched)}
        />
      </td>

      {/* Band 2 input */}
      <td className="py-3 px-3 text-center">
        <input
          type="number"
          min={1}
          max={365}
          value={edit.band2}
          onChange={(e) => handleChange('band2', e.target.value)}
          className={inputCls(!!error && touched)}
        />
      </td>

      {/* Band 3 input */}
      <td className="py-3 px-3 text-center">
        <input
          type="number"
          min={1}
          max={365}
          value={edit.band3}
          onChange={(e) => handleChange('band3', e.target.value)}
          className={inputCls(!!error && touched)}
        />
      </td>

      {/* Status */}
      <td className="py-3 px-3">
        {row.isOverridden ? (
          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-brand-orange/10 text-brand-orange">
            Custom
          </span>
        ) : (
          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-bg-input text-text-secondary">
            Default
          </span>
        )}
      </td>

      {/* Actions */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          {error && touched && (
            <span className="text-[10px] text-rose-500 max-w-32 leading-tight">{error}</span>
          )}
          <button
            disabled={!isDirty || save.isPending || !!error}
            onClick={handleSave}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-semibold transition-colors disabled:opacity-40"
          >
            <Save size={12} />
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
          {row.isOverridden && (
            <button
              disabled={reset.isPending}
              onClick={() => reset.mutate()}
              title="Reset to defaults"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary hover:border-rose-400 transition-colors disabled:opacity-40"
            >
              <RotateCcw size={11} />
              {reset.isPending ? '…' : 'Reset'}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AlarmThresholdsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['alarm-thresholds'],
    queryFn: async () =>
      (await api.get('/tenants/me/alarm-thresholds')).data as ThresholdRow[],
  });

  const rowMap = new Map((data ?? []).map((r) => [r.docKind, r]));

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Bell size={20} />
          Alarm Thresholds
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Configure how many days before expiry each alert band fires.
          Defaults: <span className="font-mono">30 / 14 / 7 days</span>.
          Band 1 &gt; Band 2 &gt; Band 3 is required.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-text-secondary">Loading…</div>
      ) : (
        Object.entries(GROUP_LABELS).map(([groupLabel, docKinds]) => (
          <section key={groupLabel} className="bg-bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-bg-input/40">
              <h2 className="font-semibold text-sm">{groupLabel}</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary border-b border-border">
                  <th className="text-left px-4 py-2">Doc Kind</th>
                  <th className="text-center px-3 py-2 w-20">Band 1</th>
                  <th className="text-center px-3 py-2 w-20">Band 2</th>
                  <th className="text-center px-3 py-2 w-20">Band 3</th>
                  <th className="text-left px-3 py-2 w-24">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {docKinds.map((docKind) => {
                  const row = rowMap.get(docKind) ?? {
                    docKind,
                    band1Days: 30,
                    band2Days: 14,
                    band3Days: 7,
                    isOverridden: false,
                    updatedAt: null,
                  };
                  return (
                    <ThresholdRowEditor
                      key={docKind}
                      row={row}
                      onSaved={() => qc.invalidateQueries({ queryKey: ['alarm-thresholds'] })}
                    />
                  );
                })}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}
