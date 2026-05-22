import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Mail, Phone, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '@/lib/api';

interface Company {
  id: string;
  name: string;
  code: string;
  tradeLicenseNo?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  _count?: { gatePasses: number; staff: number };
}

type FormValues = {
  name: string;
  code: string;
  tradeLicenseNo: string;
  address: string;
  phone: string;
  email: string;
};

export default function CompaniesList() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);

  const { data, isLoading } = useQuery<{ items: Company[]; total: number }>({
    queryKey: ['companies'],
    queryFn: async () => (await api.get('/companies?pageSize=200')).data,
  });

  const companies = data?.items ?? [];

  const toggleStatus = useMutation({
    mutationFn: (c: Company) => api.patch(`/companies/${c.id}`, { isActive: !c.isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['companies'] }); toast.success('Status updated'); },
    onError: () => toast.error('Update failed'),
  });

  const openAdd  = () => { setEditing(null);  setShowModal(true); };
  const openEdit = (c: Company) => { setEditing(c); setShowModal(true); };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Manage companies whose documents and gate passes are tracked in DocPilot.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus size={15} /> Add Company
        </button>
      </div>

      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-text-secondary">Loading…</div>
        ) : companies.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 size={36} className="mx-auto mb-3 text-text-secondary opacity-40" />
            <div className="font-semibold mb-1">No companies yet</div>
            <p className="text-sm text-text-secondary mb-4">
              Add a company first before you can attach documents or gate passes to it.
            </p>
            <button
              onClick={openAdd}
              className="px-4 py-2 bg-brand-orange text-white text-sm font-semibold rounded-lg hover:bg-brand-orange-dark transition-colors"
            >
              Add your first company
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary text-xs uppercase tracking-label">
                <th className="text-left px-4 py-3">Company</th>
                <th className="text-left px-4 py-3">Trade License</th>
                <th className="text-left px-4 py-3">Contact</th>
                <th className="text-left px-4 py-3">Passes / Staff</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-border hover:bg-bg-input transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-teal-300/15 flex items-center justify-center flex-shrink-0">
                        <Building2 size={14} className="text-teal-300" />
                      </div>
                      <div>
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-xs text-text-secondary font-mono">{c.code}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{c.tradeLicenseNo ?? '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    <div className="flex flex-col gap-0.5">
                      {c.email && (
                        <span className="flex items-center gap-1"><Mail size={11} />{c.email}</span>
                      )}
                      {c.phone && (
                        <span className="flex items-center gap-1"><Phone size={11} />{c.phone}</span>
                      )}
                      {!c.email && !c.phone && '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {c._count ? `${c._count.gatePasses} / ${c._count.staff}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'px-2 py-0.5 rounded text-xs font-semibold',
                      c.isActive ? 'bg-emerald-400/15 text-emerald-400' : 'bg-rose-400/15 text-rose-400',
                    )}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(c)}
                        className="px-2.5 py-1 text-xs rounded border border-border hover:bg-bg-input transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleStatus.mutate(c)}
                        className={clsx(
                          'px-2.5 py-1 text-xs rounded font-medium transition-colors',
                          c.isActive
                            ? 'bg-amber-400/15 text-amber-400 hover:bg-amber-400/25'
                            : 'bg-emerald-400/15 text-emerald-400 hover:bg-emerald-400/25',
                        )}
                      >
                        {c.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <CompanyModal
          editing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['companies'] });
            qc.invalidateQueries({ queryKey: ['companies-all'] });
            setShowModal(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CompanyModal({
  editing, onClose, onSuccess,
}: {
  editing: Company | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: editing ? {
      name:           editing.name,
      code:           editing.code,
      tradeLicenseNo: editing.tradeLicenseNo ?? '',
      address:        editing.address ?? '',
      phone:          editing.phone ?? '',
      email:          editing.email ?? '',
    } : {},
  });

  const save = useMutation({
    mutationFn: (data: FormValues) =>
      editing
        ? api.patch(`/companies/${editing.id}`, data)
        : api.post('/companies', { ...data, code: data.code.toUpperCase() }),
    onSuccess: () => {
      toast.success(editing ? 'Company updated' : 'Company created');
      onSuccess();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Save failed';
      toast.error(String(msg));
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-lg shadow-card-hover">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-bold">{editing ? 'Edit Company' : 'Add Company'}</h2>
            <p className="text-xs text-text-secondary mt-0.5">Company profile details</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-bg-input rounded-lg text-text-secondary">✕</button>
        </div>

        <form onSubmit={handleSubmit((d) => save.mutate(d))} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <MField label="Company Name *" error={errors.name?.message}>
              <input {...register('name', { required: 'Required' })} placeholder="IP Care Technology LLC" className="minput" />
            </MField>
            <MField label="Code *" error={errors.code?.message}>
              <input
                {...register('code', { required: 'Required' })}
                placeholder="IPCT"
                disabled={!!editing}
                className={clsx('minput', editing && 'opacity-60 cursor-not-allowed')}
              />
            </MField>
          </div>

          <MField label="Trade License No.">
            <input {...register('tradeLicenseNo')} placeholder="CN-123456" className="minput" />
          </MField>

          <MField label="Address">
            <input {...register('address')} placeholder="Dubai, UAE" className="minput" />
          </MField>

          <div className="grid grid-cols-2 gap-4">
            <MField label="Email">
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                <input type="email" {...register('email')} placeholder="info@company.ae" className="minput-icon" />
              </div>
            </MField>
            <MField label="Phone">
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                <input {...register('phone')} placeholder="+971 4 000 0000" className="minput-icon" />
              </div>
            </MField>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-bg-input transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting}
              className="px-5 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold disabled:opacity-50 transition-colors">
              {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </button>
          </div>
        </form>

        <style>{`
          .minput, .minput-icon {
            width: 100%;
            background: var(--bg-input);
            border: 1px solid var(--border);
            border-radius: 8px;
            font-size: 0.875rem;
            color: var(--text-primary);
            outline: none;
          }
          .minput       { padding: 7px 10px; }
          .minput-icon  { padding: 7px 10px 7px 32px; }
          .minput:focus, .minput-icon:focus { border-color: #F47316; }
        `}</style>
      </div>
    </div>
  );
}

function MField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text-secondary mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
    </div>
  );
}
