'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { motion } from 'motion/react'

const SORTS = [
  { value: 'featured', label: 'Curatorial order' },
  { value: 'price_desc', label: 'Most expensive' },
  { value: 'price_asc', label: 'Least expensive' },
  { value: 'name_asc', label: 'Alphabetical' },
] as const

const PRICES = [
  { value: '', label: 'Any price' },
  { value: '0-3999', label: 'Under $40' },
  { value: '4000-6999', label: '$40 – $69' },
  { value: '7000-', label: '$70 and above' },
] as const

/**
 * The filter state lives in the URL, not in React — so a shared link, a back button, and an
 * agent that reads `search_products` arguments all describe the same view. Every change is a
 * shallow replace inside a transition, which keeps the grid on screen while the server refetches.
 */
export function FilterRail({ resultCount }: { resultCount: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      startTransition(() => {
        router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false })
      })
    },
    [params, pathname, router],
  )

  const sort = params.get('sort') ?? 'featured'
  const price = params.get('price') ?? ''
  const subscribable = params.get('subscribable') === 'true'

  return (
    <aside className="lg:sticky lg:top-28 lg:self-start">
      <div className="flex items-baseline justify-between gap-4 border-b hairline pb-4">
        <p className="label-mono text-mineral">Refine</p>
        <motion.span
          key={resultCount}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: pending ? 0.4 : 1, y: 0 }}
          className="label-mono text-ink/40"
        >
          {resultCount} {resultCount === 1 ? 'bottle' : 'bottles'}
        </motion.span>
      </div>

      <Group label="Arrangement">
        {SORTS.map((s) => (
          <Option
            key={s.value}
            active={sort === s.value}
            onSelect={() => set({ sort: s.value === 'featured' ? null : s.value })}
          >
            {s.label}
          </Option>
        ))}
      </Group>

      <Group label="Investment">
        {PRICES.map((p) => (
          <Option key={p.label} active={price === p.value} onSelect={() => set({ price: p.value })}>
            {p.label}
          </Option>
        ))}
      </Group>

      <Group label="Commitment">
        <Option active={subscribable} onSelect={() => set({ subscribable: subscribable ? null : 'true' })}>
          Subscribable only
        </Option>
      </Group>

      {(sort !== 'featured' || price || subscribable) && (
        <button
          type="button"
          onClick={() => set({ sort: null, price: null, subscribable: null })}
          className="label-mono mt-8 text-ink/40 underline decoration-ink/20 underline-offset-4 transition-colors hover:text-ink"
        >
          Reset
        </button>
      )}
    </aside>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <p className="label-mono text-ink/35">{label}</p>
      <ul className="mt-3 space-y-1.5">{children}</ul>
    </div>
  )
}

function Option({
  active,
  onSelect,
  children,
}: {
  active: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={`group flex w-full items-center gap-2.5 text-left text-sm transition-colors ${
          active ? 'text-ink' : 'text-ink/50 hover:text-ink'
        }`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
            active ? 'bg-electrolyte ring-1 ring-mineral' : 'bg-ink/15 group-hover:bg-ink/35'
          }`}
        />
        {children}
      </button>
    </li>
  )
}
