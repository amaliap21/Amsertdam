-- 004b_cleanup_orphan_rows.sql
--
-- One-shot cleanup of rows with NULL user_id, orphans created during the
-- window when API routes fell back to user_id-less inserts on a stale
-- session. Run this BEFORE 005_enable_rls.sql; otherwise these rows
-- become invisible (and so do their orphan FK references).
--
-- This file is NOT idempotent in the strict sense: after a clean run there
-- will be no NULL-user_id rows to delete on re-run, which is fine.
--
-- If you want to KEEP the data and assign it to your own user, comment
-- out the DELETEs below and run an UPDATE instead, e.g.:
--   UPDATE courses SET user_id = '<your-uuid>' WHERE user_id IS NULL;

delete from items           where user_id is null;
delete from assessments     where user_id is null;
delete from courses         where user_id is null;
delete from tasks           where user_id is null;
delete from flashcard_decks where user_id is null;
delete from quizzes         where user_id is null;
