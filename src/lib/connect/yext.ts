import type { DayPlan } from "./types";

const base = () => process.env.YEXT_BASE_URL ?? "https://sbx-api.yextapis.com";
const V = "20261106";
const key = () => { const k = process.env.YEXT_API_KEY; if (!k) throw new Error("YEXT_API_KEY is not configured"); return k; };
export const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export interface YextInterval { start: string; end: string }
export interface YextDay { openIntervals?: YextInterval[]; isClosed?: boolean }
export interface YextHoliday { date: string; openIntervals?: YextInterval[]; isClosed?: boolean; isRegularHours?: boolean }
export type YextHours = Partial<Record<(typeof DAYS)[number], YextDay>> & { holidayHours?: YextHoliday[]; reopenDate?: string };
export interface YextEntity { mainPhone?: string | null; websiteUrl?: { url?: string } | null; emails?: string[] | null; description?: string | null; name: string; address?: { line1?: string; city?: string; postalCode?: string; countryCode?: string }; timezone?: string; hours?: YextHours; categories?: Record<string, string[]>; meta?: { id: string; language?: string } }

export async function call<T>(method: "GET" | "PUT", path: string, body?: unknown): Promise<T> {
  const url = `${base()}/v2/accounts/me/entities/${encodeURIComponent(path)}?${new URLSearchParams({ api_key: key(), v: V })}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12_000) });
    const j = (await res.json().catch(() => ({}))) as { response?: T; meta?: { errors?: { message?: string }[] } };
    if (res.ok && j.response) return j.response;
    if (res.status >= 500 && attempt < 1) continue;
    throw new Error(`Yext ${res.status}: ${j.meta?.errors?.map((e) => e.message).join("; ") || "request failed"}`);
  }
}

export const getEntity = (id: string) => call<YextEntity>("GET", id);

export const toYext = (date: string, p: DayPlan): YextHoliday => (p.closed ? { date, isClosed: true } : { date, openIntervals: p.intervals.map((i) => ({ start: i.start, end: i.end })) });
export const fromYext = (e: { openIntervals?: YextInterval[]; isClosed?: boolean }): DayPlan | null => (e.isClosed ? { closed: true } : e.openIntervals?.length ? { closed: false, intervals: e.openIntervals.map((i) => ({ start: i.start, end: i.end })) } : null);

/** Regular weekly hours by weekday (0=Sunday..6=Saturday), or null when the entity has none. */
export function regularHours(h?: YextHours): Record<number, DayPlan> | null {
  if (!h) return null;
  const out: Record<number, DayPlan> = {};
  DAYS.forEach((d, i) => { const p = h[d] ? fromYext(h[d]!) : null; if (p) out[(i + 1) % 7] = p; });
  return Object.keys(out).length ? out : null;
}
export const holidayPlan = (h: YextHours | undefined, date: string): DayPlan | null => { const e = h?.holidayHours?.find((x) => x.date === date); return e ? fromYext(e) : null; };

/** Sets (or, with null, removes) the exception for one date. Reads first and writes the whole hours object back, so regular hours and other dates are never lost. */
export async function setHolidayPlan(entityId: string, date: string, plan: DayPlan | null): Promise<{ before: YextHoliday | null; after: YextEntity }> {
  const current = await getEntity(entityId);
  const hours: YextHours = { ...(current.hours ?? {}) };
  const list = (hours.holidayHours ?? []).filter((x) => x.date !== date);
  const before = (hours.holidayHours ?? []).find((x) => x.date === date) ?? null;
  if (plan) list.push(toYext(date, plan));
  hours.holidayHours = list.sort((a, b) => a.date.localeCompare(b.date));
  const after = await call<YextEntity>("PUT", entityId, { hours });
  return { before, after };
}

/** Puts back exactly what was there before (or removes the date when there was nothing). Used by undo. */
export async function restoreHolidayEntry(entityId: string, date: string, before: YextHoliday | null) {
  const current = await getEntity(entityId);
  const hours: YextHours = { ...(current.hours ?? {}) };
  const list = (hours.holidayHours ?? []).filter((x) => x.date !== date);
  if (before) list.push(before);
  hours.holidayHours = list.sort((a, b) => a.date.localeCompare(b.date));
  return call<YextEntity>("PUT", entityId, { hours });
}

/** Makes the shared sandbox entity mirror a business (name, city, regular weekly hours) and clears exceptions, so one sandbox entity can show many demo businesses. */
export async function mirrorBusiness(entityId: string, b: { name: string; regular: Record<string, string> | null }) {
  const day = (h: string | undefined): YextDay => (!h || h === "closed" ? { isClosed: true } : { openIntervals: h.split(",").map((x) => { const [start, end] = x.split("-"); return { start, end }; }) });
  const hours: YextHours = { holidayHours: [] };
  for (const d of DAYS) (hours as Record<string, YextDay>)[d] = day(b.regular?.[d]);
  return call<YextEntity>("PUT", entityId, { name: b.name, hours });
}

/** Sets several exceptions at once (e.g. a temporary closure over many days) in one write. Returns what was there before so it can be undone. */
export async function setHolidayPlans(entityId: string, items: { date: string; plan: DayPlan }[]): Promise<{ before: YextHoliday[]; after: YextEntity }> {
  const current = await getEntity(entityId);
  const hours: YextHours = { ...(current.hours ?? {}) };
  const dates = new Set(items.map((i) => i.date));
  const before = (hours.holidayHours ?? []).filter((x) => dates.has(x.date));
  hours.holidayHours = [...(hours.holidayHours ?? []).filter((x) => !dates.has(x.date)), ...items.map((i) => toYext(i.date, i.plan))].sort((a, b) => a.date.localeCompare(b.date));
  return { before, after: await call<YextEntity>("PUT", entityId, { hours }) };
}

/** Replaces regular weekly hours for the given weekdays only, keeping every other day and all exceptions. */
export async function setRegularDays(entityId: string, days: Partial<Record<(typeof DAYS)[number], DayPlan>>): Promise<{ before: Partial<Record<string, YextDay | null>>; after: YextEntity }> {
  const current = await getEntity(entityId);
  const hours: YextHours = { ...(current.hours ?? {}) };
  const before: Partial<Record<string, YextDay | null>> = {};
  for (const [d, p] of Object.entries(days) as [(typeof DAYS)[number], DayPlan][]) {
    before[d] = hours[d] ?? null;
    hours[d] = p.closed ? { isClosed: true } : { openIntervals: p.intervals.map((i) => ({ start: i.start, end: i.end })) };
  }
  return { before, after: await call<YextEntity>("PUT", entityId, { hours }) };
}

/** Writes simple profile fields (phone, website, e-mail, description, address). Returns the previous values for undo. */
export async function setProfileFields(entityId: string, fields: Partial<Pick<YextEntity, "mainPhone" | "websiteUrl" | "emails" | "description" | "address">>) {
  const current = await getEntity(entityId);
  const before = Object.fromEntries(Object.keys(fields).map((k) => [k, (current as unknown as Record<string, unknown>)[k] ?? null]));
  return { before, after: await call<YextEntity>("PUT", entityId, fields) };
}

export async function restoreHolidayEntries(entityId: string, dates: string[], before: YextHoliday[]) {
  const current = await getEntity(entityId);
  const hours: YextHours = { ...(current.hours ?? {}) };
  const drop = new Set(dates);
  hours.holidayHours = [...(hours.holidayHours ?? []).filter((x) => !drop.has(x.date)), ...before].sort((a, b) => a.date.localeCompare(b.date));
  return call<YextEntity>("PUT", entityId, { hours });
}

export async function restoreRegularDays(entityId: string, before: Partial<Record<string, YextDay | null>>) {
  const current = await getEntity(entityId);
  const hours = { ...(current.hours ?? {}) } as Record<string, unknown>;
  for (const [d, v] of Object.entries(before)) { if (v) hours[d] = v; else delete hours[d]; }
  return call<YextEntity>("PUT", entityId, { hours });
}
