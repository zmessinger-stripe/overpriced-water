import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Instrument_Serif, Inter_Tight, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { CartProvider } from '@/components/cart/CartProvider'
import { CartDrawer } from '@/components/cart/CartDrawer'
import { SiteHeader } from '@/components/brand/SiteHeader'
import { SiteFooter } from '@/components/brand/SiteFooter'
import { ModelContextRegistrar } from '@/components/agent/ModelContextRegistrar'
import { AnalyticsProvider } from '@/components/analytics/AnalyticsProvider'

const display = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

const sans = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Overpriced Water Co. — water, taken seriously',
    template: '%s · Overpriced Water Co.',
  },
  description:
    'Absurdly premium bottled water from a single municipal tap in Zug, Switzerland. pH 7.41 ± 0.02. Subscriptions available.',
  openGraph: {
    title: 'Overpriced Water Co.',
    description: 'Water, correctly matched to the moment.',
    type: 'website',
  },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full`}
    >
      <head>
        {/* Agent discovery: both surfaces are advertised, not hidden behind documentation. */}
        <link rel="mcp" href="/api/mcp" />
        <link rel="manifest" href="/.well-known/mcp.json" type="application/json" />
      </head>
      <body className="flex min-h-full flex-col antialiased">
        <CartProvider>
          <Suspense fallback={null}>
            <AnalyticsProvider />
          </Suspense>
          {/* Registers the global agent tools on every page. */}
          <ModelContextRegistrar />
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  )
}
