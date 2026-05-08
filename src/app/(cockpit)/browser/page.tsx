'use client'

import { useState, useRef, useEffect } from 'react'
import { RefreshCcw, ArrowLeft, ArrowRight, Globe, Shield, X } from 'lucide-react'

const BOOKMARKS = [
  { label: 'LL Cockpit', url: 'https://ll-cockpit.connorpattern.workers.dev' },
  { label: 'Cloudflare', url: 'https://dash.cloudflare.com' },
  { label: 'Supabase', url: 'https://supabase.com/dashboard' },
  { label: 'GitHub', url: 'https://github.com/connordmcneely96/ll-cockpit' },
  { label: 'Anthropic', url: 'https://console.anthropic.com' },
  { label: 'Linear', url: 'https://linear.app' },
]

export default function BrowserPage() {
  const [url, setUrl] = useState('https://ll-cockpit.connorpattern.workers.dev')
  const [inputUrl, setInputUrl] = useState(url)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<string[]>([url])
  const [historyIdx, setHistoryIdx] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const navigate = (target: string) => {
    let final = target.trim()
    if (!final.startsWith('http')) final = 'https://' + final
    setUrl(final)
    setInputUrl(final)
    setLoading(true)
    const next = history.slice(0, historyIdx + 1)
    setHistory([...next, final])
    setHistoryIdx(next.length)
  }

  const goBack = () => {
    if (historyIdx > 0) {
      const idx = historyIdx - 1
      setHistoryIdx(idx)
      setUrl(history[idx])
      setInputUrl(history[idx])
    }
  }

  const goForward = () => {
    if (historyIdx < history.length - 1) {
      const idx = historyIdx + 1
      setHistoryIdx(idx)
      setUrl(history[idx])
      setInputUrl(history[idx])
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--t-body)' }}>
      {/* Browser chrome */}
      <div
        className="flex flex-col shrink-0"
        style={{
          background: 'var(--t-panel)',
          backdropFilter: 'blur(var(--t-blur))',
          WebkitBackdropFilter: 'blur(var(--t-blur))',
          borderBottom: '1px solid var(--t-bdr)',
          boxShadow: 'var(--t-shadow)',
        }}
      >
        {/* Traffic lights + nav */}
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Traffic lights */}
          <div className="flex items-center gap-1.5 mr-1">
            <div className="w-3 h-3 rounded-full cursor-pointer hover:opacity-80 transition-opacity" style={{ background: '#ff5f57' }} />
            <div className="w-3 h-3 rounded-full cursor-pointer hover:opacity-80 transition-opacity" style={{ background: '#febc2e' }} />
            <div className="w-3 h-3 rounded-full cursor-pointer hover:opacity-80 transition-opacity" style={{ background: '#28c840' }} />
          </div>

          {/* Back/Forward */}
          <button onClick={goBack} disabled={historyIdx === 0}
            className="w-6 h-6 flex items-center justify-center rounded transition-all disabled:opacity-30"
            style={{ color: 'var(--t-tx2)' }}>
            <ArrowLeft size={13} />
          </button>
          <button onClick={goForward} disabled={historyIdx === history.length - 1}
            className="w-6 h-6 flex items-center justify-center rounded transition-all disabled:opacity-30"
            style={{ color: 'var(--t-tx2)' }}>
            <ArrowRight size={13} />
          </button>

          {/* Refresh */}
          <button onClick={() => { setLoading(true); iframeRef.current?.contentWindow?.location.reload() }}
            className="w-6 h-6 flex items-center justify-center rounded transition-all"
            style={{ color: 'var(--t-tx2)' }}>
            <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* URL bar */}
          <div
            className="flex-1 flex items-center gap-2 px-3 py-1 rounded-xl"
            style={{
              background: 'var(--t-panel)',
              border: '1px solid var(--t-bdr)',
              boxShadow: 'var(--t-shadow)',
            }}
          >
            <Globe size={11} style={{ color: 'var(--t-tx3)', flexShrink: 0 }} />
            <input
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && navigate(inputUrl)}
              onFocus={e => e.target.select()}
              className="flex-1 bg-transparent outline-none font-mono text-xs"
              style={{ color: 'var(--t-tx1)' }}
              placeholder="Enter URL..."
            />
            {loading && <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--t-p)', flexShrink: 0 }} />}
          </div>

          {/* Shield */}
          <Shield size={13} style={{ color: 'var(--t-tx3)' }} />
        </div>

        {/* Bookmarks bar */}
        <div
          className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto"
          style={{ borderTop: '1px solid var(--t-bdr)' }}
        >
          {BOOKMARKS.map(({ label, url: bUrl }) => (
            <button
              key={bUrl}
              onClick={() => navigate(bUrl)}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg whitespace-nowrap font-mono text-[10px] transition-all"
              style={{
                background: 'var(--t-p-glass)',
                border: '1px solid var(--t-bdr)',
                color: 'var(--t-tx2)',
              }}
            >
              <Globe size={9} style={{ color: 'var(--t-p)' }} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* iframe viewport */}
      <div className="flex-1 relative">
        {loading && (
          <div
            className="absolute top-0 left-0 right-0 h-0.5 z-10"
            style={{ background: `linear-gradient(to right, var(--t-p), var(--t-p-bright))`, animation: 'shimmer 1s linear infinite' }}
          />
        )}
        <iframe
          ref={iframeRef}
          src={url}
          className="w-full h-full border-none"
          onLoad={() => setLoading(false)}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation"
          title="Browser"
        />
      </div>
    </div>
  )
}
