import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { CheckCircle, Clock, FileText, AlertTriangle, MessageCircle, Loader2 } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.jsx'
import { api } from '../../lib/api.js'

const sections = [
  { key: 'tasks', icon: Clock, label: '今日任务', color: 'blue' },
  { key: 'reviews', icon: FileText, label: '待审文书', color: 'purple' },
  { key: 'risks', icon: AlertTriangle, label: '紧急跟进', color: 'red' },
  { key: 'feedback', icon: MessageCircle, label: '待回复', color: 'amber' },
]

export default function MyWorkspacePanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('tasks')

  useEffect(() => {
    api.commandCenter.myWorkspace()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-brand-600" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-ink-tertiary dark:text-slate-500 text-sm">
        无法加载工作台数据
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Summary badges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {sections.map(s => {
          const count = data.summary[s.key] || 0
          return (
            <button
              key={s.key}
              onClick={() => setActiveTab(s.key)}
              className={clsx(
                'flex items-center gap-2 rounded-lg border px-2.5 sm:px-3 py-2 sm:py-2.5 text-left transition-all active:scale-[0.98]',
                activeTab === s.key
                  ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-900/20 ring-1 ring-brand-500/20'
                  : 'border-surface-3 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-brand-300',
              )}
            >
              <s.icon size={14} className={clsx(
                'flex-shrink-0',
                activeTab === s.key ? 'text-brand-600' : 'text-ink-tertiary dark:text-slate-400'
              )} />
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-bold text-ink-primary dark:text-slate-100">{count}</p>
                <p className="text-[9px] sm:text-[10px] text-ink-tertiary dark:text-slate-400 truncate">{s.label}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Active tab content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-surface-3 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden"
      >
        {activeTab === 'tasks' && <TaskList items={data.todayTasks} />}
        {activeTab === 'reviews' && <ReviewList items={data.pendingReviews} />}
        {activeTab === 'risks' && <RiskList items={data.riskApps} />}
        {activeTab === 'feedback' && <FeedbackList items={data.pendingFeedback} />}
      </motion.div>
    </div>
  )
}

function TaskList({ items }) {
  if (!items?.length) return <EmptyRow label="暂无到期任务" />
  return (
    <div className="divide-y divide-surface-2 dark:divide-slate-700">
      {items.map(t => (
        <div key={t.id} className="px-3 sm:px-4 py-3 flex items-center gap-2.5 sm:gap-3 hover:bg-surface-0/50 dark:hover:bg-slate-800/50 active:bg-surface-1 dark:active:bg-slate-700/50">
          <CheckCircle size={14} className={clsx(
            'flex-shrink-0',
            t.priority === 'high' ? 'text-red-500' : 'text-ink-tertiary dark:text-slate-400'
          )} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-ink-primary dark:text-slate-100 truncate">{t.title}</p>
            <p className="text-[10px] text-ink-tertiary dark:text-slate-400 truncate">
              {t.student_name} {t.uni_name ? `- ${t.uni_name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {t.category && <Badge color="default" className="text-[8px] hidden sm:inline-flex">{t.category}</Badge>}
            <span className="text-[10px] text-ink-tertiary dark:text-slate-500 tabular-nums">
              {t.due_date?.slice(5, 10)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ReviewList({ items }) {
  if (!items?.length) return <EmptyRow label="暂无待���文书" />
  return (
    <div className="divide-y divide-surface-2 dark:divide-slate-700">
      {items.map(r => (
        <div key={r.id} className="px-3 sm:px-4 py-3 flex items-center gap-2.5 sm:gap-3 hover:bg-surface-0/50 dark:hover:bg-slate-800/50 active:bg-surface-1 dark:active:bg-slate-700/50">
          <FileText size={14} className="text-purple-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-ink-primary dark:text-slate-100 truncate">
              {r.title || r.essay_type}
            </p>
            <p className="text-[10px] text-ink-tertiary dark:text-slate-400 truncate">
              {r.student_name} {r.uni_name ? `- ${r.uni_name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Badge color="purple" className="text-[8px]">{r.status}</Badge>
            {r.review_deadline && (
              <span className="text-[10px] text-ink-tertiary dark:text-slate-500 tabular-nums hidden sm:inline">
                截止 {r.review_deadline.slice(5, 10)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function RiskList({ items }) {
  if (!items?.length) return <EmptyRow label="暂无紧急风险" />
  return (
    <div className="divide-y divide-surface-2 dark:divide-slate-700">
      {items.map(r => (
        <div key={r.id} className="px-3 sm:px-4 py-3 flex items-center gap-2.5 sm:gap-3 hover:bg-surface-0/50 dark:hover:bg-slate-800/50 active:bg-surface-1 dark:active:bg-slate-700/50">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-ink-primary dark:text-slate-100 truncate">{r.uni_name}</p>
            <p className="text-[10px] text-ink-tertiary dark:text-slate-400 truncate">{r.student_name}</p>
          </div>
          <span className="text-[10px] font-semibold text-red-500 tabular-nums flex-shrink-0">
            {r.days_left < 0 ? `逾期${Math.abs(r.days_left)}天` : `${r.days_left}天`}
          </span>
        </div>
      ))}
    </div>
  )
}

function FeedbackList({ items }) {
  if (!items?.length) return <EmptyRow label="暂无待回复反馈" />
  return (
    <div className="divide-y divide-surface-2 dark:divide-slate-700">
      {items.map(f => (
        <div key={f.id} className="px-3 sm:px-4 py-3 flex items-center gap-2.5 sm:gap-3 hover:bg-surface-0/50 dark:hover:bg-slate-800/50 active:bg-surface-1 dark:active:bg-slate-700/50">
          <MessageCircle size={14} className="text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-ink-primary dark:text-slate-100 truncate">{f.title}</p>
            <p className="text-[10px] text-ink-tertiary dark:text-slate-400 truncate">
              {f.student_name} - {f.created_at?.slice(0, 10)}
            </p>
          </div>
          <Badge color="amber" className="text-[8px] flex-shrink-0">待回复</Badge>
        </div>
      ))}
    </div>
  )
}

function EmptyRow({ label }) {
  return (
    <div className="px-4 py-8 text-center text-xs text-ink-tertiary dark:text-slate-500">{label}</div>
  )
}
