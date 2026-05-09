'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  HardDrive, RefreshCcw, Search, File, FileText,
  Folder, Eye, Download, Trash2, Upload, Grid, List,
  ChevronRight, AlertCircle, Clock, Weight,
} from 'lucide-react'

interface R2Object {
  key: string
  size: number
  uploaded: string
  etag: string
}

interface FolderNode {
  name: string
  prefix: string
  children: FolderNode[]
  files: R2Object[]
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getExt(key: string): string {
  return key.split('.').pop()?.toLowerCase() ?? ''
}

const TEXT_EXTS = new Set(['ts','tsx','js','jsx','json','md','css','html','py','sh','yaml','yml','toml','sql','txt','env','gitignore','csv','xml','svg'])

function FileIcon({ name, size = 14 }: { name: string; size?: number }) {
  const ext = getExt(name)
  const colors: Record<string, string> = {
    ts: '#3b82f6', tsx: '#06b6d4', js: '#f59e0b', jsx: '#f97316',
    json: '#10b981', md: '#8b5cf6', css: '#f43f5e', html: '#f97316',
    py: '#3b82f6', sql: '#00c9a7', toml: '#9ca3af', sh: '#10b981',
    zip: '#6b7280', png: '#ec4899', jpg: '#ec4899', svg: '#f43f5e',
  }
  return <FileText size={size} style={{ color: colors[ext] ?? 'var(--t-tx3)', flexShrink: 0 }} strokeWidth={1.5} />
}

function buildTree(objects: R2Object[]): FolderNode {
  const root: FolderNode = { name: 'll-cockpit-r2', prefix: '', children: [], files: [] }

  for (const obj of objects) {
    const parts = obj.key.split('/')
    if (parts.length === 1) {
      root.files.push(obj)
      continue
    }
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      const prefix = parts.slice(0, i + 1).join('/')
      let child = node.children.find(c => c.name === seg)
      if (!child) {
        child = { name: seg, prefix, children: [], files: [] }
        node.children.push(child)
      }
      node = child
    }
    node.files.push(obj)
  }
  return root
}

