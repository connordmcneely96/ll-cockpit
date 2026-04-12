'use client'

import { useState, useRef, useEffect } from 'react'
import { useAgentStore } from '@/stores/agentStore'
import { useAgentStream } from '@/hooks/useAgentStream'
import { AgentMessage } from './AgentMessage'
import { PermissionGate } from './PermissionGate'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatCost } from '@/lib/cost'
import type { AgentConfig } from '@/types'

interface AgentChatProps {
  agent: AgentConfig
}

type Tab = 'chat' | 'files' | 'plan'

export function AgentChat({ agent }: AgentChatProps) {
  const [input, setInput] = useState('')
  const [tab, setTab] = useState<Tab>('chat')
  const [taskId] = useState(() => crypto.randomUUID())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const messages = useAgentStore((s) => s.sessions[agent.name] ?? [])
  const isStreaming = useAgentStore((s) => s.isStreaming)
  const tokens = useAgentStore((s) => s.sessionTokens[agent.name] ?? 0)
  const cost = useAgentStore((s) => s.sessionCost[agent.name] ?? 0)

  const { sendMessage } = useAgentStream(agent.name)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gold/12 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: agent.color }}
          />
          <div>
            <span className="text-text1 font-condensed font-bold text-base uppercase tracking-wider">
              {agent.displayName}
            </span>
            <span className="ml-2 text-text3 font-mono text-xs">{agent.role}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Permissions badges */}
          {agent.permissions.can_deploy && <Badge variant="red">DEPLOY</Badge>}
          {agent.permissions.can_write_files && <Badge variant="gold">FILES</Badge>}
          {agent.permissions.can_send_email && <Badge variant="cyan">EMAIL</Badge>}
          {/* Token/cost */}
          {tokens > 0 && (
            <span className="text-text3 font-mono text-xs">
              {tokens.toLocaleString()} tok · {formatCost(cost)}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gold/12 shrink-0 px-4">
        {(['chat', 'files', 'plan'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors border-b-2 -mb-px',
              tab === t
                ? 'border-gold text-gold'
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
                    className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mb-3"
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
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gold/12 shrink-0">
              <div className="flex gap-2 items-end bg-navy-3 border border-gold/12 rounded-xl p-2 focus-within:border-gold/30 transition-colors">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${agent.displayName}… (Enter to send, Shift+Enter for newline)`}
                  rows={1}
                  className="flex-1 bg-transparent text-text1 font-mono text-sm resize-none outline-none placeholder:text-text3 py-1 px-1 max-h-36 overflow-y-auto"
                  style={{ minHeight: '2rem' }}
                />
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  loading={isStreaming}
                  disabled={!input.trim() || isStreaming}
                >
                  {isStreaming ? '' : '↑'}
                </Button>
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

      {/* Permission gate overlay */}
      <PermissionGate taskId={taskId} agentDisplayName={agent.displayName} />
    </div>
  )
}
