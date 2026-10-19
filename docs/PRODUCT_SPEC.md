# Insurance AI Agent — Build-ready product specification

**Brand name:** Cabinet  
**Version:** 1.0 — 13 October 2026  
**Competition:** 2026 Shenzhen FinTechathon  
**Submission deadline:** 20 October 2026, 23:59 Beijing time (approximately 16:59 London BST)  
**Audience:** Claude Code, project team, judges

## 0. The decision

**Build one product really well:** an AI-powered insurance wallet that transforms uploaded policy PDFs into a clear dashboard, answers grounded questions, and flags specific items worth reviewing. **Do not build a comparison/quote marketplace for this submission.** That is the next-stage roadmap.

This is a **functional MVP**, not a Figma mock-up, slide-only proposal, or non-working AI chat wrapper. Use **synthetic insurance policies and demo accounts** for public demos, with the actual PDF-to-answer workflow working end to end.

## 1. Problem, audience, and positioning

**Problem:** Insurance contracts are long and difficult to navigate. People, especially younger and first-time policyholders, often do not understand limits, exclusions, deductibles/excesses, optional add-ons or renewal terms. Information is scattered across different insurers, emails and PDFs. The cost of misunderstanding becomes clear only when they need to make a claim.

**Primary user:** UK university student / young adult (18–30) with their first travel, contents, gadget, car, or rental-related policies. This is an initial audience and hypothesis, **not a proven research statistic**.

**Value proposition:** “Know what you’re covered for — without reading 60 pages of insurance small print.”

**Product pitch:** “An insurance wallet that turns confusing policies into a simple dashboard and gives evidence-backed answers in plain English.”

**Competitive context:** Products such as Rehuman have similar wallet/Q&A capabilities. **Do not claim the idea is unprecedented.** Differentiate by focusing the UX and onboarding on first-time insurance users, transparency of cited clauses, meaningful task completion and human-verifiable results. Validate the differentiation with interviews; don't fabricate customer traction.

## 2. Must-have functionality (P0)

### F1 — Import a policy PDF
- User signs in and uploads **PDF only** (up to 15 MB and a configurable page limit; start at 50 pages for reliability).
- Securely store the file in a **private** bucket; reject unsupported file types, encrypted PDFs the parser can't read, and files without extractable text.
- Parse text with **exact 1-indexed PDF page numbers**, preserving document name, page and extracted source text.
- Split text into searchable chunks and retain evidence pointers; don't rely on Claude's unverified memory.
- Show progress/error states; never silently treat upload as successful if extraction fails.

### F2 — Extract policy information with user verification
- Extract when expressly stated: policy type, insurer/provider, policy name/number (mask on UI), insured persons/items, effective/expiry dates, renewal date, premium with payment frequency/currency, compulsory/voluntary excess, limits, major inclusions, exclusions, optional extensions/add-ons.
- **Each extracted material field includes a source page and text excerpt**, or a clear “Not found / needs confirmation” status.
- Validate LLM JSON server-side with Zod; use enums only for supported policy types and `null` for missing fields.
- Present an editable review screen. **User must confirm/edit before fields become the authoritative dashboard record.** Store the original machine extraction separately from user edits.
- Never make up a renewal date, premium, limit or insurer.

### F3 — Insurance wallet / dashboard
- Overview of active policies, renewal dates, policy costs where known, and items needing attention.
- Each policy card displays: type, insurer, coverage period, premium/frequency, key limits/excess, selected exclusions, review status and links to relevant original pages.
- Aggregate premium only when periods and currencies can be normalised; show **estimate and assumptions** or omit if not possible.
- Policy detail page: plain-English summary, inclusions, exclusions, conditions, evidence references, source file and edit controls.
- Mobile and desktop responsive; empty states and loading/error states.

