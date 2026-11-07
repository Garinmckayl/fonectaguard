// Prints the exact customer messages the system sends (used for the README). Run: npx tsx scripts/render-messages.ts
import { renderAll, smsAutoText, type Bundle, type Item } from "../src/lib/connect/messages";
import { T, fmtDate, fmtHours, type Lang } from "../src/lib/connect/i18n";

const items: Item[] = [
  { id: "1", date: "2026-12-24", shown: "07:30-18:00", proposed: "07:30-13:00", status: "sent", confidence: 0.907, tier: "one_tap", reasons: [{ k: "last_year", hours: "07:30-13:00" }] },
  { id: "2", date: "2027-01-06", shown: "07:30-18:00", proposed: "10:00-16:00", status: "sent", confidence: 0.79, tier: "ask", options: ["10:00-16:00", "closed"], reasons: [{ k: "model_pattern" }] },
];
for (const lang of ["en", "fi", "sv", "nb"] as Lang[]) {
  const b: Bundle = { businessName: "Kahvila Aurora", contactName: "Aleksi", lang, items, url: "https://fonectaguard.arcumet.com/d/<token>" };
  const r = renderAll(b), t = T[lang];
  console.log(`\n######## ${lang.toUpperCase()}\n--- SMS ---\n${r.sms}\n--- Telegram (HTML) ---\n${r.telegram}\n--- Email subject ---\n${r.email.subject}`);
  if (lang === "en") console.log(`--- Email text ---\n${r.email.text}`);
  console.log(`--- Follow-ups ---\napprove: ${t.applied(fmtDate("2026-12-24", lang), fmtHours("07:30-13:00", lang))} ${t.savedIn}\nedit: ${t.editPrompt}\nedit confirmed: ${t.editConfirm("07:30–14:00")}\ndecline: ${t.declined}\nkeep: ${t.kept}\nundo: ${t.undone}\nautopilot: ${smsAutoText({ ...b, items: [{ ...items[0], tier: "auto", status: "auto_applied", final: "closed", proposed: "closed" }] })}`);
}
