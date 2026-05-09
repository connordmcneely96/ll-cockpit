'use client'

import { useEffect, useState } from 'react'
import { useIdeStore, type R2FileNode } from '@/stores/ideStore'
import { RefreshCcw, FileText, FolderOpen, Folder, AlertCircle, HardDrive } from 'lucide-react'

// Icon for file type
function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const colors: Record<string, string> = {
    ts: '#3b82f6', tsx: '#06b6d4', js: '#f59e0b', jsx: '#f97316',
    json: '#10b981', md: '#8b5cf6', css: '#f43f5e', html: '#f97316',
    py: '#3b82f6', sql: '#00c9a7', env: '#6b7280', sh: '#10b981',
  }
  return (
    <FileText
      size={11}
      style={{ color: colors[ext] ?? 'var(--t-tx3)', flexShrink: 0 }}
      strokeWidth={1.5}
    />
  )
}

function FileItem({ node, depth }: { node: R2FileNode; depth: number }) {
  const { activeFile, openFile } = useIdeStore()
  const [open, setOpen] = useState(depth === 0)  // root dirs start open
  const isActive = activeFile === node.path

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-1.5 py-0.5 font-mono text-[11px] transition-colors"
          style={{
            paddingLeft: `${depth * 12 + 8}px`,
            color: 'var(--t-tx3)',
          }}
        >
          {open
            ? <FolderOpen size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            : <Folder size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          }
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children?.map(child => (
          <FileItem key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => openFile(node.path)}
      className="w-full flex items-center gap-1.5 py-0.5 font-mono text-[11px] transition-all text-left"
      style={{
        paddingLeft: `${depth * 12 + 8}px`,
        background: isActive ? 'var(--t-p-glass)' : 'transparent',
        color: isActive ? 'var(--t-tx1)' : 'var(--t-tx2)',
        borderLeft: isActive ? '2px solid var(--t-p)' : '2px solid transparent',
      }}
    >
      <FileIcon name={node.name} />
      <span className="truncate">{node.name}</span>
      {node.size !== undefined && (
        <span className="ml-auto font-mono text-[9px] pr-2" style={{ color: 'var(--t-tx3)' }}>
          {node.size < 1024 ? `${node.size}B` : `${(node.size / 1024).toFixed(1)}K`}
        </span>
      )}
    </button>
  )
}

export function FileTree() {
  const { files, r2Loading, r2Error, loadR2FileTree, lastRefreshed } = useIdeStore()

  useEffect(() => {
    // Load on mount if not already loaded
    if (files.length === 0 && !r2Loading) {
      loadR2FileTree()
    }
  }, [])

  if (r2Loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 py-6">
        <RefreshCcw size={14} className="animate-spin" style={{ color: 'var(--t-p)' }} />
        <p className="font-mono text-[10px]" style={{ color: 'var(--t-tx3)' }}>Loading R2…</p>
      </div>
    )
  }

  if (r2Error) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 py-6 px-3 text-center">
        <AlertCircle size={14} style={{ color: 'var(--d-error)' }} />
        <p className="font-mono text-[10px]" style={{ color: 'var(--d-error)' }}>{r2Error}</p>
        <button onClick={loadR2FileTree} className="font-mono text-[10px] px-2 py-1 rounded-lg"
          style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-bdr)', color: 'var(--t-p)' }}>
          Retry
        </button>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8 px-3 text-center">
        <HardDrive size={20} style={{ color: 'var(--t-tx3)' }} />
        <p className="font-mono text-[10px] font-medium" style={{ color: 'var(--t-tx2)' }}>R2 bucket is empty</p>
        <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>
          Upload files via the Cloudflare Dashboard or Storage page
        </p>
        <button onClick={loadR2FileTree} className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 rounded-lg"
          style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-bdr)', color: 'var(--t-p)' }}>
          <RefreshCcw size={10} /> Refresh
        </button>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto flex-1">
      {files.map(node => (
        <FileItem key={node.path} node={node} depth={0} />
      ))}
    </div>
  )
}
