/**
 * Lives apart from `cart.ts` on purpose: client components need to recognize a business failure
 * (`rest-client.ts`, `ModelContextRegistrar.tsx`), and importing it from the cart service would
 * drag the Postgres driver into the browser bundle.
 */
export class CommerceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'CommerceError'
  }
}
