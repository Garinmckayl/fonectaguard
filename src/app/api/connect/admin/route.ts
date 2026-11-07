import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { isAdmin, resetBusiness } from "@/lib/connect/admin";
import { sendNow } from "@/lib/connect/deliver";
import { assertSameOrigin } from "@/lib/auth";
import { setWebhook } from "@/lib/connect/telegram";
import { applyChange, getChange, handleOwnerInput, presenceFacts, presenceMessage, undoChange } from "@/lib/connect/agent";
import { getBiz } from "@/lib/connect/service";
import { runLadder } from "@/lib/connect/critical";
import { appUrl } from "@/lib/connect/service";

const Body = z.object({ action: z.enum(["send", "reset", "webhook", "agent", "agent_apply", "agent_undo", "presence", "language", "alerts"]), businessId: z.string().max(40), text: z.string().max(600).optional(), language: z.enum(["en", "fi", "sv", "nb"]).optional(), image: z.object({ mime: z.string().max(30), b64: z.string().max(6_000_000) }).optional(), changeId: z.string().max(40).optional(), asOf: z.number().optional() });

export async function POST(req: Request) {
  try { await assertSameOrigin(); } catch { return NextResponse.json({ ok: false, error: "Cross-origin request rejected" }, { status: 403 }); }
  if (!(await isAdmin())) return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  try {
    if (p.data.action === "language" && p.data.language) { await db.update(schema.cnBusinesses).set({ language: p.data.language }).where(eq(schema.cnBusinesses.id, p.data.businessId)).run(); return NextResponse.json({ ok: true }); }
    if (p.data.action === "agent") { const r = await handleOwnerInput(db, p.data.businessId, { text: p.data.text, image: p.data.image, source: p.data.image ? "photo" : "text" }); return NextResponse.json({ ok: true, text: r.text, changes: r.changes, presence: !!r.presence, site: r.site ?? null }); }
    if (p.data.action === "agent_apply" || p.data.action === "agent_undo") {
      const rec = p.data.changeId ? await getChange(db, p.data.changeId) : null, biz = rec ? await getBiz(db, rec.businessId) : null;
      if (!rec || !biz || rec.businessId !== p.data.businessId) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
      return NextResponse.json(p.data.action === "agent_apply" ? await applyChange(db, biz, rec) : { ok: await undoChange(db, rec) });
    }
    if (p.data.action === "presence") { const biz = await getBiz(db, p.data.businessId); if (!biz) return NextResponse.json({ ok: false }, { status: 404 }); const f = await presenceFacts(db, biz); return NextResponse.json({ ok: true, facts: f, message: await presenceMessage(biz, f) }); }
    if (p.data.action === "alerts") return NextResponse.json({ ok: true, steps: await runLadder(db, p.data.businessId, { demo: true, asOf: p.data.asOf }) });
    if (p.data.action === "webhook") { await setWebhook(`${appUrl()}/api/connect/telegram`); return NextResponse.json({ ok: true }); }
    if (p.data.action === "reset") return NextResponse.json({ ok: await resetBusiness(db, p.data.businessId) });
    const r = await sendNow(db, p.data.businessId);
    return NextResponse.json(r.ok ? { ok: true, sent: r.sent, auto: r.auto, delivered: r.delivered, url: "url" in r ? r.url : undefined } : { ok: false, error: r.reason });
  } catch (e) { console.error(e); return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 }); }
}
