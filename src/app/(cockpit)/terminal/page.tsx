
import { TerminalPane } from './TerminalPane'

export default function TerminalPage() {
  return (
    <div className="h-full flex flex-col bg-base">
      {/* Terminal chrome */}
      <div className="flex items-center justify-between px-4 h-9 bg-base-2 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          {/* Traffic lights */}
          <span className="w-2 h-2 rounded-full bg-red/70" />
          <span className="w-2 h-2 rounded-full bg-gold/70" />
          <span className="w-2 h-2 rounded-full bg-green/70" />
          <span className="ml-3 text-text3 font-mono text-[11px] uppercase tracking-wider">
            Terminal
          </span>
        </div>
        {/* Connection status */}
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-text3">
          <span className="w-1.5 h-1.5 rounded-full bg-green" />
          <span>Connected</span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <TerminalPane />
      </div>
    </div>
  )
}
