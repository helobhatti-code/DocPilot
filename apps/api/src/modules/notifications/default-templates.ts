import { NotificationType } from '@prisma/client';

export interface DefaultTemplate {
  type: NotificationType;
  subjectTemplate: string;
  bodyTemplate: string;
}

/**
 * Tenant-agnostic defaults. The notification-templates table is seeded from
 * this list and may be overridden per-tenant via the template editor.
 */
export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    type: 'EXPIRY_30',
    subjectTemplate: 'Pass {{passNumber}} expires in 30 days',
    bodyTemplate:
      'Hello,\n\nGate pass {{passNumber}} for {{staffName}} expires on {{expiryDate}} ({{daysRemaining}} days remaining).\n\nReview: {{actionUrl}}',
  },
  {
    type: 'EXPIRY_15',
    subjectTemplate: 'Pass {{passNumber}} expires in 15 days',
    bodyTemplate:
      'Heads up — gate pass {{passNumber}} for {{staffName}} expires on {{expiryDate}}. Plan renewal soon.\n\nReview: {{actionUrl}}',
  },
  {
    type: 'EXPIRY_7',
    subjectTemplate: 'Pass {{passNumber}} expires in 7 days — renewal window open',
    bodyTemplate:
      'The renewal window for pass {{passNumber}} ({{staffName}}) is now open. Expiry: {{expiryDate}}.\n\nSubmit renewal: {{actionUrl}}',
  },
  {
    type: 'EXPIRY_0',
    subjectTemplate: 'Pass {{passNumber}} has expired',
    bodyTemplate:
      'Pass {{passNumber}} for {{staffName}} expired on {{expiryDate}} and must be returned to the authority.\n\nView: {{actionUrl}}',
  },
  {
    type: 'OVERDUE_CANCELLATION',
    subjectTemplate: 'Cancellation overdue: pass {{passNumber}}',
    bodyTemplate:
      'Pass {{passNumber}} ({{staffName}}) has been pending cancellation for over 7 days. Surrender to authority is required.\n\nView: {{actionUrl}}',
  },
  {
    type: 'OVERDUE_HANDOVER',
    subjectTemplate: 'Handover overdue: pass {{passNumber}}',
    bodyTemplate:
      'Pass {{passNumber}} requires authority handover. It has been pending for over 7 days.\n\nView: {{actionUrl}}',
  },
  {
    type: 'STAFF_OFFBOARDING',
    subjectTemplate: 'Staff offboarding: {{staffName}}',
    bodyTemplate:
      '{{staffName}} has been offboarded (last working day {{lastWorkingDay}}). Active passes have been queued for cancellation and must be surrendered within 7 days.',
  },
  {
    type: 'CUSTODY_CHANGE',
    subjectTemplate: 'Custody change: pass {{passNumber}}',
    bodyTemplate:
      'Pass {{passNumber}} ({{staffName}}) custody changed from {{fromStatus}} to {{toStatus}} by {{actor}}.\n\nView: {{actionUrl}}',
  },
  {
    type: 'RENEWAL_APPROVED',
    subjectTemplate: 'Renewal approved: pass {{passNumber}}',
    bodyTemplate:
      'The renewal for pass {{passNumber}} ({{staffName}}) has been approved. Issue a new pass to complete renewal.\n\nView: {{actionUrl}}',
  },
  {
    type: 'RENEWAL_REJECTED',
    subjectTemplate: 'Renewal rejected: pass {{passNumber}}',
    bodyTemplate:
      'The renewal for pass {{passNumber}} ({{staffName}}) was rejected. Reason: {{reason}}.\n\nView: {{actionUrl}}',
  },
  {
    type: 'CANCELLATION_CONFIRMED',
    subjectTemplate: 'Cancellation confirmed: pass {{passNumber}}',
    bodyTemplate:
      'Pass {{passNumber}} ({{staffName}}) cancellation has been confirmed by the authority. Data deletion scheduled for {{deletionDate}}.',
  },
  {
    type: 'PERMISSION_CHANGE',
    subjectTemplate: 'Your permissions have changed',
    bodyTemplate:
      'Your role permissions in DocPilot have been updated by {{actor}}. Sign in again if you don\'t see the new access immediately.',
  },
  {
    type: 'DATA_DELETION_WARNING',
    subjectTemplate: 'Data deletion in 7 days: pass {{passNumber}}',
    bodyTemplate:
      'Pass {{passNumber}} ({{staffName}}) data is scheduled for deletion on {{deletionDate}} per tenant retention policy. Export now if you need archival copies.',
  },
  {
    type: 'INVITATION',
    subjectTemplate: 'You have been invited to DocPilot',
    bodyTemplate:
      'Use this invitation link to set up your account: {{actionUrl}}\n\nToken: {{token}} (expires {{expiresAt}}).',
  },
  {
    type: 'DOCUMENT_EXPIRY_ALERT',
    subjectTemplate: 'Document expiry alert: {{docKind}}',
    bodyTemplate:
      '{{displayName}} {{statusLine}}. Please take action to renew or replace the document.',
  },
];
