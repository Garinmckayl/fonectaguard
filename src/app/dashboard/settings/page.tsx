import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getLocation } from "@/lib/queries";
import { isUnconfirmed, loadCanonical } from "@/lib/canonical";
import { ConfirmProfile } from "@/components/confirm-profile";
import { CopyBlock } from "@/components/copy-block";
import { DeleteWorkspace } from "@/components/delete-workspace";
import { AccessLink } from "@/components/access-link";
import { makeSessionToken } from "@/lib/auth";
import { buildJsonLd } from "@/lib/jsonld";
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
      {(
        <div className="card mb-4">
          <h2 className="mb-3 flex items-center gap-2 font-medium text-slate-900">Domain ownership {loc.verificationStatus === "verified" ? <Badge tone="teal">Verified</Badge> : <Badge tone="amber">Not verified</Badge>}</h2>
          {loc.verificationStatus === "verified" ? <p className="text-sm text-slate-600">Ownership of your domain is confirmed. You can approve corrections.</p> : loc.website ? <VerifyDomain locationId={loc.id} host={new URL(loc.website).hostname.replace(/^www\./, "")} token={verificationToken(loc.id)} /> : null}
        </div>
      )}
      <div className="card">
        <h2 className="mb-1 font-medium text-slate-900">Your business details</h2>
        <p className="mb-4 text-xs text-slate-500">These are what every listing and AI answer is compared against. Correct anything that is wrong, then confirm. Corrections are never approved against details you have not confirmed.</p>
        <ConfirmProfile locationId={loc.id} rows={(["name", "address", "phone", "hours", "website"] as FieldName[]).filter((f) => canon[f]).map((f) => ({ field: f, label: FIELD_LABELS[f], value: displayValue(f, canon[f]!.value), source: isUnconfirmed(canon[f]) ? "unconfirmed" as const : "confirmed" as const }))} />
      </div>
      {canon.name && (
        <div className="card mt-4">
          <h2 className="font-display text-lg font-bold text-ink">Fix any website: structured data</h2>
          <p className="mb-3 mt-1 text-xs text-slate-500">AI assistants and search engines read this block. Paste it into the <code>&lt;head&gt;</code> of your site (WordPress, Wix, Squarespace, anything) and replace any older LocalBusiness block. Built from the details you confirmed above.</p>
          <CopyBlock text={buildJsonLd({ name: String(canon.name.value), address: canon.address ? String(canon.address.value) : undefined, city: loc.city, phone: canon.phone ? String(canon.phone.value) : undefined, hours: canon.hours?.value, website: canon.website ? String(canon.website.value) : loc.website ?? undefined, email: loc.email })} label="Copy snippet" />
        </div>
      )}
      <div className="card mt-4">
        <h2 className="mb-2 font-display text-lg font-bold text-ink">Private access link</h2>
        <AccessLink token={makeSessionToken(s.userId)} />
      </div>
      <div className="card mt-4 !border-[#9B1C12]">
        <h2 className="font-display text-lg font-bold text-[#9B1C12]">Delete my workspace</h2>
        <div className="mt-2"><DeleteWorkspace /></div>
      </div>
      <div className="card mt-4 text-sm text-slate-500">
        <p>Monitoring frequency: <Badge tone="teal">{loc.monitoringFrequency}</Badge> · Next scheduled scan: {loc.nextScanAt ? new Date(loc.nextScanAt).toLocaleString() : "not scheduled"}</p>
        <p className="mt-2 text-xs text-slate-500">Scheduled scans run via the cron entry point (<code>/api/cron</code>), independent of the browser.</p>
      </div>
    </div>
  );
}
