/**
 * Seeds Stripe (test mode) and Postgres from src/lib/catalog-data.ts.
 *
 * Idempotent. Stripe Products use a deterministic ID derived from the SKU so a re-run
 * retrieves rather than recreates; Prices are matched by unit_amount + recurrence on that
 * product; Postgres rows upsert on slug/sku. Running this twice produces no duplicates.
 *
 * The first cut used `stripe.products.search({ query: "metadata['owc_sku']:'…'" })` and was
 * NOT idempotent: the Search API is eventually consistent, so a re-run seconds later found
 * nothing and created a second copy of every product. `products.retrieve(id)` is strongly
 * consistent, which is why the deterministic ID matters here. (README friction S3.)
 *
 *   npm run seed
 */
import 'dotenv/config'
import { stripe } from '../src/lib/stripe'
import { sql } from '../src/lib/db/client'
import {
  CATEGORIES,
  PRODUCTS,
  SUBSCRIPTION_INTERVAL,
  subscriptionPriceCents,
  type SeedProduct,
  type SeedVariant,
} from '../src/lib/catalog-data'

const log = (...a: unknown[]) => console.log(...a)

/** Placeholder imagery: a deterministic gradient per product, rendered as inline SVG. */
function imagesFor(p: SeedProduct) {
  return [
    { url: `/bottles/${p.slug}.svg`, alt: `${p.name} — 3/4 view` },
    { url: `/bottles/${p.slug}-detail.svg`, alt: `${p.name} — label detail` },
  ]
}

/** `OWC-MON-330` → `owc_mon_330`. Stable across runs, so retrieve-or-create works. */
function stripeProductId(sku: string) {
  return sku.toLowerCase().replace(/[^a-z0-9]+/g, '_')
}

async function upsertStripeVariant(product: SeedProduct, v: SeedVariant) {
  const id = stripeProductId(v.sku)

  const payload = {
    name: `${product.name} — ${v.name}`,
    description: product.subtitle,
    active: true,
    metadata: {
      owc_sku: v.sku,
      owc_product_slug: product.slug,
      owc_size_ml: String(v.sizeMl),
    },
  }

  let sp: Awaited<ReturnType<typeof stripe.products.retrieve>>
  try {
    await stripe.products.retrieve(id)
    sp = await stripe.products.update(id, payload)
  } catch (err) {
    if ((err as { code?: string }).code !== 'resource_missing') throw err
    sp = await stripe.products.create({ id, ...payload })
    log(`  + stripe product ${v.sku} → ${sp.id}`)
  }

  const existing = await stripe.prices.list({ product: sp.id, limit: 100, active: true })

  const oneTime =
    existing.data.find((p) => !p.recurring && p.unit_amount === v.priceCents) ??
    (await stripe.prices.create({
      product: sp.id,
      unit_amount: v.priceCents,
      currency: 'usd',
      metadata: { owc_sku: v.sku, owc_kind: 'one_time' },
    }))

  const subCents = subscriptionPriceCents(v.priceCents)
  const recurring = product.subscriptionEligible
    ? (existing.data.find(
        (p) => p.recurring?.interval === SUBSCRIPTION_INTERVAL && p.unit_amount === subCents,
      ) ??
      (await stripe.prices.create({
        product: sp.id,
        unit_amount: subCents,
        currency: 'usd',
        recurring: { interval: SUBSCRIPTION_INTERVAL },
        metadata: { owc_sku: v.sku, owc_kind: 'subscription' },
      })))
    : null

  return { oneTimeId: oneTime.id, recurringId: recurring?.id ?? null }
}

