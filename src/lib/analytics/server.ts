import { PostHog } from 'posthog-node'

/**
 * Server-side PostHog. Used for events that happen without a browser present: webhook-time
 * order completion, and every agent tool call from the remote MCP surface.
 *
 * Friction P3: `stripe projects add posthog/analytics` names the variables after the resource
 * (`OWC_ANALYTICS_*`), so the server reads those directly and `next.config.ts` re-exports them
 * as `NEXT_PUBLIC_*` for the browser.
 */
declare global {
  var __owcPostHog: PostHog | null | undefined
}

function client(): PostHog | null {
  if (globalThis.__owcPostHog !== undefined) return globalThis.__owcPostHog
  const key = process.env.OWC_ANALYTICS_API_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.OWC_ANALYTICS_HOST ?? process.env.NEXT_PUBLIC_POSTHOG_HOST
  globalThis.__owcPostHog = key
    ? new PostHog(key, { host, flushAt: 1, flushInterval: 0 })
    : null
  return globalThis.__owcPostHog
}

export interface ServerEvent {
  event: string
  distinctId: string
  properties?: Record<string, unknown>
}

/** Never throws — analytics must not be able to fail a checkout. */
export async function captureServer({ event, distinctId, properties }: ServerEvent) {
  const ph = client()
  if (!ph) return
  try {
    ph.capture({ distinctId, event, properties })
    await ph.flush()
  } catch (err) {
    console.warn('[analytics] capture failed:', (err as Error).message)
  }
}

/** Records an agent tool invocation. The human-vs-agent funnel is the interesting chart. */
export async function captureAgentTool(opts: {
  tool: string
  surface: 'webmcp' | 'remote_mcp' | 'rest'
  cartId?: string | null
  ok: boolean
  errorCode?: string
  durationMs?: number
}) {
  await captureServer({
    event: 'agent_tool_called',
    distinctId: opts.cartId ?? `agent:${opts.surface}`,
    properties: {
      tool: opts.tool,
      surface: opts.surface,
      ok: opts.ok,
      error_code: opts.errorCode,
      duration_ms: opts.durationMs,
      is_agent: true,
    },
  })
}
