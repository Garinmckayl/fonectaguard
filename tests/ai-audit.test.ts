import { describe, it, expect, beforeEach, vi } from "vitest";
import { schema, type DB } from "@/lib/db";
import { openTestDb } from "./helpers";
import { BIZ, createWorkspace } from "./fixtures";
import { judgeAnswer, scoreAudit, runAiAudit, DEFAULT_ASSISTANTS } from "@/lib/ai-audit";
import { parseHours } from "@/lib/normalize";
import { newId } from "@/lib/ids";

const canon = { phone: "+358401234567", address: "Fleminginkatu 12, Helsinki", hours: parseHours("Mon-Sun 08:00-22:00") };

describe("judgeAnswer", () => {
  it("flags wrong stated facts, accepts formatting variants, ignores unstated ones", () => {
    const v = judgeAnswer({ mentioned: true, phone: "040 123 9999", address: "Fleminginkatu 12, Helsinki" }, ["phone", "address", "hours"], canon);
    expect(v.map((x) => [x.field, x.classification])).toEqual([["phone", "likely"], ["address", "exact"]]);
    expect(v[0].severity).toBe("high");
  });
});

describe("scoreAudit", () => {
  it("does not count unstated or unanswered as wrong, and reports visibility", () => {
    const s = scoreAudit([
      { mentioned: true, verdicts: [{ field: "phone", classification: "exact", severity: null, stated: "", expected: "", explanation: "" }, { field: "hours", classification: "likely", severity: "high", stated: "", expected: "", explanation: "" }] },
      { mentioned: false, verdicts: [] },
      { mentioned: false, error: "OpenRouter 500", verdicts: [] },
    ]);
    expect(s).toMatchObject({ checked: 2, wrong: 1, accuracy: 50, visibility: 50 });
  });
  it("returns null accuracy when nothing checkable was stated", () => {
    expect(scoreAudit([{ mentioned: false, verdicts: [] }]).accuracy).toBeNull();
  });
});

describe("runAiAudit", () => {
  let db: DB, locId: string;
  beforeEach(async () => {
    process.env.OPENROUTER_API_KEY = "test";
    db = openTestDb();
    locId = (await createWorkspace(db)).locId;
  });
  const mockLlm = (ask: (model: string) => string) => vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => {
    const b = JSON.parse(init.body);
    const isExtract = b.messages[0].content.startsWith("You read an AI assistant's answer");
    const content = isExtract
      ? JSON.stringify(b.messages[1].content.includes("closes at 20") ? { mentioned: true, hours: "Mon-Sun 08:00-20:00" } : b.messages[1].content.includes("no information") ? { mentioned: false, phone: "+358 99 000 0000" } : { mentioned: true, phone: BIZ.phone })
      : ask(b.model);
    return new Response(JSON.stringify({ citations: isExtract ? [] : ["https://example.org/x"], choices: [{ message: { content } }] }), { status: 200 });
  });

  it("stores per-assistant answers, catches a wrong fact, and ignores facts from 'I don't know' answers", async () => {
    mockLlm((m) => (m === "perplexity/sonar" ? "It closes at 20:00 daily." : m.endsWith(":online") ? "I have no information about that business." : "Call " + BIZ.phone));
    const { auditId } = await runAiAudit(db, locId, DEFAULT_ASSISTANTS);
    const audit = (await db.select().from(schema.aiAudits).get())!;
    expect(audit.id).toBe(auditId);
    expect(audit.status).toBe("completed");
    const rows = await db.select().from(schema.aiAuditAnswers).all();
    expect(rows).toHaveLength(9);
    const wrongHours = rows.filter((r) => r.model === "perplexity/sonar" && r.questionKey === "hours")[0];
    expect(wrongHours.comparisonsJson?.[0]).toMatchObject({ field: "hours", classification: "likely" });
    expect(rows.filter((r) => r.model.endsWith(":online")).every((r) => !r.mentioned && !r.comparisonsJson?.length)).toBe(true);
    expect(audit.factsWrong).toBeGreaterThan(0);
    expect(audit.visibility).toBe(67);
  });

  it("does not score answers about a different business with a similar name as wrong facts", async () => {
    vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      const sys = b.messages[0].content as string, user = b.messages[1].content as string;
      const content = !sys.startsWith("You read an AI assistant's answer") ? (user.includes("phone number") ? "It is at Other Road 9, Oulu, tel +358 40 999 0000." : "That is a roaster in Japan open 11:00-20:00.")
        : user.includes("Japan") ? JSON.stringify({ mentioned: true, other_business: true, other_business_name: "a roaster in Japan", hours: "Mon-Sun 11:00-20:00" })
        : JSON.stringify({ mentioned: true, name: BIZ.name, address: "Other Road 9, Oulu", phone: "+358 40 999 0000" });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    await runAiAudit(db, locId, DEFAULT_ASSISTANTS.filter((a) => a.id === "gpt"));
    const rows = await db.select().from(schema.aiAuditAnswers).all();
    expect(rows.filter((r) => r.confusedWith)).toHaveLength(3); // model-flagged (hours, overview) + deterministic identity reject (contact)
    expect(rows.every((r) => !r.mentioned && !(r.comparisonsJson ?? []).length)).toBe(true);
    const audit = (await db.select().from(schema.aiAudits).get())!;
    expect(audit).toMatchObject({ status: "completed", factsWrong: 0, visibility: 0 });
  });

  it("a single stale phone is a wrong fact, not a different business", async () => {
    vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => {
      const sys = JSON.parse(init.body).messages[0].content as string;
      const content = sys.startsWith("You read an AI assistant's answer") ? JSON.stringify({ mentioned: true, name: BIZ.name, address: "Fleminginkatu 12, Helsinki", phone: "+358 40 999 0000" }) : "Call +358 40 999 0000.";
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    await runAiAudit(db, locId, DEFAULT_ASSISTANTS.filter((a) => a.id === "gpt"));
    const rows = await db.select().from(schema.aiAuditAnswers).all();
    expect(rows.some((r) => r.confusedWith)).toBe(false);
    expect((await db.select().from(schema.aiAudits).get())!.factsWrong).toBeGreaterThan(0);
  });

  it("marks the audit failed when every call errors", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 500 }));
    await runAiAudit(db, locId, DEFAULT_ASSISTANTS);
    expect((await db.select().from(schema.aiAudits).get())!.status).toBe("failed");
  });
});

