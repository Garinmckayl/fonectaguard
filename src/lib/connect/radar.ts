import { desc, eq } from "drizzle-orm";
import { schema, type DB } from "../db";
import { asLang, type Lang } from "./i18n";
import { entityId, ensureMirror, sugsFor, type Biz } from "./service";
import { getEntity, type YextEntity } from "./yext";

/**
 * Issue Radar: every kind of problem we can actually detect for one business, in one list.
 * Each issue comes from a real check (the hours model, the live Yext profile, the publishers' connection state,
 * the last AI-assistant audit); nothing here is guessed or filled in. `coverage` says what is not watched yet.
 */
export type IssueCode = "hours_waiting" | "closed_for_good" | "blocked_by_rule" | "profile_missing" | "listing_off" | "ai_wrong" | "ai_confused" | "ai_unchecked";
export interface Issue { code: IssueCode; severity: "high" | "medium" | "low"; n?: number; detail?: string; names?: string[] }

const PROFILE_FIELDS: [string, (e: YextEntity) => boolean][] = [["phone", (e) => !!e.mainPhone], ["website", (e) => !!e.websiteUrl?.url], ["description", (e) => !!e.description], ["regular hours", (e) => !!e.hours && ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].some((d) => !!(e.hours as Record<string, unknown>)[d])]];
const AI_FRESH_MS = 30 * 86400_000;

export interface Radar { issues: Issue[]; coverage: { watching: string[]; notYet: string[] } }

