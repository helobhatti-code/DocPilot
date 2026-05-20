/**
 * ImpersonateStart — loaded in the new tab opened by "View Portal".
 *
 * Reads the one-time handoff key from localStorage, sets up the
 * impersonation session, clears the key, then redirects to /dashboard.
 * If no pending handoff is found (e.g. direct navigation) it redirects
 * to /login.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authStore } from '@/store/auth';
import { AuthUser } from '@/lib/types';

const HANDOFF_KEY = 'gpms_impersonate_handoff';

interface HandoffPayload {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  impersonatedTenant: string;
  expiresAt: number; // ms timestamp — handoff expires after 30s
}

export default function ImpersonateStart() {
  const nav = useNavigate();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HANDOFF_KEY);
      if (!raw) { nav('/login', { replace: true }); return; }

      const payload: HandoffPayload = JSON.parse(raw);
      localStorage.removeItem(HANDOFF_KEY); // consume immediately

      if (Date.now() > payload.expiresAt) {
        // Handoff expired (> 30s since button click)
        nav('/login', { replace: true });
        return;
      }

      // Start impersonation in this tab — no "original session" needed
      // because this tab is dedicated to the tenant view.
      authStore.getState().startImpersonation(
        {
          accessToken:        payload.accessToken,
          refreshToken:       payload.refreshToken,
          user:               payload.user,
          impersonatedTenant: payload.impersonatedTenant,
        },
        // Use the same session as "original" so the Exit button closes the tab
        {
          accessToken:  payload.accessToken,
          refreshToken: payload.refreshToken,
          user:         payload.user,
        },
      );

      nav('/dashboard', { replace: true });
    } catch {
      nav('/login', { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-text-secondary text-sm">Opening tenant portal…</div>
    </div>
  );
}
