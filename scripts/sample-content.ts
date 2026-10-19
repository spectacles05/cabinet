// Content for the three FICTIONAL sample policies used in demos and tests.
// All organisations, people, addresses and policy numbers are invented.
// Keep in sync with samples/ground-truth.json (page numbers are asserted in tests).

export type Block =
  | { kind: "h"; text: string }
  | { kind: "p"; text: string }
  | { kind: "kv"; rows: [string, string][] };

export type SampleDoc = {
  file: string;
  title: string;
  reference: string;
  pages: Block[][];
};

const travel: SampleDoc = {
  file: "travel.pdf",
  title: "Harbourlight Travel Insurance (Fictional) — Annual Multi-Trip Policy",
  reference: "HLT-PW-2025-v3",
  pages: [
    [
      { kind: "h", text: "Policy Schedule" },
      { kind: "p", text: "This schedule forms part of your policy. Please read it together with the policy wording that follows. Keep it safe." },
      {
        kind: "kv",
        rows: [
          ["Insurer", "Harbourlight Travel Insurance (Fictional) Ltd"],
          ["Product", "Annual Multi-Trip Travel Insurance — Europe"],
          ["Policy number", "HLT-2025-884213"],
          ["Policyholder", "Alex Sample"],
          ["Insured persons", "Alex Sample (age 21)"],
          ["Period of insurance", "3 November 2025 to 2 November 2026 (both dates inclusive)"],
          ["Renewal date", "3 November 2026"],
          ["Annual premium", "GBP 84.00, paid annually (including Insurance Premium Tax)"],
          ["Policy excess", "GBP 75 per insured person, per incident, for each section claimed under"],
          ["Maximum trip duration", "31 days per trip"],
          ["Winter Sports Endorsement", "NOT PURCHASED"],
          ["Gadget Cover Extension", "NOT PURCHASED"],
        ],
      },
      { kind: "p", text: "Optional endorsements only apply if they are shown above as PURCHASED. If an endorsement is shown as NOT PURCHASED, the related cover does not apply to your trips." },
    ],
    [
      { kind: "h", text: "Summary of Cover — Benefit Limits" },
      { kind: "p", text: "The amounts below are the most we will pay per insured person, per trip, unless stated otherwise. The policy excess applies to sections marked with an asterisk (*)." },
      {
        kind: "kv",
        rows: [
          ["Section 1 Emergency medical expenses *", "up to GBP 10,000,000"],
          ["Section 2 Cancellation and curtailment *", "up to GBP 3,000"],
          ["Section 3 Personal baggage *", "up to GBP 1,500"],
          ["   Single article, pair or set limit", "GBP 300"],
          ["   Valuables limit (total)", "GBP 250"],
          ["Section 4 Personal money *", "up to GBP 300 (cash limit GBP 200)"],
          ["Section 5 Travel delay", "GBP 20 for each full 12 hours, up to GBP 200"],
          ["Section 6 Personal liability", "up to GBP 2,000,000"],
        ],
      },
      { kind: "p", text: "Section 7 (Winter Sports) appears in the Winter Sports Endorsement and only applies if the endorsement is shown as PURCHASED in your policy schedule." },
    ],
    [
      { kind: "h", text: "Definitions and Section 1 — Emergency Medical Expenses" },
      { kind: "p", text: "Trip: a journey outside your home country that starts and ends in your home country during the period of insurance and lasts no longer than the maximum trip duration." },
      { kind: "p", text: "Winter sports: skiing, snowboarding, sledging, snowmobiling and any other activity on snow or ice, whether on-piste or off-piste." },
      { kind: "p", text: "Off-piste: skiing or snowboarding outside the marked and patrolled boundaries of a ski resort." },
      { kind: "p", text: "Section 1. We will pay reasonable and necessary costs for emergency medical treatment, hospital accommodation and repatriation if you become ill or are injured during a trip. You must contact our emergency assistance line before any in-patient admission or repatriation is arranged." },
      { kind: "p", text: "We will not pay for treatment that can reasonably wait until you return home, or for any claim arising from a pre-existing medical condition that has not been declared to and accepted by us in writing." },
    ],
    [
      { kind: "h", text: "General Exclusions" },
      { kind: "p", text: "These exclusions apply to every section of the policy." },
      { kind: "p", text: "4.1 Any claim arising from you being under the influence of alcohol or drugs, unless the drugs were prescribed by a doctor." },
      { kind: "p", text: "4.2 Travel to a country or area that the UK Foreign, Commonwealth and Development Office advises against all travel or all but essential travel to." },
      { kind: "p", text: "4.3 Professional sports, racing of any kind, or any activity undertaken for payment." },
      { kind: "p", text: "4.4 Scuba diving deeper than 18 metres, or any diving without a qualified instructor." },
      { kind: "p", text: "4.5 Riding a motorcycle or moped over 125cc, or riding any motorcycle or moped without a helmet." },
      { kind: "p", text: "4.6 Wear and tear, gradual deterioration or loss of value of any item." },
      { kind: "p", text: "4.7 Winter sports. We will not pay any claim under any section arising from you taking part in winter sports, including skiing and snowboarding on-piste or off-piste, unless the Winter Sports Endorsement is shown as PURCHASED in your policy schedule." },
    ],
    [
      { kind: "h", text: "Winter Sports Endorsement (only applies if PURCHASED)" },
      { kind: "p", text: "This endorsement only applies if it is shown as PURCHASED in your policy schedule. When it applies, General Exclusion 4.7 is removed for the winter sports activities described below." },
      { kind: "p", text: "7.1 We will cover on-piste skiing and snowboarding within the marked and patrolled boundaries of a ski resort." },
      { kind: "p", text: "7.2 Off-piste skiing or snowboarding is only covered when you are accompanied at all times by a qualified mountain guide or ski instructor. Off-piste skiing or snowboarding without a qualified guide or instructor is not covered under any circumstances." },
      { kind: "p", text: "7.3 Ski equipment (owned): up to GBP 500. Ski equipment (hired): up to GBP 300. Ski pack: up to GBP 250. Piste closure: GBP 25 per day up to GBP 250." },
      { kind: "p", text: "7.4 We will not pay for ski racing, ski jumping, heli-skiing or ski-touring in any circumstances." },
    ],
    [
      { kind: "h", text: "Renewal, Cancellation and Complaints" },
      { kind: "p", text: "Renewal. We will write to you at least 21 days before your renewal date with your renewal terms. Your policy will not renew automatically unless you tell us you want to renew." },
      { kind: "p", text: "Cooling-off period. You may cancel within 14 days of receiving your policy documents and receive a full refund, provided you have not travelled or made a claim." },
      { kind: "p", text: "Complaints. If you are unhappy with our service, contact the Harbourlight (Fictional) customer team. This is a fictional document; no real complaints body or contact details are given." },
      { kind: "p", text: "Important: this document is a fictional sample created for software testing. It is not an offer of insurance." },
    ],
  ],
};

