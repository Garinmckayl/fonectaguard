/**
 * WhatsApp through the Vonage Messages API. In the sandbox the owner first sends the join phrase from their own WhatsApp
 * (that is the opt-in), then both directions work: we send the suggestions, they reply OK / 2B / NO 1, same as SMS.
 * Only ever sends to DEMO_PHONE in this build.
 */
const SANDBOX = "https://messages-sandbox.nexmo.com/v1/messages";
export const hasWhatsapp = () => !!(process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET && process.env.DEMO_PHONE);
export const waFrom = () => (process.env.VONAGE_WA_FROM ?? "14157386102").replace(/\D/g, "");
export const waKey = (phone: string) => `wa:${phone.replace(/\D/g, "")}`;

export async function sendWhatsapp(to: string, text: string): Promise<string> {
  const res = await fetch(process.env.VONAGE_MESSAGES_URL ?? SANDBOX, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${process.env.VONAGE_API_KEY}:${process.env.VONAGE_API_SECRET}`).toString("base64")}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ from: waFrom(), to: to.replace(/\D/g, ""), channel: "whatsapp", message_type: "text", text: text.slice(0, 3800) }), signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json().catch(() => ({}))) as { message_uuid?: string; title?: string; detail?: string };
  if (!res.ok) throw new Error(`WhatsApp: ${j.title ?? res.status}${j.detail ? ` (${j.detail})` : ""}`);
  return j.message_uuid ?? "";
}
