// Dev tool: run the public check on a list of real business sites (real OpenRouter/TinyFish/web) and aggregate what AI assistants get wrong.
// Usage: tsx scripts/sample-study.ts out.json urls.txt [concurrency]
import { readFileSync, writeFileSync } from "fs";
import { openTestDb } from "../tests/helpers";
import { createPublicCheck } from "../src/lib/public-check";
import { schema } from "../src/lib/db";

const [out, file, conc = "4"] = process.argv.slice(2);
const urls = readFileSync(file, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
type Row = { url: string; name?: string; status: string; error?: string; accuracy?: number | null; visibility?: number | null; wrong: { assistant: string; web: boolean; field: string; stated?: unknown; expected?: unknown; q?: string }[]; confused: number; answers: number; mentioned: number };
const results: Row[] = [];

async function one(url: string): Promise<Row> {
  const db = openTestDb();
  try {
    const r = await createPublicCheck(db, url, `study:${url}`);
    const a = (await db.select().from(schema.aiAudits).get())!;
    const loc = (await db.select().from(schema.businessLocations).get())!;
    const rows = await db.select().from(schema.aiAuditAnswers).all();
    const wrong = rows.flatMap((x) => (x.comparisonsJson ?? []).filter((c) => !["exact", "equivalent", "harmless", "missing"].includes(c.classification) && c.severity).map((c) => ({ assistant: x.assistant, web: !!x.webSearch, field: c.field, stated: c.stated, expected: c.expected, q: x.answer?.slice(0, 260) })));
    return { url, name: loc.businessName, status: a.status, accuracy: a.accuracy, visibility: a.visibility, wrong, confused: rows.filter((x) => x.confusedWith).length, answers: rows.length, mentioned: rows.filter((x) => x.mentioned).length, error: r ? undefined : undefined };
  } catch (e) {
    return { url, status: "unreadable", error: e instanceof Error ? e.message.slice(0, 120) : String(e), wrong: [], confused: 0, answers: 0, mentioned: 0 };
  }
}

(async () => {
  let i = 0;
  await Promise.all(Array.from({ length: Number(conc) }, async () => {
    while (i < urls.length) {
      const u = urls[i++];
      const r = await one(u);
      results.push(r);
      writeFileSync(out, JSON.stringify(results, null, 1));
      console.log(`${results.length}/${urls.length} ${r.status} ${r.name ?? u} wrong=${r.wrong.length} confused=${r.confused} vis=${r.visibility}`);
    }
  }));
  console.log("DONE");
})();
