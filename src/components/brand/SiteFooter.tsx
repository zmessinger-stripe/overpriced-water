import Link from 'next/link'
import { CERTIFICATIONS } from '@/lib/catalog-data'
import { NewsletterForm } from '@/components/brand/NewsletterForm'

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t hairline bg-ink text-paper">
      <div className="mx-auto max-w-[100rem] px-5 py-16 md:px-10">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="display-md">Overpriced Water Co.</p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-paper/60">
              Sourced from a single municipal tap in Zug, Switzerland. Bottled once. Never
              reconsidered.
            </p>

            <div className="mt-8 max-w-xs">
              <p className="label-mono text-paper/40">The Dispatch</p>
              <p className="mt-2 text-xs leading-relaxed text-paper/45">
                Occasional notes on hydration, sent when we have something to say.
              </p>
              <div className="mt-4">
                <NewsletterForm />
              </div>
            </div>
          </div>

          <FooterColumn title="Catalog">
            <FooterLink href="/water/by-occasion">By Occasion</FooterLink>
            <FooterLink href="/water/by-identity">By Identity</FooterLink>
            <FooterLink href="/water/collections">Collections</FooterLink>
          </FooterColumn>

          <FooterColumn title="Provenance">
            <li className="text-paper/50">pH 7.41 ± 0.02</li>
            <li className="text-paper/50">Hydration Index audited</li>
            <li className="text-paper/50">Bottled facing north</li>
          </FooterColumn>

          <FooterColumn title="For agents">
            <li className="text-paper/50">
              MCP endpoint at <code className="font-mono text-electrolyte">/api/mcp</code>
            </li>
            <li className="text-paper/50">
              WebMCP tools registered in-page on <code className="font-mono">document.modelContext</code>
            </li>
            <li className="text-paper/50">Payment remains a human act.</li>
          </FooterColumn>
        </div>

        {/* Certification marquee — the same eight claims, forever, with total sincerity. */}
        <div className="mt-16 overflow-hidden border-y border-paper/15 py-3">
          <div
            className="flex w-max gap-10 whitespace-nowrap"
            style={{ animation: 'marquee 42s linear infinite' }}
          >
            {[...CERTIFICATIONS, ...CERTIFICATIONS].map((c, i) => (
              <span key={i} className="label-mono flex items-center gap-2.5 text-paper/45">
                <span aria-hidden className="text-electrolyte">
                  ◇
                </span>
                {c}
              </span>
            ))}
          </div>
        </div>

        <p className="label-mono mt-10 text-paper/35">
          Stripe demo · test mode only · no water will be shipped
        </p>
      </div>
    </footer>
  )
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label-mono text-paper/40">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm leading-relaxed">{children}</ul>
    </div>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-paper/60 transition-colors hover:text-electrolyte">
        {children}
      </Link>
    </li>
  )
}
