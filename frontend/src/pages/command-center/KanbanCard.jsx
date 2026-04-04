import { useDraggable } from '@dnd-kit/core'
import { clsx } from 'clsx'
import { GraduationCap, Clock, User } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.jsx'

const tierLabels = { '冲刺': '冲刺', '意向': '意向', '保底': '保底', reach: '冲刺', target: '意向', safety: '保底' }
const tierColors = { '冲刺': 'red', '意向': 'amber', '保底': 'green', reach: 'red', target: 'amber', safety: 'green' }

export default function KanbanCard({ app, isDragging = false }) {
  const { attributes, listeners, setNodeRef, isDragging: isBeingDragged } = useDraggable({
    id: String(app.id),
  })

  const daysUntilDeadline = (() => {
    if (!app.submit_deadline) return null
    const d = new Date(app.submit_deadline)
    if (isNaN(d.getTime())) return null
    return Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24))
  })()

  const isUrgent = daysUntilDeadline !== null && daysUntilDeadline <= 7 && daysUntilDeadline >= 0
  const isOverdue = daysUntilDeadline !== null && daysUntilDeadline < 0

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={clsx(
        'rounded-lg border p-2.5 cursor-grab active:cursor-grabbing',
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
      {/* University */}
      <div className="flex items-start gap-1.5 mb-1.5">
        <GraduationCap size={12} className="text-ink-tertiary dark:text-slate-400 mt-0.5 flex-shrink-0" />
        <span className="text-xs font-semibold text-ink-primary dark:text-slate-100 line-clamp-2 leading-tight">
          {app.uni_name || '未知院校'}
        </span>
      </div>

      {/* Department / Program */}
      {(app.department || app.program) && (
        <p className="text-[10px] text-ink-tertiary dark:text-slate-400 truncate mb-1.5 ml-[18px]">
          {app.department || app.program}
        </p>
      )}

      {/* Tags row */}
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
      </div>

      {/* Footer: Student + Deadline */}
      <div className="flex items-center justify-between text-[10px] text-ink-tertiary dark:text-slate-500">
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
