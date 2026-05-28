import { useState, useEffect, useCallback } from 'react'

const EXPLORER_MIN = 190
const EXPLORER_MAX = 440
const EXPLORER_DEFAULT = 220
const AGENT_MIN = 280
const AGENT_MAX = 620
const AGENT_DEFAULT = 300

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

export function useResizablePanels() {
  const [explorerWidth, setExplorerWidth] = useState(EXPLORER_DEFAULT)
  const [agentWidth, setAgentWidth] = useState(AGENT_DEFAULT)
  const [agentCollapsed, setAgentCollapsed] = useState(false)

  const toggleAgentCollapse = useCallback(() => {
    setAgentCollapsed(prev => {
      const next = !prev
      if (!next) {
        // restoring — ensure agentWidth is valid
        setAgentWidth(w => w < AGENT_MIN ? AGENT_DEFAULT : w)
      }
      return next
    })
  }, [])

  useEffect(() => {
    setExplorerWidth(clamp(readStorage('ll-explorer-width', EXPLORER_DEFAULT), EXPLORER_MIN, EXPLORER_MAX))
    setAgentWidth(clamp(readStorage('ll-agent-width', AGENT_DEFAULT), AGENT_MIN, AGENT_MAX))
  }, [])

  const beginDragExplorer = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = explorerWidth
    document.body.classList.add('ia-resizing')

    function onMouseMove(ev: MouseEvent) {
      const next = clamp(startWidth + ev.clientX - startX, EXPLORER_MIN, EXPLORER_MAX)
      setExplorerWidth(next)
    }

    function onMouseUp(ev: MouseEvent) {
      const final = clamp(startWidth + ev.clientX - startX, EXPLORER_MIN, EXPLORER_MAX)
      setExplorerWidth(final)
      localStorage.setItem('ll-explorer-width', String(final))
      document.body.classList.remove('ia-resizing')
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [explorerWidth])

  const beginDragAgent = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = agentWidth
    document.body.classList.add('ia-resizing')

    function onMouseMove(ev: MouseEvent) {
      const next = clamp(startWidth + (startX - ev.clientX), AGENT_MIN, AGENT_MAX)
      setAgentWidth(next)
    }

    function onMouseUp(ev: MouseEvent) {
      const final = clamp(startWidth + (startX - ev.clientX), AGENT_MIN, AGENT_MAX)
      setAgentWidth(final)
      localStorage.setItem('ll-agent-width', String(final))
      document.body.classList.remove('ia-resizing')
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [agentWidth])

  return { explorerWidth, agentWidth, beginDragExplorer, beginDragAgent, agentCollapsed, toggleAgentCollapse }
}
