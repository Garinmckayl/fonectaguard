import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Bot, ExternalLink } from "lucide-react";
import { getDb, schema } from "@/lib/db";
import { isAdmin } from "@/lib/connect/admin";
import { bundleOf, flaggedFor, getBiz, isAsk, nextItems, optionsOf, sugsFor, whereItShows, appUrl } from "@/lib/connect/service";
import { costText, type Cost } from "@/lib/connect/cost";
import { asLang, fmtHours } from "@/lib/connect/i18n";
import { reasonText, type Reason } from "@/lib/connect/reasons";
import { emailParts, pushParts, smsText, telegramText, whatsappText } from "@/lib/connect/messages";
import { computeIssues } from "@/lib/connect/radar";
import { loadRules, ruleText } from "@/lib/connect/rules";
import { assess, POLICY } from "@/lib/connect/critical";
import { AlertsPanel } from "@/components/alerts-panel";
import { ConsoleActions } from "@/components/console-actions";
import { LanguageSwitch } from "@/components/language-switch";
import { AgentBox } from "@/components/agent-box";
import { ChannelPreview } from "@/components/channel-preview";
import { LogoMark, Wordmark } from "@/components/logo";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect Suggests · control room", robots: { index: false, follow: false } };

const TIER: Record<string, [string, string]> = { auto: ["teal", "autopilot ≥95%"], one_tap: ["blue", "one tap"], ask: ["amber", "ask: pick one"], flag: ["red", "human"] };
const STATUS: Record<string, string> = { draft: "zinc", sent: "blue", applied: "teal", auto_applied: "teal", declined: "amber", kept: "zinc", undone: "zinc", failed: "red", flagged: "red", blocked: "amber" };

