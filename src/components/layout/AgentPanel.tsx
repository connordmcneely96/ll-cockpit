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
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full animate-dot-bounce"
          style={{ backgroundColor: 'var(--t-p)', animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  )
}

function AgentChatInner({ agentName }: { agentName: AgentName }) {
  const setSelectedAgent = useUiStore(s => s.setSelectedAgent)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const agent = getAgent(agentName)!
  const rawMessages = useAgentStore(s => s.sessions[agentName])
  const messages = rawMessages ?? EMPTY_MESSAGES
  const isStreaming = useAgentStore(s => s.isStreaming)
  const { sendMessage } = useAgentStream(agentName)

  const messageCount = messages.length
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messageCount])

  const handleSubmit = async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    setInput('')
    await sendMessage(trimmed)
  }

  return (
    <>
      {/* Agent header */}
      <div
        className="h-10 shrink-0 flex items-center justify-between px-3"
        style={{
          borderBottom: '1px solid var(--t-glass-bdr)',
          background: 'var(--t-panel)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: agent.color, boxShadow: `0 0 6px ${agent.color}`, animation: isStreaming ? 'pulse 1s infinite' : 'none' }}
          />
          <span className="font-mono text-xs font-semibold" style={{ color: 'var(--t-tx1)' }}>{agent.displayName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="font-mono text-[10px] transition-colors" style={{ color: 'var(--t-tx3)' }}>CHATS</button>
          <button className="font-mono text-[10px] transition-colors" style={{ color: 'var(--t-p)' }}>NEW</button>
          <button onClick={() => setSelectedAgent(null)} className="font-mono text-sm leading-none" style={{ color: 'var(--t-tx3)' }}>×</button>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="h-8 shrink-0 flex items-end px-3 gap-4"
        style={{ borderBottom: '1px solid var(--t-glass-bdr)', background: 'var(--t-panel)' }}
      >
        <button className="font-mono text-[10px] pb-1.5 border-b-2" style={{ color: 'var(--t-p)', borderColor: 'var(--t-p)' }}>Chat</button>
        <button className="font-mono text-[10px] pb-1.5" style={{ color: 'var(--t-tx3)' }}>History</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold font-mono glass-card"
              style={{ color: agent.color, boxShadow: `0 0 20px ${agent.color}30` }}
            >
              {agent.displayName.slice(0, 2)}
            </div>
            <p className="font-mono text-xs font-semibold" style={{ color: 'var(--t-tx1)' }}>What should we work on?</p>
            <p className="font-mono text-[10px]" style={{ color: 'var(--t-tx3)' }}>{agent.role}</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <AgentMessage key={msg.id} message={msg} isLast={idx === messages.length - 1}
              agentColor={agent.color} agentName={agent.displayName} />
          ))
        )}
        {isStreaming && <StreamingDots />}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose */}
      <div
        className="shrink-0 p-3"
        style={{ borderTop: '1px solid var(--t-glass-bdr)', background: 'var(--t-panel)' }}
      >
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
          placeholder={`Message ${agent.displayName}…`}
          rows={2}
          className="w-full rounded-xl px-3 py-2 font-mono text-xs resize-none outline-none transition-all"
          style={{
            background: 'rgba(255,255,255,0.60)',
            border: '1px solid var(--t-glass-bdr)',
            boxShadow: 'var(--t-shadow)',
            color: 'var(--t-tx1)',
          }}
        />
        <div className="flex items-center justify-between mt-1.5">
          <button
            className="text-[10px] font-mono px-2 py-0.5 rounded-lg transition-all"
            style={{
              background: 'var(--t-panel)',
              border: '1px solid var(--t-glass-bdr)',
              color: 'var(--t-tx3)',
              boxShadow: 'var(--t-shadow)',
            }}
          >AUTO ▼</button>
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            className="font-mono text-xs px-3 py-1 rounded-lg transition-all disabled:opacity-40"
            style={{
              background: 'var(--t-p)',
              color: '#fff',
              boxShadow: '0 2px 8px var(--t-p-glow)',
            }}
          >{isStreaming ? '…' : '↑'}</button>
        </div>
      </div>
    </>
  )
}

export function AgentPanel() {
  const selectedAgent = useUiStore(s => s.selectedAgent)

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        background: 'var(--t-panel)',
        backdropFilter: 'blur(var(--t-blur))',
        WebkitBackdropFilter: 'blur(var(--t-blur))',
        borderLeft: '1px solid var(--t-glass-bdr)',
        boxShadow: 'var(--t-shadow)',
      }}
    >
      {!selectedAgent ? (
        <>
          <div
            className="h-10 flex items-center px-4 shrink-0"
            style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}
          >
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>Agent</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl glass-card"
              style={{ boxShadow: '0 0 24px var(--t-p-glow)' }}
            >🤖</div>
            <p className="font-mono text-xs font-semibold" style={{ color: 'var(--t-tx1)' }}>Select an agent</p>
            <p className="font-mono text-[10px] leading-relaxed" style={{ color: 'var(--t-tx3)' }}>Click any agent in the explorer to begin a conversation</p>
          </div>
        </>
      ) : (
        <AgentChatInner agentName={selectedAgent as AgentName} />
      )}
    </div>
  )
}
