import { T, fmtDate, fmtDateShort, fmtHours, type Lang } from "./i18n";
import { reasonText, type Reason } from "./reasons";
import { costText, stakeText, type Cost } from "./cost";

export interface Item { id: string; date: string; shown: string; proposed: string | null; reasons: Reason[]; status: string; final?: string | null; confidence?: number;
  /** auto: applied by autopilot; one_tap: approve/edit; ask: owner picks one of `options` or keeps what Google shows. */
  tier?: "auto" | "one_tap" | "ask" | "flag"; options?: string[]; cost?: Cost | null }
export interface Bundle { businessName: string; contactName: string | null; lang: Lang; items: Item[]; url: string }

const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const LETTERS = "ABCDEFGH";
export const isAskItem = (it: Item) => it.tier === "ask" && !!it.options?.length;
/** Ask items: the options, then "keep as Google shows now" as the last letter. */
export const choices = (it: Item, l: Lang) => [...(it.options ?? []).map((o) => fmtHours(o, l)), T[l].keep(fmtHours(it.shown, l))];

export function lines(it: Item, l: Lang) {
  const ask = isAskItem(it);
  return {
    when: fmtDate(it.date, l), short: fmtDateShort(it.date, l), shows: `${T[l].shows}: ${fmtHours(it.shown, l)}`,
    suggest: ask ? `${T[l].askQ} ${choices(it, l).map((c, i) => `${LETTERS[i]}) ${c}`).join("  ")}` : `${T[l].suggest}: ${fmtHours(it.final ?? it.proposed, l)}`,
    why: ask ? [T[l].unsure, ...it.reasons.slice(0, 1).map((r) => reasonText(r, l))] : it.reasons.slice(0, 2).map((r) => reasonText(r, l)),
    cost: costText(it.cost, it.shown, it.final ?? it.proposed, l, ask),
  };
}

/** Telegram (HTML). Buttons are built in telegram.ts. */
export function telegramText(b: Bundle): string {
  const t = T[b.lang];
  const head = `${b.contactName ? `<b>${esc(t.hi(b.contactName))}</b>\n` : ""}${esc(t.intro(b.items.length, b.businessName))}\n`;
  const body = b.items.map((it, i) => { const x = lines(it, b.lang); return `\n<b>${i + 1}. ${esc(x.when)}</b>\n${esc(x.shows)}\n<b>${esc(x.suggest)}</b>\n<i>${esc(t.because)}: ${esc(x.why.join(" "))}</i>${x.cost ? `\n⚠️ ${esc(x.cost)}` : ""}`; }).join("\n");
  return `${head}${body}\n\n${esc(t.final)}`;
}

export function emailParts(b: Bundle): { subject: string; html: string; text: string } {
  const t = T[b.lang];
  const rows = b.items.map((it) => { const x = lines(it, b.lang); return `<tr><td style="padding:14px 0;border-top:1px solid #e6decf"><div style="font-weight:700;font-size:16px">${esc(x.when)}</div><div style="color:#6b6455;font-size:14px;margin-top:2px">${esc(x.shows)}</div><div style="font-size:18px;font-weight:800;margin:4px 0">${esc(x.suggest)}</div><div style="color:#544d40;font-size:13px">${esc(t.because)}: ${esc(x.why.join(" "))}</div>${x.cost ? `<div style="margin-top:8px;padding:8px 10px;background:#fff1e6;border-left:3px solid #d9430c;font-size:13px;color:#14110d"><b>${esc(t.whyMatters)}:</b> ${esc(x.cost)}</div>` : ""}</td></tr>`; }).join("");
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#14110d;background:#faf5e9"><div style="font-weight:800;font-size:18px">Fonecta<span style="color:#d9430c">Connect</span></div><p style="font-size:16px;line-height:1.5">${b.contactName ? `<b>${esc(t.hi(b.contactName))}</b><br>` : ""}${esc(t.intro(b.items.length, b.businessName))}</p><table style="width:100%;border-collapse:collapse">${rows}</table><p style="margin:24px 0"><a href="${b.url}" style="background:#ff5b1f;color:#14110d;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;border:2px solid #14110d;display:inline-block">${esc(t.reviewLink)}</a></p><p style="color:#6b6455;font-size:13px">${esc(t.final)}</p></div>`;
  const text = `${b.contactName ? t.hi(b.contactName) + "\n" : ""}${t.intro(b.items.length, b.businessName)}\n\n${b.items.map((it) => { const x = lines(it, b.lang); return `${x.when}\n${x.shows}\n${x.suggest}\n${t.because}: ${x.why.join(" ")}${x.cost ? `\n${t.whyMatters}: ${x.cost}` : ""}`; }).join("\n\n")}\n\n${t.reviewLink}: ${b.url}\n${t.final}`;
  return { subject: t.subject(b.businessName, b.items.length), html, text };
}

