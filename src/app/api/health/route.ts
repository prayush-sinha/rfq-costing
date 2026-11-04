import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "health failed", err: String(e) }));
    return Response.json({ ok: false }, { status: 503 });
  }
}
