import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { deletePolicy } from "@/lib/deletion";
import { errorResponse } from "@/lib/http";

/** Permanently deletes a policy and everything derived from it (see deletePolicy). */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/policies/[id]">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    return NextResponse.json(await deletePolicy(supabase, user.id, id));
  } catch (err) {
    return errorResponse(err, "Delete failed. Please try again.", { supabase, userId: user.id, workflow: "action" });
  }
}
