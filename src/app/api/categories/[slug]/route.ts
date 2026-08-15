import { getCategory, listProducts } from '@/lib/commerce/catalog'
import { CATALOG_CACHE, fail, handle, ok } from '@/lib/api/respond'

export async function GET(_req: Request, ctx: RouteContext<'/api/categories/[slug]'>) {
  return handle(async () => {
    const { slug } = await ctx.params
    const category = await getCategory(slug)
    if (!category) return fail('category_not_found', `No category "${slug}".`, 404)
    const products = await listProducts({ category: slug })
    return ok({ ...category, products }, { headers: CATALOG_CACHE })
  })
}
