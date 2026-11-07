import { eq } from "drizzle-orm";
import { schema, type DB } from "../db";
import { asLang, T } from "./i18n";
import { bundleOf, decide, getBiz, getSug, isAsk, popAwaiting, setAwaiting, sugsFor, undoSuggestion, whereItShows, type Biz, type DecideResult } from "./service";
import { keyboard, say, answer, tg, fileBytes, sendVoice } from "./telegram";
import { applyChange, getChange, handleOwnerInput, undoChange, type AgentReply, type Input } from "./agent";
import { computeIssues, radarText } from "./radar";
import { enqueueAgentJob } from "./agent-jobs";
import { hasVoice, speak, transcribe } from "./elevenlabs";
import { whereItShows as shows } from "./service";
import { telegramText } from "./messages";
import { sendNow } from "./deliver";

type Update = { message?: { chat: { id: number }; text?: string; caption?: string; photo?: { file_id: string; file_size?: number }[]; voice?: { file_id: string }; audio?: { file_id: string }; from?: { first_name?: string } }; callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } } };
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function bizByChat(db: DB, chatId: string) { return db.select().from(schema.cnBusinesses).where(eq(schema.cnBusinesses.telegramChatId, chatId)).get(); }

function confirmText(r: DecideResult, biz: Biz): string {
  const l = asLang(biz.language), t = T[l];
  const shows = (r.shows ?? []).slice(0, 6).map((x) => `${x.live ? "•" : "◦"} ${esc(x.text)}`).join("\n");
  return `✅ <b>${esc(r.text)}</b>\n${esc(t.savedIn)}\n\n<b>${esc(t.whereShows)}</b>\n${shows}`;
}

/** Re-draws the original message so decided days drop out of the keyboard and adjusted days show their new hours. */
async function refresh(db: DB, biz: Biz, chatId: string, messageId: number, sug: { messageId: string | null }) {
  if (!sug.messageId) return;
  const msg = await db.select().from(schema.cnMessages).where(eq(schema.cnMessages.id, sug.messageId)).get();
  if (!msg) return;
  const all = (await sugsFor(db, biz.id)).filter((s) => s.messageId === msg.id);
  const b = bundleOf(biz, all, `${process.env.APP_URL ?? ""}/d/${msg.token}`);
  const pending = new Set(all.filter((s) => s.status === "sent").map((s) => s.id));
  await tg("editMessageText", { chat_id: chatId, message_id: messageId, text: telegramText(b), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: keyboard(b, b.lang, pending, msg.id) }).catch(() => undefined);
}

async function after(db: DB, biz: Biz, chatId: string, r: DecideResult, origMsgId?: number) {
  const l = asLang(biz.language), t = T[l];
  if (!r.ok) { await say(chatId, esc(r.text)); return; }
  const undo = r.suggestion && ["applied", "auto_applied"].includes(r.suggestion.status) ? { reply_markup: { inline_keyboard: [[{ text: `↩️ ${t.undo}`, callback_data: `u:${r.suggestion.id}` }]] } } : {};
  await say(chatId, r.suggestion?.status === "declined" || r.suggestion?.status === "kept" ? esc(r.text) : confirmText(r, biz), undo);
  if (r.adjusted?.length) await say(chatId, `🔁 ${r.adjusted.map((a) => `${esc(a.date)}: ${esc(a.proposed ?? "")}`).join(", ")}\n<i>${esc(t.adjusted(r.suggestion!.date))}</i>`);
  if (origMsgId && r.suggestion) await refresh(db, biz, chatId, origMsgId, r.suggestion);
}

