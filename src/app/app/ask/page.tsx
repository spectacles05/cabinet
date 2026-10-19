import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getPolicies } from "@/lib/policies";
import { getLatestThread, toScopePolicy } from "@/lib/qa/service";
import { suggestionsFor } from "@/lib/qa/suggestions";
import { BearReading } from "@/components/cabinet/animals";
import { getAppMode } from "@/lib/ai/mode";
import { AskPanel } from "./ask-panel";

export const metadata = { title: "Ask — Cabinet" };

export default async function AskPage({ searchParams }: PageProps<"/app/ask">) {
  const { policy, q } = await searchParams;
  const { supabase } = await getUser();
  const policies = await getPolicies(supabase).catch(() => []);
  const selected = typeof policy === "string" ? policies.find((p) => p.id === policy) : undefined;
  const policyId = selected?.id ?? null;
  const { threadId, messages } = policies.length ? await getLatestThread(supabase, policyId) : { threadId: null, messages: [] };
  const demo = (await getAppMode()) === "demo";
  const suggestions = suggestionsFor(selected ? [selected.policy_type] : policies.map((p) => p.policy_type), { demo, single: Boolean(selected) });

  return (
    <div className="mx-auto max-w-2xl">
      {policies.length === 0 ? (
        <div className="cab-rise flex min-h-[calc(100dvh-10rem)] flex-col items-center justify-center text-center">
          <BearReading className="h-44 w-auto" />
          <h1 className="font-display mt-6 text-[28px] font-normal tracking-tight text-ink">Nothing to ask about yet</h1>
          <p className="mt-2 text-[15px] text-ink-soft">Add a policy and ask anything about it.</p>
          <Link href="/app/upload" className="cab-press mt-6 rounded-full bg-ink px-7 py-3 text-[15px] font-semibold text-paper">
            Add a policy
          </Link>
        </div>
      ) : (
        <AskPanel
          key={policyId ?? "wallet"}
          policies={policies.map((p) => ({ id: p.id, name: p.reviewed?.extras?.nickname || toScopePolicy(p).name.split(/\s[—–-]\s/)[0] }))}
          policyId={policyId}
          initialThreadId={threadId}
          initialMessages={messages}
          suggestions={suggestions}
          initialQuestion={typeof q === "string" ? q.slice(0, 500) : ""}
        />
      )}
    </div>
  );
}
