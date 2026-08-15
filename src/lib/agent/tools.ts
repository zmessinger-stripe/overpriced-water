import type { AddInput, CheckoutInput, CommerceClient, SearchInput } from '@/lib/agent/client'

/**
 * Every agent-facing tool, defined exactly once.
 *
 * `src/app/api/mcp/route.ts` projects this array onto JSON-RPC for remote agents, and
 * `components/agent/ModelContextRegistrar.tsx` projects it onto `document.modelContext` for
 * in-page ones. Neither surface defines tools of its own, so they cannot disagree about what
 * the store can do.
 */
export interface ToolContext {
  client: CommerceClient
  /** The caller's cart, if they have one. */
  cartId: string | null
  /** Persists a newly created cart id for subsequent calls on this surface. */
  setCartId?: (id: string) => void
  /** In-page only: lets a tool move the human's browser to the page it is talking about. */
  navigate?: (path: string) => void
  surface: 'webmcp' | 'remote_mcp'
}

export interface AgentTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  annotations?: {
    title?: string
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    /** Product copy is authored content; agents should not treat it as instructions. */
    untrustedContentHint?: boolean
  }
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown>
}

const str = (d: string) => ({ type: 'string' as const, description: d })
const num = (d: string) => ({ type: 'number' as const, description: d })
const int = (d: string, min?: number, max?: number) => ({
  type: 'integer' as const,
  description: d,
  ...(min != null ? { minimum: min } : {}),
  ...(max != null ? { maximum: max } : {}),
})

