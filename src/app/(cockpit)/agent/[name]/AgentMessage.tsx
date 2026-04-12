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

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
          isUser ? 'bg-navy-4 text-text3' : ''
        }`}
        style={!isUser ? { backgroundColor: `${agentColor}22`, color: agentColor } : {}}
      >
        {isUser ? 'U' : agentName.slice(0, 2).toUpperCase()}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-navy-4 text-text2 rounded-tr-none'
            : 'bg-navy-3 border border-gold/12 text-text1 rounded-tl-none agent-prose'
        }`}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <StreamText text={message.content} showCursor={isLast} />
        )}

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc) => (
              <div
                key={tc.id}
                className="flex items-center gap-2 text-xs font-mono text-text3 bg-navy-4 rounded px-2 py-1"
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
          <div className="mt-1.5 text-[10px] text-text3 font-mono text-right">
            {message.tokens.toLocaleString()} tokens
            {message.costUsd != null && ` · $${message.costUsd.toFixed(5)}`}
          </div>
        )}
      </div>
    </div>
  )
}
