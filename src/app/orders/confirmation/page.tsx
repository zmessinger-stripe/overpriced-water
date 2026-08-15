import Link from 'next/link'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { resolveOrderForSession } from '@/lib/commerce/orders'
import { money } from '@/lib/format'
import { Reveal } from '@/components/motion/Reveal'
import { ClearCartOnConfirmation } from '@/components/cart/ClearCartOnConfirmation'
import type { Order } from '@/lib/db/types'

export const metadata: Metadata = {
  title: 'Confirmed',
  description: 'Your water is being escorted.',
  robots: { index: false },
}

// Every visit resolves a live session; nothing here is cacheable.
export const dynamic = 'force-dynamic'

export default async function ConfirmationPage({
  searchParams,
}: PageProps<'/orders/confirmation'>) {
  const { session_id: sessionId } = await searchParams
  if (typeof sessionId !== 'string' || !sessionId) return <Missing />

  /**
   * The webhook normally creates the order. `resolveOrderForSession` falls back to retrieving
   * the session and creating it inline, so this page never shows a spinner waiting on Stripe's
   * delivery — and because creation is idempotent on the session id, the webhook arriving a
   * second later changes nothing.
   */
  const order = await resolveOrderForSession(sessionId)
  if (!order) return <Pending sessionId={sessionId} />

  const subscription = order.items.some((i) => i.purchase_kind === 'subscription')

  return (
    <>
      <Suspense fallback={null}>
        <ClearCartOnConfirmation />
      </Suspense>

      <section className="border-b hairline">
        <div className="mx-auto max-w-[100rem] px-5 pb-20 pt-16 md:px-10 md:pb-24 md:pt-24">
          <Reveal>
            <p className="label-mono text-mineral">Confirmed · {order.order_number}</p>
            <h1 className="display-xl mt-6 max-w-3xl text-balance">
              Your water is being escorted.
            </h1>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-ink/60">
              {subscription
                ? 'Your standing order is established. A courier has been assigned in perpetuity, or until you write to us, whichever comes first.'
                : 'A courier has been briefed and will conduct themselves accordingly. You will not be contacted again unless something goes wrong, which it will not.'}
            </p>
            <p className="mt-6 max-w-xl font-mono text-xs leading-relaxed text-ink/40">
              This is a Stripe demo in test mode. No payment was taken and no water exists.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto grid max-w-[100rem] gap-14 px-5 py-16 md:px-10 lg:grid-cols-[1fr_22rem] lg:gap-20">
        <div>
          <p className="label-mono text-ink/35">Contents</p>
          <ul className="mt-4 divide-y divide-ink/10 border-y hairline">
            {order.items.map((item) => (
              <li key={`${item.sku}-${item.purchase_kind}`} className="flex items-baseline gap-4 py-5">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${item.product_slug}`}
                    className="display-md transition-colors hover:text-mineral"
                  >
                    {item.name}
                  </Link>
                  <p className="label-mono mt-2 text-ink/40">
                    {item.sku} · ×{item.quantity}
                    {item.purchase_kind === 'subscription' && ' · monthly'}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm">
                  {money(item.unit_price_cents * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          {order.shipping_address && <ShippingBlock address={order.shipping_address} />}
        </div>

        <aside>
          <div className="border hairline p-6">
            <p className="label-mono text-mineral">Receipt</p>
            <dl className="mt-5 font-mono text-xs">
              <Row label="Order" value={order.order_number} />
              {order.email && <Row label="Receipt to" value={order.email} />}
              <Row label="Subtotal" value={money(order.subtotal_cents)} />
              {order.discount_cents > 0 && (
                <Row label="Promotion" value={`−${money(order.discount_cents)}`} />
              )}
              <Row
                label="Delivery + concierge"
                value={order.shipping_cents === 0 ? 'Included' : money(order.shipping_cents)}
              />
              {order.tax_cents > 0 && <Row label="Tax" value={money(order.tax_cents)} />}
            </dl>
            <div className="mt-4 flex items-baseline justify-between border-t border-t-ink pt-4">
              <span className="label-mono">Charged</span>
              <span className="font-mono text-xl">{money(order.total_cents)}</span>
            </div>

            {order.stripe_subscription_id && (
              <p className="mt-5 border-l-2 border-electrolyte bg-mist/40 px-3 py-2.5 text-xs leading-relaxed text-ink/65">
                Standing order active. Billed monthly at this amount until cancelled.
              </p>
            )}

            <p className="label-mono mt-6 break-all text-[0.5625rem] text-ink/25">
              {order.stripe_checkout_session_id}
            </p>
          </div>

          <Link
            href="/water/by-occasion"
            className="label-mono mt-6 block bg-ink py-4 text-center text-paper transition-colors hover:bg-mineral"
          >
            Consider more water
          </Link>
        </aside>
      </div>
    </>
  )
}

function ShippingBlock({ address }: { address: NonNullable<Order['shipping_address']> }) {
  const lines = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(' '),
    address.country,
  ].filter((l) => typeof l === 'string' && l.length > 0) as string[]
  if (lines.length === 0) return null

  return (
    <div className="mt-12">
      <p className="label-mono text-ink/35">Escort destination</p>
      <address className="mt-4 font-mono text-sm not-italic leading-relaxed text-ink/65">
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </address>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-ink/50">{label}</dt>
      <dd className="truncate text-right">{value}</dd>
    </div>
  )
}

function Missing() {
  return (
    <Empty
      title="No order to show."
      body="This page needs a session_id. If you arrived here from Stripe, the parameter was lost along the way."
    />
  )
}

function Pending({ sessionId }: { sessionId: string }) {
  return (
    <Empty
      title="Payment not settled."
      body="Stripe has this session but has not confirmed the payment yet. Some methods take a few minutes. Reload this page and it will resolve itself."
      footnote={sessionId}
    />
  )
}

function Empty({ title, body, footnote }: { title: string; body: string; footnote?: string }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-32 text-center md:px-10">
      <p className="display-lg">{title}</p>
      <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-ink/60">{body}</p>
      {footnote && <p className="label-mono mt-6 break-all text-ink/25">{footnote}</p>}
      <Link
        href="/"
        className="label-mono mt-10 inline-block border border-ink px-6 py-3 transition-colors hover:bg-ink hover:text-paper"
      >
        Return to the shop
      </Link>
    </div>
  )
}
