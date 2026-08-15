import { resolveOrderForSession } from '@/lib/commerce/orders'
import { fail, handle, ok } from '@/lib/api/respond'

/**
 * Possession of the Checkout Session id is the grant — the same rule the confirmation page
 * uses. Falls back to creating the order inline if the webhook has not landed.
 */
export async function GET(
  _req: Request,
  ctx: RouteContext<'/api/orders/by-session/[sessionId]'>,
) {
  return handle(async () => {
    const { sessionId } = await ctx.params
    const order = await resolveOrderForSession(sessionId)
    if (!order) {
      return fail(
        'order_pending',
        'Payment for this session has not settled yet. Poll this endpoint again shortly.',
        409,
      )
    }
    return ok(order)
  })
}
