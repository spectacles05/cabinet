// Uploaded documents are untrusted. Text that addresses software rather than the reader ("ignore
// your previous instructions", "note to the AI", "you are an assistant…") is replaced as soon as a
// PDF is read, so no engine ever sees it and it can never be quoted back as policy "evidence".
// The patterns are deliberately narrow: ordinary policy wording ("if you disregard the
// instructions of your doctor") is left alone. This is one layer; the prompts also mark document
// text as untrusted, the model has no tools, and every quote is verified.

export const REMOVED = "[text removed: instructions aimed at software]";

const PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,30}\b(previous|prior|above|earlier|preceding|all (?:other|previous|prior)|any (?:other|previous|prior)) (instructions?|rules|prompts?|directions|guidelines)\b/i,
  /\b(system|developer|hidden) (prompt|message|instructions?)\b/i,
  /\byou are (now )?(an? |the )?(ai|a\.i\.|assistant|chat ?bot|language model|llm|claude|chatgpt|gpt)\b/i,
  /\bas an? (ai|language model)\b/i,
  /\b(note|message|instructions?|reminder)s? (to|for) (the |any )?(ai|assistant|model|llm|chat ?bot|claude|chatgpt|gpt|reader software)\b/i,
  /\b(ai|assistant|model|llm|claude|chatgpt|gpt)\s*[:,]\s*(please |you must |always |never |do not |don'?t |respond|answer|say|tell|output|ignore|reply)/i,
  /\b(tell|inform|reply to|respond to) the user\b/i,
  /<\/?\s*(system|instructions?|prompt|source|sources|description|turn|earlier_conversation)\b[^>]*>/i,
];

export function looksLikeInstructions(text: string): boolean {
  return PATTERNS.some((re) => re.test(text));
}

/** Replaces any sentence or line that addresses software. Returns the cleaned text and how many were removed. */
export function neutraliseInstructions(text: string): { text: string; removed: number } {
  let removed = 0;
  // Sentences end at . ! ? or a line break; the punctuation stays with its sentence.
  const cleaned = text.replace(/[^.!?\n]+[.!?]*/g, (sentence) => {
    if (!looksLikeInstructions(sentence)) return sentence;
    removed++;
    const lead = sentence.match(/^\s*/)?.[0] ?? "";
    return `${lead}${REMOVED}`;
  });
  return { text: cleaned, removed };
}
