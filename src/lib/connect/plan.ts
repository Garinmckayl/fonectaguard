import type { DayPlan } from "./types";

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const hm = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;

export const CLOSED: DayPlan = { closed: true };
export const open = (start: string, end: string): DayPlan => ({ closed: false, intervals: [{ start, end }] });

/** The safety net every suggestion and every owner edit passes before it can reach Yext. Returns a reason, or null when the plan is fine. */
export function validatePlan(p: DayPlan): string | null {
  if (p.closed) return null;
  if (!p.intervals.length || p.intervals.length > 3) return "Between 1 and 3 opening periods are supported.";
  const spans: [number, number][] = [];
  for (const [i, iv] of p.intervals.entries()) {
    if (!HM.test(iv.start) || !HM.test(iv.end)) return `"${iv.start}–${iv.end}" is not a valid time.`;
    const s = mins(iv.start), e = mins(iv.end);
    if (s === e) return "Opening and closing time are the same.";
    const overnight = e < s;
    if (overnight && i !== p.intervals.length - 1) return "Only the last period of the day can run past midnight.";
    spans.push([s, overnight ? e + 1440 : e]);
  }
  for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1]) return "Opening periods overlap or are out of order.";
  if (spans.reduce((a, [s, e]) => a + (e - s), 0) > 1440) return "That is more than 24 hours.";
  return null;
}

export const plansEqual = (a: DayPlan | null | undefined, b: DayPlan | null | undefined) =>
  !!a && !!b && (a.closed ? b.closed : !b.closed && JSON.stringify(a.intervals) === JSON.stringify(b.intervals));

export function fmtPlan(p: DayPlan, lang: "en" | "fi" = "en"): string {
  if (p.closed) return lang === "fi" ? "suljettu" : "closed";
  return p.intervals.map((i) => `${i.start}–${i.end}`).join(lang === "fi" ? " ja " : " and ");
}

/** Shifts the closing time of the last period by `delta` minutes (used when we have learned how this owner trims a kind of day). */
export function shiftClose(p: DayPlan, delta: number): DayPlan {
  if (p.closed || !delta) return p;
  const iv = p.intervals.map((x) => ({ ...x }));
  const last = iv[iv.length - 1];
  last.end = hm(mins(last.end) + delta);
  const next: DayPlan = { closed: false, intervals: iv };
  return validatePlan(next) ? p : next;
}

/** Difference in closing time (minutes, wrap-aware) between what we suggested and what the owner chose, or null when not comparable. */
export function closeDelta(suggested: DayPlan, chosen: DayPlan): number | null {
  if (suggested.closed || chosen.closed) return null;
  const a = suggested.intervals.at(-1)!, b = chosen.intervals.at(-1)!;
  let d = mins(b.end) - mins(a.end);
  if (d > 720) d -= 1440; else if (d < -720) d += 1440;
  return d;
}

const CLOSED_WORDS = /\b(closed|close all day|not open|kiinni|suljettu|suljemme koko päivän|ei auki|ei avata|stängt)\b/i;

function t24(h: string, m: string | undefined, ap?: string): string | null {
  let hh = Number(h); const mm = Number(m ?? 0);
  if (ap) { const pm = /p/i.test(ap); if (hh < 1 || hh > 12) return null; hh = (hh % 12) + (pm ? 12 : 0); }
  return hh > 24 || mm > 59 ? null : `${String(hh === 24 ? 0 : hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Deterministic parse for the common ways owners write hours ("closed", "12-16", "klo 12.00–15.30", "from 12 to 3pm"). Null when unsure: the caller then asks the AI. */
export function parseSimplePlan(text: string): DayPlan | null {
  const s = text.trim().toLowerCase().replace(/[.,;]+$/g, "");
  if (CLOSED_WORDS.test(s) && !/\d/.test(s)) return CLOSED;
  const T = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?`;
  const m = s.match(new RegExp(`${T}\\s*(?:-|–|—|to|until|till|asti|–)\\s*${T}`));
  if (!m) return null;
  let start = t24(m[1], m[2], m[3] ?? undefined), end = t24(m[4], m[5], m[6] ?? undefined);
  // "12 to 3pm": an am/pm on only the end means the start is in the same half unless that would make it end before it begins.
  if (m[6] && !m[3] && start && end && Number(start.slice(0, 2)) < 12 && mins(end) <= mins(start) && Number(m[1]) <= 12) start = t24(m[1], m[2], m[6]);
  if (!start || !end) return null;
  const plan = open(start, end);
  return validatePlan(plan) ? null : plan;
}
