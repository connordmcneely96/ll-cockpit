'use client'

import { useState } from 'react'
import { parseSections, RunnerSection } from '@/lib/agent-runner'
import { buildExportHtml, downloadHtml } from '@/lib/export-doc'

interface Props {
  docTitle: string
  docSubtitle: string
  full: string
  sections: RunnerSection[]
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document'
}

export function ExportButtons({ docTitle, docSubtitle, full, sections }: Props) {
  const [notice, setNotice] = useState<string | null>(null)
  const parsed = parseSections(full, sections.map(s => s.title))
  const html = () => buildExportHtml({ title: docTitle, subtitle: docSubtitle, sections: parsed })
  const baseName = `${slugify(docTitle)}-${new Date().toISOString().slice(0, 10)}`

  const onDownload = () => { downloadHtml(`${baseName}.html`, html()); setNotice('HTML downloaded.') }

  const onPrint = () => {
    const w = window.open('', '_blank')
    if (!w) {
      downloadHtml(`${baseName}.html`, html())
      setNotice('Popup blocked — downloaded HTML instead.')
      return
    }
    w.document.open(); w.document.write(html()); w.document.close()
    const fire = () => { try { w.focus(); w.print() } catch { /* user-cancelled or blocked */ } }
    if (w.document.readyState === 'complete') setTimeout(fire, 400)
    else w.addEventListener('load', () => setTimeout(fire, 400))
    setNotice('Print dialog opened — choose "Save as PDF".')
  }

  const onCopy = () => { navigator.clipboard.writeText(full).then(() => setNotice('Markdown copied.')) }

  const btn = { background: 'var(--d-elevated)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-tx2)', cursor: 'pointer' }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={onDownload} className="px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all" style={btn}>Download HTML</button>
      <button onClick={onPrint} className="px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all" style={btn}>Open / Print PDF</button>
      <button onClick={onCopy} className="px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all" style={btn}>Copy Markdown</button>
      {notice && <span className="text-[10px] font-mono" style={{ color: 'var(--t-tx3)' }}>{notice}</span>}
    </div>
  )
}
