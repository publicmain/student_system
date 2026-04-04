import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Loader2, Sparkles } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.jsx'

const examples = [
  '所有冲刺申请的截止日',
  '哪些学生还没提交申请',
  'UCL 的申请状态',
  '2025年有哪些Offer',
]

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
          {examples.map((ex, i) => (
            <button
              key={i}
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
          <p className="text-[11px] text-brand-700 dark:text-brand-300 flex items-center gap-1">
            <Sparkles size={11} />
            {result.explanation}
          </p>
        </div>
      )}

      {result?.results && (
        <div className="space-y-1">
          <p className="text-[10px] text-ink-tertiary dark:text-slate-500">
            找到 {result.results.length} 条结果
          </p>
          <div className="max-h-[300px] overflow-y-auto space-y-1 scrollbar-thin">
            {result.results.map((app, i) => (
              <motion.div
                key={app.id || i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="flex items-center gap-2 p-1.5 rounded-md border border-surface-2 dark:border-slate-700 text-[11px]"
              >
                <span className="font-medium text-ink-primary dark:text-slate-200 truncate flex-1">
                  {app.uni_name}
                </span>
                <span className="text-ink-tertiary dark:text-slate-400 truncate text-[10px]">
                  {app.student_name}
                </span>
                <Badge color="default" className="text-[9px] flex-shrink-0">
                  {app.status || '未知'}
                </Badge>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
