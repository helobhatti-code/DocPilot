import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';

type ZoneCode = string;

interface ParsedRow {
  rowNumber: number;
  serialNumber?: string;
  companyName?: string;
  staffName?: string;
  passNumber?: string;
  organization?: string;
  department?: string;
  airport?: string;
  zoneCodes: ZoneCode[];
  issueDate?: string;
  expiryDate?: string;
  passStatus?: string;
  passIsWith?: string;
  errors: string[];
  ok: boolean;
}

interface PreviewResp {
  headers: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: ParsedRow[];
}

interface CommitResp {
  imported: number;
  skipped: number;
  failures: { rowNumber: number; reason: string }[];
}

export default function BulkImportPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitResp | null>(null);

  const previewMutation = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append('file', f);
      return (await api.post('/gate-passes/import/preview', fd)).data as PreviewResp;
    },
    onSuccess: (r) => {
      setPreview(r);
      if (r.invalidRows > 0) {
        toast.error(`${r.invalidRows} rows have errors — fix in Excel and re-upload, or import the ${r.validRows} valid rows.`);
      } else {
        toast.success(`${r.totalRows} rows ready to import`);
      }
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message ?? 'Failed to parse file');
    },
  });

  const commitMutation = useMutation({
    mutationFn: async (rows: ParsedRow[]) => {
      return (await api.post('/gate-passes/import', { rows })).data as CommitResp;
    },
    onSuccess: (r) => {
      setCommitResult(r);
      if (r.failures.length === 0) {
        toast.success(`Imported ${r.imported} passes`);
      } else {
        toast.error(`Imported ${r.imported}, ${r.failures.length} failed`);
      }
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message ?? 'Import failed');
    },
  });

  const handleFile = useCallback((f: File) => {
    if (!f) return;
    if (!/\.(xlsx|xlsm)$/i.test(f.name)) {
      toast.error('Only .xlsx files are supported'); return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10MB'); return;
    }
    setFile(f);
    setPreview(null);
    setCommitResult(null);
    previewMutation.mutate(f);
  }, [previewMutation]);

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/gate-passes/import/template', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gpms-import-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download template');
    }
  };

  const validRows = useMemo(() => preview?.rows.filter((r) => r.ok) ?? [], [preview]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Bulk Import Gate Passes</h1>
          <p className="text-sm text-text-secondary">Upload an .xlsx file to create many passes at once.</p>
        </div>
        <button
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border text-sm hover:bg-bg-input"
        >
          <Download size={14} /> Download template
        </button>
      </div>

      {/* Drop zone */}
      {!preview && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-accent-primary bg-accent-primary/5' : 'border-border bg-bg-card hover:bg-bg-input/40'
          }`}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <FileSpreadsheet size={42} className="mx-auto text-text-secondary mb-3" />
          <div className="font-medium">Drop .xlsx file here, or click to choose</div>
          <div className="text-sm text-text-secondary mt-1">
            Up to 10MB. Headers must match the template.
          </div>
          {previewMutation.isPending && (
            <div className="mt-4 text-sm text-accent-primary">Parsing & validating…</div>
          )}
        </div>
      )}

      {/* Preview / commit result */}
      {preview && (
        <>
          <SummaryBar
            file={file}
            preview={preview}
            onClear={() => { setPreview(null); setFile(null); setCommitResult(null); }}
          />

          {commitResult ? (
            <CommitResultPanel result={commitResult} onClose={() => navigate('/passes')} />
          ) : (
            <ValidationTable
              preview={preview}
              onCommit={() => commitMutation.mutate(validRows)}
              committing={commitMutation.isPending}
              validCount={validRows.length}
            />
          )}
        </>
      )}
    </div>
  );
}

function SummaryBar({
  file, preview, onClear,
}: {
  file: File | null;
  preview: PreviewResp;
  onClear: () => void;
}) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 flex items-center gap-4 flex-wrap">
      <FileSpreadsheet size={24} className="text-accent-primary" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{file?.name ?? 'Uploaded file'}</div>
        <div className="text-sm text-text-secondary">
          {preview.totalRows} rows · {preview.validRows} valid · {preview.invalidRows} with errors
        </div>
      </div>
      <button
        onClick={onClear}
        className="p-1.5 rounded hover:bg-bg-input text-text-secondary"
        aria-label="Clear"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function ValidationTable({
  preview, onCommit, committing, validCount,
}: {
  preview: PreviewResp;
  onCommit: () => void;
  committing: boolean;
  validCount: number;
}) {
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const rows = showOnlyErrors ? preview.rows.filter((r) => !r.ok) : preview.rows;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showOnlyErrors}
            onChange={(e) => setShowOnlyErrors(e.target.checked)}
            className="accent-accent-primary"
          />
          Show only rows with errors
        </label>
        <button
          onClick={onCommit}
          disabled={validCount === 0 || committing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-primary text-white text-sm disabled:opacity-50"
        >
          <Upload size={14} />
          {committing ? 'Importing…' : `Import ${validCount} valid rows`}
        </button>
      </div>

      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-bg-input text-text-secondary sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 w-10">Row</th>
                <th className="text-left px-3 py-2 w-12">OK</th>
                <th className="text-left px-3 py-2">Pass No.</th>
                <th className="text-left px-3 py-2">Staff</th>
                <th className="text-left px-3 py-2">Company</th>
                <th className="text-left px-3 py-2">Airport</th>
                <th className="text-left px-3 py-2">Issue</th>
                <th className="text-left px-3 py-2">Expiry</th>
                <th className="text-left px-3 py-2">Zones</th>
                <th className="text-left px-3 py-2">Errors</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.rowNumber}
                  className={`border-t border-border ${r.ok
                    ? 'bg-emerald-500/[0.04]'
                    : 'bg-rose-500/[0.06]'}`}
                >
                  <td className="px-3 py-2 text-text-secondary font-mono text-xs">{r.rowNumber}</td>
                  <td className="px-3 py-2">
                    {r.ok ? (
                      <Check size={16} className="text-emerald-500" />
                    ) : (
                      <AlertTriangle size={16} className="text-rose-500" />
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono">{r.passNumber || '—'}</td>
                  <td className="px-3 py-2">{r.staffName || '—'}</td>
                  <td className="px-3 py-2 text-text-secondary">{r.companyName || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.airport || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.issueDate || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.expiryDate || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.zoneCodes.length === 0 ? (
                        <span className="text-text-secondary">—</span>
                      ) : (
                        r.zoneCodes.map((z) => (
                          <span key={z} className="px-1.5 py-0.5 rounded bg-bg-input text-xs font-mono">
                            {z}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.errors.length === 0 ? (
                      <span className="text-emerald-500 text-xs">Ready</span>
                    ) : (
                      <ul className="space-y-0.5 text-rose-400 text-xs list-disc list-inside">
                        {r.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-text-secondary">No rows match the filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CommitResultPanel({ result, onClose }: { result: CommitResp; onClose: () => void }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500/10 grid place-items-center">
          <Check size={20} className="text-emerald-500" />
        </div>
        <div>
          <div className="font-semibold">Import complete</div>
          <div className="text-sm text-text-secondary">
            {result.imported} imported, {result.skipped} skipped, {result.failures.length} failures.
          </div>
        </div>
      </div>

      {result.failures.length > 0 && (
        <div className="bg-rose-500/[0.06] border border-rose-500/30 rounded-lg p-3">
          <div className="font-medium text-rose-300 mb-2 text-sm">Failures</div>
          <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
            {result.failures.map((f) => (
              <li key={f.rowNumber} className="font-mono">
                Row {f.rowNumber}: {f.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-accent-primary text-white text-sm"
        >
          View passes
        </button>
      </div>
    </div>
  );
}
