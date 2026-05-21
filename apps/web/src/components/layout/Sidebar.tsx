import {
  Activity,
  BadgeCheck,
  Ban,
  Bell,
  Building2,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Construction,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  LucideIcon,
  Mail,
  RotateCcw,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Upload,
  Users,
  UserSquare,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { authStore, useAuth } from '@/store/auth';

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  end?: boolean;
}

const PASSES_CHILDREN: Item[] = [
  { to: '/passes',        label: 'All Passes',    icon: BadgeCheck, iconColor: 'text-sky-400',     iconBg: 'bg-sky-400/15',     end: true },
  { to: '/renewals',      label: 'Renewals',      icon: RotateCcw,  iconColor: 'text-emerald-400', iconBg: 'bg-emerald-400/15' },
  { to: '/cancellations', label: 'Cancellations', icon: Ban,        iconColor: 'text-rose-400',    iconBg: 'bg-rose-400/15'    },
  { to: '/passes/import', label: 'Bulk Import',   icon: Upload,     iconColor: 'text-violet-400',  iconBg: 'bg-violet-400/15'  },
];

const PASSES_GROUP_PATHS = ['/passes', '/renewals', '/cancellations', '/passes/import'];

const MAIN_BEFORE_PASSES: Item[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, iconColor: 'text-brand-orange', iconBg: 'bg-brand-orange/15' },
];

const MAIN_AFTER_PASSES: Item[] = [
  { to: '/staff',              label: 'People',          icon: UserSquare,  iconColor: 'text-purple-400', iconBg: 'bg-purple-400/15' },
  { to: '/reports',            label: 'Reports',         icon: FileText,    iconColor: 'text-brand-mid',  iconBg: 'bg-brand-mid/15'  },
  { to: '/notifications',      label: 'Notifications',   icon: Bell,        iconColor: 'text-amber-400',  iconBg: 'bg-amber-400/15'  },
  { to: '/vehicles',           label: 'Vehicles',        icon: Car,         iconColor: 'text-cyan-500',   iconBg: 'bg-cyan-500/15'   },
  { to: '/machinery',          label: 'Heavy Machinery', icon: Construction, iconColor: 'text-yellow-500', iconBg: 'bg-yellow-500/15' },
  { to: '/company-documents',  label: 'Company Docs',    icon: FolderOpen,  iconColor: 'text-teal-300',   iconBg: 'bg-teal-300/15'   },
];

