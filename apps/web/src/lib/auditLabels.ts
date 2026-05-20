// Plain-English labels for audit log entries.
// Audit entries arrive in two shapes:
//   1. Business actions written by services, e.g. "HANDOVER_REGENERATED"
//   2. HTTP mutations written by the AuditInterceptor,
//      e.g. "POST /api/v1/gate-passes/:id/handover/signed"
// Both shapes map through here to a human-readable verb phrase + subject.

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Logged in',
  IMPERSONATE: 'Started impersonation',

  HANDOVER_REGENERATED: 'Regenerated handover PDF',
  HANDOVER_SIGNED_UPLOADED: 'Uploaded signed handover',
  HANDOVER_SIGNED_AND_DELIVERED: 'Uploaded signed handover and marked delivered',

  CUSTODY_DELIVER_TO_STAFF: 'Delivered pass to staff',
  CUSTODY_MARK_RETURNED: 'Marked pass returned',
  CUSTODY_SURRENDER_TO_AUTHORITY: 'Surrendered pass to authority',

  PASS_CREATED: 'Created gate pass',

  BULK_IMPORT_GATE_PASSES: 'Bulk imported gate passes',
  BULK_RENEWAL: 'Bulk renewed gate passes',
  BULK_RENEWAL_BLOCKED: 'Bulk renewal blocked',
  BULK_CANCELLATION: 'Bulk cancelled gate passes',
  BULK_CUSTODY: 'Bulk updated custody',

  CANCELLATION_REQUESTED: 'Requested pass cancellation',
  CANCELLATION_REQUESTED_AUTO: 'Auto-requested pass cancellation',
  CANCELLATION_COMPLETED: 'Completed pass cancellation',
  CANCELLATION_OVERDUE_FLAG: 'Flagged cancellation overdue',

  RENEWAL_SUBMITTED: 'Submitted renewal',
  RENEWAL_APPROVED: 'Approved renewal',
  RENEWAL_REJECTED: 'Rejected renewal',
  RENEWAL_COMPLETED: 'Completed renewal',

  STATUS_AUTO_TRANSITION: 'Auto-updated pass status',

  RETENTION_EXTENDED: 'Extended retention period',
  RETENTION_MADE_PERMANENT: 'Set retention to permanent',

  TENANT_RETENTION_UPDATED: 'Updated tenant retention policy',
  TENANT_PROFILE_UPDATED: 'Updated tenant profile',
  TENANT_PASS_CONFIG_UPDATED: 'Updated tenant pass settings',

  AUDIT_LOG_EXPORTED: 'Exported audit log',
};

