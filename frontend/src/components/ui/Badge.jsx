import { clsx } from 'clsx'

const presets = {
  default:  'bg-surface-2 text-ink-secondary',
  blue:     'bg-blue-50 text-blue-700',
  green:    'bg-green-50 text-green-700',
  amber:    'bg-amber-50 text-amber-700',
  red:      'bg-red-50 text-red-600',
  purple:   'bg-purple-50 text-purple-700',
  slate:    'bg-slate-100 text-slate-600',
}

export function Badge({ children, color = 'default', className }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      presets[color] ?? presets.default,
      className
    )}>
      {children}
    </span>
  )
}
