import { AnimatePresence, motion } from 'framer-motion'
import { clsx } from 'clsx'
import { X, AlertTriangle, Zap, MessageSquare, BarChart3 } from 'lucide-react'
import RiskAlertList from './RiskAlertList.jsx'
import ActionRecommendations from './ActionRecommendations.jsx'
import NLQueryInput from './NLQueryInput.jsx'
import ListScoreCard from './ListScoreCard.jsx'

const tabs = [
  { id: 'risks',   label: '风险',   icon: AlertTriangle },
  { id: 'actions', label: '建议',   icon: Zap           },
  { id: 'nlq',     label: '查询',   icon: MessageSquare  },
  { id: 'score',   label: '评分',   icon: BarChart3      },
]

export default function AISidePanel({ ai, riskAlerts, allApps }) {
  return (
    <AnimatePresence>
      {ai.open && (
        <>
          {/* Mobile backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => ai.setOpen(false)}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          />

          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={clsx(
              'shrink-0 border-l border-surface-3 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden flex flex-col',
              'fixed inset-y-0 right-0 z-50 w-[85vw] max-w-[340px]',
              'lg:relative lg:inset-auto lg:z-auto lg:w-[320px] lg:min-w-[320px]',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-surface-2 dark:border-slate-700">
              <span className="text-sm font-bold text-ink-primary dark:text-slate-100">
                AI 助手
              </span>
              <button
                onClick={() => ai.setOpen(false)}
                className="p-1.5 rounded-md text-ink-tertiary hover:bg-surface-2 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-surface-2 dark:border-slate-700 px-1 sm:px-2">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => ai.setActiveTab(tab.id)}
                  className={clsx(
                    'flex items-center gap-1 px-2 sm:px-2.5 py-2.5 text-[11px] font-medium border-b-2 transition-colors flex-1 justify-center sm:flex-none sm:justify-start',
                    ai.activeTab === tab.id
                      ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-ink-tertiary dark:text-slate-400 hover:text-ink-secondary dark:hover:text-slate-300'
                  )}
                >
                  <tab.icon size={13} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3">
              {ai.activeTab === 'risks' && (
                <RiskAlertList
                  sqlAlerts={riskAlerts || []}
                  aiRisks={ai.aiRisks}
                  loading={ai.aiRisksLoading}
                  onFetchAI={ai.fetchAiRisks}
                />
              )}
              {ai.activeTab === 'actions' && (
                <ActionRecommendations
                  actions={ai.aiActions}
                  loading={ai.aiActionsLoading}
                  onFetch={ai.fetchAiActions}
                />
              )}
              {ai.activeTab === 'nlq' && (
                <NLQueryInput
                  result={ai.nlqResult}
                  loading={ai.nlqLoading}
                  onQuery={ai.fetchNlq}
                />
              )}
              {ai.activeTab === 'score' && (
                <ListScoreCard
                  score={ai.listScore}
                  loading={ai.listScoreLoading}
                  onFetch={ai.fetchListScore}
                  allApps={allApps}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
