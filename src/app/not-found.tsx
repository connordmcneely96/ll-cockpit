import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0e1a] gap-4 text-center p-8">
      <p className="text-[#00d4ff] font-mono text-xs tracking-widest uppercase">404 · Not Found</p>
      <h1 className="text-[#e2e8f0] text-3xl font-semibold">Page not found</h1>
      <p className="text-[#64748b] text-sm max-w-md">
        The route you requested does not exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-2 px-4 py-2 bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-sm font-mono rounded-lg hover:bg-[#00d4ff]/20 transition-colors"
      >
        ← Back to Cockpit
      </Link>
    </div>
  )
}
