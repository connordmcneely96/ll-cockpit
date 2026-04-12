'use client'

import { AGENT_LIST } from '@/lib/agents'
import { Badge } from '@/components/ui/Badge'

export function AgentPermissions() {
  return (
    <div>
      <h2 className="text-text2 font-condensed font-semibold text-sm uppercase tracking-wider mb-3">
        Agent Permissions
      </h2>
      <div className="border border-gold/12 rounded-xl overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-gold/12 bg-navy-4">
              <th className="text-left px-4 py-2 text-text3 font-semibold">Agent</th>
              <th className="px-3 py-2 text-text3 font-semibold">Deploy</th>
              <th className="px-3 py-2 text-text3 font-semibold">Write</th>
              <th className="px-3 py-2 text-text3 font-semibold">Email</th>
              <th className="px-3 py-2 text-text3 font-semibold">Delete</th>
              <th className="text-left px-4 py-2 text-text3 font-semibold">Gated Tools</th>
            </tr>
          </thead>
          <tbody>
            {AGENT_LIST.map((agent, i) => (
              <tr
                key={agent.name}
                className={[
                  'border-b border-gold/8',
                  i % 2 === 0 ? 'bg-navy-3' : 'bg-navy-2',
                ].join(' ')}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: agent.color }}
                    />
                    <span className="text-text1 font-semibold">{agent.displayName}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={agent.permissions.can_deploy ? 'text-red' : 'text-text3'}>
                    {agent.permissions.can_deploy ? '✓' : '–'}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={agent.permissions.can_write_files ? 'text-gold' : 'text-text3'}>
                    {agent.permissions.can_write_files ? '✓' : '–'}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={agent.permissions.can_send_email ? 'text-cyan' : 'text-text3'}>
                    {agent.permissions.can_send_email ? '✓' : '–'}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={agent.permissions.can_delete ? 'text-red' : 'text-text3'}>
                    {agent.permissions.can_delete ? '✓' : '–'}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {agent.permissions.requires_approval.length === 0 ? (
                      <span className="text-text3">none</span>
                    ) : (
                      agent.permissions.requires_approval.map((t) => (
                        <Badge key={t} variant="gold">{t}</Badge>
                      ))
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
