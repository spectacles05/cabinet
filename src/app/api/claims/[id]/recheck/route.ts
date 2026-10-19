import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { recheckClaim } from "@/lib/claims/service";
import { errorResponse } from "@/lib/http";

export const maxDuration = 120;

/** Checks the policy again for a saved claim file, after the user changed its details. */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/claims/[id]/recheck">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { assessment } = await recheckClaim(supabase, user.id, id);
    return NextResponse.json({ assessment });
  } catch (err) {
    return errorResponse(err, "We couldn't check your policy right now. Please try again.", { supabase, userId: user.id, workflow: "claim" });
  }
}
