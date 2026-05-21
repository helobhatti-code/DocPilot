import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';

const OverviewTab    = lazy(() => import('./dashboard/OverviewTab'));
const PassesTab      = lazy(() => import('./dashboard/PassesTab'));
const VehiclesTab    = lazy(() => import('./dashboard/VehiclesTab'));
const EmployeesTab   = lazy(() => import('./dashboard/EmployeesTab'));
const MachineryTab   = lazy(() => import('./dashboard/MachineryTab'));
const CompanyDocsTab = lazy(() => import('./dashboard/CompanyDocsTab'));
const ExpiryTab      = lazy(() => import('./expiry-dashboard'));

type TabKey = 'overview' | 'passes' | 'vehicles' | 'employees' | 'machinery' | 'company_docs' | 'expiry';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview',      label: 'Overview'      },
  { key: 'passes',        label: 'Passes'        },
  { key: 'vehicles',      label: 'Vehicles'      },
  { key: 'employees',     label: 'Employees'     },
  { key: 'machinery',     label: 'Machinery'     },
  { key: 'company_docs',  label: 'Company Docs'  },
  { key: 'expiry',        label: 'Expiry'        },
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
          Operational overview — gate passes, compliance and authority handover.
        </p>
      </div>

      <div className="border-b border-border flex items-center gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              tab === t.key
                ? 'border-brand-orange text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {t.label}
          </button>
        ))}
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
