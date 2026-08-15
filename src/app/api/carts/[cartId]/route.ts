import { getCart, setEmail } from '@/lib/commerce/cart'
import { fail, handle, ok } from '@/lib/api/respond'
import { body, patchCartSchema } from '@/lib/api/validate'

export async function GET(_req: Request, ctx: RouteContext<'/api/carts/[cartId]'>) {
  return handle(async () => {
    const { cartId } = await ctx.params
    const cart = await getCart(cartId)
    if (!cart) return fail('cart_not_found', `No cart with id ${cartId}.`, 404)
    return ok(cart)
  })
}

export async function PATCH(req: Request, ctx: RouteContext<'/api/carts/[cartId]'>) {
  return handle(async () => {
    const { cartId } = await ctx.params
    const { email } = await body(req, patchCartSchema)
    return ok(await setEmail(cartId, email))
  })
}