const SYSTEM: Item[] = [
  { to: '/system/settings',               label: 'Settings',         icon: Settings,   iconColor: 'text-slate-400',   iconBg: 'bg-slate-400/15'   },
  { to: '/system/roles',                  label: 'Roles & Access',   icon: Shield,     iconColor: 'text-indigo-400',  iconBg: 'bg-indigo-400/15'  },
  { to: '/system/users',                  label: 'Users',            icon: Users,      iconColor: 'text-cyan-400',    iconBg: 'bg-cyan-400/15'    },
  { to: '/system/subcontractors',         label: 'Subcontractors',   icon: Building2,  iconColor: 'text-orange-400',  iconBg: 'bg-orange-400/15'  },
  { to: '/system/notification-templates', label: 'Notif. Templates', icon: Mail,       iconColor: 'text-pink-400',    iconBg: 'bg-pink-400/15'    },
  { to: '/system/alarm-thresholds',       label: 'Alarm Thresholds', icon: Bell,       iconColor: 'text-amber-400',   iconBg: 'bg-amber-400/15'   },
  { to: '/system/audit',                  label: 'Audit Log',        icon: ScrollText, iconColor: 'text-teal-400',    iconBg: 'bg-teal-400/15'    },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const [systemOpen, setSystemOpen] = useState(true);
  const location = useLocation();
  const isPassesActive = PASSES_GROUP_PATHS.some((p) =>
    p === '/passes' ? location.pathname === '/passes' || location.pathname.startsWith('/passes/') : location.pathname.startsWith(p),
  );
  const [passesOpen, setPassesOpen] = useState(isPassesActive);
  const user    = useAuth((s) => s.user);
  const nav     = useNavigate();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const handleLogout = () => {
    authStore.getState().logout();
    nav('/login');
  };

  return (
    <aside
      className={clsx(
        'flex flex-col transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
    >
      {/* Logo — TODO: replace with DocPilot logo asset */}
      <div className="flex items-center justify-between h-14 px-3">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-orange flex items-center justify-center font-bold text-white text-sm shadow">
              D
            </div>
            <span className="font-bold tracking-tight" style={{ color: 'var(--sidebar-text)' }}>
              DocPilot
            </span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg transition-colors ml-auto"
          style={{ color: 'var(--sidebar-faint)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--sidebar-text)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--sidebar-faint)')}
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {MAIN_BEFORE_PASSES.map((it) => (
          <SideLink key={it.to} item={it} collapsed={collapsed} />
        ))}

        {/* Passes group */}
        <PassesGroup
          collapsed={collapsed}
          open={passesOpen}
          isActive={isPassesActive}
          onToggle={() => setPassesOpen((v) => !v)}
        />

        {MAIN_AFTER_PASSES.map((it) => (
          <SideLink key={it.to} item={it} collapsed={collapsed} />
        ))}

        {/* System group */}
        <div className="mt-4">
          {!collapsed && (
            <button
              onClick={() => setSystemOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--sidebar-faint)' }}
            >
              <span className="flex items-center gap-2">
                <Activity size={12} />
                System
              </span>
              <ChevronDown size={12} className={clsx('transition-transform', !systemOpen && '-rotate-90')} />
            </button>
          )}
          {(collapsed || systemOpen) &&
            SYSTEM.map((it) => <SideLink key={it.to} item={it} collapsed={collapsed} />)}
        </div>
      </nav>

      {/* Super Admin — only shown for SUPER_ADMIN role */}
      {isSuperAdmin && (
        <div className="px-2 pb-1">
          <NavLink
            to="/super-admin"
            className="relative flex items-center gap-3 px-2 py-1.5 rounded-xl text-sm transition-all duration-150 group"
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute inset-0 rounded-xl" style={{
                    background: 'linear-gradient(90deg, rgba(244,115,22,0.22) 0%, rgba(244,115,22,0.06) 100%)',
                    borderLeft: '3px solid #F47316',
                  }} />
                )}
                <span className={clsx(
                  'relative flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0',
                  isActive ? 'bg-brand-orange/15' : 'group-hover:bg-brand-orange/15',
                )}>
                  <ShieldCheck size={16} className="text-brand-orange" />
                </span>
                {!collapsed && (
                  <span className="relative truncate font-semibold text-brand-orange text-xs uppercase tracking-label">
                    Master Control
                  </span>
                )}
              </>
            )}
          </NavLink>
        </div>
      )}

      {/* User card pinned to bottom */}
      <div
        className={clsx('p-2', collapsed ? 'flex justify-center' : '')}
        style={{ borderTop: '1px solid var(--sidebar-border)' }}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-full bg-brand-orange flex items-center justify-center text-white text-xs font-bold">
              {user?.name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <button
              onClick={handleLogout}
              title="Log out"
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--sidebar-faint)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#FC5185')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--sidebar-faint)')}
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div
            className="flex items-center gap-3 px-2 py-2 rounded-xl transition-colors group cursor-default"
            style={{ ['--sidebar-hover-bg' as string]: 'var(--sidebar-hover)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div className="w-9 h-9 rounded-full bg-brand-orange flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow">
              {user?.name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--sidebar-text)' }}>
                {user?.name ?? 'User'}
              </div>
              <div className="text-[11px] truncate capitalize" style={{ color: 'var(--sidebar-faint)' }}>
                {user?.role?.toLowerCase().replace('_', ' ') ?? ''}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Log out"
              className="p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
              style={{ color: 'var(--sidebar-faint)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#FC5185')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--sidebar-faint)')}
            >
              <LogOut size={15} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function PassesGroup({
  collapsed,
  open,
  isActive,
  onToggle,
}: {
  collapsed: boolean;
  open: boolean;
  isActive: boolean;
  onToggle: () => void;
}) {
  // In collapsed mode, render children inline (mirrors how SYSTEM behaves)
  if (collapsed) {
    return (
      <>
        {PASSES_CHILDREN.map((it) => (
          <SideLink key={it.to} item={it} collapsed={collapsed} />
        ))}
      </>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="relative w-full flex items-center gap-3 px-2 py-1.5 rounded-xl text-sm transition-all duration-150 group"
        aria-expanded={open}
      >
        {isActive && (
          <span
            className="absolute inset-0 rounded-xl"
            style={{
              background: 'linear-gradient(90deg, rgba(244,115,22,0.22) 0%, rgba(244,115,22,0.06) 100%)',
              borderLeft: '3px solid #F47316',
            }}
          />
        )}
        <span
          className={clsx(
            'relative flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 transition-colors',
            isActive ? 'bg-sky-400/15' : 'group-hover:bg-sky-400/15',
          )}
        >
          <BadgeCheck size={16} className="text-sky-400" />
        </span>
        <span
          className="relative truncate font-medium transition-colors flex-1 text-left"
          style={{ color: isActive ? 'var(--sidebar-text)' : 'var(--sidebar-muted)' }}
        >
          Passes
        </span>
        <ChevronDown
          size={14}
          className={clsx('relative transition-transform', !open && '-rotate-90')}
          style={{ color: 'var(--sidebar-faint)' }}
        />
      </button>
      {open && (
        <div className="ml-3 pl-2 mt-0.5 space-y-0.5 border-l" style={{ borderColor: 'var(--sidebar-border)' }}>
          {PASSES_CHILDREN.map((it) => (
            <SideLink key={it.to} item={it} collapsed={collapsed} />
          ))}
        </div>
      )}
    </div>
  );
}

function SideLink({ item, collapsed }: { item: Item; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end ?? item.to === '/passes'}
      title={collapsed ? item.label : undefined}
      className="relative flex items-center gap-3 px-2 py-1.5 rounded-xl text-sm transition-all duration-150 group"
    >
      {({ isActive }) => (
        <>
          {/* Active: orange gradient + left border */}
          {isActive ? (
            <span
              className="absolute inset-0 rounded-xl"
              style={{
                background: 'linear-gradient(90deg, rgba(244,115,22,0.22) 0%, rgba(244,115,22,0.06) 100%)',
                borderLeft: '3px solid #F47316',
              }}
            />
          ) : null}

          {/* Icon bubble */}
          <span
            className={clsx(
              'relative flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 transition-colors',
              isActive ? item.iconBg : 'group-hover:' + item.iconBg,
            )}
          >
            <Icon size={16} className={item.iconColor} />
          </span>

          {/* Label */}
          {!collapsed && (
            <span
              className="relative truncate font-medium transition-colors flex-1"
              style={{ color: isActive ? 'var(--sidebar-text)' : 'var(--sidebar-muted)' }}
            >
              {item.label}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
