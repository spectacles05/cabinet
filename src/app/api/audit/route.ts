import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { runAudit } from "@/lib/audit/service";
import { errorResponse } from "@/lib/http";

export const maxDuration = 120;

/** Runs the coverage review for the signed-in user's confirmed policies. */
export async function POST() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  try {
    return NextResponse.json(await runAudit(supabase, user.id));
  } catch (err) {
    return errorResponse(err, "The coverage review couldn't be completed.", { supabase, userId: user.id, workflow: "audit" });
  }
}
