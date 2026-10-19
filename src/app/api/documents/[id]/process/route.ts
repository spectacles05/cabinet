import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { processStoredDocument } from "@/lib/ingest";
import { errorResponse } from "@/lib/http";

export const maxDuration = 60;

const Body = z.object({ runId: z.string().uuid().optional() });

/** Step 2 of upload: read the privately stored PDF into page-numbered, searchable text (see processStoredDocument). */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/documents/[id]/process">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const body = Body.safeParse(await request.json().catch(() => ({})));
  try {
    const r = await processStoredDocument(supabase, user.id, id, body.success ? body.data.runId : undefined);
    return NextResponse.json({ ...r, status: "parsed" });
  } catch (err) {
    return errorResponse(err, "We couldn't read this PDF.", { supabase, userId: user.id, workflow: "ingest" });
  }
}
