import Link from "next/link";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getLocation, loadListingsWithStats } from "@/lib/queries";
import { Badge, Empty, PageHeader, SeverityBadge, ago } from "@/components/ui";
import { ActionButton } from "@/components/actions";
import { connectorInfo } from "@/lib/connectors";
import { compareAll, FIELD_LABELS, isMatch, type FieldName } from "@/lib/compare";
import { canonicalValues, latestExtraction, observedValues } from "@/lib/scan";
import { loadCanonical } from "@/lib/canonical";
import { displayValue } from "@/lib/format";

export default async function Listings(props: { searchParams: Promise<{ id?: string; platform?: string; status?: string }> }) {
  const searchParams = await props.searchParams;
  const s = (await getSession())!;
  const db = await getDb();
  const loc = await getLocation(db, s.orgId);
  if (!loc) return <Empty>No business yet.</Empty>;
  let rows = await loadListingsWithStats(db, loc.id);
  if (searchParams.platform) rows = rows.filter((r) => r.platform === searchParams.platform);
  if (searchParams.status === "issues") rows = rows.filter((r) => r.discrepancies.length);
  if (searchParams.status === "healthy") rows = rows.filter((r) => !r.discrepancies.length);
  const platforms = [...new Set((await loadListingsWithStats(db, loc.id)).map((r) => r.platform))];
  const selected = searchParams.id ? rows.find((r) => r.id === searchParams.id) : undefined;

  return (
    <div>
      <PageHeader title="Listings" sub="Every discovered place your business appears online.">
        <form className="flex gap-2 text-sm" aria-label="Filters">
          <select name="platform" defaultValue={searchParams.platform ?? ""} className="input w-auto"><option value="">All platforms</option>{platforms.map((p) => <option key={p}>{p}</option>)}</select>
          <select name="status" defaultValue={searchParams.status ?? ""} className="input w-auto"><option value="">All statuses</option><option value="issues">With issues</option><option value="healthy">Healthy</option></select>
          <button className="btn btn-ghost">Filter</button>
        </form>
      </PageHeader>
      {rows.length === 0 ? <Empty>No listings discovered yet. Run a scan from the Overview page.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="p-3">Platform</th><th>Listing</th><th>Health</th><th>Issues</th><th>Capability</th><th>Last scanned</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const info = connectorInfo(r.platform);
                return (
                  <tr key={r.id} className="border-t border-line hover:bg-slate-100">
                    <td className="p-3"><Link className="font-medium text-slate-900 hover:text-accent" href={`/dashboard/listings?id=${r.id}`}>{r.platform === "demo" ? "Demo directory" : info?.label ?? r.platform}</Link></td>
                    <td className="max-w-xs truncate text-slate-500">{r.url}</td>
                    <td>{r.status === "needs_review" ? <Badge tone="amber">Needs review</Badge> : r.lastScannedAt ? <SeverityBadge s={r.worst} /> : <Badge>Pending</Badge>}</td>
                    <td>{r.discrepancies.length}</td>
                    <td><Badge tone={info?.state === "demo_connector" ? "amber" : "zinc"}>{info?.state.replaceAll("_", " ") ?? "unknown"}</Badge></td>
                    <td className="text-slate-500">{ago(r.lastScannedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selected && <Detail listingId={selected.id} locId={loc.id} isDemo={s.isDemo} />}
    </div>
  );
}

async function Detail({ listingId, locId, isDemo }: { listingId: string; locId: string; isDemo: boolean }) {
  const db = await getDb();
  const l = (await db.select().from(schema.listings).where(eq(schema.listings.id, listingId)).get())!;
  const ex = await latestExtraction(db, l.id);
  const comps = ex ? compareAll(canonicalValues(await loadCanonical(db, locId)), observedValues(ex)) : [];
  const canDrift = isDemo && l.platform === "demo" && l.externalListingId;
  return (
    <section className="card fade-in mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-slate-900">Canonical vs published</h2>
          <p className="mt-1 break-all text-xs text-slate-500">{l.url} · identity match {Math.round(l.identityConfidence * 100)}%{l.platform === "demo" && " · simulated demo listing"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton url={`/api/listings/${l.id}/recheck`} label="Recheck listing" busyLabel="Rechecking…" />
          {l.platform === "website" && <a className="btn btn-ghost" href={l.url} target="_blank" rel="noreferrer">Open public page</a>}
          <Link className="btn btn-ghost" href="/dashboard/approvals">Review proposals</Link>
          {canDrift && <ActionButton url="/api/demo/drift" body={{ slug: l.externalListingId, field: "phone", value: "+358 40 000 0000" }} label="Simulate phone drift" className="btn btn-ghost" />}
        </div>
      </div>
      {!ex ? <p className="mt-4 text-sm text-slate-500">Not observed yet.</p> : (
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Field</th><th>Verified</th><th>Published</th><th>Result</th></tr></thead>
          <tbody>
            {comps.map((c) => (
              <tr key={c.field} className={`border-t border-line ${c.severity ? "bg-red-500/5" : ""}`}>
                <td className="py-2">{FIELD_LABELS[c.field as FieldName]}</td>
                <td>{displayValue(c.field, c.canonical)}</td>
                <td>{displayValue(c.field, c.observed)}{ex[c.field as FieldName] && <span className="block text-xs text-slate-500">observed {ago(ex[c.field as FieldName]!.observedAt)}</span>}</td>
                <td>{isMatch(c.classification) ? <Badge tone="teal">{c.classification}</Badge> : c.classification === "missing" ? <Badge>not published</Badge> : <SeverityBadge s={c.severity} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
