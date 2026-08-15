import { sql } from '@/lib/db/client'
import type { Category, Product, Variant } from '@/lib/db/types'
import { subscriptionPriceCents } from '@/lib/catalog-data'

const PRODUCT_SELECT = sql`
  select
    p.id, p.slug, p.name, p.subtitle, p.description, p.story, p.kind,
    p.category_id, p.hydration_index, p.ph, p.source, p.tasting_notes,
    p.images, p.badges, p.subscription_eligible, p.sort_order,
    c.slug as category_slug, c.name as category_name
  from products p
  join categories c on c.id = p.category_id
`

async function attachVariants(rows: Omit<Product, 'variants'>[]): Promise<Product[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const variants = await sql<Variant[]>`
    select * from product_variants
    where product_id in ${sql(ids)}
    order by sort_order asc
  `
  const byProduct = new Map<string, Variant[]>()
  for (const v of variants) {
    const list = byProduct.get(v.product_id) ?? []
    list.push(v)
    byProduct.set(v.product_id, list)
  }
  return rows.map((r) => ({ ...r, variants: byProduct.get(r.id) ?? [] }))
}

export async function listCategories(): Promise<Category[]> {
  return sql<Category[]>`
    select id, slug, name, tagline, hero_copy, sort_order
    from categories order by sort_order asc
  `
}

export async function getCategory(slug: string): Promise<Category | null> {
  const [row] = await sql<Category[]>`
    select id, slug, name, tagline, hero_copy, sort_order
    from categories where slug = ${slug}
  `
  return row ?? null
}

export interface ProductQuery {
  category?: string
  q?: string
  minPriceCents?: number
  maxPriceCents?: number
  subscribable?: boolean
  sort?: 'featured' | 'price_asc' | 'price_desc' | 'name_asc'
  limit?: number
}

/**
 * The one product query. Powers the PLP, the landing page, the REST catalog endpoint,
 * and the `search_products` agent tool — so all four rank and filter identically.
 */
export async function listProducts(query: ProductQuery = {}): Promise<Product[]> {
  const { category, q, minPriceCents, maxPriceCents, subscribable, sort = 'featured' } = query
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100)

  const rows = await sql<Omit<Product, 'variants'>[]>`
    ${PRODUCT_SELECT}
    where p.active
      ${category ? sql`and c.slug = ${category}` : sql``}
      ${
        q
          ? sql`and (
              p.name ilike ${'%' + q + '%'} or
              p.subtitle ilike ${'%' + q + '%'} or
              p.description ilike ${'%' + q + '%'} or
              array_to_string(p.tasting_notes, ' ') ilike ${'%' + q + '%'}
            )`
          : sql``
      }
      ${subscribable === true ? sql`and p.subscription_eligible` : sql``}
      ${
        minPriceCents != null
          ? sql`and exists (select 1 from product_variants v where v.product_id = p.id and v.price_cents >= ${minPriceCents})`
          : sql``
      }
      ${
        maxPriceCents != null
          ? sql`and exists (select 1 from product_variants v where v.product_id = p.id and v.price_cents <= ${maxPriceCents})`
          : sql``
      }
    order by
      ${
        sort === 'price_asc'
          ? sql`(select min(v.price_cents) from product_variants v where v.product_id = p.id) asc`
          : sort === 'price_desc'
            ? sql`(select min(v.price_cents) from product_variants v where v.product_id = p.id) desc`
            : sort === 'name_asc'
              ? sql`p.name asc`
              : sql`p.sort_order asc`
      }
    limit ${limit}
  `
  return attachVariants(rows)
}

export async function getProduct(slug: string): Promise<Product | null> {
  const rows = await sql<Omit<Product, 'variants'>[]>`
    ${PRODUCT_SELECT} where p.slug = ${slug} and p.active
  `
  const [product] = await attachVariants(rows)
  if (!product) return null

  if (product.kind === 'bundle') {
    product.contents = await sql<
      { name: string; sku: string; quantity: number; product_slug: string }[]
    >`
      select v.name, v.sku, b.quantity, cp.slug as product_slug
      from bundle_items b
      join product_variants v on v.id = b.variant_id
      join products cp on cp.id = v.product_id
      where b.bundle_product_id = ${product.id}
      order by cp.sort_order asc
    `
  }
  return product
}

export async function getVariantBySku(sku: string): Promise<Variant | null> {
  const [row] = await sql<Variant[]>`select * from product_variants where sku = ${sku}`
  return row ?? null
}

export async function getVariantById(id: string): Promise<Variant | null> {
  const [row] = await sql<Variant[]>`select * from product_variants where id = ${id}`
  return row ?? null
}

/** Compact shape handed to agents — no HTML, no ids they cannot use, prices in dollars. */
export function toAgentProduct(p: Product) {
  return {
    slug: p.slug,
    name: p.name,
    subtitle: p.subtitle,
    description: p.description,
    category: p.category_slug,
    kind: p.kind,
    source: p.source,
    ph: Number(p.ph),
    hydration_index: Number(p.hydration_index),
    tasting_notes: p.tasting_notes,
    badges: p.badges,
    subscription_eligible: p.subscription_eligible,
    url: `/products/${p.slug}`,
    variants: p.variants.map((v) => ({
      sku: v.sku,
      name: v.name,
      size_ml: v.size_ml,
      price_usd: v.price_cents / 100,
      subscription_price_usd: v.stripe_subscription_price_id
        ? subscriptionPriceCents(v.price_cents) / 100
        : null,
      in_stock: v.inventory > 0,
      is_default: v.is_default,
    })),
    contents: p.contents,
  }
}
