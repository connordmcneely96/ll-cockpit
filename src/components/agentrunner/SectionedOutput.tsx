'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import { parseSections, RunnerSection } from '@/lib/agent-runner'

interface Props {
  full: string
  sections: RunnerSection[]
  meta: { tokensUsed: number; costUsd: number }
}

const MD = {
  h3: (p: object) => <h3 className="font-semibold mt-3 mb-1" style={{ color: 'var(--t-tx1)' }} {...p} />,
  p: (p: object) => <p className="mb-2" style={{ color: 'var(--t-tx2)' }} {...p} />,
  ul: (p: object) => <ul className="list-disc pl-5 mb-2 space-y-0.5" {...p} />,
  ol: (p: object) => <ol className="list-decimal pl-5 mb-2 space-y-0.5" {...p} />,
  li: (p: object) => <li style={{ color: 'var(--t-tx2)' }} {...p} />,
  table: (p: object) => <table className="w-full text-[11px] my-2 border-collapse" {...p} />,
  th: (p: object) => <th className="border px-2 py-1 text-left" style={{ borderColor: 'var(--t-glass-bdr)', color: 'var(--t-tx1)' }} {...p} />,
  td: (p: object) => <td className="border px-2 py-1" style={{ borderColor: 'var(--t-glass-bdr)', color: 'var(--t-tx2)' }} {...p} />,
  code: (p: object) => <code style={{ color: 'var(--t-p)' }} {...p} />,
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
            <div className="text-[12px] leading-relaxed" style={{ color: 'var(--t-tx1)' }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeHighlight]}
                components={MD}
              >{body}</ReactMarkdown>
            </div>
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
