// Dev tool: run the agent's understanding step on a real image/text (real model call).
import { readFileSync } from "fs";
import { understand, validateChange } from "../src/lib/connect/agent";
(async () => {
  const [file, ...words] = process.argv.slice(2);
  const biz = { id: "X", name: "Kahvila Aurora", city: "Helsinki", country: "FI", language: "fi", segment: "cafe" } as never;
  const input = file && file !== "-" ? { text: words.join(" ") || undefined, image: { mime: "image/png", b64: readFileSync(file).toString("base64") }, source: "photo" as const } : { text: words.join(" "), source: "text" as const };
  const out = await understand(biz, { business: { name: "Kahvila Aurora" }, today: new Date().toISOString().slice(0, 10) }, input, "Europe/Helsinki");
  console.log(JSON.stringify(out, null, 1));
  for (const c of out?.changes ?? []) console.log("->", JSON.stringify(validateChange(c, { country: "FI" }, new Date().toISOString().slice(0, 10))));
})();
