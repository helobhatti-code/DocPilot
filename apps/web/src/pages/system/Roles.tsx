import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { UserRole } from '@/lib/types';

interface PermissionRow {
  id: string;
  role: UserRole;
  module: string;
  feature: string;
  isEnabled: boolean;
}

const VISIBLE_ROLES: UserRole[] = ['ADMIN', 'PM', 'HR', 'SECRETARY', 'VIEWER'];

const MODULE_LABELS: Record<string, string> = {
  gate_passes: 'Passes',
  staff: 'Staff',
  documents: 'Documents',
  reports: 'Reports',
  notifications: 'Notifications',
  users: 'Users',
  role_permissions: 'Roles & Access',
  tenant_settings: 'System Settings',
  audit_logs: 'Audit Log',
  subcontractor_orgs: 'Subcontractors',
};

const FEATURE_LABELS: Record<string, string> = {
  view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete',
  renew: 'Renew', cancel: 'Cancel', upload: 'Upload', export: 'Export',
  invite: 'Invite', deactivate: 'Deactivate', configure: 'Configure',
};

interface Edit {
  role: UserRole;
  module: string;
  feature: string;
  isEnabled: boolean;
}

export default function RolesPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ['role-permissions'],
    queryFn: async () => (await api.get('/role-permissions')).data as PermissionRow[],
  });
  const [edits, setEdits] = useState<Map<string, Edit>>(new Map());

  useEffect(() => { setEdits(new Map()); }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const updates = Array.from(edits.values());
      return api.patch('/role-permissions', { updates });
    },
    onSuccess: () => {
      toast.success('Permissions saved');
      qc.invalidateQueries({ queryKey: ['role-permissions'] });
    },
    onError: () => toast.error('Save failed'),
  });

  const cellKey = (role: UserRole, module: string, feature: string) => `${role}|${module}|${feature}`;
  const isOn = (role: UserRole, module: string, feature: string) => {
    const k = cellKey(role, module, feature);
    if (edits.has(k)) return edits.get(k)!.isEnabled;
    if (role === 'ADMIN') return true;
    return data.find((r) => r.role === role && r.module === module && r.feature === feature)?.isEnabled ?? false;
  };

  const toggle = (role: UserRole, module: string, feature: string) => {
    if (role === 'ADMIN') return;
    const k = cellKey(role, module, feature);
    const current = isOn(role, module, feature);
    const next = new Map(edits);
    next.set(k, { role, module, feature, isEnabled: !current });
    setEdits(next);
  };

  const modules = Array.from(new Set(data.map((d) => d.module)));
  const featuresByModule = Object.fromEntries(
    modules.map((m) => [m, Array.from(new Set(data.filter((d) => d.module === m).map((d) => d.feature)))]),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Roles & Access</h1>
          <p className="text-sm text-text-secondary">Toggle permissions per role. Admin always has full access.</p>
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={edits.size === 0}
          className="px-4 py-2 rounded-lg bg-accent-primary text-white text-sm disabled:opacity-50"
        >
          Save Changes ({edits.size})
        </button>
      </div>

      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-input">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Module / Feature</th>
              {VISIBLE_ROLES.map((r) => (
                <th key={r} className="px-4 py-3 text-center font-semibold">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((module) => (
              <tbody key={module} className="contents">
                <tr className="border-t border-border">
                  <td colSpan={VISIBLE_ROLES.length + 1} className="px-4 py-2 text-xs uppercase tracking-wider text-text-secondary bg-bg-input/30">
                    {MODULE_LABELS[module] ?? module}
                  </td>
                </tr>
                {featuresByModule[module].map((feature) => (
                  <tr key={`${module}-${feature}`} className="border-t border-border">
                    <td className="px-4 py-2.5">{FEATURE_LABELS[feature] ?? feature}</td>
                    {VISIBLE_ROLES.map((role) => (
                      <td key={role} className="px-4 py-2 text-center">
                        <Toggle
                          on={isOn(role, module, feature)}
                          disabled={role === 'ADMIN'}
                          onClick={() => toggle(role, module, feature)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'w-10 h-5 rounded-full relative transition-colors',
        on ? 'bg-status-valid' : 'bg-bg-input',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
          on ? 'left-5' : 'left-0.5',
        )}
      />
    </button>
  );
}
