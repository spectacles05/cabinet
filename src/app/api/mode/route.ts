import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { MODE_COOKIE, modeSetting } from "@/lib/ai/mode";
import { logDenied } from "@/lib/http";

const Body = z.object({ mode: z.enum(["demo", "live"]) });

/** Switches this browser between Demo Mode and Live AI Mode. Only when the server allows it (CABINET_MODE=switchable). */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  // JSON only: a cross-site form can't send this content type without a CORS preflight.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Unsupported request." }, { status: 415 });
  }
  if (modeSetting() !== "switchable") {
    await logDenied({ supabase, userId: user.id, workflow: "action" }, "mode_fixed");
    return NextResponse.json({ error: "The mode is fixed on this site." }, { status: 403 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid mode." }, { status: 400 });

  const res = NextResponse.json({ mode: parsed.data.mode });
  res.cookies.set(MODE_COOKIE, parsed.data.mode, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
