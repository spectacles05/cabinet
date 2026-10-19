import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { MAX_DESCRIPTION_CHARS, startClaim } from "@/lib/claims/service";
import { errorResponse } from "@/lib/http";

export const maxDuration = 60;

const Body = z.object({
  description: z.string().trim().min(3).max(MAX_DESCRIPTION_CHARS),
  policyId: z.string().uuid().nullable().optional(),
});

/** Step 1: understand what happened and suggest the policy. Nothing is saved. */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Please describe what happened in 3 to ${MAX_DESCRIPTION_CHARS} characters.` }, { status: 400 });
  try {
    return NextResponse.json(await startClaim(supabase, user.id, { description: parsed.data.description, policyId: parsed.data.policyId ?? null }));
  } catch (err) {
    return errorResponse(err, "We couldn't read that right now. Please try again.", { supabase, userId: user.id, workflow: "claim" });
  }
}
