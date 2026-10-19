import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/ai/client";
import { getAppMode } from "@/lib/ai/mode";
import { demoAnswer } from "@/lib/demo/engine";
import { DEMO_ENGINE_ID } from "@/lib/demo/samples";
import { canFallBack, isUnavailableError, markUnavailable, shouldTryClaude } from "@/lib/ai/availability";
import { getPolicies, type PolicyWithDetails } from "@/lib/policies";
import { RunLogger } from "@/lib/runs/logger";
import { withinAiBudget } from "@/lib/runs/rate-limit";
import { ServiceError } from "@/lib/extraction/service";
import { analyseQuestion } from "./query";
import { answerWithRules, RULES_QA_ID } from "./rules-answer";
import { answerWithClaude, QA_SCHEMA_VERSION, type PriorTurn } from "./claude-answer";
import { formatDateLong, formatMoney } from "@/lib/format";
import { verifyAnswer } from "./verify-citations";
import type { ProposedAnswer, QaAnswer, RetrievedChunk, ScopePolicy } from "./types";

export const MAX_QUESTION_CHARS = 500;
const MAX_QUESTIONS_PER_MINUTE = 10;
const RETRIEVE_LIMIT = 12;

export function toScopePolicy(p: PolicyWithDetails): ScopePolicy {
  const excess = formatMoney(p.excess_amount, p.currency);
  const until = p.renewal_date ? `renews ${formatDateLong(p.renewal_date)}` : p.end_date ? `ends ${formatDateLong(p.end_date)}` : null;
  const nickname = p.reviewed?.extras?.nickname;
  return {
    id: p.id,
    name: p.display_name ?? p.insurer ?? `${p.policy_type} policy`,
    policy_type: p.policy_type,
    insurer: p.insurer,
    documentId: p.documentId,
    // Details the user confirmed, so replies can be about their cover rather than insurance in general.
    facts: [nickname ? `the user calls it "${nickname}"` : null, excess ? `standard excess ${excess}` : null, until].filter((f): f is string => Boolean(f)),
    extensions: (p.reviewed?.optional_extensions ?? []).map((e) => ({
      name: e.name,
      status: e.status,
      page: e.evidence.page,
      quote: e.evidence.quote,
    })),
  };
}

export async function retrieve(supabase: SupabaseClient, terms: string[], scope: ScopePolicy[]): Promise<RetrievedChunk[]> {
  const ids = scope.map((p) => p.id);
  const found: RetrievedChunk[] = [];
  if (terms.length) {
    const { data, error } = await supabase.rpc("search_chunks", { query_terms: terms, policy_ids: ids, max_results: RETRIEVE_LIMIT });
    if (error) throw Object.assign(new Error("search failed"), { code: "search_failed" });
    found.push(...(data as RetrievedChunk[]));
  }
  // Also include the schedule passages that record which add-ons were bought: many answers hinge on them.
  const extPages = scope.flatMap((p) => p.extensions.map((e) => ({ policy: p.id, page: e.page })).filter((x) => x.page));
  if (extPages.length) {
    const { data } = await supabase
      .from("document_chunks")
      .select("id, document_id, policy_id, page_number, text")
      .in("policy_id", [...new Set(extPages.map((x) => x.policy))])
      .in("page_number", [...new Set(extPages.map((x) => x.page as number))])
      .limit(10);
    for (const c of (data ?? []) as RetrievedChunk[]) if (!found.some((f) => f.id === c.id)) found.push(c);
  }
  return found;
}

/** The last two exchanges of this conversation, so follow-up questions make sense. */
async function priorTurns(supabase: SupabaseClient, threadId: string): Promise<PriorTurn[]> {
  const { data } = await supabase
    .from("qa_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(4);
  const rows = (data ?? []).reverse() as { role: string; content: string }[];
  const turns: PriorTurn[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i].role === "user" && rows[i + 1].role === "assistant") {
      turns.push({ question: rows[i].content.slice(0, MAX_QUESTION_CHARS), reply: rows[i + 1].content.slice(0, 800) });
    }
  }
  return turns.slice(-2);
}

/** Demo Mode: every passage of the policies in scope, so prepared answers can find their exact wording. */
async function scopeChunks(supabase: SupabaseClient, scope: ScopePolicy[]): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, policy_id, page_number, text")
    .in("policy_id", scope.map((p) => p.id))
    .order("page_number")
    .limit(2000);
  if (error) throw Object.assign(new Error("chunks"), { code: "db_read_failed" });
  return (data ?? []) as RetrievedChunk[];
}

