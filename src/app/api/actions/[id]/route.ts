import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { setActionCompleted } from "@/lib/audit/service";
import { errorResponse } from "@/lib/http";

const Body = z.object({ completed: z.boolean() });

/** Tick a task done (or undo). */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/actions/[id]">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    await setActionCompleted(supabase, user.id, id, parsed.data.completed);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Something went wrong. Please try again.", { supabase, userId: user.id, workflow: "action" });
  }
}
