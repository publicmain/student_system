import { Search, LayoutGrid, Table, Calendar, Sparkles, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import Chip from '../../components/ui/Chip.jsx'

const viewModes = [
  { id: 'kanban',   icon: LayoutGrid, label: '看板' },
  { id: 'table',    icon: Table,      label: '表格' },
  { id: 'timeline', icon: Calendar,   label: '时间线' },
]

export default function FilterBar({
  search, onSearchChange,
  filters, onFiltersChange,
  filterOptions,
  viewMode, onViewModeChange,
  onToggleAI, aiOpen,
  readOnly,
}) {
  const toggleFilter = (key, value) => {
    onFiltersChange(prev => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }))
  }

  const clearAll = () => {
    onFiltersChange({ cycle_year: null, route: null, tier: null, status: null })
    onSearchChange('')
  }

  const hasFilters = search || Object.values(filters).some(Boolean)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary dark:text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="搜索院校/学生..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-surface-3 dark:border-slate-600 bg-white dark:bg-slate-800 text-ink-primary dark:text-slate-100 placeholder:text-ink-tertiary dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
          />
        </div>

        {/* Cycle Year Chips */}
        {filterOptions.cycleYears.map(y => (
          <Chip key={y} label={String(y)} active={filters.cycle_year === y} onClick={() => toggleFilter('cycle_year', y)} />
        ))}

        {/* Route Chips */}
        {filterOptions.routes.map(r => (
          <Chip key={r} label={r} active={filters.route === r} onClick={() => toggleFilter('route', r)} />
        ))}

        {/* Tier Chips */}
        {filterOptions.tiers.map(t => (
          <Chip key={t} label={t === 'reach' ? '冲刺' : t === 'target' ? '匹配' : t === 'safety' ? '保底' : t}
                active={filters.tier === t} onClick={() => toggleFilter('tier', t)} />
        ))}

        {hasFilters && (
          <button onClick={clearAll} className="inline-flex items-center gap-1 text-xs text-ink-tertiary hover:text-red-500 transition-colors">
            <X size={12} /> 清除
          </button>
        )}

        <div className="flex-1" />

        {/* View Mode Toggle */}
        <div className="flex items-center bg-surface-2 dark:bg-slate-700 rounded-lg p-0.5 gap-0.5">
          {viewModes.map(v => (
            <button
              key={v.id}
              onClick={() => onViewModeChange(v.id)}
              title={v.label}
              className={clsx(
                'p-1.5 rounded-md transition-all duration-150',
                viewMode === v.id
                  ? 'bg-white dark:bg-slate-600 shadow-sm text-brand-600 dark:text-brand-400'
                  : 'text-ink-tertiary dark:text-slate-400 hover:text-ink-secondary dark:hover:text-slate-300'
              )}
            >
              <v.icon size={14} />
            </button>
          ))}
        </div>

        {/* AI Toggle */}
        {!readOnly && <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onToggleAI}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            aiOpen
              ? 'bg-gradient-to-r from-purple-600 to-brand-600 text-white shadow-md'
              : 'bg-surface-2 dark:bg-slate-700 text-ink-secondary dark:text-slate-300 hover:bg-surface-3 dark:hover:bg-slate-600'
          )}
        >
          <Sparkles size={13} />
          AI 助手
        </motion.button>}
      </div>
    </div>
  )
}
