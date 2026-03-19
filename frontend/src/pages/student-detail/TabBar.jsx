import { motion } from 'framer-motion'
import { clsx } from 'clsx'

/**
 * TabBar — 页面中层导航
 * 当前 active tab 下方有滑动指示条（Framer Motion layoutId）
 */
export function TabBar({ tabs, activeTab, onChange }) {
  return (
    <div className="flex border-b border-surface-2 bg-white px-6 overflow-x-auto scrollbar-thin">
      {tabs.map(tab => {
        const active = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={clsx(
              'relative flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium whitespace-nowrap',
              'transition-colors duration-fast select-none',
              active ? 'text-brand-600' : 'text-ink-tertiary hover:text-ink-secondary',
            )}
          >
            {tab.label}
            {/* 数字徽章 */}
            {tab.count != null && tab.count > 0 && (
              <span className={clsx(
                'inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-semibold px-1',
                active
                  ? 'bg-brand-100 text-brand-600'
                  : 'bg-surface-2 text-ink-tertiary'
              )}>
                {tab.count}
              </span>
            )}
            {/* 滑动下划线 */}
            {active && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-full"
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
