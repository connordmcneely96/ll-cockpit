'use client'

import { useCallback } from 'react'
import { useAgentStore } from '@/stores/agentStore'

export function usePermissionGate() {
  const { pendingToolCall, setPendingToolCall } = useAgentStore()

  const approve = useCallback(
    async (taskId: string) => {
      if (!pendingToolCall) return
      try {
        await fetch('/api/agent/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolCallId: pendingToolCall.id, taskId, approved: true }),
        })
      } finally {
        setPendingToolCall(null)
      }
    },
    [pendingToolCall, setPendingToolCall]
  )

  const reject = useCallback(
    async (taskId: string) => {
      if (!pendingToolCall) return
      try {
        await fetch('/api/agent/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolCallId: pendingToolCall.id, taskId, approved: false }),
        })
      } finally {
        setPendingToolCall(null)
      }
    },
    [pendingToolCall, setPendingToolCall]
  )

  return { pendingToolCall, approve, reject }
}