// Breadcrumb + folder tree sidebar
function FolderTree({
  node, depth = 0, selected, onSelect,
}: {
  node: FolderNode; depth?: number; selected: string; onSelect: (prefix: string) => void
}) {
  const [open, setOpen] = useState(depth < 2)
  const isSelected = selected === node.prefix

  return (
    <div>
      <button
        onClick={() => { setOpen(v => !v); onSelect(node.prefix) }}
        className="w-full flex items-center gap-1.5 py-1 font-mono text-[11px] transition-all text-left rounded-lg px-2"
        style={{
          paddingLeft: `${depth * 12 + 8}px`,
          background: isSelected ? 'var(--t-p-glass)' : 'transparent',
          color: isSelected ? 'var(--t-tx1)' : 'var(--t-tx2)',
          borderLeft: isSelected ? '2px solid var(--t-p)' : '2px solid transparent',
        }}
      >
        <ChevronRight size={10} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: 'var(--t-tx3)' }} />
        <Folder size={12} style={{ color: isSelected ? 'var(--t-p)' : 'var(--t-tx3)', flexShrink: 0 }} strokeWidth={1.5} />
        <span className="truncate">{node.name}</span>
        <span className="ml-auto font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>
          {node.files.length + node.children.reduce((a, c) => a + c.files.length, 0)}
        </span>
      </button>
      {open && node.children.map(child => (
        <FolderTree key={child.prefix} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  )
}

export default function StoragePage() {
  const [objects, setObjects] = useState<R2Object[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedPrefix, setSelectedPrefix] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('list')
  const [preview, setPreview] = useState<{ key: string; text: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/r2/list')
      const data = await res.json() as { ok: boolean; objects?: R2Object[]; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setObjects(data.objects ?? [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const tree = buildTree(objects)

  // Files in selected folder
  const getFilesForPrefix = (prefix: string): R2Object[] => {
    if (prefix === '') return objects.filter(o => !o.key.includes('/') || search)
    return objects.filter(o => {
      const dir = o.key.substring(0, o.key.lastIndexOf('/'))
      return search ? o.key.toLowerCase().includes(search.toLowerCase()) : dir === prefix
    })
  }

  const displayed = search
    ? objects.filter(o => o.key.toLowerCase().includes(search.toLowerCase()))
    : getFilesForPrefix(selectedPrefix)

  const openPreview = async (key: string) => {
    if (!TEXT_EXTS.has(getExt(key))) return
    setPreviewLoading(true)
    setPreview({ key, text: '' })
    try {
      const res = await fetch(`/api/r2/text?key=${encodeURIComponent(key)}`)
      const data = await res.json() as { ok: boolean; text?: string; error?: string }
      setPreview({ key, text: data.text ?? data.error ?? '' })
    } catch (e) {
      setPreview({ key, text: String(e) })
    } finally {
      setPreviewLoading(false)
    }
  }

  const toggleSelect = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Stats
  const totalSize = objects.reduce((a, o) => a + o.size, 0)
  const textFiles = objects.filter(o => TEXT_EXTS.has(getExt(o.key))).length

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Sidebar ── */}
      <div
        className="w-52 shrink-0 flex flex-col h-full overflow-hidden"
        style={{
          background: 'var(--d-explorer)',
          backdropFilter: 'blur(var(--t-blur))',
          WebkitBackdropFilter: 'blur(var(--t-blur))',
          borderRight: '1px solid var(--t-glass-bdr)',
          boxShadow: 'var(--t-shadow)',
        }}
      >
        {/* Header */}
        <div className="h-10 flex items-center justify-between px-3 shrink-0" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
          <div className="flex items-center gap-1.5">
            <HardDrive size={13} style={{ color: 'var(--t-p)' }} />
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>Storage</span>
          </div>
          <button onClick={load} className="w-5 h-5 flex items-center justify-center transition-all" style={{ color: 'var(--t-tx3)' }}>
            <RefreshCcw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Stats */}
        <div className="px-3 py-2 space-y-1" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>Objects</span>
            <span className="font-mono text-[10px]" style={{ color: 'var(--t-p)' }}>{objects.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>Total size</span>
            <span className="font-mono text-[10px]" style={{ color: 'var(--t-tx2)' }}>{formatSize(totalSize)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>Previewable</span>
            <span className="font-mono text-[10px]" style={{ color: 'var(--t-tx2)' }}>{textFiles}</span>
          </div>
        </div>

        {/* Folder tree */}
        <div className="flex-1 overflow-y-auto py-1 px-1">
          {loading
            ? <div className="flex justify-center py-4"><RefreshCcw size={13} className="animate-spin" style={{ color: 'var(--t-p)' }} /></div>
            : <FolderTree node={tree} selected={selectedPrefix} onSelect={setSelectedPrefix} />
          }
        </div>

        {/* Upload placeholder */}
        <div className="p-2 shrink-0" style={{ borderTop: '1px solid var(--t-glass-bdr)' }}>
          <button
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl font-mono text-[10px] transition-all"
            style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-p)' }}
          >
            <Upload size={11} />
            Upload files
          </button>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-4 shrink-0"
          style={{
            height: 44,
            background: 'var(--d-topbar)',
            backdropFilter: 'blur(var(--t-blur))',
            borderBottom: '1px solid var(--t-glass-bdr)',
          }}
        >
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 font-mono text-[11px]" style={{ color: 'var(--t-tx3)' }}>
            <button onClick={() => setSelectedPrefix('')} style={{ color: 'var(--t-p)' }}>ll-cockpit-r2</button>
            {selectedPrefix && selectedPrefix.split('/').map((seg, i, arr) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight size={10} />
                <button
                  onClick={() => setSelectedPrefix(arr.slice(0, i + 1).join('/'))}
                  style={{ color: i === arr.length - 1 ? 'var(--t-tx1)' : 'var(--t-p)' }}
                >{seg}</button>
              </span>
            ))}
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="flex items-center gap-2 px-2 py-1 rounded-xl" style={{ background: 'var(--d-card)', border: '1px solid var(--t-glass-bdr)', minWidth: 180 }}>
            <Search size={11} style={{ color: 'var(--t-tx3)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search files..."
              className="bg-transparent outline-none font-mono text-[11px] flex-1"
              style={{ color: 'var(--t-tx1)' }}
            />
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--t-glass-bdr)' }}>
            {(['list', 'grid'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="w-7 h-7 flex items-center justify-center transition-all"
                style={{ background: view === v ? 'var(--t-p-glass)' : 'transparent', color: view === v ? 'var(--t-p)' : 'var(--t-tx3)' }}>
                {v === 'list' ? <List size={12} /> : <Grid size={12} />}
              </button>
            ))}
          </div>

          {selectedKeys.size > 0 && (
            <span className="font-mono text-[10px] px-2 py-1 rounded-lg" style={{ background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-glass-bdr)' }}>
              {selectedKeys.size} selected
            </span>
          )}
        </div>

        {/* File area */}
        <div className="flex-1 overflow-hidden flex">

          {/* File list / grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl mb-4" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)', color: '#ef4444' }}>
                <AlertCircle size={14} />
                <span className="font-mono text-[11px]">{error}</span>
                <button onClick={load} className="ml-auto font-mono text-[10px] underline">Retry</button>
              </div>
            )}

            {loading && objects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <RefreshCcw size={20} className="animate-spin" style={{ color: 'var(--t-p)' }} />
                <p className="font-mono text-[11px]" style={{ color: 'var(--t-tx3)' }}>Loading objects…</p>
              </div>
            ) : displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <File size={24} style={{ color: 'var(--t-tx3)' }} />
                <p className="font-mono text-[11px]" style={{ color: 'var(--t-tx3)' }}>
                  {search ? `No files matching "${search}"` : 'No files in this folder'}
                </p>
              </div>
            ) : view === 'list' ? (
              // List view
              <div className="space-y-1">
                {/* Header */}
                <div className="flex items-center gap-3 px-3 pb-1" style={{ color: 'var(--t-tx3)' }}>
                  <span className="font-mono text-[9px] uppercase tracking-widest flex-1">Name</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest w-16 text-right">Size</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest w-24 text-right">Uploaded</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest w-16 text-right">Actions</span>
                </div>
                {displayed.map(obj => {
                  const name = obj.key.split('/').pop() ?? obj.key
                  const canPreview = TEXT_EXTS.has(getExt(obj.key))
                  const isSelected = selectedKeys.has(obj.key)
                  return (
                    <div
                      key={obj.key}
                      onClick={() => toggleSelect(obj.key)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all"
                      style={{
                        background: isSelected ? 'var(--t-p-glass)' : preview?.key === obj.key ? 'var(--t-p-glass)' : 'var(--d-card)',
                        backdropFilter: 'blur(var(--t-blur))',
                        border: isSelected ? '1px solid var(--t-p)' : '1px solid var(--t-glass-bdr)',
                        boxShadow: 'var(--t-shadow)',
                      }}
                    >
                      <FileIcon name={name} />
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[11px] truncate" style={{ color: 'var(--t-tx1)' }}>{name}</p>
                        {search && <p className="font-mono text-[9px] truncate" style={{ color: 'var(--t-tx3)' }}>{obj.key}</p>}
                      </div>
                      <span className="font-mono text-[10px] w-16 text-right shrink-0" style={{ color: 'var(--t-tx3)' }}>{formatSize(obj.size)}</span>
                      <span className="font-mono text-[10px] w-24 text-right shrink-0" style={{ color: 'var(--t-tx3)' }}>{formatDate(obj.uploaded)}</span>
                      <div className="flex items-center gap-1 w-16 justify-end shrink-0">
                        {canPreview && (
                          <button
                            onClick={e => { e.stopPropagation(); openPreview(obj.key) }}
                            className="w-6 h-6 flex items-center justify-center rounded-lg transition-all"
                            style={{ color: 'var(--t-p)', background: 'var(--t-p-glass)' }}
                            title="Preview"
                          >
                            <Eye size={11} />
                          </button>
                        )}
                        <a
                          href={`/api/r2/object/${obj.key}`}
                          download={name}
                          onClick={e => e.stopPropagation()}
                          className="w-6 h-6 flex items-center justify-center rounded-lg transition-all"
                          style={{ color: 'var(--t-tx3)' }}
                          title="Download"
                        >
                          <Download size={11} />
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              // Grid view
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                {displayed.map(obj => {
                  const name = obj.key.split('/').pop() ?? obj.key
                  const canPreview = TEXT_EXTS.has(getExt(obj.key))
                  const isSelected = selectedKeys.has(obj.key)
                  return (
                    <div
                      key={obj.key}
                      onClick={() => canPreview ? openPreview(obj.key) : toggleSelect(obj.key)}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl cursor-pointer transition-all text-center glass-hover"
                      style={{
                        background: isSelected ? 'var(--t-p-glass)' : 'var(--d-card)',
                        border: isSelected ? '1px solid var(--t-p)' : '1px solid var(--t-glass-bdr)',
                      }}
                    >
                      <div className="w-10 h-10 flex items-center justify-center rounded-xl" style={{ background: 'var(--t-p-glass)' }}>
                        <FileIcon name={name} size={20} />
                      </div>
                      <p className="font-mono text-[10px] truncate w-full" style={{ color: 'var(--t-tx1)' }}>{name}</p>
                      <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{formatSize(obj.size)}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Preview panel */}
          {preview && (
            <div
              className="w-96 shrink-0 flex flex-col overflow-hidden"
              style={{
                borderLeft: '1px solid var(--t-glass-bdr)',
                background: 'var(--d-agent)',
                backdropFilter: 'blur(var(--t-blur))',
              }}
            >
              {/* Preview header */}
              <div className="h-10 flex items-center justify-between px-3 shrink-0" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <FileIcon name={preview.key} />
                  <span className="font-mono text-[11px] truncate" style={{ color: 'var(--t-tx1)' }}>
                    {preview.key.split('/').pop()}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={`/api/r2/object/${preview.key}`}
                    download
                    className="w-6 h-6 flex items-center justify-center rounded-lg"
                    style={{ color: 'var(--t-tx3)' }}
                  >
                    <Download size={11} />
                  </a>
                  <button
                    onClick={() => setPreview(null)}
                    className="w-6 h-6 flex items-center justify-center rounded-lg font-mono text-sm leading-none"
                    style={{ color: 'var(--t-tx3)' }}
                  >×</button>
                </div>
              </div>

              {/* Preview path */}
              <div className="px-3 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
                <p className="font-mono text-[9px] truncate" style={{ color: 'var(--t-tx3)' }}>{preview.key}</p>
              </div>

              {/* Preview content */}
              <div className="flex-1 overflow-y-auto p-3">
                {previewLoading ? (
                  <div className="flex justify-center py-8">
                    <RefreshCcw size={16} className="animate-spin" style={{ color: 'var(--t-p)' }} />
                  </div>
                ) : (
                  <pre className="font-mono text-[10px] whitespace-pre-wrap break-all leading-relaxed" style={{ color: 'var(--t-tx2)' }}>
                    {preview.text}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
