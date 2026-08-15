'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useCart } from '@/components/cart/CartProvider'
import { money, volume } from '@/lib/format'
import { captureClient } from '@/lib/analytics/client'
import { FREE_SHIPPING_THRESHOLD_CENTS, SUBSCRIPTION_DISCOUNT_BPS } from '@/lib/catalog-data'
import type { CartLine, PurchaseKind, ScopeTotals } from '@/lib/db/types'

export interface Upsell {
  slug: string
  name: string
  subtitle: string
  sku: string
  priceCents: number
  image: string | null
}

const SCOPE_LABEL: Record<PurchaseKind, string> = {
  one_time: 'Single purchases',
  subscription: 'Standing orders',
}

export function CartView({ upsells }: { upsells: Upsell[] }) {
  const { cart, loading } = useCart()
  const items = cart?.items ?? []
  const reported = useRef(false)

  useEffect(() => {
    if (loading || reported.current) return
    reported.current = true
    captureClient('cart_viewed', {
      item_count: cart?.totals.item_count ?? 0,
      value_usd: (cart?.totals.total_cents ?? 0) / 100,
      is_mixed: cart?.is_mixed ?? false,
    })
  }, [cart, loading, reported])

  if (loading) {
    return <Shell><p className="py-24 text-center text-sm text-ink/40">Retrieving your intentions…</p></Shell>
  }

  if (items.length === 0) {
    return (
      <Shell>
        <div className="border hairline px-8 py-24 text-center">
          <p className="display-lg">The cart is empty.</p>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-ink/55">
            We do not judge this. We simply note it, and observe that the water is still available.
          </p>
          <Link
            href="/water/by-occasion"
            className="label-mono mt-10 inline-block bg-ink px-8 py-4 text-paper transition-colors hover:bg-mineral"
          >
            Choose an occasion
          </Link>
        </div>
      </Shell>
    )
  }

  const oneTime = items.filter((i) => i.purchase_kind === 'one_time')
  const subs = items.filter((i) => i.purchase_kind === 'subscription')

  return (
    <Shell>
      <div className="grid gap-14 lg:grid-cols-[1fr_22rem] lg:gap-20">
        <div>
          {oneTime.length > 0 && <LineGroup scope="one_time" items={oneTime} />}
          {subs.length > 0 && <LineGroup scope="subscription" items={subs} />}
          <DeliveryPreference />
          <Upsells upsells={upsells} />
        </div>

        <div className="lg:sticky lg:top-28 lg:self-start">
          <Summary />
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[100rem] px-5 pb-24 pt-12 md:px-10 md:pt-16">
      <p className="label-mono text-mineral">Step one of two</p>
      <h1 className="display-xl mt-5">The cart.</h1>
      <p className="mt-6 max-w-xl text-base leading-relaxed text-ink/60">
        A final opportunity to reconsider, which we mention only so that nobody can say we did not.
      </p>
      <div className="mt-14">{children}</div>
    </div>
  )
}

