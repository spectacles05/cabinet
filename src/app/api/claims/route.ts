import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { AssessmentSchema, DraftSchema, saveClaim } from "@/lib/claims/service";
import type { ClaimAssessment } from "@/lib/claims/types";
import { errorResponse } from "@/lib/http";

const Body = DraftSchema.extend({ confirmed: z.boolean().optional(), assessment: AssessmentSchema });

/** Step 3: save the claim, only when the user has explicitly confirmed the summary. */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Some details are missing. Please check the summary again." }, { status: 400 });
  try {
    const { confirmed, assessment, ...draft } = parsed.data;
    return NextResponse.json(
      await saveClaim(supabase, user.id, { ...draft, confirmed: confirmed === true, assessment: assessment as ClaimAssessment }),
    );
  } catch (err) {
    return errorResponse(err, "We couldn't save your claim. Please try again.", { supabase, userId: user.id, workflow: "claim" });
  }
}
