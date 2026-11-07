import clsx from "clsx";

const SEV: Record<string, string> = {
  critical: "bg-[#FFD3CC] text-[#9B1C12] border-[#9B1C12]",
  high: "bg-[#FFE0C2] text-[#9A3B05] border-[#9A3B05]",
  medium: "bg-[#FFF0B8] text-[#7A5A00] border-[#7A5A00]",
  low: "bg-slate-100 text-slate-700 border-slate-500",
};

export function Badge({ children, tone = "zinc", className }: { children: React.ReactNode; tone?: string; className?: string }) {
  const tones: Record<string, string> = {
    zinc: "bg-slate-100 text-slate-700 border-slate-500",
    teal: "bg-[#D5F3E3] text-[#0A5C3B] border-[#0A5C3B]",
    amber: "bg-[#FFF0B8] text-[#7A5A00] border-[#7A5A00]",
    red: "bg-[#FFD3CC] text-[#9B1C12] border-[#9B1C12]",
    blue: "bg-[#DCEBFF] text-[#164E9C] border-[#164E9C]",
  };
  return <span className={clsx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold", tones[tone] ?? tones.zinc, className)}>{children}</span>;
}

export const SeverityBadge = ({ s }: { s: string | null }) => (s ? <span className={clsx("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize", SEV[s])}>{s}</span> : <Badge tone="teal">Healthy</Badge>);

export function ago(ts: number | null | undefined) {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border-[1.5px] border-dashed border-ink/50 bg-panel/60 p-8 text-center text-sm text-slate-600">{children}</div>;
}

/** Ring gauge for a 0-100 score. `good` flips the colour logic (high = good). */
export function Gauge({ value, label, sub, size = 92 }: { value: number | null; label: string; sub?: string; size?: number }) {
  const r = 42, c = 2 * Math.PI * r, v = value ?? 0;
  const col = value === null ? "#A59D88" : v >= 90 ? "#0B7D52" : v >= 60 ? "#E0A100" : "#D92D20";
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${label}: ${value === null ? "no data" : value + "%"}`} className="shrink-0">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#E6DECA" strokeWidth="11" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={col} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} transform="rotate(-90 50 50)" />
        <text x="50" y="57" textAnchor="middle" className="font-display" fontSize="25" fontWeight="800" fill="#14110D">{value === null ? "—" : value}</text>
      </svg>
      <div><p className="font-display text-lg font-bold leading-tight text-ink">{label}</p>{sub && <p className="mt-1 text-xs leading-snug text-slate-600">{sub}</p>}</div>
    </div>
  );
}
