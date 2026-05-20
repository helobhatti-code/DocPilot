import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resolveFileUrl } from '@/lib/fileUrl';
import { Building2, Database, Image, Info, LucideIcon, Mail, Plane, Shield, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { AIRPORT_COLORS, ZONE_COLORS } from '@/lib/constants';

type AirportCode = 'AUH' | 'AAN' | 'SIR' | 'AZI' | 'ZDY' | 'ALL';
type ZoneCode =
  | 'AP' | 'AR' | 'CO' | 'TT' | 'AT' | 'BS' | 'TW' | 'PX' | 'CT' | 'GW'
  | 'EYE' | 'ALL_ZONES' | 'BHS' | 'CBP' | 'BHS_CBP' | 'PA' | 'FF' | 'TL';

const ALL_AIRPORTS: AirportCode[] = ['AUH', 'AAN', 'SIR', 'AZI', 'ZDY', 'ALL'];
const ALL_ZONES: ZoneCode[] = [
  'AP', 'AR', 'CO', 'TT', 'AT', 'BS', 'TW', 'PX', 'CT', 'GW',
  'EYE', 'ALL_ZONES', 'BHS', 'CBP', 'BHS_CBP', 'PA', 'FF', 'TL',
];

interface TenantMe {
  id: string;
  tenantId: string;
  name: string;
  logoUrl?: string | null;
  passValidityMonths: number;
  enabledAirports: AirportCode[];
  enabledZones: ZoneCode[];
  expiryWarning30Days: boolean;
  expiryWarning15Days: boolean;
  expiryWarning7Days: boolean;
  retentionPeriodDays: number | 'permanent';
}

const RETENTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: '365', label: '365 days' },
  { value: 'permanent', label: 'Permanent (no automatic deletion)' },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">System Settings</h1>
        <p className="text-sm text-text-secondary">
          Tenant profile, pass configuration, retention, and notifications.
        </p>
      </div>

      <CompanyProfileSection />
      <PassConfigurationSection />
      <RetentionSection />
      <NotificationSettingsSection />
      <RolesAccessLink />

      <style>{`
        .input { background: var(--bg-input); border: 1px solid var(--border); border-radius: 8px;
          padding: 8px 10px; width: 100%; outline: none; color: var(--text-primary); }
        .input:focus { border-color: #00D4AA; }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Company Profile
// ---------------------------------------------------------------------------

function CompanyProfileSection() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-me'],
    queryFn: async () => (await api.get('/tenants/me')).data as TenantMe,
  });

  const { register, handleSubmit, reset, formState: { isDirty } } =
    useForm<{ name: string }>({ defaultValues: { name: '' } });

  useEffect(() => { if (data) reset({ name: data.name }); }, [data, reset]);

  const save = useMutation({
    mutationFn: async (v: { name: string }) =>
      (await api.patch('/tenants/me/profile', v)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-me'] });
      toast.success('Company profile saved');
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Save failed'),
  });

  const uploadLogo = async (file: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2MB'); return; }
    if (!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(file.type)) {
      toast.error('Logo must be PNG, JPEG, SVG, or WebP'); return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'SUPPORTING');
      const up = await api.post('/uploads', fd);
      await api.patch('/tenants/me/profile', { logoUrl: up.data.fileUrl });
      qc.invalidateQueries({ queryKey: ['tenant-me'] });
      toast.success('Logo updated');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Section title="Company Profile" icon={Building2}>
      {isLoading ? (
        <div className="text-text-secondary text-sm">Loading…</div>
      ) : (
        <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <div className="md:col-span-2 space-y-3">
              <Field label="Display name">
                <input {...register('name', { required: true })} className="input" />
              </Field>
              <Field label="Tenant ID">
                <input value={data?.tenantId ?? ''} readOnly className="input font-mono text-xs opacity-70" />
              </Field>
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-text-secondary">Logo</label>
              <div className="bg-bg-input border border-border rounded-lg p-3 grid place-items-center h-32">
                {data?.logoUrl ? (
                  <img src={resolveFileUrl(data.logoUrl)!} alt="Logo" className="max-h-24 max-w-full object-contain" />
                ) : (
                  <div className="text-text-secondary text-xs flex flex-col items-center gap-1">
                    <Image size={20} />
                    <span>No logo uploaded</span>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="w-full px-3 py-1.5 rounded-lg bg-bg-card border border-border text-sm hover:bg-bg-input disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Upload logo'}
              </button>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!isDirty || save.isPending}
              className="px-4 py-2 rounded-lg bg-accent-primary text-white text-sm disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Pass Configuration
// ---------------------------------------------------------------------------

function PassConfigurationSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-me'],
    queryFn: async () => (await api.get('/tenants/me')).data as TenantMe,
  });

  const [validity, setValidity] = useState(6);
  const [airports, setAirports] = useState<AirportCode[]>([]);
  const [zones, setZones] = useState<ZoneCode[]>([]);

  useEffect(() => {
    if (!data) return;
    setValidity(data.passValidityMonths ?? 6);
    setAirports(data.enabledAirports ?? ALL_AIRPORTS);
    setZones(data.enabledZones ?? ALL_ZONES);
  }, [data]);

  const dirty =
    !!data &&
    (validity !== (data.passValidityMonths ?? 6) ||
      JSON.stringify(airports.slice().sort()) !== JSON.stringify((data.enabledAirports ?? []).slice().sort()) ||
      JSON.stringify(zones.slice().sort()) !== JSON.stringify((data.enabledZones ?? []).slice().sort()));

  const save = useMutation({
    mutationFn: async () =>
      (await api.patch('/tenants/me/pass-config', {
        passValidityMonths: validity,
        enabledAirports: airports,
        enabledZones: zones,
      })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-me'] });
      toast.success('Pass configuration saved');
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Save failed'),
  });

  const toggle = <T extends string>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <Section title="Pass Configuration" icon={Plane}>
      {isLoading ? (
        <div className="text-text-secondary text-sm">Loading…</div>
      ) : (
        <div className="space-y-5">
          <Field label="Default pass validity">
            <select
              value={validity}
              onChange={(e) => setValidity(Number(e.target.value))}
              className="input md:w-60"
            >
              {[3, 6, 9, 12].map((m) => (
                <option key={m} value={m}>{m} months</option>
              ))}
            </select>
          </Field>

          <div>
            <div className="text-sm text-text-secondary mb-2">Enabled airports</div>
            <div className="flex flex-wrap gap-2">
              {ALL_AIRPORTS.map((a) => {
                const on = airports.includes(a);
                const c = AIRPORT_COLORS[a];
                return (
                  <button
                    key={a} type="button"
                    title={c?.name}
                    onClick={() => setAirports(toggle(airports, a))}
                    style={on && c ? { backgroundColor: c.bg, borderColor: c.bg, color: '#fff' } : undefined}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-mono transition-colors ${on
                      ? 'shadow-sm'
                      : 'bg-bg-input border-border text-text-secondary hover:bg-bg-card opacity-70'}`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-sm text-text-secondary mb-2">Enabled zones</div>
            <div className="flex flex-wrap gap-2">
              {ALL_ZONES.map((z) => {
                const on = zones.includes(z);
                const c = ZONE_COLORS[z];
                return (
                  <button
                    key={z} type="button"
                    title={c?.name}
                    onClick={() => setZones(toggle(zones, z))}
                    style={on && c ? { backgroundColor: c.bg, borderColor: c.bg, color: '#fff' } : undefined}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${on
                      ? 'shadow-sm'
                      : 'bg-bg-input border-border text-text-secondary hover:bg-bg-card opacity-70'}`}
                  >
                    {c?.label ?? z}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
              className="px-4 py-2 rounded-lg bg-accent-primary text-white text-sm disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save pass configuration'}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

interface RetentionResponse { retention: number | 'permanent'; }
interface PreviewResponse {
  cancelledTotal: number;
  alreadyDue: number;
  dueWithinNewWindow: number;
  note?: string;
}

function RetentionSection() {
  const qc = useQueryClient();
  const { data: current, isLoading } = useQuery({
    queryKey: ['tenant-retention'],
    queryFn: async () => (await api.get('/tenants/me/retention')).data as RetentionResponse,
  });

  const [selection, setSelection] = useState<string>('');
  useEffect(() => {
    if (current) setSelection(current.retention === 'permanent' ? 'permanent' : String(current.retention));
  }, [current]);

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['tenant-retention-preview', selection],
    queryFn: async () => {
      const params = selection === 'permanent' ? { permanent: 'permanent' } : { days: selection };
      return (await api.get('/tenants/me/retention/preview', { params })).data as PreviewResponse;
    },
    enabled: !!selection,
  });

  const save = useMutation({
    mutationFn: async () => {
      const body =
        selection === 'permanent'
          ? { retentionPeriod: 'permanent' as const }
          : { retentionPeriodDays: parseInt(selection, 10) };
      return (await api.patch('/tenants/me/retention', body)).data as RetentionResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-retention'] });
      qc.invalidateQueries({ queryKey: ['tenant-me'] });
      toast.success('Retention policy updated');
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Save failed'),
  });

  const isDirty =
    current && selection &&
    selection !== (current.retention === 'permanent' ? 'permanent' : String(current.retention));

  return (
    <Section title="Data Retention" icon={Database}>
      <p className="text-sm text-text-secondary mb-4">
        After a pass is CANCELLED, its supporting documents and personal data are purged after this many days.
        A 7-day pre-deletion warning is sent to Admins so they can extend or delete immediately.
      </p>

      {isLoading ? (
        <div className="text-text-secondary text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Field label="Retention period">
              <select
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                className="input"
              >
                {RETENTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              disabled={!isDirty || save.isPending}
              onClick={() => save.mutate()}
              className="mt-3 px-4 py-2 rounded-lg bg-accent-primary text-white text-sm disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save retention policy'}
            </button>
          </div>

          <div className="bg-bg-input/50 border border-border rounded-lg p-4 text-sm">
            <div className="flex items-center gap-2 font-medium mb-2">
              <Info size={14} /> Affected records preview
            </div>
            {previewLoading || !preview ? (
              <div className="text-text-secondary">Calculating…</div>
            ) : (
              <ul className="space-y-1 text-text-primary/90">
                <li><span className="text-text-secondary">CANCELLED passes total:</span>{' '}
                  <span className="font-mono">{preview.cancelledTotal}</span></li>
                <li><span className="text-text-secondary">Already due for purge:</span>{' '}
                  <span className="font-mono">{preview.alreadyDue}</span></li>
                <li><span className="text-text-secondary">Would be purged within new window:</span>{' '}
                  <span className="font-mono">{preview.dueWithinNewWindow}</span></li>
                {preview.note && <li className="text-xs text-text-secondary mt-2">{preview.note}</li>}
              </ul>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Notification Settings
// ---------------------------------------------------------------------------

function NotificationSettingsSection() {
  return (
    <Section title="Notification Settings" icon={Mail}>
      <p className="text-sm text-text-secondary mb-3">
        Notification templates control the subject and body of every email sent by the system.
        Edit per-type templates with live preview.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          to="/system/notification-templates"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border text-sm hover:bg-bg-input"
        >
          Manage notification templates →
        </Link>
        <Link
          to="/system/alarm-thresholds"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border text-sm hover:bg-bg-input"
        >
          Alarm thresholds (30 / 14 / 7 days) →
        </Link>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Roles & Access shortcut
// ---------------------------------------------------------------------------

function RolesAccessLink() {
  return (
    <Section title="Roles & Access" icon={Shield}>
      <p className="text-sm text-text-secondary mb-3">
        Manage role-based feature toggles, invite users, and view role assignments.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link to="/system/roles" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border text-sm hover:bg-bg-input">
          <Shield size={14} /> Role permissions
        </Link>
        <Link to="/system/users" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border text-sm hover:bg-bg-input">
          <Users size={14} /> Users & invitations
        </Link>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Section({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="bg-bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon size={16} />}
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-text-secondary mb-1">{label}</label>
      {children}
    </div>
  );
}
