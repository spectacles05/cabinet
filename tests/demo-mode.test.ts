// Demo Mode: zero Anthropic API calls, enforced server-side, with accurate prepared results.
// The Anthropic SDK is pointed at a local trap server, so any request it made would be counted.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { parsePdf } from "@/lib/pdf/parse";
import { chunkPages } from "@/lib/pdf/chunk";
import { verifyExtraction } from "@/lib/extraction/verify-extraction";
import { verifyAnswer } from "@/lib/qa/verify-citations";
import type { RetrievedChunk, ScopePolicy } from "@/lib/qa/types";
import { demoAnswer, demoReading } from "@/lib/demo/engine";
import { PREPARED_ANSWERS, preparedPrompts } from "@/lib/demo/answers";
import { DEMO_ENGINE_ID, DEMO_SAMPLES } from "@/lib/demo/samples";
import { DemoModeError, getAppMode, modeSetting } from "@/lib/ai/mode";
import { getAnthropic } from "@/lib/ai/client";
import { anthropicFetchCount, startAnthropicTrap, type AnthropicTrap } from "./helpers/anthropic-trap";

type Truth = { value: string | number | null };
const groundTruth = JSON.parse(readFileSync("samples/ground-truth.json", "utf8")) as {
  documents: Record<string, { fields: Record<string, Truth> }>;
};

const env = { ...process.env };
let trap: AnthropicTrap;
const fetchSpy = vi.spyOn(globalThis, "fetch");

const pages: Record<string, { pageNumber: number; text: string }[]> = {};
const chunks: Record<string, RetrievedChunk[]> = {};
const policies: Record<string, ScopePolicy> = {};

beforeAll(async () => {
  trap = await startAnthropicTrap();
  process.env.ANTHROPIC_BASE_URL = trap.url;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
  for (const s of DEMO_SAMPLES) {
    const parsed = await parsePdf(new Uint8Array(readFileSync(join("samples", s.file))));
    pages[s.id] = parsed.pages;
    policies[s.id] = { id: `policy-${s.id}`, name: s.label, policy_type: s.id, insurer: null, documentId: `doc-${s.id}`, extensions: [] };
    chunks[s.id] = chunkPages(parsed.pages).map((c) => ({
      id: `${s.id}#${c.chunkIndex}`,
      document_id: `doc-${s.id}`,
      policy_id: `policy-${s.id}`,
      page_number: c.pageNumber,
      text: c.text,
    }));
  }
});

afterEach(() => {
  process.env.CABINET_MODE = env.CABINET_MODE;
  if (env.CABINET_MODE === undefined) delete process.env.CABINET_MODE;
});

afterAll(async () => {
  await trap.close();
  fetchSpy.mockRestore();
});

describe("choosing the mode", () => {
  it("is Demo Mode unless the server is explicitly set to live", async () => {
    delete process.env.CABINET_MODE;
    expect(modeSetting()).toBe("demo");
    expect(await getAppMode()).toBe("demo");
    process.env.CABINET_MODE = "something-else";
    expect(await getAppMode()).toBe("demo");
    process.env.CABINET_MODE = "live";
    expect(await getAppMode()).toBe("live");
  });

  it("starts switchable sites in Demo Mode (outside a request there is no choice, so Demo)", async () => {
    process.env.CABINET_MODE = "switchable";
    expect(modeSetting()).toBe("switchable");
    expect(await getAppMode()).toBe("demo");
  });
});

describe("the Anthropic gate", () => {
  it("refuses to create a client in Demo Mode, even with an API key set", async () => {
    for (const setting of ["demo", "switchable", undefined]) {
      if (setting) process.env.CABINET_MODE = setting;
      else delete process.env.CABINET_MODE;
      await expect(getAnthropic()).rejects.toBeInstanceOf(DemoModeError);
    }
    expect(trap.hits()).toBe(0);
  });

  it("is the only place in the app that can create an Anthropic client, and every AI call goes through it", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) files.push(p.replace(/\\/g, "/"));
      }
    };
    walk("src");
    const source = (f: string) => readFileSync(f, "utf8");
    expect(files.filter((f) => /new Anthropic\(/.test(source(f)))).toEqual(["src/lib/ai/client.ts"]);
    expect(files.filter((f) => /api\.anthropic\.com/.test(source(f)))).toEqual([]);
    // Each engine call is handed a client from the gate, never one made elsewhere.
    for (const f of ["src/lib/extraction/service.ts", "src/lib/qa/service.ts", "src/lib/audit/service.ts"]) {
      expect(source(f)).toMatch(/\(await getAnthropic\(\)/);
    }
  });

  it("control: in Live AI Mode a real SDK call does reach the trap, so a count of zero means zero", async () => {
    process.env.CABINET_MODE = "live";
    const client = await getAnthropic();
    await expect(client.messages.create({ model: "x", max_tokens: 1, messages: [{ role: "user", content: "hi" }] })).rejects.toThrow();
    expect(trap.hits()).toBe(1);
  });
});

