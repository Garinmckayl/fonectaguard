import { canWrite } from "./auth-roles";
export { canWrite };
import { cookies, headers } from "next/headers";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";

const COOKIE = "fg_session";
const secret = () => process.env.AUTH_SECRET ?? "dev-insecure-secret";
const sign = (v: string) => crypto.createHmac("sha256", secret()).update(v).digest("hex");

export function makeSessionToken(userId: string) {
  return `${userId}.${sign(userId)}`;
}
export function verifySessionToken(tok: string | undefined): string | null {
  if (!tok) return null;
  const [uid, mac] = tok.split(".");
  if (!uid || !mac) return null;
  const expected = sign(uid);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return uid;
}
export const sessionCookie = { name: COOKIE, options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" } };

export interface Session { userId: string; userName: string; orgId: string; role: string }

export async function getSession(): Promise<Session | null> {
  const uid = verifySessionToken((await cookies()).get(COOKIE)?.value);
  if (!uid) return null;
  const db = await getDb();
  const user = (await db.select().from(schema.users).where(eq(schema.users.id, uid)).get());
  if (!user) return null;
  const m = (await db.select().from(schema.organizationMembers).where(eq(schema.organizationMembers.userId, uid)).get());
  if (!m) return null;
  const org = (await db.select().from(schema.organizations).where(eq(schema.organizations.id, m.organizationId)).get());
  if (!org) return null;
  return { userId: uid, userName: user.name, orgId: org.id, role: m.role };
}

/** CSRF defence for cookie-authenticated mutations: require same-origin Origin/Host. */
export async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host || new URL(origin).host !== host) throw new HttpError(403, "Cross-origin request rejected");
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireSession(mutating = false): Promise<Session> {
  if (mutating) await assertSameOrigin();
  const s = await getSession();
  if (!s) throw new HttpError(401, "Not authenticated");
  return s;
}


