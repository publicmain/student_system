import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import clsx from 'clsx'

export default function StatCard({ icon: Icon, label, value, color = 'brand', delay = 0, onClick, active, trend }) {
  const colorMap = {
    brand:  'text-brand-600 bg-brand-50 dark:bg-brand-600/10',
    blue:   'text-blue-600 bg-blue-50 dark:bg-blue-600/10',
    green:  'text-emerald-600 bg-emerald-50 dark:bg-emerald-600/10',
    red:    'text-red-600 bg-red-50 dark:bg-red-600/10',
    amber:  'text-amber-600 bg-amber-50 dark:bg-amber-600/10',
    purple: 'text-purple-600 bg-purple-50 dark:bg-purple-600/10',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      onClick={onClick}
      className={clsx(
        'bg-white dark:bg-slate-800 rounded-card border border-surface-3 dark:border-slate-700 p-2.5 sm:p-4 flex items-center gap-2 sm:gap-3',
        onClick && 'cursor-pointer hover:shadow-md hover:border-brand-400 active:scale-[0.98] transition-all',
        active && 'ring-2 ring-brand-500/30 border-brand-500',
      )}
    >
      <div className={clsx('w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0', colorMap[color] || colorMap.brand)}>
        <Icon size={16} className="sm:hidden" />
        <Icon size={20} className="hidden sm:block" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl sm:text-2xl font-bold tabular-nums text-ink-primary dark:text-slate-100">{value}</span>
          {trend > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <TrendingUp size={10} />
              +{trend}
            </span>
          )}
        </div>
        <div className="text-[10px] sm:text-xs text-ink-tertiary dark:text-slate-400 truncate">
          {label}
          {trend > 0 && <span className="hidden sm:inline"> · 本周+{trend}</span>}
        </div>
      </div>
    </motion.div>
  )
}
