import { TerminalPane } from './TerminalPane'

export default function TerminalPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Chrome */}
      <div className="flex items-center justify-between px-4 h-9 shrink-0"
        style={{ background: 'var(--d-topbar)', backdropFilter: 'blur(var(--t-blur))', borderBottom: '1px solid var(--t-glass-bdr)' }}>
        <div className="flex items-center gap-2">
          {/* macOS traffic lights */}
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ffbd2e' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#28c840' }} />
          <span className="font-mono text-[10px] uppercase tracking-widest ml-3" style={{ color: 'var(--t-tx3)' }}>
            nexus-vm — bash
          </span>
        </div>
        <span className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>GCP us-central1 · e2-micro · free tier</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <TerminalPane />
      </div>
    </div>
  )
}
