export const hasEmail = () => !!process.env.RESEND_API_KEY;
const FROM = () => process.env.EMAIL_FROM ?? "Fonecta Connect <connect@arcumet.com>";

/** Sends through Resend. Returns the message id. */
export async function sendEmail(to: string, p: { subject: string; html: string; text: string }) {
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: FROM(), to: [to], subject: p.subject, html: p.html, text: p.text }), signal: AbortSignal.timeout(12_000) });
  const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !j.id) throw new Error(`Resend: ${j.message ?? res.status}`);
  return j.id;
}
