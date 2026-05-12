/**
 * /design — Sprint 16 v0.1 Design Build dashboard
 */

import DesignClient from './DesignClient'

export default function DesignPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-cyan-400 font-mono tracking-tight">
            DESIGN BUILD
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Brief → DESIGNER tokens → COMPOSER HTML → CRITIC review → client-shareable preview URL.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500">Sprint 16 · v0.1</div>
      </header>

      <DesignClient />
    </div>
  )
}
