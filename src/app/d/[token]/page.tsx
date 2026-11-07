import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getBiz, sugsFor, toItem } from "@/lib/connect/service";
import { asLang, T } from "@/lib/connect/i18n";
import { choices, isAskItem, lines } from "@/lib/connect/messages";
import { DecideBoard } from "@/components/decide-board";
import { LogoMark } from "@/components/logo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your opening hours · Fonecta Connect", robots: { index: false, follow: false } };

export default async function Decide(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const db = await getDb();
  const msg = await db.select().from(schema.cnMessages).where(eq(schema.cnMessages.token, token)).get();
  if (!msg) notFound();
  const biz = (await getBiz(db, msg.businessId))!, lang = asLang(biz.language), t = T[lang];
  const items = (await sugsFor(db, biz.id)).filter((s) => s.messageId === msg.id);
  const board = items.map((s) => { const it = toItem(s), x = lines(it, lang), ask = isAskItem(it); return { id: s.id, when: x.when, shows: x.shows, suggest: ask ? t.askQ : x.suggest, why: x.why, status: s.status, proposed: s.proposed, choices: ask ? choices(it, lang) : undefined, cost: x.cost }; });
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <div className="flex items-center gap-2.5"><LogoMark className="h-8 w-8" /><span className="font-display text-lg font-extrabold text-ink">Fonecta<span className="text-brand-deep">Connect</span></span></div>
      <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink">{biz.contactName ? t.hi(biz.contactName) : biz.name}</h1>
      <p className="mt-2 text-slate-600">{t.intro(items.length, biz.name)}</p>
      <div className="mt-6"><DecideBoard token={token} items={board} labels={{ approve: t.approve, edit: t.edit, decline: t.decline, approveAll: t.approveAll, undo: t.undo, whereShows: t.whereShows, savedIn: t.savedIn, editPrompt: t.editPrompt, save: t.approve, cancel: "×", declined: t.declined, undone: t.undone, alreadyDone: t.alreadyDone, because: t.because, kept: t.kept, whyMatters: t.whyMatters }} /></div>
      <p className="mt-8 text-sm text-slate-500">{t.final}</p>
    </main>
  );
}
