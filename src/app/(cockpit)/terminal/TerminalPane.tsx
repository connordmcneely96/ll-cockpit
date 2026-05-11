'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import '@xterm/xterm/css/xterm.css'

type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export function TerminalPane() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null)
  const fitAddonRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [connState, setConnState] = useState<ConnState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [copyFlash, setCopyFlash] = useState(false)

  const copySelection = useCallback(() => {
    const term = termRef.current
    if (!term) return
    const selection = term.getSelection()
    if (selection) {
      navigator.clipboard.writeText(selection).then(() => {
        setCopyFlash(true)
        setTimeout(() => setCopyFlash(false), 800)
      }).catch(() => {})
    }
  }, [])

  const connect = useCallback(async () => {
    setConnState('connecting')
    setError(null)
    try {
      const res = await fetch('/api/terminal/token')
      const data = await res.json() as { ok: boolean; token?: string; wsUrl?: string; error?: string }
      if (!data.ok || !data.token) throw new Error(data.error ?? 'Failed to get terminal token')

      const ws = new WebSocket(`${data.wsUrl}?token=${encodeURIComponent(data.token)}`)
      wsRef.current = ws

      ws.onopen = () => {
        setConnState('connected')
        const term = termRef.current
        if (term) ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; data?: string }
          if (msg.type === 'output' && msg.data && termRef.current) termRef.current.write(msg.data)
        } catch {
          if (termRef.current) termRef.current.write(event.data)
        }
      }
      ws.onerror = () => {
        setConnState('error')
        setError('WebSocket error — check tunnel is running')
        termRef.current?.writeln('\r\n\x1b[31m✗ Connection error\x1b[0m')
      }
      ws.onclose = (e) => {
        setConnState('disconnected')
        termRef.current?.writeln(`\r\n\x1b[33m— Disconnected (${e.code})\x1b[0m`)
        wsRef.current = null
      }
    } catch (err) {
      setConnState('error')
      setError(String(err))
      termRef.current?.writeln(`\r\n\x1b[31m✗ ${String(err)}\x1b[0m`)
    }
  }, [])

  useEffect(() => {
    let term: import('@xterm/xterm').Terminal
    let fitAddon: import('@xterm/addon-fit').FitAddon

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')
      const { ClipboardAddon } = await import('@xterm/addon-clipboard')

      term = new Terminal({
        allowProposedApi: true,
        theme: {
          background: '#0a0f0c',
          foreground: '#e0f2ee',
          cursor: '#00c9a7',
          cursorAccent: '#0a0f0c',
          selectionBackground: 'rgba(0,201,167,0.25)',
          black: '#0d1a14', brightBlack: '#1a2e24',
          red: '#ef4444', brightRed: '#f87171',
          green: '#10b981', brightGreen: '#34d399',
          yellow: '#f59e0b', brightYellow: '#fbbf24',
          blue: '#3b82f6', brightBlue: '#60a5fa',
          magenta: '#8b5cf6', brightMagenta: '#a78bfa',
          cyan: '#00c9a7', brightCyan: '#33d4ba',
          white: '#e0f2ee', brightWhite: '#f8fafc',
        },
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 13,
        lineHeight: 1.5,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 5000,
        allowTransparency: true,
        convertEol: true,
        rightClickSelectsWord: false,
      })

      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())
      term.loadAddon(new ClipboardAddon())

      if (containerRef.current) {
        term.open(containerRef.current)
        fitAddon.fit()
      }

      termRef.current = term
      fitAddonRef.current = fitAddon

      term.writeln('\x1b[1;36m┤ NEXUS PRIME ├ Terminal\x1b[0m')
      term.writeln('\x1b[2m  nexus-vm · GCP us-central1 · e2-micro\x1b[0m')
      term.writeln('')

      // Input → WebSocket
      term.onData(data => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'input', data }))
        }
      })

      // Track selection for Copy button
      term.onSelectionChange(() => {
        setHasSelection(!!term.getSelection())
      })

      // Key intercepts
      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        if (e.type !== 'keydown') return true

        // Ctrl+C — copy if selection, otherwise fall through to send SIGINT
        if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'c') {
          const selection = term.getSelection()
          if (selection) {
            navigator.clipboard.writeText(selection).then(() => {
              setCopyFlash(true)
              setTimeout(() => setCopyFlash(false), 800)
            }).catch(() => {})
            term.clearSelection()
            return false // prevent xterm from sending \x03 (SIGINT)
          }
          return true // no selection → send SIGINT normally
        }

        // Ctrl+V — paste from clipboard into terminal
        if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'v') {
          navigator.clipboard.readText().then(text => {
            if (text && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'input', data: text }))
            }
          }).catch(() => {})
          return false
        }

        return true
      })

      // Right-click — copy if selection, paste if not
      containerRef.current?.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        const selection = term.getSelection()
        if (selection) {
          navigator.clipboard.writeText(selection).then(() => {
            setCopyFlash(true)
            setTimeout(() => setCopyFlash(false), 800)
          }).catch(() => {})
          term.clearSelection()
        } else {
          navigator.clipboard.readText().then(text => {
            if (text && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'input', data: text }))
            }
          }).catch(() => {})
        }
      })

      term.onResize(({ cols, rows }) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
        }
      })

      await connect()
    }

    init()

    const handleResize = () => fitAddonRef.current?.fit()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      wsRef.current?.close()
      term?.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reconnect = () => {
    wsRef.current?.close()
    termRef.current?.writeln('\r\n\x1b[36mReconnecting…\x1b[0m')
    connect()
  }

  return (
    <div className="w-full h-full flex flex-col" style={{ background: '#0a0f0c' }}>
      <div className="flex items-center justify-between px-3 py-1 shrink-0"
        style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(0,201,167,0.12)' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{
            background: connState === 'connected' ? '#10b981' : connState === 'connecting' ? '#f59e0b' : '#ef4444',
            boxShadow: connState === 'connected' ? '0 0 6px #10b981' : 'none',
          }} />
          <span className="font-mono text-[10px]" style={{ color: 'rgba(224,242,238,0.5)' }}>
            {connState === 'connected' && 'nexus-vm · us-central1'}
            {connState === 'connecting' && 'Connecting…'}
            {connState === 'disconnected' && 'Disconnected'}
            {connState === 'error' && (error ?? 'Connection error')}
            {connState === 'idle' && 'Idle'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px]" style={{ color: 'rgba(224,242,238,0.2)' }}>
            Ctrl+C copy · Ctrl+V paste · right-click copy/paste
          </span>
          {hasSelection && (
            <button
              onClick={copySelection}
              className="font-mono text-[10px] px-2 py-0.5 rounded-lg transition-all"
              style={{
                background: copyFlash ? 'rgba(16,185,129,0.25)' : 'rgba(0,201,167,0.12)',
                color: copyFlash ? '#10b981' : '#00c9a7',
                border: `1px solid ${copyFlash ? 'rgba(16,185,129,0.5)' : 'rgba(0,201,167,0.25)'}`,
              }}>
              {copyFlash ? '✓ Copied' : 'Copy'}
            </button>
          )}
          {(connState === 'disconnected' || connState === 'error') && (
            <button onClick={reconnect}
              className="font-mono text-[10px] px-2 py-0.5 rounded-lg"
              style={{ background: 'rgba(0,201,167,0.12)', color: '#00c9a7', border: '1px solid rgba(0,201,167,0.25)' }}>
              Reconnect
            </button>
          )}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden p-1" />
    </div>
  )
}
