'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'motion/react'
import type { Product } from '@/lib/db/types'
import { money, volume } from '@/lib/format'

/**
 * Editorial grid card. The bottle carries `layoutId="bottle-<slug>"`, which is the other half
 * of the shared-layout morph on the PDP — click a card and the bottle flies into the gallery
 * rather than the page swapping under you.
 */
export function ProductCard({ product, priority }: { product: Product; priority?: boolean }) {
  const cheapest = product.variants.reduce(
    (min, v) => (v.price_cents < min.price_cents ? v : min),
    product.variants[0],
  )
  const image = product.images?.[0]

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group relative flex flex-col border-t hairline pt-6"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-mist/40">
        {image && (
          <motion.div layoutId={`bottle-${product.slug}`} className="absolute inset-0">
            <Image
              src={image.url}
              alt={image.alt}
              fill
              priority={priority}
              sizes="(min-width: 1280px) 22vw, (min-width: 768px) 33vw, 90vw"
              className="object-contain p-6 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
            />
          </motion.div>
        )}

        {product.kind === 'bundle' && (
          <span className="label-mono absolute left-3 top-3 bg-ink px-2 py-1 text-paper">
            Collection
          </span>
        )}

        {/* Hover-revealed spec plate. Clinical, mono, and slightly too much information. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-paper/95 px-4 py-3 backdrop-blur transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0">
          <dl className="grid grid-cols-3 gap-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink/60">
            <div>
              <dt className="text-ink/35">pH</dt>
              <dd className="mt-0.5 text-ink">{Number(product.ph).toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-ink/35">Index</dt>
              <dd className="mt-0.5 text-ink">{Number(product.hydration_index).toFixed(1)}</dd>
            </div>
            <div>
              <dt className="text-ink/35">Sizes</dt>
              <dd className="mt-0.5 text-ink">{product.variants.length}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="display-md text-balance">{product.name}</h3>
          <span className="shrink-0 font-mono text-sm text-mineral">
            {money(cheapest.price_cents)}
          </span>
        </div>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink/55">{product.subtitle}</p>

        <div className="mt-4 flex items-center gap-3">
          <span className="label-mono text-ink/40">{volume(cheapest.size_ml)}</span>
          {product.subscription_eligible && (
            <span className="label-mono text-mineral">Subscribable</span>
          )}
        </div>
      </div>
    </Link>
  )
}
