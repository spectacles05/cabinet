-- Security hardening from the 15 Oct 2026 audit.
-- Paste into Supabase → SQL Editor → Run. Safe to run once.

-- ───────────── 1. Tamper-resistant execution log ─────────────
-- Before: users could update or delete their own runs (and, by cascade, their steps), which would
-- let someone erase their audit trail or reset the rate limits that are counted from it.
-- After: users can read their runs and start new ones; the app can mark a running run as finished
-- (status + completed_at only); nobody can delete runs, rewrite timestamps, or reopen a finished run.
drop policy if exists agent_runs_owner_all on public.agent_runs;
create policy agent_runs_owner_select on public.agent_runs
  for select to authenticated using (user_id = (select auth.uid()));
create policy agent_runs_owner_insert on public.agent_runs
  for insert to authenticated with check (user_id = (select auth.uid()) and status = 'running' and completed_at is null);
create policy agent_runs_owner_finish on public.agent_runs
  for update to authenticated using (user_id = (select auth.uid()) and status = 'running') with check (user_id = (select auth.uid()));

revoke update, delete on public.agent_runs from authenticated;
grant update (status, completed_at) on public.agent_runs to authenticated;

-- Start times come from the database clock, never from the client.
create or replace function public.agent_runs_stamp() returns trigger
language plpgsql as $$
begin
  new.started_at := now();
  new.completed_at := null;
  return new;
end $$;
drop trigger if exists agent_runs_stamp on public.agent_runs;
create trigger agent_runs_stamp before insert on public.agent_runs
  for each row execute function public.agent_runs_stamp();

-- Steps are already append-only (select + insert); their time also comes from the database.
create or replace function public.agent_steps_stamp() returns trigger
language plpgsql as $$
begin
  new.created_at := now();
  return new;
end $$;
drop trigger if exists agent_steps_stamp on public.agent_steps;
create trigger agent_steps_stamp before insert on public.agent_steps
  for each row execute function public.agent_steps_stamp();

-- ───────────── 2. Cost control: AI calls in the last 24 hours, across all users ─────────────
-- Every Claude call is logged as a step with token counts. This returns only a number (no rows,
-- no user ids), so the app can enforce a site-wide daily cap without the service-role key.
create index if not exists agent_steps_created_idx on public.agent_steps(created_at);

create or replace function public.ai_calls_last_day() returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::int from public.agent_steps
  where created_at > now() - interval '24 hours' and metadata ? 'input_tokens'
$$;
revoke all on function public.ai_calls_last_day() from public, anon;
grant execute on function public.ai_calls_last_day() to authenticated, service_role;
