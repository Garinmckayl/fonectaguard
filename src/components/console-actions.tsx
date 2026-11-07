"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RotateCcw, Send } from "lucide-react";

export function ConsoleActions({ businessId, canSend }: { businessId: string; canSend: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(action: "send" | "reset") {
    if (action === "reset" && !confirm("Reset this business to its starting state (and clear its sandbox exceptions)?")) return;
    setBusy(action); setMsg(null);
    try {
      const r = (await fetch("/api/connect/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, businessId }) }).then((x) => x.json())) as { ok: boolean; error?: string; sent?: number; auto?: number; delivered?: string[] };
      setMsg(r.ok ? { ok: true, text: action === "reset" ? "Reset." : r.sent || r.auto ? `Contacted: ${r.sent} day(s)${r.auto ? `, ${r.auto} applied automatically (standing permission)` : ""} via ${r.delivered?.join(" + ") || "no live channel linked"}.` : "Nothing to suggest right now." } : { ok: false, text: r.error === "opted_out" ? "This customer has opted out of suggestions, so nobody was contacted." : r.error ?? "Failed" });
      router.refresh();
    } finally { setBusy(null); }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!!busy || !canSend} onClick={() => run("send")}>{busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Contact the owner now</button>
        <button className="btn btn-ghost" disabled={!!busy} onClick={() => run("reset")}>{busy === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Reset</button>
      </div>
      {msg && <p role="status" className={`text-sm font-medium ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}
