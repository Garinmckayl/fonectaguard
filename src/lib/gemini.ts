/**
 * Gemini API (Google AI Studio), called directly with an API key: reads a photo the owner sent (a sign, a notice, a menu board)
 * and answers in the agent's strict JSON. Used for the agent's vision step when GEMINI_API_KEY is set; the agent falls back
 * to its default model if this is absent or fails.
 */
/** The alias follows Google's current Flash model; the others are backups if one is overloaded or retired for new keys. */
const MODELS = () => [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-3.5-flash", "gemini-3-flash-preview"].filter((m, i, a): m is string => !!m && a.indexOf(m) === i);
export const hasGemini = () => !!process.env.GEMINI_API_KEY;

export async function geminiVisionJson(system: string, text: string, image: { mime: string; b64: string }): Promise<string> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text }, { inline_data: { mime_type: image.mime, data: image.b64 } }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 1200 },
  });
  let last = "no model";
  for (const model of MODELS()) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! }, body, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!res || !res.ok) { last = `${model} ${res?.status ?? "network"}`; continue; }
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const out = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (out) return out;
    last = `${model} empty`;
  }
  throw new Error(`Gemini unavailable (${last})`);
}
