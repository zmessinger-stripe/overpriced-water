'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Cart, PurchaseKind } from '@/lib/db/types'

interface CartState {
  cart: Cart | null
  loading: boolean
  drawerOpen: boolean
  openDrawer(): void
  closeDrawer(): void
  refresh(): Promise<Cart | null>
  addItem(input: { sku: string; quantity?: number; purchaseKind?: PurchaseKind }): Promise<Cart>
  setQuantity(itemId: string, quantity: number): Promise<Cart>
  removeItem(itemId: string): Promise<Cart>
  setEmail(email: string): Promise<Cart>
}

const CartContext = createContext<CartState | null>(null)

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const err = (payload as { error?: { code: string; message: string } })?.error
    throw Object.assign(new Error(err?.message ?? `Request failed (${res.status})`), {
      code: err?.code ?? 'request_failed',
    })
  }
  return (payload as { data: T }).data
}

/**
 * The single source of cart truth in the browser.
 *
 * In-page WebMCP tools go through the same REST calls this does and then trigger a refresh, so
 * an agent adding a bottle makes the header badge tick up in front of the customer. That visible
 * reaction is the entire argument for WebMCP over a headless API.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const bootstrapped = useRef(false)

  const refresh = useCallback(async () => {
    const next = await api<Cart | null>('/carts')
    setCart(next)
    return next
  }, [])

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    refresh()
      .catch(() => setCart(null))
      .finally(() => setLoading(false))
  }, [refresh])

  /** Creates the cart lazily — nobody gets a cart row for merely visiting. */
  const ensureCart = useCallback(async (): Promise<string> => {
    if (cart?.id) return cart.id
    const created = await api<Cart>('/carts', {
      method: 'POST',
      body: JSON.stringify({ source: 'web' }),
    })
    setCart(created)
    return created.id
  }, [cart])

  const addItem = useCallback<CartState['addItem']>(
    async (input) => {
      const cartId = await ensureCart()
      const next = await api<Cart>(`/carts/${cartId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          sku: input.sku,
          quantity: input.quantity ?? 1,
          purchaseKind: input.purchaseKind ?? 'one_time',
        }),
      })
      setCart(next)
      setDrawerOpen(true)
      return next
    },
    [ensureCart],
  )

  const setQuantity = useCallback<CartState['setQuantity']>(
    async (itemId, quantity) => {
      const cartId = await ensureCart()
      const next = await api<Cart>(`/carts/${cartId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      })
      setCart(next)
      return next
    },
    [ensureCart],
  )

  const removeItem = useCallback<CartState['removeItem']>(
    async (itemId) => {
      const cartId = await ensureCart()
      const next = await api<Cart>(`/carts/${cartId}/items/${itemId}`, { method: 'DELETE' })
      setCart(next)
      return next
    },
    [ensureCart],
  )

  const setEmail = useCallback<CartState['setEmail']>(
    async (email) => {
      const cartId = await ensureCart()
      const next = await api<Cart>(`/carts/${cartId}`, {
        method: 'PATCH',
        body: JSON.stringify({ email }),
      })
      setCart(next)
      return next
    },
    [ensureCart],
  )

  // WebMCP tools mutate through the REST API directly; this lets them ask the UI to catch up.
  useEffect(() => {
    const onExternal = () => {
      refresh().catch(() => {})
    }
    window.addEventListener('owc:cart-changed', onExternal)
    return () => window.removeEventListener('owc:cart-changed', onExternal)
  }, [refresh])

  const value = useMemo<CartState>(
    () => ({
      cart,
      loading,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      refresh,
      addItem,
      setQuantity,
      removeItem,
      setEmail,
    }),
    [cart, loading, drawerOpen, refresh, addItem, setQuantity, removeItem, setEmail],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartState {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>.')
  return ctx
}

/** Tells the React tree to re-read the cart after an out-of-band mutation. */
export function notifyCartChanged() {
  window.dispatchEvent(new Event('owc:cart-changed'))
}
