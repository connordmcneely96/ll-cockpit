'use client'

import { useState, useRef, useEffect } from 'react'
import { useUiStore } from '@/stores/uiStore'
import { useAgentStore } from '@/stores/agentStore'
import { useAgentStream } from '@/hooks/useAgentStream'
import { AgentMessage } from '@/app/(cockpit)/agent/[name]/AgentMessage'
import { getAgent } from '@/lib/agents'
import type { AgentName, ToolCallEvent } from '@/types'
import { Shield, ShieldCheck, ShieldX, ChevronDown, ChevronUp } from 'lucide-react'

const EMPTY_MESSAGES: never[] = []

function StreamingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map(i => (
        <span key={i} className="inline-block w-1.5 h-1.5 rounded-full animate-dot-bounce"
          style={{ backgroundColor: 'var(--t-p)', animationDelay: `${i * 0.16}s` }} />
      ))}
    </div>
  )
}

// ── PermissionGate ──
function PermissionGate({ toolCall, agentName }: { toolCall: ToolCallEvent; agentName: AgentName }) {
  const setPendingToolCall = useAgentStore(s => s.setPendingToolCall)
  const addMessage = useAgentStore(s => s.addMessage)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verdict, setVerdict] = useState<'approved' | 'rejected' | null>(null)

  const handle = async (approved: boolean) => {
    setLoading(true)
    try {
      await fetch('/api/agent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolCallId: toolCall.id,
          taskId: null,
          approved,
        }),
      })
      setVerdict(approved ? 'approved' : 'rejected')

      // Add a system message into the chat showing the verdict
      addMessage(agentName, {
        id: Math.random().toString(36).slice(2),
        role: 'assistant',
        content: approved
          ? `✓ **${toolCall.toolName}** approved and executed.`
          : `✗ **${toolCall.toolName}** rejected by operator.`,
        timestamp: Date.now(),
      })

      // Clear the pending tool call
      setTimeout(() => setPendingToolCall(null), 1200)
    } finally {
      setLoading(false)
    }
  }

  const isDone = verdict !== null

  return (
    <div className="mx-3 my-2 rounded-2xl overflow-hidden"
      style={{
        border: isDone
          ? `1px solid ${verdict === 'approved' ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`
          : '1px solid rgba(245,158,11,0.40)',
        background: isDone
          ? verdict === 'approved' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)'
          : 'rgba(245,158,11,0.06)',
        boxShadow: isDone ? 'none' : '0 0 16px rgba(245,158,11,0.12)',
      }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {isDone
          ? verdict === 'approved'
            ? <ShieldCheck size={14} style={{ color: '#10b981', flexShrink: 0 }} />
            : <ShieldX size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
          : <Shield size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />}
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] font-semibold"
            style={{ color: isDone ? (verdict === 'approved' ? '#10b981' : '#ef4444') : '#f59e0b' }}>
            {isDone
              ? verdict === 'approved' ? 'Approved' : 'Rejected'
              : 'Permission Required'}
          </p>
          <p className="font-mono text-[10px] truncate" style={{ color: 'var(--t-tx3)' }}>
            {toolCall.toolName}
          </p>
        </div>
        <button onClick={() => setExpanded(e => !e)} className="shrink-0"
          style={{ color: 'var(--t-tx3)' }}>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Expandable input preview */}
      {expanded && (
        <div className="px-3 pb-2">
          <pre className="font-mono text-[9px] whitespace-pre-wrap rounded-xl p-2 overflow-x-auto"
            style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--t-tx2)', maxHeight: 120 }}>
            {JSON.stringify(toolCall.input, null, 2)}
          </pre>
        </div>
      )}

      {/* Approve / Reject buttons */}
      {!isDone && (
        <div className="flex gap-2 px-3 pb-3">
          <button
            onClick={() => handle(true)}
            disabled={loading}
            className="flex-1 font-mono text-[11px] font-semibold py-1.5 rounded-xl transition-all disabled:opacity-50"
            style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.35)' }}>
            {loading ? '…' : '✓ Approve'}
          </button>
          <button
            onClick={() => handle(false)}
            disabled={loading}
            className="flex-1 font-mono text-[11px] font-semibold py-1.5 rounded-xl transition-all disabled:opacity-50"
            style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.30)' }}>
            {loading ? '…' : '✗ Reject'}
          </button>
        </div>
      )}
    </div>
  )
}

