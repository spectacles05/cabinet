// Prepared answers for Demo Mode: questions about the fictional samples, written from the exact
// wording of the sample PDFs in Cabinet's reply style (conclusion first, a short why, only what
// could change the outcome, at most one next step). At answer time every quote is looked up in the
// user's own document text and verified exactly like a live answer, so an answer can't cite
// something that isn't there.
import type { Assessment } from "@/lib/qa/types";
import type { DemoSampleId } from "./samples";

export type PreparedAnswer = {
  id: string;
  sample: DemoSampleId;
  /** Shown as a suggestion; asking it exactly always matches. */
  prompt: string;
  /** The question matches if every word of any one group appears (words of 4+ letters also match as a prefix). */
  match: string[][];
  assessment: Assessment;
  headline: string;
  answer: string;
  conditions: string[];
  next_step: string | null;
  further_checks: string[];
  citations: { page: number; quote: string }[];
};

// Order matters: more specific questions come first.
export const PREPARED_ANSWERS: PreparedAnswer[] = [
  // ── Travel (Harbourlight) ──
  {
    id: "travel-off-piste",
    sample: "travel",
    prompt: "Am I covered if I ski off-piste without a guide?",
    match: [["off piste"], ["offpiste"], ["ski"], ["skiing"], ["snowboard"], ["winter sport"]],
    assessment: "excluded",
    headline: "No, off-piste skiing isn't covered.",
    answer:
      "You didn't buy Harbourlight's Winter Sports Endorsement, so any claim from skiing is excluded. Even with it, off-piste is only covered with a qualified guide.",
    conditions: ["This applies to every part of the policy, including medical bills."],
    next_step: "Ask Harbourlight about adding the Winter Sports Endorsement before you go.",
    further_checks: ["Heli-skiing, ski-touring, ski racing and ski jumping are never covered.", "Each trip can last up to 31 days."],
    citations: [
      { page: 1, quote: "Winter Sports Endorsement NOT PURCHASED" },
      {
        page: 4,
        quote:
          "4.7 Winter sports. We will not pay any claim under any section arising from you taking part in winter sports, including skiing and snowboarding on-piste or off-piste, unless the Winter Sports Endorsement is shown as PURCHASED in your policy schedule.",
      },
      { page: 5, quote: "Off-piste skiing or snowboarding without a qualified guide or instructor is not covered under any circumstances." },
      { page: 5, quote: "7.4 We will not pay for ski racing, ski jumping, heli-skiing or ski-touring in any circumstances." },
      { page: 1, quote: "Maximum trip duration 31 days per trip" },
    ],
  },
  {
    id: "travel-medical-excess",
    sample: "travel",
    prompt: "What excess do I pay on a medical claim?",
    match: [["excess", "medical"], ["excess", "hospital"], ["excess", "travel"]],
    assessment: "information",
    headline: "£75 per person, per incident.",
    answer: "That's the part of a Harbourlight medical claim you pay yourself. If one incident leads to claims under more than one section, it may apply to each.",
    conditions: [],
    next_step: null,
    further_checks: [
      "Emergency medical bills are covered up to £10,000,000 per person, per trip.",
      "Call the emergency assistance line before any hospital admission or repatriation.",
    ],
    citations: [
      { page: 1, quote: "Policy excess GBP 75 per insured person, per incident, for each section" },
      { page: 2, quote: "The policy excess applies to sections marked with an asterisk (*)." },
      { page: 2, quote: "Section 1 Emergency medical expenses * up to GBP 10,000,000" },
      { page: 3, quote: "You must contact our emergency assistance line before any in-patient admission or repatriation is arranged." },
    ],
  },
  {
    id: "travel-baggage-item",
    sample: "travel",
    prompt: "What's the most I can claim for one item in my luggage?",
    match: [["item", "luggage"], ["item", "baggage"], ["single", "item"], ["article"]],
    assessment: "information",
    headline: "£300 for any single item.",
    answer: "That's Harbourlight's limit for one item, pair or set, before the £75 excess. Valuables share a lower £250 limit in total.",
    conditions: [],
    next_step: null,
    further_checks: [
      "£1,500 is the most you can claim for all your baggage, per person, per trip.",
      "Wear and tear isn't covered, so older items may pay out less.",
    ],
    citations: [
      { page: 2, quote: "Single article, pair or set limit GBP 300" },
      { page: 2, quote: "Valuables limit (total) GBP 250" },
      { page: 1, quote: "Policy excess GBP 75 per insured person, per incident, for each section" },
      { page: 2, quote: "Section 3 Personal baggage * up to GBP 1,500" },
      { page: 4, quote: "4.6 Wear and tear, gradual deterioration or loss of value of any item." },
    ],
  },
  {
    id: "travel-claim-medical",
    sample: "travel",
    prompt: "What should I do if I need hospital treatment abroad?",
    match: [["hospital"], ["medical", "abroad"], ["treatment", "abroad"], ["ill", "abroad"], ["injured"], ["repatriat"]],
    assessment: "information",
    headline: "Call Harbourlight's emergency line before you're admitted.",
    answer: "Emergency medical bills are covered up to £10,000,000 per person, per trip, after the £75 excess.",
    conditions: [
      "Treatment that can wait until you're home isn't covered.",
      "Pre-existing conditions are only covered if Harbourlight accepted them in writing.",
      "Winter sports injuries aren't covered: you didn't buy that add-on.",
    ],
    next_step: "The emergency number isn't in this sample, so find it in your policy pack before you travel.",
    further_checks: [],
    citations: [
      { page: 3, quote: "You must contact our emergency assistance line before any in-patient admission or repatriation is arranged." },
      { page: 2, quote: "Section 1 Emergency medical expenses * up to GBP 10,000,000" },
      { page: 1, quote: "Policy excess GBP 75 per insured person, per incident, for each section" },
      { page: 3, quote: "We will not pay for treatment that can reasonably wait until you return home" },
      { page: 3, quote: "any claim arising from a pre-existing medical condition that has not been declared to and accepted by us in writing" },
      { page: 4, quote: "4.7 Winter sports. We will not pay any claim under any section arising from you taking part in winter sports" },
    ],
  },

  // ── Home contents (Kestrel) ──
  {
    id: "contents-laptop-cafe",
    sample: "contents",
    prompt: "Is my laptop covered if it's stolen from a café?",
    match: [["laptop", "cafe"], ["laptop", "coffee"], ["laptop", "public"], ["laptop", "away"], ["away from home"]],
    assessment: "insufficient_evidence",
    headline: "I can't confirm this from your policy.",
    answer: "Away from home, Kestrel only covers items listed in Endorsement Schedule PP1, a separate document you haven't added.",
    conditions: ["Even if it's listed, things left unattended in public aren't covered.", "Any theft must be reported to the police within 24 hours."],
    next_step: "Add Endorsement Schedule PP1 to see if your laptop is listed.",
    further_checks: ["A £100 excess applies to each claim.", "If another policy also covers the laptop, Kestrel only pays its share."],
    citations: [
      {
        page: 3,
        quote: "B1 Loss or damage to contents while they are away from your home, unless Personal Possessions cover applies under Endorsement Schedule PP1.",
      },
      {
        page: 1,
        quote:
          "Endorsement Schedule PP1 is issued as a separate document. Personal Possessions cover only applies to items listed in, and up to the limits shown in, Endorsement Schedule PP1.",
      },
      { page: 4, quote: "C2 Items left unattended in a public place are not covered." },
      { page: 5, quote: "D1 You must report any theft to the police within 24 hours and obtain a crime reference number." },
      { page: 1, quote: "Standard excess GBP 100 per claim" },
      { page: 5, quote: "If any loss or damage is also covered by another insurance policy, we will only pay our proportionate share of the claim." },
    ],
  },
  {
    id: "contents-laptop-home",
    sample: "contents",
    prompt: "Is my laptop covered if I accidentally drop it at home?",
    match: [["laptop", "drop"], ["laptop", "accident"], ["laptop", "damage"], ["laptop", "break"], ["laptop", "broke"], ["laptop", "smash"]],
    assessment: "covered",
    headline: "Yes, you're covered.",
    answer: "Your Kestrel policy includes accidental damage at home, and it names laptops. You can claim up to £1,500, minus a £100 excess.",
    conditions: ["Breakdown and wear and tear aren't covered, so the cause matters."],
    next_step: null,
    further_checks: [
      "No cover if your home has been empty for more than 60 days in a row.",
      "If another policy also covers the laptop, Kestrel only pays its share.",
    ],
    citations: [
      { page: 1, quote: "Accidental damage (home) INCLUDED" },
      {
        page: 2,
        quote:
          "Where shown as INCLUDED in your schedule, we will also cover accidental damage to your contents while inside your home, including laptops, tablets, televisions and games consoles.",
      },
      {
        page: 2,
        quote: "Laptops and computers in your home are covered up to the single article limit of GBP 1,500 for each item, after deduction of the standard excess.",
      },
      { page: 1, quote: "Standard excess GBP 100 per claim" },
      { page: 3, quote: "Mechanical or electrical breakdown, wear and tear, or damage caused by insects, vermin or pets." },
      { page: 3, quote: "Loss or damage while your home is left unoccupied for more than 60 consecutive days." },
    ],
  },
  {
    id: "contents-bike",
    sample: "contents",
    prompt: "Is my bike covered if it's stolen?",
    match: [["bike"], ["bicycle"], ["cycle"]],
    assessment: "insufficient_evidence",
    headline: "I can't confirm this from your policy.",
    answer: "Kestrel excludes bikes unless they're listed in Endorsement Schedule PP1, a separate document you haven't added.",
    conditions: ["Any theft must be reported to the police within 24 hours."],
    next_step: "Add Endorsement Schedule PP1 to see if your bike is listed.",
    further_checks: ["If it isn't listed, ask Kestrel whether it can be added."],
    citations: [
      { page: 3, quote: "B5 Bicycles, unless specified in Endorsement Schedule PP1." },
      { page: 1, quote: "Endorsement Schedule PP1 is issued as a separate document." },
      { page: 5, quote: "D1 You must report any theft to the police within 24 hours and obtain a crime reference number." },
    ],
  },
  {
    id: "contents-claim-theft",
    sample: "contents",
    prompt: "What do I do if something is stolen from my flat?",
    match: [["stolen", "flat"], ["stolen", "home"], ["theft", "home"], ["theft", "flat"], ["burgl"], ["break in"], ["broken into"]],
    assessment: "conditional",
    headline: "You're covered, but only if someone broke in.",
    answer: "Kestrel covers theft from your flat when there's evidence of forced entry. Each item is covered up to £1,500, after a £100 excess.",
    conditions: ["Not covered if the flat had been empty for more than 60 days in a row."],
    next_step: "Report it to the police within 24 hours and keep the crime reference number.",
    further_checks: [
      "Theft from shared parts of the building also needs signs of forced entry.",
      "If another policy also covers the loss, Kestrel only pays its share.",
    ],
    citations: [
      { page: 2, quote: "A4 Theft from your home is only covered if there is evidence of forcible and violent entry to, or exit from, your home." },
      { page: 5, quote: "D1 You must report any theft to the police within 24 hours and obtain a crime reference number." },
      { page: 1, quote: "Single article limit GBP 1,500" },
      { page: 1, quote: "Standard excess GBP 100 per claim" },
      { page: 3, quote: "B4 Loss or damage while your home is left unoccupied for more than 60 consecutive days." },
      {
        page: 3,
        quote: "B3 Theft or attempted theft from any part of your home shared with other people, unless there is evidence of forcible and violent entry.",
      },
    ],
  },

  // ── Gadget (Orbit) ──
  {
    id: "gadget-laptop-excess",
    sample: "gadget",
    prompt: "What excess do I pay for my laptop?",
    match: [["excess", "laptop"]],
    assessment: "information",
    headline: "£50 per claim for your laptop.",
    answer: "Orbit then repairs or replaces it, up to £2,000.",
    conditions: [],
    next_step: null,
    further_checks: [
      "Scratches and dents that don't affect how it works aren't covered.",
      "If your contents policy also covers the laptop, tell Orbit: they only pay their share.",
    ],
    citations: [
      { page: 1, quote: "Excess GBP 50 per claim for laptops" },
      { page: 1, quote: "Maximum per gadget GBP 2,000" },
      { page: 3, quote: "2.3 Cosmetic damage such as scratches or dents that do not affect how the gadget works." },
      { page: 4, quote: "3.1 Other insurance. If you have other insurance that covers the same gadget, for example home contents insurance, you must tell us." },
    ],
  },
  {
    id: "gadget-lost-phone",
    sample: "gadget",
    prompt: "Am I covered if I lose my phone?",
    match: [["lose", "phone"], ["lost", "phone"], ["losing", "phone"], ["misplace"], ["lose", "gadget"], ["lost", "gadget"]],
    assessment: "excluded",
    headline: "No, losing your phone isn't covered.",
    answer: "Orbit only covers theft, not losing or misplacing it.",
    conditions: [
      "If it was stolen, report it to the police within 48 hours.",
      "Theft isn't covered if it was left unattended in a public place.",
    ],
    next_step: null,
    further_checks: [
      "Phone claims have a £75 excess, up to £2,000 per gadget.",
      "Cover ends if your Meridian Current Account Plus is closed or downgraded.",
    ],
    citations: [
      { page: 3, quote: "2.1 Loss of a gadget. Only theft is covered; losing or misplacing a gadget is not covered." },
      { page: 2, quote: "1.1 Theft of a registered gadget, anywhere in the world, including from your home." },
      { page: 3, quote: "2.5 Any claim where the theft was not reported to the police within 48 hours." },
      { page: 3, quote: "2.4 Theft where the gadget was left unattended in a public place." },
      { page: 1, quote: "GBP 75 per claim for smartphones" },
      { page: 4, quote: "3.2 Cover ends automatically when your Meridian Current Account Plus is closed or downgraded." },
    ],
  },
  {
    id: "gadget-phone-car",
    sample: "gadget",
    prompt: "Is my phone covered if it's stolen from my car?",
    match: [["phone", "car"], ["gadget", "car"], ["vehicle"]],
    assessment: "conditional",
    headline: "Only if it was locked away out of sight.",
    answer: "Orbit covers theft from a car only if the phone was in a locked boot or glove compartment and there's evidence of forced entry.",
    conditions: ["Report the theft to the police within 48 hours."],
    next_step: null,
    further_checks: [
      "Phone claims have a £75 excess.",
      "If your contents policy also covers the phone, tell Orbit: they only pay their share.",
    ],
    citations: [
      {
        page: 3,
        quote: "2.2 Theft from an unattended vehicle unless the gadget was hidden in a locked boot or glove compartment and there is evidence of forced entry.",
      },
      { page: 3, quote: "2.5 Any claim where the theft was not reported to the police within 48 hours." },
      { page: 1, quote: "GBP 75 per claim for smartphones" },
      { page: 4, quote: "3.1 Other insurance. If you have other insurance that covers the same gadget, for example home contents insurance, you must tell us." },
    ],
  },
  {
    id: "gadget-claim-theft",
    sample: "gadget",
    prompt: "My phone was stolen. What do I need to do?",
    match: [["phone", "stolen"], ["phone", "theft"], ["gadget", "stolen"], ["claim", "phone"]],
    assessment: "conditional",
    headline: "You're covered if you report it to the police within 48 hours.",
    answer: "Orbit covers theft of your registered phone anywhere in the world, up to £2,000 after a £75 excess. Claims reported later aren't paid.",
    conditions: ["Not covered if it was left unattended in public, or in a car unless locked away with signs of a break-in."],
    next_step: "Get a police reference number, then start your claim with Orbit.",
    further_checks: ["Register your replacement phone with Orbit within 30 days so it's covered."],
    citations: [
      { page: 2, quote: "1.1 Theft of a registered gadget, anywhere in the world, including from your home." },
      { page: 3, quote: "2.5 Any claim where the theft was not reported to the police within 48 hours." },
      {
        page: 2,
        quote: "1.4 We will repair or replace your gadget, up to the maximum per gadget shown in your schedule, after deduction of the excess.",
      },
      { page: 1, quote: "GBP 75 per claim for smartphones" },
      { page: 3, quote: "2.4 Theft where the gadget was left unattended in a public place." },
      {
        page: 3,
        quote: "2.2 Theft from an unattended vehicle unless the gadget was hidden in a locked boot or glove compartment and there is evidence of forced entry.",
      },
      { page: 4, quote: "3.3 You must register any replacement gadget with us within 30 days for it to be covered." },
    ],
  },
];

/** Prepared questions to suggest for the given kinds of policy (travel, contents, gadget). */
export function preparedPrompts(types: string[], perType = 4): string[] {
  const wanted = types.filter((t, i) => types.indexOf(t) === i);
  return wanted.flatMap((t) => PREPARED_ANSWERS.filter((p) => p.sample === t).slice(0, perType).map((p) => p.prompt));
}