/** Sends the agent's answer with one Apply / Cancel row per proposed change, and as a voice note when the owner spoke (or prefers voice). */
async function sendAgentReply(db: DB, biz: Biz, chatId: string, r: AgentReply) {
  const t = { en: ["Apply", "Apply all"], fi: ["Ota käyttöön", "Ota kaikki käyttöön"], sv: ["Tillämpa", "Tillämpa alla"], nb: ["Bruk", "Bruk alle"] }[asLang(biz.language)];
  const rows = r.changes.map((c) => [{ text: `✅ ${t[0]}: ${c.label.slice(0, 38)}`, callback_data: `ap:${c.id}` }, { text: "✖️", callback_data: `ax:${c.id}` }]);
  if (r.changes.length > 1) rows.push([{ text: `✅ ${t[1]} (${r.changes.length})`, callback_data: `aA:${r.changes[0].id}` }]);
  await say(chatId, esc(r.text), rows.length ? { reply_markup: { inline_keyboard: rows } } : {});
  if (r.speak && hasVoice()) { const a = await speak(r.text.replace(/[•✅]/g, "")); if (a) await sendVoice(chatId, a).catch(() => undefined); }
  if (r.presence) await enqueueAgentJob(db, { type: "presence", businessId: biz.id, chatId, voice: r.speak });
  if (r.site) await enqueueAgentJob(db, { type: "site", businessId: biz.id, chatId, voice: r.speak, site: r.site });
}

async function ownerInput(db: DB, biz: Biz, chatId: string, input: Input) {
  await sendAgentReply(db, biz, chatId, await handleOwnerInput(db, biz.id, input));
}

const mimeOf = (path: string) => (/\.png$/i.test(path) ? "image/png" : /\.webp$/i.test(path) ? "image/webp" : "image/jpeg");

