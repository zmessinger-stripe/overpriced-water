/**
 * The canonical catalog. `npm run seed` reads this, upserts matching Stripe test-mode
 * Products/Prices, then upserts the rows into Postgres. Keyed on slug/sku so re-runs
 * neither duplicate Stripe prices nor orphan catalog rows.
 */

export interface SeedVariant {
  sku: string
  name: string
  sizeMl: number
  priceCents: number
  compareAtCents?: number
  isDefault?: boolean
}

export interface SeedProduct {
  slug: string
  name: string
  subtitle: string
  description: string
  story: string
  kind: 'single' | 'bundle'
  category: string
  hydrationIndex: number
  ph: number
  source: string
  tastingNotes: string[]
  badges: string[]
  subscriptionEligible: boolean
  variants: SeedVariant[]
  /** For bundles: SKUs of contained variants and their quantities. */
  contents?: { sku: string; quantity: number }[]
}

export const CATEGORIES = [
  {
    slug: 'by-occasion',
    name: 'By Occasion',
    tagline: 'Water, correctly matched to the moment.',
    heroCopy:
      'Drinking the wrong water at the wrong hour is a failure of planning, not of thirst. Our occasion-matched range removes the guesswork by removing the choice.',
    sortOrder: 1,
  },
  {
    slug: 'by-identity',
    name: 'By Identity',
    tagline: 'Water for the person you have decided to be.',
    heroCopy:
      'Hydration is downstream of self-concept. These bottles are formulated for who you are, which is to say for who you have told people you are.',
    sortOrder: 2,
  },
  {
    slug: 'collections',
    name: 'Collections',
    tagline: 'Multiple bottles, one commitment.',
    heroCopy:
      'A single bottle is a purchase. Several bottles, arranged in a box, is a philosophy. Collections ship in a rigid case that is, itself, quite expensive.',
    sortOrder: 3,
  },
] as const

