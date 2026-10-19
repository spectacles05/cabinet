import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { evidenceUrl } from "@/lib/claims/evidence";
import { logDenied } from "@/lib/http";

/** Opens one evidence file through a 60-second private link (owner only: RLS and storage policy). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/claims/[id]/evidence/[eid]/file">) {
  const { id, eid } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(eid).success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const url = await evidenceUrl(supabase, id, eid);
  if (!url) {
    await logDenied({ supabase, userId: user.id, workflow: "action" }, "not_found", { claim_id: id });
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.redirect(url, { status: 303, headers: { "cache-control": "private, no-store" } });
}
