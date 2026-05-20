import { Moon, Sun } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';

export function ThemeToggle() {
  const theme    = useAuth((s) => s.user?.themePreference ?? 'DARK');
  const setTheme = useAuth((s) => s.setTheme);

  const toggle = async () => {
    const next = theme === 'DARK' ? 'LIGHT' : 'DARK';
    setTheme(next);
    try {
      await api.patch('/users/me/preferences', { themePreference: next });
    } catch {
      // Best-effort; UI already updated.
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'DARK' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 rounded-lg transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-input"
    >
      {theme === 'DARK' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
