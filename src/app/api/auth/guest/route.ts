import { NextResponse } from "next/server";
import { assertSameOrigin, makeSessionToken, sessionCookie } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId, now } from "@/lib/ids";

/** Creates an isolated, non-demo workspace so a visitor can monitor their own real business. */
export async function POST(req: Request) {
  await assertSameOrigin();
  const db = await getDb();
  const userId = newId(), orgId = newId();
  await db.insert(schema.users).values({ id: userId, name: "Business owner", email: `guest-${userId}@guest.fonectaguard.app`, createdAt: now() }).run();
  await db.insert(schema.organizations).values({ id: orgId, name: "My business", ownerUserId: userId, isDemo: 0, createdAt: now() }).run();
  await db.insert(schema.organizationMembers).values({ id: newId(), organizationId: orgId, userId, role: "owner" }).run();
  const res = NextResponse.redirect(new URL("/onboarding", req.url), 303);
  res.cookies.set(sessionCookie.name, makeSessionToken(userId), { ...sessionCookie.options, maxAge: 60 * 60 * 24 * 7 });
  return res;
}
