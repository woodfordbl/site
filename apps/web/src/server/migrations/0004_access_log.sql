-- ReBAC step 2: shape-log visibility for the user_page_access projection, so
-- access changes stream to clients live (the dev shape host filters pages/
-- blocks shapes by user_page_access and serves the caller's own rows as the
-- `my_access` pseudo-shape).
--
-- Notes:
-- * The log rows use row_id = page_id and always carry the affected user_id
--   inside doc (deletes included, captured from OLD) — the shape host filters
--   entries to the requesting user via doc->>'userId'.
-- * rebac_recompute_access is replaced with a churn-free variant: 0003's
--   delete-then-reinsert emitted a delete+insert log pair for every
--   (user, page) in the recompute slice even when nothing changed, which
--   would make every permission change replay whole subtrees to every
--   workspace member. The variant deletes only rows that lost access and
--   updates only rows whose level/workspace actually changed, so shape_log
--   carries exactly the real access transitions.

-- ── user_page_access → shape_log ────────────────────────────────────────────

create or replace function log_access_change() returns trigger as $$
declare
  target user_page_access;
begin
  if tg_op = 'DELETE' then
    target := old;
  else
    target := new;
  end if;
  insert into shape_log (tbl, workspace_id, row_id, op, txid, doc)
  values (
    'user_page_access',
    target.workspace_id,
    target.page_id,
    lower(tg_op),
    (pg_current_xact_id()::xid::text)::bigint,
    case when tg_op = 'DELETE'
      then jsonb_build_object('userId', target.user_id, 'pageId', target.page_id)
      else jsonb_build_object(
        'userId', target.user_id, 'pageId', target.page_id, 'level', target.level)
    end
  );
  perform pg_notify('shape_log', target.workspace_id);
  return null;
end;
$$ language plpgsql;

create or replace trigger user_page_access_shape_log
  after insert or update or delete on user_page_access
  for each row execute function log_access_change();

-- ── churn-free recompute ────────────────────────────────────────────────────
-- Same contract as 0003's version (the (p_users × p_pages) slice of
-- user_page_access ends up equal to the derived effective levels), but only
-- genuine transitions touch rows — the conditional DO UPDATE keeps no-op
-- upserts from firing the log trigger above.

create or replace function rebac_recompute_access(p_users text[], p_pages text[])
returns void
language plpgsql as $$
begin
  if p_users is null or p_pages is null
     or cardinality(p_users) = 0 or cardinality(p_pages) = 0 then
    return;
  end if;
  delete from user_page_access a
  where a.user_id = any (p_users) and a.page_id = any (p_pages)
    and effective_level(a.user_id, a.page_id) is null;
  insert into user_page_access (user_id, page_id, workspace_id, level)
  select u.user_id, p.id, p.workspace_id, e.level
  from (select distinct unnest(p_users) as user_id) u
  cross join pages p
  cross join lateral (select effective_level(u.user_id, p.id) as level) e
  where p.id = any (p_pages) and e.level is not null
  on conflict (user_id, page_id) do update
    set workspace_id = excluded.workspace_id, level = excluded.level
    where (user_page_access.workspace_id, user_page_access.level)
          is distinct from (excluded.workspace_id, excluded.level);
end;
$$;
