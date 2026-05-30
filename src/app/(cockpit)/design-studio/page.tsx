'use client'

import { useState } from 'react'
import { ModelViewer } from '@/components/designstudio/ModelViewer'
import { StudioControls, type StudioStatus } from '@/components/designstudio/StudioControls'

export default function DesignStudioPage() {
  const [url, setUrl] = useState<string | null>(null)
  const [wireframe, setWireframe] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [bgColor, setBgColor] = useState('#0a0e14')
  const [status, setStatus] = useState<StudioStatus>('idle')

  const handleLoadUrl = (u: string) => {
    if (!u) { setUrl(null); setStatus('idle'); return }   // '' → built-in placeholder
    setUrl(u)
    setStatus('loading')
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
        <p className="text-text3 font-mono text-[10px] uppercase tracking-widest">Design Studio</p>
        <p className="text-text2 font-mono text-[10px] mt-0.5">3D model + CAD review</p>
      </div>

      <div className="flex-1 flex min-h-0 gap-4 p-4 flex-col lg:flex-row">
        <div className="w-full lg:w-80 shrink-0">
          <StudioControls
            url={url}
            onLoadUrl={handleLoadUrl}
            wireframe={wireframe}
            onToggleWireframe={() => setWireframe((w) => !w)}
            autoRotate={autoRotate}
            onToggleAutoRotate={() => setAutoRotate((a) => !a)}
            bgColor={bgColor}
            onSetBgColor={setBgColor}
            status={status}
          />
        </div>

        <div className="flex-1 min-h-[60vh] rounded-lg overflow-hidden border border-white/[0.06] bg-base-2">
          <ModelViewer
            url={url}
            wireframe={wireframe}
            autoRotate={autoRotate}
            bgColor={bgColor}
            onLoaded={() => setStatus('loaded')}
            onError={(msg) => setStatus(`error: ${msg}`)}
          />
        </div>
      </div>
    </div>
  )
}
