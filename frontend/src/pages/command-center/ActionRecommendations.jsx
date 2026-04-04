import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { Loader2, Sparkles, ArrowRight, User } from 'lucide-react'

export default function ActionRecommendations({ actions, loading, onFetch }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-ink-tertiary dark:text-slate-400">
          AI 为每位学生推荐最紧急的下一步操作
        </p>
        <button
          onClick={onFetch}
          disabled={loading}
          className="inline-flex items-center gap-1 text-[10px] text-brand-600 hover:text-brand-700 disabled:opacity-50"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          {loading ? '生成中...' : '获取建议'}
        </button>
      </div>

      {actions?.error && (
        <p className="text-[11px] text-red-500">{actions.error}</p>
      )}

      {actions?.actions && (
        <div className="space-y-2">
          {actions.actions.map((rec, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="p-2.5 rounded-lg border border-surface-3 dark:border-slate-700 bg-surface-0/50 dark:bg-slate-800/50"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <User size={11} className="text-ink-tertiary dark:text-slate-400" />
                <span className="text-[11px] font-semibold text-ink-primary dark:text-slate-200">
                  {rec.student_name}
                </span>
              </div>
              <div className="flex items-start gap-1.5 ml-[17px]">
                <ArrowRight size={11} className="text-brand-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] text-ink-primary dark:text-slate-200 font-medium">
                    {rec.action}
                  </p>
                  {rec.reasoning && (
                    <p className="text-[10px] text-ink-tertiary dark:text-slate-400 mt-0.5">
                      {rec.reasoning}
                    </p>
                  )}
                  {rec.urgency && (
                    <span className={clsx(
                      'inline-block text-[9px] font-medium mt-1 px-1.5 py-0.5 rounded-full',
                      rec.urgency === 'high'   ? 'bg-red-50 text-red-600 dark:bg-red-900/20'   :
                      rec.urgency === 'medium'  ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20' :
                                                  'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    )}>
                      {rec.urgency === 'high' ? '紧急' : rec.urgency === 'medium' ? '中等' : '一般'}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {!actions && !loading && (
        <div className="text-center py-8 text-ink-tertiary dark:text-slate-500">
          <Sparkles size={24} className="mx-auto mb-2 opacity-40" />
          <p className="text-[11px]">点击上方按钮获取 AI 行动建议</p>
        </div>
      )}
    </div>
  )
}
