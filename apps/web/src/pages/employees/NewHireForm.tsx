import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPlus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '@/lib/api';
import type { OnboardingStage } from '@/lib/types';

type FormValues = {
  name: string;
  designation: string;
  nationality: string;
  passportNo: string;
  passportExpiryDate: string;
  phone: string;
  email: string;
  joinDate: string;
  onboardingState: OnboardingStage;
};

const STAGE_OPTIONS: { value: OnboardingStage; label: string }[] = [
  { value: 'VISIT_VISA_PENDING',    label: 'Visit Visa — Pending' },
  { value: 'VISIT_VISA_VALID',      label: 'Visit Visa — Valid' },
  { value: 'VISIT_VISA_EXPIRED',    label: 'Visit Visa — Expired' },
  { value: 'VISIT_VISA_CANCELLED',  label: 'Visit Visa — Cancelled' },
  { value: 'WORK_PERMIT_PENDING',   label: 'Work Permit — Pending' },
  { value: 'WORK_PERMIT_APPROVED',  label: 'Work Permit — Approved' },
  { value: 'WORK_PERMIT_REJECTED',  label: 'Work Permit — Rejected' },
  { value: 'MEDICAL_PENDING',       label: 'Medical — Pending' },
  { value: 'MEDICAL_COMPLETED',     label: 'Medical — Completed' },
  { value: 'INSURANCE_PENDING',     label: 'Insurance — Pending' },
  { value: 'INSURANCE_COMPLETED',   label: 'Insurance — Completed' },
  { value: 'RESIDENCY_PENDING',     label: 'Residency — Pending' },
  { value: 'RESIDENCY_COMPLETED',   label: 'Residency — Completed' },
  { value: 'EID_PENDING',           label: 'EID — Pending' },
  { value: 'EID_DELIVERED',         label: 'EID — Delivered' },
];

const inputCls =
  'w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:border-brand-orange transition-colors';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest text-text-secondary mb-1.5">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function NewHireForm() {
  const nav = useNavigate();
  const qc  = useQueryClient();

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { onboardingState: 'VISIT_VISA_PENDING' },
  });

  const save = useMutation({
    mutationFn: async (v: FormValues) => api.post('/employees', {
      name:               v.name,
      designation:        v.designation,
      nationality:        v.nationality || undefined,
      passportNo:         v.passportNo || undefined,
      passportExpiryDate: v.passportExpiryDate || undefined,
      phone:              v.phone || undefined,
      email:              v.email || undefined,
      joinDate:           v.joinDate || undefined,
      isNewEmployee:      true,
      onboardingState:    v.onboardingState,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['staff'] });
      toast.success('New hire added to onboarding pipeline');
      nav('/staff', { state: { tab: 'DIRECT_EMPLOYEE', subTab: 'NEW_HIRES' } });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message ?? 'Save failed';
      toast.error(Array.isArray(msg) ? msg.join('; ') : String(msg));
    },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-orange/15 flex items-center justify-center">
          <UserPlus size={18} className="text-brand-orange" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Add New Hire</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Capture basic details. Documents like Emirates ID, visa, and labor card will be added as onboarding progresses.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-5">
        {/* Identity */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Identity</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full Name" required>
              <input {...register('name', { required: true })} className={inputCls} />
            </Field>
            <Field label="Designation" required>
              <input {...register('designation', { required: true })} className={inputCls} />
            </Field>
            <Field label="Nationality">
              <input {...register('nationality')} placeholder="e.g. Indian, Pakistani, …" className={inputCls} />
            </Field>
            <Field label="Expected Join Date">
              <input {...register('joinDate')} type="date" className={inputCls} />
            </Field>
          </div>
        </div>

        {/* Passport (only document a new hire typically has) */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Passport</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Passport Number">
              <input {...register('passportNo')} className={inputCls} />
            </Field>
            <Field label="Passport Expiry">
              <input {...register('passportExpiryDate')} type="date" className={inputCls} />
            </Field>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Contact</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone">
              <input {...register('phone')} placeholder="+971 50 000 0000" className={inputCls} />
            </Field>
            <Field label="Email">
              <input {...register('email')} type="email" placeholder="name@example.com" className={inputCls} />
            </Field>
          </div>
        </div>

        {/* Onboarding stage */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Onboarding</h2>
          <Field label="Starting Stage" required>
            <select {...register('onboardingState', { required: true })} className={inputCls}>
              {STAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-text-secondary">
            Most new hires start at <span className="font-medium text-text-primary">Visit Visa — Pending</span>.
            Pick a later stage if this hire is joining mid-process.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => nav('/staff', { state: { tab: 'DIRECT_EMPLOYEE', subTab: 'NEW_HIRES' } })}
            className="px-4 py-2 rounded-lg border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={clsx(
              'inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold transition-colors disabled:opacity-50',
            )}
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            Add to Onboarding Pipeline
          </button>
        </div>
      </form>
    </div>
  );
}
