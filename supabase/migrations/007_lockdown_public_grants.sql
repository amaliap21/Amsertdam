-- 007_lockdown_public_grants.sql
-- Fix Supabase linter findings:
--   * 0013 rls_disabled_in_public       (profiles, enrollments, grading_components, ai_decisions)
--   * 0026 pg_graphql_anon_table_exposed
--   * 0027 pg_graphql_authenticated_table_exposed
--
-- The app accesses every table through the service_role key (supabaseAdmin),
-- which bypasses both GRANT and RLS. The browser/anon and authenticated
-- roles never query tables directly (only auth.signIn/Out), so we can
-- safely revoke their SELECT/INSERT/UPDATE/DELETE on all per-user tables.
-- This both:
--   1. Removes the tables from the GraphQL schema for anon + authenticated
--      callers (0026, 0027).
--   2. Closes any accidental direct-table-read paths if a future browser
--      client query slips in.
--
-- Run after 006_enable_rls_public_tables.sql.

-- ============ 1. Make sure RLS is on (0013) ============
-- 006 already enabled RLS on the four flagged tables, but repeat here so
-- this migration is self-contained and idempotent.

alter table if exists profiles            enable row level security;
alter table if exists enrollments         enable row level security;
alter table if exists grading_components  enable row level security;
alter table if exists ai_decisions        enable row level security;

-- Tables that already had RLS (from 005) — re-asserting is a no-op.
alter table if exists courses         enable row level security;
alter table if exists assessments     enable row level security;
alter table if exists items           enable row level security;
alter table if exists tasks           enable row level security;
alter table if exists flashcard_decks enable row level security;
alter table if exists quizzes         enable row level security;
alter table if exists grades          enable row level security;

-- ============ 2. Profiles policies ============
-- Profiles uniquely use the row's PRIMARY KEY (id) as the user reference,
-- not a separate user_id column. Service-role API routes still work
-- (service_role bypasses RLS), but should the browser client ever read
-- /api/profile via a future direct-table query, this keeps it scoped to
-- the signed-in user.

drop policy if exists "profiles_select_own" on profiles;
drop policy if exists "profiles_insert_own" on profiles;
drop policy if exists "profiles_update_own" on profiles;
drop policy if exists "profiles_delete_own" on profiles;
create policy "profiles_select_own" on profiles for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_delete_own" on profiles for delete to authenticated using (id = auth.uid());

-- ============ 3. Revoke direct-table privileges (0026, 0027) ============
-- All per-user tables. After this:
--   * GraphQL: tables disappear from anon and authenticated schemas.
--   * PostgREST: anon/authenticated can no longer SELECT/INSERT/UPDATE/DELETE.
--   * supabaseAdmin (service_role): unaffected, app continues to work.
--
-- REVOKE ALL is broader than the linter strictly requires (which only
-- mentions SELECT), but blocking writes too matches the intent: no
-- direct-from-browser table access at all.

revoke all on table ai_decisions       from anon, authenticated;
revoke all on table assessments        from anon, authenticated;
revoke all on table courses            from anon, authenticated;
revoke all on table enrollments        from anon, authenticated;
revoke all on table flashcard_decks    from anon, authenticated;
revoke all on table grades             from anon, authenticated;
revoke all on table grading_components from anon, authenticated;
revoke all on table items              from anon, authenticated;
revoke all on table profiles           from anon, authenticated;
revoke all on table quizzes            from anon, authenticated;
revoke all on table tasks              from anon, authenticated;

-- Belt-and-suspenders: keep service_role full access. Supabase grants it
-- by default, but re-asserting is harmless and documents the intent.

grant all on table ai_decisions       to service_role;
grant all on table assessments        to service_role;
grant all on table courses            to service_role;
grant all on table enrollments        to service_role;
grant all on table flashcard_decks    to service_role;
grant all on table grades             to service_role;
grant all on table grading_components to service_role;
grant all on table items              to service_role;
grant all on table profiles           to service_role;
grant all on table quizzes            to service_role;
grant all on table tasks              to service_role;
