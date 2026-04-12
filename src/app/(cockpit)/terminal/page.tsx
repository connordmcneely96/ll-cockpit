export const runtime = 'edge'

import { TerminalPane } from './TerminalPane'

export default function TerminalPage() {
  return (
    <div className="h-full flex flex-col bg-navy">
      <div className="flex items-center gap-2 px-4 h-9 border-b border-gold/12 bg-navy-2 shrink-0">
        <span className="text-text3 font-mono text-xs uppercase tracking-wider">Terminal</span>
        <div className="flex items-center gap-1.5 ml-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-gold/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-green/60" />
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <TerminalPane />
      </div>
    </div>
  )
}
