import clsx from 'clsx';
import { CheckCircle2, FileText, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/jpg', 'application/pdf'];

interface Props {
  documentType: string;
  gatePassId?: string;
  label: string;
  onUploaded: (result: UploadResult) => void;
  initialUrl?: string | null;
}

export interface UploadResult {
  id: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  compressionRatio: number;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export function FileUpload({ documentType, gatePassId, label, onUploaded, initialUrl }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  const validate = (file: File): string | null => {
    if (file.size > MAX_BYTES) return 'File exceeds 2MB';
    if (!ALLOWED.includes(file.type.toLowerCase())) return 'JPEG or PDF only';
    return null;
  };

  const upload = async (file: File) => {
    const err = validate(file);
    if (err) { setError(err); toast.error(err); return; }
    setError(null);
    setUploading(true);
    setProgress(0);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', documentType);
      if (gatePassId) form.append('gatePassId', gatePassId);

      const res = await api.post('/uploads', form, {
        onUploadProgress: (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
        },
      });
      const data = res.data as UploadResult;
      setResult(data);
      setPreviewUrl(data.fileUrl);
      onUploaded(data);
      toast.success('Uploaded');
    } catch (e: any) {
      const msg = e.response?.data?.message ?? 'Upload failed';
      setError(typeof msg === 'string' ? msg : 'Upload failed');
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const isPdf = result?.mimeType === 'application/pdf' || previewUrl?.toLowerCase().endsWith('.pdf');

  return (
    <div>
      <label className="block text-sm text-text-secondary mb-1">{label}</label>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) upload(f);
        }}
        className={clsx(
          'border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors',
          dragOver ? 'border-accent-primary bg-accent-primary/5' : 'border-border hover:border-accent-primary',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.pdf,image/jpeg,application/pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />

        {previewUrl && !uploading && (
          <div className="flex items-center gap-3">
            {isPdf ? (
              <div className="w-16 h-16 rounded grid place-items-center bg-bg-input"><FileText size={20} /></div>
            ) : (
              <img src={previewUrl} alt="" className="w-16 h-16 object-cover rounded" />
            )}
            <div className="text-sm">
              <div className="flex items-center gap-1"><CheckCircle2 size={14} className="text-status-valid" /> Uploaded</div>
              {result && (
                <div className="text-xs text-text-secondary mt-0.5">
                  {formatBytes(result.originalSizeBytes)} → {formatBytes(result.compressedSizeBytes)} ({Math.round(result.compressionRatio * 100)}%)
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPreviewUrl(null); setResult(null); }}
              className="ml-auto p-1 rounded hover:bg-bg-input"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {!previewUrl && !uploading && (
          <div className="flex flex-col items-center justify-center text-center text-text-secondary py-4">
            <Upload size={20} />
            <div className="text-sm mt-2">Click or drag a file here</div>
            <div className="text-xs">JPEG / PDF · max 2MB</div>
          </div>
        )}

        {uploading && (
          <div className="space-y-2">
            <div className="text-sm">Uploading… {progress}%</div>
            <div className="h-2 rounded bg-bg-input overflow-hidden">
              <div className="h-full bg-accent-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-status-expired mt-1">{error}</p>}
    </div>
  );
}
