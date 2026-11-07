import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { canWrite, getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { audit } from "@/lib/events";
import { newId, now } from "@/lib/ids";
import { exchangeCode, fetchOsmUser, readState } from "@/lib/osm-auth";

const back = (req: Request, q: string) => NextResponse.redirect(new URL(`/dashboard/connections?osm=${q}`, req.url), 303);

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.redirect(new URL("/login", req.url), 303);
  const url = new URL(req.url);
  const jar = await cookies();
  const saved = readState(jar.get("fg_osm")?.value);
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return back(req, "denied");
  if (!saved || saved.state !== url.searchParams.get("state")) return back(req, "state_mismatch");
  if (!canWrite(s.role)) return back(req, "forbidden");
  try {
    const token = await exchangeCode(code, saved.verifier);
    const user = await fetchOsmUser(token);
    const db = await getDb();
    const enc = await encryptSecret(token);
    const existing = await db.select().from(schema.connections).where(and(eq(schema.connections.organizationId, s.orgId), eq(schema.connections.platform, "openstreetmap"))).get();
    const values = { externalAccountId: user.name, status: "connected", capabilitiesJson: ["read", "write", "verify"], encryptedCredentialReference: enc, expiresAt: null, lastSyncedAt: now() };
    if (existing) await db.update(schema.connections).set(values).where(eq(schema.connections.id, existing.id)).run();
    else await db.insert(schema.connections).values({ id: newId(), organizationId: s.orgId, platform: "openstreetmap", ...values }).run();
    await audit(db, s.orgId, s.userId, "connection.osm_connected", { account: user.name });
    const res = back(req, "connected");
    res.cookies.set("fg_osm", "", { path: "/api/connections/osm", maxAge: 0 });
    return res;
  } catch (e) {
    console.error("osm callback", e);
    return back(req, "failed");
  }
}
