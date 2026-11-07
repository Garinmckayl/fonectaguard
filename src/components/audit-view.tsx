import { Badge, Gauge, SeverityBadge, ago } from "@/components/ui";
import { sourcesToCorrect } from "@/lib/ai-audit";
import { FIELD_LABELS, isMatch, type Classification, type FieldName } from "@/lib/compare";
import type { Attribution } from "@/lib/ai-sources";
import { displayValue } from "@/lib/format";
import type { schema } from "@/lib/db";

type Audit = typeof schema.aiAudits.$inferSelect;
type Answer = typeof schema.aiAuditAnswers.$inferSelect;

/** Model answers arrive as markdown. Render as plain text: drop emphasis marks, footnote refs and link syntax (never HTML). */
export const cleanAnswer = (t: string | null) => (t ?? "").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1").replace(/\*\*+/g, "").replace(/(?<=\S)\s*\[\d{1,2}\](?:\[\d{1,2}\])*/g, "").replace(/^#{1,4}\s+/gm, "").trim();

/** Results of one audit: scores, sources to correct, and every assistant's answer with its verdict. Shared by the dashboard and the public report. */
export function AuditView({ cur, answers, prev, against = "verified" }: { cur: Audit; answers: Answer[]; prev?: Audit; against?: "verified" | "website" }) {
  const confusedRows = answers.filter((a) => a.confusedWith);
  const byAssistant = new Map<string, Answer[]>();
  for (const a of answers) byAssistant.set(a.assistant, [...(byAssistant.get(a.assistant) ?? []), a]);
  return (
    <>
<div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="card"><Gauge value={cur.accuracy} label="Accuracy" sub={cur.factsChecked ? `${cur.factsChecked - cur.factsWrong} of ${cur.factsChecked} stated facts correct${cur.accuracy !== null && prev?.accuracy != null ? ` (${cur.accuracy - prev.accuracy >= 0 ? "+" : ""}${cur.accuracy - prev.accuracy} vs last)` : ""}` : "No checkable facts stated"} /></div>
            <div className="card"><Gauge value={cur.visibility} label="Visibility" sub="of answers actually describe this business" /></div>
            <div className="card flex flex-col justify-center"><p className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500">Wrong facts</p><p className={`font-display text-5xl font-extrabold ${cur.factsWrong ? "text-[#B4231A]" : "text-accent"}`}>{cur.factsWrong}</p><p className="text-xs text-slate-500">{cur.status === "running" ? "audit in progress" : `audited ${ago(cur.completedAt ?? cur.startedAt)}`}</p></div>
            <div className="card flex flex-col justify-center"><p className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500">Mixed up with another business</p><p className={`font-display text-5xl font-extrabold ${confusedRows.length ? "text-[#B4231A]" : "text-accent"}`}>{confusedRows.length}</p><p className="text-xs text-slate-500">{confusedRows.length ? "answers describe a lookalike" : "no lookalike answers"}</p></div>
          </div>

                    {(() => {
            const fix = sourcesToCorrect(answers);
            const unexplained = answers.flatMap((a) => (a.sourcesJson ?? []) as Attribution[]).filter((x) => x.verdict === "unknown");
            if (!fix.length && !unexplained.length) return null;
            return (
              <section className="card mb-6 !bg-hi/50">
                <h2 className="font-display text-xl font-bold text-ink">Sources to correct</h2>
                <p className="mt-1 text-xs text-slate-500">Where the wrong answers appear to come from.</p>
                {fix.length > 0 && (
                  <ul className="mt-3 space-y-2 text-sm">
                    {fix.map((f) => (
                      <li key={f.url} className="flex flex-wrap items-center gap-2">
                        <a className="font-medium underline" href={f.url} target="_blank" rel="noreferrer">{f.label}</a>
                        <Badge tone={f.monitored ? "amber" : "red"}>{f.monitored ? (f.fixable ? "monitored: approve the fix" : "monitored: needs a manual correction") : "not monitored yet"}</Badge>
                        {!f.monitored && f.manageUrl && <a className="text-xs text-accent underline" href={f.manageUrl} target="_blank" rel="noreferrer">Correct it there →</a>}
                        <span className="text-xs text-slate-600">wrong {[...f.fields].map((x) => FIELD_LABELS[x as FieldName].toLowerCase()).join(", ")} · repeated by {f.assistants.size} assistant{f.assistants.size > 1 ? "s" : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {unexplained.length > 0 && <p className="mt-3 text-xs text-slate-600">{unexplained.length} wrong fact{unexplained.length > 1 ? "s" : ""} could not be traced to a readable page. They are not on any source you monitor; see the notes below.</p>}
              </section>
            );
          })()}

          <div className="space-y-4">
            {[...byAssistant].map(([name, rows]) => (
              <section key={name} className="card fade-in">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-bold text-ink">{name}</h2>
                  <Badge tone={rows[0].webSearch ? "blue" : "zinc"}>{rows[0].webSearch ? "live web search" : "no web access"}</Badge>
                </div>
                <ul className="mt-3 space-y-4">
                  {rows.map((r) => (
                    <li key={r.id} className="text-sm">
                      <p className="ml-auto w-fit max-w-[92%] rounded-2xl rounded-br-sm border-[1.5px] border-ink bg-ink px-3.5 py-2 text-[13px] font-medium text-paper">{r.prompt}</p>
                      {r.error ? <p className="mt-1 text-xs text-red-600">No usable answer: {r.error}</p> : (
                        <>
                          <p className="mt-2 max-w-[96%] whitespace-pre-line rounded-2xl rounded-bl-sm border-[1.5px] border-ink bg-white px-4 py-3 text-[14px] leading-relaxed text-ink">{cleanAnswer(r.answer)}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {r.confusedWith ? <Badge tone="red">Describes a different business: {r.confusedWith}</Badge> : !r.mentioned && <Badge tone="amber">Did not describe your business</Badge>}
                            {(r.comparisonsJson ?? []).map((c) => (
                              <span key={c.field} className="inline-flex items-center gap-1.5 text-xs">
                                <span className="text-slate-500">{FIELD_LABELS[c.field as FieldName]}:</span>
                                {isMatch(c.classification as Classification) ? <Badge tone="teal">correct</Badge> : <SeverityBadge s={c.severity} />}
                              </span>
                            ))}
                          </div>
                          {(r.comparisonsJson ?? []).filter((c) => !isMatch(c.classification as Classification) && c.classification !== "missing").map((c) => (
                            <p key={c.field} className="mt-1 text-xs text-slate-600">Said <b>{displayValue(c.field, c.stated)}</b>; {against === "website" ? "your website says" : "verified is"} <b>{displayValue(c.field, c.expected)}</b>.</p>
                          ))}
                          {((r.sourcesJson ?? []) as Attribution[]).map((a) => (
                            <div key={a.field} className="mt-2 rounded-lg border-[1.5px] border-ink bg-hi/50 p-2.5 text-xs text-ink">
                              <p><b>{FIELD_LABELS[a.field as FieldName]}:</b> {a.advice}</p>
                              {a.correctIn.length > 0 && <p className="mt-1 text-slate-500">Correct on: {a.correctIn.map((c) => c.name ?? c.platform).join(", ")}</p>}
                              {a.pages.length > 0 && <p className="mt-1 text-slate-500">Checked: {a.pages.map((p) => `${new URL(p.url).hostname} (${p.state.replace("_", " ")})`).join(", ")}</p>}
                            </div>
                          ))}
                          {!!r.citationsJson?.length && (
                            <p className="mt-2 text-xs text-slate-500">Sources cited: {r.citationsJson.map((u) => { let h = u; try { h = new URL(u).hostname; } catch {} return <a key={u} className="mr-2 underline" href={u} target="_blank" rel="noreferrer">{h}</a>; })}</p>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">Answers come from the models named above via OpenRouter, not from the consumer apps (ChatGPT, Gemini, etc.), and can vary run to run. Only facts an assistant stated are judged; leaving something out is never counted as wrong. To correct AI answers, fix the sources they cite, then run the audit again.</p>
    </>
  );
}

function Stat({ label, value, sub, delta }: { label: string; value: string; sub: string; delta?: number | null }) {
  return (
    <div className="card">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}{delta ? <span className={`ml-2 text-sm font-medium ${delta > 0 ? "text-accent" : "text-red-600"}`}>{delta > 0 ? "+" : ""}{delta}</span> : null}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}
