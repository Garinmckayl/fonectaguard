import { type FieldName } from "./compare";
import { parseHours, type Schedule } from "./normalize";
import { scheduleToSchemaOrg } from "./jsonld";
import { OSM_API } from "./osm-auth";

/** Only fields with a clean, unambiguous OSM tag are written. Names and addresses are left to people. */
export const OSM_WRITABLE: FieldName[] = ["phone", "hours", "website"];

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Weekly text -> OSM opening_hours ("Mo-Fr 08:00-17:00; Sa 09:00-16:00; Su off"). Null when it cannot be parsed safely. */
export function hoursToOsm(value: string): string | null {
  const s = parseHours(value) as Schedule | null;
  if (!s) return null;
  const closed = (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).filter((d) => s[d] === "closed").map((d) => ({ mon: "Mo", tue: "Tu", wed: "We", thu: "Th", fri: "Fr", sat: "Sa", sun: "Su" })[d]);
  const open = scheduleToSchemaOrg(s);
  return open.length ? [...open, ...closed.map((d) => `${d} off`)].join("; ") : null;
}

/** Applies one field to an OSM tag map, reusing the key the object already uses (phone vs contact:phone). */
export function applyTag(tags: Record<string, string>, field: FieldName, value: string): Record<string, string> | null {
  const out = { ...tags };
  if (field === "hours") { const h = hoursToOsm(value); if (!h) return null; out.opening_hours = h; return out; }
  if (field === "phone") { out[tags["contact:phone"] && !tags.phone ? "contact:phone" : "phone"] = value; return out; }
  if (field === "website") { out[tags["contact:website"] && !tags.website ? "contact:website" : "website"] = value; return out; }
  return null;
}

type Element = { type: "node" | "way"; id: number; version: number; lat?: number; lon?: number; nodes?: number[]; tags?: Record<string, string> };

export function elementXml(e: Element, tags: Record<string, string>, changeset: number): string {
  const t = Object.entries(tags).map(([k, v]) => `<tag k="${xml(k)}" v="${xml(v)}"/>`).join("");
  if (e.type === "node") return `<osm><node id="${e.id}" version="${e.version}" changeset="${changeset}" lat="${e.lat}" lon="${e.lon}">${t}</node></osm>`;
  return `<osm><way id="${e.id}" version="${e.version}" changeset="${changeset}">${(e.nodes ?? []).map((n) => `<nd ref="${n}"/>`).join("")}${t}</way></osm>`;
}

/** One owner-approved edit as one changeset: create, edit the object, close. Accurate, attributed to the owner's own account, with a plain comment. */
export async function writeOsmField(token: string, ref: string, field: FieldName, value: string, label: string): Promise<{ ok: boolean; response: Record<string, unknown> }> {
  const m = ref.match(/^(node|way)\/(\d+)$/);
  if (!m) return { ok: false, response: { error: "Only OpenStreetMap nodes and ways can be edited here" } };
  const auth = { authorization: `Bearer ${token}`, "user-agent": "FonectaGuard/1.0" };
  const got = await fetch(`${OSM_API}/${m[1]}/${m[2]}.json`, { headers: { "user-agent": "FonectaGuard/1.0" }, signal: AbortSignal.timeout(10_000) });
  if (!got.ok) return { ok: false, response: { error: `Could not read the OpenStreetMap object (${got.status})` } };
  const el = ((await got.json()) as { elements?: Element[] }).elements?.[0];
  if (!el) return { ok: false, response: { error: "OpenStreetMap object not found" } };
  const tags = applyTag(el.tags ?? {}, field, value);
  if (!tags) return { ok: false, response: { error: `Cannot express ${field} "${value}" as an OpenStreetMap tag` } };

  const cs = `<osm><changeset><tag k="created_by" v="FonectaGuard"/><tag k="comment" v="${xml(`Update ${field} of ${label} from the business's own published details`)}"/><tag k="source" v="business owner (confirmed in FonectaGuard)"/></changeset></osm>`;
  const created = await fetch(`${OSM_API}/changeset/create`, { method: "PUT", headers: { ...auth, "content-type": "text/xml" }, body: cs, signal: AbortSignal.timeout(10_000) });
  if (!created.ok) return { ok: false, response: { error: created.status === 401 || created.status === 403 ? "OpenStreetMap refused the edit: reconnect your account (and accept the contributor terms on openstreetmap.org)" : `OpenStreetMap changeset failed (${created.status})` } };
  const changeset = Number((await created.text()).trim());
  try {
    const put = await fetch(`${OSM_API}/${m[1]}/${m[2]}`, { method: "PUT", headers: { ...auth, "content-type": "text/xml" }, body: elementXml(el, tags, changeset), signal: AbortSignal.timeout(10_000) });
    if (!put.ok) return { ok: false, response: { error: put.status === 409 ? "The object changed on OpenStreetMap while editing; retry" : `OpenStreetMap rejected the edit (${put.status})`, detail: (await put.text()).slice(0, 200) } };
    return { ok: true, response: { changeset, changesetUrl: `https://www.openstreetmap.org/changeset/${changeset}`, object: ref, field, value } };
  } finally {
    await fetch(`${OSM_API}/changeset/${changeset}/close`, { method: "PUT", headers: auth, signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  }
}
