import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { AlertTriangle, AlertCircle, Info, Loader2, Sparkles } from 'lucide-react'

const severityConfig = {
  critical: { icon: AlertCircle,   color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20',    border: 'border-red-200 dark:border-red-800' },
  high:     { icon: AlertTriangle, color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800' },
  medium:   { icon: Info,          color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20',   border: 'border-blue-200 dark:border-blue-800' },
  low:      { icon: Info,          color: 'text-slate-500',  bg: 'bg-slate-50 dark:bg-slate-800',    border: 'border-slate-200 dark:border-slate-700' },
}

export default function RiskAlertList({ sqlAlerts, aiRisks, loading, onFetchAI }) {
  return (
    <div className="space-y-3">
      {/* SQL-based alerts */}
      <div>
        <h4 className="text-[11px] font-semibold text-ink-secondary dark:text-slate-300 mb-2">
          系统检测 ({sqlAlerts.length})
        </h4>
        {sqlAlerts.length === 0 ? (
          <p className="text-[11px] text-ink-tertiary dark:text-slate-500 py-4 text-center">
            暂无风险预警
          </p>
        ) : (
          <div className="space-y-1.5">
            {sqlAlerts.slice(0, 20).map((alert, i) => {
              const cfg = severityConfig[alert.severity] || severityConfig.low
              const Icon = cfg.icon
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={clsx(
                    'flex items-start gap-2 p-2 rounded-lg border text-[11px]',
                    cfg.bg, cfg.border
                  )}
                >
                  <Icon size={13} className={clsx(cfg.color, 'flex-shrink-0 mt-0.5')} />
                  <span className="text-ink-primary dark:text-slate-200 leading-relaxed">
                    {alert.message}
                  </span>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* AI Enhanced Analysis */}
      <div className="border-t border-surface-2 dark:border-slate-700 pt-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-semibold text-ink-secondary dark:text-slate-300">
            AI 深度分析
          </h4>
          <button
            onClick={onFetchAI}
            disabled={loading}
            className="inline-flex items-center gap-1 text-[10px] text-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {loading ? '分析中...' : '开始分析'}
          </button>
        </div>

        {aiRisks?.error && (
          <p className="text-[11px] text-red-500 py-2">{aiRisks.error}</p>
        )}

        {aiRisks?.alerts && (
          <div className="space-y-1.5">
            {aiRisks.alerts.map((risk, i) => (
              <div key={i} className={clsx(
                'p-2 rounded-lg border text-[11px]',
                risk.severity === 'high' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : risk.severity === 'medium' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              )}>
                <p className="font-medium text-ink-primary dark:text-slate-200">{risk.reason}</p>
                <p className="text-brand-600 dark:text-brand-400 mt-0.5">{risk.suggestion}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
