import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, List, AlertTriangle, CheckSquare, Activity, Plug, Settings, LogOut, Sparkles } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getLocation } from "@/lib/queries";
import { isUnconfirmed, loadCanonical } from "@/lib/canonical";
import { ActionButton } from "@/components/actions";
import { Badge } from "@/components/ui";
import { Chat } from "@/components/chat";
import { LogoMark } from "@/components/logo";

export const dynamic = "force-dynamic";

const NAV = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/dashboard/listings", "Listings", List],
  ["/dashboard/issues", "Issues", AlertTriangle],
  ["/dashboard/approvals", "Approvals", CheckSquare],
  ["/dashboard/ai-search", "AI search", Sparkles],
  ["/dashboard/activity", "Activity", Activity],
  ["/dashboard/connections", "Connections", Plug],
  ["/dashboard/settings", "Settings", Settings],
] as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const db = await getDb();
  const loc = await getLocation(db, s.orgId);
  const unconfirmed = loc ? Object.values(await loadCanonical(db, loc.id)).some(isUnconfirmed) : false;
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row">
      <aside className="md:sticky md:top-6 md:h-[calc(100vh-3rem)] md:w-60 md:shrink-0">
        <div className="flex h-full flex-col rounded-2xl border-[1.5px] border-ink bg-ink p-4 text-paper shadow-pop">
          <Link href="/" className="flex items-center gap-2.5 px-1">
            <LogoMark /><span className="font-display text-xl font-extrabold tracking-tight text-paper">Fonecta<span className="text-brand">Guard</span></span>
          </Link>
          <nav aria-label="Main" className="mt-5 flex gap-1 overflow-x-auto md:flex-col">
            {NAV.map(([href, label, Icon]) => (
              <Link key={href} href={href} className="flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-paper/75 transition hover:bg-hi hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto space-y-2 pt-6 text-xs text-paper/60">
            <p className="truncate px-1 font-semibold text-paper">{loc?.businessName}</p>
            <form action="/api/auth/logout" method="post"><button className="btn btn-ghost w-full !border-paper/40 !bg-transparent !text-paper hover:!bg-paper/10" type="submit"><LogOut className="h-4 w-4" /> Sign out</button></form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        {unconfirmed && (
          <Link href="/dashboard/settings" className="mb-4 block rounded-xl border-[1.5px] border-ink bg-brand-soft px-4 py-3 text-sm font-semibold text-ink shadow-soft hover:bg-[#FFDCC8]">These details were read from your website and are not confirmed yet. Check and confirm them so corrections can be approved →</Link>
        )}
        {loc && loc.verificationStatus !== "verified" && (
          <Link href="/dashboard/settings" className="mb-4 block rounded-xl border border-[1.5px] border-ink bg-hi px-4 py-3 text-sm font-semibold text-ink shadow-soft hover:bg-[#FFEA7A]">Verify you own {loc.website ? new URL(loc.website).hostname : "this domain"} to unlock approvals →</Link>
        )}
        {children}
      </main>
      <Chat />
    </div>
  );
}
