import Link from "next/link";
import { and, eq, notInArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { githubConnection } from "@/lib/connectors";
import { getDb, schema } from "@/lib/db";
import { getLocation } from "@/lib/queries";
import { Empty, PageHeader } from "@/components/ui";
import { AuditView } from "@/components/audit-view";
import { ActionButton } from "@/components/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { auditAnswers, finalizeAudit, latestAudits } from "@/lib/ai-audit";
import type { Attribution } from "@/lib/ai-sources";

export default async function AiSearch() {
  const s = (await getSession())!;
  const db = await getDb();
  const loc = await getLocation(db, s.orgId);
  if (!loc) return <Empty>No business yet.</Empty>;
  let audits = await latestAudits(db, loc.id, 8);
  // A queue job that never reported must not leave the page "running" forever.
  if (audits[0]?.status === "running" && Date.now() - audits[0].startedAt > 150_000) { await finalizeAudit(db, audits[0].id, true); audits = await latestAudits(db, loc.id, 8); }
  const cur = audits[0];
  const answers = cur ? await auditAnswers(db, cur.id) : [];
  const running = cur?.status === "running";
  const prev = audits.find((a, i) => i > 0 && a.status === "completed");
  const siteIssue = (await db.select({ id: schema.discrepancies.id }).from(schema.discrepancies).innerJoin(schema.listings, eq(schema.listings.id, schema.discrepancies.listingId)).where(and(eq(schema.discrepancies.locationId, loc.id), eq(schema.listings.platform, "website"), notInArray(schema.discrepancies.status, ["resolved", "dismissed"]))).get());
  const connected = !!(await githubConnection(db, s.orgId));
  const traced = answers.some((a) => ((a.sourcesJson ?? []) as Attribution[]).some((x) => x.verdict === "fix_monitored"));
  const prevTraced = prev ? (await auditAnswers(db, prev.id)).some((a) => ((a.sourcesJson ?? []) as Attribution[]).some((x) => x.verdict === "fix_monitored")) : false;
  const everWrong = audits.some((a) => a.status === "completed" && a.factsWrong > 0);
  const steps: [string, string, string, boolean][] = [
    ["Connect your GitHub Pages website", "Proves ownership and lets approved fixes be committed for real.", "/dashboard/connections", connected],
    ["Introduce a deliberate error on your site (real commit), then rescan", "Hours or phone on the live site become stale, like a real out-of-date page.", "/dashboard/connections", !!siteIssue || everWrong],
    ["Run the AI audit", "Real web-searching assistants are asked about your business; if they repeat the stale value, the audit traces it to your page.", "/dashboard/ai-search", traced || everWrong],
    ["Approve the fix", "FonectaGuard commits the correction, waits for the site to redeploy and re-reads it.", "/dashboard/approvals", everWrong && !siteIssue],
    ["Run the audit again", "The same questions are asked again; the stale page should no longer be the cause. Engines that cache pages may need time to catch up.", "/dashboard/ai-search", prevTraced && !traced && !siteIssue && cur?.status === "completed"],
  ];

  return (
    <div>
      <PageHeader title="AI search audit" sub="What AI assistants actually say about your business, checked against your verified profile.">
        <ActionButton url={`/api/businesses/${loc.id}/ai-audit`} label={cur ? "Run audit again" : "Run audit"} busyLabel="Starting…" className="btn btn-primary" />
      </PageHeader>

      <AutoRefresh active={running} />
      {running && (
        <div role="status" className="card mb-6 flex items-center gap-3 text-sm text-slate-700">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Asking the assistants: {new Set(answers.map((a) => a.assistant)).size} of {cur!.assistantsTotal} have reported. This page updates by itself.
        </div>
      )}
      {connected && (
        <details className="card mb-6" open={!cur || cur.factsWrong > 0 || !steps[4][3]}>
          <summary className="cursor-pointer font-medium text-slate-900">Guided scenario: stale website → wrong AI answer → fixed ({steps.filter((x) => x[3]).length}/{steps.length})</summary>
          <ol className="mt-3 space-y-2 text-sm">
            {steps.map(([t, d, href, done], i) => (
              <li key={t} className="flex gap-3"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${done ? "bg-accent text-white" : "bg-slate-100 text-slate-500"}`}>{done ? "✓" : i + 1}</span>
                <span><Link className="font-medium text-slate-900 underline" href={href}>{t}</Link><span className="block text-xs text-slate-500">{d}</span></span></li>
            ))}
          </ol>
        </details>
      )}

      {!cur ? (
        <Empty>No audit yet. Running one asks several AI assistants the questions customers ask (opening hours, phone, address, website) and compares each answer with your verified information.</Empty>
      ) : cur.status === "running" && !answers.length ? null : cur.status === "failed" ? (
        <div role="alert" className="card border-red-200 bg-red-50 text-sm text-red-700">The last audit failed: {String((cur.errorJson as { message?: string } | null)?.message ?? "no assistant returned a usable answer")}. Check that OPENROUTER_API_KEY is configured.</div>
      ) : (
        <>
          <AuditView cur={cur} answers={answers} prev={prev} against={cur.basis as "verified" | "website"} />
        </>
      )}
    </div>
  );
}
