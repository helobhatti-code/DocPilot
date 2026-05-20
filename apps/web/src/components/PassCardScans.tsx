import { CreditCard } from 'lucide-react';
import { FileUpload, UploadResult } from './FileUpload';

interface Props {
  /** Existing front URL, if the pass already has one. */
  frontUrl?: string | null;
  /** Existing back URL, if the pass already has one. */
  backUrl?: string | null;
  /** Existing receipt URL, if the pass already has one. Pass `null`/omit to hide the slot. */
  receiptUrl?: string | null;
  /** Called when the front scan finishes uploading. */
  onFrontUploaded: (url: string) => void;
  /** Called when the back scan finishes uploading. */
  onBackUploaded: (url: string) => void;
  /** Called when the receipt finishes uploading. Provide to enable the 3rd slot. */
  onReceiptUploaded?: (url: string) => void;
  /** Optional gate pass id — attaches the upload to the pass server-side for audit. */
  gatePassId?: string;
  /** Optional heading. Omit to render bare (e.g., inline in a form). */
  title?: string;
  /** Optional helper text under the title. */
  subtitle?: string;
}

/**
 * Upload slots for the front + back of a physical pass card, plus an
 * optional Receipt slot. Wraps the standard FileUpload component so it
 * stays consistent with other document uploads (handover, photo).
 */
export function PassCardScans({
  frontUrl,
  backUrl,
  receiptUrl,
  onFrontUploaded,
  onBackUploaded,
  onReceiptUploaded,
  gatePassId,
  title,
  subtitle,
}: Props) {
  const includeReceipt = !!onReceiptUploaded;
  const body = (
    <div className={`grid grid-cols-1 gap-4 ${includeReceipt ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
      <FileUpload
        documentType="PASS_SCAN_FRONT"
        gatePassId={gatePassId}
        label="Front of pass"
        initialUrl={frontUrl ?? undefined}
        onUploaded={(r: UploadResult) => onFrontUploaded(r.fileUrl)}
      />
      <FileUpload
        documentType="PASS_SCAN_BACK"
        gatePassId={gatePassId}
        label="Back of pass"
        initialUrl={backUrl ?? undefined}
        onUploaded={(r: UploadResult) => onBackUploaded(r.fileUrl)}
      />
      {includeReceipt && (
        <FileUpload
          documentType="RECEIPT"
          gatePassId={gatePassId}
          label="Receipt"
          initialUrl={receiptUrl ?? undefined}
          onUploaded={(r: UploadResult) => onReceiptUploaded!(r.fileUrl)}
        />
      )}
    </div>
  );

  if (!title) return body;

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard size={16} className="text-brand-orange" />
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {subtitle && <div className="text-xs text-text-secondary">{subtitle}</div>}
        </div>
      </div>
      {body}
    </div>
  );
}
