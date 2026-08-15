import { listProducts, type ProductQuery } from '@/lib/commerce/catalog'
import { CATALOG_CACHE, handle, ok } from '@/lib/api/respond'
import { intParam, searchParams } from '@/lib/api/validate'

const SORTS = ['featured', 'price_asc', 'price_desc', 'name_asc'] as const

export async function GET(req: Request) {
  return handle(async () => {
    const sp = searchParams(req)
    const sortRaw = sp.get('sort')
    const query: ProductQuery = {
      category: sp.get('category') ?? undefined,
      q: sp.get('q') ?? undefined,
      minPriceCents: intParam(sp, 'min_price'),
      maxPriceCents: intParam(sp, 'max_price'),
      subscribable: sp.get('subscribable') === 'true' ? true : undefined,
      sort: SORTS.includes(sortRaw as (typeof SORTS)[number])
        ? (sortRaw as ProductQuery['sort'])
        : 'featured',
      limit: intParam(sp, 'limit'),
    }
    const products = await listProducts(query)
    return ok(products, { meta: { count: products.length, query }, headers: CATALOG_CACHE })
  })
}
