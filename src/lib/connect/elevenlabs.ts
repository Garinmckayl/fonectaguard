/** ElevenLabs voice: speak a reply as a Telegram voice note, and understand the owner's voice replies. Stock voices only; messages are labelled as AI voice. */
const BASE = "https://api.elevenlabs.io/v1";
export const hasVoice = () => !!process.env.ELEVENLABS_API_KEY;
const voiceId = () => process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL";

/** Text -> Ogg/Opus (what Telegram shows as a voice bubble). Null when voice is unavailable, so callers fall back to text. */
export async function speak(text: string, format: "opus_48000_32" | "mp3_44100_64" = "opus_48000_32"): Promise<Uint8Array | null> {
  if (!hasVoice() || !text.trim()) return null;
  try {
    const res = await fetch(`${BASE}/text-to-speech/${voiceId()}?output_format=${format}`, {
      method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "content-type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 700), model_id: "eleven_multilingual_v2" }), signal: AbortSignal.timeout(20_000),
    });
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch { return null; }
}

/** Speech -> text (Scribe). Understands Finnish, Swedish, Norwegian and English without being told which. */
export async function transcribe(bytes: Uint8Array, mime = "audio/ogg"): Promise<{ text: string; language: string } | null> {
  if (!hasVoice()) return null;
  try {
    const form = new FormData();
    form.set("model_id", "scribe_v1");
    form.set("file", new Blob([bytes as BlobPart], { type: mime }), "voice.ogg");
    const res = await fetch(`${BASE}/speech-to-text`, { method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! }, body: form, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { text?: string; language_code?: string };
    return j.text?.trim() ? { text: j.text.trim(), language: j.language_code ?? "" } : null;
  } catch { return null; }
}
