import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Modal } from '@/components/Modal';
import { api } from '@/lib/api';
import { UserRole } from '@/lib/types';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  invitationExpiresAt?: string | null;
  lastLoginAt?: string | null;
}

const ROLES: UserRole[] = ['ADMIN', 'PM', 'HR', 'SECRETARY', 'VIEWER', 'SUBCONTRACTOR'];

export default function UsersPage() {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data as UserRow[],
  });

  const toggleActive = useMutation({
    mutationFn: async (u: UserRow) => api.patch(`/users/${u.id}`, { isActive: !u.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => api.patch(`/users/${id}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const resend = useMutation({
    mutationFn: async (id: string) => api.post(`/users/invitations/${id}/resend`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('Invitation re-sent'); },
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => api.delete(`/users/invitations/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('Invitation revoked'); },
  });

  const active = users.filter((u) => !u.invitationExpiresAt);
  const pending = users.filter((u) => u.invitationExpiresAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-text-secondary">Invite teammates and manage their roles.</p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-primary text-white text-sm"
        >
          <Plus size={16} /> Invite User
        </button>
      </div>

      <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <header className="px-4 py-3 border-b border-border font-semibold text-sm">Active Users</header>
        <table className="w-full text-sm">
          <thead className="bg-bg-input text-text-secondary">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Last Login</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-text-secondary">Loading…</td></tr>}
            {active.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-2">{u.name}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">
                  <select
                    value={u.role}
                    onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value as UserRole })}
                    className="bg-bg-input border border-border rounded px-2 py-1 text-xs"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => toggleActive.mutate(u)}
                    className={`px-2 py-0.5 rounded text-xs text-white ${u.isActive ? 'bg-status-valid' : 'bg-status-cancelled'}`}
                  >
                    {u.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-2 text-text-secondary">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {pending.length > 0 && (
        <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <header className="px-4 py-3 border-b border-border font-semibold text-sm">Pending Invitations</header>
          <table className="w-full text-sm">
            <thead className="bg-bg-input text-text-secondary">
              <tr>
                <th className="text-left px-4 py-2">Email</th>
                <th className="text-left px-4 py-2">Role</th>
                <th className="text-left px-4 py-2">Expires</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pending.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{u.role}</td>
                  <td className="px-4 py-2 text-text-secondary">{u.invitationExpiresAt && new Date(u.invitationExpiresAt).toLocaleString()}</td>
                  <td className="px-4 py-2 flex gap-2 justify-end">
                    <button onClick={() => resend.mutate(u.id)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-bg-input">
                      <RotateCcw size={12} /> Resend
                    </button>
                    <button onClick={() => revoke.mutate(u.id)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-status-expired border border-status-expired/40 hover:bg-status-expired/10">
                      <Trash2 size={12} /> Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<{ name: string; email: string; role: UserRole }>();

  const invite = useMutation({
    mutationFn: async (v: { name: string; email: string; role: UserRole }) =>
      (await api.post('/users/invite', v)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Invitation sent');
      reset();
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to invite'),
  });

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Invite User"
      footer={
        <>
          <button onClick={() => { reset(); onClose(); }} className="px-3 py-1.5 rounded-lg border border-border text-sm">Cancel</button>
          <button onClick={handleSubmit((v) => invite.mutate(v))} className="px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm inline-flex items-center gap-1">
            <Mail size={14} /> Send Invitation
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <label className="block text-text-secondary mb-1">Full name</label>
          <input {...register('name', { required: true, minLength: 2 })} className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5" />
          {errors.name && <p className="text-xs text-status-expired">Required</p>}
        </div>
        <div>
          <label className="block text-text-secondary mb-1">Email</label>
          <input type="email" {...register('email', { required: true })} className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5" />
          {errors.email && <p className="text-xs text-status-expired">Required</p>}
        </div>
        <div>
          <label className="block text-text-secondary mb-1">Role</label>
          <select {...register('role', { required: true })} className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  );
}
