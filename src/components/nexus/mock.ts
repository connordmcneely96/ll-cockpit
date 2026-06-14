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
      { id: 'dashboard', label: 'Dashboard', href: '/nexus', active: true },
      { id: 'agents', label: 'Agents', href: '/nexus/agents' },
      { id: 'runs', label: 'Runs', href: '/nexus/runs' },
    ],
  },
  {
    id: 'operating-layer',
    label: 'Operating Layer',
    items: [
      { id: 'tasks', label: 'Tasks', href: '/nexus/tasks' },
      { id: 'queues', label: 'Queues', href: '/nexus/queues' },
      { id: 'storage', label: 'Storage', href: '/nexus/storage' },
    ],
  },
  {
    id: 'develop',
    label: 'Develop',
    items: [
      { id: 'design', label: 'Design Studio', href: '/design' },
      { id: 'terminal', label: 'Terminal', href: '/terminal' },
      { id: 'code', label: 'Code', href: '/nexus/code' },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    items: [
      { id: 'memory', label: 'Memory', href: '/nexus/memory' },
      { id: 'research', label: 'Research', href: '/nexus/research' },
      { id: 'oracle', label: 'Oracle', href: '/nexus/oracle' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      { id: 'settings', label: 'Settings', href: '/nexus/settings' },
      { id: 'billing', label: 'Billing', href: '/nexus/billing' },
    ],
  },
]

export const mockBrain: BrainSection[] = [
  { id: 'tenant', label: 'Active Tenant', value: 'ConnorPattern · LL Cockpit' },
  { id: 'agent', label: 'Active Agent', value: 'NEXUS (Orchestrator)', status: 'success' },
  { id: 'run', label: 'Active Run', value: 'run_8f3a · Sprint 180A', status: 'info' },
  { id: 'db', label: 'D1 Database', value: 'Online', status: 'success' },
  { id: 'kv', label: 'KV Store', value: 'Online', status: 'success' },
  { id: 'queue', label: 'Queue', value: '2 pending', status: 'warning' },
  { id: 'security', label: 'Security', value: 'Auth OK · No alerts', status: 'success' },
]
