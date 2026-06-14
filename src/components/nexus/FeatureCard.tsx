interface Props {
  title: string
  subtitle: string
  cta: string
  href?: string
  onClick?: () => void
}

export default function FeatureCard({ title, subtitle, cta, href = '#' }: Props) {
  return (
    <div
      style={{
        borderRadius: 'var(--d-radius-xl)',
        background: 'linear-gradient(135deg, var(--t-p), var(--t-p-dim))',
        boxShadow: 'var(--d-glow-full), var(--t-shadow)',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        transition: 'box-shadow var(--d-transition), transform var(--d-transition)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--t-shadow-hover), 0 0 32px var(--t-p-glow)'
        ;(e.currentTarget as HTMLElement).style.transform = 'var(--d-hover-lift)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--d-glow-full), var(--t-shadow)'
        ;(e.currentTarget as HTMLElement).style.transform = 'none'
      }}
    >
      <div className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.95)', fontFamily: 'var(--font-condensed), sans-serif', letterSpacing: '0.02em' }}>
        {title}
      </div>
      <div className="text-xs" style={{ color: 'rgba(255,255,255,0.70)' }}>{subtitle}</div>
      <a
        href={href}
        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 self-start"
        style={{
          borderRadius: 'var(--d-radius-md)',
          background: 'rgba(255,255,255,0.18)',
          color: 'rgba(255,255,255,0.95)',
          border: '1px solid rgba(255,255,255,0.22)',
          transition: 'background var(--d-transition)',
          textDecoration: 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.28)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
      >
        {cta} →
      </a>
    </div>
  )
}
