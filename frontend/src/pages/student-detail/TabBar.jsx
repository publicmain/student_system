import { motion } from 'framer-motion'
import { clsx } from 'clsx'

export function TabBar({ tabs, activeTab, onChange }) {
  return (
    <div className="flex border-b border-surface-2 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 md:px-6 overflow-x-auto scrollbar-thin">
      {tabs.map(tab => {
        const active = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={clsx(
              'relative flex items-center gap-1.5 px-3 md:px-4 py-3.5 text-xs md:text-sm font-medium whitespace-nowrap select-none',
              'transition-colors duration-fast',
              active
                ? 'text-brand-600 dark:text-brand-400'
                : 'text-ink-tertiary dark:text-slate-500 hover:text-ink-secondary dark:hover:text-slate-300',
            )}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className={clsx(
                'inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-semibold px-1',
                active
                  ? 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400'
                  : 'bg-surface-2 text-ink-tertiary dark:bg-slate-700 dark:text-slate-400'
              )}>
                {tab.count}
              </span>
            )}
            {active && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 dark:bg-brand-400 rounded-full"
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
