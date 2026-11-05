"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { post } from "./actions";

export function VerifyDomain({ locationId, host, token }: { locationId: string; host: string; token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function check() {
    setBusy(true); setMsg(null);
    try {
      const r = (await post(`/api/businesses/${locationId}/verify`)) as { ok: boolean; detail: string };
      setMsg({ ok: r.ok, text: r.detail });
      if (r.ok) router.refresh();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" }); } finally { setBusy(false); }
  }
  const code = "rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 break-all";
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">Prove you control <b>{host}</b> by doing <b>one</b> of these, then press Verify:</p>
      <ol className="list-decimal space-y-2 pl-5 text-slate-600">
        <li>DNS TXT record on <code className={code}>_fonectaguard.{host}</code> with value <code className={code}>{token}</code></li>
        <li>Add to your homepage &lt;head&gt;: <code className={code}>{`<meta name="fonectaguard-verification" content="${token}">`}</code></li>
        <li>Serve <code className={code}>/.well-known/fonectaguard.txt</code> containing <code className={code}>{token}</code></li>
      </ol>
      <button className="btn btn-primary" onClick={check} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify ownership</button>
      {msg && <p role="status" className={msg.ok ? "text-emerald-700" : "text-amber-700"}>{msg.text}</p>}
    </div>
  );
}
