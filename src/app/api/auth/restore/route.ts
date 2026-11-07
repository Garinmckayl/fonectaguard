import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { makeSessionToken, sessionCookie, verifySessionToken } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

/** Opens a workspace in this browser from its private access link. The link is a signed bearer token: anyone holding it can open the workspace. */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? undefined;
  const uid = verifySessionToken(t);
  const user = uid ? await (await getDb()).select().from(schema.users).where(eq(schema.users.id, uid)).get() : null;
  if (!uid || !user) return NextResponse.redirect(new URL("/login?restore=invalid", req.url), 303);
  const res = NextResponse.redirect(new URL("/dashboard", req.url), 303);
  res.cookies.set(sessionCookie.name, makeSessionToken(uid), { ...sessionCookie.options, maxAge: 60 * 60 * 24 * 7 });
  return res;
}
