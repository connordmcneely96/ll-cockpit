'use client'

import { useCallback } from 'react'
import { useAgentStore } from '@/stores/agentStore'
import { useUiStore } from '@/stores/uiStore'
import type { AgentName, SSEEvent, ChatMessage } from '@/types'

function randomId(): string {
  return Math.random().toString(36).slice(2, 11)
}

export function useAgentStream(agentName: AgentName) {
  const { addMessage, appendToLastMessage, setPendingToolCall, setStreaming, addTokens } =
    useAgentStore()
  const { addGlobalTokens } = useUiStore()

  const sendMessage = useCallback(
    async (userMessage: string) => {
      const userMsg: ChatMessage = {
        id: randomId(),
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      }
      addMessage(agentName, userMsg)

      const assistantMsg: ChatMessage = {
        id: randomId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }
      addMessage(agentName, assistantMsg)
      setStreaming(true)

      try {
        const res = await fetch('/api/agent/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentName, message: userMessage }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Stream failed' }))
          appendToLastMessage(agentName, `\n\n**Error:** ${err.error ?? 'Unknown error'}`)
          return
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event: SSEEvent = JSON.parse(line.slice(6))
                handleEvent(event)
              } catch {
                // skip malformed chunks
              }
            }
          }
        }
      } catch (err) {
        appendToLastMessage(
          agentName,
          `\n\n**Connection error:** ${err instanceof Error ? err.message : 'Unknown'}`
        )
      } finally {
        setStreaming(false)
      }

      function handleEvent(event: SSEEvent) {
        if (event.type === 'text') {
          appendToLastMessage(agentName, event.content)
        } else if (event.type === 'tool_call') {
          if (event.requiresApproval) {
            setPendingToolCall({
              id: event.id,
              toolName: event.name,
              input: event.input,
              requiresApproval: true,
            })
          }
        } else if (event.type === 'done') {
          addTokens(agentName, event.tokensUsed, event.costUsd)
          addGlobalTokens(event.tokensUsed, event.costUsd)
        } else if (event.type === 'error') {
          appendToLastMessage(agentName, `\n\n**Agent error:** ${event.message}`)
        }
      }
    },
    [agentName, addMessage, appendToLastMessage, setPendingToolCall, setStreaming, addTokens, addGlobalTokens]
  )

  return { sendMessage }
}
