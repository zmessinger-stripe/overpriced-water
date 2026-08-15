'use client'

import posthog from 'posthog-js'

let initialized = false

/**
 * Browser PostHog, proxied through `/ingest` (see `next.config.ts`) so ad blockers don't
 * quietly delete the demo's most interesting chart.
 *
 * Friction P3: the key arrives as `OWC_ANALYTICS_API_KEY` from `stripe projects`, which the
 * browser cannot read; `next.config.ts` re-exports it as `NEXT_PUBLIC_POSTHOG_KEY`.
 */
export function initAnalytics() {
  if (initialized || typeof window === 'undefined') return
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return

  posthog.init(key, {
    api_host: '/ingest',
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    // App Router: navigations aren't page loads, so we capture them ourselves.
    capture_pageview: false,
    capture_pageleave: true,
    defaults: '2025-05-24',
  })
  initialized = true
}

export function captureClient(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return
  posthog.capture(event, properties)
}

export function capturePageview(url: string) {
  if (!initialized) return
  posthog.capture('$pageview', { $current_url: url })
}

export { posthog }

/**
 * The demo's one feature flag: `pdp_hero_variant` chooses which line the PDP leads with. Returns
 * `null` until flags load (or forever, if PostHog is not configured), so callers must have a
 * default rather than a loading state.
 */
export function featureFlag(key: string): string | null {
  if (!initialized) return null
  const value = posthog.getFeatureFlag(key)
  return typeof value === 'string' ? value : value === true ? 'test' : null
}

export function onFeatureFlags(cb: () => void): () => void {
  if (initialized) return posthog.onFeatureFlags(cb)

  // A subscriber can mount before `AnalyticsProvider`'s effect runs. Rather than miss the flags
  // entirely, watch for init for a few seconds and then give up for good.
  let unsubscribe: (() => void) | undefined
  let ticks = 0
  const timer = setInterval(() => {
    if (!initialized) {
      if (++ticks > 20) clearInterval(timer)
      return
    }
    clearInterval(timer)
    unsubscribe = posthog.onFeatureFlags(cb)
    cb()
  }, 250)

  return () => {
    clearInterval(timer)
    unsubscribe?.()
  }
}
