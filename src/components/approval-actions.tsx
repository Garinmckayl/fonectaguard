"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "./actions";

/** Approval controls: approve (optionally with an edited value), reject. */
export function ApprovalActions({ id, current, canAct }: { id: string; current: string; canAct: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(kind: "approve" | "reject") {
    setBusy(kind); setErr(null);
    try {
      await post(`/api/repairs/${id}/${kind}`, kind === "approve" ? { live: true, ...(editing && value !== current ? { editedValue: value } : {}) } : {});
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }
  if (!canAct) return <p className="text-sm text-slate-500">Your role cannot approve changes.</p>;
  return (
    <div className="space-y-3">
      {editing && (
        <label className="block text-sm">
          <span className="mb-1 block text-slate-500">Proposed value</span>
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={500} />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!!busy} onClick={() => run("approve")}>{busy === "approve" ? "Applying & verifying…" : "Approve Fix"}</button>
        <button className="btn btn-ghost" disabled={!!busy} onClick={() => { setEditing(!editing); setValue(current); }}>{editing ? "Cancel edit" : "Edit Proposed Value"}</button>
        <button className="btn btn-danger" disabled={!!busy} onClick={() => run("reject")}>Reject</button>
      </div>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
