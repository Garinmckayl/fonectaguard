"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2, Radar, CheckCircle2, AlertTriangle } from "lucide-react";
import { post } from "./actions";

interface Ev { id: string; eventType: string; message: string; createdAt: number }

/** Starts a real scan and polls its persisted events until completion. */
export function LiveScan({ locationId }: { locationId: string }) {
  const router = useRouter();
  const [events, setEvents] = useState<Ev[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);

  async function start() {
    setErr(null); setEvents([]); setStatus("running");
    try {
      const { scanId } = await post(`/api/businesses/${locationId}/scan`, { live: true });
      timer.current = setInterval(async () => {
        const r = await fetch(`/api/scans/${scanId}/events`);
        if (!r.ok) return;
        const d = await r.json();
        setEvents(d.events);
        if (d.scan.status !== "running") { clearInterval(timer.current); setStatus(d.scan.status); router.refresh(); }
      }, 500);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); setStatus("failed"); }
  }

  return (
    <div>
      <button className="btn btn-primary" onClick={start} disabled={status === "running"}>
        {status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />} {status === "running" ? "Scanning…" : "Run Live Scan"}
      </button>
      {err && <p role="alert" className="mt-2 text-sm text-red-400">{err}</p>}
      {status !== "idle" && (
        <ol aria-live="polite" className="card fade-in mt-4 max-h-72 space-y-2 overflow-auto text-sm">
          {events.map((e) => (
            <li key={e.id} className="fade-in flex gap-2">
              {e.eventType === "discrepancy_detected" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
              <span>{e.message}</span>
            </li>
          ))}
          {status === "running" && <li className="flex gap-2 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> working…</li>}
        </ol>
      )}
    </div>
  );
}
