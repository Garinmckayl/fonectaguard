import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { decide, getSug, undoSuggestion, whereItShows, getBiz } from "@/lib/connect/service";
import { asLang } from "@/lib/connect/i18n";

const Body = z.object({ token: z.string().min(8).max(40), suggestionId: z.string().max(60), action: z.enum(["approve", "decline", "edit", "undo", "choose", "keep"]), text: z.string().max(200).optional(), option: z.number().int().min(0).max(8).optional() });

/** No login: the message token in the link is the capability, and it only reaches the days in that message. */
export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ ok: false, text: "Invalid request" }, { status: 400 });
  const db = await getDb();
  const msg = await db.select().from(schema.cnMessages).where(eq(schema.cnMessages.token, p.data.token)).get();
  const s = msg ? await getSug(db, p.data.suggestionId) : null;
  if (!msg || !s || s.messageId !== msg.id) return NextResponse.json({ ok: false, text: "This link is not valid." }, { status: 404 });
  if (p.data.action === "undo") {
    const r = await undoSuggestion(db, s);
    return NextResponse.json({ ok: r.ok, status: r.ok ? "undone" : s.status });
  }
  const a = p.data.action;
  const r = await decide(db, s.id, a === "edit" ? { action: "edit", text: p.data.text ?? "" } : a === "choose" ? { action: "choose", option: p.data.option ?? 0 } : { action: a });
  const biz = (await getBiz(db, s.businessId))!;
  return NextResponse.json({ ok: r.ok, text: r.text, status: r.suggestion?.status, finalHours: r.suggestion?.finalHours, proposed: r.suggestion?.proposed, shows: r.ok ? whereItShows(biz, asLang(biz.language)) : undefined, adjusted: r.adjusted?.map((a) => ({ id: a.id, proposed: a.proposed })), needsRetry: r.needsRetry });
}
