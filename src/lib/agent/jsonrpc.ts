export const JSONRPC_VERSION = '2.0'
export const MCP_PROTOCOL_VERSION = '2025-06-18'

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export type JsonRpcId = string | number | null

/** MCP-relevant subset of the JSON-RPC error codes. */
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const

export function result(id: JsonRpcId, value: unknown) {
  return { jsonrpc: JSONRPC_VERSION, id, result: value }
}

export function error(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return { jsonrpc: JSONRPC_VERSION, id, error: { code, message, data } }
}

/**
 * A tool that failed for a *business* reason (empty cart, unknown SKU) is not a protocol
 * error — it is a successful call whose result says no. MCP models this with `isError` on the
 * result so the model can read the reason and recover, rather than the transport swallowing it.
 */
export function toolResult(id: JsonRpcId, value: unknown, isError = false) {
  return result(id, {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    isError,
  })
}

export function isRequest(msg: unknown): msg is JsonRpcRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as JsonRpcRequest).jsonrpc === JSONRPC_VERSION &&
    typeof (msg as JsonRpcRequest).method === 'string'
  )
}

/** Notifications have no `id` and must not be answered. */
export function isNotification(msg: JsonRpcRequest): boolean {
  return msg.id === undefined || msg.id === null
}
