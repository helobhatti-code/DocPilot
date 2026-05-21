import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Eye, Pencil, Plus, PowerOff, Search, Trash2, UserCircle, Users as UsersIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { resolveFileUrl } from '@/lib/fileUrl';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';
import { FileUpload } from '@/components/FileUpload';
import { api } from '@/lib/api';
import { ExpiryBand, PersonType, Staff, SubcontractorOrg } from '@/lib/types';

type TabKey = 'ALL' | 'DIRECT_EMPLOYEE' | 'SUBCONTRACTOR';

const BAND_CHIP: Record<ExpiryBand, string> = {
  expired: 'bg-rose-500/15 text-rose-400',
  '7d':    'bg-rose-400/15 text-rose-300',
  '14d':   'bg-amber-400/15 text-amber-300',
  '30d':   'bg-yellow-400/15 text-yellow-300',
  valid:   'bg-emerald-400/15 text-emerald-300',
};

function BandChip({ band }: { band?: ExpiryBand | null }) {
  if (!band) return <span className="text-text-secondary">—</span>;
  return (
    <span className={clsx('px-2 py-0.5 rounded text-xs font-semibold', BAND_CHIP[band])}>
      {band === 'valid' ? 'Valid' : band === 'expired' ? 'Expired' : `≤ ${band}`}
    </span>
  );
}

