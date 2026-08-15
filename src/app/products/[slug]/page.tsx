import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProduct, listProducts } from '@/lib/commerce/catalog'
import { ProductGallery } from '@/components/catalog/ProductGallery'
import { PurchasePanel } from '@/components/catalog/PurchasePanel'
import { ProductCard } from '@/components/catalog/ProductCard'
import { Reveal } from '@/components/motion/Reveal'
import { money, volume } from '@/lib/format'
import { HeroClaim } from '@/components/catalog/HeroClaim'

export async function generateMetadata({ params }: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) return { title: 'Not found' }
  return {
    title: product.name,
    description: product.subtitle,
    openGraph: { title: product.name, description: product.subtitle, images: product.images?.[0]?.url },
  }
}

export default async function ProductPage({ params }: PageProps<'/products/[slug]'>) {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) notFound()

  const related = (await listProducts({ category: product.category_slug, limit: 4 })).filter(
    (p) => p.slug !== product.slug,
  )

  const cheapest = product.variants.reduce(
    (min, v) => (v.price_cents < min.price_cents ? v : min),
    product.variants[0],
  )

  const specs: [string, string][] = [
    ['Source', product.source],
    ['pH', `${Number(product.ph).toFixed(2)} ± 0.02`],
    ['Hydration Index', Number(product.hydration_index).toFixed(1)],
    ['Formats', product.variants.map((v) => volume(v.size_ml)).join(' · ')],
    ['Vessel', 'Glass of consequence, 4mm'],
    ['Panel', 'Approved, 4 of 6'],
    ['Orientation', 'Bottled facing north'],
  ]

  return (
    <>
      <div className="mx-auto grid max-w-[100rem] gap-12 px-5 pb-20 pt-10 md:px-10 lg:grid-cols-2 lg:gap-20 lg:pt-16">
        <ProductGallery slug={product.slug} images={product.images ?? []} />

        <div>
          <nav className="label-mono flex items-center gap-2 text-ink/35">
            <Link href={`/water/${product.category_slug}`} className="transition-colors hover:text-ink">
              {product.category_name}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-ink/60">{product.name}</span>
          </nav>

          <h1 className="display-lg mt-6 text-balance">{product.name}</h1>
          <HeroClaim
            subtitle={product.subtitle}
            priceLine={`${money(cheapest.price_cents)} for ${volume(cheapest.size_ml)}. We have never once been asked to explain that twice.`}
          />

          {product.badges?.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2">
              {product.badges.map((b) => (
                <li key={b} className="label-mono border hairline px-2.5 py-1 text-ink/50">
                  {b}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-8 max-w-lg text-base leading-relaxed text-ink/70">{product.description}</p>

          <div className="mt-10">
            <PurchasePanel product={product} />
          </div>

          {product.contents && product.contents.length > 0 && (
            <div className="mt-10 border-t hairline pt-6">
              <p className="label-mono text-ink/35">In the case</p>
              <ul className="mt-4 divide-y divide-ink/10">
                {product.contents.map((c) => (
                  <li key={c.sku} className="flex items-baseline justify-between gap-4 py-3">
                    <Link
                      href={`/products/${c.product_slug}`}
                      className="text-sm transition-colors hover:text-mineral"
                    >
                      {c.name}
                    </Link>
                    <span className="label-mono text-ink/40">×{c.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <section className="border-y hairline bg-mist/25">
        <div className="mx-auto grid max-w-[100rem] gap-12 px-5 py-20 md:px-10 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <p className="label-mono text-mineral">The story, such as it is</p>
            <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-ink/70">
              {product.story}
            </p>

            {product.tasting_notes?.length > 0 && (
              <div className="mt-10">
                <p className="label-mono text-ink/35">Tasting notes</p>
                <p className="display-md mt-3 text-balance">{product.tasting_notes.join(' · ')}</p>
              </div>
            )}
          </Reveal>

          <Reveal delay={0.1}>
            <p className="label-mono text-mineral">Specification</p>
            <dl className="mt-6 font-mono text-sm">
              {specs.map(([label, value]) => (
                <div key={label} className="spec-row">
                  <dt className="text-ink/45">{label}</dt>
                  <dd className="text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {related.length > 0 && (
        <section className="mx-auto max-w-[100rem] px-5 py-20 md:px-10 md:py-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="display-lg">Also appropriate.</h2>
            <Link
              href={`/water/${product.category_slug}`}
              className="label-mono border-b border-ink/25 pb-1 transition-colors hover:border-ink"
            >
              All of {product.category_name}
            </Link>
          </div>
          <div className="mt-14 grid gap-x-8 gap-y-16 sm:grid-cols-2 xl:grid-cols-3">
            {related.map((p, i) => (
              <Reveal key={p.id} delay={i * 0.06}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