// HTTP route → label. Path patterns use the Express :param form,
// stripped of any /api/v1 prefix. Match order matters (most specific first).
const ROUTE_LABELS: Array<{ method: string; path: RegExp; label: string }> = [
  { method: 'POST',   path: /^\/auth\/login$/,                                  label: 'Logged in' },
  { method: 'POST',   path: /^\/auth\/refresh$/,                                label: 'Refreshed session' },
  { method: 'POST',   path: /^\/auth\/logout$/,                                 label: 'Logged out' },
  { method: 'POST',   path: /^\/auth\/forgot-password$/,                        label: 'Requested password reset' },
  { method: 'POST',   path: /^\/auth\/reset-password$/,                         label: 'Reset password' },

  { method: 'POST',   path: /^\/gate-passes\/[^/]+\/handover\/regenerate$/,     label: 'Regenerated handover PDF' },
  { method: 'POST',   path: /^\/gate-passes\/[^/]+\/handover\/signed$/,         label: 'Uploaded signed handover' },
  { method: 'POST',   path: /^\/gate-passes\/[^/]+\/handover$/,                 label: 'Generated handover PDF' },
  { method: 'POST',   path: /^\/gate-passes\/[^/]+\/custody/,                   label: 'Updated pass custody' },
  { method: 'POST',   path: /^\/gate-passes\/[^/]+\/renew$/,                    label: 'Renewed gate pass' },
  { method: 'POST',   path: /^\/gate-passes\/[^/]+\/cancel$/,                   label: 'Cancelled gate pass' },
  { method: 'POST',   path: /^\/gate-passes\/bulk-import/,                      label: 'Bulk imported gate passes' },
  { method: 'POST',   path: /^\/gate-passes$/,                                  label: 'Created gate pass' },
  { method: 'PATCH',  path: /^\/gate-passes\/[^/]+$/,                           label: 'Updated gate pass' },
  { method: 'DELETE', path: /^\/gate-passes\/[^/]+$/,                           label: 'Deleted gate pass' },

  { method: 'POST',   path: /^\/staff$/,                                        label: 'Created staff' },
  { method: 'PATCH',  path: /^\/staff\/[^/]+$/,                                 label: 'Updated staff' },
  { method: 'DELETE', path: /^\/staff\/[^/]+$/,                                 label: 'Deleted staff' },

  { method: 'POST',   path: /^\/subcontractors$/,                               label: 'Created sub-contractor' },
  { method: 'PATCH',  path: /^\/subcontractors\/[^/]+$/,                        label: 'Updated sub-contractor' },
  { method: 'DELETE', path: /^\/subcontractors\/[^/]+$/,                        label: 'Deleted sub-contractor' },

  { method: 'POST',   path: /^\/users$/,                                        label: 'Created user' },
  { method: 'PATCH',  path: /^\/users\/[^/]+$/,                                 label: 'Updated user' },
  { method: 'DELETE', path: /^\/users\/[^/]+$/,                                 label: 'Deleted user' },

  { method: 'POST',   path: /^\/tenants$/,                                      label: 'Created tenant' },
  { method: 'PATCH',  path: /^\/tenants\/[^/]+/,                                label: 'Updated tenant' },
  { method: 'POST',   path: /^\/tenants\/[^/]+\/impersonate/,                   label: 'Started impersonation' },

  { method: 'POST',   path: /^\/uploads/,                                       label: 'Uploaded file' },
  { method: 'POST',   path: /^\/notifications/,                                 label: 'Notification action' },
];

const ENTITY_LABELS: Record<string, string> = {
  'gate-passes':       'Gate pass',
  GatePass:            'Gate pass',
  staff:               'Staff',
  Staff:               'Staff',
  users:               'User',
  User:                'User',
  tenants:             'Tenant',
  Tenant:              'Tenant',
  subcontractors:      'Sub-contractor',
  SubcontractorOrg:    'Sub-contractor',
  'audit-logs':        'Audit log',
  AuditLog:            'Audit log',
  uploads:             'Upload',
  Document:            'Document',
  notifications:       'Notification',
  Notification:        'Notification',
  CustodyHistory:      'Custody change',
  RolePermission:      'Role permission',
};

function stripApiPrefix(p: string): string {
  return p.replace(/^\/?api\/v\d+/, '').replace(/\?.*$/, '') || '/';
}

/** Convert an audit `action` field to a plain-English verb phrase. */
export function actionLabel(action: string): string {
  if (!action) return 'Activity';

  if (ACTION_LABELS[action]) return ACTION_LABELS[action];

  // HTTP route form: "METHOD /path"
  const m = action.match(/^([A-Z]+)\s+(.+)$/);
  if (m) {
    const [, method, rawPath] = m;
    const path = stripApiPrefix(rawPath);
    for (const r of ROUTE_LABELS) {
      if (r.method === method && r.path.test(path)) return r.label;
    }
    // Generic fallback: "Updated /staff/:id" style
    const verb =
      method === 'POST' ? 'Created'
      : method === 'PATCH' || method === 'PUT' ? 'Updated'
      : method === 'DELETE' ? 'Deleted'
      : method;
    const noun = path.split('/').filter(Boolean)[0]?.replace(/-/g, ' ') ?? 'record';
    return `${verb} ${noun}`;
  }

  // Generic snake/upper case fallback: HANDOVER_FOO_BAR → "Handover foo bar"
  const words = action.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Format the entity reference, e.g. ("GatePass", "7aa09d62-...") → "Gate pass 7aa09d62". */
export function entityLabel(entityType?: string | null, entityId?: string | null): string {
  if (!entityType) return '';
  const name = ENTITY_LABELS[entityType] ?? entityType;
  if (!entityId) return name;
  return `${name} ${entityId.slice(0, 8)}`;
}
