'use client'

import { useAgentStore } from '@/stores/agentStore'

interface StreamTextProps {
  text: string
  showCursor?: boolean
}

export function StreamText({ text, showCursor = false }: StreamTextProps) {
  const { isStreaming } = useAgentStore()

  return (
    <span className="whitespace-pre-wrap break-words">
      {text}
      {showCursor && isStreaming && (
        <span className="inline-block w-2 h-4 bg-gold ml-0.5 animate-cursor-blink align-text-bottom" />
      )}
    </span>
  )
}
