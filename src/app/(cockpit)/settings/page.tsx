export const runtime = 'edge'

import { AgentPermissions } from './AgentPermissions'
import { BudgetSettings } from './BudgetSettings'
import { MCPStatus } from './MCPStatus'

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-condensed font-bold text-text1 uppercase tracking-wider">
          Settings
        </h1>
        <p className="text-text3 font-mono text-xs mt-1">
          Agent permissions, token budget, and system status
        </p>
      </div>

      <MCPStatus />
      <BudgetSettings />
      <AgentPermissions />
    </div>
  )
}
