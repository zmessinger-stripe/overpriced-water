import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-32 text-center md:px-10">
      <p className="label-mono text-mineral">404</p>
      <p className="display-lg mt-6">This water does not exist.</p>
      <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-ink/60">
        Which is not the same as saying it never did. Batches are finite and pages are retired
        without ceremony.
      </p>
      <Link
        href="/water/by-occasion"
        className="label-mono mt-10 inline-block bg-ink px-8 py-4 text-paper transition-colors hover:bg-mineral"
      >
        Browse what remains
      </Link>
    </div>
  )
}
