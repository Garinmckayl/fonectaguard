import { NextResponse } from "next/server";
import { assertSameOrigin, sessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  assertSameOrigin();
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.delete(sessionCookie.name);
  return res;
}
