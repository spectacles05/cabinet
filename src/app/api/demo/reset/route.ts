import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { resetDemoWallet } from "@/lib/demo/reset";
import { errorResponse } from "@/lib/http";

export const maxDuration = 60;

/** Demo Mode only: puts the signed-in user's wallet back to the three fictional sample policies. */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Unsupported request." }, { status: 415 });
  }
  try {
    const { policyIds } = await resetDemoWallet(supabase, user.id);
    return NextResponse.json({ policies: policyIds.length });
  } catch (err) {
    return errorResponse(err, "We couldn't reset the demo. Please try again.", { supabase, userId: user.id, workflow: "action" });
  }
}
