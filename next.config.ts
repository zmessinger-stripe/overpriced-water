import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Friction P3: `stripe projects add posthog/analytics` names its variables after the
  // resource, and Next only exposes `NEXT_PUBLIC_*` to the browser. Re-export here so the
  // Stripe CLI stays the single source of truth (no duplicated secrets in .env).
  env: {
    NEXT_PUBLIC_POSTHOG_KEY: process.env.OWC_ANALYTICS_API_KEY ?? '',
    NEXT_PUBLIC_POSTHOG_HOST: process.env.OWC_ANALYTICS_HOST ?? 'https://us.i.posthog.com',
  },

  async rewrites() {
    const host = process.env.OWC_ANALYTICS_HOST ?? 'https://us.i.posthog.com'
    return [
      // Proxy PostHog through our own origin so ad blockers don't eat the demo's analytics.
      {
        source: '/ingest/static/:path*',
        destination: `${host.replace('.i.', '-assets.i.')}/static/:path*`,
      },
      { source: '/ingest/:path*', destination: `${host}/:path*` },
    ]
  },

  // Required for the PostHog proxy: upstream paths must be passed through verbatim.
  skipTrailingSlashRedirect: true,
}

export default nextConfig
