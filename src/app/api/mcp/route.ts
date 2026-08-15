import { NextResponse } from 'next/server'
import { AGENT_TOOLS, TOOLS_BY_NAME, type ToolContext } from '@/lib/agent/tools'
import { serverClient } from '@/lib/agent/server-client'
import { listResources, readResource } from '@/lib/agent/resources'
import { CommerceError } from '@/lib/commerce/cart'
import { captureAgentTool } from '@/lib/analytics/server'
import {
  MCP_PROTOCOL_VERSION,
  RPC,
  error,
  isNotification,
  isRequest,
  result,
  toolResult,
  type JsonRpcId,
  type JsonRpcRequest,
} from '@/lib/agent/jsonrpc'

export const runtime = 'nodejs'

const SERVER_INFO = { name: 'overpriced-water-co', version: '1.0.0' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id, X-Cart-Id, Mcp-Protocol-Version',
  'Access-Control-Expose-Headers': 'X-Cart-Id, Mcp-Session-Id',
}

/**
 * Remote MCP endpoint — stateless Streamable HTTP.
 *
 * Hand-rolled rather than using the SDK's transport: the SDK transport wants a Node
 * `req`/`res` pair and to read the body itself, which fights a Next route handler where the
 * body arrives as a web `Request`. The protocol surface we need is small enough that mapping it
 * directly is less code than the adapter would be. See friction W3.
 *
 * Statelessness is a deliberate choice too — cart identity rides on `X-Cart-Id` instead of an
 * MCP session, so this works unchanged on Vercel's serverless functions where no two requests
 * are guaranteed to hit the same instance.
 */
export async function POST(req: Request) {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(error(null, RPC.PARSE_ERROR, 'Invalid JSON.'), {
      status: 400,
      headers: CORS,
    })
  }

  const cartIdIn = req.headers.get('x-cart-id')
  let cartIdOut: string | null = null

  const ctx: ToolContext = {
    client: serverClient,
    cartId: cartIdIn,
    setCartId: (id) => {
      cartIdOut = id
    },
    surface: 'remote_mcp',
  }

  const batch = Array.isArray(payload) ? payload : [payload]
  const responses: unknown[] = []

  for (const msg of batch) {
    if (!isRequest(msg)) {
      responses.push(error(null, RPC.INVALID_REQUEST, 'Not a JSON-RPC 2.0 request.'))
      continue
    }
    if (isNotification(msg)) continue // e.g. notifications/initialized — acknowledge with 202
    responses.push(await dispatch(msg, ctx))
  }

  const headers: Record<string, string> = { ...CORS }
  // Hand the new cart id back so a stateless client can carry it forward.
  if (cartIdOut) headers['X-Cart-Id'] = cartIdOut

  if (responses.length === 0) return new NextResponse(null, { status: 202, headers })
  return NextResponse.json(Array.isArray(payload) ? responses : responses[0], { headers })
}

async function dispatch(msg: JsonRpcRequest, ctx: ToolContext) {
  const id = (msg.id ?? null) as JsonRpcId
  const params = msg.params ?? {}

  switch (msg.method) {
    case 'initialize':
      return result(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          'Overpriced Water Co. sells absurdly premium bottled water. Browse with ' +
          'search_products, add SKUs with add_to_cart, then start_checkout returns a URL for a ' +
          'human to pay on — payment is never automated. Send the X-Cart-Id header returned by ' +
          'create_cart on every later request so the cart persists. Read the owc://catalog ' +
          'resource to ingest the whole catalog in one call instead of paging through search.',
      })

    case 'ping':
      return result(id, {})

    case 'tools/list':
      return result(id, {
        tools: AGENT_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations,
        })),
      })

    case 'tools/call': {
      const name = String(params.name ?? '')
      const tool = TOOLS_BY_NAME.get(name)
      if (!tool) {
        return error(id, RPC.METHOD_NOT_FOUND, `Unknown tool "${name}".`, {
          available: AGENT_TOOLS.map((t) => t.name),
        })
      }
      const started = Date.now()
      try {
        const value = await tool.execute((params.arguments ?? {}) as Record<string, unknown>, ctx)
        await captureAgentTool({
          tool: name,
          surface: 'remote_mcp',
          cartId: ctx.cartId,
          ok: true,
          durationMs: Date.now() - started,
        })
        return toolResult(id, value)
      } catch (err) {
        if (err instanceof CommerceError) {
          await captureAgentTool({
            tool: name,
            surface: 'remote_mcp',
            cartId: ctx.cartId,
            ok: false,
            errorCode: err.code,
            durationMs: Date.now() - started,
          })
          // A recoverable refusal, returned as tool content so the model can read and act on it.
          return toolResult(
            id,
            { error: { code: err.code, message: err.message, details: err.details } },
            true,
          )
        }
        console.error(`[mcp] ${name} failed:`, err)
        return error(id, RPC.INTERNAL_ERROR, (err as Error).message)
      }
    }

    case 'resources/list':
      return result(id, { resources: await listResources() })

    case 'resources/read': {
      const uri = String(params.uri ?? '')
      try {
        return result(id, { contents: [await readResource(uri)] })
      } catch (err) {
        if (err instanceof CommerceError) {
          return error(id, RPC.INVALID_PARAMS, err.message, { code: err.code })
        }
        throw err
      }
    }

    case 'prompts/list':
      return result(id, { prompts: [] })

    default:
      return error(id, RPC.METHOD_NOT_FOUND, `Unsupported method "${msg.method}".`)
  }
}

/** Some clients probe with GET before opening a stream; we have no server-initiated messages. */
export async function GET() {
  return NextResponse.json(
    {
      server: SERVER_INFO,
      protocolVersion: MCP_PROTOCOL_VERSION,
      transport: 'streamable-http (stateless, POST only)',
      tools: AGENT_TOOLS.map((t) => t.name),
      hint: 'POST JSON-RPC 2.0 here. Carry cart state with the X-Cart-Id header.',
    },
    { headers: CORS },
  )
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