export async function askQuestion(
  supabase: SupabaseClient,
  userId: string,
  input: { question: string; policyId: string | null; threadId: string | null; claimId?: string | null },
): Promise<{ threadId: string; runId: string; answer: QaAnswer }> {
  const question = input.question.trim();
  if (question.length < 3 || question.length > MAX_QUESTION_CHARS) {
    throw new ServiceError("bad_question", `Please ask a question between 3 and ${MAX_QUESTION_CHARS} characters.`);
  }

  // Simple per-user throttle (cost and abuse control).
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("workflow", "qa")
    .gte("started_at", since);
  if ((count ?? 0) >= MAX_QUESTIONS_PER_MINUTE) {
    throw new ServiceError("rate_limited", "You're asking questions quickly. Please wait a minute and try again.", 429);
  }

  // Asking from a claim file: scoped to that claim's policy, with the claim's details as context.
  const claimId = input.claimId ?? null;
  let claimContext: string | null = null;
  if (claimId) {
    const { data: claim } = await supabase
      .from("claims")
      .select("policy_id, title, description, incident_type, incident_date, answers_json")
      .eq("id", claimId)
      .maybeSingle();
    if (!claim || (input.policyId && input.policyId !== claim.policy_id)) throw new ServiceError("not_found", "That claim file wasn't found.", 404);
    input = { ...input, policyId: claim.policy_id as string };
    const a = (claim.answers_json ?? {}) as Record<string, unknown>;
    claimContext = [
      `Claim file: ${claim.title} (${String(claim.incident_type).replace(/_/g, " ")})`,
      claim.incident_date ? `Happened on: ${claim.incident_date}` : "Date: not known",
      ...Object.entries(a)
        .filter(([k]) => k !== "when")
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") || "none" : String(v)}`),
      `What the user said happened: ${String(claim.description).slice(0, 1000)}`,
    ].join("\n");
  }

  const all = await getPolicies(supabase);
  const scopeRows = input.policyId ? all.filter((p) => p.id === input.policyId) : all;
  if (input.policyId && scopeRows.length === 0) throw new ServiceError("not_found", "Policy not found.", 404);
  if (scopeRows.length === 0) {
    throw new ServiceError("no_policies", "Add and confirm a policy before asking questions.", 409);
  }
  const scope = scopeRows.map(toScopePolicy);

  const mode = await getAppMode();
  const run = await RunLogger.start(supabase, userId, "qa");
  try {
    // Continue only the caller's own thread with the same scope (RLS + explicit scope check).
    let threadId = input.threadId;
    if (threadId) {
      const { data } = await supabase.from("qa_threads").select("id, policy_id, claim_id").eq("id", threadId).maybeSingle();
      if (!data || (data.policy_id ?? null) !== (input.policyId ?? null) || (data.claim_id ?? null) !== claimId) threadId = null;
    }
    const history = threadId
      ? await run.step("load_conversation", () => priorTurns(supabase, threadId!), (h) => ({ history_turn_count: h.length }))
      : [];
    // A follow-up such as "and if it was stolen?" borrows the subject of the previous question.
    const own = analyseQuestion(question);
    const analysis = own.concepts.length === 0 && history.length ? analyseQuestion(`${history.at(-1)!.question} ${question}`) : own;
    const chunks = await run.step(
      "retrieve_user_chunks",
      () => (mode === "demo" ? scopeChunks(supabase, scope) : retrieve(supabase, analysis.searchTerms, scope)),
      (c) => ({ retrieved_chunk_count: c.length, policy_id: input.policyId ?? "wallet" }),
    );

    let proposed: ProposedAnswer | null = null;
    let engine: QaAnswer["engine"] = "rules";
    let model = RULES_QA_ID;
    if (mode === "demo") {
      // Prepared answers only; anything else gets an honest "demo is limited" reply. Never the Anthropic API.
      const r = await run.step("prepared_demo_answer", async () => demoAnswer(question, chunks), (r) => ({
        model: DEMO_ENGINE_ID,
        app_mode: "demo",
        completed: r.preparedId !== null,
      }));
      proposed = r.proposed;
      engine = "demo";
      model = DEMO_ENGINE_ID;
    } else if (chunks.length > 0 && shouldTryClaude() && (await withinAiBudget(supabase, run))) {
      try {
        const r = await run.step(
          "claude_constrained_answer",
          async () => {
            try {
              return await answerWithClaude(await getAnthropic(), question, chunks, scope, history, claimContext);
            } catch (err) {
              if (isUnavailableError(err)) throw Object.assign(err as Error, { code: "claude_unavailable" });
              throw err;
            }
          },
          (r) => ({ model: r.model, schema_version: QA_SCHEMA_VERSION, input_tokens: r.inputTokens, output_tokens: r.outputTokens }),
        );
        proposed = r.proposed;
        engine = "claude";
        model = r.model;
      } catch (err) {
        if (!(canFallBack() && isUnavailableError(err))) throw err;
        markUnavailable();
      }
    }
    if (!proposed) {
      proposed = await run.step("rule_based_answer", async () => answerWithRules(analysis, chunks, scope), {
        model: RULES_QA_ID,
        schema_version: QA_SCHEMA_VERSION,
      });
    }

    const answer = await run.step(
      "verify_citations",
      async () => verifyAnswer(proposed!, chunks, scope, { engine, model, scopePolicyIds: scope.map((p) => p.id) }),
      (a) => ({
        citation_count: a.citations.length,
        rejected_citation_count: a.rejected_citations,
        assessment: a.assessment,
        condition_count: a.conditions.length,
        reply_word_count: replyWords(a),
      }),
    );

    const savedThreadId = await run.step("save_conversation", async () => {
      if (!threadId) {
        const { data, error } = await supabase
          .from("qa_threads")
          .insert({ user_id: userId, policy_id: input.policyId, ...(claimId ? { claim_id: claimId } : {}) })
          .select("id")
          .single();
        if (error || !data) throw Object.assign(new Error("thread insert failed"), { code: "db_insert_failed" });
        threadId = data.id as string;
      }
      const { error } = await supabase.from("qa_messages").insert([
        { user_id: userId, thread_id: threadId, role: "user", content: question },
        {
          user_id: userId,
          thread_id: threadId,
          role: "assistant",
          content: [answer.headline, answer.answer].filter(Boolean).join(" ").slice(0, 8000),
          assessment: answer.assessment === "information" ? null : answer.assessment,
          answer_json: answer,
          citations_json: answer.citations,
        },
      ]);
      if (error) throw Object.assign(new Error("message insert failed"), { code: "db_insert_failed" });
      return threadId;
    }, (t) => ({ thread_id: t }));

    await run.finish(answer.assessment === "insufficient_evidence" ? "abstained" : "succeeded");
    return { threadId: savedThreadId, runId: run.runId, answer };
  } catch (err) {
    await run.finish("failed");
    if (err instanceof ServiceError) throw err;
    throw new ServiceError("qa_failed", "We couldn't answer that right now. Please try again.", 502);
  }
}

