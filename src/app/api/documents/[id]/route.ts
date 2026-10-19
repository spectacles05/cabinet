import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { deleteUnconfirmedDocument } from "@/lib/deletion";
import { errorResponse } from "@/lib/http";

/** Deletes an uploaded document that was never confirmed as a policy. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    await deleteUnconfirmedDocument(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Delete failed. Please try again.", { supabase, userId: user.id, workflow: "action" });
  }
}
