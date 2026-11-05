import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { CATALOG } from "@/lib/connectors";
import { Badge, PageHeader } from "@/components/ui";

const TONE: Record<string, string> = { demo_connector: "amber", read_only: "blue", write_enabled: "teal", connected: "teal" };

export default async function Connections() {
  const s = (await getSession())!;
  const conns = await (await getDb()).select().from(schema.connections).where(eq(schema.connections.organizationId, s.orgId)).all();
  return (
    <div>
      <PageHeader title="Connections" sub="Accurate capability states. Integrations that need partner approval or credentials are not faked." />
      <div className="grid gap-4 md:grid-cols-2">
        {CATALOG.map((c) => {
          const live = conns.find((x) => x.platform === c.platform);
          return (
            <div key={c.platform} className="card">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-slate-900">{c.label}</h3>
                <Badge tone={TONE[c.state] ?? "zinc"}>{c.state.replaceAll("_", " ")}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-500">{c.note}</p>
              <p className="mt-3 text-xs text-slate-500">Capabilities: {c.capabilities.length ? c.capabilities.join(", ") : "none available"}</p>
              {live && <p className="mt-1 text-xs text-slate-500">Authorization: {live.status} · token expiry: {live.expiresAt ? new Date(live.expiresAt).toLocaleString() : "n/a (simulated)"} · last sync: {live.lastSyncedAt ? new Date(live.lastSyncedAt).toLocaleString() : "never"}</p>}
              {!live && c.capabilities.length === 0 && <button className="btn btn-ghost mt-3" disabled title={c.note}>Unavailable in this build</button>}
              {c.manageUrl && <a className="mt-3 ml-0 inline-block text-xs text-accent underline" href={c.manageUrl} target="_blank" rel="noreferrer">Open management site</a>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
