-- 010_ai_credits.sql
-- Durable credit balance for the paid Claude analysis tier.
--
-- Credits are real money the user paid for, so they live in Postgres
-- (not Redis, which can evict). Balance + an append-only ledger for audit.

create table if not exists ai_credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta int not null,                 -- +N on purchase, -1 on spend
  reason text not null,               -- 'purchase' | 'spend' | 'refund' | 'grant'
  ref text,                           -- e.g. Stripe session id, for idempotency
  created_at timestamptz not null default now()
);

create index if not exists ai_credit_ledger_user_idx
  on ai_credit_ledger (user_id, created_at desc);

-- Idempotency: never double-credit the same Stripe event.
create unique index if not exists ai_credit_ledger_ref_uniq
  on ai_credit_ledger (ref) where ref is not null;

alter table ai_credit_balances enable row level security;
alter table ai_credit_ledger   enable row level security;

drop policy if exists "ai_credit_balances_select_own" on ai_credit_balances;
create policy "ai_credit_balances_select_own" on ai_credit_balances
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "ai_credit_ledger_select_own" on ai_credit_ledger;
create policy "ai_credit_ledger_select_own" on ai_credit_ledger
  for select to authenticated using (user_id = auth.uid());

-- ── Atomic spend ──────────────────────────────────────────────────────
-- Deduct one credit and write a ledger row in a single transaction.
-- Returns the new balance, or -1 when the user has no credits. Runs as
-- SECURITY DEFINER so it works under the service-role client without RLS
-- getting in the way, and the row lock prevents double-spend races.
create or replace function spend_ai_credit(p_user_id uuid, p_amount int default 1)
returns int
language plpgsql
security definer
as $$
declare
  new_balance int;
  cost int := greatest(1, p_amount);
begin
  -- Deduct `cost` credits, but only if the user can afford the whole
  -- amount (no partial spends). Row lock prevents double-spend races.
  update ai_credit_balances
    set balance = balance - cost, updated_at = now()
    where user_id = p_user_id and balance >= cost
    returning balance into new_balance;

  if new_balance is null then
    return -1;  -- no row, or insufficient balance
  end if;

  insert into ai_credit_ledger (user_id, delta, reason)
    values (p_user_id, -cost, 'spend');

  return new_balance;
end;
$$;

-- ── Add credits (purchase / grant / refund) ───────────────────────────
-- Idempotent on p_ref: if a ledger row with that ref already exists, this
-- is a no-op (returns current balance). Used by the Stripe webhook so a
-- retried event can't double-credit.
create or replace function add_ai_credits(
  p_user_id uuid,
  p_amount int,
  p_reason text,
  p_ref text default null
)
returns int
language plpgsql
security definer
as $$
declare
  new_balance int;
begin
  if p_ref is not null and exists (
    select 1 from ai_credit_ledger where ref = p_ref
  ) then
    select balance into new_balance from ai_credit_balances where user_id = p_user_id;
    return coalesce(new_balance, 0);
  end if;

  insert into ai_credit_balances (user_id, balance)
    values (p_user_id, greatest(0, p_amount))
    on conflict (user_id)
    do update set balance = ai_credit_balances.balance + p_amount,
                  updated_at = now()
    returning balance into new_balance;

  insert into ai_credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, p_amount, p_reason, p_ref);

  return new_balance;
end;
$$;

-- Lock down direct client access (matches migration 007 pattern).
revoke all on table ai_credit_balances from anon, authenticated;
revoke all on table ai_credit_ledger   from anon, authenticated;
grant all on table ai_credit_balances to service_role;
grant all on table ai_credit_ledger   to service_role;
revoke all on function spend_ai_credit(uuid, int) from anon, authenticated;
revoke all on function add_ai_credits(uuid, int, text, text) from anon, authenticated;
