import { createCheckoutSession } from '@/lib/commerce/checkout'
import { handle, ok } from '@/lib/api/respond'
import { body, checkoutSessionSchema } from '@/lib/api/validate'
import { captureServer } from '@/lib/analytics/server'

/**
 * Creates (or reuses) a Checkout Session for the cart.
 *
 * Returns `409 mixed_cart` when the cart holds both one-time and subscription lines and no
 * `scope` was given — see friction S1. `uiMode: 'embedded'` yields a `client_secret` for the
 * browser; `'hosted'` yields a URL, which is the only thing a remote agent can use.
 */
export async function POST(
  req: Request,
  ctx: RouteContext<'/api/carts/[cartId]/checkout-session'>,
) {
  return handle(async () => {
    const { cartId } = await ctx.params
    const { scope, uiMode } = await body(req, checkoutSessionSchema)
    const result = await createCheckoutSession(cartId, { scope, uiMode })

    await captureServer({
      event: 'checkout_started',
      distinctId: cartId,
      properties: {
        session_id: result.session_id,
        scope: result.scope,
        ui_mode: result.ui_mode,
        value: result.total_cents / 100,
      },
    })

    return ok(result, { status: 201 })
  })
}
