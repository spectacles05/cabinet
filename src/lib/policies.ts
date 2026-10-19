import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewedPolicy } from "@/lib/extraction/service";

export type PolicyRow = {
  id: string;
  policy_type: string;
  insurer: string | null;
  display_name: string | null;
  policy_number_masked: string | null;
  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;
  premium_amount: number | null;
  premium_frequency: string | null;
  currency: string | null;
  excess_amount: number | null;
  confirmed_at: string | null;
};

export type PolicyWithDetails = PolicyRow & { reviewed: ReviewedPolicy | null; documentId: string | null };

const COLUMNS =
  "id, policy_type, insurer, display_name, policy_number_masked, start_date, end_date, renewal_date, premium_amount, premium_frequency, currency, excess_amount, confirmed_at";

/** Loads the signed-in user's confirmed policies (RLS-scoped) with their user-reviewed details. */
export async function getPolicies(supabase: SupabaseClient, policyId?: string): Promise<PolicyWithDetails[]> {
  let query = supabase.from("policies").select(COLUMNS).eq("status", "confirmed").order("created_at", { ascending: false });
  if (policyId) query = query.eq("id", policyId);
  const { data: policies, error } = await query;
  if (error) throw new Error("Could not load policies");
  if (!policies?.length) return [];

  const { data: extractions } = await supabase
    .from("policy_extractions")
    .select("policy_id, document_id, reviewed_fields_json, confirmed_at")
    .in("policy_id", policies.map((p) => p.id))
    .not("confirmed_at", "is", null)
    .order("confirmed_at", { ascending: false });

  return policies.map((p) => {
    const ex = extractions?.find((e) => e.policy_id === p.id);
    return {
      ...(p as PolicyRow),
      premium_amount: p.premium_amount === null ? null : Number(p.premium_amount),
      excess_amount: p.excess_amount === null ? null : Number(p.excess_amount),
      reviewed: (ex?.reviewed_fields_json as ReviewedPolicy | undefined) ?? null,
      documentId: ex?.document_id ?? null,
    };
  });
}

/** The name people use for a policy: their own nickname, else the name before any " — " subtitle. */
export function shortPolicyName(p: Pick<PolicyWithDetails, "display_name" | "insurer" | "reviewed">): string {
  return p.reviewed?.extras?.nickname || (p.display_name ?? p.insurer ?? "Your policy").split(/\s[—–-]\s/)[0];
}
