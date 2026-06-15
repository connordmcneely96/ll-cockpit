'use client'

import dynamic from 'next/dynamic'

const HeroCore = dynamic(() => import('./HeroCore'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0" style={{ background: 'radial-gradient(130% 120% at 50% 44%, #081019 0%, #050510 50%, #020206 100%)' }} />
  ),
})

export default function HeroCoreLazy() {
  return <HeroCore />
}
