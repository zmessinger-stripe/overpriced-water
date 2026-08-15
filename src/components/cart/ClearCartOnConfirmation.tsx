'use client'

import { useEffect, useRef } from 'react'
import { useCart } from '@/components/cart/CartProvider'

/**
 * Order creation marks the cart `converted` server-side, so `GET /api/carts` stops returning it.
 * This just asks the provider to re-read, which empties the header badge and the drawer. Doing it
 * here rather than in the order path keeps the server free of any UI concern.
 */
export function ClearCartOnConfirmation() {
  const { refresh } = useCart()
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    refresh().catch(() => {})
  }, [refresh])

  return null
}
