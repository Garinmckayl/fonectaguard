import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/logo";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { auditAnswers, finalizeAudit } from "@/lib/ai-audit";
import { loadCanonical } from "@/lib/canonical";
import { FIELD_LABELS, type FieldName } from "@/lib/compare";
import { displayValue } from "@/lib/format";
import { AuditView } from "@/components/audit-view";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge } from "@/components/ui";
import { PublicSourcesPanel } from "@/components/public-sources-panel";
import type { PublicSources } from "@/lib/public-sources";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI search check · FonectaGuard", robots: { index: false, follow: false } };

export default async function Report(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const db = await getDb();
  let audit = await db.select().from(schema.aiAudits).where(eq(schema.aiAudits.id, id)).get();
  // Only public website checks are shareable; an owner's verified audit is never exposed here.
  if (!audit || audit.basis !== "website") notFound();
  if (audit.status === "running" && Date.now() - audit.startedAt > 150_000) { await finalizeAudit(db, audit.id, true); audit = (await db.select().from(schema.aiAudits).where(eq(schema.aiAudits.id, id)).get())!; }
  const loc = (await db.select().from(schema.businessLocations).where(eq(schema.businessLocations.id, audit.locationId)).get());
  if (!loc) notFound();
  const answers = await auditAnswers(db, audit.id);
  const canon = await loadCanonical(db, loc.id);
  const session = await getSession();
  const mine = session?.orgId === loc.organizationId;
  const running = audit.status === "running";
  const sourcesPending = !audit.publicSourcesJson && Date.now() - audit.startedAt < 150_000;
  const confused = answers.filter((a) => a.confusedWith).length;
  const done = audit.status === "completed";

  const headline = running ? `Asking AI assistants about ${loc.businessName}…`
    : audit.status === "failed" ? "The check could not complete"
    : audit.factsWrong > 0 ? `AI assistants are giving wrong information about ${loc.businessName}`
    : confused > 0 ? `AI assistants mix ${loc.businessName} up with another business`
    : (audit.visibility ?? 0) === 0 ? `AI assistants could not find ${loc.businessName}`
    : `AI assistants describe ${loc.businessName} correctly`;
  const tone = running ? "text-slate-900" : audit.factsWrong > 0 || confused > 0 ? "text-red-700" : (audit.visibility ?? 0) === 0 ? "text-amber-700" : "text-emerald-700";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5"><LogoMark /><Wordmark /></Link>
        <Link href="/" className="btn btn-ghost">Check another business</Link>
      </header>

      <p className="font-mono text-xs font-bold uppercase tracking-widest text-slate-500">AI search check · {loc.businessName}{loc.city ? `, ${loc.city}` : ""}</p>
      <h1 className={`mt-2 max-w-4xl font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl ${tone}`}>{headline}</h1>
      {done && <p className="mt-2 max-w-3xl text-slate-600">We asked {audit.assistantsTotal} real AI assistants the questions customers ask (opening hours, phone, address, website) and compared every answer with what {loc.website ? new URL(loc.website).hostname : "the business website"} says.</p>}

      <AutoRefresh active={running || sourcesPending} />
      {running && (
        <div role="status" className="card mt-6 flex items-center gap-3 text-sm text-slate-700">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          {new Set(answers.map((a) => a.assistant)).size} of {audit.assistantsTotal} assistants have answered. This page updates by itself, usually within a minute.
        </div>
      )}

      <section className="card mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-ink">Reference: what the website says</h2>
          <Badge tone="amber">unverified, read from the public site</Badge>
        </div>
        <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {(["name", "address", "phone", "hours", "website"] as FieldName[]).filter((f) => canon[f]).map((f) => (
            <div key={f} className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">{FIELD_LABELS[f]}</dt><dd className="break-words text-slate-900">{displayValue(f, canon[f]!.value)}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">If the website itself is out of date, the owner can correct it after verifying ownership. Nothing is ever changed without the owner&apos;s approval.</p>
      </section>

      {audit.publicSourcesJson ? <PublicSourcesPanel data={audit.publicSourcesJson as PublicSources} /> : sourcesPending ? <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />Checking Fonecta, OpenStreetMap and the Trade Register…</p> : null}

      {audit.status === "failed" ? (
        <div role="alert" className="card mt-6 border-red-200 bg-red-50 text-sm text-red-700">{String((audit.errorJson as { message?: string } | null)?.message ?? "No assistant returned a usable answer.")} Please try again in a minute.</div>
      ) : answers.length > 0 && (
        <div className="mt-6"><AuditView cur={audit} answers={answers} against="website" /></div>
      )}

      {done && (
        <section className="card-pop mt-8 flex flex-wrap items-center justify-between gap-4 !bg-hi">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Keep it right, automatically</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">Verify you own the site and FonectaGuard watches the directories and pages these assistants read, proposes the exact corrections, and re-checks after you approve each one.</p>
          </div>
          <Link href={mine ? "/dashboard/ai-search" : "/login"} className="btn btn-primary">{mine ? "Open my dashboard" : "Monitor this business"} <ArrowRight className="h-4 w-4" /></Link>
        </section>
      )}
      <p className="mt-6 text-xs text-slate-500">Answers come from real AI models reached through OpenRouter (Perplexity Sonar, and GPT-4o mini with and without live web search), not from the consumer apps, and can vary between runs. Only facts an assistant stated are judged.</p>
    </main>
  );
}
