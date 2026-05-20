import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Mail, Phone, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { SubcontractorOrg } from '@/lib/types';

const schema = z.object({
  name:          z.string().min(2, 'Min 2 characters'),
  contactPerson: z.string().optional(),
  contactEmail:  z.string().email('Valid email').optional().or(z.literal('')),
  contactPhone:  z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function SubcontractorOrgsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<SubcontractorOrg | null>(null);

  const { data: orgs = [], isLoading } = useQuery<SubcontractorOrg[]>({
    queryKey: ['subcontractor-orgs'],
    queryFn: async () => (await api.get('/subcontractor-orgs')).data,
  });

  const toggleStatus = useMutation({
    mutationFn: (org: SubcontractorOrg) =>
      api.patch(`/subcontractor-orgs/${org.id}`, { isActive: !org.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subcontractor-orgs'] });
      toast.success('Status updated');
    },
    onError: () => toast.error('Update failed'),
  });

  const deleteOrg = useMutation({
    mutationFn: (id: string) => api.delete(`/subcontractor-orgs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subcontractor-orgs'] });
      toast.success('Organisation deleted');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Delete failed'),
  });

  const openAdd  = () => { setEditing(null);  setShowModal(true); };
  const openEdit = (org: SubcontractorOrg) => { setEditing(org); setShowModal(true); };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Subcontractor Organisations</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Manage third-party contractors whose staff hold gate passes.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus size={15} /> Add Organisation
        </button>
      </div>

      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-text-secondary">Loading…</div>
        ) : orgs.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 size={36} className="mx-auto mb-3 text-text-secondary opacity-40" />
            <div className="font-semibold mb-1">No subcontractor organisations yet</div>
            <p className="text-sm text-text-secondary mb-4">
              Add your contractors here so you can link their staff to gate passes and track compliance separately.
            </p>
            <button onClick={openAdd}
              className="px-4 py-2 bg-brand-orange text-white text-sm font-semibold rounded-lg hover:bg-brand-orange-dark transition-colors">
              Add your first organisation
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary text-xs uppercase tracking-label">
                <th className="text-left px-4 py-3">Organisation</th>
                <th className="text-left px-4 py-3">Contact Person</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-b border-border hover:bg-bg-input transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-brand-mid/15 flex items-center justify-center flex-shrink-0">
                        <Building2 size={14} className="text-brand-mid" />
                      </div>
                      <div>
                        <div className="font-semibold">{org.name}</div>
                        <div className="text-xs text-text-secondary font-mono">{org.id.slice(0, 8)}…</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{org.contactPerson ?? '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{org.contactEmail ?? '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{org.contactPhone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'px-2 py-0.5 rounded text-xs font-semibold',
                      org.isActive ? 'bg-emerald-400/15 text-emerald-400' : 'bg-rose-400/15 text-rose-400',
                    )}>
                      {org.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(org)}
                        className="px-2.5 py-1 text-xs rounded border border-border hover:bg-bg-input transition-colors">
                        Edit
                      </button>
                      <button
                        onClick={() => toggleStatus.mutate(org)}
                        className={clsx(
                          'px-2.5 py-1 text-xs rounded font-medium transition-colors',
                          org.isActive
                            ? 'bg-amber-400/15 text-amber-400 hover:bg-amber-400/25'
                            : 'bg-emerald-400/15 text-emerald-400 hover:bg-emerald-400/25',
                        )}
                      >
                        {org.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${org.name}"? This cannot be undone.`))
                            deleteOrg.mutate(org.id);
                        }}
                        className="px-2.5 py-1 text-xs rounded font-medium bg-rose-400/15 text-rose-400 hover:bg-rose-400/25 transition-colors"
                      >
                        Delete
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
        <OrgModal
          editing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['subcontractor-orgs'] });
            setShowModal(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function OrgModal({
  editing, onClose, onSuccess,
}: {
  editing: SubcontractorOrg | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? {
          name: editing.name,
          contactPerson: editing.contactPerson ?? '',
          contactEmail: editing.contactEmail ?? '',
          contactPhone: editing.contactPhone ?? '',
        }
      : {},
  });

  const save = useMutation({
    mutationFn: (data: FormValues) =>
      editing
        ? api.patch(`/subcontractor-orgs/${editing.id}`, data)
        : api.post('/subcontractor-orgs', data) as Promise<unknown>,
    onSuccess: () => {
      toast.success(editing ? 'Organisation updated' : 'Organisation created');
      onSuccess();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Save failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-lg shadow-card-hover">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-bold">{editing ? 'Edit Organisation' : 'Add Organisation'}</h2>
            <p className="text-xs text-text-secondary mt-0.5">Subcontractor company details</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-bg-input rounded-lg text-text-secondary">✕</button>
        </div>

        <form onSubmit={handleSubmit((d) => save.mutate(d))} className="p-5 space-y-4">
          <MField label="Organisation Name *" error={errors.name?.message}>
            <input {...register('name')} placeholder="Acme Contractors LLC" className="minput" />
          </MField>

          <MField label="Contact Person" error={errors.contactPerson?.message}>
            <input {...register('contactPerson')} placeholder="John Smith" className="minput" />
          </MField>

          <div className="grid grid-cols-2 gap-4">
            <MField label="Email" error={errors.contactEmail?.message}>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                <input type="email" {...register('contactEmail')} placeholder="contact@org.com" className="minput-icon" />
              </div>
            </MField>
            <MField label="Phone" error={errors.contactPhone?.message}>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                <input {...register('contactPhone')} placeholder="+971 50 000 0000" className="minput-icon" />
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

function MField({ label, error, children }: {
  label: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text-secondary mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
    </div>
  );
}
