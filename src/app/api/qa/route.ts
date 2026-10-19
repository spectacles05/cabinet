import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { askQuestion, MAX_QUESTION_CHARS } from "@/lib/qa/service";
import { errorResponse } from "@/lib/http";

export const maxDuration = 120;

const Body = z.object({
  question: z.string().trim().min(3).max(MAX_QUESTION_CHARS),
  policyId: z.string().uuid().nullable(),
  threadId: z.string().uuid().nullable().optional(),
  claimId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: `Please ask a question between 3 and ${MAX_QUESTION_CHARS} characters.` }, { status: 400 });
  }

  try {
    const result = await askQuestion(supabase, user.id, {
      question: parsed.data.question,
      policyId: parsed.data.policyId,
      threadId: parsed.data.threadId ?? null,
      claimId: parsed.data.claimId ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "We couldn't answer that right now. Please try again.", { supabase, userId: user.id, workflow: "qa" });
  }
}
