-- 008_add_missing_policies.sql
-- Silences lint 0008 (rls_enabled_no_policy).
--
-- After 005 + 006 + 007, RLS is on for every public table, but the
-- remote DB ended up with no policies on several of them (migration 005
-- either wasn't applied or got rolled back). With RLS on and no
-- permissive policy, anon + authenticated already cannot read these
-- tables — and 007 revoked their direct grants anyway. The app keeps
-- working because service_role bypasses RLS. Adding explicit policies
-- here just documents intent and clears the lint.

-- ============ App tables: row-level ownership ============
-- (Idempotent re-creation of 005's policies — safe to run on a DB that
-- already has them.)

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

-- ============ Orphan tables: deny-all to clients ============
-- These tables exist in the DB but aren't created or used by any
-- application code (likely created from the Supabase dashboard
-- experimentally). We have no row-ownership column to scope policies
-- against, and the app doesn't need them, so the safe default is to
-- deny every client read/write. service_role still bypasses RLS for
-- any future migration or admin work.

drop policy if exists "ai_decisions_no_client_access" on ai_decisions;
create policy "ai_decisions_no_client_access" on ai_decisions for all to anon, authenticated using (false) with check (false);

drop policy if exists "grading_components_no_client_access" on grading_components;
create policy "grading_components_no_client_access" on grading_components for all to anon, authenticated using (false) with check (false);

drop policy if exists "enrollments_no_client_access" on enrollments;
create policy "enrollments_no_client_access" on enrollments for all to anon, authenticated using (false) with check (false);

drop policy if exists "grades_no_client_access" on grades;
create policy "grades_no_client_access" on grades for all to anon, authenticated using (false) with check (false);
