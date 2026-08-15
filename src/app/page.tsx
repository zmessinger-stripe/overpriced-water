import Image from 'next/image'
import Link from 'next/link'
import { listCategories, listProducts } from '@/lib/commerce/catalog'
import { ProductCard } from '@/components/catalog/ProductCard'
import { Reveal } from '@/components/motion/Reveal'
import { CERTIFICATIONS, FREE_SHIPPING_THRESHOLD_CENTS } from '@/lib/catalog-data'
import { money } from '@/lib/format'

// Static shell, refreshed every five minutes — the catalog changes on the order of never, but a
// reseed should not require a redeploy to become visible.
export const revalidate = 300

export default async function LandingPage() {
  const [products, categories] = await Promise.all([listProducts({ limit: 4 }), listCategories()])
  const hero = products[0]

  return (
    <>
      <Hero heroSlug={hero?.slug} heroImage={hero?.images?.[0]?.url} />
      <Manifesto />
      <Provenance />
      <WhyItCosts />
      <Bestsellers products={products} />
      <Testimonial />
      <CategoryIndex categories={categories} />
    </>
  )
}

function Hero({ heroSlug, heroImage }: { heroSlug?: string; heroImage?: string }) {
  return (
    <section className="relative overflow-hidden border-b hairline">
      <div className="mx-auto grid max-w-[100rem] gap-10 px-5 pb-20 pt-16 md:grid-cols-[1.15fr_0.85fr] md:px-10 md:pb-28 md:pt-24">
        <div className="flex flex-col justify-center">
          <p className="label-mono text-mineral">Est. this quarter · Zug, Switzerland</p>
          <h1 className="display-xl mt-6 text-balance">
            Water,
            <br />
            taken
            <br />
            <span className="italic">seriously.</span>
          </h1>
          <p className="mt-8 max-w-lg text-lg leading-relaxed text-ink/65">
            Most water is indifferent to your day. Ours has been briefed. Drawn from a single
            municipal tap, rested, decanted, and matched to the specific occasion in which you
            find yourself.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/water/by-occasion"
              className="label-mono bg-ink px-8 py-4 text-paper transition-colors hover:bg-mineral"
            >
              Browse the catalog
            </Link>
            <Link
              href="/water/collections"
              className="label-mono border-b border-ink/25 pb-1 transition-colors hover:border-ink"
            >
              View collections
            </Link>
          </div>
          <p className="label-mono mt-10 text-ink/40">
            Complimentary escorted delivery over {money(FREE_SHIPPING_THRESHOLD_CENTS)}
          </p>
        </div>

        {/* The bottle drifts. CSS keyframes rather than JS so it costs nothing and stops
            automatically under prefers-reduced-motion. */}
        <div className="relative min-h-[22rem] md:min-h-[34rem]">
          <div className="absolute inset-0 rounded-full bg-mist/50 blur-3xl" />
          {heroImage && heroSlug && (
            <Link
              href={`/products/${heroSlug}`}
              className="relative block h-full w-full"
              style={{ animation: 'drift 9s ease-in-out infinite' }}
            >
              <Image
                src={heroImage}
                alt="Monday Water, three-quarter view"
                fill
                priority
                sizes="(min-width: 768px) 40vw, 85vw"
                className="object-contain"
              />
            </Link>
          )}
        </div>
      </div>

      <div className="overflow-hidden border-t hairline py-3">
        <div
          className="flex w-max gap-10 whitespace-nowrap"
          style={{ animation: 'marquee 38s linear infinite' }}
        >
          {[...CERTIFICATIONS, ...CERTIFICATIONS].map((c, i) => (
            <span key={i} className="label-mono flex items-center gap-2.5 text-ink/45">
              <span aria-hidden className="text-mineral">
                ◇
              </span>
              {c}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function Manifesto() {
  return (
    <section className="mx-auto max-w-[100rem] px-5 py-24 md:px-10 md:py-36">
      <Reveal>
        <p className="display-lg mx-auto max-w-4xl text-balance text-center">
          There is no such thing as a general-purpose water. There is only water that has not been
          told what it is for.
        </p>
      </Reveal>
      <Reveal delay={0.12}>
        <p className="mx-auto mt-10 max-w-xl text-center text-sm leading-relaxed text-ink/55">
          Every bottle we sell is assigned a single occasion and is unsuitable for all others. This
          is not a limitation. It is the product.
        </p>
      </Reveal>
    </section>
  )
}

const PROVENANCE = [
  {
    step: '01',
    title: 'One tap',
    body: 'A single municipal outlet in Zug, Switzerland. We hold no exclusive rights to it. Anyone may use it. Almost nobody does, which is functionally the same thing.',
  },
  {
    step: '02',
    title: 'Nine hours of rest',
    body: 'The water sits in a stainless vessel under low light. Nothing is added. Nothing is removed. Time passes, and we charge for it.',
  },
  {
    step: '03',
    title: 'Panel review',
    body: 'Six tasters assess each batch for tonal accuracy. Four must approve. Dissent is recorded on the label and considered part of the provenance.',
  },
  {
    step: '04',
    title: 'Escorted delivery',
    body: 'Your water is not shipped. It is accompanied. The distinction costs eighteen dollars and is, we maintain, worth it.',
  },
]

function Provenance() {
  return (
    <section className="border-y hairline bg-mist/25">
      <div className="mx-auto max-w-[100rem] px-5 py-24 md:px-10 md:py-32">
        <Reveal>
          <p className="label-mono text-mineral">Provenance</p>
          <h2 className="display-lg mt-5 max-w-2xl text-balance">
            Four steps, none of which improve the water.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-px bg-ink/10 md:grid-cols-2 xl:grid-cols-4">
          {PROVENANCE.map((item, i) => (
            <Reveal key={item.step} delay={i * 0.08}>
              <div className="h-full bg-paper p-8">
                <span className="label-mono text-mineral">{item.step}</span>
                <h3 className="display-md mt-6">{item.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-ink/60">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

const COSTS = [
  ['Water', '$0.004'],
  ['Glass of consequence', '$6.10'],
  ['Nine hours of rest', '$11.00'],
  ['Panel review (6 tasters)', '$9.40'],
  ['Label, letterpressed', '$4.20'],
  ['Our conviction', '$7.30'],
]

function WhyItCosts() {
  return (
    <section className="mx-auto max-w-[100rem] px-5 py-24 md:px-10 md:py-32">
      <div className="grid gap-16 md:grid-cols-2">
        <Reveal>
          <p className="label-mono text-mineral">On price</p>
          <h2 className="display-lg mt-5 text-balance">Why it costs what it costs.</h2>
          <p className="mt-8 max-w-md text-base leading-relaxed text-ink/60">
            We are frequently asked to justify our prices. We are happy to. Below is a complete
            accounting of a single 330ml bottle of Monday Water. Note that the water itself is the
            least expensive line.
          </p>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-ink/45">
            We do not consider this a problem. Nobody has ever been moved by a raw material.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <dl className="font-mono text-sm">
            {COSTS.map(([label, value]) => (
              <div key={label} className="spec-row">
                <dt className="text-ink/60">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            <div className="spec-row border-t-2 border-t-ink pt-4">
              <dt className="label-mono">Retail</dt>
              <dd className="text-lg">$38.00</dd>
            </div>
          </dl>
        </Reveal>
      </div>
    </section>
  )
}

function Bestsellers({ products }: { products: Awaited<ReturnType<typeof listProducts>> }) {
  return (
    <section className="border-t hairline">
      <div className="mx-auto max-w-[100rem] px-5 py-24 md:px-10 md:py-32">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="label-mono text-mineral">Currently selling</p>
            <h2 className="display-lg mt-5">The considered four.</h2>
          </div>
          <Link
            href="/water/by-occasion"
            className="label-mono border-b border-ink/25 pb-1 transition-colors hover:border-ink"
          >
            All water
          </Link>
        </div>

        <div className="mt-16 grid gap-x-8 gap-y-16 md:grid-cols-2 xl:grid-cols-4">
          {products.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.06}>
              <ProductCard product={p} priority={i < 2} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Testimonial() {
  return (
    <section className="bg-ink text-paper">
      <div className="mx-auto max-w-4xl px-5 py-28 text-center md:px-10 md:py-40">
        <Reveal>
          <p className="display-lg text-balance">
            &ldquo;I own a standing desk. For the first time, my water understands the implications
            of that.&rdquo;
          </p>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="label-mono mt-10 text-paper/45">
            M. Vogel · verified purchaser · stands 6.5 hours daily
          </p>
        </Reveal>
      </div>
    </section>
  )
}

function CategoryIndex({ categories }: { categories: Awaited<ReturnType<typeof listCategories>> }) {
  return (
    <section className="mx-auto max-w-[100rem] px-5 py-24 md:px-10 md:py-32">
      <div className="grid gap-px bg-ink/10 md:grid-cols-3">
        {categories.map((c, i) => (
          <Reveal key={c.id} delay={i * 0.08}>
            <Link
              href={`/water/${c.slug}`}
              className="group flex h-full flex-col bg-paper p-8 transition-colors hover:bg-mist/40"
            >
              <p className="label-mono text-mineral">{`0${i + 1}`}</p>
              <h3 className="display-md mt-6">{c.name}</h3>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-ink/60">{c.tagline}</p>
              <span className="label-mono mt-8 inline-flex items-center gap-2 text-ink/50 transition-colors group-hover:text-ink">
                Enter
                <span
                  aria-hidden
                  className="transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1.5"
                >
                  →
                </span>
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