import { classifyKnown, decide, stateForPage } from "@/lib/ai-sources";
import { extractFromRaw } from "@/lib/extract";

describe("source attribution", () => {
  const stale = parseHours("Mon-Sun 08:00-20:00"), good = parseHours("Mon-Sun 08:00-22:00");
  it("separates monitored sources that carry the stale value from correct ones", () => {
    const r = classifyKnown("hours", stale, good, [
      { platform: "google", url: "https://maps.example/x", observed: { hours: good } },
      { platform: "demoyellow", url: "https://yellow.example/x", observed: { hours: stale } },
      { platform: "website", url: "https://s.example", observed: {} },
    ]);
    expect(r.correctIn.map((x) => x.platform)).toEqual(["google"]);
    expect(r.staleIn.map((x) => x.platform)).toEqual(["demoyellow"]);
  });
  it("Google Maps correct but AI stale: names an unmonitored cited page to fix", () => {
    const pages = [{ url: "https://oldblog.example/post", origin: "cited" as const, state: stateForPage("hours", stale, good, extractFromRaw({ hours: "Mon-Sun 08:00-20:00" }, "u", 1)) }];
    expect(pages[0].state).toBe("stale");
    expect(decide({ field: "hours", staleIn: [], correctIn: [{ platform: "google", url: "g", name: "Google" }], pages })).toMatchObject({ verdict: "fix_unmonitored" });
  });
  it("says so honestly when nothing explains the wrong answer", () => {
    const d = decide({ field: "hours", staleIn: [], correctIn: [{ platform: "google", url: "g", name: "Google" }], pages: [] });
    expect(d.verdict).toBe("unknown");
    expect(d.advice).toContain("Google");
  });
  it("flags a monitored stale listing as the one to fix", () => {
    expect(decide({ field: "hours", staleIn: [{ platform: "demoyellow", url: "y", name: "Y", fixable: true }], correctIn: [], pages: [] }).verdict).toBe("fix_monitored");
  });
});

describe("hours without days", () => {
  it("are not judged: a bare time range cannot be compared with a weekly schedule", () => {
    expect(judgeAnswer({ mentioned: true, hours: "11:00-14:30" }, ["hours"], canon)).toEqual([]);
    expect(judgeAnswer({ mentioned: true, hours: "Mon-Sun 08:00-20:00" }, ["hours"], canon)[0]).toMatchObject({ classification: "likely" });
  });
});

import { enqueueDueAudits } from "@/lib/ai-audit";
describe("scheduled audits", () => {
  it("run weekly for verified, confirmed businesses only, and notify the owner about wrong answers", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const db = openTestDb();
    const ws = await createWorkspace(db);
    vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => {
      const sys = JSON.parse(init.body).messages[0].content as string;
      const content = sys.startsWith("You read an AI assistant's answer") ? JSON.stringify({ mentioned: true, phone: "+358 9 999 0000" }) : "Call +358 9 999 0000.";
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    expect(await enqueueDueAudits(db)).toHaveLength(1);
    expect(await enqueueDueAudits(db)).toHaveLength(0); // already audited this week
    expect(await enqueueDueAudits(db, Date.now() + 8 * 86400e3)).toHaveLength(1);
    const n = await db.select().from(schema.notifications).all();
    expect(n.some((x) => x.type === "ai_answers_wrong" && x.userId === ws.userId)).toBe(true);
  });
  it("skips a business whose details are still unconfirmed website reads", async () => {
    const db = openTestDb();
    const ws = await createWorkspace(db);
    const { verifyProfile, UNCONFIRMED_SOURCE } = await import("@/lib/canonical");
    await verifyProfile(db, ws.locId, ws.userId, { phone: "+358 9 111 2222" }, UNCONFIRMED_SOURCE);
    expect(await enqueueDueAudits(db)).toHaveLength(0);
  });
});
