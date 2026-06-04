'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  agentName: string
  prompt: string
  workingLabel: string
  source: string
  onComplete: (full: string, meta: { tokensUsed: number; costUsd: number }) => void
}

type SSEEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; [k: string]: unknown }
  | { type: 'done'; tokensUsed: number; costUsd: number; taskId?: string; chatId?: string }
  | { type: 'error'; message: string }

export function AgentRunStream({ agentName, prompt, workingLabel, source, onComplete }: Props) {
  const [text, setText] = useState('')
  const [eventCount, setEventCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 180_000)
    let accumulated = ''

    async function run() {
      try {
        const res = await fetch('/api/agent/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentName, message: prompt, source }),
          signal: ctrl.signal,
        })
        if (!res.ok || !res.body) { setError(`HTTP ${res.status}`); return }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { value, done: streamDone } = await reader.read()
          if (streamDone) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            let evt: SSEEvent
            try { evt = JSON.parse(raw) } catch { continue }
            setEventCount(n => n + 1)
            if (evt.type === 'text') {
              accumulated += evt.content
              setText(accumulated)
            } else if (evt.type === 'done') {
              clearTimeout(timer)
              setDone(true)
              onComplete(accumulated, { tokensUsed: evt.tokensUsed ?? 0, costUsd: evt.costUsd ?? 0 })
              return
            } else if (evt.type === 'error') {
              setError(evt.message)
              return
            }
          }
        }
        // Stream closed without an explicit done event — finalize with what we have
        if (accumulated.trim().length > 0) {
          clearTimeout(timer)
          setDone(true)
          onComplete(accumulated, { tokensUsed: 0, costUsd: 0 })
        } else {
          setError('Stream ended without output — the run may have timed out. Try again.')
        }
      } catch (e: unknown) {
        const name = (e as { name?: string }).name
        if (name === 'AbortError') {
          if (accumulated.trim().length > 0) {
            setDone(true)
            onComplete(accumulated, { tokensUsed: 0, costUsd: 0 })
          } else {
            setError('Run timed out after 3 minutes with no output. Try a more focused brief.')
          }
        } else {
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    }

    run()
    return () => { ctrl.abort(); clearTimeout(timer) }
  }, [agentName, prompt, source, onComplete])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [text])

  if (error) {
    return (
      <div className="rounded-lg px-4 py-3 text-[12px] font-mono" style={{ background: 'var(--d-elevated)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-red)' }}>
        ✗ {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center gap-3 text-[11px] font-mono" style={{ color: 'var(--t-tx3)' }}>
        {!done && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--t-p)' }} />
            {workingLabel}
          </span>
        )}
        <span style={{ color: 'var(--t-tx3)' }}>{eventCount} events</span>
      </div>
      <div
        ref={scrollRef}
        className="rounded-lg px-4 py-3 text-[11px] font-mono whitespace-pre-wrap overflow-auto"
        style={{ background: 'var(--d-elevated)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-tx1)', maxHeight: '60vh', minHeight: 200 }}
      >
        {text || <span style={{ color: 'var(--t-tx3)' }}>Waiting for response…</span>}
      </div>
    </div>
  )
}
