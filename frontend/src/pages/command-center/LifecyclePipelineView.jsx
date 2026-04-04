import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { Check, Plane, BookOpen, Stamp, MapPin, GraduationCap } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.jsx'

const stageIcons = {
  offer: GraduationCap,
  confirm: Check,
  visa: Stamp,
  arrival: Plane,
  enrolled: BookOpen,
}

const stageColors = {
  done: 'bg-emerald-500 text-white',
  active: 'bg-brand-500 text-white animate-pulse',
  pending: 'bg-surface-2 dark:bg-slate-700 text-ink-tertiary dark:text-slate-500',
}

export default function LifecyclePipelineView({ pipelines }) {
  if (!pipelines || pipelines.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 sm:py-16 text-ink-tertiary dark:text-slate-500 text-xs sm:text-sm px-4 text-center">
        暂无进入后续流程的申请（需 accepted/firm/insurance/enrolled 状态）
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {pipelines.map((p, i) => (
        <motion.div
          key={p.app_id}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
          className="rounded-xl border border-surface-3 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 sm:p-4"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs sm:text-sm font-semibold text-ink-primary dark:text-slate-100 truncate">
                {p.student_name}
              </span>
              <span className="text-[10px] sm:text-xs text-ink-tertiary dark:text-slate-400 truncate hidden sm:inline">
                {p.uni_name} {p.department ? `- ${p.department}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] text-ink-tertiary dark:text-slate-400 truncate sm:hidden">
                {p.uni_name}
              </span>
              <span className="sm:hidden flex-1" />
              {p.route && <Badge color="purple" className="text-[9px]">{p.route}</Badge>}
              <Badge color={p.status === 'enrolled' ? 'green' : 'blue'} className="text-[9px]">
                {p.status}
              </Badge>
            </div>
          </div>

          {/* Pipeline stages — horizontal on sm+, compact horizontal on mobile */}
          <div className="flex items-center gap-0 overflow-x-auto scrollbar-thin">
            {p.stages.map((stage, si) => {
              const Icon = stageIcons[stage.id] || Check
              const state = stage.done ? 'done' : stage.active ? 'active' : 'pending'

              return (
                <div key={stage.id} className="flex items-center flex-1 min-w-0">
                  {/* Stage node */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div className={clsx(
                      'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all',
                      stageColors[state],
                    )}>
                      <Icon size={12} className="sm:hidden" />
                      <Icon size={14} className="hidden sm:block" />
                    </div>
                    <span className={clsx(
                      'text-[9px] sm:text-[10px] font-medium whitespace-nowrap',
                      state === 'done' ? 'text-emerald-600 dark:text-emerald-400' :
                      state === 'active' ? 'text-brand-600 dark:text-brand-400' :
                      'text-ink-tertiary dark:text-slate-500'
                    )}>
                      {stage.label}
                    </span>
                  </div>

                  {/* Connector line */}
                  {si < p.stages.length - 1 && (
                    <div className={clsx(
                      'flex-1 h-0.5 mx-0.5 sm:mx-1 min-w-[8px]',
                      stage.done ? 'bg-emerald-400' : 'bg-surface-2 dark:bg-slate-700',
                    )} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Extra info row */}
          {(p.visa || p.arrival) && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-3 text-[10px] text-ink-tertiary dark:text-slate-500 border-t border-surface-2 dark:border-slate-700 pt-2">
              {p.visa && (
                <span className="flex items-center gap-1">
                  <Stamp size={10} />
                  签证: {p.visa.status}
                  {p.visa.appointment && ` (${p.visa.appointment.slice(0, 10)})`}
                </span>
              )}
              {p.arrival && (
                <span className="flex items-center gap-1">
                  <MapPin size={10} />
                  {p.arrival.date ? `到达: ${p.arrival.date.slice(0, 10)}` : '待到达'}
                  {p.arrival.accommodation && ` | 住宿: ${p.arrival.accommodation}`}
                </span>
              )}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  )
}
