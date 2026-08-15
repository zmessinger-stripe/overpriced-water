-- One open Checkout Session per (cart, scope).
--
-- `carts.stripe_checkout_session_id` can only remember one session, which is wrong for the very
-- flow this demo exists to show: a mixed cart renders two checkout buttons, and Stripe requires
-- one session per purchase type. With a single column, asking for the second scope's session
-- expired the first one, so a customer who clicked "Proceed to payment" and then "Begin the
-- standing order" was left holding a dead session.
--
-- The carts columns are kept — they still record the most recent session for display — but the
-- reuse/expire decision now reads from here.

create table if not exists cart_checkout_sessions (
  cart_id                    uuid not null references carts(id) on delete cascade,
  scope                      purchase_type not null,
  stripe_checkout_session_id text not null,
  items_hash                 text not null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  primary key (cart_id, scope)
);

alter table cart_checkout_sessions enable row level security;
