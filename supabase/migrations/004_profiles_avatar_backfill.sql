-- 004_profiles_avatar_backfill.sql
-- Adds avatar_url to profiles and backfills from existing Google auth users.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Auto-create profile rows for any auth.users that don't have one yet.
INSERT INTO profiles (id, full_name, avatar_url)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
  COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Update existing profile rows that are missing avatar_url.
UPDATE profiles p
SET avatar_url = COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
FROM auth.users u
WHERE p.id = u.id AND p.avatar_url IS NULL;
