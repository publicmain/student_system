import { motion } from 'framer-motion'
import clsx from 'clsx'

export default function Chip({ label, active, onClick, count }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-colors duration-fast select-none',
        active
          ? 'bg-brand-600 text-white shadow-sm'
          : 'bg-surface-2 dark:bg-slate-700 text-ink-secondary dark:text-slate-300 hover:bg-surface-3 dark:hover:bg-slate-600'
      )}
    >
      {label}
      {count != null && (
        <span className={clsx(
          'inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold',
          active ? 'bg-white/25 text-white' : 'bg-surface-3 dark:bg-slate-600 text-ink-tertiary dark:text-slate-400'
        )}>
          {count}
        </span>
      )}
    </motion.button>
  )
}