export const PRODUCTS: SeedProduct[] = [
  {
    slug: 'monday-water',
    name: 'Monday Water',
    subtitle: 'For the day that begins before you do.',
    description:
      'A structurally serious water engineered for the first eleven minutes of the week. Monday Water is drawn on Sunday evening, so it has already accepted what is coming.',
    story:
      'We could not source a water that felt sufficiently resigned, so we built one. Monday Water rests for nine hours in a stainless vessel under low light while a recording of a distant printer plays at 14 decibels. The result is a water with no notes of optimism whatsoever. Our tasting panel described it as "correct." Two members declined to comment.',
    kind: 'single',
    category: 'by-occasion',
    hydrationIndex: 9.4,
    ph: 7.38,
    source: 'A single municipal tap in Zug, Switzerland, accessed on weekends only.',
    tastingNotes: ['Cold slate', 'Unread email', 'The idea of a bagel'],
    badges: ['Small batch', 'Rested 9 hours'],
    subscriptionEligible: true,
    variants: [
      { sku: 'OWC-MON-330', name: '330ml — The Commute', sizeMl: 330, priceCents: 3800, isDefault: true },
      { sku: 'OWC-MON-750', name: '750ml — The Full Morning', sizeMl: 750, priceCents: 6200, compareAtCents: 7600 },
    ],
  },
  {
    slug: 'post-workout-water',
    name: 'Post-Workout Water',
    subtitle: 'You have earned a water that knows it.',
    description:
      'Isotonically indistinguishable from other water, but presented in a heavier bottle so the achievement registers in the hand. Contains electrolytes in quantities we are legally required to describe as "present."',
    story:
      'Ordinary water does not acknowledge effort. It arrives the same whether you ran twelve kilometers or stood up. Post-Workout Water corrects this asymmetry through a 40% thicker glass wall, a cap that requires a deliberate quarter-turn, and a label printed in a typeface our designer described as "load-bearing." The water inside is water. The experience inside is not.',
    kind: 'single',
    category: 'by-occasion',
    hydrationIndex: 9.9,
    ph: 7.52,
    source: 'The same tap in Zug, collected post-meridian for tonal accuracy.',
    tastingNotes: ['Mineral resolve', 'Clean towel', 'Mild self-regard'],
    badges: ['Electrolytes: present', '40% heavier glass'],
    subscriptionEligible: true,
    variants: [
      { sku: 'OWC-PWO-500', name: '500ml — The Session', sizeMl: 500, priceCents: 4400, isDefault: true },
      { sku: 'OWC-PWO-1000', name: '1L — The Block', sizeMl: 1000, priceCents: 7400 },
    ],
  },
  {
    slug: 'water-for-standing-desk-owners',
    name: 'Water for People Who Own a Standing Desk',
    subtitle: 'Vertical hydration for the vertically committed.',
    description:
      'Formulated for the upright professional. The bottle is weighted at the base so it will not tip when you gesture, which you will.',
    story:
      'You bought the desk. You raised it. You have, on at least one occasion, mentioned it. This water completes the posture. Its center of gravity sits 31mm from the base — low enough to survive an emphatic point, high enough to look considered next to a monitor arm. We tested 40 bottle profiles against a robotic elbow. This one survived. The others are in a box we do not discuss.',
    kind: 'single',
    category: 'by-identity',
    hydrationIndex: 9.7,
    ph: 7.41,
    source: 'Zug tap, decanted at standing height (1.14m) to preserve orientation.',
    tastingNotes: ['Ergonomic clarity', 'Warm laminate', 'A lumbar sigh'],
    badges: ['Tip-resistant', 'Desk-adjacent certified'],
    subscriptionEligible: true,
    variants: [
      { sku: 'OWC-STD-600', name: '600ml — The Workday', sizeMl: 600, priceCents: 5200, isDefault: true },
      { sku: 'OWC-STD-1500', name: '1.5L — The Quarter', sizeMl: 1500, priceCents: 9800, compareAtCents: 11200 },
    ],
  },
  {
    slug: 'water-for-after-water',
    name: 'Water for After You’ve Already Had Water',
    subtitle: 'The second water. The serious one.',
    description:
      'The first water addresses thirst. This water addresses the question of whether the first water was enough. It was not.',
    story:
      'There exists a moment, roughly ninety seconds after finishing a bottle of water, in which a person becomes aware that the situation is unresolved. The industry has ignored this moment for a century. We have named it, bottled for it, and priced it accordingly. Do not drink this first. Drinking this first voids everything.',
    kind: 'single',
    category: 'by-identity',
    hydrationIndex: 10.0,
    ph: 7.44,
    source: 'Zug tap, second draw. The first draw is discarded ceremonially.',
    tastingNotes: ['Recursive minerality', 'Cold glass', 'Completion'],
    badges: ['Second draw only', 'Hydration Index 10.0'],
    subscriptionEligible: true,
    variants: [
      { sku: 'OWC-AFT-330', name: '330ml — The Follow-Up', sizeMl: 330, priceCents: 4800, isDefault: true },
    ],
  },
  {
    slug: 'water-for-people-who-have-a-newsletter',
    name: 'Water for People Who Have a Newsletter',
    subtitle: 'Hydration with a point of view.',
    description:
      'A water for those who publish weekly, whether or not anyone has asked. Bottled in amber to protect the contents from light and the reader from brevity.',
    story:
      'Every Thursday you sit down and you have thoughts. This water supports that. The amber glass filters wavelengths below 450nm, which does nothing for water but does a great deal for how the bottle photographs on a desk beside an open laptop. Ships with a card containing no information, which you may interpret at length.',
    kind: 'single',
    category: 'by-identity',
    hydrationIndex: 9.2,
    ph: 7.36,
    source: 'Zug tap, drawn during what we are calling "the quiet hour."',
    tastingNotes: ['Amber restraint', 'Long paragraph', 'Faint self-awareness'],
    badges: ['Amber glass', 'Interpretive card included'],
    subscriptionEligible: true,
    variants: [
      { sku: 'OWC-NWS-500', name: '500ml — The Issue', sizeMl: 500, priceCents: 4200, isDefault: true },
      { sku: 'OWC-NWS-750', name: '750ml — The Double Issue', sizeMl: 750, priceCents: 5900 },
    ],
  },
  {
    slug: 'the-deposition',
    name: 'The Deposition',
    subtitle: 'Four waters. One rigid case. No further questions.',
    description:
      'Our complete occasion range in a case machined from a single billet of aluminum, which costs more than the water and is the correct decision.',
    story:
      'Named for the only setting in which a person is handed water by someone who does not want to be there. The case weighs 2.1kg empty. It has a latch. The latch has a sound. We spent four months on the sound.',
    kind: 'bundle',
    category: 'collections',
    hydrationIndex: 9.8,
    ph: 7.42,
    source: 'Zug tap, four discrete draws, documented.',
    tastingNotes: ['Machined aluminum', 'Procedural calm', 'The latch'],
    badges: ['Milled case', 'Save 14%'],
    subscriptionEligible: true,
    variants: [
      { sku: 'OWC-DEP-CASE', name: 'The Complete Case', sizeMl: 2160, priceCents: 15600, compareAtCents: 18200, isDefault: true },
    ],
    contents: [
      { sku: 'OWC-MON-330', quantity: 1 },
      { sku: 'OWC-PWO-500', quantity: 1 },
      { sku: 'OWC-STD-600', quantity: 1 },
      { sku: 'OWC-AFT-330', quantity: 1 },
    ],
  },
  {
    slug: 'the-week',
    name: 'The Week',
    subtitle: 'Seven bottles. Non-negotiable order.',
    description:
      'A seven-bottle sequence with the drinking order printed on the base of each bottle. Deviating from the sequence is permitted but not supported.',
    story:
      'Hydration is not a quantity, it is a sequence. The Week arranges seven bottles in the only defensible order, determined over eleven months by a panel that stopped speaking to each other in month nine. Bottle four is the difficult one. We stand behind bottle four.',
    kind: 'bundle',
    category: 'collections',
    hydrationIndex: 9.6,
    ph: 7.4,
    source: 'Zug tap, seven consecutive mornings, one witness.',
    tastingNotes: ['Sequence', 'Structure', 'Bottle four'],
    badges: ['Numbered 1–7', 'Order printed on base'],
    subscriptionEligible: true,
    variants: [
      { sku: 'OWC-WEEK-7', name: 'Seven-Bottle Sequence', sizeMl: 3500, priceCents: 24800, compareAtCents: 29400, isDefault: true },
    ],
    contents: [
      { sku: 'OWC-MON-330', quantity: 2 },
      { sku: 'OWC-PWO-500', quantity: 2 },
      { sku: 'OWC-STD-600', quantity: 2 },
      { sku: 'OWC-NWS-500', quantity: 1 },
    ],
  },
]

/** Deadpan certification marks for the marquee. */
export const CERTIFICATIONS = [
  'pH verified ± 0.02',
  'Sourced from one tap',
  'Hydration Index audited',
  'Glass of consequence',
  'Bottled facing north',
  'No flavor added or admitted',
  'Panel-approved (4 of 6)',
  'Latch tested 11,000×',
]

/** Shipping and the handling fee we describe without flinching. */
export const SHIPPING_CENTS = 1800
export const CONCIERGE_CENTS = 900
export const FREE_SHIPPING_THRESHOLD_CENTS = 20000
export const SUBSCRIPTION_INTERVAL = 'month'

/**
 * The "continuity adjustment" a standing order earns. Defined once because three places depend
 * on it agreeing: the seeded Stripe recurring price, the unit price snapshotted into a cart
 * line, and the number the PDP promises before either of those exist.
 */
export const SUBSCRIPTION_DISCOUNT_BPS = 1500

export function subscriptionPriceCents(priceCents: number): number {
  return Math.round((priceCents * (10_000 - SUBSCRIPTION_DISCOUNT_BPS)) / 10_000)
}
