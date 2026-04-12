'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useUiStore } from '@/stores/uiStore'
import { AGENT_LIST } from '@/lib/agents'
import type { CommandItem } from '@/types'

export function CommandPalette() {
  const { commandPaletteOpen, closeCommandPalette } = useUiStore()
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  // Register Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        useUiStore.getState().openCommandPalette()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  const allCommands: CommandItem[] = useMemo(() => [
    // Nav commands
    { id: 'nav-home', label: 'Dashboard', description: 'Go to cockpit home', icon: '⬡', category: 'nav', action: () => router.push('/') },
    { id: 'nav-ide', label: 'IDE', description: 'Open code editor', icon: '⌨', category: 'nav', action: () => router.push('/ide') },
    { id: 'nav-terminal', label: 'Terminal', description: 'Open terminal', icon: '>', category: 'nav', action: () => router.push('/terminal') },
    { id: 'nav-orchestrator', label: 'Orchestrator', description: 'Paperclip agent orchestration', icon: '⬡', category: 'nav', action: () => router.push('/orchestrator') },
    { id: 'nav-pipeline', label: 'Pipeline', description: 'Project kanban board', icon: '⋯', category: 'nav', action: () => router.push('/pipeline') },
    { id: 'nav-settings', label: 'Settings', description: 'Agent permissions and config', icon: '⚙', category: 'nav', action: () => router.push('/settings') },
    // Agent commands
    ...AGENT_LIST.map((agent) => ({
      id: `agent-${agent.name}`,
      label: agent.displayName,
      description: agent.role,
      icon: '◈',
      category: 'agent' as const,
      action: () => router.push(`/agent/${agent.name}`),
    })),
  ], [router])

  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands
    const q = query.toLowerCase()
    return allCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q)
    )
  }, [allCommands, query])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[selectedIdx]?.action()
      closeCommandPalette()
    } else if (e.key === 'Escape') {
      closeCommandPalette()
    }
  }

  if (!commandPaletteOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeCommandPalette} />
      <div className="relative z-10 w-full max-w-lg bg-navy-3 border border-gold/20 rounded-xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/12">
          <span className="text-text3">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0) }}
            onKeyDown={handleKey}
            placeholder="Search commands, agents, pages…"
            className="flex-1 bg-transparent text-text1 font-mono text-sm outline-none placeholder:text-text3"
          />
          <kbd className="text-text3 text-xs font-mono bg-navy-4 px-1.5 py-0.5 rounded border border-white/10">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <ul className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-text3 text-sm font-mono">No results</li>
          ) : (
            filtered.map((item, idx) => (
              <li
                key={item.id}
                className={[
                  'flex items-center gap-3 px-4 py-2 cursor-pointer font-mono text-sm transition-colors',
                  idx === selectedIdx ? 'bg-gold/10 text-gold' : 'text-text2 hover:bg-white/5',
                ].join(' ')}
                onMouseEnter={() => setSelectedIdx(idx)}
                onClick={() => { item.action(); closeCommandPalette() }}
              >
                <span className="text-base w-5 text-center shrink-0 opacity-70">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{item.label}</div>
                  {item.description && (
                    <div className="text-xs text-text3 truncate">{item.description}</div>
                  )}
                </div>
                <span className="text-[10px] text-text3 uppercase tracking-wider shrink-0">
                  {item.category}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
