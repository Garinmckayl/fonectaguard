/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError, requireSession, type Session } from "./auth";
import { RepairError } from "./repair";
import { getDb } from "./db";
import type { DB } from "./db";

export function route(mutating: boolean, fn: (ctx: { s: Session; db: DB; req: Request; params: Record<string, string> }) => Promise<unknown> | unknown) {
  return async (req: Request, extra: { params: Promise<any> }) => {
    try {
      const s = await requireSession(mutating);
      const out = await fn({ s, db: await getDb(), req, params: (await extra?.params) ?? {} });
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError || e instanceof RepairError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: "Invalid input", issues: e.issues }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
