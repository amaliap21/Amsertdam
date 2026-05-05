-- 002_add_passing_target_persistence.sql
-- Adds persistent fields needed by Passing Target for schedules and nested course data.

alter table if exists courses
  add column if not exists credits integer default 0;

alter table if exists courses
  add column if not exists threshold numeric;

alter table if exists courses
  add column if not exists schedule_entries jsonb default '[]';

alter table if exists courses
  add column if not exists assessments jsonb default '[]';
