import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, List, AlertTriangle, CheckSquare, Activity, Plug, Settings, LogOut } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getLocation } from "@/lib/queries";
import { ActionButton } from "@/components/actions";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

const NAV = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/dashboard/listings", "Listings", List],
  ["/dashboard/issues", "Issues", AlertTriangle],
  ["/dashboard/approvals", "Approvals", CheckSquare],
  ["/dashboard/activity", "Activity", Activity],
  ["/dashboard/connections", "Connections", Plug],
  ["/dashboard/settings", "Settings", Settings],
] as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const loc = await getLocation(await getDb(), s.orgId);
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row">
      <aside className="md:w-56 md:shrink-0">
        <p className="px-2 text-lg font-semibold text-white">FonectaGuard</p>
        {s.isDemo && <div className="mt-1 px-2"><Badge tone="amber">Demo environment</Badge></div>}
        <nav aria-label="Main" className="mt-4 flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map(([href, label, Icon]) => (
            <Link key={href} href={href} className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              <Icon className="h-4 w-4 text-zinc-500" /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 space-y-2 px-2 text-xs text-zinc-500">
          <p>{loc?.businessName}</p>
          {s.isDemo && <ActionButton url="/api/demo/reset" label="Reset demo scenario" busyLabel="Resetting…" confirm="Reset the demo scenario to its initial drifted state?" className="btn btn-ghost w-full" />}
          <form action="/api/auth/logout" method="post"><button className="btn btn-ghost w-full" type="submit"><LogOut className="h-4 w-4" /> Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
