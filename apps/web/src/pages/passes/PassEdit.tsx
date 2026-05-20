import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { z } from 'zod';
import clsx from 'clsx';
import { FileUpload } from '@/components/FileUpload';
import { api } from '@/lib/api';
import { AIRPORTS, ZONE_COLORS, ZONE_ORDER } from '@/lib/constants';
import { AirportCode, GatePass, Staff, SubcontractorOrg, ZoneCode } from '@/lib/types';

const schema = z.object({
  passNumber: z.string().regex(/^\d{6}$/, '6 digits'),
  staffId: z.string().uuid('Select a staff member'),
  organization: z.string().optional(),
  department: z.string().optional(),
  airport: z.enum(['AUH', 'AAN', 'SIR', 'AZI', 'ZDY', 'ALL']),
  issueDate: z.string().min(1, 'Required'),
  expiryDate: z.string().min(1, 'Required'),
});
type FormValues = z.infer<typeof schema>;

type StaffCategory = 'own' | 'subcontractor';

export default function PassEdit() {
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const nav = useNavigate();
  const qc = useQueryClient();

  const [zones, setZones] = useState<Set<ZoneCode>>(new Set());
  const [docs, setDocs] = useState<Record<string, string | null>>({});
  const [category, setCategory] = useState<StaffCategory>('own');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');

  // ── Queries ────────────────────────────────────────────────────────────
  const { data: existing } = useQuery({
    queryKey: ['gate-passes', id],
    queryFn: async () => (await api.get(`/gate-passes/${id}`)).data as GatePass,
    enabled: editing,
  });

  const { data: allStaff = [] } = useQuery({
    queryKey: ['staff'],
    queryFn: async () => (await api.get('/staff')).data as Staff[],
  });

  const { data: subOrgs = [] } = useQuery({
    queryKey: ['subcontractor-orgs'],
    queryFn: async () => (await api.get('/subcontractor-orgs')).data as SubcontractorOrg[],
  });

  // ── Form ───────────────────────────────────────────────────────────────
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } =
    useForm<FormValues>({ resolver: zodResolver(schema) });

  const issueDate  = watch('issueDate');
  const staffId    = watch('staffId');

  // ── Derived staff lists ────────────────────────────────────────────────
  const ownStaff  = allStaff.filter((s) => !s.subcontractorOrgId && s.isActive);
  const subStaff  = allStaff.filter((s) =>  s.subcontractorOrgId && s.isActive);
  const filteredSubStaff = selectedOrgId
    ? subStaff.filter((s) => s.subcontractorOrgId === selectedOrgId)
    : subStaff;

  const visibleStaff = category === 'own' ? ownStaff : filteredSubStaff;

  // ── Auto-fill org when subcontractor org selected ──────────────────────
  useEffect(() => {
    if (category === 'subcontractor' && selectedOrgId) {
      const org = subOrgs.find((o) => o.id === selectedOrgId);
      if (org) setValue('organization', org.name);
    }
    if (category === 'own') {
      setValue('organization', '');
    }
    setValue('staffId', '' as any);   // reset staff when category changes
  }, [category, selectedOrgId, subOrgs, setValue]);

  // ── Load existing pass for edit ────────────────────────────────────────
  useEffect(() => {
    if (!existing) return;
    const isSubStaff = allStaff.find((s) => s.id === existing.staff.id)?.subcontractorOrgId;
    setCategory(isSubStaff ? 'subcontractor' : 'own');
    if (isSubStaff) setSelectedOrgId(isSubStaff);
    reset({
      passNumber:   existing.passNumber,
      staffId:      existing.staff.id,
      organization: existing.organization ?? '',
      department:   existing.department ?? '',
      airport:      existing.airport,
      issueDate:    existing.issueDate.slice(0, 10),
      expiryDate:   existing.expiryDate.slice(0, 10),
    });
    setZones(new Set(existing.zones.map((z) => z.zoneCode)));
    setDocs({
      passScanFrontUrl: existing.passScanFrontUrl ?? null,
      passScanBackUrl:  existing.passScanBackUrl  ?? null,
      receiptScanUrl:   existing.receiptScanUrl   ?? null,
    });
  }, [existing, allStaff, reset]);

  // ── Auto-calc expiry ───────────────────────────────────────────────────
  useEffect(() => {
    if (!editing && issueDate) {
      const d = new Date(issueDate);
      d.setMonth(d.getMonth() + 6);
      setValue('expiryDate', d.toISOString().slice(0, 10));
    }
  }, [issueDate, editing, setValue]);

  // ── Selected staff info ────────────────────────────────────────────────
  const selectedStaff = allStaff.find((s) => s.id === staffId);

  // ── Save mutation ──────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload = {
        ...v,
        airport: v.airport as AirportCode,
        zoneCodes:        Array.from(zones),
        passScanFrontUrl: docs.passScanFrontUrl ?? undefined,
        passScanBackUrl:  docs.passScanBackUrl  ?? undefined,
        receiptScanUrl:   docs.receiptScanUrl   ?? undefined,
      };
      const res = editing
        ? await api.patch(`/gate-passes/${id}`, payload)
        : await api.post('/gate-passes', payload);
      return res.data as GatePass;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['gate-passes'] });
      toast.success(editing ? 'Saved' : 'Pass created');
      nav(`/passes/${data.id}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Save failed'),
  });

  const onSubmit = (v: FormValues) => {
    if (zones.size === 0) { toast.error('Select at least one zone'); return; }
    save.mutate(v);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{editing ? 'Edit Gate Pass' : 'New Gate Pass'}</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {category === 'own' ? 'Direct employee pass' : 'Subcontractor staff pass'}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => nav(-1)}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-bg-input transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting}
            className="px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold disabled:opacity-50 transition-colors">
            {editing ? 'Save changes' : 'Create pass'}
          </button>
        </div>
      </div>

      {/* ── Staff Category Toggle ─────────────────────────────────────── */}
      <Section
        title="Staff Category"
        subtitle="Identifies whether this pass is for a direct employee or a subcontractor — used for compliance reporting."
      >
        <div className="flex gap-3">
          <CategoryCard
            active={category === 'own'}
            onClick={() => setCategory('own')}
            icon={User}
            color="#2D7DD2"
            label="Own Staff"
            description="Direct employees on your payroll"
            count={ownStaff.length}
          />
          <CategoryCard
            active={category === 'subcontractor'}
            onClick={() => setCategory('subcontractor')}
            icon={Building2}
            color="#F47316"
            label="Subcontractor"
            description="Third-party contractor employees"
            count={subStaff.length}
          />
        </div>

        {/* Subcontractor org picker */}
        {category === 'subcontractor' && (
          <div className="mt-4">
            <label className="block text-sm text-text-secondary mb-1 font-medium">
              Subcontractor Organisation <span className="text-brand-orange">*</span>
            </label>
            {subOrgs.length === 0 ? (
              <div className="input flex items-center gap-2 text-text-secondary">
                <Building2 size={14} />
                <span className="text-sm">No subcontractor organisations set up yet. Add one under System → Subcontractors.</span>
              </div>
            ) : (
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="input"
              >
                <option value="">All subcontractor orgs…</option>
                {subOrgs.filter((o) => o.isActive).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </Section>

      {/* ── Pass Details ──────────────────────────────────────────────── */}
      <Section title="Pass Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Pass number" error={errors.passNumber?.message}>
            <input {...register('passNumber')} placeholder="123456" className="input" />
          </Field>

          <Field label="Staff member" error={errors.staffId?.message}>
            <select {...register('staffId')} className="input">
              <option value="">Select staff…</option>
              {visibleStaff.length === 0 ? (
                <option disabled>
                  {category === 'own'
                    ? 'No own staff found — add staff first'
                    : selectedOrgId
                    ? 'No staff in this org'
                    : 'Select an org above to filter staff'}
                </option>
              ) : (
                visibleStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.designation ? ` · ${s.designation}` : ''}
                  </option>
                ))
              )}
            </select>
            {/* Selected staff preview */}
            {selectedStaff && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-text-secondary">
                <span className={clsx(
                  'px-1.5 py-0.5 rounded font-semibold',
                  selectedStaff.subcontractorOrgId
                    ? 'bg-brand-orange/15 text-brand-orange'
                    : 'bg-brand-mid/15 text-brand-mid'
                )}>
                  {selectedStaff.subcontractorOrgId ? 'Subcontractor' : 'Own Staff'}
                </span>
                {selectedStaff.nationality && <span>{selectedStaff.nationality}</span>}
              </div>
            )}
          </Field>

          <Field label="Organisation">
            <input {...register('organization')} className="input"
              placeholder={category === 'subcontractor' ? 'Auto-filled from subcontractor org' : 'Company name'} />
          </Field>

          <Field label="Department">
            <input {...register('department')} className="input" />
          </Field>

          <Field label="Airport" error={errors.airport?.message}>
            <select {...register('airport')} className="input">
              <option value="">Select…</option>
              {AIRPORTS.map((a) => (
                <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Issue date" error={errors.issueDate?.message}>
              <input type="date" {...register('issueDate')} className="input" />
            </Field>
            <Field label="Expiry date" error={errors.expiryDate?.message}>
              <input type="date" {...register('expiryDate')} className="input" />
            </Field>
          </div>
        </div>
      </Section>

      {/* ── Access Zones ─────────────────────────────────────────────── */}
      <Section title="Access Zones">
        <p className="text-text-secondary text-sm mb-3">Select all zones this pass authorises.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {ZONE_ORDER.map((z) => {
            const checked = zones.has(z);
            return (
              <label key={z}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border cursor-pointer hover:bg-bg-input transition-colors">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = new Set(zones);
                    e.target.checked ? next.add(z) : next.delete(z);
                    setZones(next);
                  }}
                  className="accent-accent-primary"
                />
                <span className="px-2 py-0.5 rounded text-xs text-white font-medium"
                  style={{ background: ZONE_COLORS[z].bg }}>
                  {ZONE_COLORS[z].label}
                </span>
                <span className="text-sm">{ZONE_COLORS[z].name}</span>
              </label>
            );
          })}
        </div>
      </Section>

      {/* ── Documents ────────────────────────────────────────────────── */}
      <Section title="Documents">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FileUpload documentType="PASS_SCAN_FRONT" label="Pass scan (front)"
            initialUrl={docs.passScanFrontUrl ?? null}
            onUploaded={(r) => setDocs((d) => ({ ...d, passScanFrontUrl: r.fileUrl }))} />
          <FileUpload documentType="PASS_SCAN_BACK" label="Pass scan (back)"
            initialUrl={docs.passScanBackUrl ?? null}
            onUploaded={(r) => setDocs((d) => ({ ...d, passScanBackUrl: r.fileUrl }))} />
          <FileUpload documentType="RECEIPT" label="Receipt"
            initialUrl={docs.receiptScanUrl ?? null}
            onUploaded={(r) => setDocs((d) => ({ ...d, receiptScanUrl: r.fileUrl }))} />
        </div>
      </Section>

      <style>{`
        .input {
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 10px;
          width: 100%;
          outline: none;
          color: var(--text-primary);
          font-size: 0.875rem;
        }
        .input:focus { border-color: #F47316; }
      `}</style>
    </form>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function CategoryCard({
  active, onClick, icon: Icon, color, label, description, count,
}: {
  active: boolean; onClick: () => void; icon: React.ElementType;
  color: string; label: string; description: string; count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex-1 flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
        active
          ? 'border-brand-orange bg-brand-orange/8'
          : 'border-border hover:border-border hover:bg-bg-input',
      )}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}22`, color }}>
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{label}</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded font-semibold"
            style={{ background: `${color}22`, color }}>
            {count} staff
          </span>
          {active && (
            <span className="ml-auto w-4 h-4 rounded-full bg-brand-orange flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-white" />
            </span>
          )}
        </div>
        <p className="text-xs text-text-secondary mt-0.5">{description}</p>
      </div>
    </button>
  );
}

function Section({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-bg-card border border-border rounded-xl p-5">
      <div className="mb-4">
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, error, children }: {
  label: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-text-secondary mb-1 font-medium">{label}</label>
      {children}
      {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
    </div>
  );
}
