import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getPolicies, shortPolicyName, type PolicyWithDetails } from "@/lib/policies";
import { listInsights, type InsightRow } from "@/lib/audit/service";
import { reviewFindings } from "@/lib/audit/attention";
import { DuckCheer, FoxMagnifier } from "@/components/cabinet/animals";
import { Boop, Peeker } from "@/components/cabinet/peeker";
import { FolderTab, type FolderRef } from "@/components/cabinet/folder-tab";
import { POLICY_TYPE_LABEL } from "@/lib/format";
import { Annotation, Note, ReviewButton, type CompareGroup } from "./review-client";

export const metadata = { title: "Your cover — Cabinet" };

/**
 * Your cover: an inspection sheet. Cabinet has looked through the policy folders and left a few
 * numbered notes, each tagged with its folders, or found everything in order: "All sorted."
 * (Claim deadlines live in Claim Files, not here.)
 */
export default async function ReviewPage({ searchParams }: PageProps<"/app/review">) {
  // ?note=<id> opens that note (linked from its policy folder).
  const { note: openId } = await searchParams;
  const { supabase } = await getUser();
  const [insights, policies, { data: lastRun }] = await Promise.all([
    listInsights(supabase).catch(() => [] as InsightRow[]),
    getPolicies(supabase).catch(() => [] as PolicyWithDetails[]),
    supabase
      .from("agent_runs")
      .select("id, started_at")
      .eq("workflow", "audit")
      .eq("status", "succeeded")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  // How many folders the last check actually looked at (from its log), so the count never runs ahead of it.
  const { data: lastStep } = lastRun
    ? await supabase.from("agent_steps").select("metadata").eq("run_id", lastRun.id).eq("step_name", "load_confirmed_policies").maybeSingle()
    : { data: null };

  // Each policy as its folder tab: "Travel", "Gadget"… unless two share a type (or it has a nickname).
  const sameType = (t: string) => policies.filter((p) => p.policy_type === t).length;
  const folderOf = (p: PolicyWithDetails): FolderRef => ({
    id: p.id,
    type: p.policy_type,
    label: p.reviewed?.extras?.nickname || (sameType(p.policy_type) === 1 && POLICY_TYPE_LABEL[p.policy_type]) || shortPolicyName(p),
  });
  const folderById = new Map(policies.map((p) => [p.id, folderOf(p)]));
  const byId = new Map(policies.map((p) => [p.id, p]));
  const foldersFor = (i: InsightRow): FolderRef[] =>
    i.policy_ids.map(
      (id) => folderById.get(id) ?? { id: null, type: "other", label: i.evidence.find((e) => e.policy_id === id)?.policy_name ?? "Policy" },
    );

  // Renewals live in Notifications; this sheet is about gaps, overlaps and missing documents.
  const relevant = insights.filter((i) => i.insight_type !== "renewal_due");
  const asking = (i: InsightRow) => Boolean(i.relevance_question) && i.relevance !== "yes";
  const active = reviewFindings(insights);
  const findings = active.filter((i) => !asking(i));
  const questions = active.filter(asking);
  const later = relevant.filter((i) => i.status === "open" && i.snoozed_until);
  const settled = relevant.filter((i) => i.status !== "open");
  const total = findings.length + questions.length;

  if (policies.length === 0) {
    return (
      <div className="cab-rise mx-auto flex max-w-xl flex-col items-center pt-10 text-center">
        <FoxMagnifier className="h-28 w-auto" />
        <p className="small-caps mt-6 text-ink-faint">Your cover</p>
        <h1 className="font-display mt-2 text-[34px] font-normal tracking-tight text-ink">No folders yet.</h1>
        <Link href="/app/upload" className="cab-press mt-6 rounded-full bg-ink px-7 py-3 text-[15px] font-semibold text-paper">
          Add a policy
        </Link>
      </div>
    );
  }

  const note = (i: InsightRow, n: number) => {
    const folders = foldersFor(i);
    if (asking(i)) return <Annotation key={i.id} insight={i} n={n} folders={folders} />;
    const action = i.action;
    let message: string | undefined;
    if (action.kind === "contact_insurer") {
      const number = (byId.get(action.policy_id)?.reviewed?.fields.policy_number?.value as string | null | undefined) ?? null;
      message = `Hello, could I add the ${action.topic} to my policy${number ? ` ${number}` : ""}? What would it cost?`;
    }
    let compare: CompareGroup[] | undefined;
    if (action.kind === "compare") {
      compare = i.policy_ids.map((id, k) => ({
        folder: folders[k],
        quotes: i.evidence.filter((e) => e.policy_id === id && e.quote).map((e) => ({ quote: e.quote!, page: e.page, documentId: e.document_id })),
      }));
    }
    return <Note key={i.id} insight={i} n={n} folders={folders} message={message} compare={compare} initiallyOpen={i.id === openId} />;
  };

  const reviewed = Boolean(lastRun) || relevant.length > 0;
  const checkedAt = lastRun?.started_at ?? relevant.map((i) => i.generated_at).sort().at(-1);
  const day = checkedAt ? new Date(checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : null;
  const count = Number((lastStep?.metadata as { policy_count?: unknown } | null)?.policy_count) || policies.length;
  // A folder added, removed or edited since that check: say so, quietly, with the way to bring it up to date.
  const changed =
    Boolean(lastRun) &&
    (count !== policies.length || policies.some((p) => p.confirmed_at && Date.parse(p.confirmed_at) > Date.parse(lastRun!.started_at)));
  const changedLine = changed && (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-[#8a6420]">
      <span>Your folders have changed since then ·</span>
      <ReviewButton />
    </p>
  );

  const folds = (
    <>
      {later.length > 0 && (
        <Folded label={`Later · ${later.length}`}>{later.map((i, k) => note(i, k + 1))}</Folded>
      )}
      {settled.length > 0 && (
        <Folded label={`Sorted · ${settled.length}`}>{settled.map((i, k) => note(i, k + 1))}</Folded>
      )}
    </>
  );

  // Everything checked is in order: the folders stand in their drawer.
  if (reviewed && total === 0) {
    return (
      <div className="mx-auto max-w-xl pb-16 pt-4">
        <div className="cab-rise flex flex-col items-center text-center">
          <Boop label="Say hello to the duck" phrases={["All good!", "Quack!", "Nothing to worry about."]}>
            <DuckCheer className="h-32 w-auto" />
          </Boop>
          <p className="small-caps mt-6 text-ink-faint">Your cover</p>
          <h1 className="font-display mt-2 text-[44px] font-normal leading-none tracking-[-0.02em] text-ink">All sorted.</h1>
          <p className="mt-4 text-[15px] text-ink-soft">
            Nothing needs your attention · {count} {count === 1 ? "policy" : "policies"} checked
          </p>
          <div className="mt-10 flex w-full flex-wrap items-end justify-center gap-1.5 border-b-[1.5px] border-ink px-4">
            {policies.map((p) => (
              <FolderTab key={p.id} folder={folderOf(p)} link size="lg" />
            ))}
          </div>
          {changed ? (
            <div className="mt-3">{changedLine}</div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-[13px] text-ink-faint">
              {day && <span>Checked {day} ·</span>}
              <ReviewButton />
            </p>
          )}
        </div>
        {(later.length > 0 || settled.length > 0) && <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[13px]">{folds}</div>}
      </div>
    );
  }

  // Below the sheet: what's been set aside or sorted (folded away), and a quiet "Check again".
  const foot = (
    <div className="mt-6 flex flex-wrap items-start gap-x-6 gap-y-3 text-[13px]">
      {folds}
      {!changed && (
        <span className="ml-auto text-ink-faint">
          <ReviewButton />
        </span>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-xl pb-16 pt-2">
      <header className="cab-rise">
        <p className="small-caps text-ink-faint">Your cover</p>
        <h1 className="font-display mt-3 text-[38px] font-normal leading-[1.05] tracking-[-0.02em] text-ink sm:text-[44px]">
          {!reviewed ? "Nothing checked yet." : `${total} ${total === 1 ? "thing" : "things"} to check.`}
        </h1>
        <p className="mt-3 text-[14px] text-ink-soft">
          {count} {count === 1 ? "folder" : "folders"} {reviewed ? "checked" : "to look through"}
          {reviewed && day && ` · ${day}`}
        </p>
        {changedLine}
      </header>

      {!reviewed ? (
        <div className="cab-rise mt-10 flex items-end justify-between gap-4 border-t-[1.5px] border-ink pt-6" style={{ animationDelay: "80ms" }}>
          <ReviewButton first />
          <FoxMagnifier className="h-20 w-auto" />
        </div>
      ) : (
        <>
          {/* The sheet: a ruled list of numbered notes, the fox keeping watch over the top. */}
          <div className="cab-rise relative mt-14" style={{ animationDelay: "80ms" }}>
            <Peeker
              animal="fox"
              className="right-2"
              phrases={[total === 1 ? "Just this one." : `${total} things, then you're sorted.`, "I'll keep an eye out.", "Tap one to see why."]}
            />
            <ol className="relative z-10 border-t-[1.5px] border-ink bg-paper">
              {findings.map((i, k) => note(i, k + 1))}
              {questions.map((i, k) => note(i, findings.length + k + 1))}
            </ol>
          </div>
          {foot}
        </>
      )}
    </div>
  );
}

function Folded({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group/fold w-full sm:w-auto [&[open]]:w-full">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-ink-faint hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="small-caps !text-[10px]">{label}</span>
        <span aria-hidden="true" className="text-[11px] transition-transform group-open/fold:rotate-90">
          ›
        </span>
      </summary>
      <ol className="mt-3 border-t border-line">{children}</ol>
    </details>
  );
}
