import { and, desc, eq, like } from "drizzle-orm";
import { schema, type DB } from "../db";
import { newId, now } from "../ids";
import { asLang, fmtDateShort, fmtHours, T } from "./i18n";
import { bundleOf, decide, getBiz, isAsk, log, sugsFor, undoSuggestion, whereItShows, type Biz, type DecideResult, type Sug } from "./service";
import { parseSms, sendSms, type SmsCmd } from "./sms";

export type SmsKind = "ask" | "auto";
const kindOf = (m: { renderedJson: unknown }): SmsKind => ((m.renderedJson as { kind?: SmsKind }).kind ?? "ask");

/** The last text of each kind we sent to this number: day numbers in a reply refer to it. */
async function lastTo(db: DB, phone: string, kind: SmsKind) {
  const rows = await db.select().from(schema.cnMessages).where(and(like(schema.cnMessages.smsTo, `%${phone}%`))).orderBy(desc(schema.cnMessages.createdAt)).limit(20).all();
  return rows.find((m) => kindOf(m) === kind) ?? null;
}
const itemsOf = async (db: DB, businessId: string, messageId: string) => (await sugsFor(db, businessId)).filter((s) => s.messageId === messageId);

function confirm(r: DecideResult, biz: Biz): string {
  const l = asLang(biz.language);
  if (!r.ok || !r.suggestion || !["applied", "auto_applied"].includes(r.suggestion.status)) return r.text;
  const live = (r.shows ?? []).filter((x) => x.live).slice(0, 3).map((x) => x.text).join(", ");
  return `✓ ${r.text}${live ? ` ${T[l].whereShows}: ${live}.` : ""}`;
}

const STILL: Record<"en" | "fi" | "sv" | "nb", (list: string, n: number) => string> = {
  en: (a, n) => `Still waiting for your pick: ${a}. Reply e.g. "${n}B".`, fi: (a, n) => `Odotan vielä valintaasi: ${a}. Vastaa esim. "${n}B".`,
  sv: (a, n) => `Väntar fortfarande på ditt val: ${a}. Svara t.ex. "${n}B".`, nb: (a, n) => `Venter fortsatt på valget ditt: ${a}. Svar f.eks. "${n}B".`,
};

/** Handles one inbound text and returns the reply to send back (as TwiML). */
export async function handleSms(db: DB, from: string, body: string): Promise<string> {
  const cmd: SmsCmd = parseSms(body);
  const undoAuto = cmd.k === "undo" && /^\s*\S+\s+A\d/i.test(body);
  const msg = await lastTo(db, from, undoAuto ? "auto" : "ask");
  if (!msg) return "Fonecta Connect: no open suggestions for this number.";
  const biz = (await getBiz(db, msg.businessId))!, l = asLang(biz.language), t = T[l];
  await log(db, biz.id, "sms_in", { body: body.slice(0, 200), cmd: cmd.k, messageId: msg.id });
  const items = await itemsOf(db, biz.id, msg.id);
  const nth = (n: number): Sug | undefined => items[n - 1];
  const bad = () => t.smsHelp;

  switch (cmd.k) {
    case "stop":
      await db.update(schema.cnBusinesses).set({ optedOut: 1 }).where(eq(schema.cnBusinesses.id, biz.id)).run();
      await log(db, biz.id, "opted_out", { via: "sms" });
      return t.smsStop;
    case "help": return bad();
    case "all": {
      const open = items.filter((s) => s.status === "sent" && !isAsk(s));
      if (!open.length) return items.some((s) => s.status === "sent") ? bad() : t.alreadyDone;
      const out: string[] = [];
      for (const s of open) { const r = await decide(db, s.id, { action: "approve" }); out.push(r.ok ? `✓ ${fmtDateShort(s.date, l)} ${fmtHours(r.suggestion?.finalHours ?? s.proposed, l)}` : `✗ ${fmtDateShort(s.date, l)}: ${r.text}`); }
      const live = whereItShows(biz, l).filter((x) => x.live).slice(0, 3).map((x) => x.text).join(", ");
      const asks = items.filter((s) => s.status === "sent" && isAsk(s)).map((s) => items.indexOf(s) + 1);
      return [...out, live ? `${t.whereShows}: ${live}.` : "", asks.length ? STILL[l](asks.map((n) => `${n} (${fmtDateShort(items[n - 1].date, l)})`).join(", "), asks[0]) : ""].filter(Boolean).join("\n");
    }
    case "decline": {
      const targets = cmd.n ? [nth(cmd.n)].filter(Boolean) as Sug[] : items.filter((s) => s.status === "sent");
      if (!targets.length) return bad();
      for (const s of targets) await decide(db, s.id, { action: "decline" });
      return t.declined;
    }
    case "undo": {
      const s = nth(cmd.n);
      if (!s) return bad();
      const r = await undoSuggestion(db, s);
      return r.ok ? t.undone : t.alreadyDone;
    }
    case "approve": case "choose": case "edit": {
      const s = nth(cmd.n);
      if (!s) return bad();
      const r = cmd.k === "approve" ? await decide(db, s.id, isAsk(s) ? { action: "choose", option: 0 } : { action: "approve" })
        : cmd.k === "choose" ? await decide(db, s.id, { action: "choose", option: cmd.opt })
        : await decide(db, s.id, { action: "edit", text: cmd.text });
      return confirm(r, biz);
    }
  }
}

/** Records a text we sent so replies can be matched to it. */
export async function recordSms(db: DB, messageId: string, to: string, sid: string) {
  // One row can be sent over several text channels (SMS, WhatsApp): keep every address so a reply on any of them finds it.
  const cur = (await db.select().from(schema.cnMessages).where(eq(schema.cnMessages.id, messageId)).get())?.smsTo;
  const all = [...new Set([...(cur ? cur.split("|") : []), to])].join("|");
  await db.update(schema.cnMessages).set({ smsTo: all, deliveredVia: to.startsWith("wa:") ? "whatsapp" : "sms", externalRef: sid }).where(eq(schema.cnMessages.id, messageId)).run();
}

/** Autopilot notice: its own message row (kind "auto") so "UNDO A1" maps to the right day, and the link shows what changed. */
export async function sendAutoSms(db: DB, biz: Biz, done: Sug[], to: string, appUrl: string, render: (b: ReturnType<typeof bundleOf>) => string) {
  const tok = [...crypto.getRandomValues(new Uint8Array(14))].map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
  const id = newId(), b = bundleOf(biz, done, `${appUrl}/d/${tok}`), text = render(b);
  await db.insert(schema.cnMessages).values({ id, businessId: biz.id, channel: "SMS", language: biz.language, token: tok, renderedJson: { title: "auto", text, kind: "auto" }, createdAt: now() }).run();
  for (const s of done) await db.update(schema.cnSuggestions).set({ messageId: id }).where(eq(schema.cnSuggestions.id, s.id)).run();
  const sid = await sendSms(to, text);
  await recordSms(db, id, to, sid);
  return id;
}
