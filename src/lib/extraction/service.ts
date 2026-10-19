import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/ai/client";
import { getAppMode } from "@/lib/ai/mode";
import { demoReading } from "@/lib/demo/engine";
import { DEMO_ENGINE_ID } from "@/lib/demo/samples";
import { canFallBack, isUnavailableError, markUnavailable, shouldTryClaude } from "@/lib/ai/availability";
import { STORAGE_BUCKET } from "@/lib/env";
import { parsePdf } from "@/lib/pdf/parse";
import { RunLogger } from "@/lib/runs/logger";
import { LIMITS, withinAiBudget, withinLimit } from "@/lib/runs/rate-limit";
import { callExtractionModel, ExtractionError } from "./extract";
import { verifyExtraction } from "./verify-extraction";
import { EXTRACTION_VERSION, type ModelExtraction, type VerifiedExtraction } from "./schema";
import { extractWithRules, RULES_ENGINE_ID } from "./rules";

export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Re-reads the privately stored PDF to get exact per-page text (same parser as ingestion). */
async function loadPages(supabase: SupabaseClient, storagePath: string) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);
  if (error || !data) throw new ServiceError("storage_missing", "We couldn't find the stored PDF.", 404);
  return parsePdf(new Uint8Array(await data.arrayBuffer()));
}

/**
 * Reads one of the signed-in user's documents and stores the machine result (raw JSON + server-verified
 * evidence). Live AI Mode: Claude, with the rule-based reader as a fallback. Demo Mode: a prepared
 * reading for the fictional samples, the rule-based reader for anything else; never the Anthropic API.
 */
export async function runExtraction(supabase: SupabaseClient, userId: string, documentId: string) {
  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path, processing_status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) throw new ServiceError("not_found", "Document not found.", 404);
  if (!["parsed", "extracted"].includes(doc.processing_status)) {
    throw new ServiceError("wrong_state", "This document isn't ready for extraction.", 409);
  }

  const mode = await getAppMode();
  // The limit protects AI spend; Demo Mode spends nothing.
  if (mode === "live" && !(await withinLimit(supabase, "extract", LIMITS.extract.windowSeconds, LIMITS.extract.max))) {
    throw new ServiceError("rate_limited", "Too many documents read in the last few minutes. Please wait and try again.", 429);
  }

  // A re-read stays attached to the policy the user already confirmed (it is updated on next confirm).
  const previous = await getLatestExtraction(supabase, documentId);

  const run = await RunLogger.start(supabase, userId, "extract");
  await supabase.from("documents").update({ processing_status: "extracting", error_code: null, error_message: null }).eq("id", documentId);

  try {
    const parsed = await run.step("load_document_pages", () => loadPages(supabase, doc.storage_path), (p) => ({
      document_id: documentId,
      page_count: p.pageCount,
      instructions_removed: p.instructionsRemoved ?? 0,
    }));

    // Claude first (unless disabled); fall back to the rule-based reader only when Claude is unavailable.
    let result: { extraction: ModelExtraction; model: string } | null = null;
    let engine: "claude" | "rules" | "demo" = "rules";
    if (mode === "demo") {
      const prepared = demoReading(parsed.pages);
      if (prepared) {
        result = await run.step("prepared_demo_reading", async () => ({ extraction: prepared.extraction, model: DEMO_ENGINE_ID }), {
          document_id: documentId,
          model: DEMO_ENGINE_ID,
          app_mode: "demo",
          schema_version: EXTRACTION_VERSION,
        });
        engine = "demo";
      }
    } else if (shouldTryClaude() && (await withinAiBudget(supabase, run))) {
      try {
        result = await run.step(
          "claude_structured_extraction",
          async () => {
            try {
              return await callExtractionModel(await getAnthropic(), parsed.pages);
            } catch (err) {
              if (isUnavailableError(err)) throw Object.assign(err as Error, { code: "claude_unavailable" });
              throw err;
            }
          },
          (r) => ({
            document_id: documentId,
            model: r.model,
            schema_version: EXTRACTION_VERSION,
            input_tokens: r.inputTokens,
            output_tokens: r.outputTokens,
          }),
        );
        engine = "claude";
      } catch (err) {
        if (!(canFallBack() && isUnavailableError(err))) throw err;
        markUnavailable();
      }
    }
    if (!result) {
      result = await run.step(
        "rule_based_extraction",
        async () => ({ extraction: extractWithRules(parsed.pages), model: RULES_ENGINE_ID }),
        { document_id: documentId, model: RULES_ENGINE_ID, app_mode: mode, schema_version: EXTRACTION_VERSION },
      );
    }
    const extracted = result;

    const verified = await run.step("verify_evidence", async () => ({ ...verifyExtraction(extracted.extraction, parsed.pages), engine }), (v) => ({
      document_id: documentId,
      fields_found: v.stats.fields_found,
      fields_missing: v.stats.fields_missing,
      citation_count: v.stats.citations,
      rejected_citation_count: v.stats.rejected_citations,
    }));

    const extractionId = await run.step("save_extraction", async () => {
      const { data, error } = await supabase
        .from("policy_extractions")
        .insert({
          user_id: userId,
          document_id: documentId,
          raw_extraction_json: extracted.extraction,
          field_sources_json: verified,
          extraction_version: EXTRACTION_VERSION,
          model: extracted.model,
          run_id: run.runId,
          policy_id: previous?.policy_id ?? null,
        })
        .select("id")
        .single();
      if (error || !data) throw Object.assign(new Error("save failed"), { code: "db_insert_failed" });
      return data.id as string;
    }, { document_id: documentId });

    await supabase.from("documents").update({ processing_status: "extracted" }).eq("id", documentId);
    await run.finish("succeeded");
    return { extractionId, runId: run.runId, verified };
  } catch (err) {
    const message =
      err instanceof ExtractionError || err instanceof ServiceError
        ? err.message
        : "We couldn't extract details from this document. Please try again.";
    // Text remains indexed, so the user can retry extraction later.
    await supabase
      .from("documents")
      .update({ processing_status: "parsed", error_code: "extraction_failed", error_message: message })
      .eq("id", documentId);
    await run.finish("failed");
    throw new ServiceError(err instanceof ExtractionError ? err.code : "extraction_failed", message, 502);
  }
}

