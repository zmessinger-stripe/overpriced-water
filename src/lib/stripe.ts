import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY

if (!key) {
  throw new Error('STRIPE_SECRET_KEY is unset. Run `stripe projects env --pull`.')
}

/**
 * Friction P6: the ambient Stripe CLI profile on this machine holds a live-mode key,
 * so we refuse to start against anything but a test key. This demo moves no real money.
 */
if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
  throw new Error(
    'Refusing to start: STRIPE_SECRET_KEY is not a test-mode key. ' +
      'This demo is test-mode only — set a sk_test_… key.',
  )
}

export const stripe = new Stripe(key, {
  appInfo: { name: 'Overpriced Water Co.', version: '1.0.0' },
})

export const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
