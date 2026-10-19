-- Explicit table privileges for the Data API roles.
-- Newer Supabase projects do not auto-grant privileges on new public tables, so we grant
-- exactly what each role needs. Row Level Security (0001) still restricts WHICH rows.

grant usage on schema public to authenticated, service_role;

-- Signed-in users: full CRUD on their own data (RLS limits it to user_id = auth.uid()).
grant select, insert, update, delete on
  public.policies,
  public.documents,
  public.document_chunks,
  public.policy_extractions,
  public.qa_threads,
  public.qa_messages,
  public.insights,
  public.action_items,
  public.agent_runs
to authenticated;

-- Execution steps are append-only for users.
grant select, insert on public.agent_steps to authenticated;

-- Server-only role (tests, seed scripts). Never exposed to the browser.
grant all on all tables in schema public to service_role;

-- Anonymous visitors: nothing.
revoke all on all tables in schema public from anon;
