import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema, type DB } from "../db";
import { newId, now } from "../ids";
import { DAYS } from "./yext";
import type { DayPlan } from "./types";
import type { Lang } from "./i18n";

/**
 * The floor under everything: limits the owner set themselves. They are plain code, not a model, so no suggestion,
 * photo, voice note or autopilot run can get past them. A rule can only ever restrict what we change.
 */
const HM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const RuleZ = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("never_closed"), weekday: z.enum(DAYS) }),
  z.object({ kind: z.literal("open_until"), time: HM, weekday: z.enum(DAYS).optional() }),
  z.object({ kind: z.literal("lock_date"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ kind: z.literal("lock_field"), field: z.enum(["phone", "website", "email", "description", "address"]) }),
]);
export type Rule = z.infer<typeof RuleZ>;
export type StoredRule = { id: string; rule: Rule };

export const weekdayOf = (iso: string) => DAYS[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7];
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** The last closing time of a plan in minutes after the day starts (past-midnight closes count as 24h+). */
function closesAt(p: DayPlan): number | null {
  if (p.closed) return null;
  const last = p.intervals[p.intervals.length - 1], s = mins(last.start), e = mins(last.end);
  return e <= s ? e + 1440 : e;
}

/** First rule that this plan on this weekday would break, or null. `date` (optional) is for date locks. */
export function planViolation(rules: Rule[], weekday: (typeof DAYS)[number], plan: DayPlan, date?: string): Rule | null {
  for (const r of rules) {
    if (r.kind === "lock_date" && date && r.date === date) return r;
    if (r.kind === "never_closed" && r.weekday === weekday && plan.closed) return r;
    if (r.kind === "open_until" && (!r.weekday || r.weekday === weekday)) {
      const c = closesAt(plan);
      if (c === null ? !!r.weekday : c < mins(r.time)) return r;
    }
  }
  return null;
}
export const dateViolation = (rules: Rule[], date: string, plan: DayPlan) => planViolation(rules, weekdayOf(date), plan, date);

export type RuleChange =
  | { type: "special_hours"; date: string; hours: string } | { type: "temporary_closure"; from: string; to: string }
  | { type: "regular_hours"; days: Partial<Record<string, string>> } | { type: string; [k: string]: unknown };
const toPlan = (h: string): DayPlan => (h === "closed" ? { closed: true } : { closed: false, intervals: h.split(",").map((x) => { const [start, end] = x.split("-"); return { start, end }; }) });

/** The rule an owner-requested change would break, or null. */
export function changeViolation(rules: Rule[], c: RuleChange): Rule | null {
  if (!rules.length) return null;
  if (c.type === "special_hours") return dateViolation(rules, c.date as string, toPlan(c.hours as string));
  if (c.type === "temporary_closure") {
    for (let d = c.from as string; d <= (c.to as string); d = new Date(new Date(`${d}T12:00:00Z`).getTime() + 86400_000).toISOString().slice(0, 10)) { const v = dateViolation(rules, d, { closed: true }); if (v) return v; }
    return null;
  }
  if (c.type === "regular_hours") { for (const [d, h] of Object.entries(c.days as Record<string, string>)) { const v = planViolation(rules, d as (typeof DAYS)[number], toPlan(h)); if (v) return v; } return null; }
  return rules.find((r) => r.kind === "lock_field" && r.field === c.type) ?? null;
}