const contents: SampleDoc = {
  file: "contents.pdf",
  title: "Kestrel Home Insurance (Fictional) — Student Contents Policy",
  reference: "KHC-PW-2026-v1",
  pages: [
    [
      { kind: "h", text: "Policy Schedule" },
      {
        kind: "kv",
        rows: [
          ["Insurer", "Kestrel Home Insurance (Fictional) plc"],
          ["Product", "Student Contents Insurance"],
          ["Policy number", "KHC-7731-0092"],
          ["Policyholder", "Alex Sample"],
          ["Address insured", "Flat 4, 12 Example Road, Sampletown, ZZ1 1ZZ (fictional)"],
          ["Period of insurance", "15 September 2026 to 14 September 2027"],
          ["Renewal date", "15 September 2027"],
          ["Premium", "GBP 8.50 per month (12 monthly payments)"],
          ["Contents sum insured", "GBP 6,000"],
          ["Single article limit", "GBP 1,500"],
          ["Standard excess", "GBP 100 per claim"],
          ["Accidental damage (home)", "INCLUDED"],
          ["Personal Possessions (away from home)", "See Endorsement Schedule PP1"],
        ],
      },
      { kind: "p", text: "Endorsement Schedule PP1 is issued as a separate document. Personal Possessions cover only applies to items listed in, and up to the limits shown in, Endorsement Schedule PP1." },
    ],
    [
      { kind: "h", text: "Section A — Contents at Home" },
      { kind: "p", text: "A1 We will cover your contents while they are inside your home against loss or damage caused by fire, smoke, explosion, lightning, storm, flood, escape of water, theft or attempted theft, and vandalism." },
      { kind: "p", text: "A2 Accidental damage. Where shown as INCLUDED in your schedule, we will also cover accidental damage to your contents while inside your home, including laptops, tablets, televisions and games consoles." },
      { kind: "p", text: "A3 Laptops and computers in your home are covered up to the single article limit of GBP 1,500 for each item, after deduction of the standard excess." },
      { kind: "p", text: "A4 Theft from your home is only covered if there is evidence of forcible and violent entry to, or exit from, your home." },
    ],
    [
      { kind: "h", text: "Section A — Exclusions" },
      { kind: "p", text: "We will not pay for:" },
      { kind: "p", text: "B1 Loss or damage to contents while they are away from your home, unless Personal Possessions cover applies under Endorsement Schedule PP1." },
      { kind: "p", text: "B2 Mechanical or electrical breakdown, wear and tear, or damage caused by insects, vermin or pets." },
      { kind: "p", text: "B3 Theft or attempted theft from any part of your home shared with other people, unless there is evidence of forcible and violent entry." },
      { kind: "p", text: "B4 Loss or damage while your home is left unoccupied for more than 60 consecutive days." },
      { kind: "p", text: "B5 Bicycles, unless specified in Endorsement Schedule PP1." },
    ],
    [
      { kind: "h", text: "Personal Possessions Extension (Endorsement PP1)" },
      { kind: "p", text: "This extension only applies where it is confirmed in Endorsement Schedule PP1. The schedule sets out which items are covered and the limits that apply." },
      { kind: "p", text: "C1 Where it applies, we will cover the items listed in Endorsement Schedule PP1 against loss, theft and accidental damage while away from your home anywhere in the United Kingdom." },
      { kind: "p", text: "C2 Items left unattended in a public place are not covered." },
      { kind: "p", text: "C3 The standard excess applies to each claim under this extension." },
    ],
    [
      { kind: "h", text: "General Conditions and Claims" },
      { kind: "p", text: "D1 You must report any theft to the police within 24 hours and obtain a crime reference number." },
      { kind: "p", text: "D2 Other insurance. If any loss or damage is also covered by another insurance policy, we will only pay our proportionate share of the claim." },
      { kind: "p", text: "D3 You may cancel this policy at any time. If you cancel after the 14-day cooling-off period, we will refund the premium for the unexpired period less an administration charge of GBP 15." },
      { kind: "p", text: "Important: this document is a fictional sample created for software testing. It is not an offer of insurance." },
    ],
  ],
};

