import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { deleteClaim, DetailsSchema, setChecklistItem, setClaimStatus, updateClaimDetails } from "@/lib/claims/service";
import { errorResponse } from "@/lib/http";

const Body = z.union([
  z.object({ itemId: z.string().max(10), done: z.boolean() }),
  z.object({ status: z.enum(["preparing", "submitted", "closed"]), confirmed: z.boolean().optional() }),
  z.object({ details: DetailsSchema }),
]);

/** Tick a checklist item, change the claim's status, or save edited details. Each is the user's own action. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/claims/[id]">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid change." }, { status: 400 });
  try {
    if ("itemId" in parsed.data) {
      return NextResponse.json({ checklist: await setChecklistItem(supabase, user.id, id, parsed.data.itemId, parsed.data.done) });
    }
    if ("details" in parsed.data) {
      await updateClaimDetails(supabase, user.id, id, parsed.data.details);
      return NextResponse.json({ ok: true });
    }
    await setClaimStatus(supabase, user.id, id, parsed.data.status, parsed.data.confirmed === true);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Something went wrong. Please try again.", { supabase, userId: user.id, workflow: "action" });
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/claims/[id]">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    await deleteClaim(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Something went wrong. Please try again.", { supabase, userId: user.id, workflow: "action" });
  }
}
