import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { canWrite, getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { diagnoseAccount, exchangeCode, listManagedPages, readFbState } from "@/lib/facebook";
import { savePendingPages, selectPage } from "@/lib/facebook-connect";

const back = (req: Request, q: string, detail?: string) => { const r = NextResponse.redirect(new URL(`/dashboard/connections?facebook=${q}${detail ? `&detail=${encodeURIComponent(detail.slice(0, 700))}` : ""}`, req.url), 303); r.cookies.set("fg_fb", "", { path: "/api/connections/facebook", maxAge: 0 }); return r; };

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.redirect(new URL("/login", req.url), 303);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  // Facebook explains refusals in error / error_reason / error_description; pass that through so the owner can see why.
  const why = ["error", "error_code", "error_reason", "error_description"].map((k) => [k, url.searchParams.get(k)] as const).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ");
  if (url.searchParams.get("error") || !code) return back(req, "denied", why || "Facebook returned without a login code and without a reason");
  const saved = readFbState((await cookies()).get("fg_fb")?.value);
  if (!saved || saved !== url.searchParams.get("state")) return back(req, "state_mismatch");
  if (!canWrite(s.role)) return back(req, "forbidden");
  try {
    const userToken = await exchangeCode(code);
    const pages = await listManagedPages(userToken);
    if (!pages.length) return back(req, "no_pages", await diagnoseAccount(userToken).catch(() => undefined));
    const db = await getDb();
    if (pages.length === 1) { await selectPage(db, s.orgId, s.userId, pages[0]); return back(req, "connected"); }
    await savePendingPages(db, s.orgId, pages);
    return back(req, "choose");
  } catch (e) {
    console.error("facebook callback", e);
    return back(req, "failed", e instanceof Error ? e.message : undefined);
  }
}
