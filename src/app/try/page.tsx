import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { createTrial } from "@/lib/connect/trial";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Try FonectaGuard", robots: { index: false, follow: false } };

/** Opens your own copy of the demo owner's decision page. No login, no one is contacted; approving writes to the Yext sandbox. */
export default async function Try() {
  const r = await createTrial(await getDb());
  if (r.ok) redirect(`/d/${r.token}`);
  return <main className="mx-auto max-w-lg px-5 py-24"><h1 className="font-display text-3xl font-extrabold text-ink">Busy right now</h1><p className="mt-3 text-slate-600">Too many people are trying the demo at once. Reload in a minute.</p></main>;
}
