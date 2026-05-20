import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  PlusCircle,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { AuthUser } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────

interface Tenant {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  settings: {
    tier?: string;
    staff_limit?: number;
    trial_expires_at?: string | null;
    pass_validity_months?: number;
  };
}

interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  totalStaff: number;
  totalPasses: number;
}

// ── Provision form schema ──────────────────────────────────────────────────

const provisionSchema = z.object({
  tenantName:       z.string().min(2, 'Min 2 characters'),
  tier:             z.string().min(1, 'Select a tier'),
  staffLimit:       z.coerce.number().int().min(1),
  trialDays:        z.coerce.number().int().min(0),
  passValidityMonths: z.coerce.number().int().min(1).max(24),
  adminName:        z.string().min(2, 'Min 2 characters'),
  adminEmail:       z.string().email('Valid email required'),
  adminPassword:    z.string().min(8, 'Min 8 characters'),
});
type ProvisionForm = z.infer<typeof provisionSchema>;

const TIERS = ['STANDARD', 'PROFESSIONAL', 'ENTERPRISE'];

// ── Component ─────────────────────────────────────────────────────────────

export default function MasterControlPanel() {
  const qc = useQueryClient();
  const [tab, setTab]         = useState<'companies' | 'settings'>('companies');
  const [search, setSearch]   = useState('');
  const [showModal, setShowModal] = useState(false);

  // Queries
  const statsQ   = useQuery<PlatformStats>({
    queryKey: ['super-admin', 'platform-stats'],
    queryFn: async () => (await api.get('/tenants/platform-stats')).data,
  });
  const tenantsQ = useQuery<Tenant[]>({
    queryKey: ['super-admin', 'tenants'],
    queryFn: async () => (await api.get('/tenants')).data,
  });

  // Toggle tenant status
  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/tenants/${id}/toggle`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin'] });
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const HANDOFF_KEY = 'gpms_impersonate_handoff';

  // Impersonate tenant — opens in a new tab, original tab stays as SUPER_ADMIN
  const impersonateMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/tenants/${id}/impersonate`).then((r) => r.data as {
        accessToken: string; refreshToken: string;
        user: AuthUser; impersonatedTenant: string;
      }),
    onSuccess: (data) => {
      // Write a one-time handoff key (30s TTL) and open the new tab
      localStorage.setItem(HANDOFF_KEY, JSON.stringify({
        ...data,
        expiresAt: Date.now() + 30_000,
      }));
      window.open('/impersonate', '_blank', 'noopener,noreferrer');
      toast.success(`Opened ${data.impersonatedTenant} portal in a new tab`);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Impersonation failed'),
  });

  const s = statsQ.data;
  const tenants = (tenantsQ.data ?? []).filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={20} className="text-brand-orange" />
            <h1 className="text-2xl font-bold">Master Control Panel</h1>
          </div>
          <p className="text-text-secondary text-sm">
            Manage all tenants — provision, monitor, and configure the platform.
          </p>
        </div>
        <span className="label-pill">SUPER ADMIN</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Tenants"    value={s?.totalTenants  ?? '–'} icon={Building2} color="#2D7DD2" />
        <KpiCard label="Active Tenants"   value={s?.activeTenants ?? '–'} icon={CheckCircle2} color="#48BB78" />
        <KpiCard label="Platform Users"   value={s?.totalUsers    ?? '–'} icon={Users} color="#F47316" />
        <KpiCard label="Total Passes"     value={s?.totalPasses   ?? '–'} icon={ShieldCheck} color="#A78BFA" />
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex gap-6">
        {(['companies', 'settings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'pb-2.5 text-sm font-semibold capitalize border-b-2 transition-colors',
              tab === t
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {t === 'companies' ? 'Companies' : 'Platform Settings'}
          </button>
        ))}
      </div>

      {/* ── Companies Tab ───────────────────────────────────────────── */}
      {tab === 'companies' && (
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 size={16} className="text-brand-mid" />
              Registered Companies
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search companies…"
                  className="pl-9 pr-3 py-2 text-sm bg-bg-input border border-border rounded-lg outline-none focus:border-brand-orange w-56 text-text-primary"
                />
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <PlusCircle size={15} />
                Add Company
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary text-xs uppercase tracking-label">
                  <th className="text-left px-4 py-3">Company</th>
                  <th className="text-left px-4 py-3">Joined</th>
                  <th className="text-left px-4 py-3">Tier</th>
                  <th className="text-left px-4 py-3">Staff Limit</th>
                  <th className="text-left px-4 py-3">Trial Expiry</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenantsQ.isLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-text-secondary">Loading…</td>
                  </tr>
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-text-secondary">
                      {search ? 'No companies match your search.' : 'No companies yet. Click Add Company to get started.'}
                    </td>
                  </tr>
                ) : (
                  tenants.map((t) => (
                    <TenantRow
                      key={t.id}
                      tenant={t}
                      onToggle={() => toggleMutation.mutate(t.id)}
                      onImpersonate={() => impersonateMutation.mutate(t.id)}
                      impersonating={impersonateMutation.isPending}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Platform Settings Tab ───────────────────────────────────── */}
      {tab === 'settings' && <PlatformSettingsPanel />}

      {/* ── Add Company Modal ────────────────────────────────────────── */}
      {showModal && (
        <ProvisionModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            qc.invalidateQueries({ queryKey: ['super-admin'] });
          }}
        />
      )}
    </div>
  );
}

