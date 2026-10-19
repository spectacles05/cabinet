-- Claims preparation (claims-guidance workflow).
-- A claim row is the user's own, user-confirmed preparation record: what happened, what their policy
-- says (verified quotes only), deadlines, verified contacts, and a checklist they tick off.
-- Cabinet never submits claims or contacts insurers. Nothing is stored until the user confirms.
-- Paste into Supabase → SQL Editor → Run. Safe to run once.

-- The execution log gains a "claim" workflow.
alter table public.agent_runs drop constraint if exists agent_runs_workflow_check;
alter table public.agent_runs add constraint agent_runs_workflow_check
  check (workflow in ('ingest','extract','qa','audit','action','claim'));

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 3 and 1000),
  incident_type text not null check (incident_type in ('theft','loss','accidental_damage','medical','travel_disruption','baggage','other')),
  incident_date date,
  answers_json jsonb not null default '{}'::jsonb,
  assessment_json jsonb not null,
  checklist_json jsonb not null default '[]'::jsonb,
  status text not null default 'preparing' check (status in ('preparing','submitted','closed')),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- The policy must belong to the same user (composite key), and its claims go when it is deleted.
  foreign key (policy_id, user_id) references public.policies(id, user_id) on delete cascade
);
create index claims_user_idx on public.claims(user_id, created_at desc);

create trigger claims_touch_updated_at before update on public.claims
  for each row execute function public.touch_updated_at();

-- Each user sees and changes only their own claims.
alter table public.claims enable row level security;
alter table public.claims force row level security;
create policy claims_owner_all on public.claims
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.claims to authenticated;
grant all on public.claims to service_role;
revoke all on public.claims from anon;
