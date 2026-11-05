import Link from "next/link";
import { ShieldCheck, Radar, CheckCircle2, GitCompare } from "lucide-react";
import { getSession } from "@/lib/auth";

export default async function Landing() {
  const s = await getSession();
  const steps = [
    [Radar, "Discover", "Finds your business across directories, maps and the web."],
    [GitCompare, "Compare", "Deterministic checks against your verified source of truth."],
    [ShieldCheck, "Approve", "You approve every external change. Nothing is edited silently."],
    [CheckCircle2, "Verify", "The system re-reads the listing to confirm the fix really landed."],
  ] as const;
  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <p className="text-sm font-medium text-accent">FonectaGuard</p>
      <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight text-white">Connect once. Stay accurate everywhere.</h1>
      <p className="mt-5 max-w-2xl text-lg text-zinc-400">An evidence-based, self-healing business presence platform: it continuously checks where your business appears online, detects drift from the truth, and closes the loop with approved, verified corrections.</p>
      <div className="mt-8 flex gap-3">
        <Link href={s ? "/dashboard" : "/login"} className="btn btn-primary">{s ? "Open dashboard" : "Try the demo"}</Link>
      </div>
      <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([Icon, t, d]) => (
          <div key={t} className="card">
            <Icon className="h-5 w-5 text-accent" />
            <h3 className="mt-3 font-medium text-white">{t}</h3>
            <p className="mt-1 text-sm text-zinc-400">{d}</p>
          </div>
        ))}
      </div>
      <p className="mt-10 text-xs text-zinc-500">The demo uses a fictional business and a clearly labelled simulated directory. No third-party platform is modified.</p>
    </main>
  );
}
