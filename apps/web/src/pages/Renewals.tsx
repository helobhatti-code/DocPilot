import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { StatusBadge, ZoneList } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { PassCardScans } from '@/components/PassCardScans';
import { api } from '@/lib/api';
import { GatePass } from '@/lib/types';

export default function RenewalsPage() {
  const qc = useQueryClient();
  const [rejectFor, setRejectFor] = useState<GatePass | null>(null);
  const [completeFor, setCompleteFor] = useState<GatePass | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['renewals-queue'],
    queryFn: async () =>
      (await api.get('/gate-passes/queues/renewals')).data as GatePass[],
  });

  const approve = useMutation({
    mutationFn: async (id: string) => api.post(`/gate-passes/${id}/renewal/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renewals-queue'] });
      qc.invalidateQueries({ queryKey: ['gate-passes'] });
      toast.success('Renewal approved');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Approve failed'),
  });

  const submitted = items.filter((p) => p.status === 'RENEWAL_SUBMITTED');
  const approved = items.filter((p) => p.status === 'RENEWAL_APPROVED');

  if (isLoading) return <div className="text-text-secondary">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Renewal Queue</h1>
        <p className="text-sm text-text-secondary">
          {submitted.length} pending review · {approved.length} approved awaiting issuance
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="No renewals in flight"
          description="Submitted renewals appear here for review."
        />
      ) : (
        <>
          <Section title="Pending Review">
            {submitted.length === 0 ? (
              <Empty>No renewals pending review.</Empty>
            ) : (
              <Table>
                {submitted.map((p) => (
                  <Row key={p.id} pass={p}>
                    <button
                      onClick={() => approve.mutate(p.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-white bg-status-valid"
                    >
                      <CheckCircle2 size={12} /> Approve
                    </button>
                    <button
                      onClick={() => setRejectFor(p)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-status-expired border border-status-expired/40 hover:bg-status-expired/10"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </Row>
                ))}
              </Table>
            )}
          </Section>

          <Section title="Approved — Issue New Pass">
            {approved.length === 0 ? (
              <Empty>None approved yet.</Empty>
            ) : (
              <Table>
                {approved.map((p) => (
                  <Row key={p.id} pass={p}>
                    <button
                      onClick={() => setCompleteFor(p)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-white bg-accent-primary"
                    >
                      Complete Renewal
                    </button>
                  </Row>
                ))}
              </Table>
            )}
          </Section>
        </>
      )}

      <RejectModal
        pass={rejectFor}
        onClose={() => setRejectFor(null)}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['renewals-queue'] })}
      />
      <CompleteModal
        pass={completeFor}
        onClose={() => setCompleteFor(null)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['renewals-queue'] });
          qc.invalidateQueries({ queryKey: ['gate-passes'] });
        }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold text-sm text-text-secondary uppercase tracking-wider mb-2">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-text-secondary text-sm py-6 text-center bg-bg-card border border-border rounded-xl">{children}</div>;
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-bg-input text-text-secondary">
          <tr>
            <th className="text-left px-4 py-2">Pass #</th>
            <th className="text-left px-4 py-2">Staff</th>
            <th className="text-left px-4 py-2">Company</th>
            <th className="text-left px-4 py-2">Zones</th>
            <th className="text-left px-4 py-2">Expiry</th>
            <th className="text-left px-4 py-2">Status</th>
            <th />
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Row({ pass, children }: { pass: GatePass; children: React.ReactNode }) {
  return (
    <tr className="border-t border-border hover:bg-bg-input/40">
      <td className="px-4 py-2 font-mono">
        <Link to={`/passes/${pass.id}`} className="text-accent-primary hover:underline">{pass.passNumber}</Link>
      </td>
      <td className="px-4 py-2">{pass.staff.name}</td>
      <td className="px-4 py-2 text-text-secondary">{pass.staff.companyName ?? pass.organization ?? '—'}</td>
      <td className="px-4 py-2"><ZoneList codes={pass.zones.map((z) => z.zoneCode)} /></td>
      <td className="px-4 py-2 text-text-secondary">{pass.expiryDate.slice(0, 10)}</td>
      <td className="px-4 py-2"><StatusBadge status={pass.status} /></td>
      <td className="px-4 py-2 flex gap-2 justify-end">{children}</td>
    </tr>
  );
}

function RejectModal({ pass, onClose, onSuccess }: { pass: GatePass | null; onClose: () => void; onSuccess: () => void }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ reason: string }>();
  const reject = useMutation({
    mutationFn: async (v: { reason: string }) =>
      api.post(`/gate-passes/${pass!.id}/renewal/reject`, v),
    onSuccess: () => {
      toast.success('Renewal rejected');
      reset();
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Reject failed'),
  });

  return (
    <Modal
      open={!!pass}
      onClose={() => { reset(); onClose(); }}
      title={pass ? `Reject renewal for ${pass.passNumber}` : ''}
      footer={
        <>
          <button onClick={() => { reset(); onClose(); }} className="px-3 py-1.5 rounded-lg border border-border text-sm">Cancel</button>
          <button
            onClick={handleSubmit((v) => reject.mutate(v))}
            className="px-3 py-1.5 rounded-lg bg-status-expired text-white text-sm"
          >
            Reject
          </button>
        </>
      }
    >
      <div className="space-y-2 text-sm">
        <label className="block text-text-secondary">Rejection reason (required)</label>
        <textarea
          {...register('reason', { required: true, minLength: 3 })}
          rows={3}
          placeholder="Explain why this renewal is being rejected…"
          className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 outline-none focus:border-accent-primary"
        />
        {errors.reason && <p className="text-xs text-status-expired">A reason of at least 3 characters is required.</p>}
      </div>
    </Modal>
  );
}

function CompleteModal({ pass, onClose, onSuccess }: { pass: GatePass | null; onClose: () => void; onSuccess: () => void }) {
  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<{ newPassNumber: string; newIssueDate?: string }>();
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);

  const reseAll = () => { reset(); setFrontUrl(null); setBackUrl(null); };

  const complete = useMutation({
    mutationFn: async (v: { newPassNumber: string; newIssueDate?: string }) =>
      api.post(`/gate-passes/${pass!.id}/renewal/complete`, {
        ...v,
        passScanFrontUrl: frontUrl ?? undefined,
        passScanBackUrl:  backUrl  ?? undefined,
      }),
    onSuccess: () => {
      toast.success('Renewal completed — new pass issued');
      reseAll();
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Completion failed'),
  });

  return (
    <Modal
      open={!!pass}
      onClose={() => { reseAll(); onClose(); }}
      title={pass ? `Issue new pass (replacing ${pass.passNumber})` : ''}
      footer={
        <>
          <button onClick={() => { reseAll(); onClose(); }} className="px-3 py-1.5 rounded-lg border border-border text-sm">Cancel</button>
          <button
            onClick={handleSubmit((v) => complete.mutate(v))}
            className="px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm"
          >
            Issue New Pass
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-text-secondary">
          The existing pass will be archived as <span className="text-status-valid">RENEWED</span> and a new pass issued for the same staff and zones.
        </p>
        <div>
          <label className="block text-text-secondary mb-1">New pass number (6 digits)</label>
          <input
            {...register('newPassNumber', { required: true, pattern: /^\d{6}$/ })}
            placeholder="123456"
            className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 font-mono outline-none focus:border-accent-primary"
          />
          {errors.newPassNumber && <p className="text-xs text-status-expired">Must be exactly 6 digits.</p>}
        </div>
        <div>
          <label className="block text-text-secondary mb-1">Issue date (defaults to today)</label>
          <input
            type="date"
            {...register('newIssueDate')}
            className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 outline-none focus:border-accent-primary"
          />
        </div>
        <div className="pt-2 border-t border-border">
          <div className="text-text-secondary mb-2">
            Pass card scans <span className="text-xs">(optional — can be added later from the pass page)</span>
          </div>
          <PassCardScans
            frontUrl={frontUrl}
            backUrl={backUrl}
            onFrontUploaded={setFrontUrl}
            onBackUploaded={setBackUrl}
          />
        </div>
      </div>
    </Modal>
  );
}
