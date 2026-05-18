-- 003_add_user_id.sql
-- Adds user_id column to every table for per-user data isolation.
-- Filtering is done in application code (supabaseAdmin + .eq('user_id')).
--
-- After running this migration, assign your existing rows to your user:
--   UPDATE courses         SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;
--   UPDATE assessments     SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;
--   UPDATE items           SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;
--   UPDATE tasks           SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;
--   UPDATE flashcard_decks SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;
--   UPDATE quizzes         SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;

alter table courses         add column if not exists user_id uuid;
alter table assessments     add column if not exists user_id uuid;
alter table items           add column if not exists user_id uuid;
alter table tasks           add column if not exists user_id uuid;
alter table flashcard_decks add column if not exists user_id uuid;
alter table quizzes         add column if not exists user_id uuid;
