import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/logo";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/" className="flex items-center gap-2.5"><LogoMark /><Wordmark /></Link>
      <h1 className="mt-10 font-display text-4xl font-extrabold tracking-tight text-ink">{title}</h1>
      <p className="mt-2 font-mono text-xs uppercase tracking-wider text-slate-500">Last updated {updated}</p>
      <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-slate-700 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_a]:font-semibold [&_a]:text-ink [&_a]:underline">{children}</div>
    </main>
  );
}
export const CONTACT = process.env.CONTACT_EMAIL;
