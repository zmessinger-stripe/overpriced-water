-- Overpriced Water Co. — core commerce schema.
-- Applied with `npm run migrate` (psql). Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- catalog

create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  tagline     text not null,
  hero_copy   text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

do $$ begin
  create type product_kind as enum ('single', 'bundle');
exception when duplicate_object then null; end $$;

create table if not exists products (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  name                   text not null,
  subtitle               text not null,
  description            text not null,
  story                  text not null,
  kind                   product_kind not null default 'single',
  category_id            uuid not null references categories(id) on delete restrict,
  -- Deadpan spec-sheet fields. Rendered as a clinical table on the PDP.
  hydration_index        numeric(4,1) not null default 9.9,
  ph                     numeric(3,2) not null default 7.41,
  source                 text not null,
  tasting_notes          text[] not null default '{}',
  images                 jsonb  not null default '[]',
  badges                 text[] not null default '{}',
  subscription_eligible  boolean not null default true,
  active                 boolean not null default true,
  sort_order             int not null default 0,
  created_at             timestamptz not null default now()
);

create index if not exists products_category_idx on products(category_id) where active;

create table if not exists product_variants (
  id                          uuid primary key default gen_random_uuid(),
  product_id                  uuid not null references products(id) on delete cascade,
  sku                         text not null unique,
  name                        text not null,
  size_ml                     int  not null,
  price_cents                 int  not null check (price_cents > 0),
  compare_at_cents            int,
  stripe_price_id             text,
  stripe_subscription_price_id text,
  inventory                   int  not null default 999,
  is_default                  boolean not null default false,
  sort_order                  int not null default 0
);

create index if not exists product_variants_product_idx on product_variants(product_id);

-- A bundle is a product whose contents are other products' variants.
create table if not exists bundle_items (
  bundle_product_id uuid not null references products(id) on delete cascade,
  variant_id        uuid not null references product_variants(id) on delete restrict,
  quantity          int  not null check (quantity > 0),
  primary key (bundle_product_id, variant_id)
);

-- ---------------------------------------------------------------- carts

do $$ begin
  create type purchase_type as enum ('one_time', 'subscription');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cart_status as enum ('open', 'converted', 'abandoned');
exception when duplicate_object then null; end $$;

create table if not exists carts (
  id                         uuid primary key default gen_random_uuid(),
  status                     cart_status not null default 'open',
  currency                   text not null default 'usd',
  email                      text,
  -- Hash of the line items; lets us reuse an open Checkout Session when nothing changed.
  items_hash                 text,
  stripe_checkout_session_id text,
  metadata                   jsonb not null default '{}',   -- { source: 'web' | 'webmcp' | 'mcp' }
  expires_at                 timestamptz not null default now() + interval '30 days',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create table if not exists cart_items (
  id                    uuid primary key default gen_random_uuid(),
  cart_id               uuid not null references carts(id) on delete cascade,
  variant_id            uuid not null references product_variants(id) on delete restrict,
  quantity              int  not null check (quantity > 0 and quantity <= 99),
  purchase_kind         purchase_type not null default 'one_time',
  subscription_interval text,
  unit_price_cents      int  not null,      -- snapshot at time of add
  created_at            timestamptz not null default now(),
  unique (cart_id, variant_id, purchase_kind)
);

create index if not exists cart_items_cart_idx on cart_items(cart_id);

-- ---------------------------------------------------------------- orders

do $$ begin
  create type order_status as enum ('pending', 'paid', 'fulfilled', 'refunded');
exception when duplicate_object then null; end $$;

create table if not exists orders (
  id                         uuid primary key default gen_random_uuid(),
  order_number               text not null unique,
  cart_id                    uuid references carts(id) on delete set null,
  -- Unique so webhook redelivery and the synchronous fallback cannot double-create.
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id   text,
  stripe_subscription_id     text,
  email                      text,
  customer_name              text,
  status                     order_status not null default 'pending',
  currency                   text not null default 'usd',
  subtotal_cents             int not null default 0,
  discount_cents             int not null default 0,
  shipping_cents             int not null default 0,
  tax_cents                  int not null default 0,
  total_cents                int not null default 0,
  shipping_address           jsonb,
  created_at                 timestamptz not null default now()
);

create table if not exists order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  variant_id       uuid references product_variants(id) on delete set null,
  product_slug     text not null,
  name             text not null,   -- snapshotted; product copy may change later
  sku              text not null,
  quantity         int  not null,
  unit_price_cents int  not null,
  purchase_kind    purchase_type not null default 'one_time'
);

create index if not exists order_items_order_idx on order_items(order_id);

-- ---------------------------------------------------------------- rls

-- Everything is reached through our API with the Postgres role, never from the
-- browser via Supabase's anon key. Enable RLS with no policies so a leaked
-- publishable key grants nothing.
alter table categories       enable row level security;
alter table products         enable row level security;
alter table product_variants enable row level security;
alter table bundle_items     enable row level security;
alter table carts            enable row level security;
alter table cart_items       enable row level security;
alter table orders           enable row level security;
alter table order_items      enable row level security;

-- ---------------------------------------------------------------- helpers

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

drop trigger if exists carts_touch on carts;
create trigger carts_touch before update on carts
  for each row execute function touch_updated_at();

-- Human-legible order numbers: OWC-7F3K2Q
create sequence if not exists order_number_seq start 1042;
