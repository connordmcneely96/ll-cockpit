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
  { id: 'core', label: 'Core', items: [
    { id: 'home', label: 'Home', href: '/' },
    { id: 'launch-desk', label: 'Launch Desk', href: '/launch-desk' },
    { id: 'orchestrator', label: 'Orchestrator', href: '/orchestrator' },
    { id: 'pipeline', label: 'Pipeline', href: '/pipeline' },
    { id: 'history', label: 'History', href: '/history' },
    { id: 'oracle', label: 'ORACLE', href: '/oracle' },
  ]},
  { id: 'engineering', label: 'Engineering', items: [
    { id: 'rfq', label: 'RFQ', href: '/rfq' },
    { id: 'fmea', label: 'FMEA', href: '/fmea' },
    { id: 'proposal', label: 'Proposal', href: '/proposal' },
    { id: 'standards', label: 'Standards', href: '/standards' },
  ]},
  { id: 'operating', label: 'Operating Layer', items: [
    { id: 'agent', label: 'Agents', href: '/agent' },
    { id: 'library', label: 'Library', href: '/library' },
    { id: 'maintenance', label: 'Maintenance', href: '/maintenance' },
  ]},
  { id: 'develop', label: 'Develop', items: [
    { id: 'ide', label: 'IDE', href: '/ide' },
    { id: 'terminal', label: 'Terminal', href: '/terminal' },
    { id: 'storage', label: 'Storage', href: '/storage' },
    { id: 'd1-explorer', label: 'D1 Explorer', href: '/d1-explorer' },
    { id: 'browser', label: 'Browser', href: '/browser' },
    { id: 'ai-providers', label: 'AI Providers', href: '/ai-providers' },
  ]},
  { id: 'design', label: 'Design', items: [
    { id: 'design', label: 'Design', href: '/design' },
    { id: 'design-studio', label: 'Design Studio', href: '/design-studio' },
  ]},
  { id: 'intelligence', label: 'Intelligence', items: [
    { id: 'analytics', label: 'Analytics', href: '/analytics' },
    { id: 'finance', label: 'Finance', href: '/finance' },
    { id: 'learn', label: 'Learn', href: '/learn' },
  ]},
  { id: 'admin', label: 'Admin', items: [
    { id: 'settings', label: 'Settings', href: '/settings' },
  ]},
]

// mockBrain removed in 180B — SystemBrain now reads live D1 via getBrainLive()
