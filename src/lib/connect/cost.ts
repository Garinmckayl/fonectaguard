import { fmtHours, type Lang } from "./i18n";

/** What wrong hours cost this business, from its own data (built in ml/predict.py `cost_of`). */
export interface Cost {
  views: number; ly_date: string; ly_views: number | null; ly_actions: number | null; ly_calls: number | null;
  late: { entered: string; shown: string } | null; reviews: { n: number; quote: string; rating: number } | null;
}

const LOCALE: Record<Lang, string> = { fi: "fi-FI", sv: "sv-SE", nb: "nb-NO", en: "en-GB" };
const dayMonth = (iso: string, l: Lang) => new Intl.DateTimeFormat(LOCALE[l], { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

type Stake = "says_open" | "says_closed" | "hours";
const STAKE: Record<Stake, Record<Lang, (v: number) => string>> = {
  says_open: { en: (v) => `If nothing changes, Google will tell about ${v} people that you are open.`, fi: (v) => `Jos mitään ei muuteta, Google kertoo noin ${v} ihmiselle, että olet auki.`, sv: (v) => `Om inget ändras säger Google till ungefär ${v} personer att du har öppet.`, nb: (v) => `Hvis ingenting endres, forteller Google omtrent ${v} personer at du har åpent.` },
  says_closed: { en: (v) => `Google says you are closed: about ${v} people may go elsewhere.`, fi: (v) => `Google näyttää, että olet kiinni: noin ${v} ihmistä voi mennä muualle.`, sv: (v) => `Google visar att du har stängt: ungefär ${v} personer kan gå någon annanstans.`, nb: (v) => `Google viser at du har stengt: omtrent ${v} personer kan gå et annet sted.` },
  hours: { en: (v) => `About ${v} people will look up your hours on Google that day.`, fi: (v) => `Noin ${v} ihmistä katsoo aukioloaikasi Googlesta sinä päivänä.`, sv: (v) => `Ungefär ${v} personer kollar dina öppettider på Google den dagen.`, nb: (v) => `Omtrent ${v} personer sjekker åpningstidene dine på Google den dagen.` },
};
const REVIEWS: Record<Lang, (n: number, q: string) => string> = {
  en: (n, q) => `Last year ${n === 1 ? "a review" : `${n} reviews`} after this day mentioned a closed door: “${q}”`,
  fi: (n, q) => `Viime vuonna tämän päivän jälkeen ${n === 1 ? "arvostelussa" : `${n} arvostelussa`} mainittiin suljettu ovi: “${q}”`,
  sv: (n, q) => `Förra året nämnde ${n === 1 ? "en recension" : `${n} recensioner`} efter den här dagen en stängd dörr: ”${q}”`,
  nb: (n, q) => `I fjor nevnte ${n === 1 ? "en anmeldelse" : `${n} anmeldelser`} etter denne dagen en stengt dør: «${q}»`,
};
const LATE: Record<Lang, (date: string, shown: string) => string> = {
  en: (d, s) => `Last year this day's hours were only added on ${d}, so on the day Google showed ${s}.`,
  fi: (d, s) => `Viime vuonna tämän päivän ajat lisättiin vasta ${d}, joten Google näytti silloin ${s}.`,
  sv: (d, s) => `Förra året lades dagens tider in först ${d}, så Google visade ${s} den dagen.`,
  nb: (d, s) => `I fjor ble tidene for dagen lagt inn først ${d}, så Google viste ${s} den dagen.`,
};
const ACTIONS: Record<Lang, (v: number, a: number) => string> = {
  en: (v, a) => `On the same day last year ${v} people saw you on Google and ${a} asked for directions, called or opened your website.`,
  fi: (v, a) => `Samana päivänä viime vuonna ${v} ihmistä näki sinut Googlessa ja ${a} haki reittiohjeet, soitti tai avasi sivusi.`,
  sv: (v, a) => `Samma dag förra året såg ${v} personer dig på Google och ${a} bad om vägbeskrivning, ringde eller öppnade din webbplats.`,
  nb: (v, a) => `Samme dag i fjor så ${v} personer deg på Google, og ${a} ba om veibeskrivelse, ringte eller åpnet nettsiden din.`,
};

const MIN_VIEWS = 5;

function stakeOf(shown: string, proposed: string | null | undefined, ask: boolean): Stake {
  if (ask || !proposed) return "hours";
  if (proposed === "closed" && shown !== "closed") return "says_open";
  if (shown === "closed" && proposed !== "closed") return "says_closed";
  return "hours";
}

/** This year's stake, in one short sentence (used where space is tight, e.g. SMS). */
export function stakeText(cost: Cost | null | undefined, shown: string, proposed: string | null | undefined, l: Lang, ask = false): string | null {
  if (!cost || cost.views < MIN_VIEWS) return null;
  return STAKE[stakeOf(shown, proposed, ask)][l](cost.views);
}

/** The strongest fact from last year: a complaint review, then a late fix, then what people did that day. */
export function evidenceText(cost: Cost | null | undefined, l: Lang): string | null {
  if (!cost) return null;
  if (cost.reviews?.n && cost.reviews.quote) return REVIEWS[l](cost.reviews.n, cost.reviews.quote);
  if (cost.late) return LATE[l](dayMonth(cost.late.entered, l), fmtHours(cost.late.shown, l));
  const acts = (cost.ly_actions ?? 0) + (cost.ly_calls ?? 0);
  if (cost.ly_views && cost.ly_views >= MIN_VIEWS && acts >= 2) return ACTIONS[l](cost.ly_views, acts);
  return null;
}

/** Why it matters, in the owner's language: the stake this year plus one fact from last year. Never invents numbers; returns null when there is nothing to say. */
export function costText(cost: Cost | null | undefined, shown: string, proposed: string | null | undefined, l: Lang, ask = false): string | null {
  const parts = [stakeText(cost, shown, proposed, l, ask), evidenceText(cost, l)].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}
