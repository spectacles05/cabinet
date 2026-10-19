import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { getClaim } from "@/lib/claims/service";
import { listEvidence } from "@/lib/claims/evidence";
import { INCIDENT_LABEL, type ClaimRow } from "@/lib/claims/types";
import { getPolicies, shortPolicyName, type PolicyWithDetails } from "@/lib/policies";
import { getLatestThread } from "@/lib/qa/service";
import { preparedPrompts } from "@/lib/demo/answers";
import { getAppMode } from "@/lib/ai/mode";
import { formatDate, insurerShortName } from "@/lib/format";
import { DeleteButton } from "@/components/delete-button";
import { DuckCheer } from "@/components/cabinet/animals";
import { Icon } from "@/components/cabinet/illustrations";
import { FolderHero, FolderTabs } from "@/components/cabinet/folder-hero";
import { SceneTile } from "@/components/cabinet/policy-scenes";
import { Contacts, Deadlines, NextSteps, PolicySays, VerdictLine } from "@/components/claim-summary";
import { AskPanel } from "../../ask/ask-panel";
import { ClaimProgress } from "./claim-progress";
import { ClaimDetails, RecheckCover } from "./claim-details";
import { EvidencePanel } from "./evidence-panel";

export const metadata = { title: "Claim file — Cabinet" };

const STATUS: Record<ClaimRow["status"], string> = { preparing: "Preparing", submitted: "Sent to insurer", closed: "Closed" };

/** A claim file: one folder for an incident, with its next steps, evidence, guidance and questions. */
export default async function ClaimPage({ params, searchParams }: PageProps<"/app/claims/[id]">) {
  const { id } = await params;
  const { saved, tab: tabParam, edit } = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase } = await getUser();
  const claim = await getClaim(supabase, id);
  if (!claim) notFound();
  const [[policy], evidence] = await Promise.all([
    getPolicies(supabase, claim.policy_id).catch(() => [] as PolicyWithDetails[]),
    listEvidence(supabase, claim.id).catch(() => []),
  ]);
  const tab = tabParam === "evidence" || tabParam === "ask" ? tabParam : "file";
  const base = `/app/claims/${claim.id}`;
  const happened = claim.incident_date ? formatDate(claim.incident_date)?.replace(/ \d{4}$/, "") : null;

  return (
    <div className="mx-auto max-w-xl pb-16">
      <div className="flex items-center justify-between">
        <Link href="/app/claims" aria-label="All claim files" className="cab-press -ml-2 grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-paper-deep">
          <Icon.ArrowLeft />
        </Link>
        <Link href={`${base}?edit=1`} aria-label="Edit details" title="Edit details" className="cab-press -mr-2 grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-paper-deep">
          <Icon.Pencil />
        </Link>
      </div>

      <FolderHero
        type={policy?.policy_type ?? "other"}
        tab="Claim file"
        title={claim.title}
        subtitle={[policy ? shortPolicyName(policy) : null, happened, STATUS[claim.status]].filter(Boolean).join(" · ")}
      />

      <FolderTabs
        label="Claim file sections"
        active={tab}
        tabs={[
          { key: "file", label: "File", href: base },
          { key: "evidence", label: evidence.length ? `Evidence · ${evidence.length}` : "Evidence", href: `${base}?tab=evidence` },
          { key: "ask", label: "Ask", href: `${base}?tab=ask` },
        ]}
      />

      <div className="mt-5">
        {tab === "file" && <FileTab claim={claim} policy={policy} evidenceCount={evidence.length} saved={saved === "1"} editing={edit === "1"} />}
        {tab === "evidence" && <EvidencePanel claimId={claim.id} items={evidence} />}
        {tab === "ask" && <AskTab claim={claim} policy={policy} />}
      </div>
    </div>
  );
}

