import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/logo";

export default function Login() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 flex items-center gap-1 text-sm font-semibold text-ink hover:underline"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <div className="flex items-center gap-2.5"><LogoMark className="h-11 w-11" /><Wordmark className="!text-3xl" /></div>
      <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight text-ink">Start monitoring your <span className="hl">real</span> business</h1>
      <p className="mt-3 text-slate-600">No account needed. We create a private workspace for you.</p>
      <form action="/api/auth/guest" method="post" className="card-pop mt-8 flex flex-col !p-6">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-[1.5px] border-ink bg-hi"><Building2 className="h-5 w-5 text-ink" /></span>
        <h2 className="mt-4 font-display text-2xl font-bold text-ink">Monitor my business</h2>
        <p className="mt-1 flex-1 text-sm text-slate-600">Enter your website. We read it, search the live web for your listings, ask AI assistants about you and flag anything that disagrees with it. Just want a one-off look? <Link href="/" className="font-semibold text-ink underline">Run the free check</Link>.</p>
        <button className="btn btn-primary mt-6 h-12 text-base" type="submit">Start with my business</button>
      </form>
    </main>
  );
}
