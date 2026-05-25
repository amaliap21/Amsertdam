-- 005_enable_rls.sql
-- Defense-in-depth: enable Row-Level Security on every per-user table.
-- The app still uses supabaseAdmin (service-role) which bypasses RLS, but
-- if any future route forgets the .eq('user_id', ...) filter, Postgres will
-- reject the query for anon/authenticated callers.
--
-- All tables already have a user_id column from migration 003.
--
-- BEFORE applying this migration, clean up any rows that have a NULL
-- user_id (orphans from earlier buggy inserts), those rows are unreachable
-- by RLS and effectively invisible to every user. To keep them, first
-- assign them to a real user:
--   UPDATE courses SET user_id = '<uuid>' WHERE user_id IS NULL;
-- (repeat per table). To drop them:
--   DELETE FROM courses WHERE user_id IS NULL;
-- (repeat per table).

-- ============ Enable RLS ============

alter table courses         enable row level security;
alter table assessments     enable row level security;
alter table items           enable row level security;
alter table tasks           enable row level security;
alter table flashcard_decks enable row level security;
alter table quizzes         enable row level security;

-- ============ Policies: only the row's owner can see/modify it ============
-- Drop any older versions of the same policy names so this migration is
-- idempotent across re-runs.

drop policy if exists "courses_select_own" on courses;
drop policy if exists "courses_insert_own" on courses;
drop policy if exists "courses_update_own" on courses;
drop policy if exists "courses_delete_own" on courses;
create policy "courses_select_own" on courses for select to authenticated using (user_id = auth.uid());
create policy "courses_insert_own" on courses for insert to authenticated with check (user_id = auth.uid());
create policy "courses_update_own" on courses for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "courses_delete_own" on courses for delete to authenticated using (user_id = auth.uid());

drop policy if exists "assessments_select_own" on assessments;
drop policy if exists "assessments_insert_own" on assessments;
drop policy if exists "assessments_update_own" on assessments;
drop policy if exists "assessments_delete_own" on assessments;
create policy "assessments_select_own" on assessments for select to authenticated using (user_id = auth.uid());
create policy "assessments_insert_own" on assessments for insert to authenticated with check (user_id = auth.uid());
create policy "assessments_update_own" on assessments for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "assessments_delete_own" on assessments for delete to authenticated using (user_id = auth.uid());

drop policy if exists "items_select_own" on items;
drop policy if exists "items_insert_own" on items;
drop policy if exists "items_update_own" on items;
drop policy if exists "items_delete_own" on items;
create policy "items_select_own" on items for select to authenticated using (user_id = auth.uid());
create policy "items_insert_own" on items for insert to authenticated with check (user_id = auth.uid());
create policy "items_update_own" on items for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "items_delete_own" on items for delete to authenticated using (user_id = auth.uid());

drop policy if exists "tasks_select_own" on tasks;
drop policy if exists "tasks_insert_own" on tasks;
drop policy if exists "tasks_update_own" on tasks;
drop policy if exists "tasks_delete_own" on tasks;
create policy "tasks_select_own" on tasks for select to authenticated using (user_id = auth.uid());
create policy "tasks_insert_own" on tasks for insert to authenticated with check (user_id = auth.uid());
create policy "tasks_update_own" on tasks for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tasks_delete_own" on tasks for delete to authenticated using (user_id = auth.uid());

drop policy if exists "flashcard_decks_select_own" on flashcard_decks;
drop policy if exists "flashcard_decks_insert_own" on flashcard_decks;
drop policy if exists "flashcard_decks_update_own" on flashcard_decks;
drop policy if exists "flashcard_decks_delete_own" on flashcard_decks;
create policy "flashcard_decks_select_own" on flashcard_decks for select to authenticated using (user_id = auth.uid());
create policy "flashcard_decks_insert_own" on flashcard_decks for insert to authenticated with check (user_id = auth.uid());
create policy "flashcard_decks_update_own" on flashcard_decks for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "flashcard_decks_delete_own" on flashcard_decks for delete to authenticated using (user_id = auth.uid());

drop policy if exists "quizzes_select_own" on quizzes;
drop policy if exists "quizzes_insert_own" on quizzes;
drop policy if exists "quizzes_update_own" on quizzes;
drop policy if exists "quizzes_delete_own" on quizzes;
create policy "quizzes_select_own" on quizzes for select to authenticated using (user_id = auth.uid());
create policy "quizzes_insert_own" on quizzes for insert to authenticated with check (user_id = auth.uid());
create policy "quizzes_update_own" on quizzes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "quizzes_delete_own" on quizzes for delete to authenticated using (user_id = auth.uid());

-- ============ Helpful index for user-scoped lookups ============

create index if not exists courses_user_id_idx         on courses(user_id);
create index if not exists assessments_user_id_idx     on assessments(user_id);
create index if not exists items_user_id_idx           on items(user_id);
create index if not exists tasks_user_id_idx           on tasks(user_id);
create index if not exists flashcard_decks_user_id_idx on flashcard_decks(user_id);
create index if not exists quizzes_user_id_idx         on quizzes(user_id);