export async function handleUpdate(db: DB, u: Update) {
  const m = u.message;
  if (m && (m.photo?.length || m.voice || m.audio)) {
    const chatId = String(m.chat.id), biz = await bizByChat(db, chatId);
    if (!biz) { await say(chatId, "Open the link from your Connect invitation first."); return; }
    if (m.photo?.length) {
      const f = await fileBytes(m.photo[m.photo.length - 1].file_id);
      if (!f) { await say(chatId, "I couldn't open that photo. Please send it again."); return; }
      await ownerInput(db, biz, chatId, { text: m.caption, image: { mime: mimeOf(f.path), b64: Buffer.from(f.bytes).toString("base64") }, source: "photo" });
    } else {
      const f = await fileBytes((m.voice ?? m.audio)!.file_id), tr = f ? await transcribe(f.bytes) : null;
      if (!tr) { await say(chatId, "I couldn't hear that clearly. Could you say it again, or type it?"); return; }
      await say(chatId, `🎤 <i>${esc(tr.text)}</i>`);
      await ownerInput(db, biz, chatId, { text: tr.text, source: "voice" });
    }
    return;
  }
  if (u.message?.text !== undefined) {
    const chatId = String(u.message.chat.id), text = u.message.text.trim();
    const start = text.match(/^\/start(?:\s+(\S+))?/);
    if (start) {
      if (!start[1]) { await say(chatId, "Hi! Open the link from your Connect invitation to link this chat to your business."); return; }
      const biz = await db.select().from(schema.cnBusinesses).where(eq(schema.cnBusinesses.linkCode, start[1])).get();
      if (!biz) { await say(chatId, "That link is not valid any more."); return; }
      await db.update(schema.cnBusinesses).set({ telegramChatId: chatId }).where(eq(schema.cnBusinesses.id, biz.id)).run();
      await say(chatId, `🔗 ${esc(T[asLang(biz.language)].linked(biz.name))}`);
      return;
    }
    const biz = await bizByChat(db, chatId);
    if (!biz) { await say(chatId, "Open the link from your Connect invitation first."); return; }
    if (/^\/voice/.test(text)) { const on = !biz.voice; await db.update(schema.cnBusinesses).set({ voice: on ? 1 : 0 }).where(eq(schema.cnBusinesses.id, biz.id)).run(); await say(chatId, on ? "🔊 Voice replies on (AI voice)." : "🔇 Voice replies off."); return; }
    if (/^\/(issues|radar)/.test(text)) { await say(chatId, esc(radarText(await computeIssues(db, biz), biz.language))); return; }
    if (/^\/(status|presence)/.test(text)) { await ownerInput(db, biz, chatId, { text: "How is my online presence?", source: "text" }); return; }
    if (/^\/audit\s+\S+/.test(text)) { await ownerInput(db, biz, chatId, { text: `Audit the website ${text.replace(/^\/audit\s+/, "")}`, source: "text" }); return; }
    if (/^\/(suggest|send)/.test(text)) { const r = await sendNow(db, biz.id); if (r.ok && !r.sent) await say(chatId, "No new suggestions right now."); return; }
    const sid = await popAwaiting(db, biz.id);
    if (!sid) { await ownerInput(db, biz, chatId, { text, source: "text" }); return; }
    const r = await decide(db, sid, { action: "edit", text });
    if (r.needsRetry) { await setAwaiting(db, biz.id, sid); await say(chatId, esc(r.text)); return; }
    await after(db, biz, chatId, r);
    if (r.suggestion?.messageId) {
      const msg = await db.select().from(schema.cnMessages).where(eq(schema.cnMessages.id, r.suggestion.messageId)).get();
      if (msg?.externalRef) await refresh(db, biz, chatId, Number(msg.externalRef), r.suggestion);
    }
    return;
  }
  const cq = u.callback_query;
  if (!cq?.data || !cq.message) return;
  const chatId = String(cq.message.chat.id), biz = await bizByChat(db, chatId);
  if (!biz) { await answer(cq.id); return; }
  const [kind, ...rest] = cq.data.split(":"), id = rest.join(":");
  await answer(cq.id).catch(() => undefined);
  if (kind === "all") {
    const sent = (await sugsFor(db, biz.id)).filter((s) => s.messageId === id && s.status === "sent" && !isAsk(s));
    let last: DecideResult | undefined;
    for (const s of sent) { last = await decide(db, s.id, { action: "approve" }); if (last.ok) await after(db, biz, chatId, last); }
    if (last?.suggestion) await refresh(db, biz, chatId, cq.message.message_id, last.suggestion);
    return;
  }
  if (kind === "o") {
    const sid = rest.slice(0, -1).join(":"), opt = Number(rest.at(-1)), s = await getSug(db, sid);
    if (s && s.businessId === biz.id && Number.isInteger(opt)) await after(db, biz, chatId, await decide(db, s.id, { action: "choose", option: opt }), cq.message.message_id);
    return;
  }
  if (kind === "ap" || kind === "ax" || kind === "aA" || kind === "au") {
    const rec = await getChange(db, id);
    if (!rec || rec.businessId !== biz.id) return;
    const l = asLang(biz.language);
    const batch = kind === "aA" ? (await db.select().from(schema.cnChanges).where(eq(schema.cnChanges.businessId, biz.id)).all()).filter((x) => x.status === "proposed" && Math.abs(x.createdAt - rec.createdAt) < 120_000) : [rec];
    if (kind === "au") { await say(chatId, esc((await undoChange(db, rec)) ? T[l].undone : T[l].alreadyDone)); return; }
    if (kind === "ax") { await db.update(schema.cnChanges).set({ status: "declined" }).where(eq(schema.cnChanges.id, rec.id)).run(); await say(chatId, "✖️"); return; }
    for (const c of batch) {
      if (c.status !== "proposed") { await say(chatId, esc(T[l].alreadyDone)); continue; }
      const r = await applyChange(db, biz, c);
      if (!r.ok) { await say(chatId, esc(r.error?.startsWith("rule:") ? r.error.slice(5) : T[l].failed)); continue; }
      await say(chatId, `✅ <b>${esc(T[l].savedIn)}</b>\n\n<b>${esc(T[l].whereShows)}</b>\n${shows(biz, l).slice(0, 6).map((x) => `${x.live ? "•" : "◦"} ${esc(x.text)}`).join("\n")}`, { reply_markup: { inline_keyboard: [[{ text: `↩️ ${T[l].undo}`, callback_data: `au:${c.id}` }]] } });
    }
    return;
  }
  const s = await getSug(db, id);
  if (!s || s.businessId !== biz.id) return;
  if (kind === "a") await after(db, biz, chatId, await decide(db, s.id, { action: "approve" }), cq.message.message_id);
  else if (kind === "n") await after(db, biz, chatId, await decide(db, s.id, { action: "decline" }), cq.message.message_id);
  else if (kind === "e") { await setAwaiting(db, biz.id, s.id); await say(chatId, `✏️ <b>${esc(s.date)}</b>\n${esc(T[asLang(biz.language)].editPrompt)}`, { reply_markup: { force_reply: true } }); }
  else if (kind === "u") { const r = await undoSuggestion(db, s); await say(chatId, r.ok ? esc(T[asLang(biz.language)].undone) : esc(T[asLang(biz.language)].alreadyDone)); }
}
