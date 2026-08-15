import { CommerceError } from '@/lib/commerce/errors'
import type { AddInput, CheckoutInput, CommerceClient, SearchInput } from '@/lib/agent/client'

/**
 * In-page (WebMCP) implementation: every call goes through our own REST API.
 *
 * Deliberately the long way round. It means a browser agent traverses the same cookie,
 * validation, and analytics path a human does, and — the whole point of WebMCP over a headless
 * API — the React UI re-renders in response, so the person watching sees the cart change.
 */
export function restClient(opts: { baseUrl?: string; cartId?: () => string | null } = {}): CommerceClient {
  const base = opts.baseUrl ?? ''

  async function call(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${base}/api${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-owc-surface': 'webmcp',
        ...(init?.headers ?? {}),
      },
    })
    const payload = res.status === 204 ? null : await res.json().catch(() => null)
    if (!res.ok) {
      const err = (payload as { error?: { code: string; message: string; details?: unknown } })
        ?.error
      throw new CommerceError(
        err?.code ?? 'request_failed',
        err?.message ?? `${init?.method ?? 'GET'} ${path} failed with ${res.status}.`,
        res.status,
        err?.details,
      )
    }
    return (payload as { data?: unknown })?.data ?? payload
  }

  const json = (method: string, path: string, body?: unknown) =>
    call(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

  return {
    listCategories: () => call('/categories'),

    searchProducts: (input: SearchInput) => {
      const sp = new URLSearchParams()
      if (input.query) sp.set('q', input.query)
      if (input.category) sp.set('category', input.category)
      if (input.min_price_usd != null) sp.set('min_price', String(Math.round(input.min_price_usd * 100)))
      if (input.max_price_usd != null) sp.set('max_price', String(Math.round(input.max_price_usd * 100)))
      if (input.subscribable_only) sp.set('subscribable', 'true')
      if (input.sort) sp.set('sort', input.sort)
      if (input.limit) sp.set('limit', String(input.limit))
      return call(`/products?${sp}`)
    },

    getProduct: (slug: string) => call(`/products/${encodeURIComponent(slug)}`),

    createCart: async () => {
      const cart = (await json('POST', '/carts', { source: 'webmcp' })) as { id: string }
      return { cart_id: cart.id }
    },

    viewCart: (cartId: string) => call(`/carts/${cartId}`),

    addToCart: (cartId: string, input: AddInput) =>
      json('POST', `/carts/${cartId}/items`, {
        sku: input.sku,
        quantity: input.quantity ?? 1,
        purchaseKind: input.purchase_kind ?? 'one_time',
      }),

    updateCartItem: (cartId: string, itemId: string, quantity: number) =>
      json('PATCH', `/carts/${cartId}/items/${itemId}`, { quantity }),

    setEmail: (cartId: string, email: string) => json('PATCH', `/carts/${cartId}`, { email }),

    startCheckout: (cartId: string, input: CheckoutInput) =>
      json('POST', `/carts/${cartId}/checkout-session`, {
        scope: input.scope,
        uiMode: input.ui_mode ?? 'embedded',
      }),

    getCheckoutStatus: (sessionId: string) => call(`/checkout-sessions/${sessionId}`),

    getOrder: (sessionId: string) => call(`/orders/by-session/${sessionId}`),
  }
}
