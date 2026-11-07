import { Check, Minus, X, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui";
import type { PublicSources } from "@/lib/public-sources";

const STATE = {
  match: { icon: Check, cls: "text-accent", text: "matches the website" },
  missing: { icon: Minus, cls: "text-[#9A3B05]", text: "missing on OpenStreetMap" },
  differs: { icon: X, cls: "text-[#B4231A]", text: "differs from the website" },
} as const;

/** Open public data about the business, found without any partner approval: OpenStreetMap and the Finnish Trade Register. */
export function PublicSourcesPanel({ data }: { data: PublicSources }) {
  const { osm, registry, directory } = data;
  if (!osm && !registry && !directory) return null;
  const gaps = osm?.checks.filter((c) => c.state !== "match") ?? [];
  return (
    <section className="mt-6" aria-label="Other places customers find this business">
      <h2 className="font-display text-xl font-bold text-ink">Other places customers find you</h2>
      <p className="mt-1 text-xs text-slate-500">Open public data, checked live. No partner access needed.</p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {directory && (
          <div className="card md:col-span-2">
            <div className="flex items-center justify-between gap-2"><h3 className="font-display text-lg font-bold text-ink">{directory.source} listing</h3>{directory.checks.some((c) => c.state !== "match") ? <Badge tone="amber">differs from the website</Badge> : <Badge tone="teal">matches the website</Badge>}</div>
            <p className="mt-1 text-xs text-slate-500">The business&apos;s own profile on {directory.source}, read live and compared with what its website says.</p>
            <ul className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              {directory.checks.map((c) => { const S = c.state === "match" ? STATE.match : c.state === "missing" ? { icon: Minus, cls: "text-[#9A3B05]", text: "missing on the listing" } : STATE.differs; return <li key={c.field} className="flex items-start gap-2"><S.icon className={`mt-0.5 h-4 w-4 shrink-0 ${S.cls}`} strokeWidth={3} /><span><b className="text-ink">{c.label}</b> <span className="text-slate-600">{c.state === "match" ? "matches" : c.state === "missing" ? S.text : `differs: "${c.listed}"`}</span></span></li>; })}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm font-semibold"><a className="inline-flex items-center gap-1 text-ink underline" href={directory.url} target="_blank" rel="noreferrer">View the listing <ExternalLink className="h-3.5 w-3.5" /></a><a className="inline-flex items-center gap-1 text-ink underline" href="https://fonectaconnect.fi" target="_blank" rel="noreferrer">Correct it through Fonecta Connect <ExternalLink className="h-3.5 w-3.5" /></a></div>
          </div>
        )}
        {osm && (
          <div className="card">
            <div className="flex items-center justify-between gap-2"><h3 className="font-display text-lg font-bold text-ink">OpenStreetMap</h3>{osm.found ? (gaps.length ? <Badge tone="amber">incomplete</Badge> : <Badge tone="teal">complete</Badge>) : <Badge tone="red">not listed</Badge>}</div>
            <p className="mt-1 text-xs text-slate-500">The open map behind many apps and navigation tools.</p>
            {osm.found ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {osm.checks.map((c) => { const S = STATE[c.state]; return <li key={c.field} className="flex items-start gap-2"><S.icon className={`mt-0.5 h-4 w-4 shrink-0 ${S.cls}`} strokeWidth={3} /><span><b className="text-ink">{c.label}</b> <span className="text-slate-600">{S.text}{c.osm && c.state === "differs" ? `: "${c.osm}"` : ""}</span></span></li>; })}
              </ul>
            ) : <p className="mt-3 text-sm text-slate-700">This business is not on OpenStreetMap, so anything that builds on it cannot show it.</p>}
            <a className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-ink underline" href={osm.found ? (gaps.length ? osm.editUrl : osm.url) : "https://www.openstreetmap.org/edit"} target="_blank" rel="noreferrer">{osm.found ? (gaps.length ? "Add the missing details" : "View the entry") : "Add the business"} <ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
        )}
        {registry && (
          <div className="card">
            <div className="flex items-center justify-between gap-2"><h3 className="font-display text-lg font-bold text-ink">Finnish Trade Register</h3><Badge tone="teal">registered</Badge></div>
            <p className="mt-1 text-xs text-slate-500">Official data from PRH. Confirms who is behind the business.</p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-slate-500">Company</dt><dd className="text-ink">{registry.legalName} <span className="font-mono text-xs text-slate-500">{registry.businessId}</span></dd></div>
              {registry.tradeNames.length > 0 && <div className="flex gap-2"><dt className="w-24 shrink-0 text-slate-500">Trade names</dt><dd className="text-ink">{registry.tradeNames.join(", ")}</dd></div>}
              {registry.address && <div className="flex gap-2"><dt className="w-24 shrink-0 text-slate-500">Registered</dt><dd className="text-ink">{registry.address}{registry.addressCheck === "match" ? <span className="ml-1 text-accent">· matches the website</span> : registry.addressCheck === "differs" ? <span className="ml-1 text-slate-500">· registered office; may differ from the venue</span> : null}</dd></div>}
              {registry.websiteMatches && <div className="flex gap-2"><dt className="w-24 shrink-0 text-slate-500">Website</dt><dd className="text-accent">registered website matches</dd></div>}
            </dl>
            <a className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-ink underline" href={registry.url} target="_blank" rel="noreferrer">View the register entry <ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
        )}
      </div>
    </section>
  );
}
