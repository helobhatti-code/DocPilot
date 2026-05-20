import { UserRole } from '@prisma/client';

/**
 * Default role/permission matrix per PRD §4.1. ADMIN and SUPER_ADMIN bypass
 * permission lookups in the guard, so they don't need explicit rows here —
 * but we seed them anyway so the toggle UI shows them as fully enabled.
 */
export interface PermissionRow {
  role: UserRole;
  module: string;
  feature: string;
  isEnabled: boolean;
}

const MODULES: { module: string; features: string[] }[] = [
  { module: 'gate_passes', features: ['view', 'create', 'edit', 'delete', 'renew', 'cancel'] },
  { module: 'staff', features: ['view', 'create', 'edit', 'delete'] },
  { module: 'documents', features: ['view', 'upload', 'delete'] },
  { module: 'reports', features: ['view', 'export'] },
  { module: 'users', features: ['view', 'invite', 'edit', 'deactivate'] },
  { module: 'role_permissions', features: ['view', 'edit'] },
  { module: 'notifications', features: ['view', 'configure'] },
  { module: 'tenant_settings', features: ['view', 'edit'] },
  { module: 'audit_logs', features: ['view'] },
  { module: 'subcontractor_orgs', features: ['view', 'create', 'edit'] },
];

const MATRIX: Record<UserRole, Record<string, string[]>> = {
  SUPER_ADMIN: {}, // wildcard via guard
  ADMIN: {},        // wildcard via guard
  PM: {
    gate_passes: ['view', 'create', 'edit', 'renew', 'cancel'],
    staff: ['view', 'create', 'edit'],
    documents: ['view', 'upload'],
    reports: ['view', 'export'],
    notifications: ['view'],
    subcontractor_orgs: ['view', 'create', 'edit'],
  },
  HR: {
    gate_passes: ['view', 'create', 'edit'],
    staff: ['view', 'create', 'edit'],
    documents: ['view', 'upload'],
    reports: ['view'],
    notifications: ['view'],
  },
  SECRETARY: {
    gate_passes: ['view', 'create', 'edit'],
    staff: ['view', 'create'],
    documents: ['view', 'upload'],
    notifications: ['view'],
  },
  VIEWER: {
    gate_passes: ['view'],
    staff: ['view'],
    documents: ['view'],
    reports: ['view'],
  },
  SUBCONTRACTOR: {
    gate_passes: ['view'],
    staff: ['view'],
    documents: ['view'],
  },
};

export function defaultPermissions(): PermissionRow[] {
  const rows: PermissionRow[] = [];
  const roles: UserRole[] = ['PM', 'HR', 'SECRETARY', 'VIEWER', 'SUBCONTRACTOR'];
  for (const role of roles) {
    const enabled = MATRIX[role];
    for (const m of MODULES) {
      for (const feat of m.features) {
        rows.push({
          role,
          module: m.module,
          feature: feat,
          isEnabled: enabled[m.module]?.includes(feat) ?? false,
        });
      }
    }
  }
  return rows;
}
