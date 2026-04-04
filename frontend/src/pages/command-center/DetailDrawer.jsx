import { motion, AnimatePresence } from 'framer-motion'
import { clsx } from 'clsx'
import { X, ExternalLink, GraduationCap, User, Clock, MapPin, FileText } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.jsx'
import { deadlineStatus } from '../../lib/dateUtils.js'

const statusMap = {
  pending: '准备中', draft: '草稿', applied: '已提交', submitted: '已提交',
  offer: 'Offer', conditional_offer: '有条件录取', unconditional_offer: '无条件录取',
  offer_received: '收到录取', accepted: '已接受', firm: 'Firm', insurance: 'Insurance',
  enrolled: '已入学', declined: '已拒绝', rejected: '被拒绝', withdrawn: '已撤回', waitlisted: '等候名单',
}

const statusColors = {
  pending: 'slate', draft: 'slate', applied: 'blue', submitted: 'blue',
  offer: 'green', conditional_offer: 'green', unconditional_offer: 'green',
  offer_received: 'green', accepted: 'green', firm: 'purple', insurance: 'purple',
  enrolled: 'green', declined: 'red', rejected: 'red', withdrawn: 'default', waitlisted: 'amber',
}

const tierLabels = { reach: '冲刺', target: '匹配', safety: '保底', '冲刺': '冲刺', '意向': '意向', '保底': '保底' }
const tierColors = { reach: 'red', target: 'amber', safety: 'green', '冲刺': 'red', '意向': 'amber', '保底': 'green' }

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-surface-1 dark:border-slate-700/50">
      <span className="text-[11px] text-ink-tertiary dark:text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-[11px] text-ink-primary dark:text-slate-200 text-right">{value}</span>
    </div>
  )
}

export default function DetailDrawer({ app, health, onClose }) {
  const { days, isUrgent, isOverdue } = app ? deadlineStatus(app.submit_deadline) : { days: null, isUrgent: false, isOverdue: false }

  return (
    <AnimatePresence>
      {app && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-40"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-y-0 right-0 z-50 w-[90vw] max-w-[400px] bg-white dark:bg-slate-800 border-l border-surface-3 dark:border-slate-700 shadow-xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-2 dark:border-slate-700">
              <span className="text-sm font-bold text-ink-primary dark:text-slate-100 truncate">
                申请详情
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { window.location.hash = 'student-detail/' + app.student_id }}
                  className="p-1.5 rounded-md text-ink-tertiary hover:text-brand-600 hover:bg-surface-2 dark:hover:bg-slate-700 transition-colors"
                  title="打开学生详情"
                >
                  <ExternalLink size={14} />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-md text-ink-tertiary hover:bg-surface-2 dark:hover:bg-slate-700 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* University + Program */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <GraduationCap size={16} className="text-brand-600" />
                  <h3 className="text-sm font-bold text-ink-primary dark:text-slate-100">
                    {app.uni_name || '未知院校'}
                  </h3>
                </div>
                {(app.department || app.program) && (
                  <p className="text-xs text-ink-secondary dark:text-slate-300 ml-6">
                    {app.department || app.program}
                  </p>
                )}
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge color={statusColors[app.status] || 'default'}>
                  {statusMap[app.status] || app.status}
                </Badge>
                {app.tier && (
                  <Badge color={tierColors[app.tier] || 'default'}>
                    {tierLabels[app.tier] || app.tier}
                  </Badge>
                )}
                {app.route && <Badge color="purple">{app.route}</Badge>}
                {app.cycle_year && <Badge color="default">{app.cycle_year}</Badge>}
              </div>

              {/* Details */}
              <div className="bg-surface-0 dark:bg-slate-800/50 rounded-lg p-3">
                <InfoRow label="学生" value={app.student_name} />
                <InfoRow label="截止日期" value={app.submit_deadline?.slice(0, 10)} />
                {app.submit_deadline && (
                  <InfoRow
                    label="距截止日"
                    value={(() => {
                      const d = daysUntilDeadline(app.submit_deadline)
                      if (d === null) return null
                      if (d < 0) return `逾期 ${Math.abs(d)} 天`
                      return `${d} 天`
                    })()}
                  />
                )}
                <InfoRow label="Offer类型" value={app.offer_type} />
                <InfoRow label="周期" value={app.cycle_year} />
              </div>

              {/* Health Score */}
              {health && health.total > 0 && (
                <div className="bg-surface-0 dark:bg-slate-800/50 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-ink-primary dark:text-slate-200 mb-2">健康分数</h4>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={clsx(
                      'text-2xl font-bold',
                      health.total >= 70 ? 'text-emerald-600' : health.total >= 40 ? 'text-amber-600' : 'text-red-500'
                    )}>
                      {health.total}
                    </div>
                    <span className="text-xs text-ink-tertiary dark:text-slate-400">/ 100</span>
                  </div>
                  <div className="space-y-1.5">
                    <HealthBar label="文书" score={health.ps?.score} color="blue" detail={health.ps?.status} />
                    <HealthBar label="材料" score={health.materials?.score} color="emerald" detail={`${health.materials?.done || 0}/${health.materials?.total || 0}`} />
                    <HealthBar label="任务" score={health.tasks?.score} color="purple" detail={`${health.tasks?.done || 0}/${health.tasks?.total || 0}`} />
                    <HealthBar label="评估" score={health.eval?.score} color="amber" detail={health.eval?.prob_mid ? `${Math.round(health.eval.prob_mid * 100)}%` : '无'} />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function HealthBar({ label, score, color, detail }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-ink-tertiary dark:text-slate-400 w-8">{label}</span>
      <div className="flex-1 h-1.5 bg-surface-2 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', `bg-${color}-500`)}
          style={{ width: `${score || 0}%` }}
        />
      </div>
      <span className="text-[10px] text-ink-tertiary dark:text-slate-400 w-10 text-right">{detail}</span>
    </div>
  )
}
