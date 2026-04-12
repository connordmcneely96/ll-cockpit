'use client'

import { useIdeStore } from '@/stores/ideStore'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

function FileItem({ node, depth }: { node: FileNode; depth: number }) {
  const { activeFile, openFile } = useIdeStore()
  const isActive = activeFile === node.path

  if (node.type === 'directory') {
    return (
      <div>
        <div
          className="flex items-center gap-1 px-2 py-0.5 text-text3 font-mono text-xs cursor-default select-none"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span>▾</span>
          <span>{node.name}</span>
        </div>
        {node.children?.map((child) => (
          <FileItem key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <div
      className={[
        'flex items-center gap-1.5 py-0.5 cursor-pointer font-mono text-xs transition-colors truncate',
        isActive ? 'bg-gold/10 text-gold' : 'text-text2 hover:text-text1 hover:bg-white/5',
      ].join(' ')}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={() => openFile(node.path)}
    >
      <span className="text-text3">⬜</span>
      <span className="truncate">{node.name}</span>
    </div>
  )
}

export function FileTree() {
  const { files } = useIdeStore()

  if (files.length === 0) {
    return (
      <div className="p-3 text-text3 font-mono text-xs">
        No files loaded.
      </div>
    )
  }

  return (
    <div className="overflow-y-auto">
      {files.map((node) => (
        <FileItem key={node.path} node={node} depth={0} />
      ))}
    </div>
  )
}
