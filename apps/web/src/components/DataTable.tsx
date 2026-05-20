import clsx from 'clsx';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  width?: string;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string, checked: boolean) => void;
  onSelectAll?: (checked: boolean) => void;
  onRowClick?: (row: T) => void;
  loading?: boolean;
}

export function DataTable<T>({
  columns, rows, rowKey, selectable, selectedIds, onSelect, onSelectAll, onRowClick, loading,
}: Props<T>) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds?.has(rowKey(r)));
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg-input text-text-secondary">
            <tr>
              {selectable && (
                <th className="w-10 px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onSelectAll?.(e.target.checked)}
                    className="accent-accent-primary"
                  />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={clsx('px-3 py-3 text-left font-medium', c.className)} style={{ width: c.width }}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-10 text-center text-text-secondary">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-10 text-center text-text-secondary">No results</td></tr>
            )}
            {rows.map((row) => {
              const id = rowKey(row);
              const selected = selectedIds?.has(id);
              return (
                <tr
                  key={id}
                  onClick={() => onRowClick?.(row)}
                  className={clsx(
                    'border-t border-border hover:bg-bg-input/40 cursor-pointer transition-colors',
                    selected && 'bg-accent-primary/5',
                  )}
                >
                  {selectable && (
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!selected}
                        onChange={(e) => onSelect?.(id, e.target.checked)}
                        className="accent-accent-primary"
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={clsx('px-3 py-3', c.className)}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
