import { useState } from 'react'
import PropTypes from 'prop-types'
import { motion } from 'framer-motion'
import { Loader2, AlertCircle, Rocket } from 'lucide-react'
import { useCommandCenter } from '../../hooks/useCommandCenter.js'
import { useAIPanel } from '../../hooks/useAIPanel.js'
import StatCards from './StatCards.jsx'
import FilterBar from './FilterBar.jsx'
import KanbanBoard from './KanbanBoard.jsx'
import TableView from './TableView.jsx'
import TimelineView from './TimelineView.jsx'
import LifecyclePipelineView from './LifecyclePipelineView.jsx'
import MyWorkspacePanel from './MyWorkspacePanel.jsx'
import AISidePanel from './AISidePanel.jsx'
import DetailDrawer from './DetailDrawer.jsx'
import { SectionErrorBoundary } from '../../components/ui/ErrorBoundary.jsx'

export default function CommandCenterPage() {
  const cc = useCommandCenter()
  const ai = useAIPanel()
  const [drawerApp, setDrawerApp] = useState(null)
  const role = window.__ROLE__
  const isMentor = role === 'mentor'

  // 包装状态变更：同时清空 AI 缓存
  const handleStatusChange = async (appId, newStatus) => {
    await cc.updateAppStatus(appId, newStatus)
    ai.clearCache()
  }

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
    <div className="flex h-full overflow-hidden relative w-full">
      <div className="flex-1 min-w-0 flex flex-col gap-3 sm:gap-4 p-3 sm:p-4 lg:p-6 overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2.5 sm:gap-3"
        >
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white shadow-lg flex-shrink-0">
            <Rocket size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-ink-primary dark:text-slate-100 truncate">
              申请指挥中心
            </h1>
            <p className="text-[10px] sm:text-xs text-ink-tertiary dark:text-slate-400">
              全局视图 &middot; {cc.allApps?.length || 0} 个申请
            </p>
          </div>
        </motion.div>

        {/* Stat Cards */}
        <StatCards stats={cc.stats} riskCount={cc.riskAlerts.length} filters={cc.filters} onFiltersChange={cc.setFilters} />

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
          readOnly={isMentor}
          allApps={cc.allApps}
        />

        {/* Empty state for new counselors */}
        {!cc.loading && cc.allApps?.length === 0 && (
          <div className="text-center py-10 sm:py-16 text-ink-tertiary dark:text-slate-400 px-4">
            <p className="text-base sm:text-lg mb-2">暂无申请数据</p>
            <p className="text-xs sm:text-sm">如果您是新加入的规划师，请联系管理员分配学生后再使用指挥中心。</p>
          </div>
        )}

        {/* View Area — keyed div forces remount on view change, CSS fade-in only (no exit animation) */}
        <div key={cc.viewMode} className="animate-fadeIn">
          {cc.viewMode === 'kanban' && (
            <SectionErrorBoundary name="看板视图">
              <KanbanBoard
                columns={cc.kanbanData}
                onStatusChange={handleStatusChange}
                healthMap={cc.healthMap}
              />
            </SectionErrorBoundary>
          )}
          {cc.viewMode === 'table' && (
            <SectionErrorBoundary name="表格视图">
              <TableView apps={cc.apps} onStatusChange={handleStatusChange} readOnly={isMentor} onRefresh={cc.refresh} onRowClick={setDrawerApp} />
            </SectionErrorBoundary>
          )}
          {cc.viewMode === 'timeline' && (
            <SectionErrorBoundary name="时间线视图">
              <TimelineView apps={cc.apps} />
            </SectionErrorBoundary>
          )}
          {cc.viewMode === 'lifecycle' && (
            <SectionErrorBoundary name="生命周期视图">
              <LifecyclePipelineView pipelines={cc.lifecycle} />
            </SectionErrorBoundary>
          )}
          {cc.viewMode === 'workspace' && (
            <SectionErrorBoundary name="我的工作台">
              <MyWorkspacePanel />
            </SectionErrorBoundary>
          )}
        </div>
      </div>

      {/* AI Side Panel */}
      <AISidePanel ai={ai} riskAlerts={cc.riskAlerts} allApps={cc.allApps} />

      {/* Detail Drawer */}
      <DetailDrawer
        app={drawerApp}
        health={drawerApp ? cc.healthMap?.[drawerApp.id] : null}
        onClose={() => setDrawerApp(null)}
      />
    </div>
  )
}

CommandCenterPage.propTypes = {
  // This is a top-level page component; all data comes from hooks.
  // No external props required.
}
