import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeUrl, hasFacebook, newState, signFbState } from "@/lib/facebook";

/** Begins Facebook Login. The state is bound to this browser by a short-lived signed cookie. */
export async function GET(req: Request) {
  if (!(await getSession())) return NextResponse.redirect(new URL("/login", req.url), 303);
  if (!hasFacebook()) return NextResponse.redirect(new URL("/dashboard/connections?facebook=not_configured", req.url), 303);
  const state = newState();
  const res = NextResponse.redirect(authorizeUrl(state), 303);
  res.cookies.set("fg_fb", signFbState(state), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/connections/facebook", maxAge: 600 });
  return res;
}