async function FileTab({
  claim,
  policy,
  evidenceCount,
  saved,
  editing,
}: {
  claim: ClaimRow;
  policy: PolicyWithDetails | undefined;
  evidenceCount: number;
  saved: boolean;
  editing: boolean;
}) {
  const a = claim.assessment_json;
  const { supabase } = await getUser();
  const { data: docs } = policy ? await supabase.from("documents").select("id, file_name").eq("policy_id", policy.id).order("created_at") : { data: [] };
  const insurer = insurerShortName(policy?.insurer) ?? "your insurer";

  return (
    <div className="space-y-5">
      {saved && (
        <div className="cab-rise flex items-center gap-3 rounded-[22px] bg-ok-soft/70 p-4">
          <DuckCheer className="h-12 w-auto shrink-0" />
          <p className="text-[14px] text-ink">
            Saved. Add receipts, photos or reports to{" "}
            <Link href={`/app/claims/${claim.id}?tab=evidence`} className="font-semibold underline underline-offset-4">
              Evidence
            </Link>{" "}
            whenever you&apos;re ready.
          </p>
        </div>
      )}

      <Deadlines deadlines={a.deadlines} />

      <ClaimProgress key={claim.updated_at} claimId={claim.id} status={claim.status} checklist={claim.checklist_json} insurer={insurer} />

      {/* The guidance, folded to one line; the wording and pages are a tap away. */}
      <details className="group/cover rounded-[22px] bg-surface p-5 shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
        <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <VerdictLine assessment={a} />
          </span>
          <Icon.Chevron className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-open/cover:rotate-90" />
        </summary>
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          <PolicySays facts={a.facts} />
          <NextSteps steps={a.next_steps} />
          <Contacts contacts={a.contacts} />
        </div>
      </details>
      {a.stale && <RecheckCover claimId={claim.id} />}

      <ClaimDetails
        key={`${claim.updated_at}-${editing}`}
        claimId={claim.id}
        title={claim.title}
        description={claim.description}
        incidentType={claim.incident_type}
        answers={claim.answers_json}
        startEditing={editing}
      />

      {/* The policy this claim is under, and its documents. */}
      {policy && (
        <section aria-label="Policy" className="px-1">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Policy</p>
          <Link href={`/app/policies/${policy.id}`} className="mt-2 flex items-center gap-3 rounded-[18px] bg-surface px-4 py-3 shadow-[0_1px_2px_rgba(21,23,28,0.05)] hover:shadow-md">
            <SceneTile type={policy.policy_type} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-ink">{shortPolicyName(policy)}</span>
              <span className="block text-xs text-ink-faint">{INCIDENT_LABEL[claim.incident_type]} claim</span>
            </span>
            <Icon.Chevron className="h-4 w-4 shrink-0 text-ink-faint" />
          </Link>
          {(docs ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1">
              {(docs ?? []).map((d) => (
                <a key={d.id} href={`/api/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-ink-soft hover:text-ink">
                  {(d.file_name as string).replace(/^FICTIONAL-SAMPLE-/, "Sample ")} ↗
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {evidenceCount === 0 && !saved && (
        <Link href={`/app/claims/${claim.id}?tab=evidence`} className="flex items-center gap-2 px-1 text-[14px] font-medium text-ink-soft hover:text-ink">
          <Icon.Plus className="h-4 w-4" /> Add evidence
        </Link>
      )}

      <div className="px-1 pt-4">
        <DeleteButton
          url={`/api/claims/${claim.id}`}
          label="Delete this claim file"
          warning="This deletes the claim file, its checklist and its evidence files from Cabinet. It doesn't affect anything with your insurer."
          redirectTo="/app/claims"
        />
      </div>
    </div>
  );
}

async function AskTab({ claim, policy }: { claim: ClaimRow; policy: PolicyWithDetails | undefined }) {
  const { supabase } = await getUser();
  const { threadId, messages } = await getLatestThread(supabase, claim.policy_id, claim.id);
  const demo = (await getAppMode()) === "demo";
  const suggestions = demo
    ? preparedPrompts([policy?.policy_type ?? ""], 3)
    : ["What will I need to make this claim?", "Could anything stop this claim being paid?", "Is there a deadline I should know about?"];
  return (
    <AskPanel
      embedded
      policies={[]}
      policyId={claim.policy_id}
      claimId={claim.id}
      initialThreadId={threadId}
      initialMessages={messages}
      suggestions={suggestions}
    />
  );
}