function LineGroup({ scope, items }: { scope: PurchaseKind; items: CartLine[] }) {
  const { setQuantity, removeItem } = useCart()

  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between border-b hairline pb-3">
        <p className="label-mono text-mineral">{SCOPE_LABEL[scope]}</p>
        {scope === 'subscription' && (
          <p className="label-mono text-ink/35">
            billed monthly · −{SUBSCRIPTION_DISCOUNT_BPS / 100}%
          </p>
        )}
      </div>

      <ul>
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.id}
              layout
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="flex gap-5 overflow-hidden border-b hairline py-6"
            >
              <Link
                href={`/products/${item.product_slug}`}
                className="relative h-32 w-24 shrink-0 bg-mist/45"
              >
                {item.image && (
                  <Image
                    src={item.image.url}
                    alt={item.image.alt}
                    fill
                    sizes="96px"
                    className="object-contain p-2"
                  />
                )}
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-baseline justify-between gap-4">
                  <Link
                    href={`/products/${item.product_slug}`}
                    className="display-md transition-colors hover:text-mineral"
                  >
                    {item.product_name}
                  </Link>
                  <span className="shrink-0 font-mono text-sm">{money(item.line_total_cents)}</span>
                </div>

                <p className="label-mono mt-2 text-ink/40">
                  {item.variant_name} · {volume(item.size_ml)} · {item.sku}
                </p>
                <p className="mt-2 max-w-md text-xs leading-relaxed text-ink/45">
                  {item.product_subtitle}
                </p>

                <div className="mt-auto flex items-center gap-5 pt-5">
                  <div className="flex items-center border hairline">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => setQuantity(item.id, item.quantity - 1)}
                      className="px-3 py-2 font-mono text-sm text-ink/55 transition-colors hover:text-ink"
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-mono text-xs">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setQuantity(item.id, item.quantity + 1)}
                      className="px-3 py-2 font-mono text-sm text-ink/55 transition-colors hover:text-ink"
                    >
                      +
                    </button>
                  </div>
                  <span className="label-mono text-ink/35">
                    {money(item.unit_price_cents)} each
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="label-mono ml-auto text-ink/40 underline decoration-dotted transition-colors hover:text-ink"
                  >
                    Reconsider
                  </button>
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  )
}

function Summary() {
  const { cart } = useCart()
  if (!cart) return null
  const { scopes } = cart.totals
  const scopeList: PurchaseKind[] = cart.is_mixed
    ? ['one_time', 'subscription']
    : cart.has_subscription
      ? ['subscription']
      : ['one_time']

  const away = FREE_SHIPPING_THRESHOLD_CENTS - scopes.one_time.subtotal_cents

  return (
    <div className="border hairline p-6">
      <p className="label-mono text-mineral">Summary</p>

      {cart.is_mixed && (
        <p className="mt-4 border-l-2 border-electrolyte bg-mist/40 px-3 py-2.5 text-xs leading-relaxed text-ink/65">
          Your cart holds both single purchases and a standing order. Stripe settles those as two
          separate transactions, so you will approve two payments. We consider this thorough.
        </p>
      )}

      {scopeList.map((scope) => (
        <ScopeBlock key={scope} scope={scope} totals={scopes[scope]} showLabel={cart.is_mixed} />
      ))}

      {scopes.one_time.subtotal_cents > 0 && away > 0 && (
        <p className="label-mono mt-5 text-ink/40">
          {money(away)} from complimentary escorted delivery
        </p>
      )}

      <p className="mt-6 text-[0.6875rem] leading-relaxed text-ink/40">
        Test mode. Card 4242 4242 4242 4242 with any future expiry completes the demo. No water
        will be shipped, escorted, or otherwise moved.
      </p>
    </div>
  )
}

function ScopeBlock({
  scope,
  totals,
  showLabel,
}: {
  scope: PurchaseKind
  totals: ScopeTotals
  showLabel: boolean
}) {
  const recurring = scope === 'subscription'
  return (
    <div className="mt-6 border-t hairline pt-5 first:border-t-0 first:pt-0">
      {showLabel && <p className="label-mono text-ink/35">{SCOPE_LABEL[scope]}</p>}

      <dl className="mt-3 font-mono text-xs">
        <Row label="Subtotal" value={money(totals.subtotal_cents)} />
        {!recurring && (
          <>
            <Row
              label="Escorted delivery"
              value={totals.shipping_cents === 0 ? 'Included' : money(totals.shipping_cents)}
            />
            <Row label="Concierge handling" value={money(totals.concierge_cents)} />
          </>
        )}
        {recurring && <Row label="Escorted delivery" value="Included monthly" />}
        <Row label="Tax" value="At checkout" muted />
      </dl>

      <div className="mt-4 flex items-baseline justify-between border-t border-t-ink pt-4">
        <span className="label-mono">Total</span>
        <motion.span
          key={totals.total_cents}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="font-mono text-xl"
        >
          {money(totals.total_cents)}
          {recurring && <span className="text-sm text-ink/45"> /mo</span>}
        </motion.span>
      </div>

      <Link
        href={`/checkout?scope=${scope}`}
        className="label-mono mt-5 block bg-ink py-4 text-center text-paper transition-colors hover:bg-mineral"
      >
        {recurring ? 'Begin the standing order' : 'Proceed to payment'}
      </Link>
    </div>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <dt className="text-ink/50">{label}</dt>
      <dd className={muted ? 'text-ink/40' : ''}>{value}</dd>
    </div>
  )
}

