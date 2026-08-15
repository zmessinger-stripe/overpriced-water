import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getCategory, listCategories, listProducts } from '@/lib/commerce/catalog'
import { ProductCard } from '@/components/catalog/ProductCard'
import { FilterRail } from '@/components/catalog/FilterRail'
import { Reveal } from '@/components/motion/Reveal'
import type { ProductQuery } from '@/lib/commerce/catalog'

export async function generateStaticParams() {
  const categories = await listCategories()
  return categories.map((c) => ({ category: c.slug }))
}

export async function generateMetadata({
  params,
}: PageProps<'/water/[category]'>): Promise<Metadata> {
  const { category: slug } = await params
  const category = await getCategory(slug)
  if (!category) return { title: 'Not found' }
  return { title: category.name, description: category.tagline }
}

/** `price=4000-6999` collapses two filters into one shareable token. Open ends are allowed. */
function parsePrice(raw: string | undefined): Pick<ProductQuery, 'minPriceCents' | 'maxPriceCents'> {
  if (!raw) return {}
  const [min, max] = raw.split('-')
  return {
    minPriceCents: min ? Number(min) : undefined,
    maxPriceCents: max ? Number(max) : undefined,
  }
}

const SORTS = new Set(['featured', 'price_asc', 'price_desc', 'name_asc'])

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<'/water/[category]'>) {
  const [{ category: slug }, query] = await Promise.all([params, searchParams])
  const category = await getCategory(slug)
  if (!category) notFound()

  const rawSort = typeof query.sort === 'string' ? query.sort : 'featured'
  const products = await listProducts({
    category: slug,
    sort: (SORTS.has(rawSort) ? rawSort : 'featured') as ProductQuery['sort'],
    subscribable: query.subscribable === 'true' ? true : undefined,
    ...parsePrice(typeof query.price === 'string' ? query.price : undefined),
  })

  const siblings = (await listCategories()).filter((c) => c.slug !== slug)

  return (
    <>
      <header className="border-b hairline">
        <div className="mx-auto max-w-[100rem] px-5 pb-16 pt-16 md:px-10 md:pb-20 md:pt-24">
          <nav className="label-mono flex items-center gap-2 text-ink/35">
            <Link href="/" className="transition-colors hover:text-ink">
              Overpriced Water Co.
            </Link>
            <span aria-hidden>/</span>
            <span className="text-ink/60">{category.name}</span>
          </nav>

          <h1 className="display-xl mt-8 max-w-3xl text-balance">{category.tagline}</h1>
          <p className="mt-8 max-w-2xl text-base leading-relaxed text-ink/60">
            {category.hero_copy}
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-[100rem] gap-12 px-5 py-14 md:px-10 lg:grid-cols-[15rem_1fr] lg:gap-16">
        <FilterRail resultCount={products.length} />

        <div>
          {products.length === 0 ? (
            <div className="border hairline p-12 text-center">
              <p className="display-md">Nothing meets these criteria.</p>
              <p className="mt-4 text-sm text-ink/55">
                Which is, in its own way, a form of quality control. Try relaxing a filter.
              </p>
            </div>
          ) : (
            <div className="grid gap-x-8 gap-y-16 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((p, i) => (
                <Reveal key={p.id} delay={Math.min(i, 5) * 0.05}>
                  <ProductCard product={p} priority={i < 3} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="border-t hairline">
        <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-x-10 gap-y-4 px-5 py-10 md:px-10">
          <p className="label-mono text-ink/35">Continue elsewhere</p>
          {siblings.map((c) => (
            <Link
              key={c.id}
              href={`/water/${c.slug}`}
              className="display-md transition-colors hover:text-mineral"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
