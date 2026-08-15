import type Stripe from 'stripe'
import { sql } from '@/lib/db/client'
import { stripe } from '@/lib/stripe'
import { CommerceError, getCart, itemsHash } from '@/lib/commerce/cart'
import type { Cart, PurchaseKind } from '@/lib/db/types'

export type CheckoutScope = PurchaseKind
export type CheckoutUiMode = 'embedded' | 'hosted'

/**
 * Friction S4: the Checkout Session API no longer accepts `ui_mode: 'embedded'` — it is
 * `'embedded_page'` now, and `'hosted'` is `'hosted_page'` (omitting `ui_mode` still defaults
 * to hosted, which is why only the embedded path broke). Our own vocabulary stays
 * `embedded`/`hosted`; this is the single translation point.
 */
const EMBEDDED_UI_MODE = 'embedded_page' as const

export interface CheckoutSessionResult {
  session_id: string
  ui_mode: CheckoutUiMode
  /** Present for `embedded`; feed to `@stripe/stripe-js` in the browser. */
  client_secret: string | null
  /** Present for `hosted`; a URL a human can open. */
  url: string | null
  scope: CheckoutScope
  total_cents: number
}

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  )
}

/**
 * Decide which scope to check out.
 *
 * Friction S1: Stripe rejects one-time prices in a `mode: 'subscription'` session and
 * recurring prices in a `mode: 'payment'` session, so a mixed cart genuinely cannot be one
 * session. Rather than silently picking one, we make the caller choose.
 */
function resolveScope(cart: Cart, requested?: CheckoutScope): CheckoutScope {
  if (cart.items.length === 0) {
    throw new CommerceError('cart_empty', 'Cannot check out an empty cart.', 409)
  }
  if (requested) {
    if (requested === 'subscription' && !cart.has_subscription) {
      throw new CommerceError(
        'scope_empty',
        'Cart has no subscription items, so scope "subscription" would be empty.',
        409,
      )
    }
    if (requested === 'one_time' && !cart.has_one_time) {
      throw new CommerceError(
        'scope_empty',
        'Cart has no one-time items, so scope "one_time" would be empty.',
        409,
      )
    }
    return requested
  }
  if (cart.is_mixed) {
    throw new CommerceError(
      'mixed_cart',
      'This cart mixes one-time and subscription items. Stripe requires one Checkout Session per ' +
        'type, so pass scope="one_time" or scope="subscription" and check out twice.',
      409,
      { scopes_available: ['one_time', 'subscription'] },
    )
  }
  return cart.has_subscription ? 'subscription' : 'one_time'
}

