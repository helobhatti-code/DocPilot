import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Car,
  Construction,
  FolderOpen,
  LayoutDashboard,
  ShieldAlert,
  UserCircle,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';

const OverviewTab    = lazy(() => import('./dashboard/OverviewTab'));
const PassesTab      = lazy(() => import('./dashboard/PassesTab'));
const VehiclesTab    = lazy(() => import('./dashboard/VehiclesTab'));
const EmployeesTab   = lazy(() => import('./dashboard/EmployeesTab'));
const MachineryTab   = lazy(() => import('./dashboard/MachineryTab'));
const CompanyDocsTab = lazy(() => import('./dashboard/CompanyDocsTab'));
const ExpiryTab      = lazy(() => import('./expiry-dashboard'));

type TabKey = 'overview' | 'passes' | 'vehicles' | 'employees' | 'machinery' | 'company_docs' | 'expiry';

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'overview',     label: 'Overview',     icon: LayoutDashboard },
  { key: 'passes',       label: 'Passes',       icon: BadgeCheck      },
  { key: 'vehicles',     label: 'Vehicles',     icon: Car             },
  { key: 'employees',    label: 'Employees',    icon: UserCircle      },
  { key: 'machinery',    label: 'Machinery',    icon: Construction    },
  { key: 'company_docs', label: 'Company Docs', icon: FolderOpen      },
  { key: 'expiry',       label: 'Expiry',       icon: ShieldAlert     },
];

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  // Default to Overview. If the consumer landed here via /expiry-dashboard
  // (redirected upstream and tagged with state.openExpiry), open Expiry instead.
  const initialTab: TabKey =
    (location.state as { openExpiry?: boolean } | null)?.openExpiry ? 'expiry' : 'overview';

  const [tab, setTab] = useState<TabKey>(initialTab);

  // Clear the navigation state once consumed so reloads don't keep re-opening it.
  useEffect(() => {
    if ((location.state as { openExpiry?: boolean } | null)?.openExpiry) {
      navigate(location.pathname, { replace: true, state: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-heading">DocPilot</h1>
        <p className="text-text-secondary text-sm mt-0.5">
          Manage passes, fleet, employees and company documents.
        </p>
      </div>

      <div className="bg-bg-card border border-border rounded-2xl p-1.5 flex items-center gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'group relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-150',
                isActive
                  ? 'bg-bg-input text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-input',
              )}
            >
              <Icon
                size={15}
                className={clsx(
                  'transition-colors',
                  isActive ? 'text-brand-orange' : 'text-text-secondary group-hover:text-brand-orange',
                )}
              />
              <span>{t.label}</span>
              {/* Active: solid gradient underline. Inactive: same underline appears on hover. */}
              <span
                className={clsx(
                  'absolute left-1/2 -translate-x-1/2 -bottom-0.5 h-[3px] w-[60%] rounded-full transition-opacity duration-150',
                  isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
                style={{
                  background: 'linear-gradient(90deg, #F47316 0%, #FC5185 100%)',
                }}
              />
            </button>
          );
        })}
      </div>

      <Suspense fallback={<div className="text-text-secondary text-sm py-8 text-center">Loading…</div>}>
        {tab === 'overview'     && <OverviewTab />}
        {tab === 'passes'       && <PassesTab />}
        {tab === 'vehicles'     && <VehiclesTab />}
        {tab === 'employees'    && <EmployeesTab />}
        {tab === 'machinery'    && <MachineryTab />}
        {tab === 'company_docs' && <CompanyDocsTab />}
        {tab === 'expiry'       && <ExpiryTab />}
      </Suspense>
    </div>
  );
}