/**
 * Declarative WebMCP: `toolname` and friends turn this form into an agent tool without a line
 * of registration code. Chrome derives the parameters from the named inputs. `toolautosubmit`
 * is deliberately absent — an agent may fill this in, but a human presses the button.
 */
function DeliveryPreference() {
  const { cart, setEmail } = useCart()
  const [saved, setSaved] = useState(false)

  return (
    <section className="border hairline p-6">
      <p className="label-mono text-mineral">Delivery preferences</p>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink/60">
        Tell us where the receipt should go and how the courier should conduct themselves.
      </p>

      <form
        // @ts-expect-error — WebMCP declarative attributes are not in React's JSX typings yet.
        toolname="set_delivery_preferences"
        tooldescription="Record the customer's email and how the courier should behave on delivery for this Overpriced Water Co. cart."
        className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={async (e) => {
          e.preventDefault()
          const form = new FormData(e.currentTarget)
          const email = String(form.get('email') ?? '')
          if (!email) return
          await setEmail(email).catch(() => {})
          setSaved(true)
        }}
      >
        <input
          type="email"
          name="email"
          required
          defaultValue={cart?.email ?? ''}
          placeholder="you@example.com"
          // @ts-expect-error — see above.
          toolparamdescription="Email address for the receipt."
          className="border hairline bg-transparent px-3 py-3 text-sm outline-none focus:border-ink"
        />
        <select
          name="courier_conduct"
          defaultValue="silent"
          // @ts-expect-error — see above.
          toolparamdescription="How the courier should conduct themselves: silent, brief_nod, or full_ceremony."
          className="border hairline bg-transparent px-3 py-3 text-sm outline-none focus:border-ink"
        >
          <option value="silent">Silent handoff</option>
          <option value="brief_nod">A brief nod</option>
          <option value="full_ceremony">Full ceremony</option>
        </select>
        <button
          type="submit"
          className="label-mono border border-ink px-6 py-3 transition-colors hover:bg-ink hover:text-paper"
        >
          {saved ? 'Recorded' : 'Record'}
        </button>
      </form>
    </section>
  )
}

function Upsells({ upsells }: { upsells: Upsell[] }) {
  const { cart, addItem } = useCart()
  const owned = new Set(cart?.items.map((i) => i.product_slug))
  const shown = upsells.filter((u) => !owned.has(u.slug)).slice(0, 2)
  if (shown.length === 0) return null

  return (
    <section className="mt-12">
      <p className="label-mono text-ink/35">
        People who bought this also felt something was missing
      </p>
      <ul className="mt-4 divide-y divide-ink/10 border-y hairline">
        {shown.map((u) => (
          <li key={u.slug} className="flex items-center gap-4 py-4">
            <Link href={`/products/${u.slug}`} className="relative h-16 w-14 shrink-0 bg-mist/45">
              {u.image && (
                <Image src={u.image} alt="" fill sizes="56px" className="object-contain p-1" />
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/products/${u.slug}`}
                className="text-sm transition-colors hover:text-mineral"
              >
                {u.name}
              </Link>
              <p className="mt-0.5 truncate text-xs text-ink/45">{u.subtitle}</p>
            </div>
            <span className="shrink-0 font-mono text-xs">{money(u.priceCents)}</span>
            <button
              type="button"
              onClick={() => addItem({ sku: u.sku })}
              className="label-mono shrink-0 border border-ink px-4 py-2 transition-colors hover:bg-ink hover:text-paper"
            >
              Add
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
