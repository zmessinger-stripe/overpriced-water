'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { motion } from 'motion/react'
import { useCart } from '@/components/cart/CartProvider'
import { money } from '@/lib/format'
import { captureClient } from '@/lib/analytics/client'
import type { PurchaseKind } from '@/lib/db/types'

// Module scope on purpose: loadStripe must run exactly once per page load.
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

interface SessionState {
  clientSecret: string
  sessionId: string
  scope: PurchaseKind
  totalCents: number
}

/**
 * The embedded form.
 *
 * The session is created here rather than on the cart page so that a reload, a back button, or
 * an agent dropping the human straight onto /checkout all work. The server reuses the cart's
 * open session when the line items are unchanged, so re-entry does not litter Stripe with
 * abandoned sessions.
 */
export function EmbeddedCheckoutPanel() {
  const params = useSearchParams()
  const { cart, loading } = useCart()
  const scopeParam = params.get('scope')
  const scope: PurchaseKind | undefined =
    scopeParam === 'one_time' || scopeParam === 'subscription' ? scopeParam : undefined

  const [session, setSession] = useState<SessionState | null>(null)
  const [fetchError, setFetchError] = useState<{ code: string; message: string } | null>(null)

  // Derived rather than pushed into state: an empty cart is a fact about the render, not an event.
  const empty = !loading && (!cart?.id || cart.items.length === 0)
  const error = empty
    ? { code: 'cart_empty', message: 'There is nothing in your cart to pay for.' }
    : fetchError

  useEffect(() => {
    if (loading || !cart?.id || cart.items.length === 0) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/carts/${cart.id}/checkout-session`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ uiMode: 'embedded', scope }),
        })
        const payload = await res.json()
        if (!res.ok) {
          if (!cancelled) {
            setFetchError(payload.error ?? { code: 'error', message: 'Checkout failed.' })
          }
          return
        }
        const data = payload.data as {
          client_secret: string
          session_id: string
          scope: PurchaseKind
          total_cents: number
        }
        if (cancelled) return
        setSession({
          clientSecret: data.client_secret,
          sessionId: data.session_id,
          scope: data.scope,
          totalCents: data.total_cents,
        })
        captureClient('checkout_form_shown', {
          scope: data.scope,
          value_usd: data.total_cents / 100,
          ui_mode: 'embedded',
        })
      } catch (err) {
        if (!cancelled) setFetchError({ code: 'network_error', message: (err as Error).message })
      }
    })()

    return () => {
      cancelled = true
    }
    // Deliberately keyed on the cart contents: editing the cart in another tab should produce a
    // fresh session rather than paying a stale total.
  }, [cart?.id, cart?.items.length, cart?.totals.total_cents, loading, scope])

  const options = useMemo(
    () => (session ? { clientSecret: session.clientSecret } : null),
    [session],
  )

  if (error) {
    return (
      <Frame>
        <div className="border hairline px-8 py-20 text-center">
          <p className="display-md">We cannot proceed.</p>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink/60">
            {error.message}
          </p>
          <p className="label-mono mt-4 text-ink/30">{error.code}</p>
          <Link
            href="/cart"
            className="label-mono mt-10 inline-block border border-ink px-6 py-3 transition-colors hover:bg-ink hover:text-paper"
          >
            Back to the cart
          </Link>
        </div>
      </Frame>
    )
  }

  if (!stripePromise) {
    return (
      <Frame>
        <p className="py-20 text-center text-sm text-ink/50">
          Stripe is not configured — NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing.
        </p>
      </Frame>
    )
  }

  return (
    <Frame scope={session?.scope} totalCents={session?.totalCents}>
      {!options ? (
        <div className="flex min-h-[28rem] items-center justify-center border hairline">
          <motion.p
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="label-mono text-ink/50"
          >
            Preparing a secure form
          </motion.p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="border hairline bg-white p-4 md:p-6"
        >
          <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </motion.div>
      )}
    </Frame>
  )
}

function Frame({
  children,
  scope,
  totalCents,
}: {
  children: React.ReactNode
  scope?: PurchaseKind
  totalCents?: number
}) {
  return (
    <div className="mx-auto max-w-[100rem] px-5 pb-24 pt-12 md:px-10 md:pt-16">
      <div className="grid gap-12 lg:grid-cols-[1fr_20rem] lg:gap-20">
        <div>
          <p className="label-mono text-mineral">Step two of two</p>
          <h1 className="display-xl mt-5">Payment.</h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-ink/60">
            Handled entirely by Stripe, embedded here so you never leave us. We see none of your
            card details, which is for the best.
          </p>
          <div className="mt-12">{children}</div>
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="border hairline p-6">
            <p className="label-mono text-mineral">What you are approving</p>
            {totalCents != null ? (
              <p className="display-lg mt-4">
                {money(totalCents)}
                {scope === 'subscription' && <span className="text-base text-ink/45"> /mo</span>}
              </p>
            ) : (
              <p className="display-lg mt-4 text-ink/25">——</p>
            )}
            <p className="mt-4 text-xs leading-relaxed text-ink/55">
              {scope === 'subscription'
                ? 'A monthly standing order. Escorted delivery is included every month, which is the only reason we do not charge for it twice.'
                : 'A single purchase, including escorted delivery and concierge handling.'}
            </p>

            <div className="mt-6 border-t hairline pt-5 font-mono text-[0.6875rem] leading-relaxed text-ink/45">
              <p>Test mode. Nothing is charged.</p>
              <p className="mt-2">Card 4242 4242 4242 4242</p>
              <p>Any future expiry · any CVC · any ZIP</p>
            </div>

            <Link
              href="/cart"
              className="label-mono mt-6 inline-block text-ink/45 underline decoration-dotted transition-colors hover:text-ink"
            >
              Amend the cart
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
