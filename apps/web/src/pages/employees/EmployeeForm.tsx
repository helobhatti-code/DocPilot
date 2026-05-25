import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Employee } from '@/lib/types';

type FormValues = {
  name: string; designation: string;
  emiratesIdNo: string; emiratesIdExpiryDate: string;
  visaNo: string; visaExpiryDate: string;
  laborCardNo: string; laborCardExpiryDate: string;
  passportNo: string; passportExpiryDate: string;
  phone: string; email: string; joinDate: string;
  status: string; remarks: string;
};

export default function EmployeeForm() {
  const nav    = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const qc     = useQueryClient();
  const isEdit = !!id;

  const { data: existing } = useQuery({
    queryKey: ['employee', id],
    queryFn: async () => (await api.get(`/employees/${id}`)).data as Employee,
    enabled: isEdit,
  });

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { status: 'ACTIVE' },
  });

  useEffect(() => {
    if (existing) {
      reset({
        name:                 existing.name,
        designation:          existing.designation,
        emiratesIdNo:         existing.emiratesIdNo ?? '',
        emiratesIdExpiryDate: existing.emiratesIdExpiryDate?.slice(0, 10) ?? '',
        visaNo:               existing.visaNo ?? '',
        visaExpiryDate:       existing.visaExpiryDate?.slice(0, 10) ?? '',
        laborCardNo:          existing.laborCardNo ?? '',
        laborCardExpiryDate:  existing.laborCardExpiryDate?.slice(0, 10) ?? '',
        passportNo:           existing.passportNo ?? '',
        passportExpiryDate:   existing.passportExpiryDate?.slice(0, 10) ?? '',
        phone:                existing.phone ?? '',
        email:                existing.email ?? '',
        joinDate:             existing.joinDate?.slice(0, 10) ?? '',
        status:               existing.status,
        remarks:              existing.remarks ?? '',
      });
    }
  }, [existing, reset]);

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEdit) return api.patch(`/employees/${id}`, values);
      return api.post('/employees', values);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      if (id) qc.invalidateQueries({ queryKey: ['employee', id] });
      toast.success(isEdit ? 'Employee updated' : 'Employee created');
      nav('/employees');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Save failed'),
  });

  const F = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-label text-text-secondary mb-1.5">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );

  const inputCls = "w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:border-brand-orange transition-colors";

  const Input = ({ name, type = 'text' }: { name: keyof FormValues; type?: string }) => (
    <input {...register(name)} type={type} className={inputCls} />
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{isEdit ? 'Edit Employee' : 'Add New Employee'}</h1>
        <p className="text-sm text-text-secondary mt-0.5">Fill in employee details and compliance document expiry dates.</p>
      </div>

      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-5">
        {/* Personal info */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Personal Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <F label="Full Name" required><Input name="name" /></F>
            <F label="Designation" required><Input name="designation" /></F>
            <F label="Phone"><Input name="phone" /></F>
            <F label="Email"><Input name="email" type="email" /></F>
            <F label="Join Date"><Input name="joinDate" type="date" /></F>
            <F label="Status">
              <select {...register('status')} className={inputCls}>
                <option value="ACTIVE">Active</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="TERMINATED">Terminated</option>
              </select>
            </F>
          </div>
        </div>

        {/* Emirates ID */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Emirates ID</h2>
          <div className="grid grid-cols-2 gap-4">
            <F label="Emirates ID No." required><Input name="emiratesIdNo" /></F>
            <F label="Expiry Date"><Input name="emiratesIdExpiryDate" type="date" /></F>
          </div>
        </div>

        {/* Visa */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">
            Visa
            <span className="ml-2 text-[10px] font-normal text-yellow-400 uppercase tracking-wide">
              30-day alarm mandatory
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <F label="Visa No."><Input name="visaNo" /></F>
            <F label="Visa Expiry Date" required><Input name="visaExpiryDate" type="date" /></F>
          </div>
        </div>

        {/* Labor Card */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Labor Card</h2>
          <div className="grid grid-cols-2 gap-4">
            <F label="Labor Card No."><Input name="laborCardNo" /></F>
            <F label="Expiry Date"><Input name="laborCardExpiryDate" type="date" /></F>
          </div>
        </div>

        {/* Passport */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Passport</h2>
          <div className="grid grid-cols-2 gap-4">
            <F label="Passport No."><Input name="passportNo" /></F>
            <F label="Expiry Date"><Input name="passportExpiryDate" type="date" /></F>
          </div>
        </div>

        {/* Remarks */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <F label="Remarks">
            <textarea {...register('remarks')} rows={3} className={`${inputCls} resize-none`} />
          </F>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => nav('/employees')}
            className="px-4 py-2 rounded-lg border border-border text-sm text-text-secondary hover:text-text-primary transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Employee'}
          </button>
        </div>
      </form>
    </div>
  );
}
