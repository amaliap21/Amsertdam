-- 021_quiz_basic_flag.sql
-- Marks quizzes built by the deterministic fallback (LLM was unavailable) so the
-- UI can show a "basic quiz, regenerate for AI quality" banner.
alter table quizzes add column if not exists generated_basic boolean default false;
