import { desc, eq } from "drizzle-orm";
import { route } from "@/lib/api";
import { schema } from "@/lib/db";
import { now } from "@/lib/ids";

export const GET = route(false, ({ s, db }) => db.select().from(schema.notifications).where(eq(schema.notifications.userId, s.userId)).orderBy(desc(schema.notifications.createdAt)).limit(50).all());

export const POST = route(true, ({ s, db }) => {
  db.update(schema.notifications).set({ readAt: now() }).where(eq(schema.notifications.userId, s.userId)).run();
  return { ok: true };
});
