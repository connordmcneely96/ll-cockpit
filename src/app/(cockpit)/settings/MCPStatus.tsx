'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'

interface ServiceStatus {
  name: string
  url: string
  status: 'checking' | 'ok' | 'error'
  detail?: string
}

const SERVICES: Omit<ServiceStatus, 'status'>[] = [
  { name: 'Anthropic API', url: '/api/health' },
  { name: 'D1 Database', url: '/api/health' },
  { name: 'KV Namespace', url: '/api/health' },
  { name: 'Supabase', url: '/api/health' },
  { name: 'Paperclip', url: 'http://127.0.0.1:3100' },
]

export function MCPStatus() {
  const [statuses, setStatuses] = useState<ServiceStatus[]>(
    SERVICES.map((s) => ({ ...s, status: 'checking' }))
  )

  useEffect(() => {
    let active = true

    async function check() {
      try {
        const res = await fetch('/api/health')
        const data = await res.json() as Record<string, unknown>

        if (!active) return

        setStatuses((prev) =>
          prev.map((s) => {
            if (s.name === 'D1 Database')
              return { ...s, status: data.d1 === true ? 'ok' : 'error', detail: data.d1_error }
            if (s.name === 'KV Namespace')
              return { ...s, status: data.kv === true ? 'ok' : 'error', detail: data.kv_error }
            if (s.name === 'Supabase')
              return { ...s, status: data.supabase === true ? 'ok' : 'error' }
            if (s.name === 'Anthropic API')
              return { ...s, status: res.ok ? 'ok' : 'error' }
            return s
          })
        )
      } catch {
        if (!active) return
        setStatuses((prev) =>
          prev.map((s) =>
            ['D1 Database', 'KV Namespace', 'Supabase', 'Anthropic API'].includes(s.name)
              ? { ...s, status: 'error' }
              : s
          )
        )
      }

      // Check Paperclip separately (cross-origin)
      try {
        const r = await fetch('http://127.0.0.1:3100', { mode: 'no-cors', signal: AbortSignal.timeout(2000) })
        if (!active) return
        setStatuses((prev) =>
          prev.map((s) => (s.name === 'Paperclip' ? { ...s, status: 'ok' } : s))
        )
      } catch {
        if (!active) return
        setStatuses((prev) =>
          prev.map((s) =>
            s.name === 'Paperclip'
              ? { ...s, status: 'error', detail: 'Not reachable — run: npx paperclip start' }
              : s
          )
        )
      }
    }

    check()
    return () => { active = false }
  }, [])

  return (
    <div>
      <h2 className="text-text2 font-condensed font-semibold text-sm uppercase tracking-wider mb-3">
        System Status
      </h2>
      <div className="bg-navy-3 border border-gold/12 rounded-xl overflow-hidden">
        {statuses.map((s, i) => (
          <div
            key={s.name}
            className={[
              'flex items-center justify-between px-4 py-3',
              i < statuses.length - 1 ? 'border-b border-gold/8' : '',
            ].join(' ')}
          >
            <div>
              <p className="text-text1 font-mono text-xs font-semibold">{s.name}</p>
              {s.detail && (
                <p className="text-text3 font-mono text-[10px] mt-0.5">{s.detail}</p>
              )}
            </div>
            {s.status === 'checking' ? (
              <span className="text-text3 font-mono text-xs animate-pulse">checking…</span>
            ) : (
              <Badge variant={s.status === 'ok' ? 'green' : 'red'}>
                {s.status === 'ok' ? 'OK' : 'ERROR'}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
