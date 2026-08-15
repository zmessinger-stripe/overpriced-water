export type PurchaseKind = 'one_time' | 'subscription'
export type ProductKind = 'single' | 'bundle'
export type OrderStatus = 'pending' | 'paid' | 'fulfilled' | 'refunded'

export interface Category {
  id: string
  slug: string
  name: string
  tagline: string
  hero_copy: string
  sort_order: number
}

export interface Variant {
  id: string
  product_id: string
  sku: string
  name: string
  size_ml: number
  price_cents: number
  compare_at_cents: number | null
  stripe_price_id: string | null
  stripe_subscription_price_id: string | null
  inventory: number
  is_default: boolean
  sort_order: number
}

export interface Product {
  id: string
  slug: string
  name: string
  subtitle: string
  description: string
  story: string
  kind: ProductKind
  category_id: string
  category_slug: string
  category_name: string
  hydration_index: string
  ph: string
  source: string
  tasting_notes: string[]
  images: { url: string; alt: string }[]
  badges: string[]
  subscription_eligible: boolean
  sort_order: number
  variants: Variant[]
  /** Populated for `kind: 'bundle'`. */
  contents?: { name: string; sku: string; quantity: number; product_slug: string }[]
}

export interface CartLine {
  id: string
  variant_id: string
  quantity: number
  purchase_kind: PurchaseKind
  subscription_interval: string | null
  unit_price_cents: number
  line_total_cents: number
  sku: string
  variant_name: string
  size_ml: number
  product_slug: string
  product_name: string
  product_subtitle: string
  image: { url: string; alt: string } | null
}

export interface ScopeTotals {
  subtotal_cents: number
  shipping_cents: number
  /** Absurd but real: a per-order handling charge with a straight face. */
  concierge_cents: number
  total_cents: number
  item_count: number
}

export interface CartTotals extends ScopeTotals {
  /**
   * Per-scope totals. A mixed cart checks out as two Stripe sessions (friction S1), so a single
   * blended number is not something the customer will ever be charged — these are.
   */
  scopes: Record<PurchaseKind, ScopeTotals>
}

export interface Cart {
  id: string
  status: string
  currency: string
  email: string | null
  items: CartLine[]
  totals: CartTotals
  /** True when the cart holds both one-time and subscription lines (see friction S1). */
  is_mixed: boolean
  has_one_time: boolean
  has_subscription: boolean
}

export interface OrderLine {
  name: string
  sku: string
  product_slug: string
  quantity: number
  unit_price_cents: number
  purchase_kind: PurchaseKind
}

export interface Order {
  id: string
  order_number: string
  email: string | null
  customer_name: string | null
  status: OrderStatus
  currency: string
  subtotal_cents: number
  discount_cents: number
  shipping_cents: number
  tax_cents: number
  total_cents: number
  shipping_address: Record<string, unknown> | null
  stripe_checkout_session_id: string
  stripe_subscription_id: string | null
  created_at: string
  items: OrderLine[]
}
