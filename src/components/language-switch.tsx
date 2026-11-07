"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const LANGS: [string, string][] = [["en", "EN"], ["fi", "FI"], ["sv", "SV"], ["nb", "NB"]];

/** The demo runs in English; flip one business to Finnish, Swedish or Norwegian to show the same messages in the owner's own language. */
export function LanguageSwitch({ businessId, current }: { businessId: string; current: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function set(language: string) {
    setBusy(true);
    try { await fetch("/api/connect/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "language", businessId, language }) }); router.refresh(); } finally { setBusy(false); }
  }
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Message language">
      <span className="mr-1 font-mono text-[11px] uppercase text-slate-500">Language</span>
      {LANGS.map(([k, label]) => <button key={k} disabled={busy} onClick={() => set(k)} className={`rounded-md border-[1.5px] border-ink px-2 py-0.5 font-mono text-xs font-bold ${current === k ? "bg-hi text-ink" : "bg-white text-slate-600 hover:bg-slate-100"}`}>{label}</button>)}
    </div>
  );
}
