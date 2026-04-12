import { OrgChart } from './OrgChart'

const PAPERCLIP_URL = 'http://127.0.0.1:3100'

export default function OrchestratorPage() {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gold/12 bg-navy-2 shrink-0">
        <span className="text-text2 font-condensed font-semibold text-sm uppercase tracking-wider">
          Orchestrator
        </span>
        <span className="text-text3 font-mono text-xs">
          Paperclip @ {PAPERCLIP_URL}
        </span>
      </div>

      {/* Split: Paperclip iframe + agent org chart */}
      <div className="flex-1 flex overflow-hidden">
        {/* Paperclip iframe */}
        <div className="flex-1 relative">
          <iframe
            src={PAPERCLIP_URL}
            className="w-full h-full border-0"
            title="Paperclip Orchestration"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
          {/* Overlay for when Paperclip isn't running */}
          <div className="absolute inset-0 flex items-center justify-center bg-navy pointer-events-none opacity-0 peer-empty:opacity-100">
            <div className="text-center">
              <p className="text-text2 font-condensed font-semibold text-lg mb-2">
                Paperclip Not Running
              </p>
              <p className="text-text3 font-mono text-xs mb-4">
                Start Paperclip locally to use agent orchestration
              </p>
              <code className="bg-navy-4 text-cyan text-xs font-mono px-3 py-1.5 rounded border border-gold/12">
                npx paperclip start
              </code>
            </div>
          </div>
        </div>

        {/* Org chart sidebar */}
        <div className="w-80 shrink-0 border-l border-gold/12 overflow-y-auto">
          <div className="px-4 py-2 border-b border-gold/12">
            <p className="text-text3 font-mono text-xs uppercase tracking-wider">Agent Map</p>
          </div>
          <OrgChart />
        </div>
      </div>
    </div>
  )
}
