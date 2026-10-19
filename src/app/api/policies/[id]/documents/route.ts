import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { attachDocumentToPolicy } from "@/lib/ingest";
import { errorResponse } from "@/lib/http";

const Body = z.object({ documentId: z.string().uuid() });

/** Adds an uploaded, read document (e.g. a missing schedule) to this policy. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/policies/[id]/documents">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    await attachDocumentToPolicy(supabase, user.id, id, parsed.data.documentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "We couldn't add this document.", { supabase, userId: user.id, workflow: "action" });
  }
}