const gadget: SampleDoc = {
  file: "gadget.pdf",
  title: "Orbit Gadget Cover (Fictional) — Packaged Bank Account Benefit",
  reference: "OGC-PW-2026-v2",
  pages: [
    [
      { kind: "h", text: "Gadget Insurance Schedule" },
      { kind: "p", text: "This gadget insurance is provided as a benefit of the Meridian Current Account Plus (fictional packaged bank account)." },
      {
        kind: "kv",
        rows: [
          ["Insurer", "Orbit Gadget Cover (Fictional) Ltd"],
          ["Product", "Gadget Insurance — Meridian Account Plus benefit"],
          ["Policy reference", "OGC-55-201477"],
          ["Account holder", "Alex Sample"],
          ["Cover start date", "1 July 2026"],
          ["Cover term", "Rolling monthly while the account remains open"],
          ["Cost", "Included in the GBP 18.00 monthly account fee (the fee also covers other account benefits)"],
          ["Registered gadget 1", "Laptop — Brand-X Book 14 (fictional model)"],
          ["Registered gadget 2", "Smartphone — Brand-X Phone 9 (fictional model)"],
          ["Maximum per gadget", "GBP 2,000"],
          ["Excess", "GBP 50 per claim for laptops; GBP 75 per claim for smartphones"],
        ],
      },
    ],
    [
      { kind: "h", text: "What Is Covered" },
      { kind: "p", text: "1.1 Theft of a registered gadget, anywhere in the world, including from your home." },
      { kind: "p", text: "1.2 Accidental damage to a registered gadget, anywhere in the world, including inside your home." },
      { kind: "p", text: "1.3 Breakdown of a registered gadget after the manufacturer's warranty has expired." },
      { kind: "p", text: "1.4 We will repair or replace your gadget, up to the maximum per gadget shown in your schedule, after deduction of the excess." },
    ],
    [
      { kind: "h", text: "What Is Not Covered" },
      { kind: "p", text: "2.1 Loss of a gadget. Only theft is covered; losing or misplacing a gadget is not covered." },
      { kind: "p", text: "2.2 Theft from an unattended vehicle unless the gadget was hidden in a locked boot or glove compartment and there is evidence of forced entry." },
      { kind: "p", text: "2.3 Cosmetic damage such as scratches or dents that do not affect how the gadget works." },
      { kind: "p", text: "2.4 Theft where the gadget was left unattended in a public place." },
      { kind: "p", text: "2.5 Any claim where the theft was not reported to the police within 48 hours." },
    ],
    [
      { kind: "h", text: "Conditions" },
      { kind: "p", text: "3.1 Other insurance. If you have other insurance that covers the same gadget, for example home contents insurance, you must tell us. We will only pay our proportionate share of any claim." },
      { kind: "p", text: "3.2 Cover ends automatically when your Meridian Current Account Plus is closed or downgraded." },
      { kind: "p", text: "3.3 You must register any replacement gadget with us within 30 days for it to be covered." },
      { kind: "p", text: "Important: this document is a fictional sample created for software testing. It is not an offer of insurance." },
    ],
  ],
};

export const SAMPLE_DOCS: SampleDoc[] = [travel, contents, gadget];
