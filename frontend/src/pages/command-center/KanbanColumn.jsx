import { useDroppable } from '@dnd-kit/core'
import { clsx } from 'clsx'
import KanbanCard from './KanbanCard.jsx'

const columnColors = {
  slate:   'border-t-slate-400',
  blue:    'border-t-blue-500',
  green:   'border-t-emerald-500',
  purple:  'border-t-purple-500',
  brand:   'border-t-brand-600',
  red:     'border-t-red-500',
  amber:   'border-t-amber-500',
  emerald: 'border-t-emerald-500',
}

const dotColors = {
  slate:   'bg-slate-400',
  blue:    'bg-blue-500',
  green:   'bg-emerald-500',
  purple:  'bg-purple-500',
  brand:   'bg-brand-600',
  red:     'bg-red-500',
  amber:   'bg-amber-500',
  emerald: 'bg-emerald-500',
}

export default function KanbanColumn({ column, index, healthMap, activeId }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'flex-shrink-0 w-[75vw] sm:w-auto sm:flex-1 sm:min-w-[160px] sm:max-w-[280px] flex flex-col rounded-xl border-t-[3px] bg-surface-0/50 dark:bg-slate-800/50',
        'border border-surface-3 dark:border-slate-700',
        'snap-center animate-fadeIn',
        columnColors[column.color] || 'border-t-slate-400',
        isOver && 'ring-2 ring-brand-500/30 bg-brand-50/30 dark:bg-brand-900/10',
        'transition-all duration-150'
      )}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-surface-2 dark:border-slate-700">
        <span className={clsx('w-2 h-2 rounded-full', dotColors[column.color] || 'bg-slate-400')} />
        <span className="text-xs font-semibold text-ink-primary dark:text-slate-200">{column.label}</span>
        <span className="ml-auto text-[10px] font-bold text-ink-tertiary dark:text-slate-500 bg-surface-2 dark:bg-slate-700 rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
          {column.apps.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin min-h-[100px]">
        {column.apps.length === 0 ? (
          <div className="text-[10px] text-ink-tertiary dark:text-slate-500 text-center py-6">
            拖拽卡片到此列
          </div>
        ) : (
          column.apps.map(app => (
            <KanbanCard key={app.id} app={app} health={healthMap?.[app.id]} />
          ))
        )}
      </div>
    </div>
  )
}
