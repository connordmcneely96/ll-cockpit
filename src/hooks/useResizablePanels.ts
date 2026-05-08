import { useState, useEffect, useCallback, useRef } from 'react'

export interface PanelSizes {
  explorerWidth: number
  agentWidth: number
}

const EXPLORER_MIN = 190
const EXPLORER_MAX = 440
const EXPLORER_DEFAULT = 220
const AGENT_MIN = 280
const AGENT_MAX = 620
const AGENT_DEFAULT = 280

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function readStorage(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const stored = localStorage.getItem(key)
  if (stored === null) return fallback
  const parsed = parseInt(stored, 10)
  return isNaN(parsed) ? fallback : parsed
}

export function useResizablePanels(): {
  explorerWidth: number
  agentWidth: number
  startDragExplorer: (e: React.MouseEvent) => void
  startDragAgent: (e: React.MouseEvent) => void
} {
  const [explorerWidth, setExplorerWidth] = useState(EXPLORER_DEFAULT)
  const [agentWidth, setAgentWidth] = useState(AGENT_DEFAULT)

  const draggingExplorer = useRef(false)
  const draggingAgent = useRef(false)

  useEffect(() => {
    setExplorerWidth(clamp(readStorage('ll-explorer-width', EXPLORER_DEFAULT), EXPLORER_MIN, EXPLORER_MAX))
    setAgentWidth(clamp(readStorage('ll-agent-width', AGENT_DEFAULT), AGENT_MIN, AGENT_MAX))
  }, [])

  const startDragExplorer = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingExplorer.current = true
    document.body.style.userSelect = 'none'

    function onMouseMove(ev: MouseEvent) {
      if (!draggingExplorer.current) return
      setExplorerWidth(clamp(ev.clientX, EXPLORER_MIN, EXPLORER_MAX))
    }

    function onMouseUp(ev: MouseEvent) {
      draggingExplorer.current = false
      document.body.style.userSelect = ''
      const final = clamp(ev.clientX, EXPLORER_MIN, EXPLORER_MAX)
      setExplorerWidth(final)
      localStorage.setItem('ll-explorer-width', String(final))
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const startDragAgent = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingAgent.current = true
    document.body.style.userSelect = 'none'

    function onMouseMove(ev: MouseEvent) {
      if (!draggingAgent.current) return
      setAgentWidth(clamp(window.innerWidth - ev.clientX, AGENT_MIN, AGENT_MAX))
    }

    function onMouseUp(ev: MouseEvent) {
      draggingAgent.current = false
      document.body.style.userSelect = ''
      const final = clamp(window.innerWidth - ev.clientX, AGENT_MIN, AGENT_MAX)
      setAgentWidth(final)
      localStorage.setItem('ll-agent-width', String(final))
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  return { explorerWidth, agentWidth, startDragExplorer, startDragAgent }
}
