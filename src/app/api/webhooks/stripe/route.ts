import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createOrderFromSession } from '@/lib/commerce/orders'

/** Signature verification needs the raw body and Node crypto, so pin the runtime. */
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET is unset; refusing to process.')
    return new Response('Webhook secret not configured', { status: 500 })
  }
  if (!signature) return new Response('Missing stripe-signature header', { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret)
  } catch (err) {
    return new Response(`Signature verification failed: ${(err as Error).message}`, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session
        // Idempotent on the unique `orders.stripe_checkout_session_id`, so redeliveries and a
        // race with the confirmation page's sync fallback are both harmless.
        const order = await createOrderFromSession(session.id)
        console.log(`[webhook] ${event.type} → order ${order.order_number}`)
        break
      }
      default:
        break
    }
  } catch (err) {
    // Non-2xx tells Stripe to retry, which is what we want for a transient DB failure.
    console.error(`[webhook] handler failed for ${event.type}:`, err)
    return new Response(`Handler error: ${(err as Error).message}`, { status: 500 })
  }

  return Response.json({ received: true })
}
