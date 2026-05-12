'use client'

import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAgentStore } from '@/stores/agentStore'
import { useAgentStream } from '@/hooks/useAgentStream'
import { AgentMessage } from './AgentMessage'
import { PermissionGate } from './PermissionGate'
import { formatCost } from '@/lib/cost'
import type { AgentConfig, ChatMessage, AgentChatMessageRow } from '@/types'

interface AgentChatProps {
  agent: AgentConfig
}

type Tab = 'chat' | 'files' | 'plan'

const EMPTY_MESSAGES: never[] = []

function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full bg-blue animate-dot-bounce"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  )
}

export function AgentChat({ agent }: AgentChatProps) {
  const [input, setInput] = useState('')
  const [tab, setTab] = useState<Tab>('chat')
  const [taskId] = useState(() => crypto.randomUUID())
  const [hydrating, setHydrating] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const searchParams = useSearchParams()
  const chatIdParam = searchParams.get('chat')

  const rawMessages = useAgentStore((s) => s.sessions[agent.name])
  const messages = rawMessages ?? EMPTY_MESSAGES

  const isStreaming = useAgentStore((s) => s.isStreaming)
  const tokens = useAgentStore((s) => s.sessionTokens[agent.name] ?? 0)
  const cost = useAgentStore((s) => s.sessionCost[agent.name] ?? 0)
  const currentChatId = useAgentStore((s) => s.chatIds[agent.name] ?? null)
  const loadChat = useAgentStore((s) => s.loadChat)
  const clearSession = useAgentStore((s) => s.clearSession)

  const { sendMessage } = useAgentStream(agent.name)

  const messageCount = messages.length
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messageCount])

  // Sprint 17 v0.3.0 — hydrate from ?chat= query param
  useEffect(() => {
    if (!chatIdParam || chatIdParam === currentChatId) return
    let cancelled = false
    setHydrating(true)
    fetch(`/api/chats/${chatIdParam}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Chat not found or access denied')
        const data = (await res.json()) as {
          chat: { id: string; agent_name: string }
          messages: AgentChatMessageRow[]
        }
        if (cancelled) return
        if (data.chat.agent_name !== agent.name) {
          // Chat belongs to a different agent
          alert(`This chat belongs to ${data.chat.agent_name.toUpperCase()}.`)
          return
        }
        const hydrated: ChatMessage[] = data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.created_at * 1000,
          tokens: m.input_tokens + m.output_tokens,
          costUsd: m.cost_usd,
        }))
        loadChat(agent.name, data.chat.id, hydrated)
      })
      .catch((e) => {
        console.error('Failed to hydrate chat:', e)
      })
      .finally(() => {
        if (!cancelled) setHydrating(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatIdParam, agent.name])

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

  const handleNewChat = () => {
    if (isStreaming) return
    if (messages.length > 0 && !confirm('Start a new chat? Current messages will clear from this view (they remain saved in History).')) {
      return
    }
    clearSession(agent.name)
  }

  return (
    <div className="flex flex-col h-full bg-base">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-base-2 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={[
              'w-2 h-2 rounded-full shrink-0 transition-all',
              isStreaming ? 'animate-pulse' : '',
            ].join(' ')}
            style={{ backgroundColor: agent.color }}
          />
          <div>
            <span className="text-text1 font-condensed font-bold text-base uppercase tracking-wider">
              {agent.displayName}
            </span>
            <span className="ml-2 text-text3 font-mono text-xs">{agent.role}</span>
          </div>
          {currentChatId && (
            <span className="text-text3 font-mono text-[10px] px-2 py-0.5 rounded-full bg-blue/10 border border-blue/20">
              thread: {currentChatId.slice(0, 8)}
            </span>
          )}
          {hydrating && (
            <span className="text-text3 font-mono text-[10px]">loading history…</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {agent.permissions.can_deploy && (
            <span className="px-2 py-0.5 rounded-full bg-red/20 border border-white/[0.08] text-red/80 font-mono text-[10px]">
              DEPLOY
            </span>
          )}
          {agent.permissions.can_write_files && (
            <span className="px-2 py-0.5 rounded-full bg-blue/20 border border-white/[0.08] text-blue-bright/80 font-mono text-[10px]">
              FILES
            </span>
          )}
          {agent.permissions.can_send_email && (
            <span className="px-2 py-0.5 rounded-full bg-cyan/20 border border-white/[0.08] text-cyan/80 font-mono text-[10px]">
              EMAIL
            </span>
          )}
          {tokens > 0 && (
            <span className="text-text3 font-mono text-[10px]">
              {tokens.toLocaleString()} tok · {formatCost(cost)}
            </span>
          )}
          <button
            onClick={handleNewChat}
            disabled={isStreaming}
            title="Start new chat"
            className="px-2 py-0.5 rounded-full bg-base-3 border border-white/[0.08] text-text2 hover:text-text1 hover:border-blue/30 font-mono text-[10px] transition-all disabled:opacity-40"
          >
            + NEW
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex bg-base-2 border-b border-white/[0.06] shrink-0 px-4">
        {(['chat', 'files', 'plan'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors border-b-2 -mb-px',
              tab === t
                ? 'border-blue text-text1 bg-base'
                : 'border-transparent text-text3 hover:text-text2',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'chat' && (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold mb-3"
                    style={{ backgroundColor: `${agent.color}22`, color: agent.color }}
                  >
                    {agent.displayName.slice(0, 2)}
                  </div>
                  <p className="text-text2 font-condensed font-semibold text-lg">
                    {agent.displayName}
                  </p>
                  <p className="text-text3 font-mono text-xs mt-1 max-w-xs">
                    {agent.role} — Send a message to begin
                  </p>
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
              {isStreaming && <StreamingIndicator />}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-base-2 border-t border-white/[0.06] shrink-0">
              <div className="flex gap-2 items-end bg-base-3 border border-white/[0.06] rounded-xl p-2 focus-within:border-blue/30 focus-within:[box-shadow:0_0_0_1px_rgba(59,130,246,0.15)] transition-all">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${agent.displayName}… (Enter to send, Shift+Enter for newline)`}
                  rows={1}
                  className="flex-1 bg-transparent text-text1 font-mono text-sm resize-none outline-none placeholder:text-text3 py-1 px-1 max-h-36 overflow-y-auto"
                  style={{ minHeight: '2rem' }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim() || isStreaming}
                  className="bg-blue hover:bg-blue-bright disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1.5 font-mono text-xs transition-colors shrink-0"
                >
                  {isStreaming ? '…' : '↑'}
                </button>
              </div>
              <p className="text-text3 text-[10px] font-mono mt-1.5 text-right">
                Enter to send · Shift+Enter for newline
              </p>
            </div>
          </>
        )}

        {tab === 'files' && (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div>
              <p className="text-text3 font-mono text-sm mb-2">File context</p>
              <p className="text-text3 text-xs">
                Files referenced or generated by {agent.displayName} will appear here.
              </p>
            </div>
          </div>
        )}

        {tab === 'plan' && (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div>
              <p className="text-text3 font-mono text-sm mb-2">Agent plan</p>
              <p className="text-text3 text-xs">
                When {agent.displayName} generates a multi-step plan, it appears here.
              </p>
            </div>
          </div>
        )}
      </div>

      <PermissionGate taskId={taskId} agentDisplayName={agent.displayName} />
    </div>
  )
}
