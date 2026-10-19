// Live extraction eval: runs the REAL parser + Claude extraction + verification on the fictional
// sample PDFs and scores the result against samples/ground-truth.json.
// Costs a few cents per document. Usage: npm run eval:extraction [-- travel.pdf]
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { parsePdf } from "@/lib/pdf/parse";
import { getAnthropic } from "@/lib/ai/client";
import { callExtractionModel } from "@/lib/extraction/extract";
import { verifyExtraction } from "@/lib/extraction/verify-extraction";
import type { FieldKey } from "@/lib/extraction/schema";

config({ path: ".env.local", quiet: true });
// Running an eval is an explicit choice to use (and pay for) Live AI, whatever the app is set to.
process.env.CABINET_MODE = "live";

type Truth = { value: string | number | null; page?: number; acceptAmbiguous?: boolean };
const groundTruth = JSON.parse(readFileSync("samples/ground-truth.json", "utf8")) as {
  documents: Record<string, { fields: Record<string, Truth> }>;
};

function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.005;
  if (typeof a === "string" && typeof b === "string") return a.trim().toLowerCase() === b.trim().toLowerCase();
  return a === b;
}

async function main() {
  const only = process.argv[2];
  const files = Object.keys(groundTruth.documents).filter((f) => !only || f === only);
  const client = await getAnthropic();
  const outDir = join("private", "eval");
  mkdirSync(outDir, { recursive: true });
  let totalFields = 0;
  let correct = 0;

  for (const file of files) {
    const parsed = await parsePdf(new Uint8Array(readFileSync(join("samples", file))));
    const t0 = Date.now();
    const result = await callExtractionModel(client, parsed.pages);
    const verified = verifyExtraction(result.extraction, parsed.pages);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    writeFileSync(join(outDir, `${file}.json`), JSON.stringify({ raw: result.extraction, verified }, null, 2));

    console.log(`\n=== ${file}  (${secs}s, ${result.inputTokens} in / ${result.outputTokens} out tokens, model ${result.model})`);
    console.log(`policy_type: ${verified.policy_type}`);
    const rows = [];
    for (const [key, truth] of Object.entries(groundTruth.documents[file].fields)) {
      if (key === "policy_type") {
        const ok = verified.policy_type === truth.value;
        totalFields++;
        if (ok) correct++;
        continue;
      }
      const got = verified.fields[key as FieldKey];
      const valueOk = same(got.value, truth.value);
      // For an expected null, "correct" means we did NOT present a value as verified fact.
      // Where the document genuinely lists several values, flagging "ambiguous" for review is acceptable.
      const statusOk = got.status === "found" || (truth.acceptAmbiguous === true && got.status === "ambiguous");
      const ok = truth.value === null ? got.value === null || got.status !== "found" : valueOk && statusOk && got.check.verified;
      totalFields++;
      if (ok) correct++;
      rows.push({
        field: key,
        expected: truth.value,
        got: got.value,
        status: got.status,
        page: got.check.page,
        expPage: truth.page ?? null,
        quoteOk: got.check.verified,
        result: ok ? "PASS" : "FAIL",
      });
    }
    console.table(rows);
    console.log(
      `limits ${verified.limits.length}, exclusions ${verified.exclusions.length}, extensions ${verified.optional_extensions
        .map((e) => `${e.name}=${e.status}`)
        .join("; ")}`,
    );
    console.log(`missing info: ${verified.missing_information.map((m) => m.description).join(" | ") || "none"}`);
    console.log(`citations ${verified.stats.citations}, rejected ${verified.stats.rejected_citations}`);
  }
  console.log(`\nFIELD ACCURACY: ${correct}/${totalFields} (${((100 * correct) / totalFields).toFixed(0)}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
