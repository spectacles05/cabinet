import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getPolicies, type PolicyWithDetails } from "@/lib/policies";
import { isActiveFinding, listInsights, type InsightRow } from "@/lib/audit/service";
import { daysUntil, formatDate } from "@/lib/format";
import { DuckCheer } from "@/components/cabinet/animals";
import { Icon } from "@/components/cabinet/illustrations";

export const metadata = { title: "Notifications — Cabinet" };

const SOON_DAYS = 60;

type Item = { key: string; href: string; text: string; detail: string | null; tone: "warn" | "ink" };

/** What needs you: renewals coming up, things to check, tasks due, documents waiting to be added. */
export default async function NotificationsPage() {
  const { supabase } = await getUser();
  const [policies, insights, { data: tasks }, { data: docs }] = await Promise.all([
    getPolicies(supabase).catch(() => [] as PolicyWithDetails[]),
    listInsights(supabase).catch(() => [] as InsightRow[]),
    // Reminders show once they're due ("Remind me in a week" hides a finding until then).
    supabase
      .from("action_items")
      .select("id, title, due_date")
      .is("completed_at", null)
      .lte("due_date", new Date().toISOString().slice(0, 10))
      .order("due_date", { ascending: true }),
    supabase.from("documents").select("id, file_name, processing_status, policy_id").is("policy_id", null).in("processing_status", ["parsed", "extracted"]),
  ]);

  const items: Item[] = [];
  for (const p of policies) {
    const date = p.renewal_date ?? p.end_date;
    if (!date) continue;
    const days = daysUntil(date);
    if (days < 0 || days > SOON_DAYS) continue;
    const name = p.reviewed?.extras?.nickname || (p.display_name ?? p.insurer ?? "Your policy").split(/\s[—–-]\s/)[0];
    const verb = p.renewal_date ? "renews" : "ends";
    items.push({
      key: `p-${p.id}`,
      href: `/app/policies/${p.id}`,
      text: `${name} ${verb} ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`,
      detail: formatDate(date),
      tone: "warn",
    });
  }
  const toCheck = insights.filter(isActiveFinding).length;
  if (toCheck) items.push({ key: "check", href: "/app/review", text: `${toCheck} ${toCheck === 1 ? "thing" : "things"} to check in your cover`, detail: null, tone: "warn" });
  for (const t of tasks ?? []) {
    items.push({ key: `t-${t.id}`, href: "/app/review", text: t.title as string, detail: t.due_date ? `Reminder for ${formatDate(t.due_date)}` : null, tone: "ink" });
  }
  for (const d of docs ?? []) {
    items.push({ key: `d-${d.id}`, href: `/app/documents/${d.id}/review`, text: `${d.file_name} is ready to add`, detail: null, tone: "ink" });
  }

  return (
    <div className="mx-auto max-w-xl pb-12 pt-4">
      <h1 className="font-display text-[30px] font-normal tracking-tight text-ink">Notifications</h1>
      {items.length === 0 ? (
        <div className="cab-rise mt-12 flex flex-col items-center text-center">
          <DuckCheer className="h-36 w-auto" />
          <p className="font-display mt-5 text-[22px] text-ink">You&apos;re all caught up</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
          {items.map((i) => (
            <li key={i.key}>
              <Link href={i.href} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-paper/50">
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${i.tone === "warn" ? "bg-warn" : "bg-ink-faint"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug text-ink">{i.text}</span>
                  {i.detail && <span className="block text-xs text-ink-faint">{i.detail}</span>}
                </span>
                <Icon.Chevron className="h-4 w-4 shrink-0 text-ink-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
