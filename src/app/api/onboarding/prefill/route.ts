import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { extractBusinessFacts } from "@/lib/ai";
import { fetchTexts, hasTinyFish } from "@/lib/tinyfish";

const Body = z.object({ website: z.string().url(), name: z.string().max(200).optional(), city: z.string().max(100).optional() });

/** Reads the business's own website (TinyFish Fetch) and proposes profile values (OpenRouter). Nothing is saved or verified here. */
export const POST = route(true, async ({ req }) => {
  if (!hasTinyFish()) throw new HttpError(503, "Live integrations are not configured");
  const b = Body.parse(await req.json());
  const u = new URL(b.website);
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, "Website must be http(s)");
  const text = (await fetchTexts([b.website])).get(b.website);
  if (!text) throw new HttpError(422, "Could not read that website");
  const f = await extractBusinessFacts(text, { name: b.name, city: b.city, url: b.website });
  if (!f) throw new HttpError(422, "Could not extract business details from that website");
  return { name: f.name ?? "", address: f.address ?? "", phone: f.phone ?? "", hours: f.hours ?? "", email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email ?? "") ? f.email! : "", city: f.city ?? "", description: f.description ?? "" };
});
