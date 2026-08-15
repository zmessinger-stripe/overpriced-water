import { getCheckoutStatus } from '@/lib/commerce/checkout'
import { handle, ok } from '@/lib/api/respond'

export async function GET(
  _req: Request,
  ctx: RouteContext<'/api/checkout-sessions/[sessionId]'>,
) {
  return handle(async () => {
    const { sessionId } = await ctx.params
    return ok(await getCheckoutStatus(sessionId))
  })
}
