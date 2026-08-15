import { NextResponse } from 'next/server'
import { CommerceError } from '@/lib/commerce/cart'

/**
 * Response envelope. Success is `{ data, meta? }`, failure is `{ error: { code, message,
 * details? } }` — identical for humans and agents, so an agent can branch on `error.code`
 * instead of parsing prose.
 */
export function ok<T>(data: T, init?: { status?: number; meta?: unknown; headers?: HeadersInit }) {
  return NextResponse.json(
    init?.meta === undefined ? { data } : { data, meta: init.meta },
    { status: init?.status ?? 200, headers: init?.headers },
  )
}

export function noContent() {
  return new NextResponse(null, { status: 204 })
}

export function fail(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
) {
  return NextResponse.json({ error: { code, message, details } }, { status })
}

/**
 * Wraps a handler so `CommerceError` becomes its declared status and code, `ZodError`-shaped
 * failures become `422 invalid_request`, and anything else becomes a `500` without leaking
 * internals to the client.
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof CommerceError) {
      return fail(err.code, err.message, err.status, err.details)
    }
    if (err instanceof SyntaxError) {
      return fail('invalid_json', 'Request body is not valid JSON.', 400)
    }
    console.error('[api] unhandled error:', err)
    return fail('internal_error', 'Something went wrong on our end.', 500)
  }
}

/** Catalog GETs are cacheable; the CDN can serve them and agents get fast repeat reads. */
export const CATALOG_CACHE = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
}
