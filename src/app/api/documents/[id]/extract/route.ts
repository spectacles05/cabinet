import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { runExtraction } from "@/lib/extraction/service";
import { autoAddToWallet } from "@/lib/extraction/confirm";
import { errorResponse } from "@/lib/http";

// Claude extraction of a long policy can take a minute or more.
export const maxDuration = 300;

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/documents/[id]/extract">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  try {
    const result = await runExtraction(supabase, user.id, id);
    // Straight into the wallet; if that step fails, the document can still be added from its edit page.
    const policyId = await autoAddToWallet(supabase, user.id, id).catch(() => null);
    return NextResponse.json({
      extractionId: result.extractionId,
      runId: result.runId,
      fieldsFound: result.verified.stats.fields_found,
      policyId,
    });
  } catch (err) {
    return errorResponse(err, "Extraction failed. Please try again.", { supabase, userId: user.id, workflow: "extract" });
  }
}
