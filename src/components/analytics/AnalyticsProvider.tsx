'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { capturePageview, initAnalytics } from '@/lib/analytics/client'

export function AnalyticsProvider() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    initAnalytics()
  }, [])

  // App Router client navigations never fire a page load, so pageviews are manual.
  useEffect(() => {
    const qs = searchParams.toString()
    capturePageview(`${window.location.origin}${pathname}${qs ? `?${qs}` : ''}`)
  }, [pathname, searchParams])

  return null
}
