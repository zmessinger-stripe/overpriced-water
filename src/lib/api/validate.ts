import { cookies } from 'next/headers'
import { z } from 'zod'
import { CommerceError, type CartSource } from '@/lib/commerce/cart'

export const CART_COOKIE = 'owc_cart'
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export const addItemSchema = z.object({
  sku: z.string().min(1).optional(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(99).default(1),
  purchaseKind: z.enum(['one_time', 'subscription']).default('one_time'),
}).refine((v) => Boolean(v.sku || v.variantId), {
  message: 'Provide either `sku` or `variantId`.',
})

export const updateItemSchema = z.object({
  quantity: z.number().int().min(0).max(99),
})

export const patchCartSchema = z.object({
  email: z.string().email(),
})

export const checkoutSessionSchema = z.object({
  scope: z.enum(['one_time', 'subscription']).optional(),
  uiMode: z.enum(['embedded', 'hosted']).default('embedded'),
})

export const createCartSchema = z.object({
  source: z.enum(['web', 'webmcp', 'mcp']).default('web'),
})

/** Parses a JSON body against a schema, turning validation failures into `422 invalid_request`. */
export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown
  try {
    const text = await req.text()
    raw = text ? JSON.parse(text) : {}
  } catch {
    throw new CommerceError('invalid_json', 'Request body is not valid JSON.', 400)
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new CommerceError(
      'invalid_request',
      'Request body failed validation.',
      422,
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    )
  }
  return parsed.data
}

export function searchParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams
}

export function intParam(sp: URLSearchParams, key: string): number | undefined {
  const raw = sp.get(key)
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

/**
 * Where the caller's cart comes from. Humans carry an httpOnly cookie; agents echo the
 * `X-Cart-Id` they got back from `create_cart`. Both paths land in the same place, which is
 * what lets one service layer serve both.
 */
export async function currentCartId(req: Request): Promise<string | null> {
  const header = req.headers.get('x-cart-id')
  if (header) return header
  const jar = await cookies()
  return jar.get(CART_COOKIE)?.value ?? null
}

export async function setCartCookie(cartId: string) {
  const jar = await cookies()
  jar.set(CART_COOKIE, cartId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CART_COOKIE_MAX_AGE,
  })
}

/** `web` unless the caller identifies itself as an agent surface. */
export function requestSource(req: Request): CartSource {
  const declared = req.headers.get('x-owc-surface')
  if (declared === 'webmcp' || declared === 'mcp') return declared
  return 'web'
}
