-- Claim Files: evidence kept with each claim, and Ask conversations scoped to a claim.
-- Paste into Supabase → SQL Editor → Run. Safe to run once.

-- ───────────── Private evidence storage ─────────────
-- Receipts, photos, police reports and letters. Private; each user only reaches their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('claim-evidence', 'claim-evidence', false, 15728640,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "claim_evidence_owner_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'claim-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "claim_evidence_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'claim-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "claim_evidence_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'claim-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ───────────── Evidence records ─────────────
create table public.claim_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_id uuid not null,
  file_name text not null check (char_length(file_name) between 1 and 200),
  content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 15728640),
  kind text not null default 'other' check (kind in ('receipt','photo','police_report','correspondence','other')),
  checklist_item_id text check (checklist_item_id is null or char_length(checklist_item_id) <= 10),
  storage_path text not null,
  status text not null default 'uploading' check (status in ('uploading','ready')),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  -- Evidence belongs to one of the same user's claims, and goes when the claim is deleted.
  foreign key (claim_id, user_id) references public.claims(id, user_id) on delete cascade
);
create index claim_evidence_claim_idx on public.claim_evidence(claim_id, created_at);

alter table public.claim_evidence enable row level security;
alter table public.claim_evidence force row level security;
create policy claim_evidence_owner_all on public.claim_evidence
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.claim_evidence to authenticated;
grant all on public.claim_evidence to service_role;
revoke all on public.claim_evidence from anon;

-- ───────────── Ask about a claim ─────────────
-- A claim's questions live in their own conversation (null = a policy or whole-wallet conversation).
alter table public.qa_threads add column if not exists claim_id uuid;
alter table public.qa_threads drop constraint if exists qa_threads_claim_fk;
alter table public.qa_threads add constraint qa_threads_claim_fk
  foreign key (claim_id, user_id) references public.claims(id, user_id) on delete cascade;
