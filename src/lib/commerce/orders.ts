import type Stripe from 'stripe'
import { sql } from '@/lib/db/client'
import { stripe } from '@/lib/stripe'
import { CommerceError } from '@/lib/commerce/cart'
import { captureServer } from '@/lib/analytics/server'
import type { Order, OrderLine } from '@/lib/db/types'

const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY349'

function orderNumber(seed: string): string {
  // Derived from the session id so retries produce the same number.
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[h % ALPHABET.length]
    h = Math.floor(h / ALPHABET.length) + 7919
  }
  return `OWC-${out}`
}

/**
 * Creates the order for a completed Checkout Session.
 *
 * Idempotent on `orders.stripe_checkout_session_id`, which carries a unique constraint. Both
 * the webhook and the confirmation page's synchronous fallback call this, and whichever
 * arrives second is a no-op that returns the existing order.
 */
export async function createOrderFromSession(
  sessionOrId: string | Stripe.Checkout.Session,
): Promise<Order> {
  const session =
    typeof sessionOrId === 'string'
      ? await stripe.checkout.sessions.retrieve(sessionOrId, {
          expand: ['line_items.data.price.product', 'customer_details'],
        })
      : sessionOrId.line_items
        ? sessionOrId
        : await stripe.checkout.sessions.retrieve(sessionOrId.id, {
            expand: ['line_items.data.price.product', 'customer_details'],
          })

  const existing = await getOrderBySession(session.id)
  if (existing) return existing

  if (session.payment_status === 'unpaid' && session.status !== 'complete') {
    throw new CommerceError(
      'session_not_paid',
      `Checkout session ${session.id} is not paid yet (status: ${session.status}).`,
      409,
    )
  }

  const cartId = session.metadata?.owc_cart_id ?? null
  const scope = (session.metadata?.owc_scope ?? 'one_time') as 'one_time' | 'subscription'

  // Map Stripe line items back to our variants via the SKU stamped on each Stripe product.
  const lineItems = session.line_items?.data ?? []
  const skus = lineItems
    .map((li) => {
      const product = li.price?.product
      return typeof product === 'object' && product && 'metadata' in product
        ? (product.metadata?.owc_sku ?? null)
        : null
    })
    .filter((s): s is string => Boolean(s))

  const variants = skus.length
    ? await sql<
        { id: string; sku: string; name: string; product_slug: string; product_name: string }[]
      >`
        select v.id, v.sku, v.name, p.slug as product_slug, p.name as product_name
        from product_variants v join products p on p.id = v.product_id
        where v.sku in ${sql(skus)}
      `
    : []
  const bySku = new Map(variants.map((v) => [v.sku, v]))

  const number = orderNumber(session.id)
  const address = session.customer_details?.address ?? null

  const [order] = await sql<{ id: string }[]>`
    insert into orders (
      order_number, cart_id, stripe_checkout_session_id, stripe_payment_intent_id,
      stripe_subscription_id, email, customer_name, status, currency,
      subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents, shipping_address
    ) values (
      ${number}, ${cartId}, ${session.id},
      ${typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null)},
      ${typeof session.subscription === 'string' ? session.subscription : (session.subscription?.id ?? null)},
      ${session.customer_details?.email ?? null},
      ${session.customer_details?.name ?? null},
      'paid',
      ${session.currency ?? 'usd'},
      ${session.amount_subtotal ?? 0},
      ${session.total_details?.amount_discount ?? 0},
      ${session.total_details?.amount_shipping ?? 0},
      ${session.total_details?.amount_tax ?? 0},
      ${session.amount_total ?? 0},
      ${address ? sql.json({ ...address }) : null}
    )
    on conflict (stripe_checkout_session_id) do nothing
    returning id
  `

  // Lost the race to the webhook (or a redelivery) — the other writer has it.
  if (!order) {
    const settled = await getOrderBySession(session.id)
    if (settled) return settled
    throw new CommerceError('order_insert_failed', 'Could not create or find order.', 500)
  }

  for (const li of lineItems) {
    const product = li.price?.product
    const sku =
      typeof product === 'object' && product && 'metadata' in product
        ? (product.metadata?.owc_sku ?? null)
        : null
    const v = sku ? bySku.get(sku) : undefined
    await sql`
      insert into order_items (
        order_id, variant_id, product_slug, name, sku, quantity, unit_price_cents, purchase_kind
      ) values (
        ${order.id}, ${v?.id ?? null}, ${v?.product_slug ?? 'unknown'},
        ${li.description ?? v?.product_name ?? 'Water'}, ${sku ?? 'UNKNOWN'},
        ${li.quantity ?? 1},
        ${li.price?.unit_amount ?? Math.round((li.amount_subtotal ?? 0) / (li.quantity || 1))},
        ${li.price?.recurring ? 'subscription' : 'one_time'}
      )
    `
  }

  if (cartId) {
    await sql`update carts set status = 'converted' where id = ${cartId}`
  }

  const created = (await getOrderBySession(session.id))!

  await captureServer({
    event: 'order_completed',
    distinctId: created.email ?? created.order_number,
    properties: {
      order_number: created.order_number,
      revenue: created.total_cents / 100,
      currency: created.currency,
      item_count: created.items.reduce((s, i) => s + i.quantity, 0),
      scope,
      is_subscription: scope === 'subscription',
      source: (session.metadata?.owc_source as string) ?? 'web',
    },
  })

  return created
}

async function hydrate(row: { id: string } & Record<string, unknown>): Promise<Order> {
  const items = await sql<OrderLine[]>`
    select name, sku, product_slug, quantity, unit_price_cents, purchase_kind
    from order_items where order_id = ${row.id}
  `
  return { ...(row as unknown as Order), items }
}

export async function getOrderBySession(sessionId: string): Promise<Order | null> {
  const [row] = await sql<({ id: string } & Record<string, unknown>)[]>`
    select * from orders where stripe_checkout_session_id = ${sessionId}
  `
  return row ? hydrate(row) : null
}

export async function getOrderByNumber(orderNumber: string): Promise<Order | null> {
  const [row] = await sql<({ id: string } & Record<string, unknown>)[]>`
    select * from orders where order_number = ${orderNumber}
  `
  return row ? hydrate(row) : null
}

/**
 * What the confirmation page calls. Prefers the row the webhook wrote; if the webhook has not
 * landed yet (or `stripe listen` isn't running locally), creates the order inline so the page
 * is never blank.
 */
export async function resolveOrderForSession(sessionId: string): Promise<Order | null> {
  const existing = await getOrderBySession(sessionId)
  if (existing) return existing
  try {
    return await createOrderFromSession(sessionId)
  } catch (err) {
    if (err instanceof CommerceError && err.code === 'session_not_paid') return null
    throw err
  }
}

export function toAgentOrder(order: Order) {
  return {
    order_number: order.order_number,
    status: order.status,
    email: order.email,
    total_usd: order.total_cents / 100,
    currency: order.currency,
    placed_at: order.created_at,
    is_subscription: Boolean(order.stripe_subscription_id),
    items: order.items.map((i) => ({
      name: i.name,
      sku: i.sku,
      quantity: i.quantity,
      unit_price_usd: i.unit_price_cents / 100,
      purchase_kind: i.purchase_kind,
    })),
  }
}
