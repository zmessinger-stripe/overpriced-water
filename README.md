# Overpriced Water Co.

An absurdly premium bottled-water storefront, built as a Stripe demo. It is three demos
wearing one trench coat:

1. **Stripe Directory → Stripe Projects** provisions the entire stack (Supabase Postgres,
   PostHog, Vercel) from the CLI.
2. **Stripe Checkout Sessions with the Embedded Form** power the payment page.
3. **Agent-native commerce** — the same catalog, cart, and checkout are exposed to in-browser
   agents via **WebMCP** and to remote agents via an **MCP endpoint**, so an agent can browse
   and reach checkout without crawling the DOM.

## Stack

| Layer | Choice | Provisioned via |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) + React 19 | — |
| Hosting | Vercel | `stripe projects add vercel/hobby` + `vercel/project` |
| Database | Supabase Postgres (via `postgres.js`) | `stripe projects add supabase/free` + `supabase/project` |
| Analytics | PostHog | `stripe projects add posthog/free` + `posthog/analytics` |
| Payments | Stripe Checkout Session, `ui_mode: 'embedded'` | Stripe test mode |
| Agent surface | WebMCP (in-page) + MCP over HTTP (`/api/mcp`) | — |

## Provider discovery (Stripe Directory)

Every provider in the stack was chosen by searching Stripe Directory, filtered to providers
that can actually be provisioned:

```bash
stripe directory search "postgres database"  --stripe-projects-supported=true --format json
stripe directory search "product analytics"  --stripe-projects-supported=true --format json
stripe directory search "frontend hosting"   --stripe-projects-supported=true --format json
```

| Query | Results returned | Picked |
| --- | --- | --- |
| `postgres database` | Supabase, PlanetScale, Neon, Fly.io, Render, Prisma | **Supabase** — Postgres + auth + storage on one free tier |
| `product analytics` | PostHog, Amplitude | **PostHog** — free tier, session replay, feature flags |
| `frontend hosting` | WordPress.com, Spaceship, Render, Vercel, Netlify, Wix | **Vercel** — native Next.js target |

## Local development

