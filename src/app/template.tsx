'use client'

import { motion } from 'motion/react'

/**
 * A `template.tsx` (not `layout.tsx`) remounts on every navigation, which is exactly what a
 * page transition needs. The rise is small and fast — 14px, 380ms — because a luxury store
 * should feel settled, not swooshy. `prefers-reduced-motion` neutralizes it via `globals.css`.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}