### F4 — AI policy Q&A with checkable citations
- User asks a natural-language question for one chosen policy or their whole wallet.
- Example: “Will my travel policy cover me if I ski off-piste without a guide?”
- Search the user's own document chunks and pass **only relevant retrieved passages** to the model, with policy/document/page/chunk IDs.
- Answer in plain English, stating **covered / excluded / conditional / insufficient evidence** as appropriate. Prefer “Based on the uploaded wording, it appears…” over definitive claim promises.
- Explain relevant conditions, limits and excesses. Every material assertion includes a clickable source reference (file, page, short quote).
- If policy schedules, add-on documents or insurer confirmations are missing, say so explicitly. If answer is unsupported or conflict exists, **say “I can't confirm from these documents”** and suggest exactly what to check.
- Validate server-side that cited source IDs belong to that signed-in user, and that quoted excerpts match the actual stored chunk (allow whitespace normalisation). Reject or regenerate unsupported citations.
- Treat PDFs as **untrusted user data**: ignore any text in documents that instructs the AI to change behaviour, reveal data or take actions.
- No live policy buying, purchasing, claim approvals, or legally definitive insurance advice.

### F5 — Evidence-backed insights + action items
- On user request, audit their uploaded policies and generate a small list of **specific, cited findings**:
  - explicit exclusions that may matter (e.g. winter sports excluded),
  - renewals due within 30 days (only where dates are established),
  - **potential** duplicated cover across two policies when there is positive evidence on both,
  - missing documents / information needed to confirm cover.
- **Important:** absence of a clause in uploaded text is **not proof of lack of cover**. Phrase this as “Unable to verify; check policy schedule/insurer,” not “You are uninsured.”
- Findings link to cited clauses and have severity/priority only if justified.
- User can choose “Create action item” to add a to-do in-app. No automatic emails, financial transfers, cancellations, notifications or purchases.
- Mark findings as reviewed/dismissed; do not regenerate the same warning endlessly.

### F6 — Real task execution evidence
- Build a clear, **actual application pipeline**: Upload → Parse → Extract → Validate → Review → Save → Retrieve/Answer → Audit → Create user-approved action.
- Each run emits an `agent_run` identifier and **safe** step events (timestamps, step name, result status, duration, file hash or file ID, citations counts) into a persistent event table.
- Offer a team-only/demo-only “View run history” that shows what happened and lets judges inspect a successful run and a safe failure/abstention case.
- Logs **must not include raw policy text, names, addresses, full policy numbers or free-text Q&A**. The visible demo can show appropriately synthetic content.

## 3. Should-have functionality (P1 — only after P0 works)
- Drag and drop upload, clearer onboarding and guided sample questions.
- PDF source viewer opening at cited page; if browser support is variable, show the source excerpt and a “View document” action with page number.
- Cross-policy question handling with document attribution.
- Basic premium/renewal trend if real extracted data supports it.
- UI polish / guided demo mode seeded with clearly labelled synthetic documents.

## 4. Explicitly out of scope (future roadmap)
- Live MoneySuperMarket-style quotes, comparisons, recommendations and switching.
- Direct insurer/broker APIs; payments; purchasing or binding policies.
- Automatically filing claims or communicating with an insurer.
- Bank/email/calendar integrations, push/email reminders, phone OCR/scanned PDFs, multi-language support, mobile native apps.
- Fully automated determination that a claim will be paid.
- Unsupported blanket claim that the system identifies all gaps across all policy wording.

## 5. Three core user journeys

**Journey A — First-time import:** Sign in → Upload a **synthetic** travel policy → See parser/extraction progress → Review extracted insurer, dates, premium, excess and key exclusion with page references → Confirm → See populated dashboard.

**Journey B — Ask a real question:** Open travel policy → Ask “Am I covered for off-piste skiing?” → App retrieves specific winter sports section → Responds with a conditional/excluded/uncertain answer consistent with the document → Shows a quoted clause and page number → User opens original source.

**Journey C — Audit and act:** Upload a second **synthetic** policy → Run coverage review → App flags a well-supported overlap or an explicit exclusion and nearing renewal → User inspects evidence → Clicks “Add to tasks” → App creates a persisted user-owned action item, recorded in an execution log.

## 6. Screens, prioritised

1. **Sign in / demo onboarding:** account and synthetic demo dataset option.
2. **Dashboard:** heading, upload CTA, policy summary, upcoming renewals, issues to review, policy cards.
3. **Upload + verify:** file chooser, parse status, extraction review form, source excerpts, confirmation button.
4. **Policy details:** core facts, source-labelled sections, documents, Q&A panel.
5. **Ask your policy:** chat thread with explicit selected policy scope, evidence cards and unknown-state UI.
6. **Review & tasks:** cited audit findings, mark reviewed, create user-approved task.
7. **Run history (demo/internal):** pipeline event trace, errors and timings without sensitive data.