describe("prepared readings of the fictional samples", () => {
  it.each(DEMO_SAMPLES.map((s) => [s.id, s.file]))("%s: recognised, verified against the PDF, and matches the ground truth", (id, file) => {
    const before = trap.hits();
    const reading = demoReading(pages[id]);
    expect(reading?.sample.id).toBe(id);
    const verified = verifyExtraction(reading!.extraction, pages[id]);
    for (const [key, truth] of Object.entries(groundTruth.documents[file].fields)) {
      if (key === "policy_type") {
        expect(verified.policy_type).toBe(truth.value);
        continue;
      }
      const got = verified.fields[key as keyof typeof verified.fields];
      if (truth.value === null) expect(got.value === null || got.status !== "found").toBe(true);
      else {
        expect(got.value, key).toEqual(truth.value);
        expect(got.check.verified, `${key} evidence`).toBe(true);
      }
    }
    expect(trap.hits()).toBe(before);
  });

  it("leaves any other document to the rule-based reader", () => {
    expect(demoReading([{ pageNumber: 1, text: "My own home insurance schedule. Policy number ABC-123." }])).toBeNull();
  });
});

describe("prepared answers", () => {
  const meta = (scope: ScopePolicy[]) => ({ engine: "demo" as const, model: DEMO_ENGINE_ID, scopePolicyIds: scope.map((p) => p.id) });

  it.each(PREPARED_ANSWERS.map((p) => [p.id, p]))("%s: every quote is found in the sample and verifies", (_, entry) => {
    const scope = [policies[entry.sample]];
    const { proposed, preparedId } = demoAnswer(entry.prompt, chunks[entry.sample]);
    expect(preparedId).toBe(entry.id);
    const answer = verifyAnswer(proposed, chunks[entry.sample], scope, meta(scope));
    expect(answer.engine).toBe("demo");
    expect(answer.assessment).toBe(entry.assessment);
    expect(answer.downgraded).toBe(false);
    expect(answer.rejected_citations).toBe(0);
    expect(answer.citations).toHaveLength(entry.citations.length);
    expect(answer.citations.map((c) => c.page)).toEqual(entry.citations.map((c) => c.page));
  });

  it("recognises everyday wording, across the whole wallet", () => {
    const wallet = Object.values(chunks).flat();
    const cases: [string, string][] = [
      ["Will I be covered skiing off-piste?", "travel-off-piste"],
      ["my phone got nicked from the car", "gadget-phone-car"],
      ["I lost my phone on the bus, am I covered?", "gadget-lost-phone"],
      ["What happens if my flat is burgled?", "contents-claim-theft"],
      ["Is my bicycle insured?", "contents-bike"],
      ["what is the excess for a laptop claim", "gadget-laptop-excess"],
      ["I need to go to hospital in Spain, what do I do?", "travel-claim-medical"],
    ];
    for (const [question, id] of cases) expect(demoAnswer(question, wallet).preparedId, question).toBe(id);
  });

  it("says plainly that the demo is limited for anything else, and suggests prepared questions", () => {
    const wallet = Object.values(chunks).flat();
    const { proposed, preparedId } = demoAnswer("What is the no-claims discount on my car insurance?", wallet);
    expect(preparedId).toBeNull();
    expect(proposed.assessment).toBe("insufficient_evidence");
    expect(proposed.headline).toBe("Demo Mode can't answer that one.");
    expect(proposed.answer).toContain("only answer a few prepared questions");
    expect(proposed.citations).toEqual([]);
    expect(proposed.further_checks.length).toBeGreaterThan(0);
    for (const q of proposed.further_checks) expect(PREPARED_ANSWERS.some((p) => p.prompt === q)).toBe(true);
  });

  it("doesn't answer about a sample that isn't in the question's scope", () => {
    const { proposed, preparedId } = demoAnswer("Am I covered if I ski off-piste without a guide?", chunks.gadget);
    expect(preparedId).toBeNull();
    expect(proposed.answer).toContain("sample travel policy");
  });

  it("suggests the prepared questions for the policies in view", () => {
    expect(preparedPrompts(["gadget"])).toContain("Am I covered if I lose my phone?");
    expect(preparedPrompts(["travel", "contents"], 2)).toHaveLength(4);
    expect(preparedPrompts(["car"])).toEqual([]);
  });
});

describe("zero Anthropic calls", () => {
  it("not one request reached the trap or Anthropic's API outside the Live AI control test", () => {
    expect(trap.hits()).toBe(1); // the deliberate Live AI control call above, and nothing else
    expect(anthropicFetchCount(fetchSpy)).toBe(0);
  });
});
