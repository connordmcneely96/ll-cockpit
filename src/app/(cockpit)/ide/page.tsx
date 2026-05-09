'use client'

import { useIdeStore } from '@/stores/ideStore'
import { FileTree } from './FileTree'
import { CodeEditor } from './CodeEditor'
import { IdeTabBar } from './IdeTabBar'

export default function IdePage() {
  const { activeFile } = useIdeStore()

  return (
    <div className="h-full flex overflow-hidden">

      {/* File tree panel */}
      <div
        className="w-52 shrink-0 flex flex-col overflow-hidden"
        style={{
          background: 'var(--d-explorer)',
          backdropFilter: 'blur(var(--t-blur))',
          WebkitBackdropFilter: 'blur(var(--t-blur))',
          borderRight: '1px solid var(--t-glass-bdr)',
          boxShadow: 'var(--t-shadow)',
        }}
      >
        {/* Header */}
        <div
          className="h-10 flex items-center justify-between px-3 shrink-0"
          style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}
        >
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>
            ll-cockpit-r2
          </span>
        </div>

        {/* File tree */}
        <FileTree />
      </div>

      {/* Editor area */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(4px)' }}>
        {/* IDE-internal tab bar */}
        <IdeTabBar />

        {/* Monaco editor */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <CodeEditor />
        </div>

        {/* Bottom status strip */}
        {activeFile && (
          <div
            className="shrink-0 flex items-center justify-between px-3"
            style={{
              height: 20,
              background: 'var(--d-tabbar)',
              backdropFilter: 'blur(var(--t-blur))',
              borderTop: '1px solid var(--t-glass-bdr)',
              color: 'var(--t-tx3)',
            }}
          >
            <span className="font-mono text-[9px]">{activeFile}</span>
            <span className="font-mono text-[9px]">
              {activeFile.split('.').pop()?.toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
