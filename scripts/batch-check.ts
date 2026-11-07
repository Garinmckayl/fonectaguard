// Local batch runner: real OpenRouter + TinyFish + real sites, in-memory DB. Prints what the audit finds.
import { openTestDb } from "../tests/helpers";
import { createPublicCheck } from "../src/lib/public-check";
import { schema } from "../src/lib/db";
import { eq } from "drizzle-orm";

const urls = process.argv.slice(2);
(async () => {
  for (const u of urls) {
    const db = openTestDb();
    try {
      const r = await createPublicCheck(db, u, "batch:" + u);
      const a = (await db.select().from(schema.aiAudits).where(eq(schema.aiAudits.id, r.auditId)).get())!;
      const loc = (await db.select().from(schema.businessLocations).get())!;
      const rows = await db.select().from(schema.aiAuditAnswers).all();
      console.log(`\n### ${loc.businessName} (${loc.city}) ${u}\n  status=${a.status} accuracy=${a.accuracy} visibility=${a.visibility} wrong=${a.factsWrong} confused=${rows.filter(x=>x.confusedWith).length}`);
      for (const x of rows) for (const c of (x.comparisonsJson ?? [])) if (!["exact","equivalent","harmless","missing"].includes(c.classification)) console.log(`  WRONG [${x.assistant.split(" ")[0]}] ${c.field}: said ${JSON.stringify(c.stated)} vs site ${JSON.stringify(c.expected)}`);
      for (const x of rows) for (const s of ((x.sourcesJson ?? []) as any[])) console.log(`  TRACE ${s.field}: ${s.verdict} stale=[${s.staleIn.map((k:any)=>k.platform)}] pages=[${s.pages.map((p:any)=>p.url.slice(8,40)+":"+p.state)}]`);
    } catch (e: any) { console.log(`\n### ${u}\n  ERROR ${e.message}`); }
  }
})();
