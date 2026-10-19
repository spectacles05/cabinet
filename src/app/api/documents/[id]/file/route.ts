import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { STORAGE_BUCKET } from "@/lib/env";
import { logDenied } from "@/lib/http";

/**
 * Opens the user's own PDF via a short-lived signed URL, jumping to ?page=N where the browser
 * supports PDF fragment navigation. RLS ensures only the owner can create the signed URL.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/[id]/file">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const { data: doc } = await supabase.from("documents").select("storage_path, page_count").eq("id", id).maybeSingle();
  if (!doc) {
    // Someone else's document (or none): RLS returned nothing. Recorded as a refused request.
    await logDenied({ supabase, userId: user.id, workflow: "action" }, "not_found", { document_id: id });
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(doc.storage_path, 60);
  if (error || !data) return NextResponse.json({ error: "Could not open the document." }, { status: 500 });

  const page = Number(request.nextUrl.searchParams.get("page"));
  const validPage = Number.isInteger(page) && page >= 1 && (!doc.page_count || page <= doc.page_count);
  return NextResponse.redirect(validPage ? `${data.signedUrl}#page=${page}` : data.signedUrl, { status: 303 });
}
