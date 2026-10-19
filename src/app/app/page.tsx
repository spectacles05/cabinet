import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { DeleteButton } from "@/components/delete-button";
import { getPolicies, type PolicyWithDetails } from "@/lib/policies";
import { isActiveFinding, listInsights, type InsightRow } from "@/lib/audit/service";
import { attentionCount } from "@/lib/audit/attention";
import type { ClaimRow } from "@/lib/claims/types";
import { daysUntil, formatDateLong } from "@/lib/format";
import { Greeting } from "@/components/cabinet/greeting";
import { EmptyWalletCard, type WalletCardData } from "@/components/cabinet/policy-card";
import { Wallet } from "@/components/cabinet/wallet";
import { AskBar } from "@/components/cabinet/ask-bar";
import { AddedToast } from "@/components/cabinet/added-toast";
import { Icon } from "@/components/cabinet/illustrations";
import { themeFor } from "@/components/cabinet/theme";

export const metadata = { title: "Home — Cabinet" };

/** The one date on a card: when the cover expires (no countdown). */
function dateOf(p: PolicyWithDetails): WalletCardData["date"] {
  const date = p.end_date ?? p.renewal_date;
  return { label: "Expiry date", value: date ? (formatDateLong(date) ?? "—") : "Rolling" };
}

export default async function Home({ searchParams }: PageProps<"/app">) {
  const { added } = await searchParams;
  const { supabase, user } = await getUser();
  const firstName = typeof user?.user_metadata?.first_name === "string" ? (user.user_metadata.first_name as string) : null;

  const [policiesResult, docsResult, insights, auditRuns, openClaims] = await Promise.all([
    getPolicies(supabase).then(
      (p) => ({ data: p, error: false }),
      () => ({ data: [] as PolicyWithDetails[], error: true }),
    ),
    supabase.from("documents").select("id, file_name, processing_status, error_message, policy_id").order("created_at", { ascending: false }),
    listInsights(supabase).catch(() => [] as InsightRow[]),
    supabase.from("agent_runs").select("id", { count: "exact", head: true }).eq("workflow", "audit"),
    supabase.from("claims").select("id, title, status, assessment_json, checklist_json"),
  ]);
  const claims = (openClaims.data ?? []) as Pick<ClaimRow, "id" | "title" | "status" | "assessment_json" | "checklist_json">[];
  const claimsInProgress = claims.filter((c) => c.status === "preparing").length;
  const policies = policiesResult.data;
  const documents = docsResult.data ?? [];
  const fileById = new Map(documents.map((d) => [d.id, d.file_name as string]));

  const openChecks = insights.filter(isActiveFinding);
  // One number for "things to check", the same one Your cover shows (findings and quick questions).
  const toCheckCount = attentionCount(insights);
  const toConfirm = documents.filter((d) => !d.policy_id && (d.processing_status === "extracted" || d.processing_status === "parsed"));
  const otherUploads = documents.filter((d) => !d.policy_id && !toConfirm.includes(d));
  const reviewed = (auditRuns.count ?? 0) > 0;

  // Most urgent first: soonest renewal/expiry, rolling cover last.
  const urgency = (p: PolicyWithDetails) => {
    const d = p.renewal_date ?? p.end_date;
    return d ? daysUntil(d) : Number.POSITIVE_INFINITY;
  };
  const addedHref = typeof added === "string" && policies.some((p) => p.id === added) ? `/app/policies/${added}` : null;

  const cards: WalletCardData[] = [...policies].sort((a, b) => urgency(a) - urgency(b)).map((p) => {
    const file = p.documentId ? fileById.get(p.documentId) : undefined;
    return {
      href: `/app/policies/${p.id}`,
      type: p.policy_type,
      name: p.reviewed?.extras?.nickname || (p.display_name ?? p.insurer ?? `${themeFor(p.policy_type).label} policy`).split(/\s[—–-]\s/)[0],
      date: dateOf(p),
      toCheck: openChecks.filter((i) => i.policy_ids.includes(p.id)).length,
      stamp: file?.startsWith("FICTIONAL-SAMPLE") || /\(fictional\)/i.test(p.insurer ?? "") ? "Sample" : undefined,
    };
  });

  return (
    <div className="mx-auto max-w-md space-y-6 pb-8 lg:max-w-none">
      <div className="cab-rise">
        <Greeting name={firstName} />
      </div>

      {(policiesResult.error || docsResult.error) && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          Something didn&apos;t load. Please refresh.
        </p>
      )}

      {policies.length ? (
        <Wallet cards={cards} focus={addedHref} />
      ) : (
        <div>
          <EmptyWalletCard />
          <p className="mt-4 text-center text-sm">
            <Link href="/app/upload#samples" className="font-medium text-ink-soft underline underline-offset-4 hover:text-ink">
              or try a sample
            </Link>
          </p>
        </div>
      )}

      {/* One quiet line: anything to look at. */}
      {(policies.length > 0 || toConfirm.length > 0) && (
        <div className="cab-rise flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm" style={{ animationDelay: "120ms" }}>
          {toConfirm.length > 0 && (
            <Link href={`/app/documents/${toConfirm[0].id}/review`} className="inline-flex items-center gap-1.5 font-medium text-brass">
              <span className="h-1.5 w-1.5 rounded-full bg-brass" />
              {toConfirm.length} to add
            </Link>
          )}
          {policies.length > 0 &&
            (toCheckCount > 0 ? (
              <Link href="/app/review" className="inline-flex items-center gap-1.5 font-medium text-warn">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                {toCheckCount} to check
              </Link>
            ) : !reviewed ? (
              <Link href="/app/review" className="inline-flex items-center gap-1.5 font-medium text-ink">
                <Icon.Shield className="h-4 w-4" /> Check my cover
              </Link>
            ) : (
              <Link href="/app/review" className="inline-flex items-center gap-1.5 font-medium text-ok">
                <Icon.Check className="h-4 w-4" /> All sorted
              </Link>
            ))}
          {policies.length > 0 && (
            <Link href={claimsInProgress ? "/app/claims" : "/app/claims/new"} className="inline-flex items-center gap-1.5 font-medium text-ink-soft hover:text-ink">
              <Icon.Doc className="h-4 w-4" />
              {claimsInProgress ? `${claimsInProgress} ${claimsInProgress === 1 ? "claim file" : "claim files"}` : "Prepare a claim"}
            </Link>
          )}
        </div>
      )}

      {policies.length > 0 && <AskBar className="cab-rise" style={{ animationDelay: "160ms" }} />}

      {addedHref && <AddedToast />}

      {otherUploads.length > 0 && (
        <details className="rounded-3xl bg-surface/70 p-4 text-sm">
          <summary className="cursor-pointer font-medium text-ink-soft">Other uploads ({otherUploads.length})</summary>
          <ul className="mt-3 divide-y divide-line">
            {otherUploads.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                <Icon.Doc className="h-5 w-5 text-ink-faint" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.file_name}</p>
                  <p className="text-xs text-ink-soft">{d.processing_status === "failed" ? (d.error_message ?? "Couldn't be read") : "Processing"}</p>
                </div>
                {d.processing_status !== "processing" && d.processing_status !== "extracting" && (
                  <DeleteButton url={`/api/documents/${d.id}`} label="Delete" warning="This permanently deletes the uploaded PDF and any text read from it." />
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
