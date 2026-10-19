import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getPolicies } from "@/lib/policies";
import { isActiveFinding, listInsights, type InsightRow } from "@/lib/audit/service";
import { getLatestThread } from "@/lib/qa/service";
import { suggestionsFor } from "@/lib/qa/suggestions";
import { getAppMode } from "@/lib/ai/mode";
import { STORAGE_BUCKET } from "@/lib/env";
import { formatDate, formatDateLong, formatMoney, POLICY_TYPE_LABEL } from "@/lib/format";
import { DeleteButton } from "@/components/delete-button";
import { Icon } from "@/components/cabinet/illustrations";
import { themeFor } from "@/components/cabinet/theme";
import { FolderHero, FolderTabs } from "@/components/cabinet/folder-hero";
import { AskPanel } from "../../ask/ask-panel";
import { AttachDocument } from "./attach-document";

export const metadata = { title: "Policy — Cabinet" };

const TABS = [
  { key: "details", label: "Details" },
  { key: "ask", label: "Ask" },
  { key: "documents", label: "Documents" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const FREQUENCY: Record<string, string> = {
  annual: "Yearly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  one_off: "One-off",
  included: "Included with another product",
  unknown: "Unknown",
};

const LIMITS_SHOWN = 3;

/** A policy: the essentials at a glance, a chat about it, and its documents, each a tab. */
export default async function PolicyPage({ params, searchParams }: PageProps<"/app/policies/[id]">) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: Tab = tabParam === "ask" || tabParam === "documents" ? tabParam : "details";
  const { supabase } = await getUser();
  const [policies, insights] = await Promise.all([getPolicies(supabase, id).catch(() => []), listInsights(supabase).catch(() => [] as InsightRow[])]);
  const policy = policies[0];
  if (!policy) notFound();
  const theme = themeFor(policy.policy_type);
  const docId = policy.documentId;
  const notes = insights.filter((i) => isActiveFinding(i) && i.policy_ids.includes(policy.id));
  const toCheck = notes.length;
  // Straight to this folder's first note on Your cover, opened.
  const notesHref = notes[0] ? `/app/review?note=${notes[0].id}` : "/app/review";

  return (
    <div className="mx-auto max-w-xl pb-12">
      <div className="flex items-center justify-between">
        <Link href="/app" aria-label="Back to wallet" className="cab-press -ml-2 grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-paper-deep">
          <Icon.ArrowLeft />
        </Link>
        {docId && (
          <Link
            href={`/app/documents/${docId}/review`}
            aria-label="Edit details"
            title="Edit details"
            className="cab-press -mr-2 grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-paper-deep"
          >
            <Icon.Pencil />
          </Link>
        )}
      </div>

      {/* the policy, as its folder */}
      <FolderHero
        type={policy.policy_type}
        tab={theme.label}
        title={policy.display_name ?? policy.insurer ?? `${theme.label} policy`}
        subtitle={policy.insurer && policy.display_name ? policy.insurer : undefined}
      />

      <FolderTabs
        label="Policy sections"
        active={tab}
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: t.key === "details" ? `/app/policies/${policy.id}` : `/app/policies/${policy.id}?tab=${t.key}` }))}
      />

      <div className="mt-5">
        {tab === "details" && <Details policy={policy} toCheck={toCheck} notesHref={notesHref} />}
        {tab === "ask" && <AskTab policy={policy} />}
        {tab === "documents" && <DocumentsTab policyId={policy.id} />}
      </div>
    </div>
  );
}

type Policy = Awaited<ReturnType<typeof getPolicies>>[number];

