-- 0003: link extractions to their execution run, and add full-text chunk retrieval for Q&A.

-- ───────────── extraction ↔ run link ─────────────
alter table public.policy_extractions add column if not exists run_id uuid;
alter table public.policy_extractions
  add constraint policy_extractions_run_fk
  foreign key (run_id, user_id) references public.agent_runs(id, user_id) on delete set null (run_id);
create index if not exists policy_extractions_doc_idx on public.policy_extractions(document_id, created_at desc);
create index if not exists policy_extractions_policy_idx on public.policy_extractions(policy_id);

-- ───────────── chunk retrieval ─────────────
-- Each element of query_terms is a word or phrase; words within a phrase are ANDed and the
-- phrases are ORed, so callers can pass synonyms/expansions. Input goes through plainto_tsquery,
-- so arbitrary user text is safe. SECURITY INVOKER: RLS limits results to the caller's own chunks.
create or replace function public.search_chunks(
  query_terms text[],
  policy_ids uuid[] default null,
  document_ids uuid[] default null,
  max_results int default 8
)
returns table (
  id uuid,
  document_id uuid,
  policy_id uuid,
  page_number int,
  chunk_index int,
  text text,
  rank real
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  q tsquery := null;
  part tsquery;
  term text;
begin
  if query_terms is null then
    return;
  end if;
  foreach term in array query_terms[1:30] loop
    part := plainto_tsquery('english', left(coalesce(term, ''), 200));
    if numnode(part) > 0 then
      q := case when q is null then part else q || part end;
    end if;
  end loop;
  if q is null then
    return;
  end if;

  return query
    select c.id, c.document_id, c.policy_id, c.page_number, c.chunk_index, c.text,
           ts_rank_cd(c.search, q) as rank
    from public.document_chunks c
    where c.search @@ q
      and (policy_ids is null or c.policy_id = any(policy_ids))
      and (document_ids is null or c.document_id = any(document_ids))
    order by rank desc, c.page_number, c.chunk_index
    limit greatest(1, least(coalesce(max_results, 8), 20));
end;
$$;

revoke all on function public.search_chunks(text[], uuid[], uuid[], int) from public, anon;
grant execute on function public.search_chunks(text[], uuid[], uuid[], int) to authenticated, service_role;
