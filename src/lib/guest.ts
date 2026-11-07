import { schema, type DB } from "./db";
import { newId, now } from "./ids";

/** Creates an isolated workspace (user + organization + owner membership). */
export async function createGuestWorkspace(db: DB) {
  const userId = newId(), orgId = newId();
  await db.insert(schema.users).values({ id: userId, name: "Business owner", email: `guest-${userId}@guest.fonectaguard.app`, createdAt: now() }).run();
  await db.insert(schema.organizations).values({ id: orgId, name: "My business", ownerUserId: userId, createdAt: now() }).run();
  await db.insert(schema.organizationMembers).values({ id: newId(), organizationId: orgId, userId, role: "owner" }).run();
  return { userId, orgId };
}
