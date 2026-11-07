"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./actions";

type Row = { field: string; label: string; value: string; source: "unconfirmed" | "confirmed" };

/** Lets the owner check, correct and confirm the facts that become the source of truth. */
export function ConfirmProfile({ locationId, rows }: { locationId: string; rows: Row[] }) {
  const router = useRouter();
  const [vals, setVals] = useState(Object.fromEntries(rows.map((r) => [r.field, r.value])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pending = rows.some((r) => r.source === "unconfirmed");
  async function save() {
    setBusy(true); setMsg(null);
    try { await post(`/api/businesses/${locationId}/profile`, { fields: vals }); setMsg({ ok: true, text: "Confirmed. These are now your source of truth." }); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" }); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <label key={r.field} className="block text-sm">
          <span className="flex items-center gap-2 text-xs text-slate-500">{r.label}{r.source === "unconfirmed" ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 text-amber-600">read from website, not confirmed</span> : <span className="rounded-full border border-accent/30 bg-accent/10 px-2 text-accent">confirmed by owner</span>}</span>
          <input className="input mt-1" value={vals[r.field] ?? ""} onChange={(e) => setVals({ ...vals, [r.field]: e.target.value })} />
        </label>
      ))}
      <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : pending ? "These are correct: confirm" : "Save changes"}</button>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
