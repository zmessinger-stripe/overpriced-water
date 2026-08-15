import type { Metadata } from 'next'
import { listProducts } from '@/lib/commerce/catalog'
import { CartView } from '@/components/cart/CartView'

export const metadata: Metadata = {
  title: 'The cart',
  description: 'Review what you have decided about yourself.',
}

export default async function CartPage() {
  // Upsells are rendered server-side from the real catalog so the SKUs are always addable.
  const upsells = await listProducts({ sort: 'price_desc', limit: 3 })
  return <CartView upsells={upsells.map(toUpsell)} />
}

function toUpsell(p: Awaited<ReturnType<typeof listProducts>>[number]) {
  const cheapest = p.variants.reduce((min, v) => (v.price_cents < min.price_cents ? v : min), p.variants[0])
  return {
    slug: p.slug,
    name: p.name,
    subtitle: p.subtitle,
    sku: cheapest.sku,
    priceCents: cheapest.price_cents,
    image: p.images?.[0]?.url ?? null,
  }
}
