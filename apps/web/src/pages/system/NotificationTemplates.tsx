import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Eye, RotateCcw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/Modal';
import { api } from '@/lib/api';

interface Template {
  type: string;
  subjectTemplate: string;
  bodyTemplate: string;
  isCustomized: boolean;
  defaultSubject: string;
  defaultBody: string;
  updatedAt: string | null;
}

export default function NotificationTemplatesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Template | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['notification-templates'],
    queryFn: async () => (await api.get('/notification-templates')).data as Template[],
  });

  const { data: variableData } = useQuery({
    queryKey: ['notification-template-variables'],
    queryFn: async () => (await api.get('/notification-templates/variables')).data as { variables: string[] },
  });

  const reset = useMutation({
    mutationFn: async (type: string) => api.post(`/notification-templates/${type}/reset`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-templates'] });
      toast.success('Template reset to default');
    },
  });

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Notification Templates</h1>
        <p className="text-sm text-text-secondary">
          Customise the subject and body for each notification type. Available variables:&nbsp;
          {variableData?.variables.map((v) => (
            <code key={v} className="text-xs bg-bg-input px-1 py-0.5 rounded mr-1">{`{{${v}}}`}</code>
          ))}
        </p>
      </div>

      {isLoading ? (
        <div className="text-text-secondary">Loading…</div>
      ) : (
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-input text-text-secondary">
              <tr>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Subject</th>
                <th className="text-left px-4 py-2">Customised</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.type} className="border-t border-border align-top">
                  <td className="px-4 py-2 font-mono text-xs">{t.type}</td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{t.subjectTemplate}</div>
                    <div className="text-xs text-text-secondary mt-0.5 line-clamp-1">{t.bodyTemplate}</div>
                  </td>
                  <td className="px-4 py-2">
                    {t.isCustomized ? (
                      <span className="px-2 py-0.5 rounded text-xs bg-accent-primary/10 text-accent-primary">
                        Customised
                      </span>
                    ) : (
                      <span className="text-xs text-text-secondary">Default</span>
                    )}
                  </td>
                  <td className="px-4 py-2 flex gap-2 justify-end">
                    <button
                      onClick={() => setEditing(t)}
                      className="text-xs px-2 py-1 rounded border border-border hover:bg-bg-input"
                    >
                      Edit
                    </button>
                    {t.isCustomized && (
                      <button
                        onClick={() => {
                          if (confirm(`Reset ${t.type} to default?`)) reset.mutate(t.type);
                        }}
                        className="text-xs px-2 py-1 rounded text-status-expired border border-status-expired/40 hover:bg-status-expired/10 inline-flex items-center gap-1"
                      >
                        <RotateCcw size={12} /> Reset
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditModal
        template={editing}
        variables={variableData?.variables ?? []}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['notification-templates'] })}
      />
    </div>
  );
}

function EditModal({
  template, variables, onClose, onSaved,
}: {
  template: Template | null;
  variables: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [activeField, setActiveField] = useState<'subject' | 'body'>('body');

  useEffect(() => {
    if (template) {
      setSubject(template.subjectTemplate);
      setBody(template.bodyTemplate);
      setPreview(null);
    }
  }, [template]);

  const save = useMutation({
    mutationFn: async () =>
      api.patch(`/notification-templates/${template!.type}`, {
        subjectTemplate: subject,
        bodyTemplate: body,
      }),
    onSuccess: () => {
      toast.success('Template saved');
      onSaved();
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Save failed'),
  });

  const previewMut = useMutation({
    mutationFn: async () =>
      (await api.post(`/notification-templates/${template!.type}/preview`, {
        subjectTemplate: subject,
        bodyTemplate: body,
      })).data as { subject: string; body: string },
    onSuccess: (data) => setPreview(data),
  });

  const insertVariable = (v: string) => {
    const placeholder = `{{${v}}}`;
    if (activeField === 'subject') {
      setSubject((s) => s + placeholder);
    } else {
      setBody((s) => s + placeholder);
    }
  };

  const dirty =
    template &&
    (subject !== template.subjectTemplate || body !== template.bodyTemplate);

  return (
    <Modal
      open={!!template}
      onClose={onClose}
      title={template ? `Edit template — ${template.type}` : ''}
      width="max-w-3xl"
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-border text-sm">Cancel</button>
          <button
            onClick={() => previewMut.mutate()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-bg-input"
          >
            <Eye size={14} /> Preview
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm disabled:opacity-50"
          >
            <Save size={14} /> Save
          </button>
        </>
      }
    >
      {template && (
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-text-secondary mb-1">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => setActiveField('subject')}
              className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 outline-none focus:border-accent-primary"
            />
          </div>
          <div>
            <label className="block text-text-secondary mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onFocus={() => setActiveField('body')}
              rows={8}
              className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 font-mono text-xs outline-none focus:border-accent-primary"
            />
          </div>
          <div>
            <div className="text-xs text-text-secondary mb-1">Insert variable:</div>
            <div className="flex flex-wrap gap-1">
              {variables.map((v) => (
                <button
                  key={v}
                  onClick={() => insertVariable(v)}
                  type="button"
                  className="text-xs px-2 py-0.5 rounded bg-bg-input border border-border hover:border-accent-primary font-mono"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>

          {preview && (
            <div className="bg-bg-input border border-border rounded-lg p-3 mt-3">
              <div className="text-xs text-text-secondary mb-1">Preview</div>
              <div className="font-medium">{preview.subject}</div>
              <pre className={clsx('text-xs whitespace-pre-wrap mt-1 text-text-secondary')}>{preview.body}</pre>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
