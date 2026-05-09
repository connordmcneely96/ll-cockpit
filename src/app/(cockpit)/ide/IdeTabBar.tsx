'use client'

import { useIdeStore, getLanguageFromKey } from '@/stores/ideStore'
import { X, RefreshCcw, Save } from 'lucide-react'

export function IdeTabBar() {
  const { openFiles, activeFile, isDirty, closeFile, setActiveFile, loadR2FileTree, r2Loading } = useIdeStore()

  if (openFiles.length === 0) {
    return (
      <div
        className="flex items-center px-3 shrink-0"
        style={{
          height: 33,
          background: 'var(--d-tabbar)',
          backdropFilter: 'blur(var(--t-blur))',
          borderBottom: '1px solid var(--t-glass-bdr)',
          color: 'var(--t-tx3)',
        }}
      >
        <span className="font-mono text-[10px]">No files open</span>
        <div className="flex-1" />
        <button
          onClick={loadR2FileTree}
          className="flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-lg transition-all"
          style={{ color: 'var(--t-p)', background: 'var(--t-p-glass)', border: '1px solid var(--t-bdr)' }}
        >
          <RefreshCcw size={10} className={r2Loading ? 'animate-spin' : ''} />
          Refresh R2
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex items-end shrink-0 overflow-x-auto"
      style={{
        height: 33,
        background: 'var(--d-tabbar)',
        backdropFilter: 'blur(var(--t-blur))',
        borderBottom: '1px solid var(--t-glass-bdr)',
      }}
    >
      {openFiles.map(key => {
        const isActive = activeFile === key
        const dirty = isDirty[key]
        const name = key.split('/').pop() ?? key
        return (
          <button
            key={key}
            onClick={() => setActiveFile(key)}
            className="group relative flex items-center gap-1.5 px-3 h-full shrink-0 transition-all font-mono text-[11px]"
            style={{
              background: isActive ? 'var(--t-p-glass)' : 'transparent',
              borderRight: '1px solid var(--t-glass-bdr)',
              color: isActive ? 'var(--t-tx1)' : 'var(--t-tx3)',
              maxWidth: 180,
            }}
          >
            {/* Top accent on active */}
            {isActive && (
              <span
                className="absolute top-0 left-0 right-0"
                style={{
                  height: 2,
                  background: 'linear-gradient(to right, var(--t-p), var(--t-p-bright))',
                  boxShadow: '0 0 6px var(--t-p-glow)',
                }}
              />
            )}

            {/* Dirty dot */}
            {dirty && (
              <span className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: 'var(--t-gold)', boxShadow: '0 0 4px var(--t-gold)' }} />
            )}

            <span className="truncate">{name}</span>

            {/* Close button */}
            <span
              onClick={e => { e.stopPropagation(); closeFile(key) }}
              className="ml-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 shrink-0 cursor-pointer"
              style={{ color: 'var(--t-tx3)' }}
            >
              <X size={10} />
            </span>
          </button>
        )
      })}

      {/* Fill + refresh */}
      <div className="flex-1 flex items-center justify-end pr-2" style={{ height: '100%', borderBottom: '1px solid var(--t-glass-bdr)' }}>
        <button
          onClick={loadR2FileTree}
          title="Refresh R2 file tree"
          className="w-5 h-5 flex items-center justify-center rounded transition-all"
          style={{ color: 'var(--t-tx3)' }}
        >
          <RefreshCcw size={11} className={r2Loading ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}
