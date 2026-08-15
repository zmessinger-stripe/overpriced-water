import 'server-only'
import * as catalog from '@/lib/commerce/catalog'
import * as cart from '@/lib/commerce/cart'
import * as checkout from '@/lib/commerce/checkout'
import * as orders from '@/lib/commerce/orders'
import { CommerceError } from '@/lib/commerce/cart'
import type { AddInput, CheckoutInput, CommerceClient, SearchInput } from '@/lib/agent/client'

const dollarsToCents = (v?: number) => (v == null ? undefined : Math.round(v * 100))

/** Remote-MCP implementation: straight into the service layer, no HTTP hop. */
export const serverClient: CommerceClient = {
  async listCategories() {
    const rows = await catalog.listCategories()
    return rows.map((c) => ({
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      url: `/water/${c.slug}`,
    }))
  },

  async searchProducts(input: SearchInput) {
    const products = await catalog.listProducts({
      q: input.query,
      category: input.category,
      minPriceCents: dollarsToCents(input.min_price_usd),
      maxPriceCents: dollarsToCents(input.max_price_usd),
      subscribable: input.subscribable_only ? true : undefined,
      sort: input.sort,
      limit: input.limit,
    })
    return { count: products.length, products: products.map(catalog.toAgentProduct) }
  },

  async getProduct(slug: string) {
    const product = await catalog.getProduct(slug)
    if (!product) {
      throw new CommerceError('product_not_found', `No product "${slug}".`, 404)
    }
    return catalog.toAgentProduct(product)
  },

  async createCart() {
    const created = await cart.createCart('mcp')
    return { cart_id: created.id }
  },

  async viewCart(cartId: string) {
    const found = await cart.getCart(cartId)
    if (!found) throw new CommerceError('cart_not_found', `No cart with id ${cartId}.`, 404)
    return cart.toAgentCart(found)
  },

  async addToCart(cartId: string, input: AddInput) {
    const updated = await cart.addItem(cartId, {
      sku: input.sku,
      quantity: input.quantity,
      purchaseKind: input.purchase_kind,
    })
    return cart.toAgentCart(updated)
  },

  async updateCartItem(cartId: string, itemId: string, quantity: number) {
    return cart.toAgentCart(await cart.updateItem(cartId, itemId, quantity))
  },

  async setEmail(cartId: string, email: string) {
    return cart.toAgentCart(await cart.setEmail(cartId, email))
  },

  async startCheckout(cartId: string, input: CheckoutInput) {
    // Friction S2: a remote agent has no DOM, so an embedded `client_secret` is useless to it.
    // Force the hosted mode and hand back a URL a human can open and pay on.
    const result = await checkout.createCheckoutSession(cartId, {
      scope: input.scope,
      uiMode: 'hosted',
    })
    return {
      session_id: result.session_id,
      checkout_url: result.url,
      scope: result.scope,
      total_usd: result.total_cents / 100,
      next_step:
        'Give this URL to the human. Payment is deliberately not automatable — open the link ' +
        'to complete it, then poll get_checkout_status with the session_id.',
    }
  },

  async getCheckoutStatus(sessionId: string) {
    return checkout.getCheckoutStatus(sessionId)
  },

  async getOrder(sessionId: string) {
    const order = await orders.resolveOrderForSession(sessionId)
    if (!order) {
      throw new CommerceError(
        'order_pending',
        'Payment has not settled for this session yet. Try again shortly.',
        409,
      )
    }
    return orders.toAgentOrder(order)
  },
}
