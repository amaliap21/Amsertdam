-- 018_profile_country.sql
-- Country of origin, shown on the profile and the tutor card.
alter table profiles add column if not exists country text;
