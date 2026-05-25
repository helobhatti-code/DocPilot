import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '@/lib/api';
import type { CompanyDocument, CompanyDocType } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type PartyEntry = { name: string; role: string };

type FormValues = {
  docType: CompanyDocType;
  companyId: string;
  docName: string;
  docNumber: string;
  issueDate: string;
  expiryDate: string;
  remarks: string;
  // TRADE_LICENSE
  licenseNo: string;
  activities: string;
  issuingAuthority: string;
  // ESTABLISHMENT_CARD
  cardNo: string;
  ecIssuingAuthority: string;
  // CLASSIFICATION
  classificationLevel: string;
  grade: string;
  // CIVIL_DEFENSE
  hassantukCertificateNo: string;
  hassantukExpiryDate: string;
  // POWER_OF_ATTORNEY
  attorneyType: 'LIMITED' | 'UNLIMITED' | '';
  parties: PartyEntry[];
  // OFFICE_TENANCY
  landlordName: string;
  tenancyContractNo: string;
  premisesAddress: string;
};

const DOC_TYPE_LABELS: Record<CompanyDocType, string> = {
  TRADE_LICENSE:     'Trade License',
  ESTABLISHMENT_CARD: 'Establishment Card',
  CLASSIFICATION:    'Classification',
  CIVIL_DEFENSE:     'Civil Defense',
  POWER_OF_ATTORNEY: 'Power of Attorney',
  OFFICE_TENANCY:    'Office Tenancy',
};

const DOC_TYPES = Object.keys(DOC_TYPE_LABELS) as CompanyDocType[];

// ─── Build metadata from form values ─────────────────────────────────────────

function buildMetadata(values: FormValues): Record<string, unknown> | undefined {
  switch (values.docType) {
    case 'TRADE_LICENSE':
      return {
        licenseNo: values.licenseNo,
        activities: values.activities.split(',').map((a) => a.trim()).filter(Boolean),
        issuingAuthority: values.issuingAuthority,
      };
    case 'ESTABLISHMENT_CARD':
      return { cardNo: values.cardNo, issuingAuthority: values.ecIssuingAuthority };
    case 'CLASSIFICATION':
      return { classificationLevel: values.classificationLevel, grade: values.grade };
    case 'CIVIL_DEFENSE':
      return {
        hassantukCertificateNo: values.hassantukCertificateNo,
        hassantukExpiryDate: values.hassantukExpiryDate,
      };
    case 'POWER_OF_ATTORNEY':
      return { attorneyType: values.attorneyType, parties: values.parties };
    case 'OFFICE_TENANCY':
      return {
        landlordName: values.landlordName,
        tenancyContractNo: values.tenancyContractNo,
        premisesAddress: values.premisesAddress,
      };
    default:
      return undefined;
  }
}

