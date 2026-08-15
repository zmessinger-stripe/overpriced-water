'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Product, PurchaseKind, Variant } from '@/lib/db/types'
import { SUBSCRIPTION_DISCOUNT_BPS, subscriptionPriceCents } from '@/lib/catalog-data'
import { money, volume } from '@/lib/format'
import { useCart } from '@/components/cart/CartProvider'
import { ModelContextRegistrar } from '@/components/agent/ModelContextRegistrar'
import type { AgentTool } from '@/lib/agent/tools'
import { captureClient } from '@/lib/analytics/client'

/**
 * Everything on the PDP that has state: which size, one-time vs. standing order, quantity.
 *
 * It also contributes the two page-scoped WebMCP tools. They exist because an in-page agent
 * should be able to work the control the human is looking at — `select_variant` moves the real
 * selection, so the customer sees the size change and the price roll before anything is bought.
 */
export function PurchasePanel({ product }: { product: Product }) {
  const { addItem } = useCart()
  const [variantId, setVariantId] = useState(
    () => (product.variants.find((v) => v.is_default) ?? product.variants[0])?.id,
  )
  const [requestedKind, setRequestedKind] = useState<PurchaseKind>('one_time')
  const [quantity, setQuantity] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0]
  const subscribable = product.subscription_eligible && !!variant?.stripe_subscription_price_id
  // Derived, not corrected in an effect: selecting a size with no recurring price silently falls
  // back to a one-time purchase, and switching back to a subscribable size restores the intent.
  const kind: PurchaseKind = requestedKind === 'subscription' && subscribable ? 'subscription' : 'one_time'
  const unit = kind === 'subscription' ? subscriptionPriceCents(variant.price_cents) : variant.price_cents

  useEffect(() => {
    captureClient('product_viewed', {
      product_slug: product.slug,
      product_name: product.name,
      category: product.category_slug,
      price_usd: variant.price_cents / 100,
    })
    // Once per product, not once per variant fiddle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.slug])

  async function add() {
    setBusy(true)
    setError(null)
    try {
      await addItem({ sku: variant.sku, quantity, purchaseKind: kind })
      captureClient('add_to_cart', {
        sku: variant.sku,
        product_slug: product.slug,
        quantity,
        purchase_kind: kind,
        value_usd: (unit * quantity) / 100,
        is_agent: false,
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const scopedTools = useMemo<AgentTool[]>(
    () => [
      {
        name: 'select_variant',
        description:
          `Change the selected size and purchase type on the ${product.name} page the customer ` +
          'is currently viewing. This moves the on-screen selection without adding anything to ' +
          'the cart, so the customer can see what is being proposed. Valid SKUs: ' +
          product.variants.map((v) => v.sku).join(', ') + '.',
        inputSchema: {
          type: 'object',
          properties: {
            sku: { type: 'string', description: 'SKU of the size to select.' },
            purchase_kind: {
              type: 'string',
              enum: ['one_time', 'subscription'],
              description: 'Whether to select a single purchase or a monthly standing order.',
            },
            quantity: { type: 'integer', minimum: 1, maximum: 99, description: 'Bottles.' },
          },
          required: ['sku'],
        },
        annotations: { title: 'Select a size on this page', readOnlyHint: false, idempotentHint: true },
        async execute(args) {
          const target = product.variants.find((v) => v.sku === args.sku)
          if (!target) {
            return {
              error: {
                code: 'variant_not_found',
                message: `No such SKU on this page. Available: ${product.variants
                  .map((v) => v.sku)
                  .join(', ')}.`,
              },
            }
          }
          const nextKind = args.purchase_kind === 'subscription' ? 'subscription' : 'one_time'
          const canSubscribe =
            product.subscription_eligible && !!target.stripe_subscription_price_id
          setVariantId(target.id)
          setRequestedKind(nextKind === 'subscription' && canSubscribe ? 'subscription' : 'one_time')
          if (typeof args.quantity === 'number') {
            setQuantity(Math.min(Math.max(Math.round(args.quantity), 1), 99))
          }
          return {
            selected: {
              sku: target.sku,
              size: volume(target.size_ml),
              purchase_kind: nextKind === 'subscription' && canSubscribe ? 'subscription' : 'one_time',
              unit_price_usd:
                (nextKind === 'subscription' && canSubscribe
                  ? subscriptionPriceCents(target.price_cents)
                  : target.price_cents) / 100,
            },
            note:
              nextKind === 'subscription' && !canSubscribe
                ? 'This size cannot be subscribed to; a one-time purchase was selected instead.'
                : 'The page now shows this selection. Call add_current_product_to_cart to add it.',
          }
        },
      },
      {
        name: 'add_current_product_to_cart',
        description:
          `Add the currently selected size of ${product.name} to the cart, using whatever is ` +
          'selected on the page right now. Call select_variant first if a specific size or a ' +
          'monthly standing order is wanted.',
        inputSchema: {
          type: 'object',
          properties: {
            quantity: { type: 'integer', minimum: 1, maximum: 99, description: 'Bottles to add.' },
          },
        },
        annotations: { title: 'Add what is on screen to the cart' },
        async execute(args) {
          const qty = typeof args.quantity === 'number' ? Math.round(args.quantity) : quantity
          const cart = await addItem({ sku: variant.sku, quantity: qty, purchaseKind: kind })
          return {
            added: { sku: variant.sku, quantity: qty, purchase_kind: kind },
            cart_total_usd: cart.totals.total_cents / 100,
            item_count: cart.totals.item_count,
            next_step: 'Review at /cart, or call start_checkout.',
          }
        },
      },
    ],
    [addItem, kind, product, quantity, variant],
  )

  return (
    <div>
      <ModelContextRegistrar includeGlobal={false} scopedTools={scopedTools} />

      <div className="border-t hairline pt-6">
        <p className="label-mono text-ink/35">Format</p>
        <div className="mt-4 grid gap-2">
          {product.variants.map((v) => (
            <VariantRow
              key={v.id}
              variant={v}
              active={v.id === variant.id}
              kind={kind}
              onSelect={() => setVariantId(v.id)}
            />
          ))}
        </div>
      </div>

      {product.subscription_eligible && (
        <div className="mt-8 border-t hairline pt-6">
          <p className="label-mono text-ink/35">Arrangement</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <KindTile
              active={kind === 'one_time'}
              onSelect={() => setRequestedKind('one_time')}
              title="Once"
              body="A single bottle. A single moment. No obligations in either direction."
              price={money(variant.price_cents)}
            />
            <KindTile
              active={kind === 'subscription'}
              onSelect={() => setRequestedKind('subscription')}
              disabled={!subscribable}
              title="Standing order"
              body={
                subscribable
                  ? 'Monthly, escorted, and never discussed again. Cancel by writing to us.'
                  : 'Not available in this format.'
              }
              price={`${money(subscriptionPriceCents(variant.price_cents))} / mo`}
              flag={`−${SUBSCRIPTION_DISCOUNT_BPS / 100}% continuity adjustment`}
            />
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-4 border-t hairline pt-6">
        <div className="flex items-center gap-1 border hairline">
          <Stepper label="Fewer" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>
            −
          </Stepper>
          <span className="w-10 text-center font-mono text-sm">{quantity}</span>
          <Stepper label="More" onClick={() => setQuantity((q) => Math.min(99, q + 1))} disabled={quantity >= 99}>
            +
          </Stepper>
        </div>

        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="label-mono flex-1 bg-ink px-8 py-4 text-center text-paper transition-colors hover:bg-mineral disabled:opacity-45"
        >
          {busy ? 'Committing…' : `Add — ${money(unit * quantity)}`}
        </button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 font-mono text-xs text-mineral"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <p className="label-mono mt-6 text-ink/35">
        {variant.inventory > 0 ? `${variant.inventory} bottles remain in this batch` : 'Batch exhausted'}
      </p>
    </div>
  )
}

function VariantRow({
  variant,
  active,
  kind,
  onSelect,
}: {
  variant: Variant
  active: boolean
  kind: PurchaseKind
  onSelect(): void
}) {
  const price = kind === 'subscription' ? subscriptionPriceCents(variant.price_cents) : variant.price_cents
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`relative flex items-center justify-between gap-4 border px-4 py-3.5 text-left transition-colors ${
        active ? 'border-ink bg-mist/40' : 'border-ink/10 hover:border-ink/35'
      }`}
    >
      {active && (
        <motion.span
          layoutId="variant-marker"
          className="absolute left-0 top-0 h-full w-[3px] bg-electrolyte"
        />
      )}
      <span>
        <span className="block text-sm">{variant.name}</span>
        <span className="label-mono mt-1 block text-ink/40">
          {volume(variant.size_ml)} · {variant.sku}
        </span>
      </span>
      <span className="shrink-0 font-mono text-sm">
        {money(price)}
        {kind === 'subscription' && <span className="text-ink/40"> /mo</span>}
      </span>
    </button>
  )
}

function KindTile({
  active,
  disabled,
  onSelect,
  title,
  body,
  price,
  flag,
}: {
  active: boolean
  disabled?: boolean
  onSelect(): void
  title: string
  body: string
  price: string
  flag?: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      className={`flex h-full flex-col border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'border-ink bg-mist/40' : 'border-ink/10 hover:border-ink/35'
      }`}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="display-md">{title}</span>
        <span className="shrink-0 font-mono text-xs">{price}</span>
      </span>
      <span className="mt-2 text-xs leading-relaxed text-ink/55">{body}</span>
      {flag && !disabled && <span className="label-mono mt-3 text-mineral">{flag}</span>}
    </button>
  )
}

function Stepper({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick(): void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-3 font-mono text-sm text-ink/60 transition-colors hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  )
}