**Visual direction:** trustworthy, premium but approachable; light/off-white background, restrained navy/teal accents, excellent typography, simple information hierarchy. Prioritise legibility over animations and giant charts. Accessible contrast and mobile responsive design; no non-functional controls or fake testimonials.

## 7. Proposed technical architecture

**One practical stack:**
- Next.js (App Router) + TypeScript + React + Tailwind CSS for web UI and API/server actions.
- Supabase Auth, PostgreSQL database, Row Level Security (RLS), private Supabase Storage for PDFs.
- Anthropic Claude API **server-side** for structured extraction, Q&A and assisted audit reasoning.
- A Node-compatible PDF parser that reliably exposes **page-by-page text** (e.g. `pdfjs-dist` server side; verify build/runtime compatibility before settling).
- Zod for strict data schemas and validations.
- PostgreSQL built-in full-text search for chunks (**start without embeddings or additional providers**), with query expansion/synonyms and a sensible fallback when the search can't find evidence.
- Vitest for unit/integration tests, Playwright for one complete end-to-end demo test.
- Deploy on Vercel or another hosting platform compatible with the PDF parser and configured request timeouts.

**Why this stack:** single codebase, short setup time, real permissions, easy sample deployment. If a dependency complicates deployment, replace it with the simplest compatible option rather than adding infrastructure.

**Data pipeline:**
```
Authenticated user → PDF upload → private storage
                         ↓
                  page-numbered parser
                         ↓
              chunks with source references
                         ↓
          Claude structured field extraction
                         ↓
              Zod validate + user review
                         ↓
           Supabase policy record + dashboard
                         ↓
            [Q&A or audit triggered by user]
                         ↓
            tenant-filtered chunk retrieval
                         ↓
            Claude constrained reasoning
                         ↓
       citation verification + safety checks
                         ↓
          explanation + cited finding/action
                         ↓
                   safe run logs
```

**Key data tables (minimal viable schema):**
- `policies`: id, `user_id`, type, insurer, display_name, dates, premium_amount, premium_frequency, currency, excess_amount, status, confirmed_at.
- `documents`: id, user_id, policy_id, file_name, private_storage_path, SHA-256, page_count, processing_status, created_at.
- `document_chunks`: id, user_id, policy_id, document_id, page_number, chunk_index, text, searchable text (Postgres FTS).
- `policy_extractions`: id, user_id, document_id, `raw_extraction_json`, `reviewed_fields_json`, `field_sources_json`, extraction_version.
- `qa_threads` and `qa_messages`: user_id, policy scope, role, message text, validated citations JSON (private).
- `insights`: id, user_id, type, title, explanation, evidence JSON, confidence/status, generated_at.
- `action_items`: id, user_id, insight_id, title, due_date, completed_at.
- `agent_runs`: id, user_id, workflow, status, started_at, completed_at.
- `agent_steps`: id, run_id, user_id, step_name, success/error status, duration_ms, **redacted** metadata, created_at.

All user-owned tables and storage paths **must enforce tenant isolation**. All server reads/writes must derive owner identity from the authenticated session; never trust `user_id` in a browser payload. Consider owner IDs in all linked records, constrained by application logic and database policies.

## 8. AI algorithm and safety requirements

**Structured extraction:** Feed page-tagged text excerpts into Claude. Return a typed JSON object containing values + evidence for each meaningful field. If documents are long, extract relevant page ranges in stages instead of truncating without warning. No invented fields. Preserve contradictory sources for user review (e.g. policy schedule vs generic booklet).

**Q&A:** Restrict retrieval to the signed-in user's policy document chunks. Expand query terms where appropriate; retrieve top candidate chunks; instruct Claude to use only the supplied evidence, explicitly acknowledge uncertainty and return structured `{assessment, explanation, conditions, citations, further_checks}`. The UI only displays verifiable citations and must never silently substitute one policy for another. Escalate if ambiguous. A response without adequate evidence should abstain, not guess.

