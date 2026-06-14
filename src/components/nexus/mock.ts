export interface NavItem {
  id: string
  label: string
  href: string
  active?: boolean
}

export interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

export interface BrainSection {
  id: string
  label: string
  value: string
  status?: 'success' | 'warning' | 'error' | 'info' | 'neutral'
}

export interface TenantData {
  org: string
  project: string
  env: 'Production' | 'Staging' | 'Development'
  role: string
  deployStatus: 'Healthy' | 'Degraded' | 'Down'
  monthlySpend: string
  avatarInitials: string
}

export const mockTenant: TenantData = {
  org: 'ConnorPattern',
  project: 'LL Cockpit',
  env: 'Production',
  role: 'Owner',
  deployStatus: 'Healthy',
  monthlySpend: '$3.82',
  avatarInitials: 'CM',
}

export const mockNavGroups: NavGroup[] = [
  {
    id: 'core',
    label: 'Core',
    items: [
      { id: 'home', label: 'Home', href: '/nexus', active: true },
      { id: 'projects', label: 'Projects', href: '/nexus/projects' },
      { id: 'launch-desk', label: 'Launch Desk', href: '/launch-desk' },
      { id: 'oracle', label: 'ORACLE', href: '/nexus/oracle' },
      { id: 'orchestrator', label: 'Orchestrator', href: '/orchestrator' },
      { id: 'history', label: 'History', href: '/history' },
    ],
  },
  {
    id: 'operating-layer',
    label: 'Operating Layer',
    items: [
      { id: 'agents', label: 'Agents', href: '/nexus/agents' },
      { id: 'workflows', label: 'Workflows', href: '/nexus/workflows' },
      { id: 'data', label: 'Data', href: '/nexus/data' },
      { id: 'memory', label: 'Memory', href: '/nexus/memory' },
      { id: 'runs', label: 'Runs', href: '/nexus/runs' },
      { id: 'artifacts', label: 'Artifacts', href: '/nexus/artifacts' },
      { id: 'deployments', label: 'Deployments', href: '/nexus/deployments' },
    ],
  },
  {
    id: 'develop',
    label: 'Develop',
    items: [
      { id: 'ide', label: 'IDE', href: '/ide' },
      { id: 'terminal', label: 'Terminal', href: '/terminal' },
      { id: 'storage', label: 'Storage', href: '/storage' },
      { id: 'd1-explorer', label: 'D1 Explorer', href: '/d1-explorer' },
      { id: 'ai-providers', label: 'AI Providers', href: '/ai-providers' },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    items: [
      { id: 'analytics', label: 'Analytics', href: '/analytics' },
      { id: 'finance', label: 'Finance', href: '/finance' },
      { id: 'learn', label: 'Learn', href: '/learn' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      { id: 'admin', label: 'Admin', href: '/nexus/admin' },
    ],
  },
]

// mockBrain removed in 180B — SystemBrain now reads live D1 via getBrainLive()
