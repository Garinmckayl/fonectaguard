import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { webhookSecret } from "@/lib/connect/telegram";
import { handleUpdate } from "@/lib/connect/telegram-bot";

/** Telegram webhook. Only Telegram knows the secret header; everything else is rejected. Always answers 200 so Telegram does not retry a poison update. */
export async function POST(req: Request) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret()) return NextResponse.json({ ok: false }, { status: 401 });
  try { await handleUpdate(await getDb(), await req.json()); } catch (e) { console.error("telegram update", e); }
  return NextResponse.json({ ok: true });
}
