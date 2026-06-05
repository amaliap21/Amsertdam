-- 013_social_network.sql
-- RealTrack community layer: tutor profiles with star ratings, a follow graph,
-- "study with me/us" tutor-led sessions, and a peer article publishing system.
--
-- Reputation loop: followers + star ratings + hosted sessions drive a tutor's
-- standing. Counters are denormalised onto `profiles` and kept in sync by
-- triggers so listing/ranking stays a single fast query.
--
-- Public-readable by design (it's a social network); writes are scoped to the
-- acting user. The app also filters in code via supabaseAdmin + getUserId(),
-- matching the existing route pattern.

-- ---------------------------------------------------------------------------
-- profiles: add public/social columns
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists bio text;
alter table profiles add column if not exists headline text;
alter table profiles add column if not exists is_tutor boolean default false;
alter table profiles add column if not exists tutor_subjects text[] default '{}';
alter table profiles add column if not exists follower_count integer default 0;
alter table profiles add column if not exists rating_avg numeric(3,2) default 0;   -- 0..5 stars
alter table profiles add column if not exists rating_count integer default 0;
alter table profiles add column if not exists sessions_hosted integer default 0;

-- ---------------------------------------------------------------------------
-- follows: directed follow graph
-- ---------------------------------------------------------------------------
create table if not exists follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_idx on follows(following_id);

-- ---------------------------------------------------------------------------
-- tutor_ratings: 1..5 stars left by a learner for a tutor (one per pair)
-- ---------------------------------------------------------------------------
create table if not exists tutor_ratings (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references auth.users(id) on delete cascade,
  rater_id uuid not null references auth.users(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz default now(),
  unique (tutor_id, rater_id),
  check (tutor_id <> rater_id)
);
create index if not exists tutor_ratings_tutor_idx on tutor_ratings(tutor_id);

-- ---------------------------------------------------------------------------
-- articles: peer-written, publishable study articles
-- ---------------------------------------------------------------------------
create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  course text,
  tags text[] default '{}',
  published boolean default true,
  like_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists articles_author_idx on articles(author_id);
create index if not exists articles_published_idx on articles(published, created_at desc);

create table if not exists article_likes (
  article_id uuid not null references articles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (article_id, user_id)
);

-- ---------------------------------------------------------------------------
-- study_sessions: tutor-led "study with me / us" rooms
-- ---------------------------------------------------------------------------
create table if not exists study_sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  course text,
  description text,
  scheduled_at timestamptz,
  meet_url text,
  capacity integer default 8,
  participant_count integer default 0,
  status text default 'open',  -- open | full | closed
  created_at timestamptz default now()
);
create index if not exists study_sessions_time_idx on study_sessions(scheduled_at);

create table if not exists session_participants (
  session_id uuid not null references study_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (session_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Counter triggers — keep denormalised counts honest
-- ---------------------------------------------------------------------------

-- follower_count on the followed profile
create or replace function bump_follower_count() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update profiles set follower_count = follower_count + 1 where id = new.following_id;
  elsif tg_op = 'DELETE' then
    update profiles set follower_count = greatest(0, follower_count - 1) where id = old.following_id;
  end if;
  return null;
end; $$ language plpgsql;
drop trigger if exists trg_follower_count on follows;
create trigger trg_follower_count after insert or delete on follows
  for each row execute function bump_follower_count();

-- rating_avg + rating_count on the rated tutor
create or replace function recompute_tutor_rating() returns trigger as $$
declare
  t uuid := coalesce(new.tutor_id, old.tutor_id);
begin
  update profiles p set
    rating_count = (select count(*) from tutor_ratings r where r.tutor_id = t),
    rating_avg   = coalesce((select round(avg(stars)::numeric, 2) from tutor_ratings r where r.tutor_id = t), 0)
  where p.id = t;
  return null;
end; $$ language plpgsql;
drop trigger if exists trg_tutor_rating on tutor_ratings;
create trigger trg_tutor_rating after insert or update or delete on tutor_ratings
  for each row execute function recompute_tutor_rating();

-- like_count on articles
create or replace function bump_article_likes() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update articles set like_count = like_count + 1 where id = new.article_id;
  elsif tg_op = 'DELETE' then
    update articles set like_count = greatest(0, like_count - 1) where id = old.article_id;
  end if;
  return null;
end; $$ language plpgsql;
drop trigger if exists trg_article_likes on article_likes;
create trigger trg_article_likes after insert or delete on article_likes
  for each row execute function bump_article_likes();

-- participant_count + status + host sessions_hosted on session join/leave
create or replace function bump_session_participants() returns trigger as $$
declare
  sid uuid := coalesce(new.session_id, old.session_id);
  cnt integer;
begin
  select count(*) into cnt from session_participants where session_id = sid;
  update study_sessions s set
    participant_count = cnt,
    status = case when cnt >= s.capacity then 'full' else 'open' end
  where s.id = sid;
  return null;
end; $$ language plpgsql;
drop trigger if exists trg_session_participants on session_participants;
create trigger trg_session_participants after insert or delete on session_participants
  for each row execute function bump_session_participants();

-- sessions_hosted on the host profile
create or replace function bump_sessions_hosted() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update profiles set sessions_hosted = sessions_hosted + 1 where id = new.host_id;
  elsif tg_op = 'DELETE' then
    update profiles set sessions_hosted = greatest(0, sessions_hosted - 1) where id = old.host_id;
  end if;
  return null;
end; $$ language plpgsql;
drop trigger if exists trg_sessions_hosted on study_sessions;
create trigger trg_sessions_hosted after insert or delete on study_sessions
  for each row execute function bump_sessions_hosted();

-- ---------------------------------------------------------------------------
-- RLS — public read for social content, owner-scoped writes
-- ---------------------------------------------------------------------------
alter table follows enable row level security;
alter table tutor_ratings enable row level security;
alter table articles enable row level security;
alter table article_likes enable row level security;
alter table study_sessions enable row level security;
alter table session_participants enable row level security;

-- follows
drop policy if exists "follows_read" on follows;
drop policy if exists "follows_write_own" on follows;
drop policy if exists "follows_delete_own" on follows;
create policy "follows_read" on follows for select to authenticated using (true);
create policy "follows_write_own" on follows for insert to authenticated with check (follower_id = auth.uid());
create policy "follows_delete_own" on follows for delete to authenticated using (follower_id = auth.uid());

-- tutor_ratings
drop policy if exists "ratings_read" on tutor_ratings;
drop policy if exists "ratings_write_own" on tutor_ratings;
drop policy if exists "ratings_update_own" on tutor_ratings;
drop policy if exists "ratings_delete_own" on tutor_ratings;
create policy "ratings_read" on tutor_ratings for select to authenticated using (true);
create policy "ratings_write_own" on tutor_ratings for insert to authenticated with check (rater_id = auth.uid());
create policy "ratings_update_own" on tutor_ratings for update to authenticated using (rater_id = auth.uid()) with check (rater_id = auth.uid());
create policy "ratings_delete_own" on tutor_ratings for delete to authenticated using (rater_id = auth.uid());

-- articles
drop policy if exists "articles_read" on articles;
drop policy if exists "articles_write_own" on articles;
drop policy if exists "articles_update_own" on articles;
drop policy if exists "articles_delete_own" on articles;
create policy "articles_read" on articles for select to authenticated using (published or author_id = auth.uid());
create policy "articles_write_own" on articles for insert to authenticated with check (author_id = auth.uid());
create policy "articles_update_own" on articles for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "articles_delete_own" on articles for delete to authenticated using (author_id = auth.uid());

-- article_likes
drop policy if exists "article_likes_read" on article_likes;
drop policy if exists "article_likes_write_own" on article_likes;
drop policy if exists "article_likes_delete_own" on article_likes;
create policy "article_likes_read" on article_likes for select to authenticated using (true);
create policy "article_likes_write_own" on article_likes for insert to authenticated with check (user_id = auth.uid());
create policy "article_likes_delete_own" on article_likes for delete to authenticated using (user_id = auth.uid());

-- study_sessions
drop policy if exists "sessions_read" on study_sessions;
drop policy if exists "sessions_write_own" on study_sessions;
drop policy if exists "sessions_update_own" on study_sessions;
drop policy if exists "sessions_delete_own" on study_sessions;
create policy "sessions_read" on study_sessions for select to authenticated using (true);
create policy "sessions_write_own" on study_sessions for insert to authenticated with check (host_id = auth.uid());
create policy "sessions_update_own" on study_sessions for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
create policy "sessions_delete_own" on study_sessions for delete to authenticated using (host_id = auth.uid());

-- session_participants
drop policy if exists "participants_read" on session_participants;
drop policy if exists "participants_write_own" on session_participants;
drop policy if exists "participants_delete_own" on session_participants;
create policy "participants_read" on session_participants for select to authenticated using (true);
create policy "participants_write_own" on session_participants for insert to authenticated with check (user_id = auth.uid());
create policy "participants_delete_own" on session_participants for delete to authenticated using (user_id = auth.uid());
