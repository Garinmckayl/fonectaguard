import Link from "next/link";
import { ShieldCheck, Radar, CheckCircle2, GitCompare, ArrowRight, Sparkles, Globe2 } from "lucide-react";
import { getSession } from "@/lib/auth";

export default async function Landing() {
  const s = await getSession();
  const steps = [
    [Radar, "Discover", "Searches the live web (TinyFish) for every page that mentions your business."],
    [GitCompare, "Compare", "AI reads each page; deterministic rules compare it with your verified facts."],
    [ShieldCheck, "Approve", "You approve every external change. Nothing is edited silently."],
    [CheckCircle2, "Verify", "The system re-reads the listing to prove the fix really landed."],
  ] as const;
  return (
    <main className="mx-auto max-w-6xl px-6 pb-24">
      <header className="flex items-center justify-between py-6">
        <span className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-slate-900"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/30"><ShieldCheck className="h-5 w-5" /></span>FonectaGuard</span>
        <Link href={s ? "/dashboard" : "/login"} className="btn btn-ghost">{s ? "Dashboard" : "Sign in"}</Link>
      </header>
      <section className="py-16 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"><Sparkles className="h-3.5 w-3.5" /> Powered by TinyFish live web agents + AI</span>
        <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl">Connect once.<br /><span className="text-gradient">Stay accurate everywhere.</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-500">FonectaGuard continuously checks where your business appears online, catches wrong phone numbers, hours and addresses, and closes the loop with approved, verified corrections.</p>
        <div className="mt-9 flex justify-center gap-3">
          <Link href={s ? "/dashboard" : "/login"} className="btn btn-primary h-12 px-6 text-base">{s ? "Open dashboard" : "Try it on your business"} <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="mx-auto mt-14 grid max-w-3xl grid-cols-3 gap-3 text-left">
          {[["Live web", "TinyFish search + fetch"], ["AI extraction", "OpenRouter, validated"], ["Human approval", "verified after every fix"]].map(([v, l]) => (
            <div key={l} className="card !p-4"><p className="text-lg font-semibold text-slate-900">{v}</p><p className="text-xs text-slate-500">{l}</p></div>
          ))}
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([Icon, t, d], i) => (
          <div key={t} className="card transition hover:-translate-y-0.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-accent"><Icon className="h-5 w-5" /></span>
            <p className="mt-4 text-xs font-medium text-slate-400">STEP {i + 1}</p>
            <h3 className="font-semibold text-slate-900">{t}</h3>
            <p className="mt-1 text-sm text-slate-500">{d}</p>
          </div>
        ))}
      </section>
      <p className="mt-12 flex items-center justify-center gap-2 text-center text-xs text-slate-500"><Globe2 className="h-4 w-4" /> Discovery (TinyFish), reading, AI extraction and website repairs (GitHub Pages commits) are real. Platforms that need partner approval are listed honestly; the sandbox directory is labelled as simulated.</p>
    </main>
  );
}
