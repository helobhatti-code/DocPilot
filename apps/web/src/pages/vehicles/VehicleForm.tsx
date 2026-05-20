import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Vehicle } from '@/lib/types';

type FormValues = {
  vehicleType:                 string;
  ownerName:                   string;
  driverName:                  string;
  carMake:                     string;
  carModel:                    string;
  plateEmirate:                string;
  plateCategory:               string;
  plateNumber:                 string;
  carLicenseNo:                string;
  carLicenseExpiryDate:        string;
  insuranceType:               string;
  insurancePolicyNo:           string;
  insuranceExpiryDate:         string;
  hasResidentialMawaqif:       boolean;
  residentialMawaqifExpiryDate:string;
  hasNormalMawaqif:            boolean;
  normalMawaqifExpiryDate:     string;
  remarks:                     string;
};

export default function VehicleForm() {
  const nav    = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const qc     = useQueryClient();
  const isEdit = !!id;

  const { data: existing } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: async () => (await api.get(`/vehicles/${id}`)).data as Vehicle,
    enabled: isEdit,
  });

  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      vehicleType: 'COMPANY', insuranceType: 'COMPREHENSIVE',
      hasResidentialMawaqif: false, hasNormalMawaqif: false,
    },
  });

  const hasMawaqifRes = watch('hasResidentialMawaqif');
  const hasMawaqifNor = watch('hasNormalMawaqif');

  useEffect(() => {
    if (existing) {
      reset({
        vehicleType:                  existing.vehicleType,
        ownerName:                    existing.ownerName,
        driverName:                   existing.driverName ?? '',
        carMake:                      existing.carMake,
        carModel:                     existing.carModel ?? '',
        plateEmirate:                 existing.plateEmirate,
        plateCategory:                existing.plateCategory ?? '',
        plateNumber:                  existing.plateNumber,
        carLicenseNo:                 existing.carLicenseNo,
        carLicenseExpiryDate:         existing.carLicenseExpiryDate?.slice(0, 10) ?? '',
        insuranceType:                existing.insuranceType,
        insurancePolicyNo:            existing.insurancePolicyNo ?? '',
        insuranceExpiryDate:          existing.insuranceExpiryDate?.slice(0, 10) ?? '',
        hasResidentialMawaqif:        existing.hasResidentialMawaqif,
        residentialMawaqifExpiryDate: existing.residentialMawaqifExpiryDate?.slice(0, 10) ?? '',
        hasNormalMawaqif:             existing.hasNormalMawaqif,
        normalMawaqifExpiryDate:      existing.normalMawaqifExpiryDate?.slice(0, 10) ?? '',
        remarks:                      existing.remarks ?? '',
      });
    }
  }, [existing, reset]);

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        ...values,
        hasResidentialMawaqif: Boolean(values.hasResidentialMawaqif),
        hasNormalMawaqif:      Boolean(values.hasNormalMawaqif),
      };
      if (isEdit) return api.patch(`/vehicles/${id}`, payload);
      return api.post('/vehicles', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      if (id) qc.invalidateQueries({ queryKey: ['vehicle', id] });
      toast.success(isEdit ? 'Vehicle updated' : 'Vehicle created');
      nav('/vehicles');
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

  const Input = ({ name, type = 'text', ...rest }: any) => (
    <input
      {...register(name)}
      type={type}
      {...rest}
      className="w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:border-brand-orange transition-colors"
    />
  );

  const Select = ({ name, children }: any) => (
    <select
      {...register(name)}
      className="w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:border-brand-orange transition-colors"
    >
      {children}
    </select>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{isEdit ? 'Edit Vehicle' : 'Add New Vehicle'}</h1>
        <p className="text-sm text-text-secondary mt-0.5">Fill in vehicle details and expiry dates.</p>
      </div>

      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-5">
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Basic Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <F label="Vehicle Type" required>
              <Select name="vehicleType">
                <option value="PRIVATE">Private</option>
                <option value="COMPANY">Company</option>
              </Select>
            </F>
            <F label="Owner Name" required><Input name="ownerName" /></F>
            <F label="Driver Name"><Input name="driverName" /></F>
            <F label="Car Make" required><Input name="carMake" /></F>
            <F label="Car Model"><Input name="carModel" /></F>
            <F label="Plate Emirate" required><Input name="plateEmirate" /></F>
            <F label="Plate Category"><Input name="plateCategory" /></F>
            <F label="Plate Number" required><Input name="plateNumber" /></F>
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Car License</h2>
          <div className="grid grid-cols-2 gap-4">
            <F label="Car License No." required><Input name="carLicenseNo" /></F>
            <F label="Expiry Date" required><Input name="carLicenseExpiryDate" type="date" /></F>
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Insurance</h2>
          <div className="grid grid-cols-2 gap-4">
            <F label="Insurance Type" required>
              <Select name="insuranceType">
                <option value="COMPREHENSIVE">Comprehensive</option>
                <option value="THIRD_PARTY">Third Party</option>
              </Select>
            </F>
            <F label="Policy Number"><Input name="insurancePolicyNo" /></F>
            <F label="Expiry Date" required><Input name="insuranceExpiryDate" type="date" /></F>
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Mawaqif Permits</h2>
          <div className="grid grid-cols-2 gap-4">
            <F label="Residential Mawaqif">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('hasResidentialMawaqif')} className="accent-brand-orange" />
                <span className="text-sm">Has Residential Mawaqif</span>
              </label>
            </F>
            {hasMawaqifRes && (
              <F label="Residential Mawaqif Expiry">
                <Input name="residentialMawaqifExpiryDate" type="date" />
              </F>
            )}
            <F label="Normal Mawaqif">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('hasNormalMawaqif')} className="accent-brand-orange" />
                <span className="text-sm">Has Normal Mawaqif</span>
              </label>
            </F>
            {hasMawaqifNor && (
              <F label="Normal Mawaqif Expiry">
                <Input name="normalMawaqifExpiryDate" type="date" />
              </F>
            )}
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Notes</h2>
          <F label="Remarks">
            <textarea
              {...register('remarks')}
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:border-brand-orange transition-colors resize-none"
            />
          </F>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => nav('/vehicles')}
            className="px-4 py-2 rounded-lg border border-border text-sm text-text-secondary hover:text-text-primary transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Vehicle'}
          </button>
        </div>
      </form>
    </div>
  );
}
