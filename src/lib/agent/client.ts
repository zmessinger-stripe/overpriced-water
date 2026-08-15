import type { CheckoutScope, CheckoutUiMode } from '@/lib/commerce/checkout'
import type { PurchaseKind } from '@/lib/db/types'

/**
 * The operations an agent can perform, in agent-shaped terms (slugs, SKUs, dollars).
 *
 * There are two implementations and one set of tool definitions on top of them, which is what
 * keeps the in-page WebMCP surface and the remote MCP surface from drifting:
 *
 * - `serverClient` calls the commerce service layer directly (remote MCP, running on the server)
 * - `restClient` calls our own REST API over `fetch` (in-page WebMCP, running in the browser,
 *   so the React UI sees the same mutations a human's clicks would produce)
 */
export interface CommerceClient {
  listCategories(): Promise<unknown>
  searchProducts(input: SearchInput): Promise<unknown>
  getProduct(slug: string): Promise<unknown>
  createCart(): Promise<{ cart_id: string }>
  viewCart(cartId: string): Promise<unknown>
  addToCart(cartId: string, input: AddInput): Promise<unknown>
  updateCartItem(cartId: string, itemId: string, quantity: number): Promise<unknown>
  setEmail(cartId: string, email: string): Promise<unknown>
  startCheckout(cartId: string, input: CheckoutInput): Promise<unknown>
  getCheckoutStatus(sessionId: string): Promise<unknown>
  getOrder(sessionId: string): Promise<unknown>
}

export interface SearchInput {
  query?: string
  category?: string
  max_price_usd?: number
  min_price_usd?: number
  subscribable_only?: boolean
  sort?: 'featured' | 'price_asc' | 'price_desc' | 'name_asc'
  limit?: number
}

export interface AddInput {
  sku: string
  quantity?: number
  purchase_kind?: PurchaseKind
}

export interface CheckoutInput {
  scope?: CheckoutScope
  ui_mode?: CheckoutUiMode
}
