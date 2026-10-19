import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { ReviewSubmission } from "@/lib/extraction/schema";
import { confirmExtraction } from "@/lib/extraction/confirm";
import { errorResponse } from "@/lib/http";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/documents/[id]/confirm">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const parsed = ReviewSubmission.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? "Please check the highlighted fields.", path: first?.path ?? [] },
      { status: 400 },
    );
  }

  try {
    const result = await confirmExtraction(supabase, user.id, id, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "We couldn't save your policy. Please try again.", { supabase, userId: user.id, workflow: "extract" });
  }
}
