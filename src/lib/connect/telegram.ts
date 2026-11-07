import crypto from "crypto";
import { T, fmtDateShort, fmtHours, type Lang } from "./i18n";
import type { Bundle } from "./messages";
import { choices, isAskItem, LETTERS, telegramText } from "./messages";

const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
export const hasTelegram = () => !!process.env.TELEGRAM_BOT_TOKEN;
/** Telegram sends this header on every webhook call; derived from our secret so nothing extra has to be stored. */
export const webhookSecret = () => crypto.createHmac("sha256", process.env.AUTH_SECRET ?? "dev-insecure-secret").update("telegram-webhook").digest("hex").slice(0, 40);

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API()}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!res.ok || !j.ok) throw new Error(`Telegram: ${j.description ?? res.status}`);
  return j.result as T;
}

/** One row of buttons per day (approve / edit / decline; ask items get one button per option plus "keep") plus "approve all" for the non-ask days. callback_data stays under Telegram's 64-byte limit. */
export function keyboard(b: Bundle, lang: Lang, pending: Set<string>, messageId: string) {
  const t = T[lang];
  const open = b.items.filter((it) => pending.has(it.id));
  const rows: { text: string; callback_data: string }[][] = open.map((it) => isAskItem(it)
    ? choices(it, lang).map((c, i) => ({ text: `${LETTERS[i]}) ${fmtDateShort(it.date, lang)} ${c}`, callback_data: `o:${it.id}:${i}` }))
    : [
      { text: `✅ ${fmtDateShort(it.date, lang)} ${fmtHours(it.final ?? it.proposed, lang)}`, callback_data: `a:${it.id}` },
      { text: "✏️", callback_data: `e:${it.id}` }, { text: "✖️", callback_data: `n:${it.id}` },
    ]);
  const plain = open.filter((it) => !isAskItem(it)).length;
  if (plain > 1) rows.push([{ text: `✅ ${t.approveAll} (${plain})`, callback_data: `all:${messageId}` }]);
  return { inline_keyboard: rows };
}

export async function sendBundle(chatId: string, b: Bundle, pending: Set<string>, messageId: string) {
  const r = await tg<{ message_id: number }>("sendMessage", { chat_id: chatId, text: telegramText(b), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: keyboard(b, b.lang, pending, messageId) });
  return r.message_id;
}
export const say = (chatId: string, text: string, extra: Record<string, unknown> = {}) => tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
export const answer = (id: string, text?: string) => tg("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
export const setWebhook = (url: string) => tg("setWebhook", { url, secret_token: webhookSecret(), allowed_updates: ["message", "callback_query"] });

/** Downloads a file the user sent (photo, voice note) by its Telegram file id. */
export async function fileBytes(fileId: string): Promise<{ bytes: Uint8Array; path: string } | null> {
  try {
    const f = await tg<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
    if (!f.file_path || (f.file_size ?? 0) > 8_000_000) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${f.file_path}`, { signal: AbortSignal.timeout(15_000) });
    return res.ok ? { bytes: new Uint8Array(await res.arrayBuffer()), path: f.file_path } : null;
  } catch { return null; }
}

/** Sends audio as a voice bubble. */
export async function sendVoice(chatId: string, bytes: Uint8Array, caption?: string) {
  const form = new FormData();
  form.set("chat_id", chatId);
  if (caption) form.set("caption", caption.slice(0, 200));
  form.set("voice", new Blob([bytes as BlobPart], { type: "audio/ogg" }), "reply.ogg");
  const res = await fetch(`${API()}/sendVoice`, { method: "POST", body: form, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Telegram sendVoice ${res.status}`);
}
