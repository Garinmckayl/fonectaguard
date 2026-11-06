export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export type Schedule = Record<Day, string>; // "HH:MM-HH:MM" (close < open means overnight) or "closed"

export function normalizePhone(raw: string, defaultCountry = "358"): string | null {
  let s = raw.trim().replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) s = "+" + s.slice(1).replace(/\D/g, "");
  else if (s.startsWith("0")) s = "+" + defaultCountry + s.slice(1);
  else return null;
  const digits = s.slice(1);
  if (digits.length < 8 || digits.length > 15) return null;
  return s;
}

export function normalizeText(raw: string): string {
  return raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeAddress(raw: string): string {
  return normalizeText(raw)
    .replace(/\b(street|str|katu|kt)\b/g, "street")
    .replace(/\s+/g, " ");
}

export function normalizeUrlHost(raw: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeUrl(raw: string): string | null {
  const host = normalizeUrlHost(raw);
  if (!host) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return host + u.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

const DAY_ALIASES: Record<string, Day> = {
  mon: "mon", monday: "mon", ma: "mon", maanantai: "mon",
  tue: "tue", tuesday: "tue", ti: "tue", tiistai: "tue",
  wed: "wed", wednesday: "wed", ke: "wed", keskiviikko: "wed",
  thu: "thu", thursday: "thu", to: "thu", torstai: "thu",
  fri: "fri", friday: "fri", pe: "fri", perjantai: "fri",
  sat: "sat", saturday: "sat", la: "sat", lauantai: "sat",
  sun: "sun", sunday: "sun", su: "sun", sunnuntai: "sun",
  // schema.org opening-hours abbreviations
  mo: "mon", tu: "tue", we: "wed", th: "thu", fr: "fri", sa: "sat",
};

function hhmm(h: string, m?: string): string | null {
  const hh = Number(h), mm = Number(m ?? 0);
  if (!Number.isInteger(hh) || hh < 0 || hh > 24 || mm < 0 || mm > 59) return null;
  return `${String(hh % 24).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function dayRange(a: string, b?: string): Day[] | null {
  const from = DAY_ALIASES[a], to = b ? DAY_ALIASES[b] : from;
  if (!from || !to) return null;
  const i = DAYS.indexOf(from);
  const out: Day[] = [];
  for (let k = 0; k < 7; k++) {
    const d = DAYS[(i + k) % 7];
    out.push(d);
    if (d === to) return out;
  }
  return null;
}

/**
 * Parses free-form opening hours (English/Finnish) like "Mon-Fri 08:00-22:00; Sat 9-18; Sun closed",
 * "ma-pe 8-22", or a bare "08:00–22:00" (applies to every day). Returns null if nothing parseable.
 * Days never mentioned stay unset in the returned partial; a bare range fills the full week.
 */
export function parseHours(raw: string): Schedule | null {
  const text = raw.toLowerCase().replace(/[–—−]/g, "-").replace(/\bto\b/g, "-").replace(/\bclosed\b|\bsuljettu\b/g, "closed");
  const sched: Partial<Schedule> = {};
  const bare = text.match(/^\s*(\d{1,2})(?:[:.](\d{2}))?\s*-\s*(\d{1,2})(?:[:.](\d{2}))?\s*$/);
  if (bare) {
    const o = hhmm(bare[1], bare[2]), c = hhmm(bare[3], bare[4]);
    if (!o || !c) return null;
    for (const d of DAYS) sched[d] = `${o}-${c}`;
    return sched as Schedule;
  }
  const re = /([a-zäö]+)(?:\s*-\s*([a-zäö]+))?\s*[:,]?\s*(closed|(\d{1,2})(?:[:.](\d{2}))?\s*-\s*(\d{1,2})(?:[:.](\d{2}))?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const days = dayRange(m[1], m[2]);
    if (!days) continue;
    let val = "closed";
    if (m[3] !== "closed") {
      const o = hhmm(m[4], m[5]), c = hhmm(m[6], m[7]);
      if (!o || !c) continue;
      val = `${o}-${c}`;
    }
    for (const d of days) sched[d] = val;
  }
  if (Object.keys(sched).length === 0) return null;
  for (const d of DAYS) sched[d] ??= "closed";
  return sched as Schedule;
}

export function formatHours(s: Schedule): string {
  const groups: { days: Day[]; v: string }[] = [];
  for (const d of DAYS) {
    const last = groups[groups.length - 1];
    if (last && last.v === s[d]) last.days.push(d);
    else groups.push({ days: [d], v: s[d] });
  }
  if (groups.length === 1) return groups[0].v.replace("-", "–");
  return groups.map((g) => `${g.days.length > 1 ? `${g.days[0]}-${g.days[g.days.length - 1]}` : g.days[0]} ${g.v.replace("-", "–")}`).join("; ");
}

export function closingMinutes(v: string): number | null {
  const m = v.match(/-(\d{2}):(\d{2})$/);
  if (!m) return null;
  const o = v.match(/^(\d{2}):(\d{2})/)!;
  let close = Number(m[1]) * 60 + Number(m[2]);
  if (close <= Number(o[1]) * 60 + Number(o[2])) close += 24 * 60;
  return close;
}
