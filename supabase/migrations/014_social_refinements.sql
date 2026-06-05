-- 014_social_refinements.sql
-- Iteration on the community layer:
--   * profiles.interests       — tags used by Study Buddy to match real peers
--   * profiles.is_public       — "go global" (matchable/visible) vs private
--   * profiles.recommend_count — how many learners recommend this tutor
--   * tutor_ratings.recommend  — a rating can also be a recommendation
--   * tutor_ratings.session_id — ties a rating to the session it came from
-- and extends the rating trigger to keep recommend_count in sync.

alter table profiles add column if not exists interests text[] default '{}';
alter table profiles add column if not exists is_public boolean default true;
alter table profiles add column if not exists recommend_count integer default 0;

alter table tutor_ratings add column if not exists recommend boolean default false;
alter table tutor_ratings add column if not exists session_id uuid references study_sessions(id) on delete set null;

-- Rating aggregate now also counts recommendations.
create or replace function recompute_tutor_rating() returns trigger as $$
declare
  t uuid := coalesce(new.tutor_id, old.tutor_id);
begin
  update profiles p set
    rating_count    = (select count(*) from tutor_ratings r where r.tutor_id = t),
    rating_avg      = coalesce((select round(avg(stars)::numeric, 2) from tutor_ratings r where r.tutor_id = t), 0),
    recommend_count = (select count(*) from tutor_ratings r where r.tutor_id = t and r.recommend)
  where p.id = t;
  return null;
end; $$ language plpgsql;
