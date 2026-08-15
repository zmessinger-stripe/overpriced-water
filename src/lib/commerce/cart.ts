import { createHash } from 'node:crypto'
import { CommerceError } from '@/lib/commerce/errors'
import { sql } from '@/lib/db/client'
import type { Cart, CartLine, CartTotals, PurchaseKind, ScopeTotals } from '@/lib/db/types'
import {
  CONCIERGE_CENTS,
  FREE_SHIPPING_THRESHOLD_CENTS,
  SHIPPING_CENTS,
  SUBSCRIPTION_INTERVAL,
  subscriptionPriceCents,
} from '@/lib/catalog-data'

export type CartSource = 'web' | 'webmcp' | 'mcp'

export async function createCart(source: CartSource = 'web'): Promise<Cart> {
  const [row] = await sql<{ id: string }[]>`
    insert into carts (metadata) values (${sql.json({ source })}) returning id
  `
  return (await getCart(row.id))!
}

/**
 * Totals for one checkout scope.
 *
 * Shipping and the concierge fee are charged per *session*, and a subscription session would
 * recur them every month — so subscriptions get escorted delivery included, which is both
 * on-brand and the only version where the cart page and the Stripe total agree.
 */
export function scopeTotals(items: CartLine[], scope: PurchaseKind): ScopeTotals {
  const lines = items.filter((i) => i.purchase_kind === scope)
  const subtotal = lines.reduce((sum, i) => sum + i.line_total_cents, 0)
  const itemCount = lines.reduce((sum, i) => sum + i.quantity, 0)

  const billable = scope === 'one_time' && subtotal > 0
  const shipping = billable && subtotal < FREE_SHIPPING_THRESHOLD_CENTS ? SHIPPING_CENTS : 0
  const concierge = billable ? CONCIERGE_CENTS : 0

  return {
    subtotal_cents: subtotal,
    shipping_cents: shipping,
    concierge_cents: concierge,
    total_cents: subtotal + shipping + concierge,
    item_count: itemCount,
  }
}

function computeTotals(items: CartLine[]): CartTotals {
  const oneTime = scopeTotals(items, 'one_time')
  const subscription = scopeTotals(items, 'subscription')
  return {
    subtotal_cents: oneTime.subtotal_cents + subscription.subtotal_cents,
    shipping_cents: oneTime.shipping_cents + subscription.shipping_cents,
    concierge_cents: oneTime.concierge_cents + subscription.concierge_cents,
    total_cents: oneTime.total_cents + subscription.total_cents,
    item_count: oneTime.item_count + subscription.item_count,
    scopes: { one_time: oneTime, subscription },
  }
}

export async function getCart(cartId: string): Promise<Cart | null> {
  const [cart] = await sql<
    { id: string; status: string; currency: string; email: string | null }[]
  >`select id, status, currency, email from carts where id = ${cartId}`
  if (!cart) return null

  const items = await sql<CartLine[]>`
    select
      ci.id, ci.variant_id, ci.quantity, ci.purchase_kind, ci.subscription_interval,
      ci.unit_price_cents,
      (ci.unit_price_cents * ci.quantity) as line_total_cents,
      v.sku, v.name as variant_name, v.size_ml,
      p.slug as product_slug, p.name as product_name, p.subtitle as product_subtitle,
      (p.images -> 0) as image
    from cart_items ci
    join product_variants v on v.id = ci.variant_id
    join products p on p.id = v.product_id
    where ci.cart_id = ${cartId}
    order by ci.created_at asc
  `

  const hasOneTime = items.some((i) => i.purchase_kind === 'one_time')
  const hasSubscription = items.some((i) => i.purchase_kind === 'subscription')

  return {
    id: cart.id,
    status: cart.status,
    currency: cart.currency,
    email: cart.email,
    items,
    totals: computeTotals(items),
    has_one_time: hasOneTime,
    has_subscription: hasSubscription,
    is_mixed: hasOneTime && hasSubscription,
  }
}

async function requireCart(cartId: string): Promise<Cart> {
  const cart = await getCart(cartId)
  if (!cart) throw new CommerceError('cart_not_found', `No cart with id ${cartId}.`, 404)
  return cart
}

export interface AddItemInput {
  sku?: string
  variantId?: string
  quantity?: number
  purchaseKind?: PurchaseKind
}

export async function addItem(cartId: string, input: AddItemInput): Promise<Cart> {
  await requireCart(cartId)
  const quantity = input.quantity ?? 1
  if (quantity < 1 || quantity > 99) {
    throw new CommerceError('invalid_quantity', 'Quantity must be between 1 and 99.')
  }

  const [variant] = await sql<
    {
      id: string
      price_cents: number
      sku: string
      subscription_eligible: boolean
      stripe_subscription_price_id: string | null
      inventory: number
    }[]
  >`
    select v.id, v.price_cents, v.sku, v.inventory, v.stripe_subscription_price_id,
           p.subscription_eligible
    from product_variants v
    join products p on p.id = v.product_id
    where ${input.variantId ? sql`v.id = ${input.variantId}` : sql`v.sku = ${input.sku ?? ''}`}
  `
  if (!variant) {
    throw new CommerceError(
      'variant_not_found',
      `No variant matching ${input.variantId ?? input.sku}. Use list_products to get valid SKUs.`,
      404,
    )
  }

  const purchaseKind: PurchaseKind = input.purchaseKind ?? 'one_time'
  if (purchaseKind === 'subscription') {
    if (!variant.subscription_eligible || !variant.stripe_subscription_price_id) {
      throw new CommerceError(
        'not_subscribable',
        `${variant.sku} cannot be subscribed to. Add it as a one-time purchase instead.`,
        409,
      )
    }
  }

  // Matches the seeded Stripe recurring price exactly — see subscriptionPriceCents.
  const unitPrice =
    purchaseKind === 'subscription'
      ? subscriptionPriceCents(variant.price_cents)
      : variant.price_cents

  await sql`
    insert into cart_items (
      cart_id, variant_id, quantity, purchase_kind, subscription_interval, unit_price_cents
    ) values (
      ${cartId}, ${variant.id}, ${quantity}, ${purchaseKind},
      ${purchaseKind === 'subscription' ? SUBSCRIPTION_INTERVAL : null}, ${unitPrice}
    )
    on conflict (cart_id, variant_id, purchase_kind) do update set
      quantity = least(cart_items.quantity + excluded.quantity, 99),
      unit_price_cents = excluded.unit_price_cents
  `
  await invalidateCheckout(cartId)
  return requireCart(cartId)
}

