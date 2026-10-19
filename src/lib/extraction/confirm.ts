import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RunLogger } from "@/lib/runs/logger";
import { FIELD_KEYS, NO_EXTRAS, ReviewSubmission, type VerifiedExtraction } from "./schema";
import { maskPolicyNumber } from "./verify-extraction";
import { getLatestExtraction, ServiceError, type ReviewedEvidence, type ReviewedPolicy } from "./service";

const ev = (check: { verified: boolean; page: number | null }, quote: string | null): ReviewedEvidence => ({
  page: check.page,
  quote: check.verified ? quote : null, // only verified quotes are kept as evidence
  verified: check.verified,
});

function pick<T>(items: T[], keep: number[]): T[] {
  const wanted = new Set(keep);
  return items.filter((_, i) => wanted.has(i));
}

/** Builds the authoritative reviewed record from the user's submission + the machine evidence. */
export function buildReviewedPolicy(
  verified: VerifiedExtraction,
  submission: ReviewSubmission,
  documentId: string,
  now: Date,
  addedBy: "auto" | "user" = "user",
): ReviewedPolicy {
  const fields = {} as ReviewedPolicy["fields"];
  for (const key of FIELD_KEYS) {
    const machine = verified.fields[key];
    const value = submission.fields[key];
    const edited = value !== machine.value;
    fields[key] = {
      value,
      machine_value: machine.value,
      edited,
      // Evidence only describes the machine value; an edited value is the user's own statement.
      evidence: !edited && value !== null ? ev(machine.check, machine.quote) : null,
    };
  }
  return {
    engine: verified.engine ?? "claude",
    policy_type: submission.policy_type,
    fields,
    limits: pick(verified.limits, submission.keep.limits).map((l) => ({
      label: l.label,
      amount: l.amount,
      currency: l.currency,
      evidence: ev(l.check, l.quote),
    })),
    inclusions: pick(verified.inclusions, submission.keep.inclusions).map((i) => ({ summary: i.summary, evidence: ev(i.check, i.quote) })),
    exclusions: pick(verified.exclusions, submission.keep.exclusions).map((i) => ({ summary: i.summary, evidence: ev(i.check, i.quote) })),
    conditions: pick(verified.conditions, submission.keep.conditions).map((i) => ({ summary: i.summary, evidence: ev(i.check, i.quote) })),
    optional_extensions: pick(verified.optional_extensions, submission.keep.optional_extensions).map((e) => ({
      name: e.name,
      status: e.status,
      evidence: ev(e.check, e.quote),
    })),
    missing_information: verified.missing_information.map((m) => ({ description: m.description, evidence: ev(m.check, m.quote) })),
    plain_english_summary: verified.plain_english_summary,
    document_id: documentId,
    confirmed_at: now.toISOString(),
    added_by: addedBy,
    extras: submission.extras ?? NO_EXTRAS,
  };
}

/**
 * What Cabinet found, as a submission: every machine value and every list item kept. Any value that
 * wouldn't pass validation (e.g. an end date before the start date) is left blank rather than guessed.
 */
export function defaultSubmission(verified: VerifiedExtraction): ReviewSubmission {
  const fields = Object.fromEntries(FIELD_KEYS.map((k) => [k, verified.fields[k].value])) as Record<string, unknown>;
  const all = (items: unknown[]) => items.map((_, i) => i);
  const draft = {
    policy_type: verified.policy_type,
    fields,
    keep: {
      limits: all(verified.limits),
      inclusions: all(verified.inclusions),
      exclusions: all(verified.exclusions),
      conditions: all(verified.conditions),
      optional_extensions: all(verified.optional_extensions),
    },
  };
  for (let attempt = 0; attempt <= FIELD_KEYS.length; attempt++) {
    const parsed = ReviewSubmission.safeParse(draft);
    if (parsed.success) return parsed.data;
    const bad = parsed.error.issues.map((i) => i.path).find((path) => path[0] === "fields" && typeof path[1] === "string");
    if (!bad) break;
    fields[bad[1] as string] = null;
  }
  throw new ServiceError("invalid_extraction", "We couldn't add this policy automatically.", 422);
}

/**
 * Saves the policy record (from the person's edits, or automatically after upload) as the authoritative record (create or update), keeps
 * the machine extraction untouched, links the document/chunks to the policy, and logs the step.
 */
export async function confirmExtraction(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  submission: ReviewSubmission,
  addedBy: "auto" | "user" = "user",
) {
  const extraction = await getLatestExtraction(supabase, documentId);
  if (!extraction) throw new ServiceError("not_found", "There is no extraction to confirm for this document.", 404);

  const now = new Date();
  const reviewed = buildReviewedPolicy(extraction.verified, submission, documentId, now, addedBy);
  const f = submission.fields;
  const policyRow = {
    user_id: userId,
    policy_type: submission.policy_type,
    insurer: f.insurer,
    display_name: f.display_name,
    policy_number_masked: maskPolicyNumber(f.policy_number),
    start_date: f.start_date,
    end_date: f.end_date,
    renewal_date: f.renewal_date,
    premium_amount: f.premium_amount,
    premium_frequency: f.premium_frequency,
    currency: f.currency,
    excess_amount: f.excess_amount,
    status: "confirmed",
    confirmed_at: now.toISOString(),
  };

  const run =
    (extraction.run_id && (await RunLogger.resume(supabase, userId, extraction.run_id))) ||
    (await RunLogger.start(supabase, userId, "extract"));

  const policyId = await run.step(addedBy === "auto" ? "added_to_wallet" : "user_review_confirmed", async () => {
    let id = extraction.policy_id;
    if (id) {
      const { error } = await supabase.from("policies").update(policyRow).eq("id", id);
      if (error) throw Object.assign(new Error("update failed"), { code: "db_update_failed" });
    } else {
      const { data, error } = await supabase.from("policies").insert(policyRow).select("id").single();
      if (error || !data) throw Object.assign(new Error("insert failed"), { code: "db_insert_failed" });
      id = data.id as string;
    }
    const { error: exErr } = await supabase
      .from("policy_extractions")
      .update({ reviewed_fields_json: reviewed, confirmed_at: now.toISOString(), policy_id: id })
      .eq("id", extraction.id);
    if (exErr) throw Object.assign(new Error("extraction update failed"), { code: "db_update_failed" });
    await supabase.from("documents").update({ policy_id: id }).eq("id", documentId);
    await supabase.from("document_chunks").update({ policy_id: id }).eq("document_id", documentId);
    return id;
  }, {
    document_id: documentId,
    field_count: FIELD_KEYS.filter((k) => reviewed.fields[k].value !== null).length,
  });

  return { policyId, runId: run.runId };
}

/**
 * Right after a document is read, puts the policy straight into the wallet using what Cabinet found.
 * A document that already has a policy is left alone: re-reading never overwrites the person's edits.
 */
export async function autoAddToWallet(supabase: SupabaseClient, userId: string, documentId: string): Promise<string> {
  const extraction = await getLatestExtraction(supabase, documentId);
  if (!extraction) throw new ServiceError("not_found", "There is no extraction for this document.", 404);
  if (extraction.policy_id) return extraction.policy_id;
  const { policyId } = await confirmExtraction(supabase, userId, documentId, defaultSubmission(extraction.verified), "auto");
  return policyId;
}
