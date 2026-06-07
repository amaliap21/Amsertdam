-- 017_force_private.sql
-- Make every existing account private. Users opt back into discovery via
-- "Go global" in their profile. (New rows already default to private in 016.)

update profiles set is_public = false;