export async function createCheckoutSession(
  cartId: string,
  opts: { scope?: CheckoutScope; uiMode?: CheckoutUiMode } = {},
): Promise<CheckoutSessionResult> {
  const cart = await getCart(cartId)
  if (!cart) throw new CommerceError('cart_not_found', `No cart with id ${cartId}.`, 404)

  const scope = resolveScope(cart, opts.scope)
  const uiMode: CheckoutUiMode = opts.uiMode ?? 'embedded'
  const hash = itemsHash(cart, `${scope}:${uiMode}`)

  // Reuse an open session when nothing about the cart has changed. Keeps repeated visits to
  // /checkout from creating a trail of abandoned sessions.
  const [existing] = await sql<{ stripe_checkout_session_id: string | null }[]>`
    select stripe_checkout_session_id from carts
    where id = ${cartId} and items_hash = ${hash}
  `
  if (existing?.stripe_checkout_session_id) {
    try {
      const s = await stripe.checkout.sessions.retrieve(existing.stripe_checkout_session_id)
      if (s.status === 'open') {
        return {
          session_id: s.id,
          ui_mode: uiMode,
          client_secret: s.client_secret ?? null,
          url: s.url ?? null,
          scope,
          total_cents: s.amount_total ?? cart.totals.total_cents,
        }
      }
    } catch {
      // Fall through and create a fresh one.
    }
  }

  // Expire any previous open session for this cart so it cannot be paid at a stale total.
  const [prev] = await sql<{ stripe_checkout_session_id: string | null }[]>`
    select stripe_checkout_session_id from carts where id = ${cartId}
  `
  if (prev?.stripe_checkout_session_id) {
    try {
      const s = await stripe.checkout.sessions.retrieve(prev.stripe_checkout_session_id)
      if (s.status === 'open') await stripe.checkout.sessions.expire(s.id)
    } catch {
      /* already gone */
    }
  }

  const scoped = cart.items.filter((i) => i.purchase_kind === scope)
  const priceIds = await sql<{ id: string; stripe_price_id: string | null; stripe_subscription_price_id: string | null }[]>`
    select id, stripe_price_id, stripe_subscription_price_id
    from product_variants where id in ${sql(scoped.map((i) => i.variant_id))}
  `
  const priceMap = new Map(priceIds.map((r) => [r.id, r]))

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = scoped.map((i) => {
    const row = priceMap.get(i.variant_id)
    const price =
      scope === 'subscription' ? row?.stripe_subscription_price_id : row?.stripe_price_id
    if (!price) {
      throw new CommerceError(
        'missing_stripe_price',
        `Variant ${i.sku} has no ${scope} price in Stripe. Run \`npm run seed\`.`,
        500,
      )
    }
    return { price, quantity: i.quantity }
  })

  // Same function the cart page renders from, so the Checkout total can't drift from it.
  const totals = cart.totals.scopes[scope]
  const shippingLine = totals.shipping_cents + totals.concierge_cents
  const chargeShipping = totals.shipping_cents > 0

  const common = {
    line_items,
    metadata: { owc_cart_id: cartId, owc_scope: scope },
    allow_promotion_codes: true,
    customer_email: cart.email ?? undefined,
  } satisfies Partial<Stripe.Checkout.SessionCreateParams>

  const params: Stripe.Checkout.SessionCreateParams =
    scope === 'subscription'
      ? {
          ...common,
          mode: 'subscription',
          subscription_data: { metadata: { owc_cart_id: cartId } },
          ...(uiMode === 'embedded'
            ? {
                ui_mode: EMBEDDED_UI_MODE,
                return_url: `${siteUrl()}/orders/confirmation?session_id={CHECKOUT_SESSION_ID}`,
              }
            : {
                success_url: `${siteUrl()}/orders/confirmation?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${siteUrl()}/cart`,
              }),
        }
      : {
          ...common,
          mode: 'payment',
          // Shipping + the concierge fee ride along as shipping options so the amount the
          // customer sees in Checkout matches the cart page exactly.
          shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'CH', 'DE'] },
          shipping_options: [
            {
              shipping_rate_data: {
                type: 'fixed_amount',
                fixed_amount: { amount: shippingLine, currency: 'usd' },
                display_name: chargeShipping
                  ? 'Escorted delivery + concierge handling'
                  : 'Complimentary escort + concierge handling',
                delivery_estimate: {
                  minimum: { unit: 'business_day', value: 2 },
                  maximum: { unit: 'business_day', value: 5 },
                },
              },
            },
          ],
          ...(uiMode === 'embedded'
            ? {
                ui_mode: EMBEDDED_UI_MODE,
                return_url: `${siteUrl()}/orders/confirmation?session_id={CHECKOUT_SESSION_ID}`,
              }
            : {
                success_url: `${siteUrl()}/orders/confirmation?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${siteUrl()}/cart`,
              }),
        }

  const session = await stripe.checkout.sessions.create(params)

  await sql`
    update carts
    set stripe_checkout_session_id = ${session.id}, items_hash = ${hash}
    where id = ${cartId}
  `

  return {
    session_id: session.id,
    ui_mode: uiMode,
    client_secret: session.client_secret ?? null,
    url: session.url ?? null,
    scope,
    total_cents: session.amount_total ?? totals.total_cents,
  }
}

export async function getCheckoutStatus(sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  const [order] = await sql<{ order_number: string }[]>`
    select order_number from orders where stripe_checkout_session_id = ${sessionId}
  `
  return {
    session_id: session.id,
    status: session.status,
    payment_status: session.payment_status,
    total_cents: session.amount_total,
    order_number: order?.order_number ?? null,
  }
}
