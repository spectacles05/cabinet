import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { setInsightRelevance, setInsightStatus } from "@/lib/audit/service";
import { errorResponse } from "@/lib/http";

const Body = z.union([z.object({ status: z.enum(["open", "reviewed", "dismissed"]) }), z.object({ relevant: z.boolean() })]);

/** Mark a finding reviewed / dismissed / open again, or answer its quick question. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/insights/[id]">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  try {
    if ("relevant" in parsed.data) await setInsightRelevance(supabase, user.id, id, parsed.data.relevant);
    else await setInsightStatus(supabase, user.id, id, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Something went wrong. Please try again.", { supabase, userId: user.id, workflow: "action" });
  }
}
