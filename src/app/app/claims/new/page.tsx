import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getPolicies, shortPolicyName, type PolicyWithDetails } from "@/lib/policies";
import { HedgehogReading } from "@/components/cabinet/animals";
import { ClaimFlow } from "./claim-flow";

export const metadata = { title: "Prepare a claim — Cabinet" };

export default async function NewClaimPage({ searchParams }: PageProps<"/app/claims/new">) {
  const { policy, describe } = await searchParams;
  const { supabase } = await getUser();
  const policies = await getPolicies(supabase).catch(() => [] as PolicyWithDetails[]);

  if (!policies.length) {
    return (
      <div className="cab-rise mx-auto flex max-w-xl flex-col items-center pt-10 text-center">
        <HedgehogReading className="h-28 w-auto" />
        <h1 className="font-display mt-4 text-[28px] font-normal tracking-tight text-ink">Add a policy first</h1>
        <p className="mt-1 text-[15px] text-ink-soft">Cabinet prepares a claim from your own policy wording.</p>
        <Link href="/app/upload" className="cab-press mt-6 rounded-full bg-ink px-7 py-3 text-[15px] font-semibold text-paper">
          Add a policy
        </Link>
      </div>
    );
  }
  const initial = typeof policy === "string" && policies.some((p) => p.id === policy) ? policy : null;
  return (
    <div className="mx-auto max-w-xl pb-16 pt-2">
      <ClaimFlow
        policies={policies.map((p) => ({ id: p.id, name: shortPolicyName(p) }))}
        initialPolicyId={initial}
        initialDescription={typeof describe === "string" ? describe.slice(0, 1000) : ""}
      />
    </div>
  );
}
