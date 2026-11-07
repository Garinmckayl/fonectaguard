import { eq } from "drizzle-orm";
import { schema, type DB } from "../db";
import { asLang, T } from "./i18n";
import { emailParts, smsAutoText, smsText, whatsappMessage } from "./messages";
import { appUrl, autoApplyStanding, bundleOf, contactable, createMessage, getBiz, log, nextItems, whereItShows, type Biz, type Sug } from "./service";
import { hasTelegram, say, sendBundle, sendVoice } from "./telegram";
import { hasVoice, speak } from "./elevenlabs";
import { fmtDate, fmtHours } from "./i18n";
import { hasEmail, sendEmail } from "./email";
import { demoPhone, hasSms, sendSms } from "./sms";
import { recordSms, sendAutoSms } from "./sms-bot";
import { hasWhatsapp, sendWhatsapp, waKey } from "./whatsapp";

export const demoEmail = () => process.env.DEMO_EMAIL;

/** Contact step: one bundled message in the owner's language, with no-login decision buttons. Respects opt-outs and standing permissions. */
export async function sendNow(db: DB, businessId: string) {
  const biz = await getBiz(db, businessId);
  if (!biz) return { ok: false as const, reason: "not_found" };
  const blocked = contactable(biz);
  if (blocked) { await log(db, biz.id, "not_contacted", { reason: blocked }); return { ok: false as const, reason: blocked };
  }
  const auto = await autoApplyStanding(db, biz);
  if (auto.length) await notifyAuto(db, biz, auto);
  const items = await nextItems(db, biz);
  if (!items.length) return { ok: true as const, sent: 0, auto: auto.length, delivered: [] as string[] };
  const msg = await createMessage(db, biz, items);
  const delivered: string[] = [];
  const pending = new Set(items.map((i) => i.id));
  if (biz.telegramChatId && hasTelegram()) {
    try {
      const ref = await sendBundle(biz.telegramChatId, msg.bundle, pending, msg.id); delivered.push("telegram");
      await db.update(schema.cnMessages).set({ deliveredVia: "telegram", externalRef: String(ref) }).where(eq(schema.cnMessages.id, msg.id)).run();
      // Voice summary for owners who want it: the same facts, spoken, in their language (AI voice). They can answer by voice too.
      if (biz.voice && hasVoice()) {
        const l = asLang(biz.language), first = msg.bundle.items[0];
        const spoken = `${biz.contactName ? T[l].hi(biz.contactName) + " " : ""}${T[l].intro(items.length, biz.name)} ${first ? `${fmtDate(first.date, l)}: ${T[l].suggest} ${fmtHours(first.proposed, l)}.` : ""}`;
        const audio = await speak(spoken);
        if (audio) { await sendVoice(biz.telegramChatId, audio, "🔊 AI voice"); delivered.push("voice"); }
      }
    }
    catch (e) { await log(db, biz.id, "delivery_failed", { channel: "telegram", error: String(e) }); }
  }
  if (demoPhone() && hasSms()) {
    try { await recordSms(db, msg.id, demoPhone()!, await sendSms(demoPhone()!, smsText(msg.bundle))); delivered.push("sms"); }
    catch (e) { await log(db, biz.id, "delivery_failed", { channel: "sms", error: String(e) }); }
  }
  if (demoPhone() && hasWhatsapp()) {
    try { await recordSms(db, msg.id, waKey(demoPhone()!), await sendWhatsapp(demoPhone()!, whatsappMessage(msg.bundle))); delivered.push("whatsapp"); }
    catch (e) { await log(db, biz.id, "delivery_failed", { channel: "whatsapp", error: String(e) }); }
  }
  if (demoEmail() && hasEmail()) {
    try {
      const p = emailParts(msg.bundle);
      const note = `Demo delivery. This owner's real preference is ${biz.channel}${biz.bestWindow ? ` (best time ${biz.bestWindow}h)` : ""}; they would be contacted at ${biz.email ?? "their address on file"}.`;
      await sendEmail(demoEmail()!, { subject: p.subject, html: p.html.replace("</div>", `<p style="color:#9a3b05;font-size:12px;margin-top:16px">${note}</p></div>`), text: `${p.text}\n\n${note}` });
      delivered.push("email");
    } catch (e) { await log(db, biz.id, "delivery_failed", { channel: "email", error: String(e) }); }
  }
  await log(db, biz.id, "message_delivered", { messageId: msg.id, delivered, preferred: biz.channel });
  return { ok: true as const, sent: items.length, auto: auto.length, delivered, messageId: msg.id, url: msg.url, rendered: msg.rendered };
}

/** Standing permission: tell the owner what was changed, and offer undo. */
async function notifyAuto(db: DB, biz: Biz, done: Sug[]) {
  const l = asLang(biz.language), t = T[l];
  const lines = done.map((s) => `• ${s.date}: ${s.finalHours}`).join("\n");
  if (biz.telegramChatId && hasTelegram()) {
    await say(biz.telegramChatId, `${t.auto(done.length)}\n${lines}`, { reply_markup: { inline_keyboard: done.map((s) => [{ text: `↩️ ${t.undo} ${s.date}`, callback_data: `u:${s.id}` }]) } }).catch(() => undefined);
  }
  if (demoPhone() && hasSms()) await sendAutoSms(db, biz, done, demoPhone()!, appUrl(), smsAutoText).catch((e) => log(db, biz.id, "delivery_failed", { channel: "sms", error: String(e) }));
  if (demoEmail() && hasEmail()) await sendEmail(demoEmail()!, { subject: `${biz.name}: ${t.auto(done.length)}`, html: `<p>${t.auto(done.length)}</p><pre>${lines}</pre>`, text: `${t.auto(done.length)}\n${lines}` }).catch(() => undefined);
  await log(db, biz.id, "auto_notified", { dates: done.map((d) => d.date), shows: whereItShows(biz, l).map((x) => x.text) });
}
