type BadgeVariant = 'gold' | 'cyan' | 'green' | 'red' | 'default'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variants: Record<BadgeVariant, string> = {
  gold: 'bg-gold/10 text-gold border-gold/30',
  cyan: 'bg-cyan/10 text-cyan border-cyan/30',
  green: 'bg-green/10 text-green border-green/30',
  red: 'bg-red/10 text-red border-red/30',
  default: 'bg-navy-4 text-text3 border-white/10',
}

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border',
        variants[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
