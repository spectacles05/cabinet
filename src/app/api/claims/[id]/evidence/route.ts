import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { registerEvidence } from "@/lib/claims/evidence";
import { errorResponse } from "@/lib/http";

const Body = z.object({
  fileName: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  contentType: z.string().max(100),
  checklistItemId: z.string().max(10).nullable().optional(),
});

/** Adding evidence, step 1: reserve a private path in the user's own folder (the browser then uploads). */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/claims/[id]/evidence">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That file can't be added." }, { status: 400 });
  try {
    return NextResponse.json(await registerEvidence(supabase, user.id, id, parsed.data));
  } catch (err) {
    return errorResponse(err, "We couldn't add that file. Please try again.", { supabase, userId: user.id, workflow: "action" });
  }
}