function flattenMetadata(docType: CompanyDocType, meta: Record<string, unknown> | null | undefined): Partial<FormValues> {
  if (!meta) return {};
  switch (docType) {
    case 'TRADE_LICENSE':
      return {
        licenseNo:        meta.licenseNo as string ?? '',
        activities:       ((meta.activities as string[]) ?? []).join(', '),
        issuingAuthority: meta.issuingAuthority as string ?? '',
      };
    case 'ESTABLISHMENT_CARD':
      return {
        cardNo:              meta.cardNo as string ?? '',
        ecIssuingAuthority:  meta.issuingAuthority as string ?? '',
      };
    case 'CLASSIFICATION':
      return {
        classificationLevel: meta.classificationLevel as string ?? '',
        grade:               meta.grade as string ?? '',
      };
    case 'CIVIL_DEFENSE':
      return {
        hassantukCertificateNo: meta.hassantukCertificateNo as string ?? '',
        hassantukExpiryDate:    meta.hassantukExpiryDate as string ?? '',
      };
    case 'POWER_OF_ATTORNEY':
      return {
        attorneyType: (meta.attorneyType as 'LIMITED' | 'UNLIMITED') ?? '',
        parties:      (meta.parties as PartyEntry[]) ?? [{ name: '', role: '' }],
      };
    case 'OFFICE_TENANCY':
      return {
        landlordName:      meta.landlordName as string ?? '',
        tenancyContractNo: meta.tenancyContractNo as string ?? '',
        premisesAddress:   meta.premisesAddress as string ?? '',
      };
    default:
      return {};
  }
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:border-brand-orange transition-colors';

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

// ─── Company dropdown ─────────────────────────────────────────────────────────

function CompanySelect({
  register,
  disabled,
}: {
  register: ReturnType<typeof useForm<FormValues>>['register'];
  disabled?: boolean;
}) {
  const { data } = useQuery({
    queryKey: ['companies-all'],
    queryFn: async () => (await api.get('/companies?pageSize=200')).data as { items: { id: string; name: string; code: string }[] },
  });
  return (
    <select
      {...register('companyId', { required: true })}
      disabled={disabled}
      className={clsx(inputCls, disabled && 'opacity-60 cursor-not-allowed')}
    >
      <option value="">Select company…</option>
      {data?.items.map((c) => (
        <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
      ))}
    </select>
  );
}

// ─── Dynamic metadata section ─────────────────────────────────────────────────

function MetadataFields({ docType, register, control }: {
  docType: CompanyDocType;
  register: ReturnType<typeof useForm<FormValues>>['register'];
  control: ReturnType<typeof useForm<FormValues>>['control'];
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'parties' });

  switch (docType) {
    case 'TRADE_LICENSE':
      return (
        <div className="grid grid-cols-2 gap-4">
          <Field label="License No."><input {...register('licenseNo')} className={inputCls} /></Field>
          <Field label="Issuing Authority"><input {...register('issuingAuthority')} className={inputCls} /></Field>
          <div className="col-span-2">
            <Field label="Activities (comma-separated)">
              <input {...register('activities')} className={inputCls} placeholder="Construction, Civil Works, ..." />
            </Field>
          </div>
        </div>
      );

    case 'ESTABLISHMENT_CARD':
      return (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Card No."><input {...register('cardNo')} className={inputCls} /></Field>
          <Field label="Issuing Authority"><input {...register('ecIssuingAuthority')} className={inputCls} /></Field>
        </div>
      );

    case 'CLASSIFICATION':
      return (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Classification Level"><input {...register('classificationLevel')} className={inputCls} /></Field>
          <Field label="Grade"><input {...register('grade')} className={inputCls} /></Field>
        </div>
      );

    case 'CIVIL_DEFENSE':
      return (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Hassantuk Certificate No." required>
            <input {...register('hassantukCertificateNo')} className={inputCls} />
          </Field>
          <Field label="Hassantuk Expiry Date" required>
            <input {...register('hassantukExpiryDate')} type="date" className={inputCls} />
          </Field>
        </div>
      );

    case 'POWER_OF_ATTORNEY':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Attorney Type" required>
              <select {...register('attorneyType')} className={inputCls}>
                <option value="">Select type…</option>
                <option value="LIMITED">Limited</option>
                <option value="UNLIMITED">Unlimited</option>
              </select>
            </Field>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-text-secondary mb-2">
              Parties <span className="text-rose-400">*</span>
            </label>
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={f.id} className="flex gap-2 items-center">
                  <input
                    {...register(`parties.${i}.name`)}
                    placeholder="Name"
                    className={clsx(inputCls, 'flex-1')}
                  />
                  <input
                    {...register(`parties.${i}.role`)}
                    placeholder="Role"
                    className={clsx(inputCls, 'flex-1')}
                  />
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-rose-400 hover:text-rose-300 text-xs px-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => append({ name: '', role: '' })}
                className="text-xs text-accent-blue hover:underline"
              >
                + Add party
              </button>
            </div>
          </div>
        </div>
      );

    case 'OFFICE_TENANCY':
      return (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Landlord Name"><input {...register('landlordName')} className={inputCls} /></Field>
          <Field label="Tenancy Contract No."><input {...register('tenancyContractNo')} className={inputCls} /></Field>
          <div className="col-span-2">
            <Field label="Premises Address">
              <textarea {...register('premisesAddress')} rows={2} className={clsx(inputCls, 'resize-none')} />
            </Field>
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanyDocumentForm() {
  const nav    = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const qc     = useQueryClient();
  const isEdit = !!id;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { data: existing } = useQuery({
    queryKey: ['company-document', id],
    queryFn: async () => (await api.get(`/company-documents/${id}`)).data as CompanyDocument,
    enabled: isEdit,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      docType:   'TRADE_LICENSE',
      parties:   [{ name: '', role: '' }],
      attorneyType: '',
    },
  });

  const docType = watch('docType');

  useEffect(() => {
    if (existing) {
      const meta = flattenMetadata(existing.docType, existing.metadata);
      reset({
        docType:   existing.docType,
        companyId: existing.companyId,
        docName:   existing.docName,
        docNumber: existing.docNumber ?? '',
        issueDate: existing.issueDate?.slice(0, 10) ?? '',
        expiryDate: existing.expiryDate.slice(0, 10),
        remarks:   existing.remarks ?? '',
        // metadata fields
        licenseNo: '',
        activities: '',
        issuingAuthority: '',
        cardNo: '',
        ecIssuingAuthority: '',
        classificationLevel: '',
        grade: '',
        hassantukCertificateNo: '',
        hassantukExpiryDate: '',
        attorneyType: '',
        parties: [{ name: '', role: '' }],
        landlordName: '',
        tenancyContractNo: '',
        premisesAddress: '',
        ...meta,
      });
    }
  }, [existing, reset]);

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        docType:   values.docType,
        companyId: values.companyId,
        docName:   values.docName,
        docNumber: values.docNumber || undefined,
        issueDate: values.issueDate || undefined,
        expiryDate: values.expiryDate,
        remarks:   values.remarks || undefined,
        metadata:  buildMetadata(values),
      };
      if (isEdit) return api.patch(`/company-documents/${id}`, payload);
      return api.post('/company-documents', payload);
    },
    onSuccess: async (res) => {
      qc.invalidateQueries({ queryKey: ['company-documents'] });
      if (id) qc.invalidateQueries({ queryKey: ['company-document', id] });

      // If a file was staged during create, upload it now using the new doc id
      if (!isEdit && pendingFile) {
        const newId = (res as { data: { id: string } }).data.id;
        try {
          const fd = new FormData();
          fd.append('file', pendingFile);
          await api.post(`/company-documents/${newId}/attachment`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          toast.error('Document created but attachment upload failed');
        }
      }

      toast.success(isEdit ? 'Document updated' : 'Document created');
      nav('/company-documents');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Save failed';
      toast.error(Array.isArray(msg) ? msg.join('; ') : String(msg));
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isEdit) {
      // In create mode: stage the file, upload after doc is saved
      setPendingFile(file);
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/company-documents/${id}/attachment`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      qc.invalidateQueries({ queryKey: ['company-document', id] });
      qc.invalidateQueries({ queryKey: ['company-documents'] });
      toast.success('Attachment uploaded');
    } catch (e: unknown) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {isEdit ? 'Edit Document' : 'Add New Document'}
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Fill in document details. Metadata fields update based on document type.
        </p>
      </div>

      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-5">
        {/* Doc type selector */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <Field label="Document Type" required>
            <select
              {...register('docType')}
              disabled={isEdit}
              className={clsx(inputCls, isEdit && 'opacity-60 cursor-not-allowed')}
            >
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Core fields */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Document Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company" required>
              <CompanySelect register={register} disabled={isEdit} />
            </Field>
            <Field label="Document Name" required>
              <input {...register('docName')} className={inputCls} />
            </Field>
            <Field label="Document Number">
              <input {...register('docNumber')} className={inputCls} />
            </Field>
            <Field label="Issue Date">
              <input {...register('issueDate')} type="date" className={inputCls} />
            </Field>
            <Field label="Expiry Date" required>
              <input {...register('expiryDate')} type="date" className={inputCls} />
            </Field>
          </div>
        </div>

        {/* Metadata fields (dynamic by docType) */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">
            {DOC_TYPE_LABELS[docType]} Details
          </h2>
          <MetadataFields docType={docType} register={register} control={control} />
        </div>

        {/* Remarks */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <Field label="Remarks">
            <textarea {...register('remarks')} rows={3} className={clsx(inputCls, 'resize-none')} />
          </Field>
        </div>

        {/* Attachment upload */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-sm">Attachment</h2>
          {existing?.attachmentId && (
            <a
              href={existing.attachmentId}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent-blue hover:underline block"
            >
              View current attachment →
            </a>
          )}
          {pendingFile && (
            <p className="text-xs text-emerald-400">Selected: {pendingFile.name}</p>
          )}
          <input ref={fileRef} type="file" accept=".jpg,.jpeg,.pdf" className="hidden" onChange={handleFileUpload} />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-text-secondary hover:text-text-primary hover:border-brand-orange transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? 'Uploading…' : pendingFile ? 'Change file' : 'Upload Attachment (JPEG/PDF, max 2MB)'}
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => nav('/company-documents')}
            className="px-4 py-2 rounded-lg border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Document'}
          </button>
        </div>
      </form>
    </div>
  );
}
