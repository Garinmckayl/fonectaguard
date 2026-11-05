"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/components/actions";

const FIELDS = [["businessName", "Business name", true], ["website", "Website (https://…)", true], ["city", "City", true], ["address", "Street address"], ["phone", "Main phone"], ["email", "Business email"], ["hours", "Opening hours (e.g. Mon-Sun 08:00-22:00)"]] as const;
const CONFIRMABLE: Record<string, string> = { businessName: "name", website: "website", address: "address", phone: "phone", email: "email", hours: "hours" };

export default function Onboarding() {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({ businessName: true, website: true });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-white">Establish your business identity</h1>
      <p className="mt-1 text-sm text-zinc-400">Only fields you tick as confirmed become your verified source of truth. Start with name, website and city.</p>
      <form className="mt-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(null);
        try {
          const body: Record<string, unknown> = { ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)), confirm: Object.keys(confirmed).filter((k) => confirmed[k] && v[k]).map((k) => CONFIRMABLE[k]) };
          await post("/api/businesses", body);
          router.push("/dashboard");
        } catch (x) { setErr(x instanceof Error ? x.message : "Failed"); } finally { setBusy(false); }
      }}>
        {FIELDS.map(([k, label, req]) => (
          <div key={k}>
            <label className="mb-1 block text-sm text-zinc-300" htmlFor={k}>{label}</label>
            <div className="flex items-center gap-3">
              <input id={k} className="input" required={!!req} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
              {CONFIRMABLE[k] && <label className="flex items-center gap-1 whitespace-nowrap text-xs text-zinc-400"><input type="checkbox" checked={!!confirmed[k]} onChange={(e) => setConfirmed({ ...confirmed, [k]: e.target.checked })} /> confirmed</label>}
            </div>
          </div>
        ))}
        {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save business"}</button>
      </form>
    </main>
  );
}
