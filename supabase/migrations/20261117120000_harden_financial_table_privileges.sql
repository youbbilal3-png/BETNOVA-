-- Restrict direct table privileges on financial records.
-- User-facing reads and controlled deposits remain available through RLS;
-- wallet mutations continue through SECURITY DEFINER RPCs with authorization checks.
revoke all privileges on table
  public.bets,
  public.bet_legs,
  public.wallet_accounts,
  public.wallet_ledger,
  public.deposit_requests,
  public.withdrawal_requests,
  public.payment_methods
from anon;

-- RLS does not protect against TRUNCATE, REFERENCES, or TRIGGER privileges.
revoke truncate, references, trigger, delete
on table
  public.bets,
  public.bet_legs,
  public.wallet_accounts,
  public.wallet_ledger,
  public.deposit_requests,
  public.withdrawal_requests,
  public.payment_methods
from authenticated;

-- Prevent direct mutation of wager and balance records. These are written
-- only by the validated atomic RPCs.
revoke insert, update
on table
  public.bets,
  public.bet_legs,
  public.wallet_accounts,
  public.wallet_ledger,
  public.withdrawal_requests
from authenticated;

-- Customers can submit deposit requests, but cannot later alter or remove them.
revoke update, delete on table public.deposit_requests from authenticated;

-- Admin UI updates payment-method settings directly under its admin-only RLS policy.
revoke insert, delete on table public.payment_methods from authenticated;
