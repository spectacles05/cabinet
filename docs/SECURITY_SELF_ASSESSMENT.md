# Cabinet: security, permissions and compliance self-assessment

*Assessed and tested 15 October 2026, on branch `cabinet-dashboard`. Every "verified" item below has an automated test that passed on that date against the real Supabase project, with throwaway test accounts and fictional policies. No paid AI calls were made during testing.*

**What Cabinet is:** a personal insurance wallet. It reads the user's own policy documents, answers questions about them with cited wording, reviews cover for gaps and overlaps, and helps the user prepare a claim checklist.

**What it is not:** it does not sell or recommend insurance, submit claims, negotiate settlements, or contact insurers. No code path for any of these exists (verified, see §3).

---

## 1. Security architecture (as built)

| Layer | Design |
|---|---|
| Identity | Supabase Auth (email + password). Every page and API route re-validates the session server-side with `auth.getUser()`; the `/app` proxy redirect is only a convenience. |
| Data isolation | Postgres row-level security, **forced**, on all 12 user tables: `user_id = auth.uid()`. Child rows use composite foreign keys `(id, user_id)`, so a row can never point at another user's policy or document. |
| Server privilege | The app never uses the service-role key: every database and storage call runs **as the signed-in user**, so RLS applies to the server too. (The key exists only in local test and evidence scripts and is not deployed.) |
| Documents | Two private storage buckets: policy PDFs (PDF only) and claim-file evidence (PDF, JPEG, PNG, WebP, HEIC; contents checked against the declared type on the server), 15 MB cap each. Storage policies limit each user to the folder named after their own id. Files are opened only through 60-second signed URLs created as the user. |
| Secrets | The Anthropic key and service-role key are server-only (`server-only` imports). Only the public Supabase URL and anon key reach the browser. |
| AI | The model receives only the user's own retrieved passages. It has **no tools**, so it can only return text in a fixed schema. Every quote it returns must match the user's document on the cited page, or the answer is withheld. Demo Mode cannot reach the Anthropic API at all (`getAnthropic()` refuses). |
| Uploaded text | Treated as untrusted: instructions aimed at software are stripped when the PDF is read (§3.3), and prompts fence document text as data. |
| Cost and abuse | Per-user rate limits per workflow, plus daily AI caps (300 calls per user, 1,500 site-wide; configurable). Over a cap, Cabinet quietly answers with the free rule-based engine. |
| Transport and browser | HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, a strict referrer policy and a restrictive permissions policy. `Cache-Control: no-store` on every API response. |
| Logging | Structured execution log (`agent_runs` / `agent_steps`) with an allowlist of metadata keys and identifier-only values (`redactMetadata`). Users can append to it but not edit or delete it (§3.5). There is no customer-facing log page; `/app/runs` returns 404 in Live mode. |

## 2. Internal permission model (backend only; invisible to customers)

| Tier | What it covers | How it's enforced |
|---|---|---|
| **Read** | Cabinet may read the signed-in user's own documents, policies, findings and claims to analyse them, answer questions and review cover. | RLS on every read; retrieval (`search_chunks`) is `security invoker` and scoped to the user's own policy ids. |
| **Write** | Persistent changes happen only when the customer starts them with an ordinary control: Save (claim, policy details), Edit, tick, Delete. | Each write is a server route that checks the session, validates the input (zod) and writes as the user (RLS `with check`). A saved claim's summary is **re-verified** against the user's own wording at save time. Only irreversible deletion asks twice. |
| **Restricted** | Cabinet cannot read another user's data, submit claims, contact insurers, send messages, make payments, or start any other external transaction. The AI cannot grant itself permissions. | No server code makes outbound calls except the Supabase client and the Anthropic SDK (test-scanned). AI calls carry no tools. Model output is filtered to the user's own ids. Mode switching is refused when fixed. |

The AI sits entirely inside **Read**. It proposes text; deterministic server code decides what is shown, and only the user's own action writes anything.

## 3. Verified protections

