# Claude Code starter prompt — Insurance AI Agent

Copy the prompt below into **Claude Code** in a project folder. Add `PRODUCT_SPEC.md` to that folder first (or paste it into context). **Do not confuse Claude.ai chat with Claude Code**: use a development environment that can actually create files, execute tests, and deploy.

---

You are my senior full-stack engineer, product designer, QA lead and technical writer for the **2026 Shenzhen FinTechathon**. The attached `PRODUCT_SPEC.md` is the source of truth. We have until **20 October 2026, 23:59 Beijing time** to submit a **working** application and evidence.

## What we are building
An insurance dashboard for young / first-time policyholders that accepts policy PDFs, extracts structured policy facts with source page references, allows users to verify them, answers natural-language questions from the actual policy wording with **verified citations**, and identifies source-backed items to review (exclusions, renewals, potential duplicate cover). It can create a user-approved action item and log the actual execution steps. Use original fictional PDFs for demonstrations.

**Non-negotiable:** Do not implement policy comparison/quote purchasing, insurance recommendation brokerage, payments or live claims submission in the first version. These are roadmap only.

## How to work
1. Read the entire `PRODUCT_SPEC.md`. Restate the architecture, potential blockers and a pragmatic implementation plan **before coding**; flag any conflicting requirements.
2. Inspect the environment and repo. Choose the simplest compatible versions of Next.js/TypeScript/Tailwind/Supabase/Anthropic/PDF parser. Use server-only AI calls, Zod validation and Postgres full-text retrieval. If we can avoid extra infrastructure, do so.
3. Work through **complete vertical slices**, not disconnected UI mock-ups: auth/data isolation → upload/parser → AI extraction → human review/dashboard → cited Q&A → audit/action items → execution logging → security/test/deploy.
4. After each slice, run tests/typecheck/build, report actual results, and fix errors before proceeding. Never say something works without verifying it.
5. Implement all database migrations, RLS policies, private object storage, safe error handling, input size restrictions and `.env.example`. If Supabase/Anthropic credentials or deployment access are needed, explicitly request them and explain how to configure them. Never ask me to paste secrets into source files.
6. For policy answers, use only the authenticated user's retrieved policy clauses. Every significant claim must reference a real document and page. Verify returned citation chunk IDs and quoted excerpts against stored text. If evidence is unclear or missing, show “Cannot confirm from these documents”; **no hallucinated coverage conclusions**.
7. Build 3 original fictional sample PDFs, ground-truth cases and a seed script. Add tests for correct extraction, known exclusions, wrong/absent evidence, malformed PDFs, and **cross-user access denial**.
8. Log *actual* agent pipeline steps and approved user actions with redacted metadata. Build a readable demo trace and reproducible evidence export. Never invent logs, test results, partnerships or deployment success.
9. Build a visually polished and responsive UI, but do not spend time on animations or fake dashboard metrics. Every button must do something real.
10. Generate the competition docs alongside code: `README.md`, `docs/TECHNICAL_ARCHITECTURE.md`, `docs/AI_METHOD.md`, `docs/SECURITY_SELF_ASSESSMENT.md`, `submission/DEMO_SCRIPT.md`, `submission/PRESENTATION_OUTLINE.md`, test commands and `submission/evidence/` only with real outputs.

## Product-quality checkpoints
- PDF text remains linked to **actual page numbers**.
- User reviews extraction before it appears as verified fact in dashboard.
- A specific question about off-piste skiing finds the correct fictional clause and cites its page.
- Missing endorsement document leads to uncertainty, not a made-up yes/no.
- Findings are framed appropriately as potential problems, not confirmed policy defects.
- A user-approved action item persists across reloads.
- Two logged-in users can never read each other's content.
- Demo logs have traceable run IDs and **no personal policy text or secrets**.
- App genuinely works locally and builds cleanly; deployment claims must be validated.

## Your first response to me
Give me:
A. A concise summary of your proposed architecture and expected costs/dependencies.
B. A prioritised 7-day task plan and exact P0 acceptance tests.
C. Anything you need me to set up manually (accounts, API keys, Supabase, hosting) and which permissions you need.
D. The first vertical slice you'll implement right now.

Then start implementing that first slice and keep the repo in a runnable state. Ask one essential question at a time only if you are blocked; otherwise make sensible defaults and document them.
