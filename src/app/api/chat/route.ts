import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { assistantReply } from "@/lib/ai";
import { dashboardData } from "@/lib/queries";
import { displayValue } from "@/lib/format";
import type { FieldName } from "@/lib/compare";

const Body = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1500) })).min(1).max(20) });

export const POST = route(true, async ({ s, db, req }) => {
  const { messages } = Body.parse(await req.json());
  if (messages[messages.length - 1].role !== "user") throw new HttpError(400, "Last message must be from the user");
  const d = await dashboardData(db, s.orgId);
  if (!d) throw new HttpError(404, "No business yet");
  const lines = [
    `Business: ${d.loc.businessName} (${d.loc.city ?? ""}) website ${d.loc.website ?? "n/a"}`,
    `Presence Health: ${d.health.score ?? "not computed yet"}% (${d.health.status}); ${d.listings.length} monitored sources; ${d.approvals.length} proposals awaiting approval.`,
    ...d.listings.map((l) => `- ${l.platform} ${l.url} [${l.status}] issues: ${l.discrepancies.filter((x) => !["resolved", "dismissed"].includes(x.status)).map((x) => `${x.fieldName} observed "${displayValue(x.fieldName as FieldName, x.observedValueJson)}" expected "${displayValue(x.fieldName as FieldName, x.expectedValueJson)}" (${x.severity}, ${x.status})`).join("; ") || "none"}`),
  ];
  return { reply: await assistantReply(lines.join("\n"), messages) };
});
