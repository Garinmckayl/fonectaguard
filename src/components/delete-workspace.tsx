"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./actions";

export function DeleteWorkspace() {
  const router = useRouter();
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true); setErr(null);
    try { await post("/api/workspace/delete", { confirm: txt }); router.push("/"); router.refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); setBusy(false); }
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-700">Permanently deletes this workspace: your business details, scans, AI checks and their shareable reports, and every stored connection token. This cannot be undone.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input !w-48" placeholder='Type DELETE' value={txt} onChange={(e) => setTxt(e.target.value)} aria-label="Type DELETE to confirm" />
        <button className="btn btn-danger" disabled={busy || txt !== "DELETE"} onClick={go}>{busy ? "Deleting…" : "Delete my workspace"}</button>
      </div>
      {err && <p role="alert" className="font-medium text-red-700">{err}</p>}
    </div>
  );
}
