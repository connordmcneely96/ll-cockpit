'use client'

import { usePermissionGate } from '@/hooks/usePermissionGate'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

const DESTRUCTIVE_TOOLS = new Set(['deploy', 'delete_file', 'run_command', 'send_email', 'submit_proposal', 'publish_content', 'render_video'])

interface PermissionGateProps {
  taskId: string
  agentDisplayName: string
}

function describeAction(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'deploy':
      return `Deploy ${input.project ?? 'project'} to ${input.environment ?? 'production'}`
    case 'delete_file':
      return `Permanently delete file: ${input.path ?? 'unknown'}`
    case 'run_command':
      return `Execute shell command: ${input.command ?? ''}`
    case 'send_email':
      return `Send email to ${input.to ?? '(recipient)'}: "${input.subject ?? ''}"`
    case 'write_file':
      return `Write file: ${input.path ?? input.filename ?? 'unknown'}`
    case 'submit_proposal':
      return `Submit Upwork proposal (job: ${input.job_id ?? '?'})`
    case 'publish_content':
      return `Publish content to ${input.platform ?? 'unknown platform'}`
    default:
      return `Execute tool: ${toolName}`
  }
}

export function PermissionGate({ taskId, agentDisplayName }: PermissionGateProps) {
  const { pendingToolCall, approve, reject } = usePermissionGate()

  if (!pendingToolCall) return null

  const isDestructive = DESTRUCTIVE_TOOLS.has(pendingToolCall.toolName)
  const description = describeAction(pendingToolCall.toolName, pendingToolCall.input)

  return (
    <Modal
      open={true}
      title={`${agentDisplayName} Requests Permission`}
      // No onClose — must explicitly approve or reject
    >
      <div className="space-y-4">
        {/* Warning banner for destructive actions */}
        {isDestructive && (
          <div className="flex items-start gap-2 bg-red/10 border border-red/30 rounded-lg p-3">
            <span className="text-red text-lg shrink-0">⚠</span>
            <p className="text-red text-sm font-mono">
              This action cannot be undone.
            </p>
          </div>
        )}

        {/* Tool name */}
        <div>
          <p className="text-text3 text-xs font-mono uppercase tracking-wider mb-1">Tool</p>
          <code className="text-cyan text-sm font-mono bg-navy-4 px-2 py-1 rounded">
            {pendingToolCall.toolName}
          </code>
        </div>

        {/* Plain-English description */}
        <div>
          <p className="text-text3 text-xs font-mono uppercase tracking-wider mb-1">Action</p>
          <p className="text-text1 text-sm font-mono">{description}</p>
        </div>

        {/* Raw input (collapsed) */}
        <details className="text-xs">
          <summary className="text-text3 font-mono cursor-pointer hover:text-text2">
            View raw input
          </summary>
          <pre className="mt-2 bg-navy-4 rounded p-2 text-text2 overflow-x-auto text-xs">
            {JSON.stringify(pendingToolCall.input, null, 2)}
          </pre>
        </details>

        {/* Approve / Reject */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => reject(taskId)}
          >
            Reject
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => approve(taskId)}
          >
            Approve
          </Button>
        </div>
      </div>
    </Modal>
  )
}
