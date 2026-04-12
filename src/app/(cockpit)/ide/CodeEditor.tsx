'use client'

import { useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useIdeStore } from '@/stores/ideStore'

export function CodeEditor() {
  const { activeFile, fileContents, setFileContent } = useIdeStore()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const content = activeFile ? (fileContents[activeFile] ?? '') : ''

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  const getLanguage = (path: string | null): string => {
    if (!path) return 'plaintext'
    const ext = path.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'typescriptreact',
      js: 'javascript', jsx: 'javascriptreact',
      json: 'json', md: 'markdown',
      css: 'css', html: 'html',
      py: 'python', sh: 'shell', yaml: 'yaml', yml: 'yaml',
    }
    return map[ext ?? ''] ?? 'plaintext'
  }

  if (!activeFile) {
    return (
      <div className="flex-1 flex items-center justify-center bg-navy-2 text-text3 font-mono text-sm">
        Select a file to edit
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden">
      <Editor
        height="100%"
        language={getLanguage(activeFile)}
        value={content}
        onChange={(value) => {
          if (activeFile) setFileContent(activeFile, value ?? '')
        }}
        onMount={handleMount}
        theme="vs-dark"
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
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
        }}
      />
    </div>
  )
}
