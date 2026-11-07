import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/connect/service";
import { twiml, validTwilio } from "@/lib/connect/sms";
import { handleSms } from "@/lib/connect/sms-bot";

const xml = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/xml; charset=utf-8" } });

/** Twilio inbound SMS webhook (set as the number's "A message comes in" URL). The signature is checked against APP_URL, so this only accepts Twilio's own calls. */
export async function POST(req: Request) {
  const params = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;
  if (!validTwilio(`${appUrl()}/api/connect/sms`, params, req.headers.get("x-twilio-signature"))) return xml(twiml(), 403);
  try { return xml(twiml(await handleSms(await getDb(), params.From ?? "", params.Body ?? ""))); }
  catch (e) { console.error("sms inbound", e); return xml(twiml()); }
}
