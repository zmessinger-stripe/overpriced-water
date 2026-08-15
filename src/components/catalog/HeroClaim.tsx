'use client'

import { useSyncExternalStore } from 'react'
import { featureFlag, onFeatureFlags } from '@/lib/analytics/client'

/**
 * The demo's single PostHog experiment. `pdp_hero_variant` decides whether the PDP leads with the
 * product's own subtitle (control) or with the price justification (`justification`). Renders the
 * control immediately and swaps only if the flag resolves otherwise, so there is no flash of empty
 * copy when PostHog is unconfigured.
 */
export function HeroClaim({ subtitle, priceLine }: { subtitle: string; priceLine: string }) {
  // Subscribing beats an effect here: the flag is external state, and the server snapshot is
  // `null`, so hydration always matches and the control copy renders first either way.
  const variant = useSyncExternalStore(
    onFeatureFlags,
    () => featureFlag('pdp_hero_variant'),
    () => null,
  )

  return (
    <p className="mt-4 max-w-lg text-lg leading-relaxed text-ink/60">
      {variant === 'justification' ? priceLine : subtitle}
    </p>
  )
}
