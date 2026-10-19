import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { listClaims } from "@/lib/claims/service";
import type { ClaimRow } from "@/lib/claims/types";
import { getPolicies, shortPolicyName, type PolicyWithDetails } from "@/lib/policies";
import { formatDate } from "@/lib/format";
import { RabbitInCabinet } from "@/components/cabinet/animals";
import { Boop } from "@/components/cabinet/peeker";
import { SceneTile } from "@/components/cabinet/policy-scenes";
import { Icon } from "@/components/cabinet/illustrations";

export const metadata = { title: "Claim files — Cabinet" };

const STATUS: Record<ClaimRow["status"], string> = { preparing: "Preparing", submitted: "Sent to insurer", closed: "Closed" };

/** Claim files, one line each (with how many documents each holds), and a way to start another. */
export default async function ClaimsPage() {
  const { supabase } = await getUser();
  const [claims, policies, { data: files }] = await Promise.all([
    listClaims(supabase).catch(() => null),
    getPolicies(supabase).catch(() => [] as PolicyWithDetails[]),
    supabase.from("claim_evidence").select("claim_id").eq("status", "ready"),
  ]);
  const fileCount = new Map<string, number>();
  for (const f of files ?? []) fileCount.set(f.claim_id as string, (fileCount.get(f.claim_id as string) ?? 0) + 1);
  const names = new Map(policies.map((p) => [p.id, shortPolicyName(p)]));
  const types = new Map(policies.map((p) => [p.id, p.policy_type]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-12 pt-2">
      <header className="cab-rise flex items-center gap-4">
        <Boop label="Say hello to the rabbit" className="shrink-0" bubbleSide="below" phrases={["I keep everything filed.", "Tap a file to carry on.", "Nothing gets lost in here."]}>
          <RabbitInCabinet className="h-20 w-auto" />
        </Boop>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[28px] font-normal leading-tight tracking-tight text-ink">Claim files</h1>
          <p className="mt-0.5 text-[15px] text-ink-soft">One folder for each incident. Nothing is sent to your insurer.</p>
        </div>
      </header>

      {claims === null && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          Your claims didn&apos;t load. Please refresh.
        </p>
      )}

      {claims && claims.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
          {claims.map((c) => {
            const done = c.checklist_json.filter((i) => i.done).length;
            const due = c.status === "preparing" ? c.assessment_json.deadlines.map((d) => d.due_date).filter((d): d is string => Boolean(d)).sort()[0] : undefined;
            return (
              <li key={c.id}>
                <Link href={`/app/claims/${c.id}`} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-paper/50">
                  <SceneTile type={types.get(c.policy_id) ?? "other"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-ink">{c.title}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink-faint">
                      {[
                        names.get(c.policy_id),
                        c.status === "preparing" ? null : STATUS[c.status],
                        `${done} of ${c.checklist_json.length} done`,
                        fileCount.get(c.id) ? `${fileCount.get(c.id)} ${fileCount.get(c.id) === 1 ? "file" : "files"}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {due && <span className={due < today ? "text-danger" : "text-[#8a6420]"}> · by {formatDate(due)?.replace(/ \d{4}$/, "")}</span>}
                    </span>
                  </span>
                  <Icon.Chevron className="h-4 w-4 shrink-0 text-ink-faint" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex justify-center">
        <Link href="/app/claims/new" className="cab-press inline-flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-paper">
          <Icon.Plus className="h-4 w-4" /> Prepare a claim
        </Link>
      </div>
    </div>
  );
}