export type LatestExtraction = {
  id: string;
  run_id: string | null;
  policy_id: string | null;
  confirmed_at: string | null;
  model: string;
  created_at: string;
  verified: VerifiedExtraction;
  reviewed: ReviewedPolicy | null;
};

export async function getLatestExtraction(supabase: SupabaseClient, documentId: string): Promise<LatestExtraction | null> {
  const { data } = await supabase
    .from("policy_extractions")
    .select("id, run_id, policy_id, confirmed_at, model, created_at, field_sources_json, reviewed_fields_json")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    run_id: data.run_id,
    policy_id: data.policy_id,
    confirmed_at: data.confirmed_at,
    model: data.model,
    created_at: data.created_at,
    verified: data.field_sources_json as VerifiedExtraction,
    reviewed: (data.reviewed_fields_json as ReviewedPolicy | null) ?? null,
  };
}

// ───────────── reviewed (user-confirmed) record ─────────────

export type ReviewedEvidence = { page: number | null; quote: string | null; verified: boolean };

export type ReviewedField = {
  value: string | number | null;
  machine_value: string | number | null;
  edited: boolean;
  evidence: ReviewedEvidence | null;
};

type Listed<T> = T & { evidence: ReviewedEvidence };

export type ReviewedPolicy = {
  engine?: "claude" | "rules" | "demo";
  policy_type: VerifiedExtraction["policy_type"];
  fields: Record<keyof VerifiedExtraction["fields"], ReviewedField>;
  limits: Listed<{ label: string; amount: number | null; currency: string | null }>[];
  inclusions: Listed<{ summary: string }>[];
  exclusions: Listed<{ summary: string }>[];
  conditions: Listed<{ summary: string }>[];
  optional_extensions: Listed<{ name: string; status: string }>[];
  missing_information: Listed<{ description: string }>[];
  plain_english_summary: string;
  document_id: string;
  confirmed_at: string;
  /** "auto": added straight from the document after upload; "user": saved by the person (missing on older records = user). */
  added_by?: "auto" | "user";
  /** Details the person added themselves (missing on older records). */
  extras?: import("./schema").PolicyExtras;
};
