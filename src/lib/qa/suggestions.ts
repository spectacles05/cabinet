import { preparedPrompts } from "@/lib/demo/answers";

// Starter questions shown before the first question. In Demo Mode they're exactly the prepared ones.
const LIVE: Record<string, string[]> = {
  travel: ["Am I covered if I ski off-piste without a guide?", "What excess do I pay on a medical claim?", "What's the most I can claim for one item in my luggage?"],
  contents: ["Is my laptop covered if I accidentally drop it at home?", "Is my laptop covered if it's stolen from a café?", "Is my bike covered if it's stolen?"],
  gadget: ["Am I covered if I lose my phone?", "Is my phone covered if it's stolen from my car?", "What excess do I pay for my laptop?"],
  wallet: ["Am I covered if I lose my phone?", "What is the no-claims discount on my car insurance?", "Am I covered for scuba diving?"],
};

/** Suggestions for one policy type, or for the whole wallet (pass every type in it). */
export function suggestionsFor(types: string[], { demo, single }: { demo: boolean; single: boolean }): string[] {
  if (demo) return preparedPrompts(types, single ? 4 : 2);
  return (single ? LIVE[types[0]] : undefined) ?? LIVE.wallet;
}
