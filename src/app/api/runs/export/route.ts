import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";

/**
 * Downloads the signed-in user's execution log (runs + steps) as JSON evidence.
 * The log is redacted at write time (allowlisted metadata only); the user id is not included.
 */
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const { data: runs } = await supabase
    .from("agent_runs")
    .select("id, workflow, status, started_at, completed_at")
    .order("started_at", { ascending: false })
    .limit(500);
  const ids = (runs ?? []).map((r) => r.id);
  const { data: steps } = ids.length
    ? await supabase
        .from("agent_steps")
        .select("run_id, step_name, status, duration_ms, metadata, created_at")
        .in("run_id", ids)
        .order("created_at")
    : { data: [] };

  const body = {
    exported_at: new Date().toISOString(),
    note: "Cabinet execution log. Metadata is allowlisted at write time: no policy text, names, addresses, policy numbers or question text.",
    runs: (runs ?? []).map((r) => ({
      ...r,
      steps: (steps ?? [])
        .filter((s) => s.run_id === r.id)
        .map((s) => ({ step_name: s.step_name, status: s.status, duration_ms: s.duration_ms, metadata: s.metadata, created_at: s.created_at })),
    })),
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="cabinet-run-log-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
