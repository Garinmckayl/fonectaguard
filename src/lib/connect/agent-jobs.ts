import type { DB } from "../db";
import { getCfEnv } from "../db";
import { asLang } from "./i18n";
import { presenceFacts, presenceMessage, siteAuditLink } from "./agent";
import { getBiz, log } from "./service";
import { say } from "./telegram";
import { hasVoice, speak } from "./elevenlabs";
import { sendVoice } from "./telegram";
import { sendWhatsapp } from "./whatsapp";

export interface AgentJob { type: "presence" | "site"; businessId: string; chatId: string; voice: boolean; site?: string }

async function reply(chatId: string, text: string, voice: boolean) {
  if (chatId.startsWith("wa:")) { await sendWhatsapp(chatId.slice(3), text); return; }
  await say(chatId, text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  if (voice && hasVoice()) { const a = await speak(text); if (a) await sendVoice(chatId, a).catch(() => undefined); }
}

/** Runs the slow, on-demand work (a web check of how AI assistants describe the business, or a full website audit) and sends the result back in the same chat. */
export async function runAgentJob(db: DB, job: AgentJob) {
  const biz = await getBiz(db, job.businessId);
  if (!biz) return;
  const lang = asLang(biz.language);
  try {
    if (job.type === "presence") {
      const facts = await presenceFacts(db, biz);
      await reply(job.chatId, await presenceMessage(biz, facts), job.voice);
      await log(db, biz.id, "agent_presence", { assistants: facts.assistants.map((a) => ({ a: a.assistant, describesYou: a.describesYou, wrong: a.wrong.length, confused: a.confusedWith })) });
    } else if (job.site) {
      const url = await siteAuditLink(db, job.site, job.chatId);
      await reply(job.chatId, url ? `${{ en: "Your free AI search report", fi: "Ilmainen tekoälyhakuraporttisi", sv: "Din kostnadsfria AI-sökrapport", nb: "Din gratis AI-søkerapport" }[lang]}: ${url}` : { en: "I couldn't read that website. Check the address and try again.", fi: "En pystynyt lukemaan sivustoa. Tarkista osoite ja yritä uudelleen.", sv: "Jag kunde inte läsa webbplatsen. Kontrollera adressen och försök igen.", nb: "Jeg kunne ikke lese nettsiden. Sjekk adressen og prøv igjen." }[lang], job.voice);
    }
  } catch (e) {
    await log(db, biz.id, "agent_job_failed", { error: String(e) });
    const sorry = { en: "Sorry, that check didn't work this time. Please try again in a minute.", fi: "Valitettavasti tarkistus ei onnistunut tällä kertaa. Yritä hetken päästä uudelleen.", sv: "Tyvärr gick kontrollen inte den här gången. Försök igen om en stund.", nb: "Beklager, sjekken fungerte ikke denne gangen. Prøv igjen om litt." }[lang];
    await reply(job.chatId, sorry, false).catch(() => undefined);
  }
}

/** On Cloudflare each job is a queue message with its own time budget; locally and in tests it runs inline. */
export async function enqueueAgentJob(db: DB, job: AgentJob) {
  const env = await getCfEnv().catch(() => null);
  if (env?.SCAN_QUEUE) { await env.SCAN_QUEUE.send({ kind: "agent", payload: job as unknown as Record<string, unknown>, locationId: "", scanId: job.businessId, paceMs: 0, trigger: "manual" }); return; }
  await runAgentJob(db, job);
}
