import { desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { Empty, PageHeader } from "@/components/ui";

export default async function Activity() {
  const s = (await getSession())!;
  const events = await (await getDb()).select().from(schema.agentEvents).where(eq(schema.agentEvents.organizationId, s.orgId)).orderBy(desc(schema.agentEvents.createdAt)).limit(200).all();
  return (
    <div>
      <PageHeader title="Agent activity" sub="Every step the system performed. Recorded events only — nothing simulated by the UI." />
      {events.length === 0 ? <Empty>No activity yet.</Empty> : (
        <ol className="card space-y-3 border-l-2 border-accent/30">
          {events.map((e) => (
            <li key={e.id} className="text-sm">
              <div className="flex flex-wrap items-baseline gap-2"><time className="text-xs text-slate-500" dateTime={new Date(e.createdAt).toISOString()}>{new Date(e.createdAt).toLocaleString()}</time><span className="rounded bg-slate-100 px-1.5 text-xs text-slate-500">{e.eventType}</span></div>
              <p className="text-slate-700">{e.message}</p>
              {typeof e.metadataJson?.url === "string" && <p className="text-xs text-slate-500">{e.metadataJson.url}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
