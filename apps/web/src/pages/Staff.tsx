import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Eye, Pencil, Plus, PowerOff, Search, Trash2, Users as UsersIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { resolveFileUrl } from '@/lib/fileUrl';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';
import { FileUpload } from '@/components/FileUpload';
import { api } from '@/lib/api';
import { Staff, SubcontractorOrg } from '@/lib/types';

export default function StaffPage() {
  const qc = useQueryClient();
  const [q, setQ]         = useState('');
  const [open, setOpen]   = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: async () => (await api.get('/staff')).data as Staff[],
  });

  // Fetch tenant name to use as default company for Own Staff
  const { data: tenantProfile } = useQuery({
    queryKey: ['tenant-profile'],
    queryFn: async () => (await api.get('/tenants/me')).data as { name: string },
    select: (d) => d.name,
  });

  const filtered = useMemo(() => {
    if (!q) return staff;
    const t = q.toLowerCase();
    return staff.filter(
      (s) =>
        s.name.toLowerCase().includes(t) ||
        (s.companyName ?? '').toLowerCase().includes(t) ||
        (s.designation ?? '').toLowerCase().includes(t),
    );
  }, [staff, q]);

  const [viewing, setViewing] = useState<Staff | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/staff/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff deleted');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Delete failed'),
  });

  const toggleActive = useMutation({
    mutationFn: async (s: Staff) => api.patch(`/staff/${s.id}`, { isActive: !s.isActive }),
    onSuccess: (_, s) => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      toast.success(s.isActive ? 'Staff deactivated' : 'Staff activated');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Update failed'),
  });

  const openAdd  = () => { setEditing(null);  setOpen(true); };
  const openEdit = (s: Staff) => { setEditing(s); setOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff</h1>
          <p className="text-sm text-text-secondary">Manage personnel records and link to gate passes.</p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> Add Staff
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, company, designation…"
          className="w-full pl-10 pr-3 py-2 bg-bg-input border border-border rounded-lg outline-none focus:border-brand-orange text-text-primary text-sm"
        />
      </div>

      {!isLoading && filtered.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={q ? 'No matches' : 'No staff yet'}
          description={q ? 'Try a different search.' : 'Add your first staff member to start issuing passes.'}
        />
      ) : (
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-text-secondary text-xs uppercase tracking-label">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Designation</th>
                <th className="text-left px-4 py-3">Company</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Nationality</th>
                <th className="text-left px-4 py-3">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-bg-input/40 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {s.photoUrl
                        ? <img
                            src={resolveFileUrl(s.photoUrl)!}
                            className="w-7 h-7 rounded-full object-cover"
                            alt=""
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.removeAttribute('style');
                            }}
                          />
                        : null}
                      <div
                        className="w-7 h-7 rounded-full bg-bg-input grid place-items-center text-xs font-semibold"
                        style={s.photoUrl ? { display: 'none' } : undefined}
                      >
                        {s.name.charAt(0)}
                      </div>
                      <span className="font-medium">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">{s.designation ?? '—'}</td>
                  <td className="px-4 py-2.5 text-text-secondary">
                    {s.companyName ?? (!s.subcontractorOrgId ? tenantProfile : null) ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.subcontractorOrgId ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-brand-orange/15 text-brand-orange">
                        <Building2 size={10} /> Sub
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-brand-mid/15 text-brand-mid">
                        Own
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">{s.nationality ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx(
                      'px-2 py-0.5 rounded text-xs font-semibold',
                      s.isActive ? 'bg-emerald-400/15 text-emerald-400' : 'bg-rose-400/15 text-rose-400',
                    )}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      {/* View */}
                      <ActionBtn
                        title="View details"
                        color="sky"
                        onClick={() => setViewing(s)}
                      >
                        <Eye size={14} />
                      </ActionBtn>
                      {/* Edit */}
                      <ActionBtn
                        title="Edit"
                        color="amber"
                        onClick={() => openEdit(s)}
                      >
                        <Pencil size={14} />
                      </ActionBtn>
                      {/* Deactivate / Activate */}
                      <ActionBtn
                        title={s.isActive ? 'Deactivate' : 'Activate'}
                        color={s.isActive ? 'slate' : 'emerald'}
                        onClick={() => toggleActive.mutate(s)}
                      >
                        <PowerOff size={14} />
                      </ActionBtn>
                      {/* Delete */}
                      <ActionBtn
                        title="Delete"
                        color="rose"
                        onClick={() => {
                          if (confirm(`Delete ${s.name}? This cannot be undone.\nStaff with active gate passes cannot be deleted.`))
                            remove.mutate(s.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </ActionBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StaffModal open={open} onClose={() => setOpen(false)} editing={editing} tenantName={tenantProfile} />

      {/* View details modal */}
      {viewing && (
        <Modal open title="Staff Details" onClose={() => setViewing(null)}
          footer={
            <div className="flex gap-2">
              <button onClick={() => { setViewing(null); openEdit(viewing); }}
                className="px-3 py-1.5 rounded-lg bg-amber-400/15 text-amber-400 hover:bg-amber-400/25 text-sm font-medium transition-colors flex items-center gap-1.5">
                <Pencil size={13} /> Edit
              </button>
              <button onClick={() => setViewing(null)}
                className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-bg-input transition-colors">
                Close
              </button>
            </div>
          }
        >
          <div className="flex gap-4 items-start">
            {viewing.photoUrl
              ? <img src={resolveFileUrl(viewing.photoUrl)!} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" alt="" />
              : <div className="w-16 h-16 rounded-xl bg-brand-orange/15 grid place-items-center text-2xl font-bold text-brand-orange flex-shrink-0">
                  {viewing.name.charAt(0)}
                </div>
            }
            <div className="space-y-1.5 text-sm flex-1 min-w-0">
              <div className="font-bold text-base">{viewing.name}</div>
              <DetailRow label="Designation" value={viewing.designation} />
              <DetailRow label="Nationality"  value={viewing.nationality} />
              <DetailRow label="Company"      value={viewing.companyName ?? tenantProfile} />
              <DetailRow label="Type"         value={viewing.subcontractorOrgId ? 'Subcontractor' : 'Own Staff'} />
              <DetailRow label="Status"       value={viewing.isActive ? '✅ Active' : '❌ Inactive'} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Staff Modal ───────────────────────────────────────────────────────────

interface StaffForm {
  name: string;
  designation?: string;
  nationality?: string;
  companyName?: string;
  subcontractorOrgId?: string;
  isActive: boolean;
}

function StaffModal({
  open, onClose, editing, tenantName,
}: {
  open: boolean; onClose: () => void; editing: Staff | null; tenantName?: string;
}) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, watch } = useForm<StaffForm>({
    defaultValues: editing
      ? {
          name: editing.name,
          designation: editing.designation ?? '',
          nationality: editing.nationality ?? '',
          companyName: editing.companyName ?? '',
          subcontractorOrgId: editing.subcontractorOrgId ?? '',
          isActive: editing.isActive,
        }
      : { isActive: true },
  });

  const [photoUrl, setPhotoUrl] = useState<string | null>(editing?.photoUrl ?? null);

  // Reset form and photo whenever the modal opens with a different staff member
  useEffect(() => {
    reset(
      editing
        ? {
            name: editing.name,
            designation: editing.designation ?? '',
            nationality: editing.nationality ?? '',
            companyName: editing.companyName ?? '',
            subcontractorOrgId: editing.subcontractorOrgId ?? '',
            isActive: editing.isActive,
          }
        : { isActive: true },
    );
    setPhotoUrl(editing?.photoUrl ?? null);
  }, [editing, open, reset]);

  // Fetch subcontractor orgs for dropdown
  const { data: subOrgs = [] } = useQuery<SubcontractorOrg[]>({
    queryKey: ['subcontractor-orgs'],
    queryFn: async () => (await api.get('/subcontractor-orgs')).data,
  });

  const selectedOrgId = watch('subcontractorOrgId');
  const selectedOrg   = subOrgs.find((o) => o.id === selectedOrgId);

  const save = useMutation({
    mutationFn: async (v: StaffForm) => {
      const payload = {
        ...v,
        photoUrl,
        subcontractorOrgId: v.subcontractorOrgId || null,
        // Own staff → use tenant name; subcontractor → use org name; manual → use as-is
        companyName: v.companyName || selectedOrg?.name || (!v.subcontractorOrgId ? tenantName : null) || null,
      };
      if (editing) return (await api.patch(`/staff/${editing.id}`, payload)).data;
      return (await api.post('/staff', payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      toast.success(editing ? 'Saved' : 'Created');
      reset();
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Save failed'),
  });

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={editing ? 'Edit Staff' : 'Add Staff'}
      footer={
        <>
          <button onClick={() => { reset(); onClose(); }}
            className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-bg-input transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit((v) => save.mutate(v))}
            className="px-4 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold transition-colors">
            {editing ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <FileUpload
          documentType="STAFF_PHOTO"
          label="Photo"
          initialUrl={photoUrl}
          onUploaded={(r) => setPhotoUrl(r.fileUrl)}
        />

        <Field label="Full name *">
          <input {...register('name', { required: true })}
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-orange" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Designation">
            <input {...register('designation')}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-orange" />
          </Field>
          <Field label="Nationality">
            <input {...register('nationality')}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-orange" />
          </Field>
        </div>

        {/* Subcontractor Org — key for segregation */}
        <Field label="Subcontractor Organisation">
          <select {...register('subcontractorOrgId')}
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-orange">
            <option value="">— Own Staff (no subcontractor) —</option>
            {subOrgs.filter((o) => o.isActive).map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          {selectedOrg && (
            <p className="text-xs text-brand-orange mt-1 flex items-center gap-1">
              <Building2 size={11} />
              Linked to: {selectedOrg.name}
            </p>
          )}
          {!selectedOrgId && (
            <p className="text-xs text-brand-mid mt-1">This staff member will be counted as Own Staff.</p>
          )}
        </Field>

        <Field label="Company name">
          <input {...register('companyName')}
            placeholder={selectedOrg?.name ?? (!selectedOrgId ? tenantName : undefined) ?? 'Optional'}
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-orange placeholder-text-secondary" />
        </Field>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...register('isActive')} className="accent-brand-orange" />
          <span>Active</span>
        </label>
      </div>
    </Modal>
  );
}

// ── Action icon button ────────────────────────────────────────────────────

const colorMap: Record<string, string> = {
  sky:     'bg-sky-400/15 text-sky-400 hover:bg-sky-400/25',
  amber:   'bg-amber-400/15 text-amber-400 hover:bg-amber-400/25',
  rose:    'bg-rose-400/15 text-rose-400 hover:bg-rose-400/25',
  slate:   'bg-slate-400/15 text-slate-400 hover:bg-slate-400/25',
  emerald: 'bg-emerald-400/15 text-emerald-400 hover:bg-emerald-400/25',
};

function ActionBtn({
  children, title, color, onClick,
}: {
  children: React.ReactNode; title: string;
  color: keyof typeof colorMap; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
        colorMap[color],
      )}
    >
      {children}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2">
      <span className="text-text-secondary w-24 flex-shrink-0">{label}</span>
      <span className="font-medium">{value ?? '—'}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text-secondary mb-1">{label}</label>
      {children}
    </div>
  );
}
