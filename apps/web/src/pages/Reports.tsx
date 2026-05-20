import {
  Activity,
  AlertTriangle,
  Archive,
  BadgeCheck,
  Boxes,
  Building2,
  Car,
  Clock,
  Construction,
  FileText,
  History,
  PackageCheck,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface ReportCard {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
}

const REPORTS: ReportCard[] = [
  { slug: 'pass-register',    title: 'Pass Register',          description: 'Every pass with all attributes — searchable and filterable.',    icon: BadgeCheck,    accent: '#00D4AA' },
  { slug: 'expiry',           title: 'Expiry Report',          description: 'Passes expiring in a date range, grouped 30 / 15 / 7 / expired.', icon: Clock,        accent: '#ED8936' },
  { slug: 'compliance',       title: 'Compliance Report',      description: 'Overdue renewals, cancellations and authority handovers.',      icon: ShieldCheck,   accent: '#FC5185' },
  { slug: 'custody',          title: 'Custody Report',         description: 'Pass cards grouped by custody status with last update date.',   icon: Boxes,         accent: '#4299E1' },
  { slug: 'pending-handover', title: 'Pending Handover',       description: 'Returned-to-company passes with days elapsed and overdue flag.', icon: PackageCheck,  accent: '#ED8936' },
  { slug: 'retention',        title: 'Data Retention',         description: 'Cancelled passes scheduled for deletion with countdown.',       icon: Trash2,        accent: '#A78BFA' },
  { slug: 'zone-access',      title: 'Zone Access',            description: 'Active vs. inactive passes per zone code.',                     icon: Archive,       accent: '#14B8A6' },
  { slug: 'staff-history',    title: 'Staff Pass History',     description: 'All passes for a single staff member as a timeline.',           icon: History,       accent: '#48BB78' },
  { slug: 'subcontractor',    title: 'Subcontractor Report',   description: 'Per-organisation compliance scoring and breakdown.',            icon: Building2,     accent: '#3B82F6' },
  { slug: 'audit-trail',            title: 'Audit Trail',                     description: 'Searchable log of every system action with filters.',                                                            icon: Activity,      accent: '#9CA3AF' },
  { slug: 'vehicles-expiry',        title: 'Vehicles Expiry',                 description: 'Vehicles with car license, insurance or mawaqif expiring within a configurable window.',                              icon: Car,           accent: '#06B6D4' },
  { slug: 'machinery-compliance',   title: 'Machinery Compliance',            description: 'All active heavy machinery with every certificate band — operator licence, inspection, RTA, lifting test and more.',   icon: Construction,  accent: '#F59E0B' },
  { slug: 'employees-visa-status',  title: 'Employees Visa Status',           description: 'Active employees sorted by visa expiry urgency with Emirates ID and labour card bands.',                              icon: Users,         accent: '#10B981' },
  { slug: 'company-docs-compliance', title: 'Company Docs Compliance',        description: 'All company compliance documents (trade licence, POA, civil defence, etc.) with expiry bands and Hassantuk sub-expiry.', icon: ShieldCheck,  accent: '#8B5CF6' },
  { slug: 'master-expiry',          title: 'Master Expiry',                   description: 'Everything expiring across all modules in one view. Excel export creates five separate sheets — one per module.',     icon: ShieldAlert,   accent: '#EF4444' },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText size={20} className="text-accent-primary" />
            Reports
          </h1>
          <p className="text-sm text-text-secondary">
            Operational and compliance reports. Each report supports filters, Excel and PDF export, and a print-friendly view.
          </p>
        </div>
      </div>

      <section className="bg-bg-card border border-border rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {REPORTS.map((r) => (
            <Card key={r.slug} card={r} />
          ))}
        </div>
      </section>

      <section className="bg-bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <AlertTriangle size={16} className="text-accent-primary" />
          Tips
        </h2>
        <ul className="text-sm text-text-secondary space-y-1 list-disc list-inside">
          <li>Excel exports include summary rows, group headers and column formats.</li>
          <li>PDF exports use a print-optimised light theme regardless of your dashboard preference.</li>
          <li>Subcontractor users automatically see only their organisation’s data.</li>
        </ul>
      </section>
    </div>
  );
}

function Card({ card }: { card: ReportCard }) {
  const { icon: Icon, accent, title, description, slug } = card;
  return (
    <Link
      to={`/reports/${slug}`}
      className="border border-border rounded-xl p-4 bg-bg-primary hover:border-accent-primary transition-colors flex flex-col gap-3 group"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg grid place-items-center"
          style={{ background: `${accent}20`, color: accent }}
        >
          <Icon size={18} />
        </div>
        <div className="font-semibold group-hover:text-accent-primary transition-colors">{title}</div>
      </div>
      <p className="text-xs text-text-secondary leading-snug">{description}</p>
      <div className="text-xs text-accent-primary font-medium mt-auto">Open →</div>
    </Link>
  );
}
