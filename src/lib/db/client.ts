import postgres from 'postgres'

/**
 * Supabase's provisioned connection strings arrive with the literal placeholder
 * `[YOUR-PASSWORD]` where the password belongs (README friction P2). We substitute
 * `SUPABASE_DB_PASS` here rather than hand-editing `.env`, which the Stripe Projects
 * CLI owns and rewrites on every `env --pull` and `rotate`.
 */
function resolveConnectionString(): string {
  const raw = process.env.SUPABASE_POOLER_URL ?? process.env.SUPABASE_DB_URL
  if (!raw) {
    throw new Error(
      'No database URL. Run `stripe projects env --pull` to populate SUPABASE_POOLER_URL.',
    )
  }

  if (!raw.includes('[YOUR-PASSWORD]')) return raw

  const password = process.env.SUPABASE_DB_PASS
  if (!password) {
    throw new Error(
      'SUPABASE_POOLER_URL contains the [YOUR-PASSWORD] placeholder but SUPABASE_DB_PASS is unset. ' +
        'Run `stripe projects env --pull`.',
    )
  }
  return raw.replace('[YOUR-PASSWORD]', encodeURIComponent(password))
}

declare global {
  // Reuse one pool across hot reloads in dev, and across warm lambdas in prod.
  var __owcSql: ReturnType<typeof postgres> | undefined
}

function create() {
  return postgres(resolveConnectionString(), {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: 'require',
  })
}

export const sql = globalThis.__owcSql ?? create()
if (process.env.NODE_ENV !== 'production') globalThis.__owcSql = sql
