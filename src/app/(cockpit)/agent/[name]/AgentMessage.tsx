import { StreamText } from '@/components/ui/StreamText'
import type { ChatMessage } from '@/types'

interface AgentMessageProps {
  message: ChatMessage
  isLast: boolean
  agentColor: string
  agentName: string
}

export function AgentMessage({ message, isLast, agentColor, agentName }: AgentMessageProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-base-3 border border-white/[0.08] rounded-2xl px-4 py-2 text-text1 font-mono text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      {/* Colored left indicator */}
      <div className="flex flex-col items-center pt-1 shrink-0">
        <div
          className="w-0.5 rounded-full"
          style={{ backgroundColor: agentColor, width: '2px', minHeight: '1rem', alignSelf: 'stretch' }}
        />
      </div>

      {/* Message content */}
      <div className="flex-1 min-w-0 pb-1">
        <div className="text-[10px] font-mono text-text3 mb-1">{agentName}</div>
        <div className="text-text1 text-sm agent-prose">
          <StreamText text={message.content} showCursor={isLast} />
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc) => (
              <div
                key={tc.id}
                className="flex items-center gap-2 text-xs font-mono text-text3 bg-base-4 border border-white/[0.06] rounded px-2 py-1"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    tc.approved === true ? 'bg-green' :
                    tc.approved === false ? 'bg-red' : 'bg-gold'
                  }`}
                />
                <code className="text-cyan">{tc.toolName}</code>
                <span>
                  {tc.approved === true ? '✓ approved' :
                   tc.approved === false ? '✗ rejected' : 'pending'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Cost/tokens */}
        {message.tokens && (
          <div className="mt-1.5 text-[10px] text-text3 font-mono">
            {message.tokens.toLocaleString()} tokens
            {message.costUsd != null && ` · $${message.costUsd.toFixed(5)}`}
          </div>
        )}
      </div>
    </div>
  )
}
