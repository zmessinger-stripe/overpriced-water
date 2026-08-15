'use client'

import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { useCart } from '@/components/cart/CartProvider'
import { money } from '@/lib/format'

export function CartDrawer() {
  const { cart, drawerOpen, closeDrawer, setQuantity, removeItem } = useCart()
  const items = cart?.items ?? []

  return (
    <AnimatePresence>
      {drawerOpen && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={closeDrawer}
            className="fixed inset-0 z-50 bg-ink/35 backdrop-blur-[2px]"
          />
          <motion.aside
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-paper shadow-2xl"
            role="dialog"
            aria-label="Cart"
          >
            <div className="flex items-center justify-between border-b hairline px-6 py-5">
              <p className="label-mono">Your selection</p>
              <button
                type="button"
                onClick={closeDrawer}
                className="label-mono text-ink/50 transition-colors hover:text-ink"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6">
              {items.length === 0 ? (
                <p className="py-16 text-center text-sm text-ink/50">
                  Nothing yet. A regrettable state of hydration.
                </p>
              ) : (
                <ul>
                  {items.map((item) => (
                    <motion.li
                      key={item.id}
                      layout
                      exit={{ opacity: 0, height: 0 }}
                      className="flex gap-4 border-b hairline py-5"
                    >
                      <Link
                        href={`/products/${item.product_slug}`}
                        onClick={closeDrawer}
                        className="relative h-24 w-20 shrink-0 overflow-hidden rounded-sm bg-mist/50"
                      >
                        {item.image && (
                          <Image
                            src={item.image.url}
                            alt={item.image.alt}
                            fill
                            sizes="80px"
                            className="object-contain p-1"
                          />
                        )}
                      </Link>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.product_name}</p>
                        <p className="mt-0.5 font-mono text-xs text-ink/50">{item.variant_name}</p>
                        {item.purchase_kind === 'subscription' && (
                          <p className="label-mono mt-1.5 inline-block bg-electrolyte px-1.5 py-0.5 text-[0.625rem]">
                            Monthly · −15%
                          </p>
                        )}

                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-3 rounded-full border hairline px-2.5 py-1">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              onClick={() => setQuantity(item.id, item.quantity - 1)}
                              className="text-ink/60 transition-colors hover:text-ink"
                            >
                              −
                            </button>
                            <span className="w-4 text-center font-mono text-xs">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label="Increase quantity"
                              onClick={() => setQuantity(item.id, item.quantity + 1)}
                              className="text-ink/60 transition-colors hover:text-ink"
                            >
                              +
                            </button>
                          </div>
                          <span className="font-mono text-sm">{money(item.line_total_cents)}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="label-mono mt-2.5 text-[0.625rem] text-ink/40 underline decoration-dotted transition-colors hover:text-ink"
                        >
                          Reconsider
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>

            {items.length > 0 && (
              <div className="border-t hairline px-6 py-5">
                <div className="flex items-baseline justify-between">
                  <span className="label-mono text-ink/50">Subtotal</span>
                  <span className="font-mono text-lg">{money(cart!.totals.subtotal_cents)}</span>
                </div>
                <p className="mt-1.5 text-xs text-ink/45">
                  Delivery and concierge handling calculated at checkout.
                </p>
                <Link
                  href="/cart"
                  onClick={closeDrawer}
                  className="label-mono mt-5 block bg-ink py-4 text-center text-paper transition-colors hover:bg-mineral"
                >
                  Review the cart
                </Link>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
