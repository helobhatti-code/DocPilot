import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
}

export function Pagination({ page, pageSize, total, onPage, onPageSize }: Props) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between text-sm text-text-secondary mt-3">
      <div>
        {total === 0 ? '0' : `${start}–${end}`} of {total}
      </div>
      <div className="flex items-center gap-3">
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="bg-bg-input border border-border rounded-lg px-2 py-1"
        >
          {[10, 25, 50, 100].map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>
        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="p-1.5 rounded border border-border disabled:opacity-40 hover:bg-bg-input"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="px-2">{page} / {lastPage}</span>
          <button
            disabled={page >= lastPage}
            onClick={() => onPage(page + 1)}
            className="p-1.5 rounded border border-border disabled:opacity-40 hover:bg-bg-input"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
