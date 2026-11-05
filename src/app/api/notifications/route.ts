import { desc, eq } from "drizzle-orm";
import { route } from "@/lib/api";
import { schema } from "@/lib/db";
import { now } from "@/lib/ids";

export const GET = route(false, async ({ s, db }) => (await db.select().from(schema.notifications).where(eq(schema.notifications.userId, s.userId)).orderBy(desc(schema.notifications.createdAt)).limit(50).all()));

export const POST = route(true, async ({ s, db }) => {
  (await db.update(schema.notifications).set({ readAt: now() }).where(eq(schema.notifications.userId, s.userId)).run());
  return { ok: true };
});
