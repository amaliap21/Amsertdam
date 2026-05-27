create table if not exists ai_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text,
  question text not null,
  user_answer text not null,
  verdict text not null,
  result jsonb not null,
  model_used text not null,
  cached boolean not null default false,
  tokens_prompt int,
  tokens_completion int,
  created_at timestamptz not null default now()
);

alter table ai_analyses enable row level security;

drop policy if exists "ai_analyses_select_own" on ai_analyses;
create policy "ai_analyses_select_own" on ai_analyses
  for select to authenticated using (user_id = auth.uid());

create index if not exists ai_analyses_user_created_idx
  on ai_analyses (user_id, created_at desc);

revoke all on table ai_analyses from anon, authenticated;
grant all on table ai_analyses to service_role;
