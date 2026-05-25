/**
 * Sprint 145A — agent org-chart accessor.
 *
 * Reads the three new columns (reports_to, org_department, org_role) added
 * by migration 0027.  No LLM calls — pure D1 reads.
 */

import type { CloudflareEnv } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrgDepartment = 'executive' | 'growth' | 'engineering' | 'delivery' | 'qa'
export type OrgRole = 'ceo' | 'dept_head' | 'worker' | 'reviewer'

export interface AgentOrgRow {
  name: string
  display_name: string
  role: string
  reports_to: string | null
  org_department: OrgDepartment | null
  org_role: OrgRole | null
  // capability flags (mirrored from agents table)
  can_deploy: number
  can_write_files: number
  can_send_email: number
  can_delete: number
  read_only: number
  requires_approval: string | null
  status: string
}

// ── Accessors ─────────────────────────────────────────────────────────────────

export async function getOrgChart(env: CloudflareEnv): Promise<AgentOrgRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT name, display_name, role, reports_to, org_department, org_role,
            can_deploy, can_write_files, can_send_email, can_delete,
            read_only, requires_approval, status
     FROM agents
     WHERE status = 'active'
     ORDER BY
       CASE org_role WHEN 'ceo' THEN 0 WHEN 'dept_head' THEN 1 WHEN 'worker' THEN 2 ELSE 3 END,
       name ASC`,
  ).all<AgentOrgRow>()
  return results ?? []
}

export async function getDepartmentAgents(
  env: CloudflareEnv,
  department: OrgDepartment,
): Promise<AgentOrgRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT name, display_name, role, reports_to, org_department, org_role,
            can_deploy, can_write_files, can_send_email, can_delete,
            read_only, requires_approval, status
     FROM agents
     WHERE status = 'active' AND org_department = ?
     ORDER BY
       CASE org_role WHEN 'dept_head' THEN 0 WHEN 'worker' THEN 1 ELSE 2 END,
       name ASC`,
  )
    .bind(department)
    .all<AgentOrgRow>()
  return results ?? []
}

export async function getDepartmentHead(
  env: CloudflareEnv,
  department: OrgDepartment,
): Promise<AgentOrgRow | null> {
  return env.DB.prepare(
    `SELECT name, display_name, role, reports_to, org_department, org_role,
            can_deploy, can_write_files, can_send_email, can_delete,
            read_only, requires_approval, status
     FROM agents
     WHERE status = 'active' AND org_department = ? AND org_role = 'dept_head'
     LIMIT 1`,
  )
    .bind(department)
    .first<AgentOrgRow>()
}

export async function resolveAssignee(
  env: CloudflareEnv,
  department: OrgDepartment,
  opts: { capabilityNeeded?: 'can_deploy' | 'can_write_files' | 'can_send_email' | 'can_delete' } = {},
): Promise<AgentOrgRow | null> {
  const agents = await getDepartmentAgents(env, department)
  const workers = agents.filter((a) => a.org_role === 'worker' && !a.read_only)

  if (opts.capabilityNeeded) {
    const cap = opts.capabilityNeeded
    const capable = workers.filter((a) => (a[cap] as number) === 1)
    if (capable.length > 0) return capable[0]
  } else if (workers.length > 0) {
    return workers[0]
  }

  // fall back to dept_head
  return getDepartmentHead(env, department)
}

export async function validateAssignment(
  env: CloudflareEnv,
  agentName: string,
  department: OrgDepartment,
): Promise<boolean> {
  // agentName may arrive as display_name (uppercase) or name (lowercase)
  const row = await env.DB.prepare(
    `SELECT org_department FROM agents
     WHERE (name = ? OR display_name = ?) AND status = 'active'
     LIMIT 1`,
  )
    .bind(agentName.toLowerCase(), agentName.toUpperCase())
    .first<{ org_department: string | null }>()
  return row?.org_department === department
}
