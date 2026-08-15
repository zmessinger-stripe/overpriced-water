/**
 * WebMCP feature detection and registration.
 *
 * Friction W1: the entry point moved. `navigator.modelContext` is what nearly every published
 * example uses and is deprecated as of Chrome 150; `document.modelContext` is current. There is
 * no `unregisterTool` — teardown is an `AbortSignal` passed at registration — and the whole API
 * is an origin trial, so it is absent in most browsers and every server render.
 */

export interface WebMcpToolDescriptor {
  name: string
  description: string
  inputSchema: unknown
  annotations?: Record<string, unknown>
  execute(args: { arguments?: Record<string, unknown> } | Record<string, unknown>): Promise<{
    content: { type: 'text'; text: string }[]
    isError?: boolean
  }>
}

interface ModelContext {
  registerTool(descriptor: WebMcpToolDescriptor, options?: { signal?: AbortSignal }): unknown
}

/** Returns the live `modelContext`, or null when WebMCP is unavailable (the common case). */
export function getModelContext(): ModelContext | null {
  if (typeof document === 'undefined') return null

  const fromDocument = (document as unknown as { modelContext?: ModelContext }).modelContext
  if (fromDocument?.registerTool) return fromDocument

  // Deprecated in Chrome 150, still the only surface in earlier origin-trial builds.
  const fromNavigator = (navigator as unknown as { modelContext?: ModelContext }).modelContext
  if (fromNavigator?.registerTool) return fromNavigator

  return null
}

/** WebMCP wants tool results in MCP content form, same as the remote surface. */
export function asToolContent(value: unknown, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }], isError }
}

/** Different origin-trial builds pass either `{arguments}` or the arguments object directly. */
export function unwrapArgs(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && 'arguments' in input) {
    return ((input as { arguments?: Record<string, unknown> }).arguments ?? {}) as Record<
      string,
      unknown
    >
  }
  return (input ?? {}) as Record<string, unknown>
}
