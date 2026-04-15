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
          background: '#07091a',
          foreground: '#b8c4e0',
          cursor: '#f5c842',
          cursorAccent: '#07091a',
          black: '#07091a',
          brightBlack: '#1a2245',
          red: '#ff4757',
          brightRed: '#ff6b78',
          green: '#2ed573',
          brightGreen: '#57e38e',
          yellow: '#f5c842',
          brightYellow: '#f7d468',
          blue: '#00d4ff',
          brightBlue: '#33ddff',
          magenta: '#b8c4e0',
          brightMagenta: '#d0d8ee',
          cyan: '#00d4ff',
          brightCyan: '#33ddff',
          white: '#b8c4e0',
          brightWhite: '#ffffff',
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

      // Welcome message
      term.writeln('\x1b[1;33m▶ LL COCKPIT Terminal\x1b[0m')
      term.writeln('\x1b[2m  Connected to sandbox environment\x1b[0m')
      term.writeln('')
      term.write('\x1b[36m$\x1b[0m ')

      // Basic echo input (visual only — real PTY integration pending)
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
      style={{ backgroundColor: '#07091a' }}
    />
  )
}
