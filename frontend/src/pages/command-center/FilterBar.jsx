import { useState } from 'react'
import { Search, LayoutGrid, Table, Calendar, Sparkles, X, GitBranch, User, ChevronDown, Download } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { clsx } from 'clsx'
import Chip from '../../components/ui/Chip.jsx'

const viewModes = [
  { id: 'kanban',    icon: LayoutGrid, label: '看板' },
  { id: 'table',     icon: Table,      label: '表格' },
  { id: 'timeline',  icon: Calendar,   label: '时间线' },
  { id: 'lifecycle', icon: GitBranch,  label: '生命周期' },
  { id: 'workspace', icon: User,       label: '我的工作台' },
]

export default function FilterBar({
  search, onSearchChange,
  filters, onFiltersChange,
  filterOptions,
  viewMode, onViewModeChange,
  onToggleAI, aiOpen,
  readOnly,
  allApps,
}) {
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  const apps = Array.isArray(allApps) ? allApps : []
  const countBy = (key, val) => apps.filter(a => a[key] === val).length
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
  const activeFilterCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1: Search + View Mode + AI */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-0 sm:max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary dark:text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="搜索院校/学生..."
            className="w-full pl-8 pr-7 py-2 sm:py-1.5 text-sm sm:text-xs rounded-lg border border-surface-3 dark:border-slate-600 bg-white dark:bg-slate-800 text-ink-primary dark:text-slate-100 placeholder:text-ink-tertiary dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
          />
          {search && (
            <button onClick={() => onSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-ink-tertiary hover:text-ink-primary dark:hover:text-slate-200 transition-colors">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter expand toggle (mobile only) */}
        <button
          onClick={() => setFiltersExpanded(v => !v)}
          className={clsx(
            'sm:hidden inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors',
            activeFilterCount > 0
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600'
              : 'border-surface-3 dark:border-slate-600 text-ink-secondary dark:text-slate-300'
          )}
        >
          <ChevronDown size={14} className={clsx('transition-transform', filtersExpanded && 'rotate-180')} />
          {activeFilterCount > 0 && <span className="text-[10px] font-bold bg-brand-600 text-white rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>}
        </button>

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

        {/* Export Excel */}
        {!readOnly && (
          <button
            onClick={() => { window.open('/api/command-center/export-excel', '_blank') }}
            title="导出 Excel"
            className="p-2 sm:p-1.5 rounded-lg text-ink-tertiary dark:text-slate-400 hover:text-ink-secondary dark:hover:text-slate-300 hover:bg-surface-2 dark:hover:bg-slate-700 transition-colors"
          >
            <Download size={14} />
          </button>
        )}

        {/* AI Toggle */}
        {!readOnly && <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onToggleAI}
          className={clsx(
            'inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0',
            aiOpen
              ? 'bg-gradient-to-r from-purple-600 to-brand-600 text-white shadow-md'
              : 'bg-surface-2 dark:bg-slate-700 text-ink-secondary dark:text-slate-300 hover:bg-surface-3 dark:hover:bg-slate-600'
          )}
        >
          <Sparkles size={13} />
          <span className="hidden sm:inline">AI 助手</span>
        </motion.button>}
      </div>

      {/* Row 2: Filter chips — always visible on sm+, collapsible on mobile */}
      <div className={clsx(
        'items-center gap-1.5 sm:gap-2 flex-wrap',
        'hidden sm:flex',
        filtersExpanded && '!flex',
      )}>
        {filterOptions.cycleYears.map(y => (
          <Chip key={y} label={String(y)} count={countBy('cycle_year', y)} active={filters.cycle_year === y} onClick={() => toggleFilter('cycle_year', y)} />
        ))}

        {filterOptions.routes.map(r => (
          <Chip key={r} label={r} count={countBy('route', r)} active={filters.route === r} onClick={() => toggleFilter('route', r)} />
        ))}

        {filterOptions.tiers.map(t => (
          <Chip key={t} label={t === 'reach' ? '冲刺' : t === 'target' ? '匹配' : t === 'safety' ? '保底' : t}
                count={countBy('tier', t)} active={filters.tier === t} onClick={() => toggleFilter('tier', t)} />
        ))}

        {hasFilters && (
          <button onClick={clearAll} className="inline-flex items-center gap-1 text-xs text-ink-tertiary hover:text-red-500 transition-colors py-1">
            <X size={12} /> 清除
          </button>
        )}
      </div>
    </div>
  )
}
