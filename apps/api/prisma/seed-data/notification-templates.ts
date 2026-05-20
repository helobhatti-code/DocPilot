import { NotificationType } from '@prisma/client';

export interface TemplateRow {
  type: NotificationType;
  subjectTemplate: string;
  bodyTemplate: string;
}

export const DEFAULT_TEMPLATES: TemplateRow[] = [
  { type: 'EXPIRY_30', subjectTemplate: 'Pass {{passNumber}} expires in 30 days', bodyTemplate: 'Pass {{passNumber}} for {{staffName}} expires on {{expiryDate}}.' },
  { type: 'EXPIRY_15', subjectTemplate: 'Pass {{passNumber}} expires in 15 days', bodyTemplate: 'Pass {{passNumber}} for {{staffName}} expires on {{expiryDate}}.' },
  { type: 'EXPIRY_7',  subjectTemplate: 'Pass {{passNumber}} expires in 7 days',  bodyTemplate: 'Pass {{passNumber}} for {{staffName}} expires on {{expiryDate}}.' },
  { type: 'EXPIRY_0',  subjectTemplate: 'Pass {{passNumber}} has expired',        bodyTemplate: 'Pass {{passNumber}} for {{staffName}} expired on {{expiryDate}} and must be returned.' },
  { type: 'OVERDUE_CANCELLATION', subjectTemplate: 'Cancellation overdue: {{passNumber}}', bodyTemplate: 'Cancellation request for pass {{passNumber}} has been pending for over 7 days.' },
  { type: 'OVERDUE_HANDOVER', subjectTemplate: 'Handover overdue: {{passNumber}}', bodyTemplate: 'Pass {{passNumber}} requires authority handover; currently overdue.' },
  { type: 'STAFF_OFFBOARDING', subjectTemplate: 'Staff offboarding: {{staffName}}', bodyTemplate: 'Staff {{staffName}} last working day is {{lastWorkingDay}}; cancel any active passes.' },
  { type: 'CUSTODY_CHANGE', subjectTemplate: 'Custody change: {{passNumber}}', bodyTemplate: 'Pass {{passNumber}} custody changed from {{fromStatus}} to {{toStatus}} by {{actor}}.' },
  { type: 'RENEWAL_APPROVED', subjectTemplate: 'Renewal approved: {{passNumber}}', bodyTemplate: 'Renewal for pass {{passNumber}} has been approved.' },
  { type: 'RENEWAL_REJECTED', subjectTemplate: 'Renewal rejected: {{passNumber}}', bodyTemplate: 'Renewal for pass {{passNumber}} was rejected. Reason: {{reason}}.' },
  { type: 'CANCELLATION_CONFIRMED', subjectTemplate: 'Cancellation confirmed: {{passNumber}}', bodyTemplate: 'Pass {{passNumber}} cancellation has been confirmed by the authority.' },
  { type: 'PERMISSION_CHANGE', subjectTemplate: 'Your permissions changed', bodyTemplate: 'Your role permissions have been updated by {{actor}}.' },
  { type: 'DATA_DELETION_WARNING', subjectTemplate: 'Data deletion scheduled: {{passNumber}}', bodyTemplate: 'Pass {{passNumber}} data will be deleted on {{deletionDate}} per retention policy.' },
  { type: 'INVITATION', subjectTemplate: 'You are invited to GPMS', bodyTemplate: 'Use this token to set up your account: {{token}} (expires {{expiresAt}}).' },
];
