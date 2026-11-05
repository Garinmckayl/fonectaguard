import Link from "next/link";
import { ArrowLeft, FlaskConical, Building2, ShieldCheck } from "lucide-react";

export default function Login() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-6 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white"><ShieldCheck className="h-5 w-5" /></span><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Get started with FonectaGuard</h1></div>
      <p className="mt-3 text-slate-500">No account needed. Pick how you want to try it.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <form action="/api/auth/guest" method="post" className="card flex flex-col !p-6 ring-2 ring-indigo-500/60">
          <Building2 className="h-6 w-6 text-accent" />
          <h2 className="mt-3 font-semibold text-slate-900">Monitor my real business</h2>
          <p className="mt-1 flex-1 text-sm text-slate-500">Enter your website. We read it, search the live web for your listings and flag anything that disagrees with it.</p>
          <button className="btn btn-primary mt-5" type="submit">Start with my business</button>
        </form>
        <form action="/api/auth/demo" method="post" className="card flex flex-col !p-6">
          <FlaskConical className="h-6 w-6 text-amber-500" />
          <h2 className="mt-3 font-semibold text-slate-900">Explore the demo</h2>
          <p className="mt-1 flex-1 text-sm text-slate-500">A fictional coffee shop with simulated directories, including the full approve → repair → verify loop.</p>
          <button className="btn btn-ghost mt-5" type="submit">Open demo workspace</button>
        </form>
      </div>
    </main>
  );
}
