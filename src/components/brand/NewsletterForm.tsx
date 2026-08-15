'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { captureClient } from '@/lib/analytics/client'

/**
 * The declarative half of WebMCP.
 *
 * `toolname` / `tooldescription` / `toolparamdescription` turn this form into an agent tool with
 * no registration code — Chrome derives the input schema from the named fields. `toolautosubmit`
 * is set here because a newsletter signup is reversible and low-stakes; the delivery-preference
 * form on the cart page deliberately omits it, and nothing that spends money has it at all.
 */
export function NewsletterForm() {
  const [state, setState] = useState<'idle' | 'done'>('idle')

  return (
    <AnimatePresence mode="wait" initial={false}>
      {state === 'done' ? (
        <motion.p
          key="done"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-electrolyte"
        >
          Noted. You will hear from us at a pace we consider dignified.
        </motion.p>
      ) : (
        <motion.form
          key="form"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -6 }}
          // @ts-expect-error — WebMCP declarative attributes are not in React's JSX typings yet.
          toolname="subscribe_to_dispatch"
          tooldescription="Sign an email address up for The Dispatch, Overpriced Water Co.'s occasional notes on hydration. Free, reversible, and does not create an order."
          toolautosubmit="true"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const email = String(new FormData(e.currentTarget).get('email') ?? '')
            if (!email) return
            // No list exists. The demo captures the intent and stops there.
            captureClient('newsletter_signed_up', { surface: 'footer' })
            setState('done')
          }}
        >
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            aria-label="Email address"
            // @ts-expect-error — see above.
            toolparamdescription="Email address to subscribe to The Dispatch."
            className="min-w-0 flex-1 border border-paper/25 bg-transparent px-3 py-2.5 text-sm text-paper outline-none placeholder:text-paper/30 focus:border-electrolyte"
          />
          <button
            type="submit"
            className="label-mono border border-paper/25 px-4 py-2.5 text-paper/70 transition-colors hover:border-electrolyte hover:text-electrolyte"
          >
            Join
          </button>
        </motion.form>
      )}
    </AnimatePresence>
  )
}
