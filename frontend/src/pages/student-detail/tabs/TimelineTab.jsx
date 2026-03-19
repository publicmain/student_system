import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Circle, Clock, AlertCircle, Plus, Trash2, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../../../lib/api.js'
import { Button } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'

function isOverdue(dueDate, status) {
  if (!dueDate || status === 'done') return false
  return dueDate.slice(0, 10) < new Date().toLocaleDateString('sv')
}

const statusConfig = {
  done:    { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', label: '已完成' },
  pending: { icon: Circle,       color: 'text-ink-tertiary', bg: 'bg-surface-2 dark:bg-slate-700', label: '待办' },
  overdue: { icon: AlertCircle,  color: 'text-red-500',   bg: 'bg-red-50 dark:bg-red-900/20',   label: '已逾期' },
}

function TaskItem({ task, studentId, onRefresh, canEdit }) {
  const [busy, setBusy] = useState(false)
  const overdue = isOverdue(task.due_date, task.status)
  const cfg = task.status === 'done' ? statusConfig.done : overdue ? statusConfig.overdue : statusConfig.pending
  const Icon = cfg.icon

  async function toggleDone() {
    setBusy(true)
    try { await api.task.done(task.id, task.status !== 'done'); onRefresh() }
    catch (e) { console.error(e) }
    finally { setBusy(false) }
  }

  async function remove() {
    if (!confirm('确认删除此任务？')) return
    setBusy(true)
    try { await api.task.delete(task.id); onRefresh() }
    catch (e) { console.error(e) }
    finally { setBusy(false) }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      className={clsx(
        'group/task flex items-start gap-3 p-3.5 rounded-card border transition-all duration-base',
        task.status === 'done'
          ? 'border-surface-2 bg-surface-0 dark:bg-slate-800/40 opacity-60'
          : overdue
            ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-900/10'
            : 'border-surface-2 bg-white dark:bg-slate-800 hover:border-surface-3 hover:shadow-card',
      )}
    >
      {/* 状态切换按钮 */}
      <button
        onClick={toggleDone}
        disabled={busy || !canEdit}
        className={clsx('mt-0.5 flex-shrink-0 transition-colors duration-fast', cfg.color,
          canEdit && 'hover:scale-110')}
      >
        <Icon size={18} className={busy ? 'animate-pulse' : ''} />
      </button>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <p className={clsx('text-sm font-medium', task.status === 'done' && 'line-through text-ink-tertiary dark:text-slate-500')}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-ink-tertiary mt-0.5 line-clamp-2">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {task.category && <Badge color="default">{task.category}</Badge>}
          {task.due_date && (
            <span className={clsx('flex items-center gap-1 text-xs', overdue ? 'text-red-500' : 'text-ink-tertiary')}>
              <Clock size={10} />{task.due_date.slice(0, 10)}
              {overdue && ' · 已逾期'}
            </span>
          )}
        </div>
      </div>

      {/* 删除 */}
      {canEdit && (
        <button
          onClick={remove}
          disabled={busy}
          className="opacity-0 group-hover/task:opacity-100 text-ink-tertiary hover:text-red-500 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-fast flex-shrink-0"
        >
          <Trash2 size={13} />
        </button>
      )}
    </motion.div>
  )
}

export function TimelineTab({ tasks = [], studentId, canEdit, onRefresh }) {
  const [expanded, setExpanded] = useState({})

  // 按 category 分组
  const groups = tasks.reduce((acc, t) => {
    const g = t.category || '其他'
    if (!acc[g]) acc[g] = []
    acc[g].push(t)
    return acc
  }, {})

  const pending = tasks.filter(t => t.status !== 'done').length
  const done    = tasks.filter(t => t.status === 'done').length

  return (
    <div className="space-y-6">
      {/* 摘要栏 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-ink-secondary">
          <span className="font-semibold text-ink-primary">{tasks.length}</span> 个任务
        </div>
        <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <CheckCircle2 size={12} /> {done} 已完成
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-tertiary">
          <Circle size={12} /> {pending} 待办
        </div>
        {canEdit && (
          <Button variant="primary" icon={Plus} size="sm" className="ml-auto">
            添加任务
          </Button>
        )}
      </div>

      {/* 进度条 */}
      {tasks.length > 0 && (
        <div>
          <div className="flex justify-between text-xs text-ink-tertiary mb-1.5">
            <span>完成进度</span>
            <span>{Math.round((done / tasks.length) * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 dark:bg-slate-700 overflow-hidden">
            <motion.div
              className="h-full bg-green-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(done / tasks.length) * 100}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* 分组列表 */}
      {tasks.length === 0 ? (
        <EmptyState icon={CheckCircle2} label='暂无任务，点击"添加任务"创建' />
      ) : (
        Object.entries(groups).map(([group, items]) => {
          const open = expanded[group] !== false // 默认展开
          return (
            <div key={group}>
              {/* 分组标题 */}
              <button
                onClick={() => setExpanded(e => ({ ...e, [group]: !open }))}
                className="flex items-center gap-2 w-full mb-3 group/header"
              >
                <span className="text-xs font-semibold text-ink-tertiary uppercase tracking-wider">{group}</span>
                <span className="text-xs text-ink-tertiary">({items.length})</span>
                <div className="flex-1 h-px bg-surface-2 dark:bg-slate-700 mx-2" />
                <ChevronDown
                  size={13}
                  className={clsx('text-ink-tertiary transition-transform duration-fast', !open && '-rotate-90')}
                />
              </button>

              <AnimatePresence>
                {open && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    {items.map(t => (
                      <TaskItem key={t.id} task={t} studentId={studentId}
                        onRefresh={onRefresh} canEdit={canEdit} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })
      )}
    </div>
  )
}