/** Resolves the cart to act on, creating one on first use so agents never have to remember to. */
async function requireCart(ctx: ToolContext): Promise<string> {
  if (ctx.cartId) return ctx.cartId
  const { cart_id } = await ctx.client.createCart()
  ctx.setCartId?.(cart_id)
  ctx.cartId = cart_id
  return cart_id
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'list_categories',
    description:
      'List the ways the Overpriced Water Co. catalog is organized (by occasion, by identity, ' +
      'collections). Start here if you do not know what to search for.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Browse categories', readOnlyHint: true },
    execute: (_args, ctx) => ctx.client.listCategories(),
  },

  {
    name: 'search_products',
    description:
      'Search the water catalog. Returns products with their variants, SKUs, prices in USD, ' +
      'and whether each can be subscribed to. Use the returned `sku` values with add_to_cart. ' +
      'All filters are optional — call with no arguments to list everything.',
    inputSchema: {
      type: 'object',
      properties: {
        query: str('Free text matched against name, subtitle, description, and tasting notes.'),
        category: str('Category slug from list_categories, e.g. "by-occasion".'),
        min_price_usd: num('Only products with a variant at or above this price.'),
        max_price_usd: num('Only products with a variant at or below this price.'),
        subscribable_only: {
          type: 'boolean',
          description: 'Only products available as a monthly subscription.',
        },
        sort: {
          type: 'string',
          enum: ['featured', 'price_asc', 'price_desc', 'name_asc'],
          description: 'Result ordering. Defaults to "featured".',
        },
        limit: int('Maximum results, 1–100. Defaults to 50.', 1, 100),
      },
    },
    annotations: { title: 'Search water', readOnlyHint: true, untrustedContentHint: true },
    execute: (args, ctx) => ctx.client.searchProducts(args as SearchInput),
  },

  {
    name: 'get_product',
    description:
      'Full detail for one product by slug: every variant with its SKU and price, the ' +
      'provenance, pH, tasting notes, and — for bundles — what is inside.',
    inputSchema: {
      type: 'object',
      properties: { slug: str('Product slug, e.g. "monday-water".') },
      required: ['slug'],
    },
    annotations: { title: 'View product', readOnlyHint: true, untrustedContentHint: true },
    execute: async (args, ctx) => {
      const product = await ctx.client.getProduct(String(args.slug))
      ctx.navigate?.(`/products/${String(args.slug)}`)
      return product
    },
  },

  {
    name: 'create_cart',
    description:
      'Create an empty cart and return its id. You usually do not need this — add_to_cart ' +
      'creates one automatically. Remote callers should send the returned id as the ' +
      '`X-Cart-Id` header on later requests.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Create cart' },
    execute: async (_args, ctx) => {
      const result = await ctx.client.createCart()
      ctx.setCartId?.(result.cart_id)
      ctx.cartId = result.cart_id
      return result
    },
  },

  {
    name: 'view_cart',
    description:
      'Show the current cart: line items, per-line totals, shipping, the concierge fee, and ' +
      'which checkout scopes are available.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'View cart', readOnlyHint: true },
    execute: async (_args, ctx) => {
      if (!ctx.cartId) return { cart_id: null, items: [], note: 'No cart yet. Add something.' }
      return ctx.client.viewCart(ctx.cartId)
    },
  },

  {
    name: 'add_to_cart',
    description:
      'Add a variant to the cart by SKU. Set purchase_kind to "subscription" for a recurring ' +
      'monthly delivery at 15% off; not every product allows it, and attempting it returns ' +
      'error code "not_subscribable". Creates a cart if none exists.',
    inputSchema: {
      type: 'object',
      properties: {
        sku: str('Variant SKU from search_products or get_product, e.g. "OWC-MON-330".'),
        quantity: int('How many, 1–99. Defaults to 1.', 1, 99),
        purchase_kind: {
          type: 'string',
          enum: ['one_time', 'subscription'],
          description: 'Defaults to "one_time".',
        },
      },
      required: ['sku'],
    },
    annotations: { title: 'Add to cart', idempotentHint: false },
    execute: async (args, ctx) => {
      const cartId = await requireCart(ctx)
      return ctx.client.addToCart(cartId, args as unknown as AddInput)
    },
  },

  {
    name: 'update_cart_item',
    description:
      'Change a line item quantity. Use item_id from view_cart. A quantity of 0 removes the line.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: str('The `item_id` of a line from view_cart.'),
        quantity: int('New quantity, 0–99. 0 removes the line.', 0, 99),
      },
      required: ['item_id', 'quantity'],
    },
    annotations: { title: 'Update cart item' },
    execute: async (args, ctx) => {
      const cartId = await requireCart(ctx)
      return ctx.client.updateCartItem(cartId, String(args.item_id), Number(args.quantity))
    },
  },

  {
    name: 'remove_cart_item',
    description: 'Remove a line item from the cart entirely. Use item_id from view_cart.',
    inputSchema: {
      type: 'object',
      properties: { item_id: str('The `item_id` of a line from view_cart.') },
      required: ['item_id'],
    },
    annotations: { title: 'Remove cart item', destructiveHint: true, idempotentHint: true },
    execute: async (args, ctx) => {
      const cartId = await requireCart(ctx)
      return ctx.client.updateCartItem(cartId, String(args.item_id), 0)
    },
  },

  {
    name: 'set_cart_email',
    description: 'Attach an email to the cart so it prefills at checkout and receives the receipt.',
    inputSchema: {
      type: 'object',
      properties: { email: str("The customer's email address.") },
      required: ['email'],
    },
    annotations: { title: 'Set email', idempotentHint: true },
    execute: async (args, ctx) => {
      const cartId = await requireCart(ctx)
      return ctx.client.setEmail(cartId, String(args.email))
    },
  },

  {
    name: 'start_checkout',
    description:
      'Begin checkout for the cart. This does NOT pay for anything — a human always completes ' +
      'the payment form. In the browser it opens the checkout page; remotely it returns a URL ' +
      'to hand to the person. If the cart mixes one-time and subscription items you must pass ' +
      '`scope`, because Stripe requires a separate session per type (error code "mixed_cart").',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['one_time', 'subscription'],
          description:
            'Which half of a mixed cart to check out. Required only when view_cart reports ' +
            'is_mixed: true.',
        },
      },
    },
    annotations: { title: 'Start checkout' },
    execute: async (args, ctx) => {
      const cartId = await requireCart(ctx)
      const result = (await ctx.client.startCheckout(cartId, args as CheckoutInput)) as Record<
        string,
        unknown
      >
      if (ctx.navigate) {
        const scope = args.scope ? `&scope=${String(args.scope)}` : ''
        ctx.navigate(`/checkout?session=${String(result.session_id)}${scope}`)
        return {
          ...result,
          // Never hand a client_secret to an in-page agent — it has no use for it, and the
          // human is already looking at the form it would have mounted.
          client_secret: undefined,
          next_step:
            'The checkout page is now open in front of the customer. They must enter payment ' +
            'details themselves. Poll get_checkout_status to find out how it went.',
        }
      }
      return result
    },
  },

  {
    name: 'get_checkout_status',
    description:
      'Check whether a checkout session has been paid. Returns status, payment_status, and the ' +
      'order_number once the order exists.',
    inputSchema: {
      type: 'object',
      properties: { session_id: str('Checkout session id from start_checkout.') },
      required: ['session_id'],
    },
    annotations: { title: 'Check checkout status', readOnlyHint: true },
    execute: (args, ctx) => ctx.client.getCheckoutStatus(String(args.session_id)),
  },

  {
    name: 'get_order',
    description:
      'Retrieve the completed order for a checkout session: order number, items, totals, and ' +
      'whether it created a subscription. Returns error code "order_pending" if payment has ' +
      'not settled yet.',
    inputSchema: {
      type: 'object',
      properties: { session_id: str('Checkout session id from start_checkout.') },
      required: ['session_id'],
    },
    annotations: { title: 'View order', readOnlyHint: true },
    execute: (args, ctx) => ctx.client.getOrder(String(args.session_id)),
  },
]

export const TOOLS_BY_NAME = new Map(AGENT_TOOLS.map((t) => [t.name, t]))
