import 'server-only'
import { getProduct, listProducts, toAgentProduct } from '@/lib/commerce/catalog'
import { CommerceError } from '@/lib/commerce/cart'
import { CERTIFICATIONS } from '@/lib/catalog-data'

/**
 * MCP resources let an agent ingest the catalog wholesale instead of paging through
 * `search_products` — one read instead of N tool calls, which is the difference between
 * "an agent can browse this store" and "an agent can browse this store cheaply."
 */
export async function listResources() {
  const products = await listProducts({ limit: 100 })
  return [
    {
      uri: 'owc://catalog',
      name: 'Full water catalog',
      description:
        'Every product, variant, SKU, and price in one document. Read this first instead of ' +
        'calling search_products repeatedly.',
      mimeType: 'application/json',
    },
    {
      uri: 'owc://brand',
      name: 'Brand and policy sheet',
      description:
        'Shipping thresholds, the concierge fee, subscription discount, and certifications.',
      mimeType: 'application/json',
    },
    ...products.map((p) => ({
      uri: `owc://product/${p.slug}`,
      name: p.name,
      description: p.subtitle,
      mimeType: 'application/json',
    })),
  ]
}

export async function readResource(uri: string) {
  if (uri === 'owc://catalog') {
    const products = await listProducts({ limit: 100 })
    return json(uri, {
      generated_for: 'agents',
      currency: 'usd',
      count: products.length,
      products: products.map(toAgentProduct),
    })
  }

  if (uri === 'owc://brand') {
    const { SHIPPING_CENTS, CONCIERGE_CENTS, FREE_SHIPPING_THRESHOLD_CENTS } = await import(
      '@/lib/catalog-data'
    )
    return json(uri, {
      brand: 'Overpriced Water Co.',
      shipping_usd: SHIPPING_CENTS / 100,
      free_shipping_over_usd: FREE_SHIPPING_THRESHOLD_CENTS / 100,
      concierge_fee_usd: CONCIERGE_CENTS / 100,
      subscription_discount: '15% off every recurring delivery',
      subscription_interval: 'monthly',
      certifications: CERTIFICATIONS,
      checkout_note:
        'Payment is completed by a human on a Stripe Checkout page. Agents can reach checkout ' +
        'but cannot submit payment details.',
    })
  }

  const match = /^owc:\/\/product\/(.+)$/.exec(uri)
  if (match) {
    const product = await getProduct(match[1])
    if (!product) {
      throw new CommerceError('resource_not_found', `No product resource at ${uri}.`, 404)
    }
    return json(uri, toAgentProduct(product))
  }

  throw new CommerceError(
    'resource_not_found',
    `Unknown resource "${uri}". Call resources/list to see what exists.`,
    404,
  )
}

function json(uri: string, value: unknown) {
  return { uri, mimeType: 'application/json', text: JSON.stringify(value, null, 2) }
}
