import { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="text-center py-16 px-4">
      <div className="inline-grid place-items-center w-16 h-16 rounded-full bg-bg-input text-text-secondary mb-4">
        <Icon size={28} />
      </div>
      <h3 className="font-semibold text-lg">{title}</h3>
      {description && <p className="text-text-secondary mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