interface ChatRecord {
  id: string
  title: string | null
  agent: string | null
  created_at: number
  last_active: number | null
}

function HistoryView({ agentName, onLoad }: { agentName: AgentName; onLoad: () => void }) {
  const loadChat = useAgentStore(s => s.loadChat)
  const [chats, setChats] = useState<ChatRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/chats?agent=${agentName}&limit=20`, { signal: controller.signal })
      .then(r => r.json() as Promise<{ chats?: ChatRecord[] }>)
      .then(data => setChats(data.chats ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [agentName])

  const handleLoad = async (chatId: string) => {
    setLoadingId(chatId)
    try {
      const res = await fetch(`/api/chats/${chatId}`)
      const data = await res.json() as { chat?: ChatRecord; messages?: any[] }
      if (data.messages) {
        loadChat(agentName, chatId, data.messages)
        onLoad()
      }
    } finally {
      setLoadingId(null)
    }
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <span className="font-mono text-[10px] animate-pulse" style={{ color: 'var(--t-tx3)' }}>Loading…</span>
    </div>
  )

  if (chats.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="font-mono text-xs font-semibold" style={{ color: 'var(--t-tx2)' }}>No past sessions</p>
      <p className="font-mono text-[10px]" style={{ color: 'var(--t-tx3)' }}>Start a conversation to create a session history.</p>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
      {chats.map(chat => (
        <button
          key={chat.id}
          onClick={() => handleLoad(chat.id)}
          disabled={loadingId === chat.id}
          className="w-full text-left px-3 py-2.5 rounded-xl transition-all disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--t-glass-bdr)' }}
        >
          <p className="font-mono text-[11px] font-semibold truncate" style={{ color: 'var(--t-tx1)' }}>
            {loadingId === chat.id ? 'Loading…' : (chat.title ?? 'Untitled session')}
          </p>
          <p className="font-mono text-[9px] mt-0.5" style={{ color: 'var(--t-tx3)' }}>
            {new Date(chat.last_active ?? chat.created_at).toLocaleString()}
          </p>
        </button>
      ))}
    </div>
  )
}

// ── AgentChatInner ──
function AgentChatInner({ agentName }: { agentName: AgentName }) {
  const setSelectedAgent = useUiStore(s => s.setSelectedAgent)
  const clearSession = useAgentStore(s => s.clearSession)
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat')
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const agent = getAgent(agentName)!
  const rawMessages = useAgentStore(s => s.sessions[agentName])
  const messages = rawMessages ?? EMPTY_MESSAGES
  const isStreaming = useAgentStore(s => s.isStreaming)
  const pendingToolCall = useAgentStore(s => s.pendingToolCall)
  const { sendMessage } = useAgentStream(agentName)

  const messageCount = messages.length
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messageCount, pendingToolCall])

  const handleSubmit = async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    setInput('')
    await sendMessage(trimmed)
  }

  return (
    <>
      {/* Agent header */}
      <div className="h-10 shrink-0 flex items-center justify-between px-3"
        style={{ borderBottom: '1px solid var(--t-glass-bdr)', background: 'var(--t-panel)' }}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: agent.color, boxShadow: `0 0 6px ${agent.color}`, animation: isStreaming ? 'pulse 1s infinite' : 'none' }} />
          <span className="font-mono text-xs font-semibold" style={{ color: 'var(--t-tx1)' }}>{agent.displayName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="font-mono text-[10px] transition-colors"
            style={{ color: 'var(--t-p)' }}
            onClick={() => { clearSession(agentName); setActiveTab('chat') }}
            title="Start a new session"
          >NEW</button>
          <button onClick={() => setSelectedAgent(null)} className="font-mono text-sm leading-none" style={{ color: 'var(--t-tx3)' }}>×</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="h-8 shrink-0 flex items-end px-3 gap-4"
        style={{ borderBottom: '1px solid var(--t-glass-bdr)', background: 'var(--t-panel)' }}>
        <button
          className="font-mono text-[10px] pb-1.5 border-b-2"
          style={{ color: activeTab === 'chat' ? 'var(--t-p)' : 'var(--t-tx3)', borderColor: activeTab === 'chat' ? 'var(--t-p)' : 'transparent' }}
          onClick={() => setActiveTab('chat')}
        >Chat</button>
        <button
          className="font-mono text-[10px] pb-1.5 border-b-2"
          style={{ color: activeTab === 'history' ? 'var(--t-p)' : 'var(--t-tx3)', borderColor: activeTab === 'history' ? 'var(--t-p)' : 'transparent' }}
          onClick={() => setActiveTab('history')}
        >History</button>
      </div>

      {/* Messages — only shown on Chat tab */}
      {activeTab === 'chat' && <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold font-mono glass-card"
              style={{ color: agent.color, boxShadow: `0 0 20px ${agent.color}30` }}>
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

        {/* PermissionGate — shown inline after messages when tool requires approval */}
        {pendingToolCall && !isStreaming && (
          <PermissionGate toolCall={pendingToolCall} agentName={agentName} />
        )}

        <div ref={messagesEndRef} />
      </div>}

      {/* Compose — only shown on Chat tab */}
      {activeTab === 'chat' &&
      <div className="shrink-0 p-3" style={{ borderTop: '1px solid var(--t-glass-bdr)', background: 'var(--t-panel)' }}>
        {/* Locked indicator when pending approval */}
        {pendingToolCall && !isStreaming && (
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <Shield size={10} style={{ color: '#f59e0b' }} />
            <span className="font-mono text-[9px]" style={{ color: '#f59e0b' }}>
              Approve or reject the tool call above before continuing
            </span>
          </div>
        )}
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
          placeholder={pendingToolCall ? 'Resolve the permission request above…' : `Message ${agent.displayName}…`}
          disabled={!!pendingToolCall && !isStreaming}
          rows={2}
          className="w-full rounded-xl px-3 py-2 font-mono text-xs resize-none outline-none transition-all disabled:opacity-40"
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
            style={{ background: 'var(--t-panel)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-tx3)', boxShadow: 'var(--t-shadow)' }}
            title="Model routing: AUTO selects the best model for the task"
            aria-label="Model routing mode: AUTO"
          >AUTO ▼</button>
          <button onClick={handleSubmit} disabled={!input.trim() || isStreaming || !!pendingToolCall}
            className="font-mono text-xs px-3 py-1 rounded-lg transition-all disabled:opacity-40"
            style={{ background: 'var(--t-p)', color: '#fff', boxShadow: '0 2px 8px var(--t-p-glow)' }}>
            {isStreaming ? '…' : '↑'}
          </button>
        </div>
      </div>}

      {/* History tab content */}
      {activeTab === 'history' && (
        <HistoryView agentName={agentName} onLoad={() => setActiveTab('chat')} />
      )}
    </>
  )
}

// ── AgentPanel ──
export function AgentPanel() {
  const selectedAgent = useUiStore(s => s.selectedAgent)

  return (
    <div className="flex flex-col h-full overflow-hidden"
      style={{
        background: 'var(--t-panel)',
        backdropFilter: 'blur(var(--t-blur))',
        WebkitBackdropFilter: 'blur(var(--t-blur))',
        borderLeft: '1px solid var(--t-glass-bdr)',
        boxShadow: 'var(--t-shadow)',
      }}>
      {!selectedAgent ? (
        <>
          <div className="h-10 flex items-center px-4 shrink-0"
            style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>Agent</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl glass-card"
              style={{ boxShadow: '0 0 24px var(--t-p-glow)' }}>🤖</div>
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