const DAYNAME: Record<Lang, Record<(typeof DAYS)[number], string>> = {
  en: { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" },
  fi: { monday: "maanantaina", tuesday: "tiistaina", wednesday: "keskiviikkona", thursday: "torstaina", friday: "perjantaina", saturday: "lauantaina", sunday: "sunnuntaina" },
  sv: { monday: "måndagar", tuesday: "tisdagar", wednesday: "onsdagar", thursday: "torsdagar", friday: "fredagar", saturday: "lördagar", sunday: "söndagar" },
  nb: { monday: "mandager", tuesday: "tirsdager", wednesday: "onsdager", thursday: "torsdager", friday: "fredager", saturday: "lørdager", sunday: "søndager" },
};
const FIELD: Record<Lang, Record<string, string>> = {
  en: { phone: "phone number", website: "website", email: "e-mail", description: "description", address: "address" },
  fi: { phone: "puhelinnumero", website: "verkkosivu", email: "sähköposti", description: "kuvaus", address: "osoite" },
  sv: { phone: "telefonnummer", website: "webbplats", email: "e-post", description: "beskrivning", address: "adress" },
  nb: { phone: "telefonnummer", website: "nettside", email: "e-post", description: "beskrivelse", address: "adresse" },
};

export function ruleText(r: Rule, lang: Lang): string {
  const d = (w: (typeof DAYS)[number]) => DAYNAME[lang][w];
  switch (r.kind) {
    case "never_closed": return { en: `Never closed on ${d(r.weekday)}s`, fi: `Ei koskaan kiinni ${d(r.weekday)}`, sv: `Aldrig stängt ${d(r.weekday)}`, nb: `Aldri stengt ${d(r.weekday)}` }[lang];
    case "open_until": return { en: `Never close before ${r.time}${r.weekday ? ` on ${d(r.weekday)}s` : ""}`, fi: `Ei sulkeudu ennen klo ${r.time}${r.weekday ? ` ${d(r.weekday)}` : ""}`, sv: `Stänger aldrig före ${r.time}${r.weekday ? ` ${d(r.weekday)}` : ""}`, nb: `Stenger aldri før ${r.time}${r.weekday ? ` ${d(r.weekday)}` : ""}` }[lang];
    case "lock_date": return { en: `Do not touch ${r.date}`, fi: `Älä muuta päivää ${r.date}`, sv: `Rör inte ${r.date}`, nb: `Ikke rør ${r.date}` }[lang];
    case "lock_field": return { en: `Never change my ${FIELD.en[r.field]}`, fi: `Älä koskaan muuta: ${FIELD.fi[r.field]}`, sv: `Ändra aldrig: ${FIELD.sv[r.field]}`, nb: `Aldri endre: ${FIELD.nb[r.field]}` }[lang];
  }
}
export const blockedText = (r: Rule, lang: Lang) => ({ en: `Blocked by your rule: “${ruleText(r, "en")}”. Remove the rule first if you want this.`, fi: `Estetty sääntösi takia: “${ruleText(r, "fi")}”. Poista sääntö ensin, jos haluat tämän.`, sv: `Blockerat av din regel: “${ruleText(r, "sv")}”. Ta bort regeln först om du vill det här.`, nb: `Blokkert av regelen din: «${ruleText(r, "nb")}». Fjern regelen først hvis du vil dette.` }[lang]);

export async function loadRules(db: DB, businessId: string): Promise<StoredRule[]> {
  const rows = await db.select().from(schema.cnRules).where(eq(schema.cnRules.businessId, businessId)).all();
  return rows.flatMap((r) => { const p = RuleZ.safeParse({ kind: r.kind, ...r.paramsJson }); return p.success ? [{ id: r.id, rule: p.data }] : []; });
}
export async function addRule(db: DB, businessId: string, rule: Rule, source = "owner") {
  const { kind, ...params } = rule;
  const dup = (await loadRules(db, businessId)).find((x) => JSON.stringify(x.rule) === JSON.stringify(rule));
  if (dup) return dup.id;
  const id = newId();
  await db.insert(schema.cnRules).values({ id, businessId, kind, paramsJson: params, source, createdAt: now() }).run();
  return id;
}
export async function removeRule(db: DB, businessId: string, id: string) {
  const r = await db.delete(schema.cnRules).where(and(eq(schema.cnRules.id, id), eq(schema.cnRules.businessId, businessId))).run();
  return r;
}
