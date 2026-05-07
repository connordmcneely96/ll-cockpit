'use client'

import { useState, useRef, useEffect } from 'react'
import { useUiStore } from '@/stores/uiStore'
import { useAgentStore } from '@/stores/agentStore'
import { useAgentStream } from '@/hooks/useAgentStream'
import { AgentMessage } from '@/app/(cockpit)/agent/[name]/AgentMessage'
import { getAgent } from '@/lib/agents'
import type { AgentName } from '@/types'

const EMPTY_MESSAGES: never[] = []

function StreamingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-1 h-1 rounded-full bg-blue animate-dot-bounce"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  )
}

type PanelTab = 'chat' | 'history'

export function AgentPanel() {
  const selectedAgent = useUiStore((s) => s.selectedAgent)
  const setSelectedAgent = useUiStore((s) => s.setSelectedAgent)

  const [input, setInput] = useState('')
  const [tab, setTab] = useState<PanelTab>('chat')
  const [taskId] = useState(() => crypto.randomUUID())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Always call hooks — pass safe fallback when no agent selected
  const agentKey = (selectedAgent ?? 'nexus') as AgentName
  const rawMessages = useAgentStore((s) => s.sessions[agentKey])
  const messages = rawMessages ?? EMPTY_MESSAGES
  const isStreaming = useAgentStore((s) => s.isStreaming)
  const { sendMessage } = useAgentStream(agentKey)

  // Reset input + tab when selected agent changes
  useEffect(() => {
    setInput('')
    setTab('chat')
  }, [selectedAgent])

  // Scroll to bottom on new messages
  const messageCount = messages.length
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messageCount])

  const handleSubmit = async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming || !selectedAgent) return
    setInput('')
    await sendMessage(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const agent = selectedAgent ? getAgent(selectedAgent) : null

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!agent) {
    return (
      <div className="w-[280px] shrink-0 flex flex-col bg-base-2 border-l border-white/[0.06]">
        <div className="h-12 flex items-center px-4 border-b border-white/[0.06] shrink-0">
          <span className="text-text3 font-mono text-[10px] uppercase tracking-widest">
            Agent
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
          <div className="w-12 h-12 rounded-full bg-base-3 border border-white/[0.06] flex items-center justify-center text-2xl">
            🤖
          </div>
          <p className="text-text3 font-mono text-xs mt-1">Select an agent</p>
          <p className="text-[10px] text-text3/50 font-mono text-center px-4 leading-relaxed">
            Click any agent in the explorer to begin
          </p>
        </div>
      </div>
    )
  }

  // ── Agent chat ─────────────────────────────────────────────────────────────
  return (
    <div className="w-[280px] shrink-0 flex flex-col bg-base-2 border-l border-white/[0.06]">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-3 bg-base-2 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={['w-2 h-2 rounded-full shrink-0', isStreaming ? 'animate-pulse' : ''].join(' ')}
            style={{ backgroundColor: agent.color }}
          />
          <span className="text-text1 font-mono text-sm font-semibold truncate">
            {agent.displayName}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button className="text-[10px] text-text3 hover:text-text2 font-mono px-1 transition-colors">
            CHATS
          </button>
          <button className="text-[10px] text-blue hover:text-blue-bright font-mono px-1 transition-colors">
            NEW
          </button>
          <button
            onClick={() => setSelectedAgent(null)}
            className="w-5 h-5 flex items-center justify-center text-text3 hover:text-text1 font-mono transition-colors rounded hover:bg-base-3 text-sm"
            title="Close panel"
          >
            ×
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="h-8 flex items-end bg-base-2 border-b border-white/[0.06] px-3 gap-3 shrink-0">
        {(['chat', 'history'] as PanelTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'pb-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors border-b-2 -mb-px capitalize',
              tab === t
                ? 'border-cyan text-text1'
                : 'border-transparent text-text3 hover:text-text2',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-2">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-base font-bold font-mono"
              style={{ backgroundColor: `${agent.color}22`, color: agent.color }}
            >
              {agent.displayName.slice(0, 2)}
            </div>
            <p className="text-text2 font-mono text-xs mt-1">
              What should we work on?
            </p>
            <p className="text-[10px] text-text3 font-mono">{agent.role}</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <AgentMessage
              key={msg.id}
              message={msg}
              isLast={idx === messages.length - 1}
              agentColor={agent.color}
              agentName={agent.displayName}
            />
          ))
        )}
        {isStreaming && <StreamingDots />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 p-3 bg-base-2 border-t border-white/[0.06]">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${agent.displayName}…`}
          rows={2}
          className="w-full bg-base-3 border border-white/[0.06] rounded-lg px-3 py-2 text-text1 font-mono text-xs resize-none focus:outline-none focus:border-blue/30 placeholder:text-text3 transition-colors"
        />
        <div className="flex items-center justify-between mt-1.5">
          <button className="text-[10px] text-text3 bg-base-3 border border-white/[0.06] rounded px-2 py-0.5 font-mono hover:text-text2 transition-colors">
            AUTO ▼
          </button>
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            className="bg-blue hover:bg-blue-bright disabled:opacity-40 disabled:cursor-not-allowed text-white rounded px-3 py-1 text-xs font-mono transition-colors"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
