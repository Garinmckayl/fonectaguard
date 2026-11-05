import { z } from "zod";
import crypto from "crypto";
import { normalizePhone, parseHours } from "./normalize";
import type { FieldName } from "./compare";

export interface ExtractedField { value: unknown; raw: string; sourceUrl: string; observedAt: number; confidence: number; excerpt: string }
export type Extraction = Partial<Record<FieldName, ExtractedField>>;

const JsonLd = z.object({
  name: z.string().optional(),
  telephone: z.string().optional(),
  email: z.string().optional(),
  url: z.string().optional(),
  description: z.string().optional(),
  address: z.union([z.string(), z.object({ streetAddress: z.string().optional(), addressLocality: z.string().optional() })]).optional(),
  openingHours: z.union([z.string(), z.array(z.string())]).optional(),
}).passthrough();

export const contentHash = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);

export function extractFromRaw(raw: { name?: string; address?: string; phone?: string; hours?: string; website?: string; email?: string; description?: string }, sourceUrl: string, confidence: number, observedAt = Date.now()): Extraction {
  const out: Extraction = {};
  const put = (f: FieldName, rawVal: string | undefined, norm: unknown, excerpt = rawVal ?? "") => {
    if (!rawVal || norm === null || norm === undefined) return;
    out[f] = { value: norm, raw: rawVal, sourceUrl, observedAt, confidence, excerpt: excerpt.slice(0, 200) };
  };
  put("name", raw.name, raw.name);
  put("address", raw.address, raw.address);
  put("phone", raw.phone, raw.phone ? normalizePhone(raw.phone) ?? raw.phone : null);
  put("hours", raw.hours, raw.hours ? parseHours(raw.hours) ?? raw.hours : null);
  put("website", raw.website, raw.website);
  put("email", raw.email, raw.email);
  put("description", raw.description, raw.description);
  return out;
}

/** Parses LocalBusiness JSON-LD. Page content is treated strictly as data: only the Zod-validated fields are used. */
export function extractFromHtml(html: string, sourceUrl: string): Extraction | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1]);
      const parsedLd = JsonLd.safeParse(Array.isArray(parsed) ? parsed[0] : parsed);
      if (!parsedLd.success) continue;
      const d = parsedLd.data;
      const addr = typeof d.address === "string" ? d.address : d.address ? [d.address.streetAddress, d.address.addressLocality].filter(Boolean).join(", ") : undefined;
      const hours = Array.isArray(d.openingHours) ? d.openingHours.join("; ") : d.openingHours;
      return extractFromRaw({ name: d.name, address: addr, phone: d.telephone, hours, website: d.url, email: d.email, description: d.description }, sourceUrl, 0.9);
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchPage(url: string, timeoutMs = 8000): Promise<{ ok: boolean; status: number; html: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "FonectaGuardBot/0.1" }, redirect: "follow" });
    const text = (await res.text()).slice(0, 500_000);
    return { ok: res.ok, status: res.status, html: text };
  } finally {
    clearTimeout(t);
  }
}
