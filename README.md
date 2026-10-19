# Cabinet

**A filing cabinet for your insurance. Upload your policies once, and Cabinet answers questions about them, checks them for gaps and double cover, and helps you put a claim together, with every answer backed by a quote from your own policy.**

[Live app](https://coverclarity.vercel.app) · [Technical documentation](submission/technical-documentation.md) ([PDF](submission/technical-documentation.pdf)) · [Architecture diagram](submission/architecture.svg)

Built for the **2026 Shenzhen FinTechathon, International Track, Topic D: Insurance Assistant**. The live site's address uses `coverclarity`, which was Cabinet's working name.

---

## Why we built it

Insurance policies are long, written in legal language, and spread across emails and PDFs. Most people, especially first-time policyholders, only find out what their cover really says when they need to claim, and by then it's too late to fix a gap or meet a deadline they didn't know about.

Cabinet reads your actual policy documents and works only from their wording. When it can't back something up with a quote from your policy, it says so instead of guessing.

## What it does

| Competition capability | In Cabinet |
|---|---|
| **Policy Q&A** | Ask about one policy, all of them, or a claim. You get the answer first (covered, not covered, covered with conditions, or "I can't confirm this from your policy"), and every point links to the exact wording on the right page of your PDF. |
| **Coverage-gap analysis** | **Cover Check** ("Your Cover") looks across all your policies for missing documents, add-ons you didn't buy, things covered twice and unusual exclusions. It asks a quick yes/no question first when a gap only matters to some people (like "Do you ski or snowboard?"). |
| **Claims guidance** | A **Claim File** for each incident: a few tappable questions, a check of what your policy says about it, deadlines with real dates, a checklist, a private place for receipts and photos, and a record you can come back to and edit. |

The same rules apply across all three:

- **Claude suggests, our code decides.** Every quote Claude returns is checked against your stored document. If it doesn't match, it's thrown out. If nothing is left, the answer becomes "can't confirm".
- **Your data stays yours.** Every database query runs as you, under row-level security, and your files sit in private storage only you can open.
- **You stay in charge.** Consequential changes to policies and Claim Files are initiated by you. Cabinet never sends a claim, contacts an insurer, or recommends a product.
- **It works without AI too.** There's a rule-based backup for every AI feature, and a free Demo Mode that never calls the AI.

## Try it

### On the live site

The live site, https://coverclarity.vercel.app, runs with real AI (Claude).

1. Create an account with an email and password.
2. On **Add a policy**, tap one of the sample folders: **Travel**, **Home** or **Gadget**. These are made-up policies written for this competition. Please don't upload real policies with personal details.
3. Try:
   - **Ask:** "Am I covered if I ski off-piste without a guide?" or "What excess do I pay on a medical claim?"
   - **Cover Check:** tap **Check my cover**.
   - **Claims:** tap **Prepare a claim**, then "Someone smashed my car window yesterday and stole my phone".
4. To see everything Cabinet did for your account, open **https://coverclarity.vercel.app/app/runs**. This is your own activity log, with personal details already left out.

A warm answer takes about 10 seconds. The very first one after the site has been idle can take up to 2 minutes while the server starts up.

### Demo Mode (free, no AI calls)

Demo Mode uses prepared readings and answers for the three sample policies, plus our rule-based engines, so it costs nothing to run. It's switched on locally with `CABINET_MODE=demo` (or `switchable`, which adds a Demo/Live switch to the account menu).

In Demo Mode:

- **Profile → Reset demo data** (tap it twice to confirm) fills your account with the three samples.
- **Ask** answers 12 prepared questions, including "Am I covered if I lose my phone?", "Is my laptop covered if it's stolen from a café?" and "My phone was stolen. What do I need to do?". Anything else gets an honest "Demo Mode can't answer that one" with suggestions. It never makes up an answer.
- **Cover Check** and **Claims** run on the rule-based engines.
- A **Demo** badge sits next to the logo, so it's always clear which mode you're in.

## How it works

![Cabinet system architecture](submission/architecture.svg)

Cabinet is a Next.js app on Vercel. Supabase provides sign-in, the Postgres database and private file storage, and the Anthropic API (Claude) does the reading and answering. There's nothing else on the backend: no vector database, queue or analytics service.

1. **Reading a policy.** A PDF is uploaded straight to private storage. The server reads the text page by page, removes any text aimed at AI ("ignore previous instructions…"), and splits it into pieces that never cross a page. Claude, or the rule-based reader, then picks out the key details. Each detail comes with a quote and page number, which our code checks against the document.
2. **Answering.** Postgres full-text search finds the relevant wording in your own policies. Claude answers in a fixed format with a quote for every point, and our code keeps only quotes it can find in that wording.
3. **Cover Check.** Rule-based checks look for missing documents, add-ons you didn't buy and double cover, always pointing at checked wording. Claude may pick out one or two unusual exclusions, but only from wording that's already been checked.
4. **Claims.** Claude, or keyword rules, reads what happened. You answer at most five questions, and the policy is checked for your situation. Deadlines, contacts and "your policy asks for this" items are only kept if they appear in the quoted wording.

The [technical documentation](submission/technical-documentation.md) covers all of this in detail: the database, the checking rules, security, and what's tested.

### Tech stack

| Area | Built with |
|---|---|
| App | Next.js 16.4 (App Router), React 19.3, TypeScript 5, Tailwind CSS 4 |
| Data, sign-in, files | Supabase: Postgres with forced row-level security, Auth, private Storage, full-text search |
| AI | Anthropic API, `claude-opus-5-5`, via `@anthropic-ai/sdk` with structured outputs (no tools) |
| PDFs | `unpdf` (pdf.js), text extracted page by page |
| Validation | zod |
| Tests | Vitest (unit and database integration), Playwright (end-to-end) |
| Hosting | Vercel |

## Run it locally

You'll need **Node.js 20.9 or newer** (we use Node 24), npm, a **Supabase** project (the free tier is fine), and, only for Live AI, an **Anthropic API key**.

```bash
git clone https://github.com/spectacles05/cabinet.git
cd cabinet
npm install
cp .env.example .env.local
```

Set up Supabase (next section), fill in `.env.local`, then run:

```bash
npm run dev
```

Open http://localhost:3000, create an account and add a sample policy. With `CABINET_MODE=switchable` (the setting in `.env.example`), you start in Demo Mode, and can switch to Live AI from the account menu if you've set `ANTHROPIC_API_KEY`.

### Supabase setup

1. Create a project at https://supabase.com.
2. In the **SQL Editor**, run each file in [`supabase/migrations/`](supabase/migrations) in order. Paste in its contents and click **Run**. Alternatively, set `SUPABASE_DB_URL` and run `npm run db:apply -- supabase/migrations/0001_init.sql` for each file.

   | Migration | What it adds |
   |---|---|
   | `0001_init.sql` | Tables, forced row-level security, the private `policy-pdfs` bucket and its owner-only folder rules |
   | `0002_grants.sql` | Table permissions for signed-in users; nothing at all for anonymous visitors |
   | `0003_extraction_and_search.sql` | The full-text search function (`search_chunks`), and links from extractions to the activity log |
   | `0004_claims.sql` | Claim Files |
   | `0005_security.sql` | An activity log that can't be edited or deleted, and the daily AI-usage counter |
   | `0006_claim_files.sql` | Claim evidence: the private `claim-evidence` bucket and its records, plus conversations about a claim |

3. Under **Authentication → URL Configuration**, set **Site URL** to your app's address (`http://localhost:3000` locally).
4. For quick testing, you can turn off **Authentication → Sign In / Providers → Email → Confirm email**.
5. Under **Project Settings → API**, copy the project URL, the `anon` key and (for the tests) the `service_role` key into `.env.local`.

### Environment variables

Names only. Real values go in `.env.local`, which git ignores. [`.env.example`](.env.example) has the full list with comments.

| Variable | Needed for | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Everything | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Everything | Public; every request still runs as the signed-in user, under row-level security |
| `ANTHROPIC_API_KEY` | Live AI | Server only |
| `CABINET_MODE` | Choosing the mode | `demo` (the default if unset; never calls the AI), `live`, or `switchable` |
| `AI_ENGINE` | Live AI | `auto` (default: Claude, with the rule-based backup), `claude`, or `rules` |
| `AI_DAILY_CALLS_PER_USER`, `AI_DAILY_CALLS_TOTAL` | Optional | Daily AI caps; defaults 300 and 1,500 |
| `MAX_UPLOAD_MB`, `MAX_PDF_PAGES` | Optional | Defaults 15 MB and 50 pages |
| `CONTACT_EMAIL` | Optional | Shows the Contact us page |
| `SUPABASE_SERVICE_ROLE_KEY` | Tests and scripts only | Never used by the app. Don't put it on Vercel, and never prefix it with `NEXT_PUBLIC_` |
| `SUPABASE_DB_URL` | Optional | Only for `npm run db:apply` |

## Deploy to Vercel

1. Push the repository to GitHub, then **import it into Vercel**. It's detected as Next.js, and the default build settings work.
2. In **Settings → Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `CABINET_MODE`:
   - for real AI, set `CABINET_MODE` to `live` and also add `ANTHROPIC_API_KEY`;
   - for a free demo deployment, set `CABINET_MODE` to `demo` (or leave it unset).

   Optional: the AI caps and `CONTACT_EMAIL`. **Don't add `SUPABASE_SERVICE_ROLE_KEY`**, because the app never needs it.
3. In Supabase, set **Authentication → URL Configuration → Site URL** to your Vercel address.
4. **Deploy.** Every push to `main` deploys again. After changing an environment variable, redeploy (**Deployments → ⋯ → Redeploy**) for it to take effect.

Recommended:

- Set **Settings → Functions → Function Region** to the region closest to your Supabase project, because every request makes several database calls.
- Reading a long policy can take about a minute. The route that reads a policy's details allows up to 300 seconds, but the real limit depends on your Vercel plan.

The live site is deployed this way from `main`, with `CABINET_MODE=live`.

## Tests

| Command | What it runs | What it needs | Cost |
|---|---|---|---|
| `npm run lint` | ESLint | Nothing | Free |
| `npm run typecheck` | Route types and the TypeScript compiler | Nothing | Free |
| `npm test` (or `npx vitest run`) | 16 Vitest files, 214 tests | Nothing for the offline tests. The database tests in 5 files need Supabase in `.env.local`, including `SUPABASE_SERVICE_ROLE_KEY`, and **skip themselves without it**. | Free |
| `npm run test:security` | Just the isolation, deletion and demo-workflow database suites | Supabase credentials (fails instead of skipping without them) | Free |
| `npm run test:e2e` | A production build, then two Playwright tests in Microsoft Edge: the whole app in Demo Mode, and the security headers | Supabase credentials and Microsoft Edge. Runs on port 3100. | Free: a trap server fails the test if a single request reaches the Anthropic API |
| `npm run eval:qa` | Real-Claude Q&A benchmark: 7 questions with known answers | `ANTHROPIC_API_KEY` | About 22 cents |
| `npm run eval:claims` | Real Claude on a sample claim and on Cover Check | `ANTHROPIC_API_KEY` | About 6 cents |
| `npm run eval:extraction` | Real-Claude policy reading on the 3 samples, scored against `samples/ground-truth.json` | `ANTHROPIC_API_KEY` | Roughly 10 cents per document (estimate) |

The database tests and the end-to-end test create temporary accounts with made-up data and delete them afterwards. Nothing in the test suite calls the paid AI. Only the `eval:*` scripts do, and only when you run them.

The end-to-end tests use the Microsoft Edge that comes with Windows (`channel: "msedge"` in `playwright.config.ts`). Without Edge, run `npx playwright install chromium` and remove that line.

### What the tests cover

| Capability | Tests |
|---|---|
| Policy Q&A | `qa-rules.test.ts` (benchmark questions, refusing to guess, wrong policy, made-up quotes), `qa-style.test.ts` (answer format, headline matching the verdict, the live path with a stand-in for Claude), `verify.test.ts`, `demo-mode.test.ts`, the end-to-end test, `eval:qa` |
| Coverage-gap analysis | `audit.test.ts` (every check on the samples), `review.test.ts`, `demo-workflows.test.ts` (against the real database), the end-to-end test, `eval:claims` |
| Claims guidance | `claims.test.ts` (the claim checker: quotes, deadlines, contacts, promises), `claims-db.test.ts` (save, edit, re-check, evidence, other users locked out), the end-to-end Claim File journey, `eval:claims` |
| Reading policies | `pdf.test.ts`, `rules-extraction.test.ts` (against `samples/ground-truth.json`), `verify.test.ts`, `eval:extraction` |
| Security | `rls.test.ts` (other users and signed-out visitors get nothing), `security.test.ts` (prompt injection, no AI tools, safe errors, rate limits, AI cost caps, a log that can't be edited), `deletion.test.ts`, `redaction.test.ts`, `headers.test.ts`, the end-to-end header check |

### Latest results (16 October 2026)

- `npm run lint` and `npm run typecheck`: no errors.
- `npx vitest run`: **214 passed out of 214**, across all 16 files, with Supabase credentials. On a fresh clone with no credentials: **173 passed, 41 skipped** (the database tests skip themselves), and lint, typecheck and the build all pass too.
- `npm run test:e2e`: **2 passed out of 2**, with zero requests to the Anthropic API.
- `npm run build`: succeeds.
- Real Claude: Q&A benchmark 7 out of 7, with none of its 41 quotes rejected. The claim and Cover Check checks passed.

Full output is in [`submission/evidence/`](submission/evidence).

## Project structure

```
src/app/              pages (app/ is the signed-in area) and API routes (api/)
src/lib/              server-side logic: pdf, extraction, qa, audit (Cover Check), claims, runs (log, limits), ai, demo
src/components/       UI components and the hand-drawn illustrations
src/proxy.ts          session refresh and the signed-out redirect
supabase/migrations/  database schema, row-level security, storage and functions
tests/, e2e/          Vitest and Playwright tests
samples/              the three made-up sample policies and their correct answers
scripts/              sample generation, paid real-Claude evals, log export, migration helper
submission/           competition documents, diagrams and test evidence
docs/                 the original product brief and project notes
```

## Security and privacy, in short

- Every database query and file access runs as the signed-in user, under forced row-level security on all 12 tables. The app never uses Supabase's admin key.
- Policy PDFs and claim evidence sit in private buckets, where each person can only reach their own folder. Files open through links that last 60 seconds.
- The Anthropic key stays on the server. Claude gets no tools, answers in a fixed format, and only ever sees your own policy text, with anything aimed at AI removed first.
- There are rate limits and daily AI caps per person and across the site. Over a cap, the free rule-based engine answers instead.
- The activity log only stores ids and counts, never policy text, names or questions. It can be added to, but not edited or deleted.
- Cabinet gives information, not insurance advice, and never promises a claim will be paid.

Section 7 of the [technical documentation](submission/technical-documentation.md) has the details. Section 10 lists the limits, and what isn't finished or tested yet.

## Documentation

- [Technical documentation](submission/technical-documentation.md) ([PDF](submission/technical-documentation.pdf)): architecture, how each feature works, security, and test status
- [System architecture diagram](submission/architecture.svg) and [how every answer gets checked](submission/ai-pipeline.svg)
- [Test results and a sample activity log](submission/evidence)
- [Original product brief](docs/PRODUCT_SPEC.md)

All sample policies and test data are made up. This repository contains no keys, passwords or personal data.
