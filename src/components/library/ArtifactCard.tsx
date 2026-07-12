'use client'

import { useState } from 'react'
import ModelViewer from './ModelViewer'
import DrawingsPanel from './DrawingsPanel'

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
  pipeline_run_id?: string | null
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

export function ArtifactCard({ artifact, list = false, drawings }: { artifact: Artifact; list?: boolean; drawings?: Artifact[] }) {
  const [copied, setCopied] = useState(false)
  const [preview, setPreview] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [contentErr, setContentErr] = useState<string | null>(null)
  const fmt = artifact.format ?? 'md'
  const contentUrl = `/api/library/artifacts/${artifact.id}/content`

  const openPreview = () => {
    // STEP has no preview surface — download-only.
    if (fmt === 'step') return
    setPreview(true)
    // GLB is binary — ModelViewer fetches/renders it itself; skip the text fetch.
    if (fmt === 'glb') return
    if (content !== null || loadingContent) return
    setLoadingContent(true)
    setContentErr(null)
    fetch(contentUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => setContent(t))
      .catch((e) => setContentErr(String(e?.message ?? e)))
      .finally(() => setLoadingContent(false))
  }
  const openTab = () => window.open(contentUrl, '_blank', 'noopener,noreferrer')
  const download = () => window.open(`${contentUrl}?download=1`, '_blank', 'noopener,noreferrer')

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
        {artifact.artifact_type === 'cad-model' && fmt === 'glb' && artifact.pipeline_run_id && (
          <a href={`/cad/${artifact.pipeline_run_id}`} title="Open the full CAD deliverable page"
            className="px-2 py-0.5 bg-base-4 border border-white/[0.06] text-cyan font-mono text-[9px] rounded hover:border-cyan/30 hover:bg-cyan/5 transition-colors">Open deliverable</a>
        )}
        <button onClick={openTab} title="Open the deliverable in a new tab"
          className="px-2 py-0.5 bg-base-4 border border-white/[0.06] text-blue font-mono text-[9px] rounded hover:border-blue/30 hover:bg-blue/5 transition-colors">Open</button>
        {fmt !== 'step' && (
          <button onClick={openPreview} title="Preview the deliverable here"
            className="px-2 py-0.5 bg-base-4 border border-white/[0.06] text-blue font-mono text-[9px] rounded hover:border-blue/30 hover:bg-blue/5 transition-colors">Preview</button>
        )}
        <button onClick={download} title="Download the deliverable"
          className="px-2 py-0.5 bg-base-4 border border-white/[0.06] text-blue font-mono text-[9px] rounded hover:border-blue/30 hover:bg-blue/5 transition-colors">Download</button>
        <button onClick={copyKey} title="Copy storage key"
          className="px-2 py-0.5 bg-base-4 border border-white/[0.06] text-blue font-mono text-[9px] rounded hover:border-blue/30 hover:bg-blue/5 transition-colors">{copied ? '✓' : 'Key'}</button>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setPreview(false)}
        >
          <div
            className="bg-base-2 border border-white/[0.12] rounded-xl w-full max-w-4xl flex flex-col overflow-hidden"
            style={{ height: '82vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.08] shrink-0">
              <p className="font-mono text-xs font-semibold text-text1 truncate">{artifact.artifact_name ?? 'Artifact'}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={openTab} className="px-2 py-0.5 bg-base-4 border border-white/[0.06] text-blue font-mono text-[9px] rounded hover:border-blue/30">New tab</button>
                <button onClick={download} className="px-2 py-0.5 bg-base-4 border border-white/[0.06] text-blue font-mono text-[9px] rounded hover:border-blue/30">Download</button>
                <button onClick={() => setPreview(false)} className="px-2 py-0.5 bg-base-4 border border-white/[0.06] text-text2 font-mono text-[9px] rounded hover:text-text1">✕ Close</button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto bg-base-1">
              {fmt === 'glb' ? (
                <div className="flex flex-col">
                  <div className="h-[55vh] shrink-0">
                    <ModelViewer src={contentUrl} />
                  </div>
                  <DrawingsPanel drawings={drawings ?? []} />
                </div>
              ) : loadingContent ? (
                <p className="font-mono text-[10px] text-text3 p-6">Loading deliverable…</p>
              ) : contentErr ? (
                <p className="font-mono text-[10px] text-red p-6">Failed to load: {contentErr}</p>
              ) : content === null ? null : fmt === 'html' ? (
                <iframe title="artifact" sandbox="allow-scripts" srcDoc={content} className="w-full h-full border-0 bg-white" />
              ) : (
                <pre className="font-mono text-[11px] text-text2 p-4 whitespace-pre-wrap break-words">{content}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
