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

function AgentChatInner({ agentName }: { agentName: AgentName }) {
  const setSelectedAgent = useUiStore((s) => s.setSelectedAgent)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const agent = getAgent(agentName)!

  const rawMessages = useAgentStore((s) => s.sessions[agentName])
  const messages = rawMessages ?? EMPTY_MESSAGES
  const isStreaming = useAgentStore((s) => s.isStreaming)

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <>
      <div className="h-10 shrink-0 bg-base-2 border-b border-white/[0.06] flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <span
            className={['w-1.5 h-1.5 rounded-full shrink-0', isStreaming ? 'animate-pulse' : ''].join(' ')}
            style={{ backgroundColor: agent.color }}
          />
          <span className="text-text1 font-mono text-xs font-semibold">{agent.displayName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-text3 hover:text-text2 font-mono text-[10px] transition-colors">CHATS</button>
          <button className="text-blue hover:text-blue-bright font-mono text-[10px] transition-colors">NEW</button>
          <button onClick={() => setSelectedAgent(null)} className="text-text3 hover:text-text2 font-mono text-sm transition-colors leading-none">×</button>
        </div>
      </div>

      <div className="h-8 shrink-0 bg-base-2 border-b border-white/[0.06] flex items-end px-3 gap-4">
        <button className="text-text1 border-b-2 border-cyan -mb-px font-mono text-[10px] pb-1.5">Chat</button>
        <button className="text-text3 hover:text-text2 font-mono text-[10px] pb-1.5">History</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold font-mono"
              style={{ backgroundColor: `${agent.color}22`, color: agent.color }}>
              {agent.displayName.slice(0, 2)}
            </div>
            <p className="text-text2 font-mono text-xs font-semibold">What should we work on?</p>
            <p className="text-text3/70 font-mono text-[10px]">{agent.role}</p>
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

      <div className="shrink-0 p-3 bg-base-2 border-t border-white/[0.06]">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={`Message ${agent.displayName}…`} rows={2}
          className="w-full bg-base-3 border border-white/[0.06] rounded-lg px-3 py-2 text-text1 font-mono text-xs resize-none outline-none placeholder:text-text3 focus:border-blue/30 transition-colors"
        />
        <div className="flex items-center justify-between mt-1.5">
          <button className="text-[10px] text-text3 bg-base-3 border border-white/[0.06] rounded px-2 py-0.5 font-mono hover:text-text2 transition-colors">AUTO ▼</button>
          <button onClick={handleSubmit} disabled={!input.trim() || isStreaming}
            className="bg-blue hover:bg-blue-bright disabled:opacity-40 disabled:cursor-not-allowed text-white rounded px-3 py-1 font-mono text-xs transition-colors">
            {isStreaming ? '…' : '↑'}
          </button>
        </div>
      </div>
    </>
  )
}

export function AgentPanel() {
  const selectedAgent = useUiStore((s) => s.selectedAgent)

  return (
    <div className="w-[280px] shrink-0 flex flex-col bg-base-2 border-l border-white/[0.06] h-full">
      {!selectedAgent ? (
        <>
          <div className="h-10 flex items-center px-4 border-b border-white/[0.06] shrink-0">
            <span className="text-text3 font-mono text-[10px] uppercase tracking-widest">Agent</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-base-3 border border-white/[0.06] flex items-center justify-center text-xl">🤖</div>
            <p className="text-text3 font-mono text-xs">Select an agent</p>
            <p className="text-text3/50 font-mono text-[10px] leading-relaxed">Click any agent in the explorer to begin a conversation</p>
          </div>
        </>
      ) : (
        <AgentChatInner agentName={selectedAgent as AgentName} />
      )}
    </div>
  )
}
