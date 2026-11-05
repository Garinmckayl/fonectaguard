import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, List, AlertTriangle, CheckSquare, Activity, Plug, Settings, LogOut } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getLocation } from "@/lib/queries";
import { ActionButton } from "@/components/actions";
import { Badge } from "@/components/ui";
import { Chat } from "@/components/chat";
import { ShieldCheck } from "lucide-react";

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
      <aside className="md:sticky md:top-6 md:h-[calc(100vh-3rem)] md:w-60 md:shrink-0">
        <div className="card flex h-full flex-col !p-4">
          <Link href="/" className="flex items-center gap-2.5 px-1">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/30"><ShieldCheck className="h-5 w-5" /></span>
            <span className="text-lg font-semibold tracking-tight text-slate-900">FonectaGuard</span>
          </Link>
          {s.isDemo && <div className="mt-2 px-1"><Badge tone="amber">Demo environment</Badge></div>}
          <nav aria-label="Main" className="mt-5 flex gap-1 overflow-x-auto md:flex-col">
            {NAV.map(([href, label, Icon]) => (
              <Link key={href} href={href} className="flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto space-y-2 pt-6 text-xs text-slate-500">
            <p className="truncate px-1 font-medium text-slate-700">{loc?.businessName}</p>
            {s.isDemo && <ActionButton url="/api/demo/reset" label="Reset demo scenario" busyLabel="Resetting…" confirm="Reset the demo scenario to its initial drifted state?" className="btn btn-ghost w-full" />}
            <form action="/api/auth/logout" method="post"><button className="btn btn-ghost w-full" type="submit"><LogOut className="h-4 w-4" /> Sign out</button></form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
      <Chat />
    </div>
  );
}
