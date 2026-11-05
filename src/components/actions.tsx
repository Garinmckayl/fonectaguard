"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export async function post(url: string, body?: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** Generic action button: calls an endpoint, shows errors, refreshes server data. */
export function ActionButton({ url, body, method, label, busyLabel, className = "btn btn-ghost", confirm, onDone }: { url: string; body?: unknown; method?: string; label: React.ReactNode; busyLabel?: string; className?: string; confirm?: string; onDone?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true); setErr(null);
          try { await post(url, body, method); onDone?.(); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
        }}
      >
        {busy ? busyLabel ?? "Working…" : label}
      </button>
      {err && <span role="alert" className="mt-1 text-xs text-red-400">{err}</span>}
    </span>
  );
}