export default function StaffPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const urlPersonType = (params.get('personType') as PersonType | null) ?? null;

  const [tab, setTab] = useState<TabKey>(
    urlPersonType === 'DIRECT_EMPLOYEE' ? 'DIRECT_EMPLOYEE'
    : urlPersonType === 'SUBCONTRACTOR'  ? 'SUBCONTRACTOR'
    : 'ALL',
  );
  const [employeeSubTab, setEmployeeSubTab] = useState<'CURRENT' | 'NEW_HIRES'>('CURRENT');

  // Keep URL in sync (without remounting)
  useEffect(() => {
    if (tab === 'ALL' && params.has('personType')) {
      params.delete('personType');
      setParams(params, { replace: true });
    } else if (tab !== 'ALL' && params.get('personType') !== tab) {
      params.set('personType', tab);
      setParams(params, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const personTypeFilter = tab === 'ALL' ? undefined : tab;
  const [q, setQ]         = useState('');
  const [open, setOpen]   = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff', personTypeFilter],
    queryFn: async () =>
      (await api.get('/staff', { params: personTypeFilter ? { personType: personTypeFilter } : {} })).data as Staff[],
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

  const showEmployeeCols = tab === 'DIRECT_EMPLOYEE';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">People</h1>
          <p className="text-sm text-text-secondary">
            Manage direct employees and subcontractor personnel. Gate passes link here.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> Add Person
        </button>
      </div>

      {/* Tab strip */}
      <div className="border-b border-border flex items-center gap-1">
        {([
          { key: 'ALL',              label: 'All' },
          { key: 'DIRECT_EMPLOYEE',  label: 'Direct Employees' },
          { key: 'SUBCONTRACTOR',    label: 'Subcontractors' },
        ] as { key: TabKey; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t.key
                ? 'border-brand-orange text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'DIRECT_EMPLOYEE' && (
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => setEmployeeSubTab('CURRENT')}
            className={clsx(
              'px-3 py-1 rounded-md font-medium',
              employeeSubTab === 'CURRENT'
                ? 'bg-bg-input text-text-primary'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            Current
          </button>
          <button
            onClick={() => setEmployeeSubTab('NEW_HIRES')}
            className={clsx(
              'px-3 py-1 rounded-md font-medium inline-flex items-center gap-2',
              employeeSubTab === 'NEW_HIRES'
                ? 'bg-bg-input text-text-primary'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            New Hires
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400/15 text-amber-300">
              Coming Soon
            </span>
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, company, designation…"
          className="w-full pl-10 pr-3 py-2 bg-bg-input border border-border rounded-lg outline-none focus:border-brand-orange text-text-primary text-sm"
        />
      </div>

      {tab === 'DIRECT_EMPLOYEE' && employeeSubTab === 'NEW_HIRES' ? (
        <EmptyState
          icon={UserCircle}
          title="New Hires — Coming Soon"
          description="Onboarding workflows for new employees will land in Phase 2."
        />
      ) : !isLoading && filtered.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={q ? 'No matches' : 'No people yet'}
          description={q ? 'Try a different search.' : 'Add your first person to start issuing passes.'}
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
                {showEmployeeCols && <th className="text-left px-4 py-3">Visa Expiry</th>}
                {showEmployeeCols && <th className="text-left px-4 py-3">EID Expiry</th>}
                {showEmployeeCols && <th className="text-left px-4 py-3">Worst Band</th>}
                {!showEmployeeCols && <th className="text-left px-4 py-3">Nationality</th>}
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
                    {s.personType === 'DIRECT_EMPLOYEE' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-400/15 text-green-400">
                        <UserCircle size={10} /> Employee
                      </span>
                    ) : s.subcontractorOrgId ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-brand-orange/15 text-brand-orange">
                        <Building2 size={10} /> Sub
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-brand-mid/15 text-brand-mid">
                        Own
                      </span>
                    )}
                  </td>
                  {showEmployeeCols && (
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-text-secondary text-xs">{s.visaExpiryDate ?? '—'}</span>
                        <BandChip band={s.visaExpiryBand} />
                      </div>
                    </td>
                  )}
                  {showEmployeeCols && (
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-text-secondary text-xs">{s.emiratesIdExpiryDate ?? '—'}</span>
                        <BandChip band={s.emiratesIdExpiryBand} />
                      </div>
                    </td>
                  )}
                  {showEmployeeCols && (
                    <td className="px-4 py-2.5"><BandChip band={s.worstExpiryBand} /></td>
                  )}
                  {!showEmployeeCols && <td className="px-4 py-2.5 text-text-secondary">{s.nationality ?? '—'}</td>}
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
  personType: PersonType;
  emiratesIdNo?: string;
  emiratesIdExpiryDate?: string;
  visaNo?: string;
  visaExpiryDate?: string;
  laborCardNo?: string;
  laborCardExpiryDate?: string;
  passportNo?: string;
  passportExpiryDate?: string;
}

function StaffModal({
  open, onClose, editing, tenantName,
}: {
  open: boolean; onClose: () => void; editing: Staff | null; tenantName?: string;
}) {
  const qc = useQueryClient();
  const formDefaults = (e: Staff | null): StaffForm =>
    e
      ? {
          name: e.name,
          designation: e.designation ?? '',
          nationality: e.nationality ?? '',
          companyName: e.companyName ?? '',
          subcontractorOrgId: e.subcontractorOrgId ?? '',
          isActive: e.isActive,
          personType: e.personType,
          emiratesIdNo: e.emiratesIdNo ?? '',
          emiratesIdExpiryDate: e.emiratesIdExpiryDate?.slice(0, 10) ?? '',
          visaNo: e.visaNo ?? '',
          visaExpiryDate: e.visaExpiryDate?.slice(0, 10) ?? '',
          laborCardNo: e.laborCardNo ?? '',
          laborCardExpiryDate: e.laborCardExpiryDate?.slice(0, 10) ?? '',
          passportNo: e.passportNo ?? '',
          passportExpiryDate: e.passportExpiryDate?.slice(0, 10) ?? '',
        }
      : { name: '', isActive: true, personType: 'SUBCONTRACTOR' };

  const { register, handleSubmit, reset, watch } = useForm<StaffForm>({
    defaultValues: formDefaults(editing),
  });

  const [photoUrl, setPhotoUrl] = useState<string | null>(editing?.photoUrl ?? null);

  useEffect(() => {
    reset(formDefaults(editing));
    setPhotoUrl(editing?.photoUrl ?? null);
  }, [editing, open, reset]);

  const personType = watch('personType');
  const isEmployee = personType === 'DIRECT_EMPLOYEE';

  // Fetch subcontractor orgs for dropdown
  const { data: subOrgs = [] } = useQuery<SubcontractorOrg[]>({
    queryKey: ['subcontractor-orgs'],
    queryFn: async () => (await api.get('/subcontractor-orgs')).data,
  });

  const selectedOrgId = watch('subcontractorOrgId');
  const selectedOrg   = subOrgs.find((o) => o.id === selectedOrgId);

  const save = useMutation({
    mutationFn: async (v: StaffForm) => {
      // Only send doc fields when person is a direct employee
      const empFields = v.personType === 'DIRECT_EMPLOYEE'
        ? {
            emiratesIdNo:         v.emiratesIdNo || null,
            emiratesIdExpiryDate: v.emiratesIdExpiryDate || null,
            visaNo:               v.visaNo || null,
            visaExpiryDate:       v.visaExpiryDate || null,
            laborCardNo:          v.laborCardNo || null,
            laborCardExpiryDate:  v.laborCardExpiryDate || null,
            passportNo:           v.passportNo || null,
            passportExpiryDate:   v.passportExpiryDate || null,
          }
        : {};
      const payload = {
        name:               v.name,
        designation:        v.designation,
        nationality:        v.nationality,
        isActive:           v.isActive,
        personType:         v.personType,
        photoUrl,
        subcontractorOrgId: v.subcontractorOrgId || null,
        companyName: v.companyName || selectedOrg?.name || (!v.subcontractorOrgId ? tenantName : null) || null,
        ...empFields,
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
        <Field label="Person Type *">
          <div className="flex gap-2">
            {(['DIRECT_EMPLOYEE', 'SUBCONTRACTOR'] as PersonType[]).map((pt) => (
              <label
                key={pt}
                className={clsx(
                  'flex-1 px-3 py-2 rounded-lg border cursor-pointer text-center font-medium transition-colors',
                  personType === pt
                    ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                    : 'border-border hover:bg-bg-input',
                )}
              >
                <input type="radio" value={pt} {...register('personType')} className="sr-only" />
                {pt === 'DIRECT_EMPLOYEE' ? 'Direct Employee' : 'Subcontractor'}
              </label>
            ))}
          </div>
        </Field>

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

        {!isEmployee && (
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
        )}

        <Field label="Company name">
          <input {...register('companyName')}
            placeholder={selectedOrg?.name ?? (!selectedOrgId ? tenantName : undefined) ?? 'Optional'}
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-orange placeholder-text-secondary" />
        </Field>

        {isEmployee && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="text-xs font-semibold uppercase tracking-label text-text-secondary">
              Employee Documents
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Emirates ID No.">
                <input {...register('emiratesIdNo')}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-orange" />
              </Field>
              <Field label="Emirates ID Expiry">
                <input type="date" {...register('emiratesIdExpiryDate')}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-orange" />
              </Field>
              <Field label="Visa No.">
                <input {...register('visaNo')}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-orange" />
              </Field>
              <Field label="Visa Expiry *">
                <input type="date" {...register('visaExpiryDate', { required: isEmployee })}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-orange" />
              </Field>
              <Field label="Labor Card No.">
                <input {...register('laborCardNo')}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-orange" />
              </Field>
              <Field label="Labor Card Expiry">
                <input type="date" {...register('laborCardExpiryDate')}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-orange" />
              </Field>
              <Field label="Passport No.">
                <input {...register('passportNo')}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-orange" />
              </Field>
              <Field label="Passport Expiry">
                <input type="date" {...register('passportExpiryDate')}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-orange" />
              </Field>
            </div>
          </div>
        )}

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
