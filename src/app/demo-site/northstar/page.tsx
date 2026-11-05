export const dynamic = "force-dynamic";

import { DEMO } from "@/lib/demo";

// Fictional demo business website. Structured data is what the scanner reads.
export default function NorthstarSite() {
  const origin = process.env.APP_URL ?? "http://localhost:3000";
  const ld = {
    "@context": "https://schema.org", "@type": "CafeOrCoffeeShop", name: DEMO.name, telephone: DEMO.phone, url: `${origin}${DEMO.path}`,
    address: { "@type": "PostalAddress", streetAddress: DEMO.street, addressLocality: DEMO.city, addressCountry: "FI" }, openingHours: "Mon-Sun 08:00-22:00",
    description: "Fictional demo coffee shop used to demonstrate FonectaGuard.",
  };
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <p className="text-xs text-amber-300">Fictional demo business — not real.</p>
      <h1 className="mt-2 text-3xl font-semibold text-white">{DEMO.name}</h1>
      <p className="mt-4 text-zinc-300">{DEMO.street}, {DEMO.city}</p>
      <p className="text-zinc-300">Phone: {DEMO.phone}</p>
      <p className="text-zinc-300">Open daily {DEMO.hours}</p>
    </main>
  );
}