| # | Protection | Evidence (test → result) |
|---|---|---|
| 3.1 | Another user sees zero rows in every table, can't download, list or write the owner's files, can't link rows to the owner's documents, post into their threads, change their findings or claims, or attach a claim to their policy | `rls.test.ts` (10), `claims-db.test.ts` cross-user case, `security.test.ts` "cross-user attempts through the app's own operations": all pass |
| 3.2 | Restricted actions: no tools on any of the 5 AI calls (Q&A, extraction, review, claim triage, claim check); no outbound network code; model can't redirect to another user's policy, invent contact details or promise payment | `security.test.ts` "the AI can't give itself more permissions" (3): pass |
| 3.3 | Prompt injection via an uploaded policy: planted "ignore all previous instructions…", "Note to the AI…" and `<system>` text is stripped on read; real clauses (incl. "if you disregard the instructions of your doctor…") are kept; a model that "obeys" the planted text still can't get an answer shown | `security.test.ts` injection cases (3 offline + 1 end-to-end upload): pass. Removal is logged as `instructions_removed` |
| 3.4 | Claim files: evidence is kept privately, checked (a disguised file is refused and deleted), openable only by its owner, and removed with the claim or policy; edits persist; nothing saved without the user's Save; missing answers block the policy check; uncertain cover is stated as uncertain; a tampered summary loses invented wording and contacts on save | `claims-db.test.ts` (8), `claims.test.ts` (19): pass |
| 3.5 | Tamper-resistant log: the owner can't delete runs or steps, rewrite timestamps, reopen a finished run, or plant a pre-finished or back-dated run | `security.test.ts` "the execution log can't be edited or erased by its owner": pass |
| 3.6 | Rate limits: the 11th question in a minute is refused (`429 rate_limited`); uploads are capped at 20 an hour; claim checks at 20 a minute | `security.test.ts` rate-limit case: pass |
| 3.7 | Cost control: over the daily AI cap, a Live question is answered by the rule-based engine with **zero** AI requests, and the decision is logged; with fallback disabled it is refused (`429 ai_limit`) | `security.test.ts` cost-control case: pass (AI stand-in hit count unchanged) |
| 3.8 | Uploads: non-PDF refused (415), oversize refused (413), writes outside one's own storage folder refused; malformed, image-only and over-page-limit PDFs give clear errors and are deleted | `security.test.ts`, `pdf.test.ts` (10): pass |
| 3.9 | Safe errors: unexpected errors become a generic message (no database text, ids or stack traces); every API route uses one helper | `security.test.ts` "safe errors" (2): pass |
| 3.10 | Log accuracy and redaction: a question containing a name, address and policy number leaves none of them in the log; the claim journey logs each decision in order; refusals are logged with the reason code only | `security.test.ts`, `claims-db.test.ts`, `redaction.test.ts`, `deletion.test.ts`: pass |
| 3.11 | Failed operations: a failed save leaves nothing behind and is logged as failed; an AI error gives a clear message and saves nothing; an AI outage falls back to the rule-based reader | `claims-db.test.ts` (3 failure cases): pass |
| 3.12 | Demo Mode makes zero Anthropic requests (three independent tripwires) | `demo-mode.test.ts` (26), `demo-workflows.test.ts` (8), E2E: pass |

## 4. Tests performed and actual results

`npx vitest run` (full output: [`submission/evidence/test-results.txt`](../submission/evidence/test-results.txt)) and `npm run test:e2e`, on 15 October 2026:

| Suite | Tests | Result |
|---|---|---|
| Security (`security.test.ts`) | 17 | 17 passed |
| Tenant isolation (`rls.test.ts`) | 10 | 10 passed |
| Claim files: engine, database, evidence (`claims*.test.ts`) | 31 | 31 passed |
| Deletion and redaction | 4 | 4 passed |
| Demo Mode (zero AI calls) | 34 | 34 passed |
| Answers, review, extraction, PDF, citation verification | 113 | 113 passed |
| **All unit and integration tests** | **209** | **209 passed** |
| End-to-end browser walkthrough (upload → ask → review → claim file → evidence → leave, return, refresh → edit → delete → reset; zero AI requests) | 1 | passed |

Dependencies: `npm audit --omit=dev` reports **0 vulnerabilities** in what ships. Five advisories affect only a development lint tool (not deployed).

