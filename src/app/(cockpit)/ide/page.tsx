import { FileTree } from './FileTree'
import { CodeEditor } from './CodeEditor'

export default function IdePage() {
  return (
    <div className="h-full flex overflow-hidden">
      {/* File tree */}
      <div className="w-52 shrink-0 bg-navy-2 border-r border-gold/12 flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-gold/12 text-text3 font-mono text-xs uppercase tracking-wider">
          Explorer
        </div>
        <FileTree />
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col overflow-hidden bg-navy-2">
        <CodeEditor />
      </div>
    </div>
  )
}