async function main() {
  log('→ categories')
  for (const c of CATEGORIES) {
    await sql`
      insert into categories (slug, name, tagline, hero_copy, sort_order)
      values (${c.slug}, ${c.name}, ${c.tagline}, ${c.heroCopy}, ${c.sortOrder})
      on conflict (slug) do update set
        name = excluded.name,
        tagline = excluded.tagline,
        hero_copy = excluded.hero_copy,
        sort_order = excluded.sort_order
    `
  }

  const catIds = new Map<string, string>()
  for (const row of await sql<{ id: string; slug: string }[]>`select id, slug from categories`) {
    catIds.set(row.slug, row.id)
  }

  log('→ products + stripe prices')
  for (const [i, p] of PRODUCTS.entries()) {
    log(`  ${p.slug}`)
    const categoryId = catIds.get(p.category)
    if (!categoryId) throw new Error(`unknown category ${p.category} on ${p.slug}`)

    const [row] = await sql<{ id: string }[]>`
      insert into products (
        slug, name, subtitle, description, story, kind, category_id,
        hydration_index, ph, source, tasting_notes, images, badges,
        subscription_eligible, sort_order
      ) values (
        ${p.slug}, ${p.name}, ${p.subtitle}, ${p.description}, ${p.story},
        ${p.kind}, ${categoryId}, ${p.hydrationIndex}, ${p.ph}, ${p.source},
        ${p.tastingNotes}, ${sql.json(imagesFor(p))}, ${p.badges},
        ${p.subscriptionEligible}, ${i}
      )
      on conflict (slug) do update set
        name = excluded.name,
        subtitle = excluded.subtitle,
        description = excluded.description,
        story = excluded.story,
        kind = excluded.kind,
        category_id = excluded.category_id,
        hydration_index = excluded.hydration_index,
        ph = excluded.ph,
        source = excluded.source,
        tasting_notes = excluded.tasting_notes,
        images = excluded.images,
        badges = excluded.badges,
        subscription_eligible = excluded.subscription_eligible,
        sort_order = excluded.sort_order
      returning id
    `

    for (const [j, v] of p.variants.entries()) {
      const { oneTimeId, recurringId } = await upsertStripeVariant(p, v)
      await sql`
        insert into product_variants (
          product_id, sku, name, size_ml, price_cents, compare_at_cents,
          stripe_price_id, stripe_subscription_price_id, is_default, sort_order
        ) values (
          ${row.id}, ${v.sku}, ${v.name}, ${v.sizeMl}, ${v.priceCents},
          ${v.compareAtCents ?? null}, ${oneTimeId}, ${recurringId},
          ${v.isDefault ?? false}, ${j}
        )
        on conflict (sku) do update set
          product_id = excluded.product_id,
          name = excluded.name,
          size_ml = excluded.size_ml,
          price_cents = excluded.price_cents,
          compare_at_cents = excluded.compare_at_cents,
          stripe_price_id = excluded.stripe_price_id,
          stripe_subscription_price_id = excluded.stripe_subscription_price_id,
          is_default = excluded.is_default,
          sort_order = excluded.sort_order
      `
    }
  }

  log('→ bundle contents')
  for (const p of PRODUCTS) {
    if (!p.contents?.length) continue
    const [bundle] = await sql<{ id: string }[]>`select id from products where slug = ${p.slug}`
    await sql`delete from bundle_items where bundle_product_id = ${bundle.id}`
    for (const c of p.contents) {
      const [v] = await sql<{ id: string }[]>`select id from product_variants where sku = ${c.sku}`
      if (!v) throw new Error(`bundle ${p.slug} references unknown sku ${c.sku}`)
      await sql`
        insert into bundle_items (bundle_product_id, variant_id, quantity)
        values (${bundle.id}, ${v.id}, ${c.quantity})
        on conflict (bundle_product_id, variant_id) do update set quantity = excluded.quantity
      `
    }
  }

  const [{ count: productCount }] = await sql<{ count: string }[]>`select count(*) from products`
  const [{ count: variantCount }] =
    await sql<{ count: string }[]>`select count(*) from product_variants`
  log(`✓ seeded ${productCount} products, ${variantCount} variants`)
  await sql.end()
}

main().catch(async (err) => {
  console.error(err)
  await sql.end().catch(() => {})
  process.exit(1)
})
