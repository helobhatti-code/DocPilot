import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import type { HeavyMachinery } from '@/lib/types';

type FormValues = {
  machineType: string; make: string; model: string;
  manufactureYear: string; serialNumber: string; plateNumber: string;
  assignedOperator: string; currentLocation: string; projectSite: string;
  status: string;
  operatorLicenseNo: string; operatorLicenseExpiryDate: string;
  inspectionCertificateNo: string; inspectionExpiryDate: string;
  rtaRegistrationNo: string; rtaRegistrationExpiryDate: string;
  liftingTestCertificateNo: string; liftingTestExpiryDate: string;
  insuranceType: string; insuranceExpiryDate: string;
  civilDefenseExpiryDate: string; remarks: string;
};

export default function MachineryForm() {
  const nav    = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const qc     = useQueryClient();
  const isEdit = !!id;

  const { data: existing } = useQuery({
    queryKey: ['machinery', id],
    queryFn: async () => (await api.get(`/heavy-machinery/${id}`)).data as HeavyMachinery,
    enabled: isEdit,
  });

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { status: 'ACTIVE', insuranceType: '' },
  });

  useEffect(() => {
    if (existing) {
      reset({
        machineType:              existing.machineType,
        make:                     existing.make,
        model:                    existing.model ?? '',
        manufactureYear:          String(existing.manufactureYear ?? ''),
        serialNumber:             existing.serialNumber,
        plateNumber:              existing.plateNumber ?? '',
        assignedOperator:         existing.assignedOperator ?? '',
        currentLocation:          existing.currentLocation ?? '',
        projectSite:              existing.projectSite ?? '',
        status:                   existing.status,
        operatorLicenseNo:        existing.operatorLicenseNo ?? '',
        operatorLicenseExpiryDate:existing.operatorLicenseExpiryDate?.slice(0, 10) ?? '',
        inspectionCertificateNo:  existing.inspectionCertificateNo ?? '',
        inspectionExpiryDate:     existing.inspectionExpiryDate?.slice(0, 10) ?? '',
        rtaRegistrationNo:        existing.rtaRegistrationNo ?? '',
        rtaRegistrationExpiryDate:existing.rtaRegistrationExpiryDate?.slice(0, 10) ?? '',
        liftingTestCertificateNo: existing.liftingTestCertificateNo ?? '',
        liftingTestExpiryDate:    existing.liftingTestExpiryDate?.slice(0, 10) ?? '',
        insuranceType:            existing.insuranceType ?? '',
        insuranceExpiryDate:      existing.insuranceExpiryDate?.slice(0, 10) ?? '',
        civilDefenseExpiryDate:   existing.civilDefenseExpiryDate?.slice(0, 10) ?? '',
        remarks:                  existing.remarks ?? '',
      });
    }
  }, [existing, reset]);

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        ...values,
        manufactureYear: values.manufactureYear ? Number(values.manufactureYear) : undefined,
        insuranceType: values.insuranceType || undefined,
      };
      if (isEdit) return api.patch(`/heavy-machinery/${id}`, payload);
      return api.post('/heavy-machinery', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['heavy-machinery'] });
      if (id) qc.invalidateQueries({ queryKey: ['machinery', id] });
      toast.success(isEdit ? 'Machinery updated' : 'Machinery created');
      nav('/machinery');
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
  const Input = ({ name, type = 'text' }: { name: keyof FormValues; type?: string }) => (
    <input {...register(name)} type={type}
      className="w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:border-brand-orange transition-colors" />
  );
  const Select = ({ name, children }: { name: keyof FormValues; children: React.ReactNode }) => (
    <select {...register(name)}
      className="w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:border-brand-orange transition-colors">
      {children}
    </select>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{isEdit ? 'Edit Machinery' : 'Add Machinery'}</h1>
        <p className="text-sm text-text-secondary mt-0.5">Enter machinery details and compliance dates.</p>
      </div>

      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-5">
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Basic Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <F label="Machine Type" required><Input name="machineType" /></F>
            <F label="Make" required><Input name="make" /></F>
            <F label="Model"><Input name="model" /></F>
            <F label="Manufacture Year"><Input name="manufactureYear" type="number" /></F>
            <F label="Serial Number" required><Input name="serialNumber" /></F>
            <F label="Plate Number"><Input name="plateNumber" /></F>
            <F label="Assigned Operator"><Input name="assignedOperator" /></F>
            <F label="Current Location"><Input name="currentLocation" /></F>
            <F label="Project Site"><Input name="projectSite" /></F>
            <F label="Status">
              <Select name="status">
                <option value="ACTIVE">Active</option>
                <option value="IDLE">Idle</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="OUT_OF_SERVICE">Out of Service</option>
              </Select>
            </F>
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Certificates & Compliance</h2>
          <div className="grid grid-cols-2 gap-4">
            <F label="Operator License No."><Input name="operatorLicenseNo" /></F>
            <F label="Operator License Expiry"><Input name="operatorLicenseExpiryDate" type="date" /></F>
            <F label="Inspection Certificate No."><Input name="inspectionCertificateNo" /></F>
            <F label="Inspection Expiry"><Input name="inspectionExpiryDate" type="date" /></F>
            <F label="RTA Registration No."><Input name="rtaRegistrationNo" /></F>
            <F label="RTA Expiry"><Input name="rtaRegistrationExpiryDate" type="date" /></F>
            <F label="Lifting Test Certificate No."><Input name="liftingTestCertificateNo" /></F>
            <F label="Lifting Test Expiry"><Input name="liftingTestExpiryDate" type="date" /></F>
            <F label="Insurance Type">
              <Select name="insuranceType">
                <option value="">— None —</option>
                <option value="COMPREHENSIVE">Comprehensive</option>
                <option value="THIRD_PARTY">Third Party</option>
              </Select>
            </F>
            <F label="Insurance Expiry"><Input name="insuranceExpiryDate" type="date" /></F>
            <F label="Civil Defense Expiry"><Input name="civilDefenseExpiryDate" type="date" /></F>
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-xl p-5">
          <F label="Remarks">
            <textarea {...register('remarks')} rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:border-brand-orange transition-colors resize-none" />
          </F>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => nav('/machinery')}
            className="px-4 py-2 rounded-lg border border-border text-sm text-text-secondary hover:text-text-primary transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Machinery'}
          </button>
        </div>
      </form>
    </div>
  );
}
