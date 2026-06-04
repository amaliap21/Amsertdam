-- 011_fix_spend_ai_credit.sql
--
-- Production drifted from migration 010: the live database only has the
-- legacy single-argument `spend_ai_credit(uuid)` function, but 010 defines
-- `spend_ai_credit(uuid, int default 1)`. The app was calling the two-arg
-- signature, which PostgREST could not resolve — every premium request
-- (quiz/flashcard generation, answer analysis, Study Companion chat) failed
-- with PGRST202 surfaced to the user as a 500 "Unknown error".
--
-- This migration reconciles the DB back to 010: it drops the stray single-arg
-- overload and (re)creates the canonical two-arg version. Idempotent — safe to
-- run more than once.
--
-- NOTE: the application code (src/lib/ai/credits.ts) deliberately calls
-- `spend_ai_credit` with ONLY p_user_id, which resolves correctly against
-- this two-arg-with-default function AND against the legacy single-arg one,
-- so the app keeps working whether or not this migration has been applied.

drop function if exists spend_ai_credit(uuid);

create or replace function spend_ai_credit(p_user_id uuid, p_amount int default 1)
returns int
language plpgsql
security definer
as $$
declare
  new_balance int;
  cost int := greatest(1, p_amount);
begin
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

revoke all on function spend_ai_credit(uuid, int) from anon, authenticated;
