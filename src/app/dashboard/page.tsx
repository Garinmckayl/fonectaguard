import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { bySeverity, dashboardData } from "@/lib/queries";
import { Badge, Empty, SeverityBadge, ago } from "@/components/ui";
import { HealthChart } from "@/components/health-chart";
import { LiveScan } from "@/components/live-scan";
import { FIELD_LABELS, type FieldName } from "@/lib/compare";
import { connectorInfo } from "@/lib/connectors";

export default async function Overview() {
  const s = (await getSession())!;
  const d = dashboardData(getDb(), s.orgId);
  if (!d) return <Empty>No business yet. <Link className="text-accent underline" href="/onboarding">Create one</Link>.</Empty>;
  const { health, active, resolved, listings, snapshots, lastScan, approvals, events } = d;
  const writable = listings.filter((l) => connectorInfo(l.platform)?.capabilities.includes("write")).length;
  const readOnly = listings.length - writable;
  const headline = health.status === "insufficient" ? "Monitoring is ready — run your first scan." : health.status === "healthy" ? "Your business is protected." : health.status === "critical" ? "Critical inconsistencies need your attention." : "Some listings need attention.";
  const tone = { healthy: "teal", attention: "amber", critical: "red", insufficient: "zinc" }[health.status];
  return (
    <div className="space-y-6">
      <section className="card fade-in">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge tone={tone}><span className="pulse-dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />{health.status === "insufficient" ? "Awaiting first scan" : "Monitoring active"}</Badge>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{headline}</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">FonectaGuard continuously monitors your online presence and catches inaccuracies before customers do.</p>
            <p className="mt-2 text-xs text-zinc-500">Last successful scan: {lastScan ? ago(lastScan.completedAt) : "never"} · Monitoring: {d.loc.monitoringFrequency}</p>
          </div>
          <LiveScan locationId={d.loc.id} />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Key metrics">
        <Metric label="Presence Health" value={health.score === null ? "—" : `${health.score}%`} sub={health.score === null ? "Insufficient data" : `${health.matching}/${health.monitored} fields · ${health.sources} sources`} />
        <Metric label="Connected Sources" value={String(listings.filter((l) => l.status === "monitoring").length)} sub={`${writable} writable · ${readOnly} read-only`} />
        <Metric label="Issues Detected" value={String(active.length)} sub="active validated discrepancies" />
        <Metric label="Issues Resolved" value={String(resolved.length)} sub="verified corrections" />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="mb-3 font-medium text-white">Presence health history</h2>
          <HealthChart data={snapshots.map((x) => ({ t: x.recordedAt, score: x.score }))} />
        </section>
        <section className="card">
          <h2 className="mb-3 font-medium text-white">Pending approvals ({approvals.length})</h2>
          {approvals.length === 0 ? <p className="text-sm text-zinc-500">Nothing waiting for you.</p> : (
            <ul className="space-y-2 text-sm">
              {approvals.slice(0, 5).map((p) => (
                <li key={p.id}><Link href="/dashboard/approvals" className="text-zinc-300 hover:text-accent">{connectorInfo(p.targetPlatform)?.label ?? p.targetPlatform}: {FIELD_LABELS[p.proposedChangeJson.field as FieldName]} → {String(p.proposedChangeJson.newValue)}</Link></li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-medium text-white">Highest-priority discrepancies</h2>
          {active.length === 0 ? <p className="text-sm text-zinc-500">No active discrepancies.</p> : (
            <ul className="space-y-3">
              {bySeverity(active).slice(0, 5).map((x) => (
                <li key={x.id} className="flex items-start justify-between gap-3 text-sm">
                  <span>{FIELD_LABELS[x.fieldName as FieldName]} <span className="text-zinc-500">· {Math.round(x.confidence * 100)}% confidence</span></span>
                  <SeverityBadge s={x.severity} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="mb-3 flex justify-between font-medium text-white">Recent agent activity <Link className="text-xs text-accent" href="/dashboard/activity">View all</Link></h2>
          {events.length === 0 ? <p className="text-sm text-zinc-500">No activity yet.</p> : (
            <ul className="space-y-2 text-sm">
              {events.slice(0, 6).map((e) => <li key={e.id} className="flex justify-between gap-3"><span className="text-zinc-300">{e.message}</span><span className="shrink-0 text-xs text-zinc-500">{ago(e.createdAt)}</span></li>)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card fade-in">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{sub}</p>
    </div>
  );
}
