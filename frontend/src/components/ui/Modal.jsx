import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

export function Modal({ open, onClose, title, children, className }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div className={clsx(
        'bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-surface-3 dark:border-slate-700',
        'w-full max-h-[85vh] overflow-y-auto',
        className || 'max-w-md'
      )}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-2 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-ink-primary dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-md text-ink-tertiary hover:text-ink-primary hover:bg-surface-1 dark:hover:bg-slate-700 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  )
}
