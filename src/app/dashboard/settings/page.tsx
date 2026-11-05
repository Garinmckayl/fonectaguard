import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getLocation } from "@/lib/queries";
import { loadCanonical } from "@/lib/canonical";
import { displayValue } from "@/lib/format";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { FIELD_LABELS, type FieldName } from "@/lib/compare";

export default async function Settings() {
  const s = (await getSession())!;
  const db = getDb();
  const loc = getLocation(db, s.orgId);
  if (!loc) return <Empty>No business yet.</Empty>;
  const canon = loadCanonical(db, loc.id);
  return (
    <div>
      <PageHeader title="Source of truth" sub="Only owner-verified values are treated as authoritative. AI suggestions never become canonical on their own." />
      <div className="card">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-zinc-500"><tr><th className="py-2">Field</th><th>Verified value</th><th>Version</th><th>Verified</th></tr></thead>
          <tbody>
            {(Object.keys(canon) as FieldName[]).map((f) => (
              <tr key={f} className="border-t border-line"><td className="py-2">{FIELD_LABELS[f]}</td><td>{displayValue(f, canon[f]!.value)}</td><td>v{canon[f]!.version}</td><td className="text-zinc-400">{new Date(canon[f]!.verifiedAt).toLocaleDateString()}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card mt-4 text-sm text-zinc-400">
        <p>Monitoring frequency: <Badge tone="teal">{loc.monitoringFrequency}</Badge> · Next scheduled scan: {loc.nextScanAt ? new Date(loc.nextScanAt).toLocaleString() : "not scheduled"}</p>
        <p className="mt-2 text-xs text-zinc-500">Scheduled scans run via the cron entry point (<code>/api/cron</code>), independent of the browser.</p>
      </div>
    </div>
  );
}
