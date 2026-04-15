export const runtime = 'edge'

import Link from 'next/link'
import { AGENT_LIST } from '@/lib/agents'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export default function DashboardPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-condensed font-bold text-text1 tracking-wider uppercase">
          NEXUS PRIME
        </h1>
        <p className="text-text3 font-mono text-sm mt-1">
          Leadership Legacy Digital AI Cockpit
        </p>
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { href: '/ide', label: 'IDE', icon: '⌨', desc: 'Monaco editor' },
          { href: '/terminal', label: 'Terminal', icon: '>', desc: 'xterm.js' },
          { href: '/orchestrator', label: 'Orchestrator', icon: '⬡', desc: 'Paperclip' },
          { href: '/pipeline', label: 'Pipeline', icon: '⋯', desc: 'Kanban board' },
        ].map(({ href, label, icon, desc }) => (
          <Link key={href} href={href}>
            <Card className="text-center hover:border-gold/30 transition-colors">
              <div className="text-2xl mb-1">{icon}</div>
              <div className="text-text1 font-condensed font-semibold text-sm uppercase">
                {label}
              </div>
              <div className="text-text3 font-mono text-xs">{desc}</div>
            </Card>
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
              <Card className="flex items-start gap-3 hover:border-gold/30">
                {/* Color indicator */}
                <div
                  className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: agent.color }}
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
                  <p className="text-text3 font-mono text-xs truncate">{agent.role}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
