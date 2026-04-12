'use client'

import { create } from 'zustand'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  content?: string
  language?: string
}

interface IdeState {
  files: FileNode[]
  openFiles: string[]
  activeFile: string | null
  fileContents: Record<string, string>
  isDirty: Record<string, boolean>

  setFiles: (files: FileNode[]) => void
  openFile: (path: string) => void
  closeFile: (path: string) => void
  setActiveFile: (path: string) => void
  setFileContent: (path: string, content: string) => void
  markClean: (path: string) => void
}

export const useIdeStore = create<IdeState>((set) => ({
  files: [],
  openFiles: [],
  activeFile: null,
  fileContents: {},
  isDirty: {},

  setFiles: (files) => set({ files }),

  openFile: (path) =>
    set((state) => ({
      openFiles: state.openFiles.includes(path)
        ? state.openFiles
        : [...state.openFiles, path],
      activeFile: path,
    })),

  closeFile: (path) =>
    set((state) => {
      const openFiles = state.openFiles.filter((f) => f !== path)
      return {
        openFiles,
        activeFile:
          state.activeFile === path
            ? openFiles[openFiles.length - 1] ?? null
            : state.activeFile,
      }
    }),

  setActiveFile: (path) => set({ activeFile: path }),

  setFileContent: (path, content) =>
    set((state) => ({
      fileContents: { ...state.fileContents, [path]: content },
      isDirty: { ...state.isDirty, [path]: true },
    })),

  markClean: (path) =>
    set((state) => ({
      isDirty: { ...state.isDirty, [path]: false },
    })),
}))
