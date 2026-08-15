import { addItem, clearCart } from '@/lib/commerce/cart'
import { handle, ok } from '@/lib/api/respond'
import { addItemSchema, body } from '@/lib/api/validate'
import { captureServer } from '@/lib/analytics/server'

export async function POST(req: Request, ctx: RouteContext<'/api/carts/[cartId]/items'>) {
  return handle(async () => {
    const { cartId } = await ctx.params
    const input = await body(req, addItemSchema)
    const cart = await addItem(cartId, input)

    const line = cart.items.find(
      (i) =>
        (input.sku ? i.sku === input.sku : i.variant_id === input.variantId) &&
        i.purchase_kind === input.purchaseKind,
    )
    await captureServer({
      event: 'add_to_cart',
      distinctId: cartId,
      properties: {
        sku: line?.sku ?? input.sku,
        product: line?.product_name,
        quantity: input.quantity,
        purchase_kind: input.purchaseKind,
        value: (line?.unit_price_cents ?? 0) / 100,
        cart_total: cart.totals.total_cents / 100,
      },
    })

    return ok(cart, { status: 201 })
  })
}

/** Empties the cart. */
export async function DELETE(_req: Request, ctx: RouteContext<'/api/carts/[cartId]/items'>) {
  return handle(async () => {
    const { cartId } = await ctx.params
    return ok(await clearCart(cartId))
  })
}
