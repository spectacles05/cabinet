-- Cabinet initial schema.
-- Apply by pasting into Supabase → SQL Editor → Run. Safe to re-run is NOT guaranteed; run once.
--
-- Tenant isolation model:
--   * Every user-owned table has user_id → auth.users, RLS enabled, and owner-only policies.
--   * Child rows reference parents by (id, user_id) composite keys, so a row can never link to
--     another user's parent even if application code has a bug.
--   * PDFs live in a PRIVATE bucket under "<user_id>/<document_id>.pdf"; storage policies only
--     allow access to the caller's own top-level folder.

create extension if not exists pgcrypto;

-- ───────────────────────── policies ─────────────────────────
create table public.policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_type text not null check (policy_type in ('travel','contents','gadget','car','renters','health','life','pet','other')),
  insurer text,
  display_name text,
  policy_number_masked text,
  start_date date,
  end_date date,
  renewal_date date,
  premium_amount numeric(12,2) check (premium_amount is null or premium_amount >= 0),
  premium_frequency text check (premium_frequency in ('annual','monthly','quarterly','one_off','included','unknown')),
  currency char(3),
  excess_amount numeric(12,2) check (excess_amount is null or excess_amount >= 0),
  status text not null default 'confirmed' check (status in ('confirmed','archived')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

-- ───────────────────────── documents ─────────────────────────
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid,
  file_name text not null check (char_length(file_name) between 1 and 255),
  storage_path text not null unique,
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer check (size_bytes > 0),
  page_count integer check (page_count > 0),
  processing_status text not null default 'awaiting_upload'
    check (processing_status in ('awaiting_upload','processing','parsed','extracting','extracted','failed')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (policy_id, user_id) references public.policies(id, user_id) on delete set null (policy_id),
  -- the storage path must sit inside the owner's folder
  check (storage_path like user_id::text || '/%')
);
create index documents_user_idx on public.documents(user_id, created_at desc);

-- ───────────────────────── document_chunks ─────────────────────────
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null,
  policy_id uuid,
  page_number integer not null check (page_number >= 1),
  chunk_index integer not null check (chunk_index >= 0),
  text text not null,
  search tsvector generated always as (to_tsvector('english', text)) stored,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index),
  foreign key (document_id, user_id) references public.documents(id, user_id) on delete cascade,
  foreign key (policy_id, user_id) references public.policies(id, user_id) on delete set null (policy_id)
);
create index document_chunks_search_idx on public.document_chunks using gin (search);
create index document_chunks_doc_idx on public.document_chunks(document_id, page_number);
create index document_chunks_user_idx on public.document_chunks(user_id);

-- ───────────────────────── policy_extractions ─────────────────────────
create table public.policy_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null,
  policy_id uuid,
  raw_extraction_json jsonb not null,          -- untouched, schema-validated model output
  reviewed_fields_json jsonb,                  -- user-confirmed values (authoritative once confirmed)
  field_sources_json jsonb,                    -- page + excerpt per field
  extraction_version text not null,            -- schema/prompt version
  model text not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (document_id, user_id) references public.documents(id, user_id) on delete cascade,
  foreign key (policy_id, user_id) references public.policies(id, user_id) on delete set null (policy_id)
);

-- ───────────────────────── Q&A ─────────────────────────
create table public.qa_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid,                               -- null = whole wallet
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (policy_id, user_id) references public.policies(id, user_id) on delete cascade
);

create table public.qa_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) <= 8000),
  assessment text check (assessment in ('covered','excluded','conditional','insufficient_evidence')),
  answer_json jsonb,
  citations_json jsonb,                         -- only server-verified citations
  created_at timestamptz not null default now(),
  foreign key (thread_id, user_id) references public.qa_threads(id, user_id) on delete cascade
);

-- ───────────────────────── insights & actions ─────────────────────────
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insight_type text not null check (insight_type in ('exclusion','renewal_due','possible_overlap','missing_information')),
  fingerprint text not null,                    -- stable key so the same finding isn't regenerated endlessly
  title text not null,
  explanation text not null,
  evidence_json jsonb not null,
  priority text check (priority in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  model text,
  schema_version text,
  generated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, fingerprint)
);

create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insight_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (insight_id, user_id) references public.insights(id, user_id) on delete set null (insight_id)
);

-- ───────────────────────── execution log ─────────────────────────
-- Redacted by design: no policy text, names, addresses, policy numbers or Q&A text.
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow text not null check (workflow in ('ingest','extract','qa','audit','action')),
  status text not null default 'running' check (status in ('running','succeeded','failed','abstained')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, user_id)
);
create index agent_runs_user_idx on public.agent_runs(user_id, started_at desc);

create table public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_name text not null,
  status text not null check (status in ('succeeded','failed','skipped','abstained')),
  duration_ms integer not null check (duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (run_id, user_id) references public.agent_runs(id, user_id) on delete cascade
);
create index agent_steps_run_idx on public.agent_steps(run_id, created_at);

-- ───────────────────────── updated_at triggers ─────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger policies_touch before update on public.policies
  for each row execute function public.touch_updated_at();
create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();

-- ───────────────────────── Row Level Security ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'policies','documents','document_chunks','policy_extractions','qa_threads','qa_messages',
    'insights','action_items','agent_runs','agent_steps'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_owner_all', t);
  end loop;
end $$;

-- Execution logs are append-only for users: no editing or deleting individual steps.
drop policy agent_steps_owner_all on public.agent_steps;
create policy agent_steps_owner_select on public.agent_steps
  for select to authenticated using (user_id = (select auth.uid()));
create policy agent_steps_owner_insert on public.agent_steps
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;

-- ───────────────────────── Private storage ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('policy-pdfs', 'policy-pdfs', false, 15728640, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "policy_pdfs_owner_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'policy-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "policy_pdfs_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'policy-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "policy_pdfs_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'policy-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
