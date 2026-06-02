'use client'

import { parseSections, RunnerSection } from '@/lib/agent-runner'

interface Props {
  full: string
  sections: RunnerSection[]
  meta: { tokensUsed: number; costUsd: number }
}

export function SectionedOutput({ full, sections, meta }: Props) {
  const parsed = parseSections(full, sections.map(s => s.title))
  const colorMap = Object.fromEntries(sections.map(s => [s.title, s.color]))
  const copyAll = () => navigator.clipboard.writeText(full)

  return (
    <div className="flex flex-col gap-4 w-full max-w-3xl">
      {parsed.length === 0 ? (
        <div className="rounded-lg px-4 py-3" style={{ background: 'var(--d-elevated)', border: '1px solid var(--t-glass-bdr)' }}>
          <div className="text-[10px] uppercase tracking-widest font-mono mb-2" style={{ color: 'var(--t-tx3)' }}>Raw Output</div>
          <div className="whitespace-pre-wrap font-mono text-[11px]" style={{ color: 'var(--t-tx1)' }}>{full}</div>
        </div>
      ) : (
        parsed.map(({ title, body }) => (
          <div
            key={title}
            className="rounded-lg px-4 py-3"
            style={{ background: 'var(--d-elevated)', border: '1px solid var(--t-glass-bdr)', borderLeft: `3px solid ${colorMap[title] ?? 'var(--t-tx3)'}` }}
          >
            <div className="text-[10px] uppercase tracking-widest font-mono mb-2" style={{ color: colorMap[title] ?? 'var(--t-tx3)' }}>
              {title}
            </div>
            <div className="whitespace-pre-wrap font-mono text-[11px]" style={{ color: 'var(--t-tx1)' }}>{body}</div>
          </div>
        ))
      )}
      <div
        className="flex items-center justify-between px-4 py-2 rounded-lg text-[10px] font-mono"
        style={{ background: 'var(--d-elevated)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-tx3)' }}
      >
        <span>{meta.tokensUsed.toLocaleString()} tokens · ${meta.costUsd.toFixed(4)}</span>
        <button onClick={copyAll} className="underline transition-colors" style={{ color: 'var(--t-p)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Copy all
        </button>
      </div>
    </div>
  )
}
