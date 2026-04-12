import { AGENT_LIST } from '@/lib/agents'
import { Badge } from '@/components/ui/Badge'

export function OrgChart() {
  const orchestrator = AGENT_LIST.find((a) => a.name === 'nexus')!
  const agents = AGENT_LIST.filter((a) => a.name !== 'nexus')

  return (
    <div className="p-6">
      {/* Root: NEXUS */}
      <div className="flex justify-center mb-6">
        <div
          className="px-4 py-2 rounded-lg border-2 font-condensed font-bold text-sm uppercase tracking-wider"
          style={{
            borderColor: orchestrator.color,
            color: orchestrator.color,
            backgroundColor: `${orchestrator.color}11`,
          }}
        >
          {orchestrator.displayName} — {orchestrator.role}
        </div>
      </div>

      {/* Connector line */}
      <div className="flex justify-center mb-6">
        <div className="w-px h-6 bg-gold/20" />
      </div>

      {/* Agents grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className="bg-navy-3 border rounded-lg p-3 text-center"
            style={{ borderColor: `${agent.color}33` }}
          >
            <div
              className="w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center text-xs font-bold font-mono"
              style={{ backgroundColor: `${agent.color}22`, color: agent.color }}
            >
              {agent.displayName.slice(0, 2)}
            </div>
            <div className="text-text1 font-condensed font-semibold text-xs uppercase">
              {agent.displayName}
            </div>
            <div className="text-text3 font-mono text-[10px] mt-0.5 truncate">{agent.role}</div>
            <div className="mt-1.5 flex flex-wrap gap-1 justify-center">
              {agent.permissions.can_deploy && <Badge variant="red">D</Badge>}
              {agent.permissions.can_write_files && <Badge variant="gold">W</Badge>}
              {agent.permissions.can_send_email && <Badge variant="cyan">E</Badge>}
              {agent.permissions.read_only && <Badge>R</Badge>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
