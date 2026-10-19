import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { registerUpload } from "@/lib/ingest";
import { errorResponse } from "@/lib/http";

const InitUpload = z.object({
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  contentType: z.string().max(100).optional(),
});

/** Lists the signed-in user's documents. */
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { data, error } = await supabase
    .from("documents")
    .select("id, file_name, page_count, size_bytes, processing_status, error_message, created_at, policy_id")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load documents." }, { status: 500 });
  return NextResponse.json({ documents: data });
}

/** Step 1 of upload: register the document and return its private storage path (see registerUpload). */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const parsed = InitUpload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });

  try {
    return NextResponse.json(await registerUpload(supabase, user.id, parsed.data));
  } catch (err) {
    return errorResponse(err, "Could not start the upload. Please try again.", { supabase, userId: user.id, workflow: "ingest" });
  }
}