function Details({ policy, toCheck, notesHref }: { policy: Policy; toCheck: number; notesHref: string }) {
  const f = policy.reviewed?.fields;
  const x = policy.reviewed?.extras;
  const edited = (k: keyof NonNullable<typeof f>) => Boolean(f?.[k]?.edited);
  const date = policy.end_date ?? policy.renewal_date;
  const rows: { label: string; value: string | null; star?: boolean; href?: string }[] = [
    { label: "Emergency #", value: x?.emergency_phone ?? null, star: Boolean(x?.emergency_phone), href: x?.emergency_phone ? `tel:${x.emergency_phone.replace(/[^+\d]/g, "")}` : undefined },
    { label: "Category", value: `${POLICY_TYPE_LABEL[policy.policy_type] ?? "Other"} insurance` },
    { label: "Policy number", value: policy.policy_number_masked, star: edited("policy_number") },
    {
      label: policy.end_date ? "Expiry date" : "Renewal date",
      value: date ? formatDateLong(date) : "Rolling",
      star: edited(policy.end_date ? "end_date" : "renewal_date"),
    },
    { label: "Premium", value: formatMoney(policy.premium_amount, policy.currency), star: edited("premium_amount") },
    { label: "Premium frequency", value: policy.premium_frequency ? (FREQUENCY[policy.premium_frequency] ?? null) : null, star: edited("premium_frequency") },
    { label: "Excess", value: formatMoney(policy.excess_amount, policy.currency), star: edited("excess_amount") },
    { label: "% Excess", value: x?.excess_percent != null ? `${x.excess_percent}%` : null, star: x?.excess_percent != null },
    { label: "Alternate name", value: x?.nickname ?? null, star: Boolean(x?.nickname) },
  ];
  const anyStar = rows.some((r) => r.star);
  const limits = (policy.reviewed?.limits ?? [])
    .filter((l) => l.amount !== null)
    .map((l) => ({ label: l.label.replace(/^Section \d+\s*/i, ""), value: formatMoney(l.amount, l.currency ?? policy.currency) ?? "" }));

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
        <dl className="divide-y divide-line px-5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-4 py-3.5">
              <dt className="shrink-0 text-[15px] text-ink">{r.label}</dt>
              <dd className={`min-w-0 text-right text-[15px] ${r.value ? "text-ink-soft" : "text-ink-faint"}`}>
                {r.value && r.href ? (
                  <a href={r.href} className="underline-offset-4 hover:underline">
                    {r.value}
                  </a>
                ) : (
                  (r.value ?? "—")
                )}
                {r.star && <span className="ml-0.5 text-brass">*</span>}
              </dd>
            </div>
          ))}
        </dl>
        {anyStar && <p className="border-t border-line px-5 py-3 text-xs text-ink-faint">* Added or changed by you</p>}
      </div>

      {limits.length > 0 && (
        <dl className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface px-5 shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
          {limits.slice(0, LIMITS_SHOWN).map((l, i) => (
            <LimitRow key={i} {...l} />
          ))}
          {limits.length > LIMITS_SHOWN && (
            <details className="group/limits">
              <summary className="flex cursor-pointer list-none items-center justify-between py-3.5 text-sm font-medium text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
                <span className="group-open/limits:hidden">All {limits.length} limits</span>
                <span className="hidden group-open/limits:inline">Fewer</span>
                <Icon.Chevron className="h-4 w-4 rotate-90 transition-transform group-open/limits:-rotate-90" />
              </summary>
              <div className="divide-y divide-line border-t border-line">
                {limits.slice(LIMITS_SHOWN).map((l, i) => (
                  <LimitRow key={i} {...l} />
                ))}
              </div>
            </details>
          )}
        </dl>
      )}

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-1 text-sm font-medium">
        {toCheck > 0 && (
          <Link href={notesHref} className="inline-flex items-center gap-1.5 text-warn">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {toCheck} {toCheck === 1 ? "thing" : "things"} to check
          </Link>
        )}
        <Link href={`/app/claims/new?policy=${policy.id}`} className="inline-flex items-center gap-1.5 text-ink-soft hover:text-ink">
          <Icon.Doc className="h-4 w-4" /> Prepare a claim
        </Link>
      </div>

      <ClaimFiles policyId={policy.id} />

      <div className="flex justify-center pt-6">
        <DeleteButton
          url={`/api/policies/${policy.id}`}
          label="Delete this policy"
          warning="This permanently deletes the policy, its documents, and any chats, findings and reminders about it."
          redirectTo="/app"
        />
      </div>
    </div>
  );
}

/** This policy's claim files, as a short list (nothing at all when there are none). */
async function ClaimFiles({ policyId }: { policyId: string }) {
  const { supabase } = await getUser();
  const { data } = await supabase.from("claims").select("id, title, status, checklist_json").eq("policy_id", policyId).order("created_at", { ascending: false });
  const claims = (data ?? []) as { id: string; title: string; status: string; checklist_json: { done: boolean }[] }[];
  if (!claims.length) return null;
  return (
    <section aria-label="Claim files">
      <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Claim files</p>
      <ul className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
        {claims.map((c) => (
          <li key={c.id}>
            <Link href={`/app/claims/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper/50">
              <Icon.Doc className="h-5 w-5 shrink-0 text-ink-faint" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-ink">{c.title}</span>
                <span className="block text-xs text-ink-faint">
                  {c.status === "preparing" ? `${c.checklist_json.filter((i) => i.done).length} of ${c.checklist_json.length} done` : c.status === "submitted" ? "Sent to insurer" : "Closed"}
                </span>
              </span>
              <Icon.Chevron className="h-4 w-4 shrink-0 text-ink-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3.5">
      <dt className="min-w-0 text-[15px] text-ink">{label}</dt>
      <dd className="shrink-0 text-[15px] text-ink-soft">{value}</dd>
    </div>
  );
}

async function AskTab({ policy }: { policy: Policy }) {
  const { supabase } = await getUser();
  const { threadId, messages } = await getLatestThread(supabase, policy.id);
  const demo = (await getAppMode()) === "demo";
  return (
    <AskPanel
      embedded
      policies={[]}
      policyId={policy.id}
      initialThreadId={threadId}
      initialMessages={messages}
      suggestions={suggestionsFor([policy.policy_type], { demo, single: true })}
    />
  );
}

async function DocumentsTab({ policyId }: { policyId: string }) {
  const { supabase } = await getUser();
  const { data: docs } = await supabase
    .from("documents")
    .select("id, file_name, page_count, storage_path, created_at")
    .eq("policy_id", policyId)
    .order("created_at", { ascending: true });
  const list = docs ?? [];
  // An inline preview of the main document (larger screens; phones open it in their own viewer).
  const preview = list[0]
    ? (await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(list[0].storage_path as string, 600)).data?.signedUrl
    : null;

  return (
    <div className="space-y-4">
      {list.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
          {list.map((d) => (
            <li key={d.id}>
              <a
                href={`/api/documents/${d.id}/file`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-paper/50"
              >
                <Icon.Doc className="h-5 w-5 shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{(d.file_name as string).replace(/^FICTIONAL-SAMPLE-/, "Sample ")}</span>
                  <span className="block text-xs text-ink-faint">
                    {d.page_count ? `${d.page_count} pages · ` : ""}Added {formatDate((d.created_at as string).slice(0, 10))}
                  </span>
                </span>
                <span className="text-sm font-medium text-ink-soft">Open ↗</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <iframe
          src={preview}
          title="Policy document"
          className="hidden h-[70vh] w-full rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(21,23,28,0.05)] md:block"
        />
      )}
      <AttachDocument policyId={policyId} />
    </div>
  );
}
