import clsx from "clsx";

const SEV: Record<string, string> = {
  critical: "bg-red-500/15 text-red-600 border-red-500/30",
  high: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  medium: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  low: "bg-slate-100 text-slate-700 border-slate-200",
};

export function Badge({ children, tone = "zinc", className }: { children: React.ReactNode; tone?: string; className?: string }) {
  const tones: Record<string, string> = { zinc: "bg-slate-100 text-slate-700 border-line", teal: "bg-accent/10 text-accent border-accent/30", amber: "bg-amber-500/10 text-amber-600 border-amber-500/30", red: "bg-red-500/10 text-red-600 border-red-500/30", blue: "bg-sky-500/10 text-sky-600 border-sky-500/30" };
  return <span className={clsx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone] ?? tones.zinc, className)}>{children}</span>;
}

export const SeverityBadge = ({ s }: { s: string | null }) => (s ? <span className={clsx("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize", SEV[s])}>{s}</span> : <Badge tone="teal">Healthy</Badge>);

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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-slate-500">{children}</div>;
}