**Audit:** Deterministic checks for known dates, plus Claude identification of material conditions from cited text. Cross-policy duplication alerts are **possible overlaps**, never proven waste without checking details. `insights` must point to actual policy/document/page evidence. Store model version and schema version for evaluation.

**Boundaries:** This is policy information and assistance, **not an authorised insurance broker or a guarantee of claims outcomes**. Display unobtrusive, clear disclosure at decision moments; advise checking official policy schedule/provider for binding decisions. Preserve insurer wording; do not automatically act on behalf of the customer.

## 9. Security & privacy design

**Critical controls:**
- Authentication required for all real user data; scoped RLS tests for all tables and private storage paths.
- Private object storage, short-lived signed URLs where needed; no public PDFs.
- API key and service-role credentials only in server secrets; **never** exposed with `NEXT_PUBLIC_` or sent to browser.
- Encrypted transport (HTTPS) and encrypted at rest via provider; limit retention to necessary information.
- 15 MB, allowed MIME/extension, page count and parser error limits; defend against malformed PDFs and decompression/processing abuse.
- Request throttling, token/cost caps, bounded document ingestion and clear error handling.
- Model prompt injection defense: documents are untrusted data, not commands; no model-initiated external actions; schema validation and source checks.
- Explicit consent notice that uploaded policy text is processed by an AI provider; avoid real PII in competition demos.
- Users can delete policies and files, including associated extracted text, embeddings if any, chats, findings and actions.
- Audit log redaction: no customer names, addresses, exact policy numbers, policy page text or secret tokens in competition execution logs.
- Avoid fabricating compliance certifications; document residual risks honestly.

**Permission levels:**
1. Unauthenticated: landing page only; no document access.
2. Authenticated customer: their own PDFs, dashboard, Q&A and approved task actions.
3. Demo operator/admin (if implemented): synthetic seeded data and **redacted** aggregate run diagnostics only; cannot inspect other customers' uploaded files.
4. Server-only process: narrow access needed to parse user-specific PDFs, call AI and write records after authorisation; service-role usage carefully confined if required.

**Known risks to document:** Wrong/ambiguous coverage interpretation, missing endorsements or schedule pages, OCR absence, malicious policy content, prompt injection, data exposure via misconfigured RLS, external model data handling, latency/cost spikes, and insurer-policy changes. State each mitigation and what remains unresolved in `docs/SECURITY_SELF_ASSESSMENT.md`.

## 10. Demo dataset and evidence design

Create **three original synthetic PDF policy documents**, visibly marked **“FICTIONAL SAMPLE — FOR COMPETITION TESTING ONLY”**, with realistic structure, numbered pages and consistent facts (do not copy proprietary complete real insurer PDFs). Example fixtures:

- **Travel (sample):** base policy excludes winter sports unless endorsement purchased; explicit clause on off-piste skiing; renewal upcoming.
- **Contents (sample):** laptop cover at home, with optional personal possessions away-from-home extension clearly absent or present in its specific schedule.
- **Gadget / bank package (sample):** explicitly overlapping laptop cover terms so the system can flag a **possible** duplicate with sourced evidence.

Create a **ground-truth file** (JSON) with exact answers, page numbers and expected abstentions. Build two or more deliberately uncertain cases (e.g. missing schedule/endorsement, ambiguous wording). Every live demo must use the same real parser, storage, extraction and Q&A pipeline used by the application — no hardcoded response text masquerading as model reasoning.

**Judging demo scenario:**
1. Upload sample travel PDF; show the execution run trace.
2. Confirm automatically extracted facts; show the policy dashboard.
3. Ask off-piste skiing question; show source page and why coverage may be excluded/conditional.
4. Run portfolio review; see renewal and evidenced possible overlap with sample contents/gadget cover.
5. Approve an action item; show it persist and appear in execution logs.
6. Ask a deliberately unsupported question; show that the system declines to invent an answer.

## 11. Definition of done (acceptance criteria)

