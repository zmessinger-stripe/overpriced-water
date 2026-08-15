import { removeItem, updateItem } from '@/lib/commerce/cart'
import { handle, ok } from '@/lib/api/respond'
import { body, updateItemSchema } from '@/lib/api/validate'

export async function PATCH(
  req: Request,
  ctx: RouteContext<'/api/carts/[cartId]/items/[itemId]'>,
) {
  return handle(async () => {
    const { cartId, itemId } = await ctx.params
    const { quantity } = await body(req, updateItemSchema)
    return ok(await updateItem(cartId, itemId, quantity))
  })
}

export async function DELETE(
  _req: Request,
  ctx: RouteContext<'/api/carts/[cartId]/items/[itemId]'>,
) {
  return handle(async () => {
    const { cartId, itemId } = await ctx.params
    return ok(await removeItem(cartId, itemId))
  })
}
