import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminToken, keyOk } from "@/lib/connect/admin";

export async function GET(req: Request) {
  const k = new URL(req.url).searchParams.get("k");
  if (!keyOk(k)) return NextResponse.redirect(new URL("/", req.url), 303);
  const res = NextResponse.redirect(new URL("/connect", req.url), 303);
  res.cookies.set(ADMIN_COOKIE, adminToken(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 3 });
  return res;
}
