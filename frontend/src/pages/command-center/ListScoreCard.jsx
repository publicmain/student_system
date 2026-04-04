import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { Loader2, Sparkles, BarChart3 } from 'lucide-react'

export default function ListScoreCard({ score, loading, onFetch, allApps }) {
  const [selectedStudent, setSelectedStudent] = useState('')

  // Get unique students from apps
  const students = useMemo(() => {
    const map = new Map()
    const list = Array.isArray(allApps) ? allApps : []
    list.forEach(a => {
      if (a.student_id && a.student_name && !map.has(a.student_id)) {
        map.set(a.student_id, a.student_name)
      }
    })
    return [...map.entries()]
  }, [allApps])

  const handleFetch = () => {
    if (selectedStudent) onFetch(selectedStudent)
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-ink-tertiary dark:text-slate-400">
        评估学生选校方案的冲刺/匹配/保底平衡度
      </p>

      <div className="flex gap-2">
        <select
          value={selectedStudent}
          onChange={e => setSelectedStudent(e.target.value)}
          className="flex-1 text-xs rounded-lg border border-surface-3 dark:border-slate-600 bg-white dark:bg-slate-800 text-ink-primary dark:text-slate-100 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="">选择学生...</option>
          {students.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <button
          onClick={handleFetch}
          disabled={!selectedStudent || loading}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          评分
        </button>
      </div>

      {score?.error && (
        <p className="text-[11px] text-red-500">{score.error}</p>
      )}

      {score && !score.error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {/* Score Circle */}
          <div className="flex items-center justify-center py-3">
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8"
                  className="text-surface-2 dark:text-slate-700" />
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8"
                  strokeDasharray={`${(score.score || 0) * 2.64} 264`}
                  strokeLinecap="round"
                  className={clsx(
                    (score.score || 0) >= 80 ? 'text-emerald-500' :
                    (score.score || 0) >= 60 ? 'text-amber-500' : 'text-red-500'
                  )}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-ink-primary dark:text-slate-100">{score.score || 0}</span>
                <span className="text-[9px] text-ink-tertiary dark:text-slate-400">/ 100</span>
              </div>
            </div>
          </div>

          {/* Tier Distribution */}
          {score.distribution && (
            <div className="space-y-1.5">
              <h5 className="text-[10px] font-semibold text-ink-secondary dark:text-slate-300">梯度分布</h5>
              {['reach', 'target', 'safety'].map(tier => {
                const count = score.distribution[tier] || 0
                const total = (score.distribution.reach || 0) + (score.distribution.target || 0) + (score.distribution.safety || 0)
                const pct = total > 0 ? (count / total * 100).toFixed(0) : 0
                const colors = { reach: 'bg-red-500', target: 'bg-amber-500', safety: 'bg-emerald-500' }
                const labels = { reach: '冲刺', target: '匹配', safety: '保底' }
                return (
                  <div key={tier} className="flex items-center gap-2">
                    <span className="text-[10px] w-8 text-ink-secondary dark:text-slate-400">{labels[tier]}</span>
                    <div className="flex-1 h-2 bg-surface-2 dark:bg-slate-700 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className={clsx('h-full rounded-full', colors[tier])}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-ink-tertiary dark:text-slate-500 w-12 text-right">
                      {count} ({pct}%)
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Summary */}
          {score.assessment && (
            <div className="p-2 rounded-lg bg-surface-0 dark:bg-slate-800/60 border border-surface-2 dark:border-slate-700">
              <p className="text-[11px] text-ink-secondary dark:text-slate-300 leading-relaxed">
                {score.assessment}
              </p>
            </div>
          )}

          {/* Suggestions */}
          {score.suggestions && score.suggestions.length > 0 && (
            <div className="space-y-1">
              <h5 className="text-[10px] font-semibold text-ink-secondary dark:text-slate-300">建议</h5>
              {score.suggestions.map((s, i) => (
                <p key={i} className="text-[11px] text-ink-tertiary dark:text-slate-400 flex items-start gap-1">
                  <span className="text-brand-600">•</span> {s}
                </p>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {!score && !loading && (
        <div className="text-center py-8 text-ink-tertiary dark:text-slate-500">
          <BarChart3 size={24} className="mx-auto mb-2 opacity-40" />
          <p className="text-[11px]">选择学生后点击评分</p>
        </div>
      )}
    </div>
  )
}
