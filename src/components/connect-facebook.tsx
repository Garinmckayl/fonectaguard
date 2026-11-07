"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionButton, post } from "./actions";

/** Facebook Page connect: real Facebook Login, pick the Page, then approved fixes are edits to that Page. */
export function ConnectFacebook({ pageName, pages, configured, flash, detail }: { pageName: string | null; pages: { id: string; name: string }[]; configured: boolean; flash?: string; detail?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const msg: Record<string, [boolean, string]> = {
    connected: [true, "Connected. Your Page is now monitored and approved fixes are saved to it."],
    choose: [true, "Logged in. Choose which Page to connect."],
    denied: [false, "Authorisation was cancelled on Facebook."],
    failed: [false, "Facebook login failed. Please try again."],
    state_mismatch: [false, "The login session expired. Please try again."],
    no_pages: [false, "Facebook shared no Page with the app. Make sure you manage a Page, then remove the app at facebook.com/settings?tab=business_tools and connect again, ticking your Page on the consent screen."],
    not_configured: [false, "Facebook login is not configured on this server."],
    forbidden: [false, "Your role cannot connect accounts."],
  };
  const m = flash ? msg[flash] : undefined;
  async function choose(id: string) {
    setBusy(id); setErr(null);
    try { await post("/api/connections/facebook/select", { pageId: id }); router.replace("/dashboard/connections?facebook=connected"); router.refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }
  return (
    <div className="mt-3 space-y-3 text-sm">
      {pageName ? (
        <>
          <p className="text-slate-700">Connected to the Page <b className="text-ink">{pageName}</b>. Approved fixes change its phone, opening hours or website, and are verified by re-reading the Page.</p>
          <ActionButton url="/api/connections/facebook/disconnect" label="Disconnect" busyLabel="Disconnecting…" confirm="Remove the stored Facebook Page token?" />
        </>
      ) : pages.length > 0 ? (
        <div className="space-y-2">
          <p className="font-medium text-ink">Choose the Page to connect:</p>
          {pages.map((p) => <button key={p.id} className="btn btn-ghost w-full justify-between" disabled={!!busy} onClick={() => choose(p.id)}>{p.name}<span className="font-mono text-xs text-slate-500">{busy === p.id ? "connecting…" : p.id}</span></button>)}
        </div>
      ) : configured ? (
        <a className="btn btn-primary" href="/api/connections/facebook/start">Connect Facebook Page</a>
      ) : <p className="text-slate-500">Not configured on this server.</p>}
      {m && <p role="status" className={m[0] ? "font-medium text-emerald-700" : "font-medium text-red-700"}>{m[1]}</p>}
      {detail && m && !m[0] && <p className="break-words rounded-lg border-[1.5px] border-ink bg-white px-3 py-2 font-mono text-xs text-slate-700">Facebook said: {detail}</p>}
      {err && <p role="alert" className="font-medium text-red-700">{err}</p>}
    </div>
  );
}
