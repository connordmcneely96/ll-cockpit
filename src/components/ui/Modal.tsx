'use client'

import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose?: () => void
  title: string
  children: ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, className = '' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Dialog */}
      <div
        className={[
          'relative z-10 bg-navy-3 border border-gold/20 rounded-xl shadow-2xl w-full max-w-md',
          className,
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-gold/12">
          <h2 id="modal-title" className="text-text1 font-condensed font-semibold text-lg">
            {title}
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-text3 hover:text-text1 transition-colors p-1 rounded hover:bg-white/10"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
