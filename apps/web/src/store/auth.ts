import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { AuthUser, ThemePreference } from '@/lib/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  // Impersonation — stores the SUPER_ADMIN's original session
  originalSession: { accessToken: string; refreshToken: string; user: AuthUser } | null;
  impersonatedTenant: string | null;
  setSession: (payload: { accessToken: string; refreshToken: string; user: AuthUser }) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: AuthUser) => void;
  setTheme: (theme: ThemePreference) => void;
  startImpersonation: (
    payload: { accessToken: string; refreshToken: string; user: AuthUser; impersonatedTenant: string },
    original: { accessToken: string; refreshToken: string; user: AuthUser },
  ) => void;
  exitImpersonation: () => void;
  logout: () => void;
}

const STORAGE_KEY      = 'gpms_auth';
const IMPERSONATE_KEY  = 'gpms_impersonate';

interface PersistedAuth {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  originalSession?: { accessToken: string; refreshToken: string; user: AuthUser } | null;
  impersonatedTenant?: string | null;
}

function load(): PersistedAuth {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw
      ? (JSON.parse(raw) as PersistedAuth)
      : { accessToken: null, refreshToken: null, user: null };
  } catch {
    return { accessToken: null, refreshToken: null, user: null };
  }
}
function persist(state: PersistedAuth): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const authStore = createStore<AuthState>((set, get) => {
  const initial = load();
  return {
    accessToken:         initial.accessToken,
    refreshToken:        initial.refreshToken,
    user:                initial.user,
    originalSession:     initial.originalSession ?? null,
    impersonatedTenant:  initial.impersonatedTenant ?? null,

    setSession: ({ accessToken, refreshToken, user }) => {
      set({ accessToken, refreshToken, user, originalSession: null, impersonatedTenant: null });
      persist({ accessToken, refreshToken, user });
      localStorage.setItem('gpms_theme', user.themePreference);
      applyTheme(user.themePreference);
    },

    setTokens: (accessToken, refreshToken) => {
      set({ accessToken, refreshToken });
      const s = get();
      persist({
        accessToken, refreshToken, user: s.user,
        originalSession: s.originalSession,
        impersonatedTenant: s.impersonatedTenant,
      });
    },

    setUser: (user) => {
      set({ user });
      const s = get();
      persist({
        accessToken: s.accessToken, refreshToken: s.refreshToken, user,
        originalSession: s.originalSession, impersonatedTenant: s.impersonatedTenant,
      });
    },

    setTheme: (theme) => {
      const u = get().user;
      if (u) {
        const next = { ...u, themePreference: theme };
        set({ user: next });
        const s = get();
        persist({
          accessToken: s.accessToken, refreshToken: s.refreshToken, user: next,
          originalSession: s.originalSession, impersonatedTenant: s.impersonatedTenant,
        });
      }
      localStorage.setItem('gpms_theme', theme);
      applyTheme(theme);
    },

    // Start impersonating — saves original session, switches to tenant session
    startImpersonation: ({ accessToken, refreshToken, user, impersonatedTenant }, original) => {
      set({ accessToken, refreshToken, user, originalSession: original, impersonatedTenant });
      persist({ accessToken, refreshToken, user, originalSession: original, impersonatedTenant });
      applyTheme(user.themePreference ?? 'DARK');
    },

    // Exit impersonation — restore original SUPER_ADMIN session
    exitImpersonation: () => {
      const orig = get().originalSession;
      if (!orig) return;
      set({
        accessToken: orig.accessToken,
        refreshToken: orig.refreshToken,
        user: orig.user,
        originalSession: null,
        impersonatedTenant: null,
      });
      persist({ accessToken: orig.accessToken, refreshToken: orig.refreshToken, user: orig.user });
      applyTheme(orig.user.themePreference);
    },

    logout: () => {
      set({ accessToken: null, refreshToken: null, user: null, originalSession: null, impersonatedTenant: null });
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(IMPERSONATE_KEY);
    },
  };
});

export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === 'DARK') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function useAuth<T>(selector: (s: AuthState) => T): T {
  return useStore(authStore, selector);
}
