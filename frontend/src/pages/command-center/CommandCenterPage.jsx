import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, AlertCircle, Rocket } from 'lucide-react'
import { useCommandCenter } from '../../hooks/useCommandCenter.js'
import { useAIPanel } from '../../hooks/useAIPanel.js'
import StatCards from './StatCards.jsx'
import FilterBar from './FilterBar.jsx'
import KanbanBoard from './KanbanBoard.jsx'
import TableView from './TableView.jsx'
import TimelineView from './TimelineView.jsx'
import AISidePanel from './AISidePanel.jsx'

export default function CommandCenterPage() {
  const cc = useCommandCenter()
  const ai = useAIPanel()

  if (cc.loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 size={32} className="animate-spin text-brand-600" />
      </div>
    )
  }

  if (cc.error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-ink-secondary">
        <AlertCircle size={36} className="text-red-400" />
        <p className="text-sm">{cc.error}</p>
        <button onClick={cc.refresh} className="text-sm text-brand-600 hover:underline">重试</button>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col gap-4 p-4 lg:p-6 overflow-y-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white shadow-lg">
            <Rocket size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink-primary dark:text-slate-100">
              申请指挥中心
            </h1>
            <p className="text-xs text-ink-tertiary dark:text-slate-400">
              跨学生申请全局视图 &middot; {cc.allApps?.length || 0} 个申请
            </p>
          </div>
        </motion.div>

        {/* Stat Cards */}
        <StatCards stats={cc.stats} riskCount={cc.riskAlerts.length} />

        {/* Filter Bar */}
        <FilterBar
          search={cc.search}
          onSearchChange={cc.setSearch}
          filters={cc.filters}
          onFiltersChange={cc.setFilters}
          filterOptions={cc.filterOptions}
          viewMode={cc.viewMode}
          onViewModeChange={cc.setViewMode}
          onToggleAI={() => ai.setOpen(o => !o)}
          aiOpen={ai.open}
        />

        {/* Empty state for new counselors */}
        {!cc.loading && cc.allApps?.length === 0 && (
          <div className="text-center py-16 text-ink-tertiary dark:text-slate-400">
            <p className="text-lg mb-2">暂无申请数据</p>
            <p className="text-sm">如果您是新加入的规划师，请联系管理员分配学生后再使用指挥中心。</p>
          </div>
        )}

        {/* View Area */}
        <AnimatePresence mode="wait">
          {cc.viewMode === 'kanban' && (
            <motion.div key="kanban" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <KanbanBoard
                columns={cc.kanbanData}
                onStatusChange={cc.updateAppStatus}
              />
            </motion.div>
          )}
          {cc.viewMode === 'table' && (
            <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <TableView apps={cc.apps} onStatusChange={cc.updateAppStatus} />
            </motion.div>
          )}
          {cc.viewMode === 'timeline' && (
            <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <TimelineView apps={cc.apps} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* AI Side Panel */}
      <AISidePanel ai={ai} riskAlerts={cc.riskAlerts} allApps={cc.allApps} />
    </div>
  )
}
