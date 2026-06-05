-- 015_social_connections.sql
-- Instagram-style mutual connections, audience-scoped sessions, and
-- material sharing between mutuals.
--
--   * connections      — mutual requests (pending -> accepted = "mutuals")
--   * study_sessions.audience — 'global' (anyone) or 'mutuals' (host's mutuals)
--   * resource_shares  — share a quiz, flashcard deck, or material link with a mutual

-- ---------------------------------------------------------------------------
-- connections: directed request, becomes a mutual when accepted
-- ---------------------------------------------------------------------------
create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',  -- pending | accepted
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id),
  check (status in ('pending', 'accepted'))
);
create index if not exists connections_addressee_idx on connections(addressee_id, status);
create index if not exists connections_requester_idx on connections(requester_id, status);

-- Are two users mutuals? (accepted connection in either direction)
create or replace function are_mutuals(a uuid, b uuid) returns boolean as $$
  select exists (
    select 1 from connections c
    where c.status = 'accepted'
      and ((c.requester_id = a and c.addressee_id = b)
        or (c.requester_id = b and c.addressee_id = a))
  );
$$ language sql stable;

-- ---------------------------------------------------------------------------
-- sessions: audience scope
-- ---------------------------------------------------------------------------
alter table study_sessions add column if not exists audience text default 'global';
-- 'global' = anyone may join; 'mutuals' = only the host's mutuals may see/join.

-- ---------------------------------------------------------------------------
-- resource_shares: share a quiz / flashcard deck / material link with a mutual
-- ---------------------------------------------------------------------------
create table if not exists resource_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('quiz', 'flashcard', 'material')),
  ref_id uuid,            -- quizzes.id or flashcard_decks.id (null for material)
  title text not null,
  url text,               -- external link for 'material' (e.g. a PDF)
  note text,
  created_at timestamptz default now(),
  check (owner_id <> recipient_id)
);
create index if not exists resource_shares_recipient_idx on resource_shares(recipient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — clients go through service-role API, but lock down direct access too
-- ---------------------------------------------------------------------------
alter table connections enable row level security;
alter table resource_shares enable row level security;

drop policy if exists "connections_read" on connections;
drop policy if exists "connections_insert_own" on connections;
drop policy if exists "connections_update_addressee" on connections;
drop policy if exists "connections_delete_party" on connections;
create policy "connections_read" on connections for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "connections_insert_own" on connections for insert to authenticated
  with check (requester_id = auth.uid());
create policy "connections_update_addressee" on connections for update to authenticated
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());
create policy "connections_delete_party" on connections for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "shares_read" on resource_shares;
drop policy if exists "shares_insert_own" on resource_shares;
drop policy if exists "shares_delete_party" on resource_shares;
create policy "shares_read" on resource_shares for select to authenticated
  using (owner_id = auth.uid() or recipient_id = auth.uid());
create policy "shares_insert_own" on resource_shares for insert to authenticated
  with check (owner_id = auth.uid());
create policy "shares_delete_party" on resource_shares for delete to authenticated
  using (owner_id = auth.uid() or recipient_id = auth.uid());
