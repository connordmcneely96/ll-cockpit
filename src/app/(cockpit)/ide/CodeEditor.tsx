'use client'

import { useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useIdeStore, getLanguageFromKey } from '@/stores/ideStore'
import { useDesignStore } from '@/stores/designStore'
import { Loader2 } from 'lucide-react'

export function CodeEditor() {
  const {
    activeFile, fileContents, fileLoading,
    setFileContent, pendingApply, clearPendingApply,
  } = useIdeStore()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const glassBlur = useDesignStore(s => s.glassBlur)

  const content = activeFile ? (fileContents[activeFile] ?? '') : ''
  const isLoading = activeFile ? (fileLoading[activeFile] ?? false) : false

  // Apply pending code from agent
  useEffect(() => {
    if (pendingApply && editorRef.current && pendingApply.key === activeFile) {
      const model = editorRef.current.getModel()
      if (model) {
        model.setValue(pendingApply.code)
        clearPendingApply()
      }
    }
  }, [pendingApply, activeFile, clearPendingApply])

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  if (!activeFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: 'var(--t-tx3)' }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-glass-bdr)' }}>
          <span className="font-mono text-lg">📦</span>
        </div>
        <p className="font-mono text-sm" style={{ color: 'var(--t-tx2)' }}>Select a file to edit</p>
        <p className="font-mono text-[10px]" style={{ color: 'var(--t-tx3)' }}>Pick from the file tree or ask an agent to open one</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--t-p)' }} />
        <p className="font-mono text-[11px]" style={{ color: 'var(--t-tx3)' }}>Loading {activeFile.split('/').pop()}…</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden">
      <Editor
        height="100%"
        language={getLanguageFromKey(activeFile)}
        value={content}
        onChange={value => {
          if (activeFile) setFileContent(activeFile, value ?? '')
        }}
        onMount={handleMount}
        theme="vs-dark"
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          minimap: { enabled: true, scale: 1 },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          renderLineHighlight: 'gutter',
          lineNumbersMinChars: 3,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          padding: { top: 8, bottom: 8 },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          bracketPairColorization: { enabled: true },
          renderWhitespace: 'none',
          suggest: { showKeywords: true },
        }}
      />
    </div>
  )
}