- [ ] An unauthenticated browser cannot access any user policy or PDF.
- [ ] Two different test users cannot access each other's rows, files, chat or run history (automated negative tests).
- [ ] At least 3 synthetic sample PDFs parse with correct page numbers; malformed/scanned PDFs produce clear errors.
- [ ] Extraction returns correct required fields or explicit unknown values; each material field has evidence or an unknown marker.
- [ ] Review/confirmation edits persist into the dashboard.
- [ ] Five benchmark Q&A questions are answered correctly from source; page citations validate against stored content.
- [ ] Two intentionally unanswerable questions receive explicit uncertainty/abstention.
- [ ] At least two real source-backed insights can be generated, reviewed and converted to a persisted task.
- [ ] An execution log proves the actual upload/extraction/Q&A/audit/action workflow; logs are redacted.
- [ ] All deployed UI controls work; basic keyboard use and mobile responsive layout pass sanity checks.
- [ ] Repo includes `.env.example`, README, tests, instructions for demo seed, architecture, security report and evidence export.
- [ ] No fabricated live quotes, insurer partnerships, sales claims, test pass results, user counts or deployments.

## 12. Submission packaging

> **Checklist supplied by the competition brief.** Confirm current portal/file conventions separately; do not assume these exact directory names are mandated.

| Required submission | Project artifact |
|---|---|
| 1. Technical documentation — architecture, core algorithm, security | `docs/TECHNICAL_ARCHITECTURE.md`, architecture diagram, `docs/AI_METHOD.md` |
| 2. Presentation deck — final presentation ≤10 min | `submission/PRESENTATION_OUTLINE.md` + exported PPT/PDF deck (team completes and validates) |
| 3. Demo video — optional ≤5 min | `submission/DEMO_SCRIPT.md`, optional/encouraged actual 3–4 min MP4 |
| 4. Source code — README, GitHub, deploy instructions, tests | Complete repo, `README.md`, `.env.example`, tests, GitHub link, deployment URL (when deployed) |
| 5. Security self-assessment — permission tiers, known risks | `docs/SECURITY_SELF_ASSESSMENT.md` with implemented controls and remaining risks |
| 6. Execution evidence — non-on-chain sandbox logs + demo video | `submission/evidence/` with redacted real test run logs and a **real demo recording** |

The requirements call #3 optional but #6 asks for non-on-chain **demo video** as evidence: **make one**. Do not claim an evidence file exists until generated and verified.

### Suggested presentation structure (≤10 min)
1. Hook: real understanding problem (0:45).
2. Audience and why today's policy PDFs fail (1:00).
3. Product and workflow (1:00).
4. Real live or recorded demonstration (3:00).
5. Architecture, citation checking and agent task logs (1:30).
6. Security / regulatory humility / limitations (1:00).
7. Roadmap (comparison later), validation plan and close (1:00).

## 13. Deadline plan (seven-day sprint)

- **13 Oct:** Freeze scope, create repo, choose stack, author three synthetic PDFs and ground-truth tests.
- **14 Oct:** Supabase schema, Auth, private Storage, RLS, PDF page extraction/chunking.
- **15 Oct:** Claude structured extraction + review/confirmation + populated dashboard.
- **16 Oct:** Q&A with retrieval, exact citations and honest abstention.
- **17 Oct:** Audit findings, to-dos, real execution traces and initial end-to-end tests.
- **18 Oct:** Security hardening, negative tests, deployment, polish and demo rehearsal.
- **19 Oct:** Documentation, presentation, filmed evidence, freeze and contingency.
- **20 Oct:** Final validation and submission **well before 23:59 Beijing**. Set an internal buffer of several hours; do not first deploy on deadline day.

If behind, cut optional fancy UX before cutting authentication, source citations, user confirmation, one genuine end-to-end workflow or security evidence.

## 14. Instructions for Claude Code as engineering collaborator

- Before writing major features, inspect the repo and create an actionable task plan tied to this document.
- Build incrementally; run typecheck, lint and focused tests after each vertical slice.
- Prioritise P0 functionality and correct behaviour over framework novelty.
- Do not present fake data as extracted user data or mock calls as production integrations.
- Put placeholder values, consent wording and regulated-product boundary clearly in the README.
- If unable to implement something reliably, explicitly say so, document it as known limitation, and propose a simpler working alternative.
- Never check secrets, personal documents, or real customer data into Git.
- Produce actual artifacts and logs only after running the functionality/tests, with accurate pass/fail results.
