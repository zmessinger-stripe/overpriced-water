'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AGENT_TOOLS, type AgentTool, type ToolContext } from '@/lib/agent/tools'
import { restClient } from '@/lib/agent/rest-client'
import { asToolContent, getModelContext, unwrapArgs } from '@/lib/agent/webmcp'
import { CommerceError } from '@/lib/commerce/errors'
import { notifyCartChanged, useCart } from '@/components/cart/CartProvider'
import { captureClient } from '@/lib/analytics/client'

const READ_ONLY = new Set(['list_categories', 'search_products', 'get_product', 'view_cart'])

/**
 * Projects the shared tool registry onto `document.modelContext` for in-browser agents.
 *
 * Two things make this surface different from `/api/mcp` despite sharing every definition:
 * the client is `restClient`, so an agent's mutations run the same cookie/validation/analytics
 * path a human's clicks do; and `navigate` is wired to the router, so the page the agent is
 * talking about is the page the human is looking at.
 *
 * Nothing here can submit a payment. `start_checkout` opens the form and stops.
 */
export function ModelContextRegistrar({
  scopedTools,
  includeGlobal = true,
}: {
  scopedTools?: AgentTool[]
  /**
   * The layout mounts the global registry once. Page-level mounts pass `false` and contribute
   * only their scoped tools, so a PDP does not re-register `search_products` under the same name.
   */
  includeGlobal?: boolean
}) {
  const router = useRouter()
  const { cart, refresh } = useCart()
  const cartId = cart?.id ?? null

  useEffect(() => {
    const modelContext = getModelContext()
    if (!modelContext) return

    const controller = new AbortController()
    const client = restClient()
    const tools = [...(includeGlobal ? AGENT_TOOLS : []), ...(scopedTools ?? [])]

    for (const tool of tools) {
      const ctx: ToolContext = {
        client,
        cartId,
        setCartId: () => {
          // The cart id lives in the httpOnly cookie the REST call just set; the provider
          // re-reads it rather than this component tracking it.
          notifyCartChanged()
        },
        navigate: (path) => router.push(path),
        surface: 'webmcp',
      }

      modelContext.registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          async execute(input) {
            const started = performance.now()
            try {
              const value = await tool.execute(unwrapArgs(input), ctx)
              if (!READ_ONLY.has(tool.name)) await refresh().catch(() => {})
              captureClient('agent_tool_called', {
                tool: tool.name,
                surface: 'webmcp',
                ok: true,
                duration_ms: Math.round(performance.now() - started),
                is_agent: true,
              })
              return asToolContent(value)
            } catch (err) {
              const code = err instanceof CommerceError ? err.code : 'unexpected_error'
              captureClient('agent_tool_called', {
                tool: tool.name,
                surface: 'webmcp',
                ok: false,
                error_code: code,
                duration_ms: Math.round(performance.now() - started),
                is_agent: true,
              })
              // Returned as content, not thrown: a refusal the agent can read and recover from.
              return asToolContent({ error: { code, message: (err as Error).message } }, true)
            }
          },
        },
        { signal: controller.signal },
      )
    }

    // Friction W1: there is no unregisterTool. Aborting is the only teardown.
    return () => controller.abort()
  }, [cartId, includeGlobal, refresh, router, scopedTools])

  return null
}
