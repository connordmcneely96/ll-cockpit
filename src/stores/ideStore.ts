'use client'

import { create } from 'zustand'

export interface R2FileNode {
  name: string
  path: string   // full R2 key
  type: 'file' | 'directory'
  size?: number
  children?: R2FileNode[]
}

interface IdeState {
  // File tree
  files: R2FileNode[]
  r2Loading: boolean
  r2Error: string | null
  lastRefreshed: number

  // Open tabs
  openFiles: string[]       // list of R2 keys
  activeFile: string | null // current R2 key

  // Content cache
  fileContents: Record<string, string>
  fileLoading: Record<string, boolean>
  isDirty: Record<string, boolean>

  // Agent apply
  pendingApply: { key: string; code: string } | null

  // Actions
  loadR2FileTree: () => Promise<void>
  openFile: (key: string) => Promise<void>
  closeFile: (key: string) => void
  setActiveFile: (key: string) => void
  setFileContent: (key: string, content: string) => void
  markClean: (key: string) => void
  applyToEditor: (key: string, code: string) => void
  clearPendingApply: () => void
}

// Detect Monaco language from file extension
export function getLanguageFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact',
    js: 'javascript', jsx: 'javascriptreact',
    json: 'json', md: 'markdown', mdx: 'markdown',
    css: 'css', scss: 'scss', html: 'html',
    py: 'python', sh: 'shell', bash: 'shell',
    yaml: 'yaml', yml: 'yaml', toml: 'toml',
    sql: 'sql', xml: 'xml', svg: 'xml',
    txt: 'plaintext', env: 'plaintext', gitignore: 'plaintext',
  }
  return map[ext] ?? 'plaintext'
}

// Build a nested tree from flat R2 keys
function buildTree(keys: Array<{ key: string; size?: number }>): R2FileNode[] {
  const root: R2FileNode[] = []

  for (const { key, size } of keys) {
    const parts = key.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const existing = current.find(n => n.name === part)

      if (isLast) {
        // File node
        if (!existing) {
          current.push({ name: part, path: key, type: 'file', size })
        }
      } else {
        // Directory node
        if (existing && existing.type === 'directory') {
          current = existing.children!
        } else {
          const dir: R2FileNode = {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            type: 'directory',
            children: [],
          }
          current.push(dir)
          current = dir.children!
        }
      }
    }
  }

  // Sort: directories first, then files, both alphabetical
  const sortNodes = (nodes: R2FileNode[]): R2FileNode[] => {
    return nodes
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map(n => n.children ? { ...n, children: sortNodes(n.children) } : n)
  }

  return sortNodes(root)
}

export const useIdeStore = create<IdeState>((set, get) => ({
  files: [],
  r2Loading: false,
  r2Error: null,
  lastRefreshed: 0,

  openFiles: [],
  activeFile: null,

  fileContents: {},
  fileLoading: {},
  isDirty: {},
  pendingApply: null,

  // ── Load R2 file tree ──────────────────────────────────────────────
  loadR2FileTree: async () => {
    set({ r2Loading: true, r2Error: null })
    try {
      const res = await fetch('/api/r2/list')
      const data = await res.json() as { ok: boolean; objects?: Array<{ key: string; size: number }>; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Failed to list R2')
      const tree = buildTree(data.objects ?? [])
      set({ files: tree, r2Loading: false, lastRefreshed: Date.now() })
    } catch (err) {
      set({ r2Loading: false, r2Error: String(err) })
    }
  },

  // ── Open file — fetch content from R2 if not cached ───────────────
  openFile: async (key: string) => {
    // Add to tabs immediately
    set(state => ({
      openFiles: state.openFiles.includes(key) ? state.openFiles : [...state.openFiles, key],
      activeFile: key,
    }))

    // Already loaded
    if (get().fileContents[key] !== undefined) return

    set(state => ({ fileLoading: { ...state.fileLoading, [key]: true } }))
    try {
      const res = await fetch(`/api/r2/text?key=${encodeURIComponent(key)}`)
      const data = await res.json() as { ok: boolean; text?: string; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Failed to load file')
      set(state => ({
        fileContents: { ...state.fileContents, [key]: data.text ?? '' },
        fileLoading: { ...state.fileLoading, [key]: false },
      }))
    } catch (err) {
      set(state => ({
        fileContents: { ...state.fileContents, [key]: `// Error loading file: ${String(err)}` },
        fileLoading: { ...state.fileLoading, [key]: false },
      }))
    }
  },

  // ── Close tab ─────────────────────────────────────────────────────
  closeFile: (key: string) =>
    set(state => {
      const openFiles = state.openFiles.filter(f => f !== key)
      return {
        openFiles,
        activeFile:
          state.activeFile === key
            ? openFiles[openFiles.length - 1] ?? null
            : state.activeFile,
      }
    }),

  setActiveFile: (key) => set({ activeFile: key }),

  setFileContent: (key, content) =>
    set(state => ({
      fileContents: { ...state.fileContents, [key]: content },
      isDirty: { ...state.isDirty, [key]: true },
    })),

  markClean: (key) =>
    set(state => ({ isDirty: { ...state.isDirty, [key]: false } })),

  // ── Agent applies code to editor ──────────────────────────────────
  applyToEditor: (key, code) => {
    set(state => ({
      pendingApply: { key, code },
      fileContents: { ...state.fileContents, [key]: code },
      isDirty: { ...state.isDirty, [key]: true },
      activeFile: key,
      openFiles: state.openFiles.includes(key) ? state.openFiles : [...state.openFiles, key],
    }))
  },

  clearPendingApply: () => set({ pendingApply: null }),
}))
