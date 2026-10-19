import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { confirmEvidence, deleteEvidence } from "@/lib/claims/evidence";
import { errorResponse } from "@/lib/http";

const ids = (p: { id: string; eid: string }) => z.string().uuid().safeParse(p.id).success && z.string().uuid().safeParse(p.eid).success;

/** Adding evidence, step 2: check the uploaded file really is a PDF or photo, then keep it. */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/claims/[id]/evidence/[eid]">) {
  const params = await ctx.params;
  if (!ids(params)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    return NextResponse.json(await confirmEvidence(supabase, user.id, params.id, params.eid));
  } catch (err) {
    return errorResponse(err, "We couldn't keep that file. Please try again.", { supabase, userId: user.id, workflow: "action" });
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/claims/[id]/evidence/[eid]">) {
  const params = await ctx.params;
  if (!ids(params)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    await deleteEvidence(supabase, user.id, params.id, params.eid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "We couldn't remove that file. Please try again.", { supabase, userId: user.id, workflow: "action" });
  }
}
