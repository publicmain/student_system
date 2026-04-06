import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Loader2, Sparkles, Calendar, GraduationCap } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.jsx'

const examples = [
  '所有冲刺申请的截止日',
  '哪些学生还没提交申请',
  'UCL 的申请状态',
  'G5大学的申请',
]

const statusLabels = {
  pending: '准备中',
  applied: '已提交',
  submitted: '已提交',
  offer: 'Offer',
  conditional_offer: 'Con. Offer',
  unconditional_offer: 'Unc. Offer',
  firm: '已确认',
  insurance: 'Insurance',
  enrolled: '已入学',
  declined: '已拒绝',
  rejected: '被拒',
  withdrawn: '已撤回',
}

const statusColors = {
  pending: 'yellow',
  applied: 'blue',
  submitted: 'blue',
  offer: 'green',
  conditional_offer: 'green',
  unconditional_offer: 'green',
  firm: 'purple',
  insurance: 'purple',
  enrolled: 'brand',
  declined: 'red',
  rejected: 'red',
  withdrawn: 'red',
}

const tierColors = {
  '冲刺': 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
  '意向': 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
  '保底': 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
}

function formatDate(d) {
  if (!d) return null
  const date = new Date(d)
  if (isNaN(date)) return d
  const m = date.getMonth() + 1
  const day = date.getDate()
  return `${m}/${day}`
}

function daysUntil(d) {
  if (!d) return null
  const target = new Date(d)
  if (isNaN(target)) return null
  const now = new Date()
  now.setHours(0,0,0,0)
  target.setHours(0,0,0,0)
  return Math.round((target - now) / (1000*60*60*24))
}

export default function NLQueryInput({ result, loading, onQuery }) {
  const [query, setQuery] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (query.trim()) onQuery(query.trim())
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-ink-tertiary dark:text-slate-400">
        用自然语言查询申请数据
      </p>

      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="例如：哪些学生的申请快到截止日了？"
          className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-surface-3 dark:border-slate-600 bg-white dark:bg-slate-800 text-ink-primary dark:text-slate-100 placeholder:text-ink-tertiary dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
        />
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary dark:text-slate-400" />
        {loading && <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-brand-600" />}
      </form>

      {/* Example Queries */}
      {!result && !loading && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-ink-tertiary dark:text-slate-500">试试这些：</p>
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => { setQuery(ex); onQuery(ex) }}
              className="block w-full text-left text-[11px] text-brand-600 dark:text-brand-400 hover:underline py-0.5"
            >
              &ldquo;{ex}&rdquo;
            </button>
          ))}
        </div>
      )}

      {/* Result */}
      {result?.error && (
        <p className="text-[11px] text-red-500">{result.error}</p>
      )}

      {result?.explanation && (
        <div className="p-2 rounded-lg bg-brand-50/50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800">
          <p className="text-[11px] text-brand-700 dark:text-brand-300 flex items-start gap-1">
            <Sparkles size={11} className="mt-0.5 flex-shrink-0" />
            <span>{result.explanation}</span>
          </p>
        </div>
      )}

      {result?.filters && (
        <div className="flex flex-wrap gap-1">
          {result.filters.tier && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-2 dark:bg-slate-700 text-ink-secondary dark:text-slate-300">
              梯度: {result.filters.tier}
            </span>
          )}
          {result.filters.status && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-2 dark:bg-slate-700 text-ink-secondary dark:text-slate-300">
              状态: {statusLabels[result.filters.status] || result.filters.status}
            </span>
          )}
          {result.filters.route && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-2 dark:bg-slate-700 text-ink-secondary dark:text-slate-300">
              路线: {result.filters.route}
            </span>
          )}
          {result.filters.cycle_year && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-2 dark:bg-slate-700 text-ink-secondary dark:text-slate-300">
              周期: {result.filters.cycle_year}
            </span>
          )}
          {result.filters.uni_names?.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-2 dark:bg-slate-700 text-ink-secondary dark:text-slate-300">
              院校: {result.filters.uni_names.length}所
            </span>
          )}
        </div>
      )}

      {result?.results && (
        <div className="space-y-1">
          <p className="text-[10px] text-ink-tertiary dark:text-slate-500">
            找到 {result.results.length} 条结果
          </p>
          <div className="max-h-[300px] overflow-y-auto space-y-1.5 scrollbar-thin">
            {result.results.map((app, i) => {
              const days = daysUntil(app.submit_deadline)
              const isUrgent = days !== null && days >= 0 && days <= 14
              const isOverdue = days !== null && days < 0

              return (
                <motion.div
                  key={app.id || i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="p-2 rounded-lg border border-surface-2 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors"
                >
                  {/* Row 1: uni name + status */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-medium text-[11px] text-ink-primary dark:text-slate-200 truncate flex-1">
                      {app.uni_name}
                    </span>
                    <Badge color={statusColors[app.status] || 'default'} className="text-[9px] flex-shrink-0">
                      {statusLabels[app.status] || app.status || '未知'}
                    </Badge>
                  </div>

                  {/* Row 2: department */}
                  {app.department && (
                    <p className="text-[10px] text-ink-secondary dark:text-slate-400 truncate mb-1">
                      {app.department}
                    </p>
                  )}

                  {/* Row 3: metadata tags */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Student */}
                    <span className="text-[9px] text-ink-tertiary dark:text-slate-500 flex items-center gap-0.5">
                      <GraduationCap size={9} />
                      {app.student_name}
                    </span>

                    {/* Tier */}
                    {app.tier && (
                      <span className={`text-[9px] px-1 py-px rounded ${tierColors[app.tier] || 'text-ink-tertiary bg-surface-2'}`}>
                        {app.tier}
                      </span>
                    )}

                    {/* Route */}
                    {app.route && (
                      <span className="text-[9px] px-1 py-px rounded bg-surface-2 dark:bg-slate-700 text-ink-tertiary dark:text-slate-400">
                        {app.route}
                      </span>
                    )}

                    {/* Deadline */}
                    {app.submit_deadline && (
                      <span className={`text-[9px] flex items-center gap-0.5 ml-auto ${
                        isOverdue ? 'text-red-500 font-medium' :
                        isUrgent ? 'text-amber-600 dark:text-amber-400 font-medium' :
                        'text-ink-tertiary dark:text-slate-500'
                      }`}>
                        <Calendar size={9} />
                        {formatDate(app.submit_deadline)}
                        {isOverdue && ` (逾期${Math.abs(days)}天)`}
                        {isUrgent && ` (${days}天后)`}
                      </span>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
