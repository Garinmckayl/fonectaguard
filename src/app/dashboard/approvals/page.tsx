import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { getSession, canWrite } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getLocation } from "@/lib/queries";
import { Badge, Empty, PageHeader, ago } from "@/components/ui";
import { ActionButton } from "@/components/actions";
import { ApprovalActions } from "@/components/approval-actions";
import { FIELD_LABELS, type FieldName } from "@/lib/compare";
import { connectorInfo } from "@/lib/connectors";

const TABS: Record<string, { label: string; statuses: string[] }> = {
  needs: { label: "Needs approval", statuses: ["awaiting_approval", "reopened"] },
  progress: { label: "In progress", statuses: ["approved", "applying", "verifying", "manual_submission_required"] },
  resolved: { label: "Resolved", statuses: ["resolved", "superseded"] },
  rejected: { label: "Rejected", statuses: ["rejected"] },
  failed: { label: "Failed", statuses: ["failed"] },
};

export default async function Approvals({ searchParams }: { searchParams: { tab?: string } }) {
  const s = (await getSession())!;
  const db = getDb();
  const loc = getLocation(db, s.orgId);
  if (!loc) return <Empty>No business yet.</Empty>;
  const tab = TABS[searchParams.tab ?? ""] ? searchParams.tab! : "needs";
  const discs = new Map(db.select().from(schema.discrepancies).where(eq(schema.discrepancies.locationId, loc.id)).all().map((d) => [d.id, d]));
  const all = discs.size ? db.select().from(schema.repairProposals).where(inArray(schema.repairProposals.discrepancyId, [...discs.keys()])).orderBy(desc(schema.repairProposals.createdAt)).all() : [];
  const counts = Object.fromEntries(Object.entries(TABS).map(([k, t]) => [k, all.filter((p) => t.statuses.includes(p.status)).length]));
  const rows = all.filter((p) => TABS[tab].statuses.includes(p.status));
  return (
    <div>
      <PageHeader title="Resolution Center" sub="Nothing changes externally without your explicit approval. Fixes are verified after they are applied." />
      <div role="tablist" className="mb-5 flex flex-wrap gap-2">
        {Object.entries(TABS).map(([k, t]) => (
          <Link key={k} role="tab" aria-selected={k === tab} href={`/dashboard/approvals?tab=${k}`} className={`btn ${k === tab ? "btn-primary" : "btn-ghost"}`}>{t.label} ({counts[k]})</Link>
        ))}
      </div>
      {rows.length === 0 ? <Empty>No proposals in this tab.</Empty> : (
        <ul className="space-y-4">
          {rows.map((p) => {
            const c = p.proposedChangeJson, ev = p.evidenceJson as { listingUrl?: string; observed?: { excerpt?: string; observedAt?: number }; corroboration?: { source: string; url: string; value: string }[]; manageUrl?: string | null };
            const label = connectorInfo(p.targetPlatform)?.label ?? p.targetPlatform;
            const attempts = db.select().from(schema.repairAttempts).where(eq(schema.repairAttempts.proposalId, p.id)).all();
            return (
              <li key={p.id} className="card fade-in">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-white">{label} — {FIELD_LABELS[c.field as FieldName]}</h3>
                  <div className="flex gap-2"><Badge tone="teal">AI confidence {Math.round(p.confidence * 100)}%</Badge><Badge tone="blue">{p.status.replaceAll("_", " ")}</Badge><Badge>{c.capability === "write" ? "write-enabled" : "manual submission"}</Badge></div>
                </div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3"><p className="text-xs text-zinc-500">Current</p><span className="line-through decoration-red-400/50">{String(c.oldValue)}</span></div>
                  <div className="rounded-lg border border-accent/20 bg-accent/5 p-3"><p className="text-xs text-zinc-500">Correct</p>{String(c.newValue)}</div>
                </div>
                <p className="mt-3 text-sm text-zinc-300">{p.explanation}</p>
                <details className="mt-2 text-sm text-zinc-400">
                  <summary className="cursor-pointer text-accent">Review evidence</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>Source: <a className="underline" href={ev.listingUrl}>{ev.listingUrl}</a>{ev.observed?.excerpt && <> — observed “{ev.observed.excerpt}” {ago(ev.observed.observedAt)}</>}</li>
                    {ev.corroboration?.map((x, i) => <li key={i}>Corroborated by {x.source.replaceAll("_", " ")}: {x.value} (<a className="underline" href={x.url}>{x.url}</a>)</li>)}
                    <li>Risk: {c.risk}</li>
                  </ul>
                </details>
                {p.status === "awaiting_approval" || p.status === "reopened" ? (
                  p.status === "reopened" ? <p className="mt-3 text-sm text-amber-300">The published value changed after approval. Run a scan to regenerate a proposal.</p> :
                  <div className="mt-4"><ApprovalActions id={p.id} current={String(c.newValue)} canAct={canWrite(s.role)} />{c.capability !== "write" && ev.manageUrl && <p className="mt-2 text-xs text-zinc-500">Manual submission: <a className="underline" href={ev.manageUrl} target="_blank" rel="noreferrer">open {label} management</a></p>}</div>
                ) : null}
                {p.status === "failed" && <div className="mt-3"><ActionButton url={`/api/repairs/${p.id}/retry`} label="Retry safely" busyLabel="Retrying…" /></div>}
                {p.approvedAt && <p className="mt-3 text-xs text-zinc-500">Approved by {p.approvedBy === s.userId ? s.userName : p.approvedBy} {ago(p.approvedAt)}{attempts.length ? ` · ${attempts.length} execution attempt(s): ${attempts.map((a) => a.status).join(", ")}` : ""}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
