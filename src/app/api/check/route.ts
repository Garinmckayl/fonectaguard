import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, assertSameOrigin, getSession, makeSessionToken, sessionCookie } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createPublicCheck } from "@/lib/public-check";

export const maxDuration = 60;

/** Unauthenticated, rate-limited, read-only. Starts an AI-search check for any public business website. */
export async function POST(req: Request) {
  try {
    await assertSameOrigin();
    const { url } = z.object({ url: z.string().max(300) }).parse(await req.json().catch(() => ({})));
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const r = await createPublicCheck(await getDb(), url, ip);
    const res = NextResponse.json({ auditId: r.auditId });
    // The visitor owns the workspace they just created, so they can continue into the dashboard from the report (an existing session is never replaced).
    if (!(await getSession())) res.cookies.set(sessionCookie.name, makeSessionToken(r.userId), { ...sessionCookie.options, maxAge: 60 * 60 * 24 * 7 });
    return res;
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Enter your business website" }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
