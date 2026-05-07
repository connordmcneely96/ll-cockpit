'use client'

import { useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'

export function TerminalPane() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null)

  useEffect(() => {
    let term: import('@xterm/xterm').Terminal
    let fitAddon: import('@xterm/addon-fit').FitAddon

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')

      term = new Terminal({
        theme: {
          background: '#0a0b0f',
          foreground: '#e2e8f0',
          cursor: '#3b82f6',
          cursorAccent: '#0a0b0f',
          selectionBackground: 'rgba(59,130,246,0.3)',
          black: '#1c2035',
          brightBlack: '#232840',
          red: '#ef4444',
          brightRed: '#f87171',
          green: '#10b981',
          brightGreen: '#34d399',
          yellow: '#f5c842',
          brightYellow: '#fcd34d',
          blue: '#3b82f6',
          brightBlue: '#60a5fa',
          magenta: '#94a3b8',
          brightMagenta: '#cbd5e1',
          cyan: '#06b6d4',
          brightCyan: '#22d3ee',
          white: '#e2e8f0',
          brightWhite: '#f8fafc',
        },
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 13,
        lineHeight: 1.5,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 1000,
        allowTransparency: true,
      })

      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)

      if (containerRef.current) {
        term.open(containerRef.current)
        fitAddon.fit()
        termRef.current = term
      }

      term.writeln('\x1b[1;34m▶ LL COCKPIT Terminal\x1b[0m')
      term.writeln('\x1b[2m  Connected to sandbox environment\x1b[0m')
      term.writeln('')
      term.write('\x1b[36m$\x1b[0m ')

      let lineBuffer = ''
      term.onKey(({ key, domEvent }) => {
        const printable = !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey

        if (domEvent.keyCode === 13) {
          term.writeln('')
          if (lineBuffer.trim()) {
            term.writeln(`\x1b[2mCommand execution requires PTY integration\x1b[0m`)
          }
          lineBuffer = ''
          term.write('\x1b[36m$\x1b[0m ')
        } else if (domEvent.keyCode === 8) {
          if (lineBuffer.length > 0) {
            lineBuffer = lineBuffer.slice(0, -1)
            term.write('\b \b')
          }
        } else if (printable) {
          lineBuffer += key
          term.write(key)
        }
      })
    }

    init()

    const handleResize = () => fitAddon?.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      term?.dispose()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="w-full h-full p-2"
      style={{ backgroundColor: '#0a0b0f' }}
    />
  )
}