export async function updateItem(
  cartId: string,
  itemId: string,
  quantity: number,
): Promise<Cart> {
  await requireCart(cartId)
  if (quantity < 0 || quantity > 99) {
    throw new CommerceError('invalid_quantity', 'Quantity must be between 0 and 99.')
  }

  if (quantity === 0) return removeItem(cartId, itemId)

  const rows = await sql`
    update cart_items set quantity = ${quantity}
    where id = ${itemId} and cart_id = ${cartId}
    returning id
  `
  if (rows.length === 0) {
    throw new CommerceError('item_not_found', `No item ${itemId} in cart ${cartId}.`, 404)
  }
  await invalidateCheckout(cartId)
  return requireCart(cartId)
}

export async function removeItem(cartId: string, itemId: string): Promise<Cart> {
  await requireCart(cartId)
  const rows = await sql`
    delete from cart_items where id = ${itemId} and cart_id = ${cartId} returning id
  `
  if (rows.length === 0) {
    throw new CommerceError('item_not_found', `No item ${itemId} in cart ${cartId}.`, 404)
  }
  await invalidateCheckout(cartId)
  return requireCart(cartId)
}

export async function clearCart(cartId: string): Promise<Cart> {
  await requireCart(cartId)
  await sql`delete from cart_items where cart_id = ${cartId}`
  await invalidateCheckout(cartId)
  return requireCart(cartId)
}

export async function setEmail(cartId: string, email: string): Promise<Cart> {
  await requireCart(cartId)
  await sql`update carts set email = ${email} where id = ${cartId}`
  return requireCart(cartId)
}

/**
 * Fingerprint of the cart's lines. When it changes, any open Checkout Session is stale and
 * must be expired rather than reused — otherwise a customer could pay yesterday's total.
 */
export function itemsHash(cart: Cart, scope: string): string {
  const canonical = cart.items
    .map((i) => `${i.variant_id}:${i.purchase_kind}:${i.quantity}:${i.unit_price_cents}`)
    .sort()
    .join('|')
  return createHash('sha256').update(`${scope}::${canonical}`).digest('hex').slice(0, 32)
}

async function invalidateCheckout(cartId: string) {
  await sql`update carts set items_hash = null where id = ${cartId}`
}

/** Compact cart shape for agents — dollars, SKUs, and the mixed-cart flag spelled out. */
export function toAgentCart(cart: Cart) {
  return {
    cart_id: cart.id,
    currency: cart.currency,
    email: cart.email,
    items: cart.items.map((i) => ({
      item_id: i.id,
      sku: i.sku,
      product: i.product_name,
      variant: i.variant_name,
      quantity: i.quantity,
      purchase_kind: i.purchase_kind,
      unit_price_usd: i.unit_price_cents / 100,
      line_total_usd: i.line_total_cents / 100,
    })),
    totals: {
      subtotal_usd: cart.totals.subtotal_cents / 100,
      shipping_usd: cart.totals.shipping_cents / 100,
      concierge_fee_usd: cart.totals.concierge_cents / 100,
      total_usd: cart.totals.total_cents / 100,
      item_count: cart.totals.item_count,
    },
    /** What each Checkout Session will actually charge. Subscriptions ship free. */
    totals_by_scope: {
      one_time: {
        subtotal_usd: cart.totals.scopes.one_time.subtotal_cents / 100,
        shipping_usd: cart.totals.scopes.one_time.shipping_cents / 100,
        concierge_fee_usd: cart.totals.scopes.one_time.concierge_cents / 100,
        charged_usd: cart.totals.scopes.one_time.total_cents / 100,
      },
      subscription: {
        subtotal_usd: cart.totals.scopes.subscription.subtotal_cents / 100,
        shipping_usd: 0,
        concierge_fee_usd: 0,
        charged_usd: cart.totals.scopes.subscription.total_cents / 100,
        recurs: 'monthly',
      },
    },
    is_mixed: cart.is_mixed,
    checkout_scopes_available: cart.is_mixed
      ? ['one_time', 'subscription']
      : cart.has_subscription
        ? ['subscription']
        : cart.has_one_time
          ? ['one_time']
          : [],
    note: cart.is_mixed
      ? 'This cart mixes one-time and subscription items. Stripe requires a separate Checkout Session per type, so pass `scope` to start_checkout.'
      : undefined,
  }
}

export { CommerceError }