// ── Tenant row ────────────────────────────────────────────────────────────

function TenantRow({
  tenant, onToggle, onImpersonate, impersonating,
}: {
  tenant: Tenant; onToggle: () => void;
  onImpersonate: () => void; impersonating: boolean;
}) {
  const tier = tenant.settings?.tier ?? 'STANDARD';
  const staffLimit = tenant.settings?.staff_limit ?? '–';
  const trialExpiry = tenant.settings?.trial_expires_at;
  const tierColor = tier === 'ENTERPRISE' ? '#A78BFA' : tier === 'PROFESSIONAL' ? '#2D7DD2' : '#48BB78';

  const trialBadge = () => {
    if (!trialExpiry) return <span className="text-text-secondary text-xs">No trial</span>;
    const daysLeft = Math.ceil((new Date(trialExpiry).getTime() - Date.now()) / 86_400_000);
    if (daysLeft < 0) return <span className="text-rose-400 text-xs font-semibold">Expired</span>;
    return (
      <span className={clsx('text-xs font-semibold', daysLeft <= 7 ? 'text-brand-orange' : 'text-emerald-400')}>
        {daysLeft}d left
      </span>
    );
  };

  return (
    <tr className="border-b border-border hover:bg-bg-input transition-colors">
      <td className="px-4 py-3">
        <div className="font-semibold">{tenant.name}</div>
        <div className="text-xs text-text-secondary font-mono">{tenant.id.slice(0, 8)}…</div>
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {new Date(tenant.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: `${tierColor}22`, color: tierColor }}>
          {tier}
        </span>
      </td>
      <td className="px-4 py-3 font-mono">{staffLimit}</td>
      <td className="px-4 py-3">{trialBadge()}</td>
      <td className="px-4 py-3">
        {tenant.isActive ? (
          <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
            <CheckCircle2 size={13} /> Active
          </span>
        ) : (
          <span className="flex items-center gap-1 text-rose-400 text-xs font-semibold">
            <XCircle size={13} /> Disabled
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onImpersonate}
            disabled={impersonating}
            title="Log in as this tenant's admin"
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold
              bg-brand-mid/15 text-brand-mid hover:bg-brand-mid/25 transition-colors disabled:opacity-50"
          >
            <ExternalLink size={12} /> View Portal
          </button>
          <button
            onClick={onToggle}
            className={clsx(
              'px-2.5 py-1 rounded text-xs font-semibold transition-colors',
              tenant.isActive
                ? 'bg-rose-400/15 text-rose-400 hover:bg-rose-400/25'
                : 'bg-emerald-400/15 text-emerald-400 hover:bg-emerald-400/25',
            )}
          >
            {tenant.isActive ? 'Disable' : 'Enable'}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Provision Modal ────────────────────────────────────────────────────────

function ProvisionModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<ProvisionForm>({
      resolver: zodResolver(provisionSchema),
      defaultValues: { tier: 'STANDARD', staffLimit: 50, trialDays: 30, passValidityMonths: 6 },
    });

  const provision = useMutation({
    mutationFn: (data: ProvisionForm) => api.post('/tenants/provision', data),
    onSuccess: () => {
      toast.success('Company provisioned successfully!');
      onSuccess();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Provision failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-2xl shadow-card-hover max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="font-bold text-lg">Add New Company</h2>
            <p className="text-text-secondary text-sm mt-0.5">
              Creates a new tenant and their admin account in one step.
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-bg-input rounded-lg text-text-secondary">✕</button>
        </div>

        <form onSubmit={handleSubmit((data) => provision.mutate(data))} className="p-6 space-y-5">
          {/* Company */}
          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-label text-text-secondary mb-2 flex items-center gap-2">
              <Building2 size={12} /> Company Details
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <MField label="Company Name" error={errors.tenantName?.message}>
                <input {...register('tenantName')} placeholder="Acme Corp" className="minput" />
              </MField>
              <MField label="Tier" error={errors.tier?.message}>
                <select {...register('tier')} className="minput">
                  {TIERS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </MField>
              <MField label="Staff Limit" error={errors.staffLimit?.message}>
                <input type="number" {...register('staffLimit')} className="minput" />
              </MField>
              <MField label="Trial Days (0 = no trial)" error={errors.trialDays?.message}>
                <input type="number" {...register('trialDays')} className="minput" />
              </MField>
              <MField label="Pass Validity (months)" error={errors.passValidityMonths?.message}>
                <input type="number" {...register('passValidityMonths')} className="minput" />
              </MField>
            </div>
          </fieldset>

          <hr className="border-border" />

          {/* Admin account */}
          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-label text-text-secondary mb-2 flex items-center gap-2">
              <Users size={12} /> Admin Account
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <MField label="Admin Full Name" error={errors.adminName?.message}>
                <input {...register('adminName')} placeholder="Jane Smith" className="minput" />
              </MField>
              <MField label="Admin Email" error={errors.adminEmail?.message}>
                <input type="email" {...register('adminEmail')} placeholder="admin@company.com" className="minput" />
              </MField>
              <MField label="Initial Password" error={errors.adminPassword?.message} className="col-span-2">
                <input type="password" {...register('adminPassword')} placeholder="Min 8 characters" className="minput" />
              </MField>
            </div>
          </fieldset>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-bg-input transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting}
              className="px-5 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
              {isSubmitting ? 'Provisioning…' : 'Provision Company'}
            </button>
          </div>
        </form>

        <style>{`
          .minput {
            width: 100%;
            background: var(--bg-input);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 8px 10px;
            font-size: 0.875rem;
            color: var(--text-primary);
            outline: none;
          }
          .minput:focus { border-color: #F47316; }
        `}</style>
      </div>
    </div>
  );
}

// ── Platform Settings ──────────────────────────────────────────────────────

function PlatformSettingsPanel() {
  return (
    <div className="space-y-4">
      {/* Google OAuth */}
      <section className="bg-bg-card border border-border rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            {/* Google G icon */}
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          </div>
          <div className="flex-1">
            <div className="font-semibold">Google OAuth Sign-in</div>
            <div className="text-sm text-text-secondary mt-0.5">
              Allow users to sign in with their Google account.
            </div>
            <div className="mt-3 p-4 bg-bg-input rounded-xl border border-border space-y-2 text-sm">
              <div className="font-semibold text-text-primary mb-2">Setup steps:</div>
              <ol className="space-y-1.5 text-text-secondary list-decimal list-inside">
                <li>Go to <a href="https://console.cloud.google.com" target="_blank" className="text-brand-mid hover:underline">console.cloud.google.com</a> → Create a project</li>
                <li>APIs & Services → Credentials → Create OAuth 2.0 Client ID</li>
                <li>Application type: <strong className="text-text-primary">Web application</strong></li>
                <li>Authorised redirect URI: <code className="bg-bg-primary px-1.5 py-0.5 rounded text-xs">{window.location.origin}/auth/google/callback</code></li>
                <li>Copy Client ID and Client Secret</li>
                <li>Add to Render → DocPilot (API) → Environment:</li>
              </ol>
              <div className="mt-3 bg-bg-primary rounded-lg p-3 font-mono text-xs space-y-1">
                <div><span className="text-brand-orange">GOOGLE_CLIENT_ID</span>=your-client-id.apps.googleusercontent.com</div>
                <div><span className="text-brand-orange">GOOGLE_CLIENT_SECRET</span>=your-client-secret</div>
                <div><span className="text-brand-orange">GOOGLE_CALLBACK_URL</span>={window.location.origin}/api/v1/auth/google/callback</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Status */}
      <section className="bg-bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 font-semibold mb-4">
          <ShieldCheck size={16} className="text-emerald-400" />
          Security Compliance Status
        </div>
        <div className="space-y-2.5">
          <SecurityItem ok label="HTTPS enforced" detail="Render provides TLS termination on all services" />
          <SecurityItem ok label="Rate limiting" detail="Auth endpoints: 5 requests/min. Global: 120 req/min" />
          <SecurityItem ok label="Input validation" detail="ValidationPipe with whitelist + forbidNonWhitelisted enabled globally" />
          <SecurityItem ok label="Helmet headers" detail="Content-Security-Policy, X-Frame-Options, X-XSS-Protection etc." />
          <SecurityItem ok label="Password hashing" detail="bcrypt with 12 rounds — NIST/OWASP compliant" />
          <SecurityItem ok label="Row-level security" detail="Postgres RLS policies on all tenant tables + Prisma middleware" />
          <SecurityItem ok label="JWT short expiry" detail="Access token: 15min. Refresh token: 7 days" />
          <SecurityItem label="CORS origin" detail="Set CORS_ORIGIN to your exact domain in Render (not *)" />
          <SecurityItem label="Admin password" detail="Change admin@gpms.com password from default '123@gpms' immediately" />
          <SecurityItem label="JWT secrets" detail="Verify JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are strong random strings in Render" />
        </div>
      </section>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}22`, color }}>
          <Icon size={18} />
        </div>
        <div className="text-xs font-bold uppercase tracking-label text-text-secondary">{label}</div>
      </div>
      <div className="text-3xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function SecurityItem({ ok, label, detail }: {
  ok?: boolean; label: string; detail: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={clsx(
        'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
        ok ? 'bg-emerald-400/15' : 'bg-amber-400/15',
      )}>
        {ok
          ? <CheckCircle2 size={14} className="text-emerald-400" />
          : <Settings2 size={14} className="text-amber-400" />
        }
      </div>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-text-secondary">{detail}</div>
      </div>
    </div>
  );
}

function MField({ label, error, children, className }: {
  label: string; error?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-text-secondary mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
    </div>
  );
}
