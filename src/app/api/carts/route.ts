import { createCart, getCart } from '@/lib/commerce/cart'
import { handle, ok } from '@/lib/api/respond'
import {
  body,
  createCartSchema,
  currentCartId,
  requestSource,
  setCartCookie,
} from '@/lib/api/validate'

/**
 * Creates a cart. Returns the id in the payload (for agents, who echo it back as `X-Cart-Id`)
 * *and* sets an httpOnly cookie (for browsers). Idempotent-ish for humans: an existing open
 * cookie cart is returned rather than orphaned.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const input = await body(req, createCartSchema)
    const source = input.source ?? requestSource(req)

    if (source === 'web') {
      const existingId = await currentCartId(req)
      if (existingId) {
        const existing = await getCart(existingId)
        if (existing && existing.status === 'open') return ok(existing, { status: 200 })
      }
    }

    const cart = await createCart(source)
    if (source !== 'mcp') await setCartCookie(cart.id)
    return ok(cart, { status: 201 })
  })
}

/** Convenience for the browser: resolve "my" cart without knowing its id. */
export async function GET(req: Request) {
  return handle(async () => {
    const cartId = await currentCartId(req)
    if (!cartId) return ok(null)
    return ok(await getCart(cartId))
  })
}
