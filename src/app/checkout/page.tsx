import { Suspense } from 'react'
import type { Metadata } from 'next'
import { EmbeddedCheckoutPanel } from '@/components/checkout/EmbeddedCheckoutPanel'

export const metadata: Metadata = {
  title: 'Payment',
  description: 'Complete your acquisition.',
  robots: { index: false },
}

export default function CheckoutPage() {
  // `useSearchParams` in the panel needs a Suspense boundary to keep this route static.
  return (
    <Suspense fallback={null}>
      <EmbeddedCheckoutPanel />
    </Suspense>
  )
}
