// The judging demo, end to end in a real browser against the real Supabase project, in Demo Mode:
// sign in → upload a fictional sample → straight into the wallet → edit details → prepared, cited Q&A
// (+ an unsupported question) → coverage review → user-approved task → run history → delete policy
// → Reset demo. The server's Anthropic SDK points at a local trap: zero requests may arrive.
// A throwaway user is created for the run and deleted afterwards.
import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ANTHROPIC_TRAP_PORT, startAnthropicTrap, type AnthropicTrap } from "../tests/helpers/anthropic-trap";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe.configure({ mode: "serial" });

let admin: SupabaseClient;
let userId: string;
let trap: AnthropicTrap;
const email = `e2e-${Date.now()}@example.test`;
const password = `E2e-${crypto.randomUUID()}`;

test.beforeAll(async () => {
  if (!url || !service) throw new Error("E2E needs Supabase credentials in .env.local");
  trap = await startAnthropicTrap(ANTHROPIC_TRAP_PORT);
  admin = createClient(url, service, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error;
  userId = data.user.id;
});

test.afterAll(async () => {
  await trap?.close();
  if (!userId) return;
  const { data: files } = await admin.storage.from("policy-pdfs").list(userId);
  if (files?.length) await admin.storage.from("policy-pdfs").remove(files.map((f) => `${userId}/${f.name}`));
  await admin.auth.admin.deleteUser(userId);
});

test("judging demo in Demo Mode: upload → wallet → edit → ask → review → task → logs → delete → reset", async ({ page }) => {
  // Signed-out visitors are sent to sign-in.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(page.getByText("Add your first policy")).toBeVisible();
  await expect(page.getByRole("banner").getByText("Demo", { exact: true })).toBeVisible();

  // Upload the fictional travel sample through the real pipeline: read, then straight into the wallet.
  await page.goto("/app/upload");
  await page.getByRole("button", { name: "Sample travel policy" }).click();
  await expect(page).toHaveURL(/\/app(\?added=[\w-]+)?$/, { timeout: 120_000 });
  await expect(page.locator('a[href^="/app/policies/"]')).toHaveCount(1);
  const card = page.locator('a[href^="/app/policies/"]', { hasText: "Annual Multi-Trip Travel Insurance" }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText("Sample")).toBeVisible();
  await expect(card.getByText("Expiry date")).toBeVisible();
  await expect(card.getByText("2 November 2026")).toBeVisible();

  // Edit details: what Cabinet read is there to change, and saves in one go.
  await card.click();
  // The policy: Details (the essentials and key limits), Ask, and Documents.
  await expect(page.getByText("Policy number")).toBeVisible();
  await expect(page.getByText(/4213$/)).toBeVisible();
  await expect(page.getByText("2 November 2026")).toBeVisible();
  await expect(page.getByText("Travel insurance", { exact: true })).toBeVisible();
  await expect(page.getByText(/^All \d+ limits$/)).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Policy sections" });
  await page.waitForLoadState("networkidle");
  await tabs.getByRole("link", { name: "Documents" }).click();
  await expect(page).toHaveURL(/tab=documents/);
  await expect(page.getByText("Sample travel.pdf")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a document" })).toBeVisible();
  await tabs.getByRole("link", { name: "Ask" }).click();
  await expect(page).toHaveURL(/tab=ask/);
  await expect(page.getByRole("heading", { name: "What would you like to know?" })).toBeVisible();
  await tabs.getByRole("link", { name: "Details" }).click();
  await expect(page.getByText("Policy number")).toBeVisible();
  await page.getByRole("link", { name: "Edit details" }).click();
  await expect(page.getByRole("heading", { name: "Edit details" })).toBeVisible();
  await expect(page.getByLabel("Insurer", { exact: true })).toHaveValue("Harbourlight Travel Insurance (Fictional) Ltd");
  await expect(page.getByLabel("Renews", { exact: true })).toHaveValue("2026-11-03");
  await page.getByLabel("Alternate name", { exact: true }).fill("My Europe travel cover");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("My Europe travel cover")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("* Added or changed by you")).toBeVisible();

  // Cited Q&A: off-piste skiing without a guide.
  await page.goto("/app/ask");
  await page.getByPlaceholder("Ask about your cover").fill("Am I covered if I ski off-piste without a guide?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  // Conclusion first, the condition that matters, one next step; the exact wording behind "Evidence".
  await expect(page.getByText("No, off-piste skiing isn't covered.")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/off-piste is only covered with a qualified guide/)).toBeVisible();
  await expect(page.getByText(/Ask Harbourlight about adding the Winter Sports Endorsement/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Open page 5/ }).first()).toBeVisible();
  await expect(page.getByRole("main").getByText("Demo", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Evidence" }).first().click();
  await expect(page.getByText(/Off-piste skiing or snowboarding without a qualified guide/).first()).toBeVisible();

  // A question outside the prepared set: the demo says so instead of inventing an answer.
  await page.getByPlaceholder("Ask about your cover").fill("What is the no-claims discount on my car insurance?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("Demo Mode can't answer that one.")).toBeVisible({ timeout: 90_000 });
  // Its suggested prepared questions can be tapped.
  await page.getByRole("button", { name: "What excess do I pay on a medical claim?" }).click();
  await expect(page.getByText("£75 per person, per incident.")).toBeVisible({ timeout: 30_000 });

  // Your cover: a short list. Cover the user may not need asks one plain question first.
  await page.goto("/app/review");
  await page.getByRole("button", { name: "Check my cover" }).click();
  await expect(page.getByText(/^\d+ things? to check\.$/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/unattended things|forced entry/i)).toHaveCount(0); // routine exclusions aren't flagged
  const ski = page.locator("li", { hasText: "Do you ski or snowboard?" });
  await ski.getByRole("radio", { name: "Yes" }).click();
  const winter = page.locator("li", { hasText: "No winter sports cover" });
  await winter.getByRole("button", { name: /No winter sports cover/ }).click();
  await expect(winter.getByText("Not covered", { exact: true })).toBeVisible();
  await expect(winter.getByRole("link", { name: /Open page 4/ })).toBeVisible();
  await winter.getByRole("button", { name: "Draft a message to your insurer" }).click();
  await expect(winter.getByText(/could I add the Winter Sports Endorsement/)).toBeVisible();
  await winter.getByRole("button", { name: "Remind me next week" }).click();
  await expect(page.getByText("Later · 1")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Later · 1")).toBeVisible();
  // Nothing has changed, so reviewing again reuses the saved results.
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText(/Up to date/)).toBeVisible();

  // A claim file: describe it → a few taps → what the policy says → Save claim file → evidence → leave → return.
  await page.goto("/app/claims/new");
  await page.getByLabel("What happened").fill("I broke my ankle on holiday in Spain yesterday and went to hospital");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Medical treatment")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Yes" }).click(); // called the emergency line
  await page.getByRole("button", { name: "Medical report or bills" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check and save" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Nothing is sent to your insurer.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Save claim file" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible({ timeout: 30_000 });
  const sections = page.getByRole("navigation", { name: "Claim file sections" });
  // Tick a step.
  const firstItem = page.getByRole("checkbox").first();
  await firstItem.click();
  await expect(firstItem).toHaveAttribute("aria-checked", "true");
  // Evidence: a receipt photo, kept privately in the claim file.
  await sections.getByRole("link", { name: /Evidence/ }).click();
  await page.getByLabel("Choose files to add to this claim file").setInputFiles({
    name: "hospital-receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
  });
  await expect(page.getByText("hospital-receipt.png")).toBeVisible({ timeout: 30_000 });
  await expect(sections.getByRole("link", { name: "Evidence · 1" })).toBeVisible();
  // Leave, come back through the policy folder: the file, the evidence and the progress are all there.
  await page.goto("/app");
  await page.locator('a[href^="/app/policies/"]', { hasText: "My Europe travel cover" }).first().click();
  await page.getByRole("link", { name: /Medical treatment/ }).click();
  await page.waitForURL(/\/app\/claims\/[0-9a-f-]+$/);
  await page.reload();
  await expect(page.getByRole("checkbox").first()).toHaveAttribute("aria-checked", "true");
  await sections.getByRole("link", { name: "Evidence · 1" }).click();
  await expect(page.getByText("hospital-receipt.png")).toBeVisible();
  // Edit what happened with a normal Save; it persists.
  await sections.getByRole("link", { name: "File" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "What happened" }).fill("I broke my ankle skiing in Spain and was treated in hospital");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Saved when the form closes and the new wording shows in the file.
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "What happened" }).getByText("I broke my ankle skiing in Spain and was treated in hospital")).toBeVisible();
  await page.reload();
  await expect(page.getByText("I broke my ankle skiing in Spain and was treated in hospital")).toBeVisible();
  await page.getByRole("button", { name: /I've sent it to/ }).click();
  await expect(page.getByRole("button", { name: "Back to preparing" })).toBeVisible();

  // Execution evidence.
  await page.goto("/app/runs");
  for (const label of ["Upload & read PDF", "Extract policy details", "Answer a question", "Coverage review", "User-approved action", "Claim preparation"]) {
    await expect(page.getByRole("main").getByText(label, { exact: true }).nth(1)).toBeVisible();
  }
  await expect(page.getByText("abstained").first()).toBeVisible();

  // Delete the policy and everything derived from it.
  await page.goto("/app");
  await page.locator('a[href^="/app/policies/"]', { hasText: "My Europe travel cover" }).first().click();
  await page.getByRole("button", { name: "Delete this policy" }).click();
  await page.getByRole("button", { name: "Yes, delete permanently" }).click();
  await expect(page.getByText("Add your first policy")).toBeVisible({ timeout: 30_000 });

  // Nothing derived from the policy remains for this user (checked server-side).
  for (const table of ["policies", "documents", "document_chunks", "insights", "action_items", "claims", "claim_evidence"]) {
    const { data } = await admin.from(table).select("id").eq("user_id", userId);
    expect(data, `${table} should be empty`).toEqual([]);
  }
  // …and the claim file's evidence files are gone from private storage too.
  expect((await admin.storage.from("claim-evidence").list(userId)).data ?? []).toEqual([]);

  // With no policy left, the top bar is just the logo and the account menu (nothing to browse yet).
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveCount(0);
  await page.getByLabel("Account menu").click();
  const menu = page.getByRole("navigation", { name: "Account" });
  for (const item of ["My profile", "FAQ", "Privacy policy", "Terms of use"]) {
    await expect(menu.getByRole("link", { name: item })).toBeVisible();
  }
  await expect(menu.getByRole("link", { name: "Notifications" })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Reset demo (Profile): the three fictional sample policies come back.
  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.getByRole("button", { name: "Tap again to reset everything" }).click();
  await expect(page.locator('a[href^="/app/policies/"]')).toHaveCount(3, { timeout: 90_000 });

  // And across the whole demo, not one request reached the Anthropic API.
  expect(trap.hits()).toBe(0);
});