export async function computeIssues(db: DB, biz: Biz, opts: { live?: boolean } = {}): Promise<Radar> {
  const issues: Issue[] = [];
  const sugs = await sugsFor(db, biz.id);
  const waiting = sugs.filter((s) => s.action === "SUGGEST" && ["draft", "sent"].includes(s.status));
  if (waiting.length) issues.push({ code: "hours_waiting", severity: "high", n: waiting.length, detail: waiting.map((s) => s.date).sort()[0] });
  const flagged = sugs.filter((s) => s.action === "FLAG").length;
  if (flagged) issues.push({ code: "closed_for_good", severity: "high", n: flagged });
  const blocked = sugs.filter((s) => s.status === "blocked").length;
  if (blocked) issues.push({ code: "blocked_by_rule", severity: "low", n: blocked });

  if (opts.live !== false) {
    try {
      await ensureMirror(biz);
      const e = await getEntity(entityId());
      const missing = PROFILE_FIELDS.filter(([, ok]) => !ok(e)).map(([n]) => n);
      if (missing.length) issues.push({ code: "profile_missing", severity: missing.length > 1 ? "medium" : "low", n: missing.length, names: missing });
    } catch { /* radar still answers without the live profile */ }
  }
  const off = ((biz.publishersJson ?? []) as { name: string; status: string }[]).filter((p) => p.status === "OPTED_OUT" || p.status === "UNAVAILABLE").map((p) => p.name);
  if (off.length) issues.push({ code: "listing_off", severity: "medium", n: off.length, names: off });

  const last = (await db.select().from(schema.cnEvents).where(eq(schema.cnEvents.businessId, biz.id)).orderBy(desc(schema.cnEvents.createdAt)).all()).find((x) => x.type === "agent_presence");
  if (!last || Date.now() - last.createdAt > AI_FRESH_MS) issues.push({ code: "ai_unchecked", severity: "low" });
  else {
    const rows = ((last.detailJson as { assistants?: { a: string; wrong: number; confused: string | null }[] } | null)?.assistants ?? []);
    const wrong = rows.filter((r) => r.wrong > 0), confused = rows.filter((r) => r.confused);
    if (wrong.length) issues.push({ code: "ai_wrong", severity: "high", n: wrong.length, names: wrong.map((r) => r.a) });
    if (confused.length) issues.push({ code: "ai_confused", severity: "high", n: confused.length, names: confused.map((r) => r.a) });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { issues, coverage: { watching: ["opening hours for special days (statistical model)", "profile completeness (live from the listing source)", "which publishers are connected", "what AI assistants say (on request / weekly)"], notYet: ["photo freshness and quality", "review replies", "menu and price changes"] } };
}

const D: Record<Lang, { none: string; head: string; line: (i: Issue) => string; ask: string; notYet: string }> = {
  en: {
    none: "Nothing needs your attention right now.", head: "What I found:", ask: "Tell me which one to fix first, or just say it (for example “closed 24 Dec”).", notYet: "Not watched yet:",
    line: (i) => ({ hours_waiting: () => `• ${i.n} opening-hours change${i.n! > 1 ? "s" : ""} waiting for your decision (next: ${i.detail}).`, closed_for_good: () => `• ${i.n} listing${i.n! > 1 ? "s" : ""} may show you as open although reviews suggest otherwise: a person at Connect will check it.`, blocked_by_rule: () => `• ${i.n} suggestion${i.n! > 1 ? "s were" : " was"} held back by your own rules.`, profile_missing: () => `• Your profile is missing: ${i.names!.join(", ")}.`, listing_off: () => `• Not connected, so not updated: ${i.names!.join(", ")}.`, ai_wrong: () => `• ${i.names!.join(", ")} gave wrong details about you.`, ai_confused: () => `• ${i.names!.join(", ")} mixed you up with another business.`, ai_unchecked: () => "• I haven't checked what AI assistants say about you yet. Ask “how is my online presence?”." })[i.code](),
  },
  fi: {
    none: "Mikään ei kaipaa huomiotasi juuri nyt.", head: "Tämän löysin:", ask: "Kerro, mikä korjataan ensin, tai sano suoraan (esim. “kiinni 24.12.”).", notYet: "Ei vielä seurannassa:",
    line: (i) => ({ hours_waiting: () => `• ${i.n} aukioloaikamuutosta odottaa päätöstäsi (seuraava: ${i.detail}).`, closed_for_good: () => `• ${i.n} listausta voi näyttää sinut avoinna, vaikka arvostelut viittaavat muuhun: Connectin työntekijä tarkistaa asian.`, blocked_by_rule: () => `• ${i.n} ehdotusta pidätettiin omien sääntöjesi takia.`, profile_missing: () => `• Profiilistasi puuttuu: ${i.names!.join(", ")}.`, listing_off: () => `• Ei yhdistetty, joten ei päivity: ${i.names!.join(", ")}.`, ai_wrong: () => `• ${i.names!.join(", ")} antoi sinusta vääriä tietoja.`, ai_confused: () => `• ${i.names!.join(", ")} sekoitti sinut toiseen yritykseen.`, ai_unchecked: () => "• En ole vielä tarkistanut, mitä tekoälyavustajat kertovat sinusta. Kysy “miltä verkkonäkyvyyteni näyttää?”." })[i.code](),
  },
  sv: {
    none: "Inget behöver din uppmärksamhet just nu.", head: "Det här hittade jag:", ask: "Säg vilket som ska fixas först, eller säg det direkt (till exempel “stängt 24 dec”).", notYet: "Bevakas inte ännu:",
    line: (i) => ({ hours_waiting: () => `• ${i.n} ändring${i.n! > 1 ? "ar" : ""} av öppettider väntar på ditt beslut (nästa: ${i.detail}).`, closed_for_good: () => `• ${i.n} lista${i.n! > 1 ? "r" : ""} kan visa dig som öppen fast recensioner tyder på annat: en person på Connect kollar det.`, blocked_by_rule: () => `• ${i.n} förslag hölls tillbaka av dina egna regler.`, profile_missing: () => `• Din profil saknar: ${i.names!.join(", ")}.`, listing_off: () => `• Inte anslutna, så inte uppdaterade: ${i.names!.join(", ")}.`, ai_wrong: () => `• ${i.names!.join(", ")} gav fel uppgifter om dig.`, ai_confused: () => `• ${i.names!.join(", ")} förväxlade dig med ett annat företag.`, ai_unchecked: () => "• Jag har inte kollat vad AI-assistenter säger om dig än. Fråga “hur ser min närvaro online ut?”." })[i.code](),
  },
  nb: {
    none: "Ingenting trenger oppmerksomheten din akkurat nå.", head: "Dette fant jeg:", ask: "Si hvilken som skal fikses først, eller si det direkte (for eksempel «stengt 24. des»).", notYet: "Overvåkes ikke ennå:",
    line: (i) => ({ hours_waiting: () => `• ${i.n} endring${i.n! > 1 ? "er" : ""} i åpningstider venter på avgjørelsen din (neste: ${i.detail}).`, closed_for_good: () => `• ${i.n} oppføring${i.n! > 1 ? "er" : ""} kan vise deg som åpen selv om anmeldelser tyder på noe annet: en person i Connect sjekker det.`, blocked_by_rule: () => `• ${i.n} forslag ble holdt tilbake av dine egne regler.`, profile_missing: () => `• Profilen din mangler: ${i.names!.join(", ")}.`, listing_off: () => `• Ikke tilkoblet, så ikke oppdatert: ${i.names!.join(", ")}.`, ai_wrong: () => `• ${i.names!.join(", ")} ga feil opplysninger om deg.`, ai_confused: () => `• ${i.names!.join(", ")} forvekslet deg med en annen bedrift.`, ai_unchecked: () => "• Jeg har ikke sjekket hva AI-assistenter sier om deg ennå. Spør «hvordan ser tilstedeværelsen min på nett ut?»." })[i.code](),
  },
};

/** Written from the facts by code, not by a model, so the list can never be embellished. */
export function radarText(r: Radar, lang: Lang | string): string {
  const d = D[asLang(lang)];
  const real = r.issues.filter((i) => i.code !== "ai_unchecked");
  if (!r.issues.length) return d.none;
  return `${real.length ? d.head : ""}${real.length ? "\n" : ""}${r.issues.map(d.line).join("\n")}\n\n${d.ask}`.trim();
}
