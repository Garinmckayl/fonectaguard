"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, PhoneCall } from "lucide-react";

export function AlertsPanel({ businessId, asOf, asOfLabel }: { businessId: string; asOf: number | null; asOfLabel: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true); setMsg(null);
    try {
      const r = (await fetch("/api/connect/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "alerts", businessId, asOf: asOf ?? undefined }) }).then((x) => x.json())) as { ok: boolean; steps?: { date: string; step: string; outcome: string; why?: string }[]; error?: string };
      setMsg(!r.ok ? r.error ?? "Failed" : r.steps?.length ? r.steps.map((s) => `${s.step} for ${s.date}: ${s.outcome}${s.why ? ` (${s.why})` : ""}`).join("; ") : "Nothing is due: no critical finding, or the next step is not eligible yet.");
      router.refresh();
    } finally { setBusy(false); }
  }
  return (
    <div className="mt-3 space-y-2">
      <button className="btn btn-primary" disabled={busy || !asOf} onClick={run}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />} Escalate one step{asOfLabel ? ` (demo clock: ${asOfLabel})` : ""}</button>
      {msg && <p role="status" className="text-sm font-medium text-slate-700">{msg}</p>}
    </div>
  );
}
