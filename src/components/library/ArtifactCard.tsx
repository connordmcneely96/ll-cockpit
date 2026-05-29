'use client'

import { useState } from 'react'

export interface Artifact {
  id: string
  producing_agent: string | null
  artifact_type: string | null
  artifact_name: string | null
  storage_type: string | null
  storage_ref: string | null
  r2_bucket: string | null
  format: string | null
  size_bytes: number | null
  quality_score: number | null
  sentinel_pass: number | null
  status: string | null
  created_at: number | null
}

function fmtBytes(n: number | null): string {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const STATUS_COLOR: Record<string, string> = {
  active: 'text-blue border-blue/30 bg-blue/5',
  delivered: 'text-green border-green/30 bg-green/5',
  archived: 'text-text3 border-white/[0.06] bg-base-4',
}

export function ArtifactCard({ artifact, list = false }: { artifact: Artifact; list?: boolean }) {
  const [copied, setCopied] = useState(false)
  const validated = artifact.sentinel_pass === 1
  const status = artifact.status ?? 'active'
  const r2key = artifact.r2_bucket && artifact.storage_ref
    ? `${artifact.r2_bucket}/${artifact.storage_ref}`
    : (artifact.storage_ref ?? '—')

  const copyKey = () => {
    if (r2key === '—') return
    navigator.clipboard?.writeText(r2key).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }).catch(() => {})
  }

  const badge = 'px-1.5 py-0.5 font-mono text-[9px] rounded uppercase border'

  return (
    <div className={`bg-base-3 border border-white/[0.06] rounded-lg p-4 flex flex-col gap-3 hover:border-white/[0.12] transition-colors ${list ? 'lg:flex-row lg:items-center lg:gap-4' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-1 min-w-0">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-text1 truncate">{artifact.artifact_name ?? 'Untitled artifact'}</p>
          <p className="text-text3 font-mono text-[10px] mt-0.5">via {artifact.producing_agent ?? 'unknown'}</p>
        </div>
        {artifact.artifact_type && (
          <span className={`${badge} text-cyan border-cyan/30 bg-cyan/5 shrink-0`}>{artifact.artifact_type}</span>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${badge} ${STATUS_COLOR[status] ?? STATUS_COLOR.archived}`}>{status}</span>
        <span className={`${badge} ${validated ? 'text-green border-green/30 bg-green/5' : 'text-gold border-gold/30 bg-gold/5'}`}>
          {validated ? '✓ validated' : 'untested'}
        </span>
        {artifact.format && <span className={`${badge} text-text3 border-white/[0.06] bg-base-4`}>{artifact.format}</span>}
        <span className="font-mono text-[10px] text-text3">{fmtBytes(artifact.size_bytes)}</span>
      </div>

      {/* R2 key (copy-on-click) */}
      <button onClick={copyKey} title="Copy storage key"
        className="text-left bg-base-4 border border-white/[0.06] rounded px-2 py-1 font-mono text-[9px] text-text3 truncate hover:text-text2 transition-colors">
        {copied ? '✓ copied' : r2key}
      </button>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {[
          { label: 'Open', title: 'Open artifact (R2 fetch — phase 2)' },
          { label: 'Preview', title: 'Preview artifact (R2 fetch — phase 2)' },
          { label: 'Key', title: 'Copy storage key', onClick: copyKey },
          { label: 'Details', title: 'View lineage & metadata (phase 2)' },
        ].map(({ label, title, onClick }) => (
          <button key={label} onClick={onClick} title={title}
            className="px-2 py-0.5 bg-base-4 border border-white/[0.06] text-blue font-mono text-[9px] rounded hover:border-blue/30 hover:bg-blue/5 transition-colors">
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
