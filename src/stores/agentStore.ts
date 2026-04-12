'use client'

import { create } from 'zustand'
import type { ChatMessage, ToolCallEvent, AgentName } from '@/types'

interface AgentState {
  sessions: Record<AgentName, ChatMessage[]>
  sessionTokens: Record<AgentName, number>
  sessionCost: Record<AgentName, number>
  pendingToolCall: ToolCallEvent | null
  isStreaming: boolean

  addMessage: (agent: AgentName, message: ChatMessage) => void
  appendToLastMessage: (agent: AgentName, content: string) => void
  setPendingToolCall: (toolCall: ToolCallEvent | null) => void
  setStreaming: (streaming: boolean) => void
  addTokens: (agent: AgentName, tokens: number, cost: number) => void
  clearSession: (agent: AgentName) => void
}

export const useAgentStore = create<AgentState>((set) => ({
  sessions: {} as Record<AgentName, ChatMessage[]>,
  sessionTokens: {} as Record<AgentName, number>,
  sessionCost: {} as Record<AgentName, number>,
  pendingToolCall: null,
  isStreaming: false,

  addMessage: (agent, message) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [agent]: [...(state.sessions[agent] ?? []), message],
      },
    })),

  appendToLastMessage: (agent, content) =>
    set((state) => {
      const messages = state.sessions[agent] ?? []
      if (messages.length === 0) return state
      const last = messages[messages.length - 1]
      return {
        sessions: {
          ...state.sessions,
          [agent]: [
            ...messages.slice(0, -1),
            { ...last, content: last.content + content },
          ],
        },
      }
    }),

  setPendingToolCall: (toolCall) => set({ pendingToolCall: toolCall }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  addTokens: (agent, tokens, cost) =>
    set((state) => ({
      sessionTokens: {
        ...state.sessionTokens,
        [agent]: (state.sessionTokens[agent] ?? 0) + tokens,
      },
      sessionCost: {
        ...state.sessionCost,
        [agent]: (state.sessionCost[agent] ?? 0) + cost,
      },
    })),

  clearSession: (agent) =>
    set((state) => ({
      sessions: { ...state.sessions, [agent]: [] },
      sessionTokens: { ...state.sessionTokens, [agent]: 0 },
      sessionCost: { ...state.sessionCost, [agent]: 0 },
    })),
}))