## 5. Issues found in this audit and fixed

| Finding | Risk | Fix |
|---|---|---|
| Users could update or delete their own `agent_runs` rows (and so cascade-delete steps) directly through the Supabase API | Audit trail could be erased; rate limits (counted from the log) could be reset, enabling cost abuse | Migration `0005`: no delete, column-limited update (status and completion only, while running), database-set timestamps |
| No daily ceiling on paid AI calls | One account, or scripted sign-ups, could run up large API costs | Per-user and site-wide 24-hour caps with silent fallback to the free engine |
| Instructions planted in a PDF reached the model (mitigated only by prompt wording and quote checks) | An attacker-supplied document could steer wording, or be quoted as "evidence" | Instruction-like sentences are neutralised when the PDF is read, before any engine or quote check sees them |
| Five API routes returned raw `Error.message` | Internal details could leak to the browser | One `errorResponse` helper for all 18 routes; a test enforces it |
| Refused requests weren't logged | No audit trail of denied access | `authorise_request` step with the reason code on refusals |
| Status changes on a saved claim asked "Are you sure?" | Needless friction (reversible action) | Removed: the button press is the authorisation |

## 6. Known limitations, regulatory uncertainties and outstanding risks

### Security (honest residual risk)

1. **Logs are written with the user's own credentials** (the service-role key is deliberately not deployed). A technically skilled user can **append** misleading entries to their own log, but can't alter or remove existing ones. *Planned:* move log writes to a server-only role.
2. **Users can edit their own rows directly via the Supabase API** (e.g. a saved claim's summary). This only affects their own data; Cabinet re-verifies citations when it creates or saves a summary, but not again when displaying it. *Planned:* restrict direct writes to verified columns.
3. **Email confirmation is off** (Supabase setting) for frictionless judging. Sign-up abuse is bounded by the site-wide AI cap. *Before launch:* enable email confirmation and CAPTCHA.
4. **Rate limits are per account**, not per IP. Distributed abuse is bounded only by the site-wide cap.
5. **The prompt-injection filter is heuristic.** The primary defences are structural (no tools, fixed output schema, verified quotes, user-scoped ids). Text that is phrased as ordinary policy wording isn't removed, but can only ever be quoted as what it is.
6. **The Content Security Policy is partial** (framing, base URI, forms, objects). *Planned:* nonce-based `script-src`.
7. **CSRF protection relies on SameSite=Lax session cookies and JSON-only endpoints**; there are no explicit CSRF tokens.
8. **Account deletion is by request**, not self-serve, and the contact address (`CONTACT_EMAIL`) isn't configured yet. *Required before launch.*
9. **`CABINET_MODE=switchable`** lets any user choose Live AI; production should use `live` (with caps) or `demo`.
10. **AI answers can still misread verified wording.** Mitigated by citations on every point, "can't confirm" when unsure, never promising outcomes (tested), and the terms page.

### Regulatory: needs specialist legal review before any real launch

Calling the product "guidance" doesn't by itself take it outside regulation. The fictional samples are UK-style, so the UK is assessed first.

- **Advising on contracts of insurance (UK, FCA perimeter).** Cabinet explains existing cover. Two features edge toward advice on the merits of a *particular* contract: Review's "Check with insurer" (e.g. asking about adding an endorsement) and "Compare cover" for possible double cover. Mitigations: it never recommends buying, cancelling or switching any product or provider, and it states facts with citations. *Uncertain:* whether a regulator would treat gap flags as a personal recommendation.
- **Claims assistance.** Helping a policyholder prepare a claim may fall within "assisting in the administration and performance of a contract of insurance" if done by way of business. Separately, UK claims-management regulation covers certain claim types. Mitigations: Cabinet only organises the user's own information and the policy's own wording; the user submits and decides; no representation, negotiation or contact with insurers. *Uncertain:* which permissions, if any, a commercial version would need.
- **Data protection (UK/EU GDPR).** Policies contain personal data, and claim descriptions may contain **health data (special category)**, which needs an Article 9 condition (likely explicit consent) and a DPIA. Also needed: processor agreements and transfer mechanisms for Anthropic (US), Vercel and Supabase; a retention schedule; a process for access and erasure requests. *Current state:* sign-up consent covers sending document text to Anthropic; the privacy policy (updated today) covers claims, health details and processing outside the user's country, and asks prototype users not to upload real documents.
- **AI transparency.** If offered in the EU, Article 50 of the AI Act requires users to be told they are interacting with an AI system. Cabinet tells users at sign-up and in the privacy policy, but the chat itself carries no AI label (a deliberate design choice). *Before an EU launch:* add an in-context notice. Cabinet doesn't price or underwrite, so the AI Act's high-risk insurance category shouldn't apply.
- **Mainland China (event location).** If offered to users in China: PIPL separate consent for sensitive personal information and for cross-border transfer (with a security assessment or standard contract), NFRA rules restricting internet insurance business (including claims services) to licensed institutions, and the availability of the Anthropic API there. *Uncertain; not assessed in depth.*
- **Consumer protection.** Answers must not mislead. Every coverage statement links to the exact wording, uncertainty is stated plainly, and no output can promise a claim will be paid (verified for claims, Q&A and the prepared answers).

## 7. Sanitised examples of genuine execution logs

Exported by `npm run evidence:logs`: a throwaway test account ran the main workflows against the real database (Demo Mode), its own log was exported, and the account was then deleted. The script also checks that the exported file contains none of the user's words, email or id. Full file: [`submission/evidence/execution-log-sample.json`](../submission/evidence/execution-log-sample.json) (13 runs, 50 steps). Ids are relabelled for readability.

**Answering a question** (`qa`, succeeded):
```json
{ "step": "retrieve_user_chunks",  "metadata": { "policy_id": "wallet", "retrieved_chunk_count": 15 } }
{ "step": "prepared_demo_answer",  "metadata": { "model": "demo-prepared-v1", "app_mode": "demo", "completed": true } }
{ "step": "verify_citations",      "metadata": { "assessment": "excluded", "citation_count": 5, "rejected_citation_count": 0, "condition_count": 1, "reply_word_count": 52 } }
{ "step": "save_conversation",     "metadata": { "thread_id": "thread-1" } }
```

**Preparing and saving a claim** (three `claim` runs: understand → check → confirmed save):
```json
{ "step": "understand_incident_rules", "metadata": { "incident_type": "theft", "app_mode": "demo" } }
{ "step": "choose_questions",          "metadata": { "policy_id": "policy-1", "policy_count": 3, "question_count": 2 } }
{ "step": "verify_claim_evidence",     "metadata": { "verdict": "conditional", "fact_count": 2, "deadline_count": 2, "contact_count": 0, "checklist_count": 3, "dropped_count": 0 } }
{ "step": "await_user_confirmation",   "metadata": { "completed": false } }
{ "step": "user_confirmed_summary",    "metadata": { "completed": true, "policy_id": "policy-1" } }
{ "step": "save_claim",                "metadata": { "claim_id": "claim-1" } }
```

**A refused request** (`action`, failed): the authorisation decision, with the reason only:
```json
{ "step": "authorise_request", "status": "failed", "metadata": { "denied_reason": "not_found", "error_code": "not_found" } }
```

**Reading an upload** (`ingest`): includes the prompt-injection filter's count.
```json
{ "step": "parse_pdf_pages", "metadata": { "document_id": "document-1", "page_count": 6, "instructions_removed": 0 } }
```

In Live mode, AI runs also log `ai_budget_check` (`{ "completed": true, "budget": "ok" }`) and the model step with `model`, `input_tokens` and `output_tokens`. Both are covered by the tests above.

## 8. Reproduce

```bash
npx vitest run                 # 209 tests (database tests need .env.local with Supabase test credentials)
npm run test:e2e               # browser walkthrough in Demo Mode, zero AI requests
npm run evidence:logs          # regenerate the sanitised log sample
npm audit --omit=dev           # shipped dependencies
```

Database migrations: `supabase/migrations/0001`–`0006` (`0004` claims, `0005` security hardening, `0006` claim-file evidence).
