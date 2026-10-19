import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { createActionFromInsight } from "@/lib/audit/service";
import { errorResponse } from "@/lib/http";

const Body = z.object({ remindInDays: z.number().int().min(1).max(90).optional() });

/** The user explicitly asks to be reminded about a finding later (a saved, logged reminder). Nothing is sent anywhere. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/insights/[id]/action">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const body = Body.safeParse(await request.json().catch(() => ({})));
    const result = await createActionFromInsight(supabase, user.id, id, body.success ? body.data.remindInDays : undefined);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    return errorResponse(err, "Something went wrong. Please try again.", { supabase, userId: user.id, workflow: "action" });
  }
}
