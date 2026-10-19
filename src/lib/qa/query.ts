// Question analysis shared by both answer engines: subject "concepts" with insurance synonyms
// (for retrieval and clause scoring), question intent, and policy types the user mentions.

export type Concept = { word: string; terms: string[]; target?: boolean };

export type QuestionAnalysis = {
  concepts: Concept[];
  searchTerms: string[];
  intent: "coverage" | "information";
  /** Policy types explicitly named in the question (e.g. "car insurance"), used to detect missing policies. */
  mentionedTypes: string[];
};

const STOPWORDS = new Set(
  `a an the am i im i'm my me mine is are was were be been being if it its it's do does did done will would could can should
  shall may might must for of on in at to from by with and or but not no nor what which who whom how when where why this that
  these those any some get got have has had there here you your yours we our us they them their policy policies insurance insurer
  insured cover covered covers coverage claim claims claiming pay paid payout about under much many also up own just still out
  over into than then so too very really ok okay please tell know want need going happen happens happened without within
  contents travel gadget plan scheme anything something someone`
    .split(/\s+/)
    .filter(Boolean),
);

// Each entry: question-word stems → search terms. Multi-word terms are matched as phrases.
const SYNONYMS: [RegExp, string[]][] = [
  [/^(ski|skiing|skier)$/, ["ski", "skiing", "piste", "off-piste", "winter sports", "snowboarding"]],
  [/^(snowboard|snowboarding)$/, ["snowboarding", "winter sports", "piste"]],
  [/^(off-piste|offpiste|piste)$/, ["off-piste", "piste", "winter sports", "skiing"]],
  [/^(guide|guided|instructor)$/, ["guide", "instructor"]],
  [/^(lose|lost|losing|loss|misplace|misplaced)$/, ["loss", "lose", "lost", "losing", "misplacing"]],
  [/^(phone|phones|smartphone|iphone|mobile)$/, ["phone", "smartphone", "mobile", "gadget"]],
  [/^(laptop|laptops|macbook|notebook)$/, ["laptop", "computer", "gadget"]],
  [/^(computer|computers|pc)$/, ["computer", "laptop"]],
  [/^(tablet|ipad)$/, ["tablet", "gadget"]],
  [/^(stolen|steal|stole|theft|thief|robbed|burgled|burglary|nicked)$/, ["theft", "stolen", "steal"]],
  [/^(drop|dropped|smash|smashed|break|broke|broken|crack|cracked|damage|damaged|spill|spilled|accident|accidental|accidentally)$/, ["accidental damage", "damage", "broken"]],
  [/^(cafe|café|restaurant|pub|bar|library|university|campus|train|bus|gym|office|street)$/, ["away from home", "away from your home", "public place"]],
  [/^(outside|away|abroad)$/, ["away from home", "away from your home", "abroad"]],
  [/^(home|house|flat|room|halls|accommodation)$/, ["home"]],
  [/^(excess|deductible)$/, ["excess"]],
  [/^(baggage|luggage|suitcase|bag|bags|belongings)$/, ["baggage", "luggage", "belongings"]],
  [/^(item|items|thing|things|article)$/, ["item", "article"]],
  [/^(medical|hospital|doctor|ill|illness|sick|injured|injury|treatment)$/, ["medical", "treatment", "hospital"]],
  [/^(cancel|cancelled|canceled|cancellation)$/, ["cancellation", "cancel", "curtailment"]],
  [/^(delay|delayed|late)$/, ["delay"]],
  [/^(money|cash)$/, ["money", "cash"]],
  [/^(bike|bicycle|cycle)$/, ["bicycle", "bike"]],
  [/^(renew|renews|renewal|expire|expires|expiry|end|ends)$/, ["renewal", "renew", "period of insurance", "expiry"]],
  [/^(premium|cost|costs|price)$/, ["premium", "cost"]],
  [/^(scuba|diving|dive)$/, ["diving", "scuba"]],
  [/^(motorbike|motorcycle|moped|scooter)$/, ["motorcycle", "moped"]],
  [/^(alcohol|drunk|drinking)$/, ["alcohol", "influence"]],
  [/^(limit|limits|maximum|max|most)$/, ["limit", "maximum", "up to"]],
  [/^(single|one)$/, ["single"]],
  [/^(flood|water|leak|leaking)$/, ["flood", "escape of water"]],
  [/^(fire|smoke)$/, ["fire", "smoke"]],
  [/^(unattended|left)$/, ["unattended"]],
  [/^(car|cars|van|vehicle)$/, ["car", "vehicle"]],
];

const TARGET_WORDS = /^(excess|deductible|limit|limits|maximum|max|most|premium|cost|costs|price|renew|renews|renewal|expire|expires|expiry)$/;

const TYPE_WORDS: [string, RegExp][] = [
  // Only explicit references to a type of insurance count; "stolen from my car" is about the theft, not car insurance.
  ["car", /\b(car|motor|vehicle|van) (insurance|policy|cover)\b|\bno[- ]claims?\b/i],
  ["pet", /\bpet (insurance|policy|cover)\b|\bvet(erinary)? (fees|bills)\b/i],
  ["health", /\bhealth (insurance|cover|policy)\b|\bprivate medical\b/i],
  ["life", /\blife (insurance|cover|policy)\b/i],
  ["renters", /\b(renters|tenant|tenants) (insurance|cover|policy)\b/i],
];

export function analyseQuestion(question: string): QuestionAnalysis {
  const q = question.toLowerCase().normalize("NFKC");
  const words = q.match(/[a-zà-ÿ][a-zà-ÿ'-]*/g) ?? [];
  const concepts: Concept[] = [];
  const seen = new Set<string>();
  for (const raw of words) {
    const w = raw.replace(/'s$/, "").replace(/^-+|-+$/g, "");
    if (w.length < 3 || STOPWORDS.has(w)) continue;
    const syn = SYNONYMS.find(([re]) => re.test(w));
    const terms = syn ? syn[1] : [w];
    const key = terms.join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    concepts.push({ word: w, terms, target: TARGET_WORDS.test(w) || undefined });
  }

  const informational =
    /\bhow much\b|\bhow many\b/.test(q) ||
    (/^(what|when|which)\b/.test(q.trim()) && concepts.some((c) => c.target));

  const mentionedTypes = TYPE_WORDS.filter(([, re]) => re.test(q)).map(([t]) => t);
  const searchTerms = [...new Set(concepts.flatMap((c) => [c.word, ...c.terms]))].slice(0, 30);
  return { concepts, searchTerms, intent: informational ? "information" : "coverage", mentionedTypes };
}

/** Prefix-stem match so "laptop" finds "laptops" and "piste" finds "off-piste"; phrases must appear verbatim. */
export function termMatches(normalisedText: string, term: string): boolean {
  const t = term.toLowerCase();
  if (t.includes(" ")) return normalisedText.includes(t);
  const stem = t.length > 4 ? t.replace(/(ing|ed|es|s)$/, "") : t;
  return new RegExp(`(^|[^a-z])${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(normalisedText);
}
