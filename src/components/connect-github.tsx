"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Link2, Zap } from "lucide-react";
import { post } from "./actions";

export function ConnectGithub({ connectedRepo, website }: { connectedRepo: string | null; website: string | null }) {
  const router = useRouter();
  const [repo, setRepo] = useState("Garinmckayl/aurora-coffee-demo");
  const [busy, setBusy] = useState<"connect" | "stale" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(kind: "connect" | "stale") {
    setBusy(kind); setMsg(null);
    try {
      if (kind === "connect") {
        await post("/api/connections/github", { repo });
        setMsg({ ok: true, text: "Connected. Ownership verified through write access to the repository." });
      } else {
        const r = (await post("/api/connections/github/stale")) as { live: boolean };
        setMsg({ ok: true, text: r.live ? "Committed to GitHub and the live site is now outdated. Run a rescan to detect it." : "Committed to GitHub; Pages is still deploying. Rescan in a minute." });
      }
      router.refresh();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" }); } finally { setBusy(null); }
  }
  return (
    <div className="mt-3 space-y-3 text-sm">
      {connectedRepo ? (
        <>
          <p className="text-slate-600">Connected to <a className="text-accent underline" href={`https://github.com/${connectedRepo}`} target="_blank" rel="noreferrer">{connectedRepo}</a>. Approved fixes are committed there.</p>
          <button className="btn btn-ghost" onClick={() => run("stale")} disabled={!!busy}>{busy === "stale" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Make my website outdated (real commit)</button>
        </>
      ) : (
        <>
          <label className="block text-xs text-slate-500">GitHub repository serving {website ?? "your website"}</label>
          <input className="input w-full" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" />
          <button className="btn btn-primary" onClick={() => run("connect")} disabled={!!busy || !repo}>{busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Connect GitHub Pages</button>
        </>
      )}
      {msg && <p role="status" className={msg.ok ? "text-emerald-700" : "text-amber-700"}>{msg.text}</p>}
    </div>
  );
}
