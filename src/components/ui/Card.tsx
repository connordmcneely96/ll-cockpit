interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={[
        'bg-navy-3 border border-gold/12 rounded-lg p-4',
        onClick ? 'cursor-pointer hover:border-gold/30 hover:bg-navy-4 transition-colors' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}