export default async function Console(props: { searchParams: Promise<{ b?: string }> }) {
  if (!(await isAdmin())) return <main className="mx-auto max-w-lg px-5 py-24"><LogoMark className="h-12 w-12" /><h1 className="mt-6 font-display text-3xl font-extrabold text-ink">Control room</h1><p className="mt-2 text-slate-600">This console is for the team and the judges. Open the access link you were given.</p></main>;
  const sp = await props.searchParams;
  const db = await getDb();
  const all = await db.select().from(schema.cnBusinesses).all();
  const demo = all.filter((b) => b.id.includes("-D")).sort((a, b) => a.id.localeCompare(b.id)), rest = all.filter((b) => !b.id.includes("-D"));
  const biz = (sp.b ? await getBiz(db, sp.b) : undefined) ?? demo[0] ?? all[0];
  const counts = await db.select({ status: schema.cnSuggestions.status, n: sql<number>`count(*)` }).from(schema.cnSuggestions).groupBy(schema.cnSuggestions.status).all();
  if (!biz) return <main className="p-10">No businesses loaded.</main>;

  const lang = asLang(biz.language), sugs = await sugsFor(db, biz.id), flagged = await flaggedFor(db, biz.id);
  const mem = await db.select().from(schema.cnMemory).where(eq(schema.cnMemory.businessId, biz.id)).all();
  const events = await db.select().from(schema.cnEvents).where(eq(schema.cnEvents.businessId, biz.id)).orderBy(desc(schema.cnEvents.createdAt)).limit(14).all();
  const upcoming = await nextItems(db, biz);
  const msgs = await db.select().from(schema.cnMessages).where(eq(schema.cnMessages.businessId, biz.id)).orderBy(desc(schema.cnMessages.createdAt)).all();
  const previewItems = upcoming.length ? upcoming : sugs.filter((s) => msgs[0] && s.messageId === msgs[0].id);
  const bundle = bundleOf(biz, previewItems, `${appUrl()}/d/${msgs[0]?.token ?? "preview"}`);
  const preview = previewItems.length ? { telegram: telegramText(bundle), emailHtml: emailParts(bundle).html, emailSubject: emailParts(bundle).subject, sms: smsText(bundle), whatsapp: whatsappText(bundle), pushTitle: pushParts(bundle).title, pushBody: pushParts(bundle).body } : null;
  const radar = await computeIssues(db, biz), rules = await loadRules(db, biz.id);
  const open = sugs.filter((x) => x.action === "SUGGEST" && ["draft", "sent"].includes(x.status)).sort((a, b) => a.date.localeCompare(b.date));
  const demoAsOf = open[0] ? Date.parse(`${open[0].date}T00:00:00Z`) - 22 * 3600_000 : null;
  const assessed = open.map((x) => assess(x, biz.country, demoAsOf ?? Date.now())).filter((x): x is NonNullable<typeof x> => !!x);
  const ladder = await db.select().from(schema.cnAlerts).where(eq(schema.cnAlerts.businessId, biz.id)).orderBy(desc(schema.cnAlerts.createdAt)).limit(10).all();
  const stat = (s: string) => sugs.filter((x) => x.status === s).length;
  const bot = process.env.TELEGRAM_BOT_USERNAME ?? "fonguardbot";
  const total = counts.reduce((a, c) => a + Number(c.n), 0);
  const steps: [string, string, string][] = [["1 Detect", `${sugs.filter((s) => s.action === "SUGGEST").length} suggestions`, `${flagged.length} for a human`], ["2 Suggest", "with reasons", "from the model"], ["3 Contact", `${msgs.length} message(s)`, biz.optedOut ? "opted out" : biz.channel], ["4 Decide", `${stat("applied") + stat("auto_applied")} approved`, `${stat("declined")} declined`], ["5 Apply", `${stat("applied") + stat("auto_applied")} in Yext`, "verified + ETA"]];

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3"><Link href="/" className="flex items-center gap-2.5"><LogoMark /><Wordmark /></Link><div className="text-right"><p className="font-mono text-xs font-bold uppercase tracking-widest text-slate-500">Connect Suggests · control room</p><p className="text-xs text-slate-500">{all.length} businesses loaded · {total} suggestions · model out-of-fold score 63.3 vs baseline 54.5</p></div></header>
      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="card !p-3 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto" aria-label="Businesses">
          <p className="px-2 pb-1 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-500">Demo storylines</p>
          {demo.map((b) => <Link key={b.id} href={`/connect?b=${b.id}`} className={`block rounded-lg px-2 py-1.5 text-sm ${b.id === biz.id ? "bg-hi font-semibold text-ink" : "text-slate-700 hover:bg-slate-100"}`}><span className="font-mono text-[11px] text-slate-500">{b.id}</span><br />{b.name}</Link>)}
          <p className="px-2 pb-1 pt-3 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-500">Sample of the 3,000</p>
          {rest.slice(0, 40).map((b) => <Link key={b.id} href={`/connect?b=${b.id}`} className={`block rounded-lg px-2 py-1 text-xs ${b.id === biz.id ? "bg-hi font-semibold text-ink" : "text-slate-600 hover:bg-slate-100"}`}>{b.id} · {b.name}</Link>)}
        </aside>

        <div className="min-w-0 space-y-5">
          <section className="card-pop">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-mono text-xs text-slate-500">{biz.id} · {biz.city}, {biz.country} · {biz.segment}</p><h1 className="font-display text-3xl font-extrabold text-ink">{biz.name}</h1>{biz.story && <p className="mt-1 max-w-2xl text-sm text-slate-600">{biz.story}</p>}</div>
              <div className="flex flex-wrap gap-2"><LanguageSwitch businessId={biz.id} current={biz.language} /><Badge tone="amber">prefers {biz.channel}{biz.bestWindow ? ` · ${biz.bestWindow}h` : ""}</Badge>{biz.standing ? <Badge tone="teal">standing permission</Badge> : null}{biz.optedOut ? <Badge tone="red">opted out</Badge> : null}</div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-5">{steps.map(([t, a, b]) => <div key={t} className="rounded-xl border-[1.5px] border-ink bg-white p-3"><p className="font-display text-sm font-bold text-ink">{t}</p><p className="mt-1 text-xs text-slate-700">{a}</p><p className="text-xs text-slate-500">{b}</p></div>)}</div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><ConsoleActions businessId={biz.id} canSend={!biz.optedOut} />
              <a className="btn btn-ghost" href={`https://t.me/${bot}?start=${biz.linkCode}`} target="_blank" rel="noreferrer"><Bot className="h-4 w-4" /> {biz.telegramChatId ? "Telegram linked ✓" : "Link my Telegram as this owner"} <ExternalLink className="h-3.5 w-3.5" /></a></div>
          </section>

          <section className="card"><h2 className="font-display text-xl font-bold text-ink">Talk to the agent</h2><p className="mb-3 text-xs text-slate-500">Text, voice and photos work in Telegram; here you can type or upload a photo. It proposes, you tap, and every change is verified in Yext.</p><AgentBox businessId={biz.id} /></section>

          <div className="grid gap-5 md:grid-cols-2">
            <section className="card"><h2 className="font-display text-xl font-bold text-ink">Issue radar</h2><p className="mb-2 text-xs text-slate-500">Everything we can really detect for this business, from live checks. The owner can ask “what should I fix?” in chat.</p>
              {radar.issues.length === 0 ? <p className="text-sm text-slate-600">Nothing needs attention.</p> : <ul className="space-y-1.5 text-sm">{radar.issues.map((i) => <li key={i.code} className="flex items-start gap-2"><Badge tone={i.severity === "high" ? "red" : i.severity === "medium" ? "amber" : "zinc"}>{i.severity}</Badge><span className="text-slate-700"><b>{i.code.replace(/_/g, " ")}</b>{i.n ? ` · ${i.n}` : ""}{i.names?.length ? `: ${i.names.join(", ")}` : ""}{i.detail ? ` (next ${i.detail})` : ""}</span></li>)}</ul>}
              <p className="mt-3 text-xs text-slate-500">Watching: {radar.coverage.watching.join("; ")}. <b>Not yet:</b> {radar.coverage.notYet.join(", ")}.</p></section>
            <section className="card"><h2 className="font-display text-xl font-bold text-ink">Owner rules (the floor)</h2><p className="mb-2 text-xs text-slate-500">Hard limits the owner set. Plain code, not a model: they override suggestions, the agent and autopilot.</p>
              {rules.length === 0 ? <p className="text-sm text-slate-500">None yet. Try “never close on Fridays” in the agent box.</p> : <ul className="space-y-1 text-sm">{rules.map((r) => <li key={r.id}>🔒 {ruleText(r.rule, lang)}</li>)}</ul>}</section>
          </div>

          <section className="card"><h2 className="font-display text-xl font-bold text-ink">Critical alerts and the escalation ladder</h2>
            <p className="mb-2 text-xs text-slate-500">Score = model confidence × urgency. Critical ≥ {POLICY.critical}. Ladder: message → reminder after {POLICY.nudgeAfterH} h → voice note after {POLICY.voiceAfterH} h → phone call after {POLICY.callAfterH} h, only if score ≥ {POLICY.call}, ≥ {POLICY.callMinViews} views that day, and between 08:00 and 20:00. One call per 24 h. Opt-outs and owner rules always win. Calls go only to the demo number.</p>
            {assessed.length === 0 ? <p className="text-sm text-slate-500">No open suggestion to assess.</p> : <table className="w-full text-left text-sm"><thead className="font-mono text-[11px] uppercase text-slate-500"><tr><th className="py-1 pr-3">Date</th><th className="pr-3">Score</th><th className="pr-3">Hours left</th><th className="pr-3">Views</th><th>Level</th></tr></thead><tbody>{assessed.map((a) => <tr key={a.sugId} className="border-t border-line"><td className="py-1 pr-3 font-mono text-xs">{a.date}</td><td className="pr-3">{a.score}</td><td className="pr-3">{a.hoursUntil}</td><td className="pr-3">{a.views}</td><td><Badge tone={a.callEligible ? "red" : a.critical ? "amber" : "zinc"}>{a.callEligible ? "critical · call-eligible" : a.critical ? "critical" : "normal"}</Badge></td></tr>)}</tbody></table>}
            <p className="mt-2 text-xs text-slate-500">Shown at the demo clock{demoAsOf ? ` (${new Date(demoAsOf).toISOString().slice(0, 16).replace("T", " ")} UTC)` : ""}; the live cron uses the real clock.</p>
            <AlertsPanel businessId={biz.id} asOf={demoAsOf} asOfLabel={open[0] ? `22 h before ${open[0].date}` : null} />
            {ladder.length > 0 && <ol className="mt-3 space-y-1 font-mono text-xs text-slate-700">{ladder.map((a) => <li key={a.id}>{new Date(a.createdAt).toISOString().slice(11, 19)} · <b>{a.step}</b> → {a.outcome}{(a.detailJson as { why?: string } | null)?.why ? ` (${(a.detailJson as { why: string }).why})` : ""}</li>)}</ol>}
          </section>

          <section className="card"><h2 className="font-display text-xl font-bold text-ink">Suggestions</h2>
            <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="font-mono text-[11px] uppercase text-slate-500"><tr><th className="py-2 pr-3">Date</th><th className="pr-3">Google shows</th><th className="pr-3">Suggest</th><th className="pr-3">Conf. · tier</th><th className="pr-3">Status</th><th>Why</th></tr></thead><tbody>
              {sugs.map((s) => <tr key={s.id} className="border-t border-line align-top"><td className="py-2 pr-3 font-mono text-xs">{s.date}<br /><span className="text-slate-500">{s.dayKey}</span></td><td className="pr-3">{fmtHours(s.shown, lang)}</td><td className="pr-3 font-semibold">{s.action === "FLAG" ? "flag for a human" : isAsk(s) && !s.finalHours ? optionsOf(s).map((o) => fmtHours(o, lang)).join(" or ") + " ?" : fmtHours(s.finalHours ?? s.proposed, lang)}{s.note?.startsWith("adjusted") ? <span className="block text-[11px] font-normal text-brand-deep">adjusted after your edit</span> : null}</td><td className="pr-3">{Math.round(s.confidence * 100)}%<br /><Badge tone={(TIER[isAsk(s) ? "ask" : s.tier] ?? TIER.one_tap)[0]}>{(TIER[isAsk(s) ? "ask" : s.tier] ?? TIER.one_tap)[1]}</Badge></td><td className="pr-3"><Badge tone={STATUS[s.status] ?? "zinc"}>{s.status.replace("_", " ")}</Badge></td><td className="max-w-md text-xs text-slate-600">{(s.reasonsJson as unknown as Reason[]).slice(0, 2).map((r) => reasonText(r, lang)).join(" ")}{(() => { const c = costText(s.costJson as Cost | null, s.shown, s.proposed, "en", isAsk(s)); return c ? <span className="mt-1 block font-medium text-brand-deep">⚠ {c}</span> : null; })()}</td></tr>)}
            </tbody></table></div>
            {flagged.length > 0 && <p className="mt-3 rounded-lg border-[1.5px] border-[#9B1C12] bg-[#FFD3CC] p-3 text-sm font-medium text-[#7A140C]">Needs a human, not a message: reviews or Google edits say this business may have closed for good while its listing is still open. The owner is not contacted.</p>}
          </section>

          {preview && <section className="card"><h2 className="font-display text-xl font-bold text-ink">The message the owner gets</h2><div className="mt-3"><ChannelPreview preferred={biz.channel} p={preview} /></div></section>}

          <div className="grid gap-5 md:grid-cols-2">
            <section className="card"><h2 className="font-display text-xl font-bold text-ink">Where an approved change shows</h2><ul className="mt-3 space-y-1 text-sm">{whereItShows(biz, lang).map((x) => <li key={x.name} className={x.live ? "text-slate-700" : "text-slate-400"}>{x.live ? "•" : "◦"} {x.text}</li>)}</ul></section>
            <section className="card"><h2 className="font-display text-xl font-bold text-ink">What it has learned</h2>{mem.length === 0 ? <p className="mt-3 text-sm text-slate-500">Nothing yet: approve, edit or decline a suggestion.</p> : <ul className="mt-3 space-y-1.5 text-sm">{mem.map((m) => <li key={m.id}><b>{m.dayKey}</b>: {m.approvals} approved, {m.edits} edited, {m.declines} declined{m.closeShiftMin ? `, closing time shift ${m.closeShiftMin > 0 ? "+" : ""}${m.closeShiftMin} min` : ""}{m.lastHours ? ` · remembers ${m.lastHours}` : ""}</li>)}</ul>}</section>
          </div>

          <section className="card"><h2 className="font-display text-xl font-bold text-ink">Audit log</h2>{events.length === 0 ? <p className="mt-3 text-sm text-slate-500">No activity yet.</p> : <ol className="mt-3 space-y-1.5 font-mono text-xs text-slate-700">{events.map((e) => <li key={e.id}>{new Date(e.createdAt).toISOString().slice(11, 19)} · <b>{e.type}</b> {e.detailJson ? JSON.stringify(e.detailJson).slice(0, 140) : ""}</li>)}</ol>}</section>
        </div>
      </div>
    </main>
  );
}
