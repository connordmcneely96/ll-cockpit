
import Link from 'next/link'
import { AGENT_LIST } from '@/lib/agents'
import { Badge } from '@/components/ui/Badge'

export default function DashboardPage() {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-condensed font-bold text-text1 tracking-wider uppercase inline-flex flex-col">
          <span className="relative">
            NEXUS PRIME
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-gold" />
          </span>
        </h1>
        <p className="text-text3 font-mono text-sm mt-3">
          Leadership Legacy Digital AI Cockpit
        </p>
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { href: '/ide', label: 'IDE', icon: '</>', desc: 'Monaco editor' },
          { href: '/terminal', label: 'Terminal', icon: '>_', desc: 'xterm.js' },
          { href: '/orchestrator', label: 'Orchestrator', icon: '◈', desc: 'Paperclip' },
          { href: '/pipeline', label: 'Pipeline', icon: '⋮⋮', desc: 'Kanban board' },
        ].map(({ href, label, icon, desc }) => (
          <Link key={href} href={href}>
            <div className="bg-base-3 border border-white/[0.06] rounded-lg p-4 text-center transition-all hover:border-blue/30 hover:[box-shadow:0_0_16px_rgba(59,130,246,0.1)] group cursor-pointer">
              <div className="text-2xl mb-1 font-mono text-text3 group-hover:text-blue transition-colors">
                {icon}
              </div>
              <div className="text-text1 font-condensed font-semibold text-sm uppercase">
                {label}
              </div>
              <div className="text-text3 font-mono text-xs mt-0.5">{desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Agents grid */}
      <div>
        <h2 className="text-text2 font-condensed font-semibold text-xs uppercase tracking-widest mb-3">
          Agents — Select to Chat
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {AGENT_LIST.map((agent) => (
            <Link key={agent.name} href={`/agent/${agent.name}`}>
              <div className="bg-base-3 border border-white/[0.06] rounded-lg p-4 flex items-start gap-3 transition-all hover:border-blue/20 hover:bg-base-3/50 hover:[box-shadow:0_0_16px_rgba(59,130,246,0.08)] cursor-pointer">
                {/* Color square */}
                <div
                  className="w-1 h-1 rounded-sm mt-1.5 shrink-0"
                  style={{ backgroundColor: agent.color, width: '4px', height: '4px', marginTop: '6px' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-text1 font-condensed font-bold text-sm">
                      {agent.displayName}
                    </span>
                    <Badge
                      variant={
                        agent.permissions.can_deploy
                          ? 'red'
                          : agent.permissions.can_write_files
                            ? 'gold'
                            : agent.permissions.read_only
                              ? 'default'
                              : 'cyan'
                      }
                    >
                      {agent.permissions.can_deploy
                        ? 'DEPLOY'
                        : agent.permissions.read_only
                          ? 'READ'
                          : 'WRITE'}
                    </Badge>
                  </div>
                  <p className="text-text3 font-mono text-[10px] truncate">{agent.role}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
