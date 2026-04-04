import { useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { clsx } from 'clsx'
import { GraduationCap, Clock, User, FileText, AlertTriangle } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.jsx'
import { deadlineStatus } from '../../lib/dateUtils.js'

const tierLabels = { '冲刺': '冲刺', '意向': '意向', '保底': '保底', reach: '冲刺', target: '意向', safety: '保底' }
const tierColors = { '冲刺': 'red', '意向': 'amber', '保底': 'green', reach: 'red', target: 'amber', safety: 'green' }

const essayRiskColors = { red: 'text-red-500', orange: 'text-amber-500', yellow: 'text-yellow-500' }
const essayRiskLabels = { red: '文书滞后', orange: '文书待跟进', yellow: '文书注意' }

// Mini ring chart for health score (0-100)
function HealthRing({ score, size = 24 }) {
  const r = (size - 4) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference - (score / 100) * circumference
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={2} className="text-surface-2 dark:text-slate-700" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={2}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fontSize={8} fontWeight="bold" fill={color}>
        {score}
      </text>
    </svg>
  )
}

export default function KanbanCard({ app, isDragging = false, health }) {
  const { attributes, listeners, setNodeRef, isDragging: isBeingDragged } = useDraggable({
    id: String(app.id),
  })
  const hasDragged = useRef(false)
  const role = window.__ROLE__
  const isMentor = role === 'mentor'

  const { days: daysUntilDeadline, isUrgent, isOverdue } = deadlineStatus(app.submit_deadline)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(!isMentor ? listeners : {})}
      role="listitem"
      aria-label={`${app.student_name || '未知学生'} - ${app.uni_name || '未知院校'}${app.tier ? ` (${tierLabels[app.tier] || app.tier})` : ''}${isOverdue ? ' 已逾期' : isUrgent ? ' 即将截止' : ''}`}
      onPointerDown={() => { hasDragged.current = false }}
      onPointerMove={() => { hasDragged.current = true }}
      onClick={(e) => {
        if (!hasDragged.current && !isBeingDragged) {
          window.location.hash = 'student-detail/' + app.student_id
        }
      }}
      className={clsx(
        isMentor
          ? 'rounded-lg border p-3 sm:p-2.5 cursor-pointer'
          : 'rounded-lg border p-3 sm:p-2.5 cursor-grab active:cursor-grabbing',
        'hover:shadow-md transition-all duration-150',
        isDragging
          ? 'shadow-lg border-brand-500/40 ring-2 ring-brand-500/20 bg-white dark:bg-slate-800'
          : isBeingDragged
            ? 'opacity-30 border-dashed border-brand-400 bg-brand-50/30 dark:bg-slate-700/30'
            : 'bg-white dark:bg-slate-800 border-surface-3 dark:border-slate-700 shadow-sm',
        !isBeingDragged && isOverdue && 'border-l-2 border-l-red-500',
        !isBeingDragged && isUrgent && !isOverdue && 'border-l-2 border-l-amber-500',
      )}
    >
      {/* Top row: University + Health Ring */}
      <div className="flex items-start gap-1.5 mb-1.5">
        <GraduationCap size={12} className="text-ink-tertiary dark:text-slate-400 mt-0.5 flex-shrink-0" />
        <span className="text-[11px] sm:text-xs font-semibold text-ink-primary dark:text-slate-100 line-clamp-2 leading-tight flex-1">
          {app.uni_name || '未知院校'}
        </span>
        {health && health.total > 0 && (
          <HealthRing score={health.total} />
        )}
      </div>

      {/* Department / Program */}
      {(app.department || app.program) && (
        <p className="text-[10px] text-ink-tertiary dark:text-slate-400 truncate mb-1.5 ml-[18px]">
          {app.department || app.program}
        </p>
      )}

      {/* Tags row: tier + route + essay risk + admission prob */}
      <div className="flex items-center gap-1 flex-wrap mb-1.5">
        {app.tier && (
          <Badge color={tierColors[app.tier]} className="text-[9px] px-1.5 py-0">
            {tierLabels[app.tier] || app.tier}
          </Badge>
        )}
        {app.route && (
          <Badge color="purple" className="text-[9px] px-1.5 py-0">
            {app.route}
          </Badge>
        )}
        {health?.essayRisk && health.essayRisk !== 'none' && (
          <span className={clsx('inline-flex items-center gap-0.5 text-[9px] font-medium', essayRiskColors[health.essayRisk])}>
            <FileText size={9} />
            {essayRiskLabels[health.essayRisk]}
          </span>
        )}
        {health?.eval?.prob_mid != null && (
          <span className="text-[9px] font-medium text-brand-600 dark:text-brand-400 ml-auto">
            {Math.round(health.eval.prob_mid * 100)}%
          </span>
        )}
      </div>

      {/* Health bar (compact) */}
      {health && health.total > 0 && (
        <div className="flex gap-0.5 mb-1.5 h-1 rounded-full overflow-hidden bg-surface-2 dark:bg-slate-700">
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${health.ps.score * 4}%` }} title={`文书 ${health.ps.status}`} />
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${health.materials.score * 4}%` }} title={`材料 ${health.materials.done}/${health.materials.total}`} />
          <div className="h-full bg-purple-500 transition-all" style={{ width: `${health.tasks.score * 4}%` }} title={`任务 ${health.tasks.done}/${health.tasks.total}`} />
          <div className="h-full bg-amber-500 transition-all" style={{ width: `${health.eval.score * 4}%` }} title={`评估 ${health.eval.prob_mid ? Math.round(health.eval.prob_mid * 100) + '%' : '无'}`} />
        </div>
      )}

      {/* Footer: Student + Deadline */}
      <div className="flex items-center justify-between text-[11px] sm:text-[10px] text-ink-tertiary dark:text-slate-500">
        {app.student_name && (
          <span className="flex items-center gap-0.5 truncate max-w-[60%]">
            <User size={10} />
            {app.student_name}
          </span>
        )}
        {app.submit_deadline && (
          <span className={clsx(
            'flex items-center gap-0.5 tabular-nums',
            isOverdue && 'text-red-500 font-semibold',
            isUrgent && !isOverdue && 'text-amber-600 font-semibold',
          )}>
            <Clock size={10} />
            {app.submit_deadline.slice(0, 10)}
          </span>
        )}
      </div>
    </div>
  )
}
