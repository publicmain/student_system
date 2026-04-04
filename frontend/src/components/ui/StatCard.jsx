import { motion } from 'framer-motion'
import clsx from 'clsx'

export default function StatCard({ icon: Icon, label, value, color = 'brand', delay = 0 }) {
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
      className="bg-white dark:bg-slate-800 rounded-card border border-surface-3 dark:border-slate-700 p-4 flex items-center gap-3"
    >
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', colorMap[color] || colorMap.brand)}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-2xl font-bold tabular-nums text-ink-primary dark:text-slate-100">{value}</div>
        <div className="text-xs text-ink-tertiary dark:text-slate-400">{label}</div>
      </div>
    </motion.div>
  )
}
