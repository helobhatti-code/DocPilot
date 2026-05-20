import { useRef, useState } from 'react';
import { AIRPORT_COLORS, CUSTODY_COLORS, STATUS_COLORS, ZONE_COLORS, ZONE_ORDER } from '@/lib/constants';
import { AirportCode, CustodyStatus, GatePassStatus, ZoneCode } from '@/lib/types';

function Pill({ bg, label, title }: { bg: string; label: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-white whitespace-nowrap"
      style={{ background: bg }}
    >
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: GatePassStatus }) {
  const c = STATUS_COLORS[status];
  return <Pill bg={c.bg} label={c.label} />;
}

export function CustodyBadge({ status }: { status: CustodyStatus }) {
  const c = CUSTODY_COLORS[status];
  return <Pill bg={c.bg} label={c.label} />;
}

export function ZoneBadge({ code }: { code: ZoneCode }) {
  const c = ZONE_COLORS[code];
  return <Pill bg={c.bg} label={c.label} title={c.name} />;
}

export function AirportBadge({ code }: { code: AirportCode }) {
  const c = AIRPORT_COLORS[code];
  if (!c) return <span className="font-mono text-xs">{code}</span>;
  return <Pill bg={c.bg} label={c.label} title={c.name} />;
}

const ZONE_RANK: Record<string, number> = Object.fromEntries(
  ZONE_ORDER.map((z, i) => [z, i]),
);

function sortZones(codes: ZoneCode[]): ZoneCode[] {
  return [...codes].sort(
    (a, b) => (ZONE_RANK[a] ?? 999) - (ZONE_RANK[b] ?? 999),
  );
}

export function ZoneList({ codes, max = 4 }: { codes: ZoneCode[]; max?: number }) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  if (!codes.length) return <span className="text-text-secondary text-xs">—</span>;
  const sorted = sortZones(codes);
  const showAll = sorted.length <= max;
  const visible = showAll ? sorted : sorted.slice(0, max);
  const hidden = showAll ? [] : sorted.slice(max);

  const open = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
  };
  const close = () => setPos(null);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((c) => <ZoneBadge key={c} code={c} />)}
      {!showAll && (
        <>
          <span
            ref={triggerRef}
            onMouseEnter={open}
            onMouseLeave={close}
            onFocus={open}
            onBlur={close}
            tabIndex={0}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-bg-input text-text-secondary border border-border cursor-default whitespace-nowrap"
          >
            +{hidden.length}
          </span>
          {pos && (
            <div
              style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
              className="flex flex-wrap gap-1 p-2 rounded-lg bg-bg-card border border-border shadow-xl max-w-[260px] min-w-[180px] pointer-events-none"
            >
              {sorted.map((c) => <ZoneBadge key={c} code={c} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
