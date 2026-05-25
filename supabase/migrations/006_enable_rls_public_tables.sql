-- 006_enable_rls_public_tables.sql
-- Enable Row-Level Security on public tables that are exposed through PostgREST.
-- These tables did not have RLS enabled yet, which triggered the Supabase linter.

alter table profiles enable row level security;
alter table enrollments enable row level security;
alter table grading_components enable row level security;
alter table ai_decisions enable row level security;