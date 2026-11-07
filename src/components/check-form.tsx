"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

const EXAMPLES: [string, string][] = [["Brasa", "brasa.fi"], ["Ravintola Sunn", "ravintolasunn.fi"], ["Café Engel", "cafeengel.fi"], ["Café Ursula", "ursula.fi"]];

/** Public entry point: paste a business website, get a real AI-search check. No signup. */
export function CheckForm({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const j = (await res.json().catch(() => ({}))) as { auditId?: string; error?: string };
      if (!res.ok || !j.auditId) throw new Error(j.error ?? `Request failed (${res.status})`);
      router.push(`/report/${j.auditId}`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Something went wrong"); setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className={className} aria-label="Check what AI says about a business">
      <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-ink bg-white p-2.5 shadow-pop sm:flex-row sm:items-center">
        <input className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-base text-ink placeholder:text-slate-400 focus:outline-none" inputMode="url" autoComplete="url" placeholder="yourbusiness.fi" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Business website" disabled={busy} required />
        <button className="btn btn-primary h-12 px-6 text-base" type="submit" disabled={busy || !url.trim()}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading the site…</> : <>Check what AI says <ArrowRight className="h-4 w-4" /></>}
        </button>
      </div>
      {err && <p role="alert" className="mt-3 rounded-lg border-[1.5px] border-red-700 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{err}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="font-semibold text-ink">Try a real Helsinki business:</span>
        {EXAMPLES.map(([n, u]) => (
          <button key={u} type="button" className="rounded-full border-[1.5px] border-ink bg-panel px-3 py-1 font-medium text-ink transition hover:bg-hi" onClick={() => setUrl(u)} disabled={busy}>{n}</button>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">Free, no signup, read-only: we read the public site and ask AI assistants about the business. Nothing is changed.</p>
    </form>
  );
}
