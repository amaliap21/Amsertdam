-- 012_spend_ai_credits_multi.sql
--
-- Per-card/question billing: flashcard & quiz generation now charge 1 credit
-- for EVERY card/question produced, so the app must spend N credits in a
-- single atomic call.
--
-- We deliberately expose this under a DISTINCT name (`spend_ai_credits`,
-- plural) rather than reusing `spend_ai_credit` with a `p_amount` argument.
-- Adding an overload to the single-arg function is what drifted prod in
-- migration 010/011 and caused PostgREST (PGRST202) resolution failures. A
-- separate name has exactly one signature, so resolution is never ambiguous.
--
-- Semantics match spend_ai_credit: deduct the whole amount atomically (no
-- partial spends), write one ledger row, and return the new balance — or -1
-- when the user can't afford it. SECURITY DEFINER so the service-role client
-- bypasses RLS; the row lock prevents double-spend races. Idempotent.

create or replace function spend_ai_credits(p_user_id uuid, p_amount int)
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

revoke all on function spend_ai_credits(uuid, int) from anon, authenticated;
