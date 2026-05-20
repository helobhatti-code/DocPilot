import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { resolveFileUrl } from '@/lib/fileUrl';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  Lock,
  LucideIcon,
  Printer,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AirportBadge, CustodyBadge, StatusBadge, ZoneBadge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { PassCardScans } from '@/components/PassCardScans';
import { api } from '@/lib/api';
import { CUSTODY_COLORS } from '@/lib/constants';
import { CustodyStatus, GatePass } from '@/lib/types';

const CUSTODY_FLOW: CustodyStatus[] = [
  'WITH_COMPANY',
  'WITH_PERSON',
  'RETURNED_TO_COMPANY',
  'SURRENDERED_TO_AUTHORITY',
];

export default function PassDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const signedInputRef = useRef<HTMLInputElement>(null);
  const [signedConfirmed, setSignedConfirmed] = useState(false);

  const { data: pass, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['gate-passes', id],
    queryFn: async () => (await api.get(`/gate-passes/${id}`)).data as GatePass,
    enabled: !!id,
    retry: 2,
    retryDelay: (attempt) => Math.min(3000 * 2 ** attempt, 15000), // 3s, 6s
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['gate-passes', id] });
    qc.invalidateQueries({ queryKey: ['gate-passes'] });
    qc.invalidateQueries({ queryKey: ['pending-handover'] });
  };

  const submitRenewal = useMutation({
    mutationFn: async () => api.post(`/gate-passes/${id}/renewal`, {}),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['renewals-queue'] });
      toast.success('Renewal submitted');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Renewal failed'),
  });

  const returnMutation = useMutation({
    mutationFn: async () => (await api.post(`/gate-passes/${id}/custody/return`, {})).data,
    onSuccess: () => {
      invalidate();
      toast.success('Marked as returned');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to mark returned'),
  });

  const surrenderMutation = useMutation({
    mutationFn: async (v: { handoverDate: string; officerName: string; referenceNumber: string }) =>
      (await api.post(`/gate-passes/${id}/custody/surrender`, v)).data,
    onSuccess: () => {
      invalidate();
      toast.success('Authority handover recorded');
      setHandoverOpen(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to record handover'),
  });

  const savePassScan = useMutation({
    mutationFn: async (patch: {
      passScanFrontUrl?: string;
      passScanBackUrl?: string;
      receiptScanUrl?: string;
    }) => (await api.patch(`/gate-passes/${id}`, patch)).data,
    onSuccess: () => {
      invalidate();
      toast.success('Document saved');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Save failed'),
  });

  const regenerateHandover = useMutation({
    mutationFn: async () => (await api.post(`/gate-passes/${id}/handover/regenerate`)).data,
    onSuccess: () => {
      invalidate();
      toast.success('Handover document regenerated');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Regeneration failed'),
  });

  const uploadSigned = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return (
        await api.post(`/gate-passes/${id}/handover/signed`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data as { autoDelivered: boolean };
    },
    onSuccess: (data) => {
      invalidate();
      setSignedConfirmed(false);
      toast.success(
        data?.autoDelivered
          ? '✅ Signed handover uploaded — pass automatically delivered to staff'
          : 'Signed handover uploaded',
      );
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Upload failed'),
  });

  if (isLoading) return (
    <div className="space-y-4">
      <button onClick={() => nav(-1)} className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
        <ArrowLeft size={16} /> Back
      </button>
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-brand-orange border-t-transparent animate-spin" />
        <p className="text-text-secondary text-sm">Loading gate pass…</p>
        <p className="text-text-secondary text-xs">If this takes too long, the server may be waking up (free tier). Please wait.</p>
      </div>
    </div>
  );

  if (isError || !pass) return (
    <div className="space-y-4">
      <button onClick={() => nav(-1)} className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
        <ArrowLeft size={16} /> Back to passes
      </button>
      <div className="flex flex-col items-center justify-center py-24 gap-4 bg-bg-card border border-border rounded-xl">
        <AlertTriangle size={36} className="text-brand-orange" />
        <div className="text-center">
          <p className="font-semibold">Could not load gate pass</p>
          <p className="text-text-secondary text-sm mt-1">
            {(error as any)?.response?.data?.message ?? 'The server may be starting up. Please try again.'}
          </p>
        </div>
        <button onClick={() => refetch()}
          className="px-4 py-2 rounded-lg bg-brand-orange text-white text-sm font-semibold hover:bg-brand-orange-dark transition-colors">
          Retry
        </button>
      </div>
    </div>
  );

  const today = new Date();
  const expiry = new Date(pass.expiryDate);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / (24 * 3600 * 1000));
  const expired = days < 0;
  const renewalDisabled = days > 7;
  const renewalEligibleStatus = (
    ['VALID', 'EXPIRY_30', 'EXPIRY_15', 'EXPIRY_7'] as const
  ).includes(pass.status as never);
  const cancellable = !(['CANCELLED', 'CANCELLATION_REQUESTED', 'RENEWED'] as const).includes(pass.status as never);

  // Days pending handover for the missing-handover and overdue banners.
  const returnedAt = pass.custodyHistory?.find((e) => e.toStatus === 'RETURNED_TO_COMPANY')?.createdAt;
  const daysPending = returnedAt
    ? Math.floor((today.getTime() - new Date(returnedAt).getTime()) / (24 * 3600 * 1000))
    : 0;
  const handoverPendingOverdue =
    pass.custodyStatus === 'RETURNED_TO_COMPANY' && daysPending > 7;
  const signedHandoverMissing =
    pass.custodyStatus !== 'WITH_COMPANY' && pass.handoverUnsignedUrl && !pass.handoverSignedUrl;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => nav(-1)}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors no-print"
      >
        <ArrowLeft size={16} /> Back to passes
      </button>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-text-secondary text-sm">Gate Pass</div>
          <h1 className="text-2xl font-semibold font-mono">{pass.passNumber}</h1>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={pass.status} />
            <CustodyBadge status={pass.custodyStatus} />
          </div>
        </div>
        <div className="flex gap-2 no-print">
          {renewalEligibleStatus && (
            <button
              onClick={() => submitRenewal.mutate()}
              disabled={renewalDisabled || submitRenewal.isPending}
              title={renewalDisabled ? 'Renewal opens at 7 days before expiry' : undefined}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-primary text-white text-sm disabled:opacity-50"
            >
              <RotateCcw size={14} /> Submit Renewal
            </button>
          )}
          {cancellable && (
            <button
              onClick={() => setCancelOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-status-expired/40 text-status-expired text-sm hover:bg-status-expired/10"
            >
              <X size={14} /> Cancel Pass
            </button>
          )}
          {/* Deliver to Staff removed — delivery now happens automatically
              when the signed handover document is uploaded (Step 2 below) */}
          {pass.custodyStatus === 'WITH_PERSON' && (
            <button
              onClick={() => returnMutation.mutate()}
              disabled={returnMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm disabled:opacity-50"
            >
              Mark as Returned
            </button>
          )}
          {pass.custodyStatus === 'RETURNED_TO_COMPANY' && (
            <button
              onClick={() => setHandoverOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-status-completed text-white text-sm"
            >
              Record Authority Handover
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm"
          >
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* ---- Banners ---- */}
      {handoverPendingOverdue && (
        <Banner
          tone="danger"
          icon={AlertTriangle}
          title={`Authority handover overdue (${daysPending} days pending)`}
          description="This pass has been pending authority handover for more than 7 days. Surrender the pass or escalate to the issuing authority."
        />
      )}
      {signedHandoverMissing && (
        <Banner
          tone="warning"
          icon={AlertTriangle}
          title="Signed handover document missing"
          description="An unsigned handover was generated when the pass was delivered. Upload the signed copy after the staff member acknowledges receipt."
          action={
            <>
              <a
                href={pass.handoverUnsignedUrl!}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm"
              >
                <Download size={14} /> View unsigned
              </a>
              <button
                onClick={() => signedInputRef.current?.click()}
                disabled={uploadSigned.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm disabled:opacity-50"
              >
                <Upload size={14} /> Upload signed copy
              </button>
              <input
                ref={signedInputRef}
                type="file"
                hidden
                accept="image/jpeg,image/jpg,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadSigned.mutate(f);
                  e.target.value = '';
                }}
              />
            </>
          }
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Staff">
          <div className="flex gap-4">
            {pass.staff.photoUrl
              ? <img src={resolveFileUrl(pass.staff.photoUrl)!} className="w-20 h-20 rounded-lg object-cover" alt="" />
              : <div className="w-20 h-20 rounded-lg bg-bg-input grid place-items-center text-2xl">{pass.staff.name.charAt(0)}</div>}
            <dl className="text-sm space-y-1">
              <Row label="Name" value={pass.staff.name} />
              <Row label="Nationality" value={pass.staff.nationality} />
              <Row label="Designation" value={pass.staff.designation} />
              <Row label="Company" value={pass.staff.companyName} />
              <Row label="Organization" value={pass.organization} />
              <Row label="Department" value={pass.department} />
            </dl>
          </div>
        </Card>

        <Card title="Pass Details">
          <dl className="text-sm space-y-1">
            <Row label="Pass #" value={<span className="font-mono">{pass.passNumber}</span>} />
            <Row label="Airport" value={<AirportBadge code={pass.airport} />} />
            <Row label="Issue Date" value={pass.issueDate.slice(0, 10)} />
            <Row label="Expiry Date" value={pass.expiryDate.slice(0, 10)} />
            <Row
              label="Time Remaining"
              value={
                <span className={clsx(expired ? 'text-status-expired' : days <= 7 ? 'text-status-expiring' : 'text-status-valid')}>
                  {expired ? `${Math.abs(days)} days overdue` : `${days} days remaining`}
                </span>
              }
            />
            <Row label="Zones" value={
              <div className="flex flex-wrap gap-1">
                {pass.zones.map((z) => <ZoneBadge key={z.zoneCode} code={z.zoneCode} />)}
              </div>
            } />
            {pass.custodyStatus === 'SURRENDERED_TO_AUTHORITY' && (
              <>
                <Row label="Authority Handover" value={pass.authorityHandoverDate?.slice(0, 10) ?? '—'} />
                <Row label="Officer" value={pass.authorityOfficerName} />
                <Row label="Reference #" value={pass.authorityReferenceNumber} />
              </>
            )}
          </dl>
        </Card>
      </div>

      <Card title="Handover Documents" icon={FileText}>
        <div className="space-y-3">
          {/* Step 1 — Generate */}
          <HandoverStep
            step={1}
            title="Generate unsigned document"
            description="Create the handover PDF. Print it and hand to staff for signature."
            done={!!pass.handoverUnsignedUrl}
          >
            {pass.handoverUnsignedUrl && (
              <a
                href={resolveFileUrl(pass.handoverUnsignedUrl)!}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-brand-mid hover:text-brand-orange transition-colors"
              >
                <Download size={13} /> Open / Download PDF
              </a>
            )}
            <button
              onClick={() => regenerateHandover.mutate()}
              disabled={regenerateHandover.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-bg-input transition-colors disabled:opacity-50"
            >
              {regenerateHandover.isPending ? 'Generating…' : pass.handoverUnsignedUrl ? 'Regenerate' : 'Generate'}
            </button>
          </HandoverStep>

          {/* Step 2 — Upload signed */}
          <HandoverStep
            step={2}
            title="Upload signed copy"
            description="Print Step 1 document → get staff signature → scan and upload here. The QR code in the document is verified automatically."
            done={!!pass.handoverSignedUrl}
            locked={!pass.handoverUnsignedUrl}
            lockedHint="Generate the document first (Step 1)."
          >
            {pass.handoverSignedUrl && (
              <a
                href={resolveFileUrl(pass.handoverSignedUrl)!}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-brand-mid hover:text-brand-orange transition-colors"
              >
                <CheckCircle2 size={13} /> View signed copy
              </a>
            )}
            {pass.handoverUnsignedUrl && (
              <div className="w-full space-y-3">
                {/* Confirmation checkbox */}
                <label className="flex items-start gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={signedConfirmed}
                    onChange={(e) => setSignedConfirmed(e.target.checked)}
                    className="mt-0.5 accent-brand-orange"
                  />
                  <span className="text-text-secondary">
                    I confirm that the <strong className="text-text-primary">staff member has physically signed</strong> the printed handover document and I am uploading the correct signed copy.
                  </span>
                </label>
                <button
                  onClick={() => signedInputRef.current?.click()}
                  disabled={uploadSigned.isPending || !signedConfirmed}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!signedConfirmed ? 'Please confirm the staff member has signed first' : undefined}
                >
                  <Upload size={13} />
                  {uploadSigned.isPending ? 'Verifying & uploading…' : pass.handoverSignedUrl ? 'Replace signed copy' : 'Upload signed copy'}
                </button>
                <p className="text-[11px] text-text-secondary">
                  ⓘ The system tries to read the QR code from your scan. If the QR is unreadable due to scan quality, the upload still proceeds — but uploading a document from a different pass will be rejected.
                </p>
              </div>
            )}
          </HandoverStep>

          {/* Step 3 — Status indicator */}
          <HandoverStep
            step={3}
            title="Pass delivered to staff"
            description="Status automatically updates to 'With Person' when signed document is uploaded."
            done={pass.custodyStatus !== 'WITH_COMPANY'}
          >
            {pass.custodyStatus !== 'WITH_COMPANY' && (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 size={13} /> Delivered — custody status updated
              </span>
            )}
          </HandoverStep>
        </div>

        <input
          ref={signedInputRef}
          type="file"
          hidden
          accept="image/jpeg,image/jpg,application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadSigned.mutate(f);
            e.target.value = '';
          }}
        />
      </Card>

      <Card title="Pass Documents" icon={FileText}>
        <p className="text-xs text-text-secondary mb-3">
          Upload photographs of the physical pass card and the authority receipt. Each slot can be replaced at any time.
        </p>
        <PassCardScans
          gatePassId={pass.id}
          frontUrl={pass.passScanFrontUrl}
          backUrl={pass.passScanBackUrl}
          receiptUrl={pass.receiptScanUrl}
          onFrontUploaded={(url) => savePassScan.mutate({ passScanFrontUrl: url })}
          onBackUploaded={(url) => savePassScan.mutate({ passScanBackUrl: url })}
          onReceiptUploaded={(url) => savePassScan.mutate({ receiptScanUrl: url })}
        />
      </Card>

      <Card title="Documents">
        {(() => {
          // Combine direct pass-scan fields with Document model records
          const directDocs = [
            { key: 'front', label: 'Pass Scan (Front)', url: resolveFileUrl(pass.passScanFrontUrl) },
            { key: 'back',  label: 'Pass Scan (Back)',  url: resolveFileUrl(pass.passScanBackUrl) },
            { key: 'rcpt',  label: 'Receipt',           url: resolveFileUrl(pass.receiptScanUrl) },
          ].filter((d) => d.url);

          const docRecords = (pass.documents ?? []).map((d) => ({
            key: d.id,
            label: d.type.replace(/_/g, ' '),
            url: resolveFileUrl(d.fileUrl),
            mimeType: d.mimeType,
            fileName: d.fileName,
          }));

          const all = [...directDocs, ...docRecords];

          if (all.length === 0) {
            return <div className="text-text-secondary text-sm">No documents uploaded.</div>;
          }

          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {all.map((d) => (
                <a
                  key={d.key}
                  href={d.url!}
                  target="_blank"
                  rel="noreferrer"
                  className="block border border-border rounded-lg overflow-hidden hover:border-accent-primary transition-colors group"
                >
                  {d.url!.endsWith('.pdf') || (d as any).mimeType === 'application/pdf' ? (
                    <div className="aspect-square bg-bg-input grid place-items-center group-hover:bg-bg-card transition-colors">
                      <FileText size={28} className="text-brand-mid" />
                    </div>
                  ) : (
                    <img src={d.url!} alt={d.label} className="aspect-square object-cover w-full" />
                  )}
                  <div className="p-2 text-xs bg-bg-input">
                    <div className="font-semibold truncate capitalize">{d.label}</div>
                  </div>
                </a>
              ))}
            </div>
          );
        })()}
      </Card>

      <Card title="Custody Timeline" icon={Calendar}>
        <CustodyTimeline current={pass.custodyStatus} events={pass.custodyHistory ?? []} />
      </Card>

      {pass.status === 'CANCELLED' && (
        <RetentionCard
          passId={pass.id}
          passNumber={pass.passNumber}
          dataDeletionScheduledAt={pass.dataDeletionScheduledAt ?? null}
          onChange={invalidate}
        />
      )}

      <HandoverModal
        open={handoverOpen}
        onClose={() => setHandoverOpen(false)}
        onSubmit={(payload) => surrenderMutation.mutate(payload)}
        submitting={surrenderMutation.isPending}
      />

      <CancelModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        passId={pass.id}
        passNumber={pass.passNumber}
        onSuccess={() => {
          invalidate();
          qc.invalidateQueries({ queryKey: ['cancellations-queue'] });
        }}
      />
    </div>
  );
}

function HandoverStep({
  step, title, description, done, locked, lockedHint, children,
}: {
  step: number; title: string; description: string;
  done?: boolean; locked?: boolean; lockedHint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={clsx(
      'flex gap-4 p-4 rounded-xl border transition-colors',
      done ? 'border-emerald-400/30 bg-emerald-400/5'
        : locked ? 'border-border opacity-50'
        : 'border-border',
    )}>
      {/* Step circle */}
      <div className={clsx(
        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold',
        done ? 'bg-emerald-400 text-white'
          : locked ? 'bg-bg-input text-text-secondary'
          : 'bg-brand-orange/20 text-brand-orange border border-brand-orange/30',
      )}>
        {done ? <CheckCircle2 size={16} /> : locked ? <Lock size={14} /> : step}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-text-secondary mt-0.5">{locked ? lockedHint : description}</div>
        {!locked && children && <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3 font-semibold">
        {Icon && <Icon size={16} />}
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="col-span-2">{value ?? '—'}</dd>
    </div>
  );
}

function Banner({
  tone,
  icon: Icon,
  title,
  description,
  action,
}: {
  tone: 'warning' | 'danger';
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const palette =
    tone === 'danger'
      ? 'border-status-expired/50 bg-status-expired/10 text-status-expired'
      : 'border-status-expiring/50 bg-status-expiring/10 text-status-expiring';
  return (
    <div className={clsx('rounded-xl border p-4 flex items-start gap-3', palette)}>
      <Icon size={20} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-text-primary/80 mt-0.5">{description}</div>
        {action && <div className="flex flex-wrap gap-2 mt-3">{action}</div>}
      </div>
    </div>
  );
}


function CustodyTimeline({ current, events }: { current: CustodyStatus; events: GatePass['custodyHistory'] }) {
  const currentIdx = CUSTODY_FLOW.indexOf(current);
  return (
    <ol className="flex items-stretch gap-2">
      {CUSTODY_FLOW.map((s, i) => {
        const event = events?.find((e) => e.toStatus === s);
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'future';
        return (
          <li key={s} className="flex-1">
            <div
              className={clsx(
                'rounded-lg p-3 border text-xs',
                state === 'current' && 'border-accent-primary bg-accent-primary/10',
                state === 'done' && 'border-status-valid/50 bg-status-valid/10',
                state === 'future' && 'border-border bg-bg-input/40 text-text-secondary',
              )}
            >
              <div className="font-medium" style={{ color: state === 'future' ? undefined : CUSTODY_COLORS[s].bg }}>
                {CUSTODY_COLORS[s].label}
              </div>
              {event ? (
                <div className="mt-1 text-text-secondary">
                  <div>{new Date(event.createdAt).toLocaleDateString()}</div>
                  {event.changedBy && <div className="truncate">by {event.changedBy.name}</div>}
                </div>
              ) : (
                <div className="mt-1 text-text-secondary">—</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function HandoverModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: { handoverDate: string; officerName: string; referenceNumber: string }) => void;
  submitting?: boolean;
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    handoverDate: string;
    officerName: string;
    referenceNumber: string;
  }>();
  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Record Authority Handover"
      footer={
        <>
          <button onClick={() => { reset(); onClose(); }} className="px-3 py-1.5 rounded-lg border border-border text-sm">
            Cancel
          </button>
          <button
            onClick={handleSubmit((v) => onSubmit(v))}
            disabled={submitting}
            className="px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm disabled:opacity-50"
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-text-secondary">
          The pass moves to <span className="text-status-valid">SURRENDERED_TO_AUTHORITY</span>. All three fields are required.
        </p>
        <div>
          <label className="block text-text-secondary mb-1">Handover date</label>
          <input
            type="date"
            {...register('handoverDate', { required: true })}
            className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5"
          />
          {errors.handoverDate && <p className="text-xs text-status-expired mt-1">Required</p>}
        </div>
        <div>
          <label className="block text-text-secondary mb-1">Officer name</label>
          <input
            {...register('officerName', { required: true, minLength: 2 })}
            className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5"
          />
          {errors.officerName && <p className="text-xs text-status-expired mt-1">Required</p>}
        </div>
        <div>
          <label className="block text-text-secondary mb-1">Reference number</label>
          <input
            {...register('referenceNumber', { required: true })}
            className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5"
          />
          {errors.referenceNumber && <p className="text-xs text-status-expired mt-1">Required</p>}
        </div>
      </div>
    </Modal>
  );
}

function RetentionCard({
  passId,
  passNumber,
  dataDeletionScheduledAt,
  onChange,
}: {
  passId: string;
  passNumber: string;
  dataDeletionScheduledAt: string | null;
  onChange: () => void;
}) {
  const [extensionDays, setExtensionDays] = useState(30);

  const extend = useMutation({
    mutationFn: async () =>
      (await api.post(`/gate-passes/${passId}/retention/extend`, { days: extensionDays })).data,
    onSuccess: () => {
      onChange();
      toast.success(`Retention extended by ${extensionDays} days`);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Extension failed'),
  });

  const permanent = useMutation({
    mutationFn: async () => (await api.post(`/gate-passes/${passId}/retention/permanent`)).data,
    onSuccess: () => {
      onChange();
      toast.success('Marked as permanently retained');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const purge = useMutation({
    mutationFn: async () => (await api.post(`/gate-passes/${passId}/retention/purge`)).data,
    onSuccess: () => {
      onChange();
      toast.success(`Pass ${passNumber} purged`);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Purge failed'),
  });

  const scheduledLabel = dataDeletionScheduledAt
    ? new Date(dataDeletionScheduledAt).toISOString().slice(0, 10)
    : 'Permanent (no scheduled deletion)';

  const daysUntil = dataDeletionScheduledAt
    ? Math.ceil(
        (new Date(dataDeletionScheduledAt).getTime() - Date.now()) / (24 * 3600 * 1000),
      )
    : null;

  const inWarningWindow = daysUntil !== null && daysUntil >= 0 && daysUntil <= 7;

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold flex items-center gap-2">
          <AlertTriangle size={16} className={inWarningWindow ? 'text-status-expired' : ''} />
          Data Retention
        </div>
        <div className="text-sm">
          <span className="text-text-secondary">Scheduled deletion:</span>{' '}
          <span className={inWarningWindow ? 'text-status-expired font-semibold' : 'font-mono'}>
            {scheduledLabel}
          </span>
          {daysUntil !== null && (
            <span className="ml-2 text-text-secondary">
              ({daysUntil >= 0 ? `${daysUntil}d remaining` : `${Math.abs(daysUntil)}d overdue`})
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="border border-border rounded-lg p-3">
          <div className="text-text-secondary text-xs uppercase tracking-wide mb-2">Extend retention</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={3650}
              value={extensionDays}
              onChange={(e) => setExtensionDays(parseInt(e.target.value, 10) || 1)}
              className="w-24 bg-bg-input border border-border rounded-lg px-2 py-1.5"
            />
            <span className="text-text-secondary text-xs">days</span>
            <button
              onClick={() => extend.mutate()}
              disabled={extend.isPending}
              className="ml-auto px-3 py-1.5 rounded-lg bg-accent-primary text-white text-xs disabled:opacity-50"
            >
              Extend
            </button>
          </div>
        </div>

        <div className="border border-border rounded-lg p-3">
          <div className="text-text-secondary text-xs uppercase tracking-wide mb-2">Make permanent</div>
          <div className="text-xs text-text-secondary mb-2">Disables automatic deletion entirely.</div>
          <button
            onClick={() => permanent.mutate()}
            disabled={permanent.isPending || !dataDeletionScheduledAt}
            className="w-full px-3 py-1.5 rounded-lg border border-border text-xs disabled:opacity-50"
          >
            Mark permanent
          </button>
        </div>

        <div className="border border-status-expired/40 rounded-lg p-3">
          <div className="text-status-expired text-xs uppercase tracking-wide mb-2">Delete immediately</div>
          <div className="text-xs text-text-secondary mb-2">Removes all PII and supporting files now.</div>
          <button
            onClick={() => {
              if (confirm(`Permanently purge ${passNumber}? This cannot be undone.`)) {
                purge.mutate();
              }
            }}
            disabled={purge.isPending}
            className="w-full px-3 py-1.5 rounded-lg bg-status-expired text-white text-xs disabled:opacity-50"
          >
            Purge now
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelModal({
  open, onClose, passId, passNumber, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  passId: string;
  passNumber: string;
  onSuccess: () => void;
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ reason: string }>();
  const cancel = useMutation({
    mutationFn: async (v: { reason: string }) =>
      api.post(`/gate-passes/${passId}/cancellation`, v),
    onSuccess: () => {
      toast.success('Cancellation requested');
      reset();
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Cancellation failed'),
  });
  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={`Cancel pass ${passNumber}`}
      footer={
        <>
          <button onClick={() => { reset(); onClose(); }} className="px-3 py-1.5 rounded-lg border border-border text-sm">
            Keep pass
          </button>
          <button
            onClick={handleSubmit((v) => cancel.mutate(v))}
            className="px-3 py-1.5 rounded-lg bg-status-expired text-white text-sm"
          >
            Request cancellation
          </button>
        </>
      }
    >
      <div className="space-y-2 text-sm">
        <p className="text-text-secondary">
          The pass will move to <span className="text-status-expiring">CANCELLATION_REQUESTED</span> and must be surrendered to authority before final cancellation.
        </p>
        <label className="block text-text-secondary">Reason</label>
        <textarea
          {...register('reason', { required: true, minLength: 3 })}
          rows={3}
          placeholder="Why is this pass being cancelled?"
          className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 outline-none focus:border-accent-primary"
        />
        {errors.reason && <p className="text-xs text-status-expired">A reason of at least 3 characters is required.</p>}
      </div>
    </Modal>
  );
}
