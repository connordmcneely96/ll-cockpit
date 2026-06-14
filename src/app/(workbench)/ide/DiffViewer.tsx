'use client'

import { DiffEditor } from '@monaco-editor/react'

interface DiffViewerProps {
  original: string
  modified: string
  language?: string
}

export function DiffViewer({ original, modified, language = 'typescript' }: DiffViewerProps) {
  return (
    <DiffEditor
      height="100%"
      original={original}
      modified={modified}
      language={language}
      theme="vs-dark"
      options={{
        fontSize: 13,
        fontFamily: "'JetBrains Mono', monospace",
        renderSideBySide: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        readOnly: true,
      }}
    />
  )
}
