import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeUrl, hasOsmOAuth, newPkce, signState } from "@/lib/osm-auth";

/** Begins the OpenStreetMap OAuth2 (PKCE) login. State and verifier are bound to this browser by a short-lived signed cookie. */
export async function GET(req: Request) {
  if (!(await getSession())) return NextResponse.redirect(new URL("/login", req.url), 303);
  if (!hasOsmOAuth()) return NextResponse.redirect(new URL("/dashboard/connections?osm=not_configured", req.url), 303);
  const { verifier, challenge, state } = newPkce();
  const res = NextResponse.redirect(authorizeUrl(state, challenge), 303);
  res.cookies.set("fg_osm", signState(state, verifier), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/connections/osm", maxAge: 600 });
  return res;
}