```bash
npm install
stripe projects env --pull      # writes .env (CLI-managed; do not hand-edit)
npm run migrate                 # apply db/migrations/*.sql
npm run seed                    # upsert Stripe test products/prices + catalog rows
npm run dev                     # http://localhost:3000

# second terminal, so orders actually get created:
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

---

# Friction log

Every blocker hit while building this, with the command, the actual error, and the workaround.

## Stripe Directory

### D1 — `--format json` output is not pipeable without stripping a preamble

`stripe directory search … --format json` prints a leading blank line (and, on a TTY, spinner
frames) before the JSON array, so the obvious thing fails:

```
$ stripe directory search "postgres database" --format json | jq .
parse error: Invalid numeric literal at line 1, column 0
```

**Workaround:** slice from the first `[` before parsing.

```bash
stripe directory search "$q" --format json 2>/dev/null \
  | python3 -c "import sys,json;r=sys.stdin.read();print(json.dumps(json.loads(r[r.find('['):])))"
```

Writing the spinner to stderr, or adding `--quiet`, would make JSON mode genuinely scriptable.
The same problem affects every `--json` command in the `projects` plugin.

**Severity:** low, but it hits *every* scripted consumer, which is the entire point of `--format json`.

### D2 — Result URLs are `stri.pe` shortlinks, so you cannot dedupe by domain

Results return `"url": "https://stri.pe/sl/CNgAQUr1"` rather than `https://posthog.com`. Ranking
or deduping candidates by domain requires following every redirect. `display_name` and
`username` carry the only usable signal.

### D3 — `frontend hosting` returns weak matches ahead of strong ones

The top three results for `frontend hosting` were WordPress.com, Spaceship (a domain
registrar), and Render; Vercel and Netlify ranked 4th and 5th. A developer searching for
frontend hosting almost certainly wants the latter. Query rewriting (`"nextjs hosting"`,
`"jamstack deploy"`) did not reorder them meaningfully. Relevance appears to lean on the
provider's self-written `description`, and infrastructure companies write vague ones
(Vercel's is literally `"Cloud services company"`).

## Stripe Projects

### P1 — `stripe projects catalog --json` silently returns nothing 🔴

The human-readable form works; adding `--json` produces **empty stdout and exit code 0**:

```
$ stripe projects catalog --json
$ echo $?
0
$ stripe projects catalog | head -2      # works
⡜ Service Catalog
│  90 services from 62 providers across 19 categories · updated just now
```

This is the worst offender in the log, because the `stripe-projects` skill explicitly tells
agents to run `stripe projects catalog --json` when a user's request is vague. An agent that
follows its own instructions gets an empty string and a success exit code, and would reasonably
report back that the catalog is empty. Failing loudly would be strictly better than this.

**Workaround:** `stripe projects catalog <provider> --json` (per-provider) *does* emit JSON, as
does `stripe projects search <query> --json`. Use those, or parse the human-readable table.

### P2 — Supabase connection strings ship the literal placeholder `[YOUR-PASSWORD]` 🔴

This one costs real debugging time. After `stripe projects add supabase/project`, the generated
env contains both a password and two connection strings — but the connection strings were never
interpolated:

```
SUPABASE_DB_PASS      = <16-char password>                     ← correct
SUPABASE_DB_URL       = postgresql://postgres:[YOUR-PASSWORD]@db.<ref>.supabase.co:5432/postgres
SUPABASE_POOLER_URL   = postgres://postgres.<ref>:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6543/postgres?sslmode=require
```

`[YOUR-PASSWORD]` is the placeholder from Supabase's own dashboard/docs, passed through
verbatim. Using the variable that is *named like* a connection string fails:

```
$ psql "$SUPABASE_POOLER_URL" -c 'select 1'
psql: error: … FATAL:  password authentication failed for user "postgres"
```

Confirmed it is the placeholder and not an encoding issue — supplying `SUPABASE_DB_PASS` out of
band against the same host and user connects immediately:

```
$ PGPASSWORD="$SUPABASE_DB_PASS" psql -h aws-0-us-west-2.pooler.supabase.com -p 6543 \
    -U "postgres.<ref>" -d postgres -Atc 'select current_database()'
postgres
```

The failure mode is nasty: the error says *password authentication failed*, which sends you
hunting for a wrong/rotated credential or a URL-encoding bug in your own code, when in fact the
credential is fine and the string is a template. Nothing in `stripe projects env` hints that
`SUPABASE_DB_URL` is not ready to use.

**Workaround:** substitute at runtime rather than hand-editing `.env` (which the CLI owns and
would overwrite). `src/lib/db/client.ts` replaces the placeholder with `SUPABASE_DB_PASS` and
percent-encodes it, so the fix also survives `stripe projects rotate`:

```ts
const raw = process.env.SUPABASE_POOLER_URL!
const url = raw.replace('[YOUR-PASSWORD]', encodeURIComponent(process.env.SUPABASE_DB_PASS!))
```

**Suggested fix:** interpolate the password when generating the variable, or drop the
connection-string variables entirely and expose `SUPABASE_DB_HOST` / `_PORT` / `_USER` /
`_NAME` so callers assemble the URL themselves. Shipping a broken URL under a name that implies
it works is the worst of the three options.

### P3 — Provisioned env var names cannot be read by the browser

PostHog's client-side SDK needs its project key in the browser, but the CLI names the variables
after the resource:

```
OWC_ANALYTICS_API_KEY
OWC_ANALYTICS_HOST
```

Next.js only exposes variables prefixed `NEXT_PUBLIC_` to client bundles, so neither is
reachable from `posthog-js`. There is no `--env-key` override on `stripe projects add` (it
exists on `stripe projects variables set`, but that is only for self-managed values, and
duplicating a provisioned secret into a project variable defeats rotation).

**Workaround:** re-export inside `next.config.ts`, which keeps the CLI as the single source of
truth:

```ts
env: {
  NEXT_PUBLIC_POSTHOG_KEY:  process.env.OWC_ANALYTICS_API_KEY!,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.OWC_ANALYTICS_HOST!,
}
```

**Suggested fix:** support `--env-key`/`--env-prefix` on `stripe projects add` so framework
naming conventions can be honored at provision time. This will affect every Next.js, Vite, and
Astro project that provisions a client-side SDK — which is most of them.

### P4 — `--preflight` cannot pass in JSON mode

```
$ stripe projects init --preflight --json
{"ok": false, "error": {"code": "JSON_REQUIRES_CONFIRMATION", …}}
```

Three of the four checks pass; the fourth is `"Confirmation can be satisfied"`, which fails
purely because `--yes` wasn't passed. A dry-run diagnostic that fails on the absence of a
confirmation flag is confusing — `--preflight` reads as "tell me what's wrong" and instead
reports a problem with the invocation itself.

**Workaround:** `stripe projects init --preflight --json --yes` to check, then
`stripe projects init --accept-tos --yes`.

### P5 — Plan-before-deployable ordering is undiscoverable from `projects add` alone

All three providers expose a `plan` service and a `deployable` service, and the plan must come
first. The `stripe-projects-cli` skill documents this well, but the top-level `stripe-projects`
skill does not, and `stripe projects catalog <provider>` shows `SERVICES` and `PLANS` as two
lists without stating the dependency. The `PLAN_REQUIRED` error does name the exact fix, so
this is a documentation gap rather than a dead end. Correct order used here:

```bash
stripe projects add supabase/free    --accept-tos --yes   # plan
stripe projects add supabase/project --accept-tos --yes   # deployable
```

### P6 — The default CLI profile is live mode

`stripe config --list` shows the `default` profile holding an `rk_live_…` key, while test keys
live under a separate `acs-platform` profile. Any script that reaches for the ambient Stripe
credential gets **live mode**. Every Stripe call in this project reads `STRIPE_SECRET_KEY` from
the project vault, which is pinned to a `sk_test_…` key, and `src/lib/stripe.ts` asserts the
`sk_test_` prefix at startup and throws otherwise.

## Stripe API / Checkout

### S1 — Mixed one-time + subscription carts cannot be one Checkout Session

A Checkout Session in `mode: 'subscription'` rejects one-time prices in `line_items`, and
`mode: 'payment'` rejects recurring ones. A cart holding both a single bottle and a monthly
subscription therefore cannot check out in one session, and `add_invoice_items` is not available
on Checkout Sessions the way it is on Subscriptions.

**Handled, not worked around:** `POST /api/carts/:id/checkout-session` requires a `scope` of
`one_time` or `subscription` when the cart contains both, returning `409 mixed_cart` otherwise.
The cart page renders two checkout buttons and says so plainly. Both agent surfaces expose
`scope` on `start_checkout` and surface the same error text, so an agent can recover without
guessing.

### S3 — `products.search` is eventually consistent, which silently breaks "idempotent" seeds 🔴

The seed script originally found existing products with the Search API:

```ts
await stripe.products.search({ query: `metadata['owc_sku']:'${sku}'` })
```

It passed on the first run and looked correct. It was not idempotent. Re-running seconds later
found nothing and created a **second copy of all 11 products** — the search index had not caught
up:

```
before (products prices): 12 22
after  (products prices): 16 30      ← ✗ duplicated
```

The trap is that this is the failure mode that hides best: the happy path works, the duplicate
only appears on the second run, and if you seed once per environment you may not notice until
production has two of every price.

**Fix:** give products a deterministic ID derived from the SKU and retrieve-or-create.
`products.retrieve(id)` is strongly consistent, unlike search.

```ts
const id = sku.toLowerCase().replace(/[^a-z0-9]+/g, '_')   // OWC-MON-330 → owc_mon_330
try {
  await stripe.products.retrieve(id)
  sp = await stripe.products.update(id, payload)
} catch (err) {
  if (err.code !== 'resource_missing') throw err
  sp = await stripe.products.create({ id, ...payload })
}
```

Prices cannot take a custom ID, but `prices.list({ product })` **is** strongly consistent, so
matching on `unit_amount` + `recurring.interval` within the product is safe.

Verified: two consecutive `npm run seed` runs now both report `11 products, 22 prices`.

**Suggested docs change:** the Search API reference notes that data freshness lags by "up to a
minute," but the read-modify-write / upsert use case is exactly where that lag becomes a
correctness bug. A pointer toward deterministic IDs for idempotent provisioning would save
people this one.

### S4 — `ui_mode: 'embedded'` is no longer accepted, and only the embedded path breaks 🔴

Every Embedded Checkout example — Stripe's own docs, the `@stripe/react-stripe-js` README, and
essentially all published tutorials — passes `ui_mode: 'embedded'`. On the current API version
that is rejected:

```
StripeInvalidRequestError: The ui_mode value `embedded` is no longer supported.
                           Use `embedded_page` instead.
  param: 'ui_mode'
```

The rename is real and the error message is excellent — it names the exact fix. Two things
still made this cost time:

1. **Only the embedded path fails.** The hosted path in this codebase omits `ui_mode` entirely
   and relies on the default, so it kept working. The failure looked like "something about our
   embedded code is wrong" rather than "one enum value was renamed."
2. **The SDK types don't flag it.** `stripe@22.5.0` types `UiMode` as
   `'elements' | 'embedded_page' | 'form' | 'hosted_page' | OtherString`. The `OtherString`
   escape hatch — there so new server-side enum values don't break builds — means
   `ui_mode: 'embedded'` **typechecks cleanly** and only fails at runtime, against the network.
   The one place a type could have caught a renamed literal, it can't.

**Workaround:** `embedded_page` (and `hosted_page` if you pass it explicitly).
`src/lib/commerce/checkout.ts` keeps `'embedded' | 'hosted'` as this app's own vocabulary and
translates in exactly one place, so a future rename is a one-line change.

**Suggested fix:** the docs at `docs.stripe.com/checkout/embedded/quickstart` still show
`ui_mode: 'embedded'`. Updating them is the whole fix — the API behavior is right.

### S2 — Embedded Checkout is browser-only, so remote agents need a different mode

`ui_mode: 'embedded'` returns a `client_secret` that only means anything to `@stripe/stripe-js`
in a DOM. A remote MCP agent has no browser, so it cannot complete an embedded session.

**Handled:** `start_checkout` returns an embedded `client_secret` for the in-page WebMCP surface
and a **hosted** Checkout URL for the remote MCP surface, from the same service function. This
also keeps payment as a human step, which matches Chrome's own WebMCP guidance.

## Supabase / postgres.js

### N1 — `JSON.stringify` into a `jsonb` column silently double-encodes

`postgres.js` infers the parameter type from the column, so a **string** bound to a `jsonb`
column gets JSON-encoded *again*. The row inserts fine, no error, and the corruption only
surfaces when you try to index into it:

```sql
select jsonb_typeof(images), images -> 0 from products where slug = 'monday-water';
 string | "[{\"url\":\"/bottles/monday-water.svg\", ...}]"     -- ✗ a jsonb string, not an array
```

`jsonb_typeof` returns `string` rather than `array`, and `images -> 0` hands back the entire
escaped blob instead of the first element — so the API cheerfully returned an `image` field
that was a 200-character string. Nothing fails loudly at any layer.

**Fix:** bind the value, not its serialization — `sql.json()` marks it explicitly.

```ts
${JSON.stringify(imagesFor(p))}   // ✗ jsonb string
${sql.json(imagesFor(p))}         // ✓ jsonb array
```

Affected three call sites here (`products.images`, `carts.metadata`, `orders.shipping_address`)
because `JSON.stringify` is the reflex from every other driver. Worth a `jsonb_typeof` assertion
in your seed if you store jsonb.

## WebMCP

### W1 — The documented API surface is split across pages and partly deprecated already

The use-cases page the spec pointed at documents only the declarative
(`toolname` / `tooldescription` / `toolparamdescription`) form attributes and contains no
JavaScript API at all. The imperative API lives on a separate page, where
`navigator.modelContext` — the entry point in most published examples — is already marked
**deprecated in Chrome 150** in favor of `document.modelContext`. There is also no
`unregisterTool`; teardown is via an `AbortSignal` passed to `registerTool`.

**Handled:** `src/lib/agent/webmcp.ts` feature-detects `document.modelContext` first and falls
back to `navigator.modelContext`, and every registration is torn down with an `AbortController`.

### W2 — WebMCP alone does not satisfy "browse remotely without crawling"

WebMCP is an in-page, origin-trial, browser-only API: it requires an agent already running
inside Chrome on the page. It makes a *visited* page agent-legible; it does not let a remote
agent reach the store at all.

**Handled:** the store ships both surfaces over one shared tool registry
(`src/lib/agent/tools.ts`) — WebMCP for in-browser agents, and a stateless JSON-RPC MCP
endpoint at `/api/mcp` for remote ones. Neither can drift from the other because both are
projections of the same array.

<!-- Entries appended as implementation continues. -->

---

## Architecture notes

- **One service layer.** `src/lib/commerce/*` owns all business logic. The REST API, the remote
  MCP handler, and the in-page WebMCP tools are thin adapters over it, so the three surfaces
  cannot drift.
- **Cart identity** comes from an httpOnly `owc_cart` cookie for humans, or an `X-Cart-Id`
  header for agents. Both resolve through the same function.
- **Agent tools are defined once** in `src/lib/agent/tools.ts` and projected onto both WebMCP
  and remote MCP.
