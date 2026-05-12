/**
 * /orchestrator — Sprint 14 v0.1 dashboard
 * Server component shell. Auth handled by middleware/(cockpit) layout.
 */

import OrchestratorClient from './OrchestratorClient'

export default function OrchestratorPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-cyan-400 font-mono tracking-tight">
            ORCHESTRATOR
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            HERMES decomposes a task into a DAG of subtasks across specialist agents.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500">Sprint 14 · v0.1</div>
      </header>

      <OrchestratorClient />
    </div>
  )
}
