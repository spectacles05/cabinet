import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { checkClaim, DraftSchema } from "@/lib/claims/service";
import { errorResponse } from "@/lib/http";

export const maxDuration = 120;

/** Step 2: check the policy wording for this incident. Returns a summary to confirm; nothing is saved. */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = DraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Some details are missing. Please go back and check your answers." }, { status: 400 });
  try {
    return NextResponse.json(await checkClaim(supabase, user.id, parsed.data));
  } catch (err) {
    return errorResponse(err, "We couldn't check your policy right now. Please try again.", { supabase, userId: user.id, workflow: "claim" });
  }
}
