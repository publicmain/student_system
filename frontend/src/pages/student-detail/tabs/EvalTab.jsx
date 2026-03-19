import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, AlertTriangle, Plus } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../../../lib/api.js'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'

function ProbBar({ value }) {
  const pct = Math.round(value * 100)
  const color = pct >= 60 ? 'bg-green-500' : pct >= 35 ? 'bg-amber-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-surface-2 dark:bg-slate-700 overflow-hidden">
        <motion.div
          className={clsx('h-full rounded-full', color)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span className={clsx('text-xs font-bold tabular-nums w-10 text-right',
        pct >= 60 ? 'text-green-600 dark:text-green-400' :
        pct >= 35 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'
      )}>{pct}%</span>
    </div>
  )
}

function EvalCard({ ev }) {
  return (
    <div className="p-4 rounded-card border border-surface-2 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink-primary dark:text-slate-100">{ev.university_name || ev.uni_name}</p>
          <p className="text-xs text-ink-tertiary mt-0.5">{ev.program_name || ev.program}</p>
        </div>
        <span className="text-xs text-ink-tertiary tabular-nums">{ev.eval_date?.slice(0, 10)}</span>
      </div>
      {ev.admission_probability != null && (
        <div>
          <p className="text-xs text-ink-tertiary mb-1.5">录取概率</p>
          <ProbBar value={ev.admission_probability} />
        </div>
      )}
      {ev.summary && (
        <p className="text-xs text-ink-secondary dark:text-slate-400 leading-relaxed border-t border-surface-2 dark:border-slate-700 pt-3">{ev.summary}</p>
      )}
    </div>
  )
}

export function EvalTab({ studentId, canEdit }) {
  const [evals, setEvals]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.eval.list(studentId)
      .then(data => setEvals(Array.isArray(data) ? data : []))
      .catch(() => setEvals([]))
      .finally(() => setLoading(false))
  }, [studentId])

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-ink-tertiary text-sm">加载中…</div>
  )

  return (
    <div>
      {/* 免责声明 */}
      <div className="flex items-start gap-2 p-3 rounded-card bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 mb-6">
        <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
        <p>概率估算基于历史数据与规则模型，<strong>仅供参考，不构成录取承诺</strong>。实际录取受多因素影响。</p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-ink-tertiary">{evals.length} 条评估记录</p>
        {canEdit && <Button variant="primary" icon={Plus} size="sm">运行新评估</Button>}
      </div>

      {evals.length === 0 ? (
        <EmptyState icon={BarChart3} label="暂无录取评估记录" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {evals.map(ev => <EvalCard key={ev.id} ev={ev} />)}
        </div>
      )}
    </div>
  )
}
