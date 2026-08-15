'use client'

import Image from 'next/image'
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

/**
 * The `layoutId` matches the one on `ProductCard`, so arriving from a grid animates the bottle
 * into place instead of replacing it. Thumbnails cross-fade rather than morph — a morph between
 * a full bottle and a label crop reads as a glitch.
 */
export function ProductGallery({
  slug,
  images,
}: {
  slug: string
  images: { url: string; alt: string }[]
}) {
  const [index, setIndex] = useState(0)
  const active = images[index] ?? images[0]

  return (
    <div className="lg:sticky lg:top-28">
      <div className="relative aspect-[4/5] overflow-hidden bg-mist/45">
        <motion.div layoutId={`bottle-${slug}`} className="absolute inset-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active?.url}
              initial={{ opacity: 0, scale: 1.015 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
            >
              {active && (
                <Image
                  src={active.url}
                  alt={active.alt}
                  fill
                  priority
                  sizes="(min-width: 1024px) 45vw, 92vw"
                  className="object-contain p-8"
                />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex gap-3">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={img.alt}
              aria-pressed={i === index}
              className={`relative h-20 w-16 overflow-hidden bg-mist/45 transition-opacity ${
                i === index ? 'ring-1 ring-ink' : 'opacity-55 hover:opacity-100'
              }`}
            >
              <Image src={img.url} alt="" fill sizes="64px" className="object-contain p-1.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
