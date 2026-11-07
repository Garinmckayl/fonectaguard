"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { post } from "@/components/actions";

const FIELDS = [["businessName", "Business name", true], ["city", "City", true], ["address", "Street address"], ["phone", "Main phone"], ["email", "Business email"], ["hours", "Opening hours (e.g. Mon-Fri 09:00-17:00)"]] as const;
const CONFIRMABLE: Record<string, string> = { businessName: "name", address: "address", phone: "phone", email: "email", hours: "hours" };
type Prefill = { name: string; address: string; phone: string; hours: string; email: string; city: string };

export default function Onboarding() {
  const router = useRouter();
  const [website, setWebsite] = useState("");
  const [v, setV] = useState<Record<string, string>>({});
  const [step, setStep] = useState<1 | 2>(1);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function read(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const url = /^https?:\/\//.test(website) ? website : `https://${website}`;
      setWebsite(url);
      const p = (await post("/api/onboarding/prefill", { website: url })) as Prefill;
      setV({ businessName: p.name, city: p.city, address: p.address, phone: p.phone, email: p.email, hours: p.hours });
      setStep(2);
    } catch (x) {
      setErr(`${x instanceof Error ? x.message : "Failed"} — you can fill the details in manually.`); setStep(2);
    } finally { setBusy(false); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const body = { website, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)), confirm: Object.keys(CONFIRMABLE).filter((k) => v[k]).map((k) => CONFIRMABLE[k]).concat("website") };
      await post("/api/businesses", body);
      router.push("/dashboard?scan=1");
    } catch (x) { setErr(x instanceof Error ? x.message : "Failed"); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Establish your business identity</h1>
      <p className="mt-2 text-slate-500">Your confirmed details become the single source of truth that every listing on the web is compared against.</p>
      {step === 1 ? (
        <form onSubmit={read} className="card mt-8 space-y-4">
          <label className="block text-sm font-medium text-slate-700" htmlFor="website">Your business website</label>
          <input id="website" className="input" required placeholder="yourbusiness.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
          {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading your website…</> : <><Wand2 className="h-4 w-4" /> Read my website</>}</button>
          <button type="button" className="w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-center text-xs text-slate-600 hover:bg-slate-50" onClick={() => setWebsite("https://garinmckayl.github.io/aurora-coffee-demo/")}>No site handy? Try <b>Aurora Coffee Roasters</b>: an example business with a real, live website you can connect and repair</button>
          <button type="button" className="w-full text-center text-xs text-slate-500 underline" onClick={() => { setWebsite((w) => (/^https?:\/\//.test(w) || !w ? w : `https://${w}`)); setStep(2); }}>Skip and enter details manually</button>
        </form>
      ) : (
        <form onSubmit={save} className="card mt-8 space-y-4">
          <p className="text-sm text-slate-500">Website: <span className="font-medium text-slate-800">{website || "—"}</span>. Review what we found — correct anything that's wrong. Filled fields are saved as verified.</p>
          {err && <p role="alert" className="text-sm text-amber-700">{err}</p>}
          {FIELDS.map(([k, label, req]) => (
            <div key={k}>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor={k}>{label}</label>
              <input id={k} className="input" required={!!req} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
            </div>
          ))}
          <div className="flex gap-3">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary flex-1" disabled={busy}>{busy ? "Saving…" : "Save and run first scan"}</button>
          </div>
        </form>
      )}
    </main>
  );
}
