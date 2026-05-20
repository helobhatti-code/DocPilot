import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, ShieldAlert } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaQuery } from '@/lib/hooks';
import { authStore, useAuth } from '@/store/auth';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export default function AppLayout() {
  const isMobile = useMediaQuery('(max-width: 1024px)');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const impersonatedTenant = useAuth((s) => s.impersonatedTenant);
  const currentUserId = useAuth((s) => s.user?.id);
  const nav = useNavigate();
  const qc = useQueryClient();

  // Clear ALL query caches when the logged-in user changes (e.g. after
  // impersonation ends or a different tenant session is loaded).
  // This prevents one tenant's cached data from appearing for another.
  const prevUserIdRef = useRef<string | undefined>(currentUserId);
  useEffect(() => {
    if (prevUserIdRef.current && prevUserIdRef.current !== currentUserId) {
      qc.clear();
    }
    prevUserIdRef.current = currentUserId;
  }, [currentUserId, qc]);

  const exitImpersonation = () => {
    authStore.getState().logout(); // clear this tab's session entirely
    // Try to close the tab; if blocked by browser, go to login
    window.close();
    setTimeout(() => nav('/login', { replace: true }), 300);
  };

  useEffect(() => {
    if (isMobile) setCollapsed(true);
  }, [isMobile]);

  return (
    <div className="h-screen flex flex-col bg-bg-primary text-text-primary">
      {/* Impersonation banner */}
      {impersonatedTenant && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-brand-orange text-white text-sm font-semibold z-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} />
            You are viewing the portal as <span className="underline">{impersonatedTenant}</span> — changes here affect their real data.
          </div>
          <button
            onClick={exitImpersonation}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-xs font-bold"
          >
            <LogOut size={13} /> Exit & Close Tab
          </button>
        </div>
      )}
    <div className="flex flex-1 overflow-hidden">
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
      <div
        className={
          isMobile
            ? `fixed inset-y-0 left-0 z-40 transform transition-transform ${
                mobileOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : ''
        }
      >
        <Sidebar
          collapsed={!isMobile && collapsed}
          onToggle={() => setCollapsed((v) => !v)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onMenuClick={isMobile ? () => setMobileOpen(true) : undefined} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </div>
  );
}
