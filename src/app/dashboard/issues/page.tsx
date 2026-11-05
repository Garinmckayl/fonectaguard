import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getLocation, bySeverity } from "@/lib/queries";
import { Badge, Empty, PageHeader, SeverityBadge, ago } from "@/components/ui";
import { ActionButton } from "@/components/actions";
import { FIELD_LABELS, type FieldName } from "@/lib/compare";
import { connectorInfo } from "@/lib/connectors";
import { displayValue } from "@/lib/format";

export default async function Issues({ searchParams }: { searchParams: { severity?: string; tab?: string } }) {
  const s = (await getSession())!;
  const db = getDb();
  const loc = getLocation(db, s.orgId);
  if (!loc) return <Empty>No business yet.</Empty>;
  const tab = searchParams.tab === "closed" ? "closed" : "active";
  let rows = db.select().from(schema.discrepancies).where(and(eq(schema.discrepancies.locationId, loc.id), tab === "closed" ? inArray(schema.discrepancies.status, ["resolved", "dismissed"]) : undefined)).orderBy(desc(schema.discrepancies.firstDetectedAt)).all();
  if (tab === "active") rows = rows.filter((r) => !["resolved", "dismissed"].includes(r.status));
  if (searchParams.severity) rows = rows.filter((r) => r.severity === searchParams.severity);
  rows = bySeverity(rows);
  const listings = new Map(db.select().from(schema.listings).where(eq(schema.listings.locationId, loc.id)).all().map((l) => [l.id, l]));
  return (
    <div>
      <PageHeader title="Issues" sub="Validated discrepancies between your verified profile and published information.">
        <div className="flex gap-2 text-sm">
          <Link className={`btn ${tab === "active" ? "btn-primary" : "btn-ghost"}`} href="/dashboard/issues">Active</Link>
          <Link className={`btn ${tab === "closed" ? "btn-primary" : "btn-ghost"}`} href="/dashboard/issues?tab=closed">Resolved / dismissed</Link>
        </div>
      </PageHeader>
      <form className="mb-4 flex gap-2"><input type="hidden" name="tab" value={tab} />
        <select name="severity" defaultValue={searchParams.severity ?? ""} className="input w-auto"><option value="">All severities</option>{["critical", "high", "medium", "low"].map((x) => <option key={x}>{x}</option>)}</select>
        <button className="btn btn-ghost">Filter</button></form>
      {rows.length === 0 ? <Empty>{tab === "active" ? "No active issues." : "Nothing here yet."}</Empty> : (
        <ul className="space-y-4">
          {rows.map((d) => {
            const l = listings.get(d.listingId);
            const info = connectorInfo(l?.platform ?? "");
            return (
              <li key={d.id} className="card fade-in">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-white">{info?.label ?? l?.platform} — {FIELD_LABELS[d.fieldName as FieldName]}</h3>
                  <div className="flex gap-2"><SeverityBadge s={d.severity} /><Badge tone="blue">{d.status.replaceAll("_", " ")}</Badge><Badge>{Math.round(d.confidence * 100)}% · {d.classification}</Badge></div>
                </div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3"><p className="text-xs text-zinc-500">Published</p>{displayValue(d.fieldName, d.observedValueJson)}</div>
                  <div className="rounded-lg border border-accent/20 bg-accent/5 p-3"><p className="text-xs text-zinc-500">Verified</p>{displayValue(d.fieldName, d.expectedValueJson)}</div>
                </div>
                <p className="mt-3 text-sm text-zinc-300">{d.explanation}</p>
                <p className="mt-1 text-xs text-zinc-500">Detected {ago(d.firstDetectedAt)} · last seen {ago(d.lastSeenAt)} · <a className="underline" href={l?.url}>{l?.url}</a></p>
                {!["resolved", "dismissed", "approved", "applying", "verifying"].includes(d.status) && (
                  <div className="mt-3 flex gap-2">
                    {d.status === "awaiting_approval" && <Link className="btn btn-primary" href="/dashboard/approvals">Review proposal</Link>}
                    <ActionButton url={`/api/discrepancies/${d.id}/dismiss`} label="Dismiss (false match)" confirm="Dismiss this finding?" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
