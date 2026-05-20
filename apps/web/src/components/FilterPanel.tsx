import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function FilterPanel({ open, onClose, title = 'Filters', children, footer }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="w-96 max-w-full bg-bg-card border-l border-border flex flex-col">
        <header className="h-12 px-4 flex items-center justify-between border-b border-border">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-input"><X size={16} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">{children}</div>
        {footer && <div className="border-t border-border p-3 flex gap-2 justify-end">{footer}</div>}
      </aside>
    </div>
  );
}
