import { getProduct } from '@/lib/commerce/catalog'
import { CATALOG_CACHE, fail, handle, ok } from '@/lib/api/respond'

export async function GET(_req: Request, ctx: RouteContext<'/api/products/[slug]'>) {
  return handle(async () => {
    const { slug } = await ctx.params
    const product = await getProduct(slug)
    if (!product) return fail('product_not_found', `No product "${slug}".`, 404)
    return ok(product, { headers: CATALOG_CACHE })
  })
}
