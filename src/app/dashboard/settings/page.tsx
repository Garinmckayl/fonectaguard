import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getLocation } from "@/lib/queries";
import { loadCanonical } from "@/lib/canonical";
import { displayValue } from "@/lib/format";
import { VerifyDomain } from "@/components/verify-domain";
import { verificationToken } from "@/lib/verify";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { FIELD_LABELS, type FieldName } from "@/lib/compare";

export default async function Settings() {
  const s = (await getSession())!;
  const db = await getDb();
  const loc = await getLocation(db, s.orgId);
  if (!loc) return <Empty>No business yet.</Empty>;
  const canon = await loadCanonical(db, loc.id);
  return (
    <div>
      <PageHeader title="Source of truth" sub="Only owner-verified values are treated as authoritative. AI suggestions never become canonical on their own." />
      {!s.isDemo && (
        <div className="card mb-4">
          <h2 className="mb-3 flex items-center gap-2 font-medium text-slate-900">Domain ownership {loc.verificationStatus === "verified" ? <Badge tone="teal">Verified</Badge> : <Badge tone="amber">Not verified</Badge>}</h2>
          {loc.verificationStatus === "verified" ? <p className="text-sm text-slate-600">Ownership of your domain is confirmed. You can approve corrections.</p> : loc.website ? <VerifyDomain locationId={loc.id} host={new URL(loc.website).hostname.replace(/^www\./, "")} token={verificationToken(loc.id)} /> : null}
        </div>
      )}
      <div className="card">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Field</th><th>Verified value</th><th>Version</th><th>Verified</th></tr></thead>
          <tbody>
            {(Object.keys(canon) as FieldName[]).map((f) => (
              <tr key={f} className="border-t border-line"><td className="py-2">{FIELD_LABELS[f]}</td><td>{displayValue(f, canon[f]!.value)}</td><td>v{canon[f]!.version}</td><td className="text-slate-500">{new Date(canon[f]!.verifiedAt).toLocaleDateString()}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card mt-4 text-sm text-slate-500">
        <p>Monitoring frequency: <Badge tone="teal">{loc.monitoringFrequency}</Badge> · Next scheduled scan: {loc.nextScanAt ? new Date(loc.nextScanAt).toLocaleString() : "not scheduled"}</p>
        <p className="mt-2 text-xs text-slate-500">Scheduled scans run via the cron entry point (<code>/api/cron</code>), independent of the browser.</p>
      </div>
    </div>
  );
}
