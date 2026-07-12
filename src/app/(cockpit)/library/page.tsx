'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { LibraryKpis, type LibraryKpi } from '@/components/library/LibraryKpis'
import { ArtifactCard, type Artifact } from '@/components/library/ArtifactCard'

interface ApiResponse {
  ok: boolean
  error?: string
  artifacts?: Artifact[]
  kpi?: LibraryKpi
  filters?: { types: string[]; sources: string[] }
}

const STATUS_OPTS = ['all', 'active', 'delivered', 'archived']
const VALIDATION_OPTS = ['all', 'validated', 'untested']

function Dropdown({ label, value, opts, onChange }: { label: string; value: string; opts: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-text3 font-mono text-[9px] uppercase tracking-wider">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-base-3 border border-white/[0.06] rounded px-2 py-1 font-mono text-[10px] text-text2 outline-none focus:border-blue/30">
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

export default function LibraryPage() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [kpi, setKpi] = useState<LibraryKpi | null>(null)
  const [apiFilters, setApiFilters] = useState<{ types: string[]; sources: string[] }>({ types: [], sources: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')
  const [validation, setValidation] = useState('all')
  const [source, setSource] = useState('all')

  const load = useCallback(() => {
    setLoading(true)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    const qs = new URLSearchParams({ type, status, source }).toString()
    fetch(`/api/library/artifacts?${qs}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((d) => {
        if (!d.ok) { setError(d.error ?? 'Failed to load'); return }
        setError(null)
        setArtifacts(d.artifacts ?? [])
        setKpi(d.kpi ?? null)
        if (d.filters) setApiFilters(d.filters)
      })
      .catch(() => setError('Library timed out'))
      .finally(() => { clearTimeout(timer); setLoading(false) })
  }, [type, status, source])

  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    return artifacts.filter((a) => {
      if (validation === 'validated' && a.sentinel_pass !== 1) return false
      if (validation === 'untested' && a.sentinel_pass === 1) return false
      if (search && !(a.artifact_name ?? '').toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [artifacts, validation, search])

  // A CAD run has multiple execution dirs but only one emits drawings, so match
  // by RUN, not by directory: group cad-drawing rows by pipeline_run_id and let a
  // cad-model card render the drawings sharing its run — no extra fetch, no
  // run-scoped API.
  const drawingsFor = useMemo(() => {
    const byRun = new Map<string, Artifact[]>()
    for (const a of artifacts) {
      if (a.artifact_type !== 'cad-drawing' || !a.pipeline_run_id) continue
      const arr = byRun.get(a.pipeline_run_id) ?? []
      arr.push(a)
      byRun.set(a.pipeline_run_id, arr)
    }
    return (a: Artifact): Artifact[] => {
      if (a.artifact_type !== 'cad-model' || a.format !== 'glb' || !a.pipeline_run_id) return []
      return byRun.get(a.pipeline_run_id) ?? []
    }
  }, [artifacts])

  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
        <p className="text-text3 font-mono text-[10px] uppercase tracking-widest">Library</p>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap border-b border-white/[0.06]">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search artifacts…"
          className="bg-base-3 border border-white/[0.06] rounded px-2.5 py-1 font-mono text-[10px] text-text1 placeholder:text-text3 outline-none focus:border-blue/30 w-48" />
        <div className="flex rounded overflow-hidden border border-white/[0.06]">
          {(['grid', 'list'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-2 py-1 font-mono text-[9px] uppercase transition-colors ${view === v ? 'bg-blue/10 text-blue' : 'bg-base-3 text-text3 hover:text-text2'}`}>
              {v}
            </button>
          ))}
        </div>
        <Dropdown label="Type" value={type} opts={['all', ...apiFilters.types]} onChange={setType} />
        <Dropdown label="Status" value={status} opts={STATUS_OPTS} onChange={setStatus} />
        <Dropdown label="Validation" value={validation} opts={VALIDATION_OPTS} onChange={setValidation} />
        <Dropdown label="Visibility" value="all" opts={['all']} onChange={() => {}} />
        <Dropdown label="Source" value={source} opts={['all', ...apiFilters.sources]} onChange={setSource} />
      </div>

      <LibraryKpis kpi={kpi} />

      <div className="p-4 flex-1">
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-40 rounded-lg bg-base-3 animate-pulse" />)}
          </div>
        ) : error ? (
          <p className="font-mono text-[10px] text-red py-12 text-center">{error}</p>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-base-3 border border-white/[0.06] flex items-center justify-center text-2xl">📦</div>
            <p className="font-mono text-xs font-semibold text-text2">No artifacts yet</p>
            <p className="font-mono text-[10px] text-text3 max-w-xs">Agents will register outputs here as they produce them.</p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {shown.map((a) => <ArtifactCard key={a.id} artifact={a} drawings={drawingsFor(a)} />)}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {shown.map((a) => <ArtifactCard key={a.id} artifact={a} list drawings={drawingsFor(a)} />)}
          </div>
        )}
      </div>
    </div>
  )
}
