// The fictional sample policies that Demo Mode knows. Their prepared readings are real Claude
// extractions recorded once from these exact PDFs (npm run eval:extraction), stored as data. In Demo
// Mode they go through the same server-side evidence verification as a live reading, against the
// text of the uploaded document, so nothing is shown that the document doesn't say.
import type { ModelExtraction } from "@/lib/extraction/schema";
import travel from "./fixtures/travel.json";
import contents from "./fixtures/contents.json";
import gadget from "./fixtures/gadget.json";

export const DEMO_ENGINE_ID = "demo-prepared-v1";

export type DemoSampleId = "travel" | "contents" | "gadget";

export type DemoSample = {
  id: DemoSampleId;
  /** File name in samples/ and public/samples/. */
  file: string;
  label: string;
  /** Every phrase must appear in the document for it to count as this sample. */
  identifiers: string[];
  reading: ModelExtraction;
};

export const DEMO_SAMPLES: DemoSample[] = [
  { id: "travel", file: "travel.pdf", label: "travel", identifiers: ["FICTIONAL SAMPLE", "HLT-2025-884213"], reading: travel as unknown as ModelExtraction },
  { id: "contents", file: "contents.pdf", label: "home contents", identifiers: ["FICTIONAL SAMPLE", "KHC-7731-0092"], reading: contents as unknown as ModelExtraction },
  { id: "gadget", file: "gadget.pdf", label: "gadget", identifiers: ["FICTIONAL SAMPLE", "OGC-55-201477"], reading: gadget as unknown as ModelExtraction },
];

/** Which sample a document is, from its text (null for anything else, e.g. your own PDF). */
export function identifySample(text: string): DemoSample | null {
  return DEMO_SAMPLES.find((s) => s.identifiers.every((id) => text.includes(id))) ?? null;
}
