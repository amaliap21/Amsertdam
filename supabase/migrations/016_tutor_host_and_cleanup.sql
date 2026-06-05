-- 016_tutor_host_and_cleanup.sql
--   * Profiles are PRIVATE by default (opt in to "Go global" to be discoverable).
--   * Remove the Articles feature entirely (sharing owned quizzes/decks/materials
--     with mutuals replaces it). Likes go away with it.
--   * Hosting sessions is tutor-only (enforced in the API).

-- Private by default
alter table profiles alter column is_public set default false;

-- Drop the Articles feature (table, likes, trigger, function)
drop trigger if exists trg_article_likes on article_likes;
drop function if exists bump_article_likes();
drop table if exists article_likes;
drop table if exists articles;