/** SMS: numbered days the owner can answer by text (see sms.ts for the reply grammar). The stake goes on the most urgent line only, to keep it short. */
export function smsText(b: Bundle): string {
  const t = T[b.lang], l = b.lang;
  const rows = b.items.map((it, i) => isAskItem(it)
    ? `${i + 1}) ${fmtDateShort(it.date, l)}: ${choices(it, l).map((c, j) => `${i + 1}${LETTERS[j]} ${j === (it.options?.length ?? 0) ? t.smsAsNow : c}`).join(" / ")}`
    : `${i + 1}) ${fmtDateShort(it.date, l)} ${fmtHours(it.final ?? it.proposed, l)} (${t.shows} ${fmtHours(it.shown, l)})`);
  const stake = b.items.map((it) => stakeText(it.cost, it.shown, it.final ?? it.proposed, l, isAskItem(it))).find(Boolean);
  const plain = b.items.map((it, i) => (isAskItem(it) ? 0 : i + 1)).filter(Boolean);
  const okLine = plain.length ? `${t.smsOk(plain.join(","))}, ${t.smsOr} "${plain[0]} 10-15" / "${t.smsNo} ${plain[0]}".` : "";
  return [t.subject(b.businessName, b.items.length), ...rows, stake ? `⚠ ${stake}` : "", okLine, `${t.smsLink}: ${b.url}`].filter(Boolean).join("\n");
}

const WA_HINT: Record<Lang, (ok: string, n: number) => string> = {
  en: (ok, n) => `Reply *OK* to approve ${ok}  ·  *${n}B* to pick an option  ·  *${n} 10-15* to change hours  ·  *NO ${n}* to skip.\nOr just tell me what you need, in your own words.`,
  fi: (ok, n) => `Vastaa *OK* hyväksyäksesi ${ok}  ·  *${n}B* valitaksesi vaihtoehdon  ·  *${n} 10-15* vaihtaaksesi ajat  ·  *EI ${n}* ohittaaksesi.\nTai kerro vapaasti, mitä tarvitset.`,
  sv: (ok, n) => `Svara *OK* för att godkänna ${ok}  ·  *${n}B* för att välja  ·  *${n} 10-15* för att ändra tider  ·  *NEJ ${n}* för att hoppa över.\nEller berätta fritt vad du behöver.`,
  nb: (ok, n) => `Svar *OK* for å godkjenne ${ok}  ·  *${n}B* for å velge  ·  *${n} 10-15* for å endre tider  ·  *NEI ${n}* for å hoppe over.\nEller fortell fritt hva du trenger.`,
};
/** WhatsApp: the same content as the e-mail, readable in a chat (bold dates, reasons in italics), with the short reply language at the end. Replies use the SMS command parser. */
export function whatsappMessage(b: Bundle): string {
  const t = T[b.lang], l = b.lang;
  const plain = b.items.map((it, i) => (isAskItem(it) ? 0 : i + 1)).filter(Boolean);
  const body = b.items.map((it, i) => {
    const x = lines(it, l);
    return isAskItem(it)
      ? `*${i + 1} · ${x.short}*  ${t.askQ}\n${choices(it, l).map((c, j) => `   ${i + 1}${LETTERS[j]}  ${c}`).join("\n")}`
      : `*${i + 1} · ${x.short}*\n   ${x.shows}\n   → *${fmtHours(it.final ?? it.proposed, l)}*\n   _${x.why[0] ?? ""}_`;
  });
  const stake = b.items.map((it) => stakeText(it.cost, it.shown, it.final ?? it.proposed, l, isAskItem(it))).find(Boolean);
  return [`*${b.contactName ? t.hi(b.contactName) : b.businessName}* 👋`, t.intro(b.items.length, b.businessName), "", ...body.flatMap((x) => [x, ""]), stake ? `⚠️ ${stake}\n` : "", WA_HINT[l](plain.join(", ") || "1", plain[0] ?? 1), "", `🔗 ${t.smsLink}: ${b.url}`].filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n");
}

/** SMS sent after autopilot changed something: what changed and how to undo it. */
export function smsAutoText(b: Bundle): string {
  const t = T[b.lang], l = b.lang;
  return [`${b.businessName}: ${t.smsAuto(b.items.length)}`, ...b.items.map((it, i) => `A${i + 1}) ${fmtDateShort(it.date, l)} ${fmtHours(it.final ?? it.proposed, l)}`), t.smsUndoHint, b.url].join("\n");
}

export function whatsappText(b: Bundle): string {
  const t = T[b.lang];
  return `*${b.contactName ? t.hi(b.contactName) : b.businessName}*\n${t.intro(b.items.length, b.businessName)}\n\n${b.items.map((it, i) => { const x = lines(it, b.lang); return `*${i + 1}. ${x.when}*\n${x.shows}\n*${x.suggest}*\n_${x.why[0]}_`; }).join("\n\n")}\n\n${t.reviewLink}: ${b.url}\n${t.final}`;
}

export function pushParts(b: Bundle): { title: string; body: string } {
  const t = T[b.lang]; const first = b.items[0]; const x = first ? lines(first, b.lang) : null;
  return { title: t.subject(b.businessName, b.items.length), body: x ? `${x.short}: ${fmtHours(first.final ?? first.proposed, b.lang)}${b.items.length > 1 ? ` (+${b.items.length - 1})` : ""}. ${t.approve}?` : "" };
}

export function renderAll(b: Bundle) {
  return { telegram: telegramText(b), email: emailParts(b), sms: smsText(b), smsAuto: smsAutoText(b), whatsapp: whatsappText(b), push: pushParts(b) };
}
