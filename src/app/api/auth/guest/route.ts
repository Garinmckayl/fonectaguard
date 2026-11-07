import { NextResponse } from "next/server";
import { assertSameOrigin, makeSessionToken, sessionCookie } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createGuestWorkspace } from "@/lib/guest";

/** Creates an isolated, non-demo workspace so a visitor can monitor their own real business. */
export async function POST(req: Request) {
  await assertSameOrigin();
  const db = await getDb();
  const { userId } = await createGuestWorkspace(db);
  const res = NextResponse.redirect(new URL("/onboarding", req.url), 303);
  res.cookies.set(sessionCookie.name, makeSessionToken(userId), { ...sessionCookie.options, maxAge: 60 * 60 * 24 * 7 });
  return res;
}
