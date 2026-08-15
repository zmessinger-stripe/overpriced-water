/**
 * Generates the bottle artwork in `public/bottles/`.
 *
 * Vector, generated, and checked in: the brand needs a consistent silhouette across seven
 * products, and drawing that by hand fourteen times invites drift. Each product gets a
 * three-quarter view and a label-detail crop, tinted by a per-slug hue.
 *
 *   npx tsx scripts/bottles.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { PRODUCTS } from '../src/lib/catalog-data'

const OUT = 'public/bottles'

/** Water tint and cap treatment per product. Muted on purpose — this is a gallery, not a shelf. */
const TINTS: Record<string, { water: string; cap: string; band: string }> = {
  'monday-water': { water: '#cfe0dd', cap: '#0b1215', band: '#f5f2ec' },
  'post-workout-water': { water: '#d7e8c8', cap: '#2f4f4a', band: '#f5f2ec' },
  'water-for-standing-desk-owners': { water: '#d5dfe8', cap: '#4a4f57', band: '#f5f2ec' },
  'water-for-after-water': { water: '#e2dfd4', cap: '#8a8578', band: '#f5f2ec' },
  'water-for-people-who-have-a-newsletter': { water: '#e6dce4', cap: '#5b4a58', band: '#f5f2ec' },
  'the-deposition': { water: '#ccd8d6', cap: '#0b1215', band: '#e8e3d8' },
  'the-week': { water: '#d9e3e0', cap: '#2f4f4a', band: '#e8e3d8' },
}

const INK = '#0b1215'

function wrap(text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > max) {
      if (line) out.push(line.trim())
      line = word
    } else {
      line += ` ${word}`
    }
  }
  if (line.trim()) out.push(line.trim())
  return out
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Three-quarter bottle view. */
function bottle(slug: string, name: string, ph: number, index: number, isCase: boolean): string {
  const t = TINTS[slug] ?? TINTS['monday-water']
  const lines = wrap(name.toUpperCase(), 13).slice(0, 4)

  const body = isCase
    ? // Bundles are a rigid case, not a bottle.
      `<rect x="52" y="150" width="296" height="300" rx="10" fill="${t.band}" stroke="${INK}" stroke-width="2.5"/>
       <rect x="52" y="150" width="296" height="34" rx="10" fill="${t.cap}"/>
       <line x1="200" y1="184" x2="200" y2="450" stroke="${INK}" stroke-width="1" opacity="0.18"/>
       ${[0, 1, 2, 3]
         .map(
           (i) =>
             `<rect x="${74 + (i % 2) * 148}" y="${208 + Math.floor(i / 2) * 118}" width="104" height="98" rx="5" fill="${t.water}" stroke="${INK}" stroke-width="1.25" opacity="0.9"/>`,
         )
         .join('')}
       <circle cx="200" cy="167" r="7" fill="${t.band}" opacity="0.85"/>`
    : `<path d="M150 96 h100 v46 c0 20 26 40 26 74 v208 c0 22-18 40-40 40 h-72 c-22 0-40-18-40-40 V216 c0-34 26-54 26-74 z"
             fill="${t.water}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
       <rect x="146" y="70" width="108" height="30" rx="6" fill="${t.cap}"/>
       <rect x="132" y="252" width="136" height="118" fill="${t.band}" stroke="${INK}" stroke-width="1.5"/>
       <path d="M168 172 c7 24-7 36 0 58" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.5" fill="none"/>`

  const labelX = isCase ? 200 : 200
  const labelY = isCase ? 236 : 284

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520" width="400" height="520" role="img" aria-label="${esc(name)}">
  <rect width="400" height="520" fill="none"/>
  <ellipse cx="200" cy="472" rx="112" ry="14" fill="${INK}" opacity="0.07"/>
  ${body}
  <g font-family="ui-monospace, monospace" fill="${INK}" text-anchor="middle">
    ${
      isCase
        ? `<text x="${labelX}" y="${labelY}" font-size="10.5" letter-spacing="2.6" opacity="0.55">CASE OF FOUR</text>`
        : lines
            .map(
              (l, i) =>
                `<text x="${labelX}" y="${labelY + i * 15}" font-size="10.5" letter-spacing="1.9">${esc(l)}</text>`,
            )
            .join('\n    ')
    }
    <text x="${labelX}" y="${isCase ? 424 : 352}" font-size="8.5" letter-spacing="2.4" opacity="0.5">PH ${ph.toFixed(2)} · HI ${index.toFixed(1)}</text>
  </g>
</svg>
`
}

/** Label-detail crop: the clinical spec plate, close up. */
function detail(slug: string, name: string, ph: number, index: number, source: string): string {
  const t = TINTS[slug] ?? TINTS['monday-water']
  const src = wrap(source, 34).slice(0, 3)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520" width="400" height="520" role="img" aria-label="${esc(name)} label detail">
  <rect width="400" height="520" fill="${t.water}"/>
  <rect x="46" y="88" width="308" height="344" fill="${t.band}" stroke="${INK}" stroke-width="1.5"/>
  <g font-family="ui-monospace, monospace" fill="${INK}">
    <text x="74" y="132" font-size="9" letter-spacing="2.8" opacity="0.5">OVERPRICED WATER CO.</text>
    <line x1="74" y1="148" x2="326" y2="148" stroke="${INK}" stroke-width="1" opacity="0.2"/>
    ${wrap(name.toUpperCase(), 22)
      .slice(0, 3)
      .map((l, i) => `<text x="74" y="${182 + i * 20}" font-size="14" letter-spacing="1.2">${esc(l)}</text>`)
      .join('\n    ')}
    <line x1="74" y1="256" x2="326" y2="256" stroke="${INK}" stroke-width="1" opacity="0.2"/>
    <text x="74" y="280" font-size="9" letter-spacing="2.2" opacity="0.5">PH</text>
    <text x="326" y="280" font-size="9" letter-spacing="1.4" text-anchor="end">${ph.toFixed(2)} ± 0.02</text>
    <line x1="74" y1="296" x2="326" y2="296" stroke="${INK}" stroke-width="1" opacity="0.2"/>
    <text x="74" y="320" font-size="9" letter-spacing="2.2" opacity="0.5">HYDRATION INDEX</text>
    <text x="326" y="320" font-size="9" letter-spacing="1.4" text-anchor="end">${index.toFixed(1)}</text>
    <line x1="74" y1="336" x2="326" y2="336" stroke="${INK}" stroke-width="1" opacity="0.2"/>
    <text x="74" y="360" font-size="9" letter-spacing="2.2" opacity="0.5">SOURCE</text>
    ${src.map((l, i) => `<text x="74" y="${380 + i * 14}" font-size="8" letter-spacing="0.8" opacity="0.72">${esc(l)}</text>`).join('\n    ')}
  </g>
  <circle cx="326" cy="196" r="13" fill="none" stroke="${INK}" stroke-width="1.25" opacity="0.4"/>
  <text x="326" y="200" font-family="ui-monospace, monospace" font-size="9" text-anchor="middle" fill="${INK}" opacity="0.55">✓</text>
</svg>
`
}

mkdirSync(OUT, { recursive: true })
let n = 0
for (const p of PRODUCTS) {
  writeFileSync(
    `${OUT}/${p.slug}.svg`,
    bottle(p.slug, p.name, p.ph, p.hydrationIndex, p.kind === 'bundle'),
  )
  writeFileSync(
    `${OUT}/${p.slug}-detail.svg`,
    detail(p.slug, p.name, p.ph, p.hydrationIndex, p.source),
  )
  n += 2
}
console.log(`✓ wrote ${n} files to ${OUT}`)
