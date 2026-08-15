'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { useCart } from '@/components/cart/CartProvider'

const NAV = [
  { href: '/water/by-occasion', label: 'By Occasion' },
  { href: '/water/by-identity', label: 'By Identity' },
  { href: '/water/collections', label: 'Collections' },
]

export function SiteHeader() {
  const { cart, openDrawer } = useCart()
  const pathname = usePathname()
  const count = cart?.totals.item_count ?? 0

  return (
    <header className="sticky top-0 z-40 border-b hairline bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[100rem] items-center gap-8 px-5 md:px-10">
        <Link href="/" className="group flex items-baseline gap-2.5">
          <span className="display-md leading-none">Overpriced Water</span>
          <span className="label-mono hidden text-mineral/70 transition-colors group-hover:text-mineral sm:inline">
            Co.
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-7 md:flex">
          {NAV.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className="label-mono relative py-1 text-ink/60 transition-colors hover:text-ink"
              >
                {item.label}
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute -bottom-px left-0 right-0 h-px bg-ink"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        <button
          type="button"
          onClick={openDrawer}
          className="label-mono ml-auto flex items-center gap-2 rounded-full border hairline px-4 py-2 transition-colors hover:bg-ink hover:text-paper md:ml-0"
          aria-label={`Open cart, ${count} ${count === 1 ? 'item' : 'items'}`}
        >
          Cart
          <span className="relative inline-flex h-5 min-w-5 items-center justify-center">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={count}
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 10, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-electrolyte px-1.5 text-[0.6875rem] text-ink"
              >
                {count}
              </motion.span>
            </AnimatePresence>
          </span>
        </button>
      </div>
    </header>
  )
}
