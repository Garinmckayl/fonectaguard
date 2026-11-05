import { NextResponse } from "next/server";
import { assertSameOrigin, makeSessionToken, sessionCookie } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createDemoUser } from "@/lib/demo";

export async function POST(req: Request) {
  await assertSameOrigin();
  const { userId } = await createDemoUser(await getDb());
  const res = NextResponse.redirect(new URL("/dashboard", req.url), 303);
  res.cookies.set(sessionCookie.name, makeSessionToken(userId), { ...sessionCookie.options, maxAge: 60 * 60 * 24 * 7 });
  return res;
}
