// Dev tool: show what readSiteFacts extracts from a URL (real network).
import { readSiteFacts } from "../src/lib/public-check";
import { fetchTexts } from "../src/lib/tinyfish";
(async () => {
  for (const u of process.argv.slice(2)) {
    console.log("##", u, JSON.stringify(await readSiteFacts(u)));
    const t = (await fetchTexts([u])).get(u) ?? "";
    console.log("   text chars:", t.length, "| has phone-like:", /\+?\d[\d\s-]{7,}/.test(t), "| has hours-like:", /\d{1,2}[:.]\d{2}/.test(t));
    console.log("   ", t.replace(/\s+/g, " ").slice(0, 300));
  }
})();
