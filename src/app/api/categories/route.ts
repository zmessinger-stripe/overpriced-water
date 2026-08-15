import { listCategories } from '@/lib/commerce/catalog'
import { CATALOG_CACHE, handle, ok } from '@/lib/api/respond'

export async function GET() {
  return handle(async () => {
    const categories = await listCategories()
    return ok(categories, { meta: { count: categories.length }, headers: CATALOG_CACHE })
  })
}
