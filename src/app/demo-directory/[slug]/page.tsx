import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DemoListing(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const r = await (await getDb()).select().from(schema.demoListings).where(eq(schema.demoListings.slug, params.slug)).get();
  if (!r) notFound();
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <p className="text-xs text-amber-300">Simulated demo directory ({r.platform}) — not a real platform.</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">{r.name}</h1>
      <dl className="mt-4 space-y-1 text-zinc-300">
        <div>Address: {r.address}</div><div>Phone: {r.phone}</div><div>Hours: {r.hours}</div><div>Website: {r.website}</div>
      </dl>
    </main>
  );
}