/** Words in the main reply (conclusion, explanation, must-knows, next step): logged, never used to cut text. */
export function replyWords(a: Pick<QaAnswer, "headline" | "answer" | "conditions" | "next_step">): number {
  return [a.headline ?? "", a.answer, ...a.conditions, a.next_step ?? ""].join(" ").split(/\s+/).filter(Boolean).length;
}

export type ThreadMessage = { id: string; role: "user" | "assistant"; content: string; answer: QaAnswer | null; created_at: string };

/** Latest conversation for a scope (a single policy, or the whole wallet when policyId is null). */
export async function getLatestThread(supabase: SupabaseClient, policyId: string | null, claimId: string | null = null) {
  let q = supabase.from("qa_threads").select("id").order("created_at", { ascending: false }).limit(1);
  q = claimId ? q.eq("claim_id", claimId) : q.is("claim_id", null);
  q = policyId ? q.eq("policy_id", policyId) : q.is("policy_id", null);
  const { data: thread } = await q.maybeSingle();
  if (!thread) return { threadId: null, messages: [] as ThreadMessage[] };
  const { data: messages } = await supabase
    .from("qa_messages")
    .select("id, role, content, answer_json, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true })
    .limit(100);
  return {
    threadId: thread.id as string,
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      answer: (m.answer_json as QaAnswer | null) ?? null,
      created_at: m.created_at,
    })) as ThreadMessage[],
  };
}
