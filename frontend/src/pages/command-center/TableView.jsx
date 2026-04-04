import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { clsx } from 'clsx'
import { ArrowUpDown, ArrowUp, ArrowDown, Clock, GraduationCap, User, CheckSquare, Square, X } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.jsx'
import { daysUntilDeadline } from '../../lib/dateUtils.js'
import { api } from '../../lib/api.js'

const statusMap = {
  pending:              { label: '准备中',     color: 'slate'  },
  draft:                { label: '草稿',       color: 'slate'  },
  applied:              { label: '已提交',     color: 'blue'   },
  submitted:            { label: '已提交',     color: 'blue'   },
  offer:                { label: 'Offer',      color: 'green'  },
  conditional_offer:    { label: '有条件录取', color: 'green'  },
  unconditional_offer:  { label: '无条件录取', color: 'green'  },
  offer_received:       { label: '收到录取',   color: 'green'  },
  accepted:             { label: '已接受',     color: 'green'  },
  firm:                 { label: 'Firm',       color: 'purple' },
  insurance:            { label: 'Insurance',  color: 'purple' },
  enrolled:             { label: '已入学',     color: 'green'  },
  declined:             { label: '已拒绝',     color: 'red'    },
  rejected:             { label: '被拒绝',     color: 'red'    },
  withdrawn:            { label: '已撤回',     color: 'default'},
  waitlisted:           { label: '等候名单',   color: 'amber'  },
}

const batchStatusOptions = [
  { value: 'pending', label: '准备中' },
  { value: 'applied', label: '已提交' },
  { value: 'declined', label: '已拒绝' },
  { value: 'withdrawn', label: '已撤回' },
]

const tierMap = { '冲刺': { label: '冲刺', color: 'red' }, '意向': { label: '意向', color: 'amber' }, '保底': { label: '保底', color: 'green' }, reach: { label: '冲刺', color: 'red' }, target: { label: '意向', color: 'amber' }, safety: { label: '保底', color: 'green' } }

const columns = [
  { key: 'student_name', label: '学生',   sortable: true  },
  { key: 'uni_name',     label: '院校',   sortable: true  },
  { key: 'department',   label: '专业',   sortable: true  },
  { key: 'tier',         label: '梯度',   sortable: true  },
  { key: 'route',        label: '路线',   sortable: true  },
  { key: 'status',       label: '状态',   sortable: true  },
  { key: 'submit_deadline', label: '截止日', sortable: true },
  { key: 'cycle_year',   label: '周期',   sortable: true  },
]

export default function TableView({ apps, onStatusChange, readOnly, onRefresh, onRowClick }) {
  const [sortKey, setSortKey] = useState('submit_deadline')
  const [sortDir, setSortDir] = useState('asc')
  const [selected, setSelected] = useState(new Set())
  const [batchLoading, setBatchLoading] = useState(false)

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    const list = [...apps]
    list.sort((a, b) => {
      const va = a[sortKey] ?? ''
      const vb = b[sortKey] ?? ''
      let cmp
      if (sortKey === 'submit_deadline' || sortKey === 'cycle_year') {
        cmp = String(va).localeCompare(String(vb))
      } else {
        cmp = String(va).localeCompare(String(vb), 'zh')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [apps, sortKey, sortDir])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === sorted.length) setSelected(new Set())
    else setSelected(new Set(sorted.map(a => a.id)))
  }

  const handleBatchStatus = async (status) => {
    const ids = [...selected]
    if (!ids.length) return
    const label = statusMap[status]?.label || status
    if (!window.confirm(`确认将 ${ids.length} 个申请批量设为「${label}」？`)) return
    setBatchLoading(true)
    try {
      await api.commandCenter.batchStatus(ids, status)
      setSelected(new Set())
      onRefresh?.()
    } catch (e) {
      alert('批量操作失败: ' + e.message)
    } finally {
      setBatchLoading(false)
    }
  }

  const showBatch = !readOnly && selected.size > 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl border border-surface-3 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800"
    >
      {/* Batch action bar */}
      <AnimatePresence>
        {showBatch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 dark:bg-brand-900/20 border-b border-brand-200 dark:border-brand-800">
              <span className="text-xs font-medium text-brand-700 dark:text-brand-300">
                已选 {selected.size} 项
              </span>
              <div className="flex items-center gap-1">
                {batchStatusOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleBatchStatus(opt.value)}
                    disabled={batchLoading}
                    className="px-2 py-1 text-[11px] rounded-md bg-white dark:bg-slate-700 border border-surface-3 dark:border-slate-600 text-ink-secondary dark:text-slate-300 hover:border-brand-400 transition-colors disabled:opacity-50"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSelected(new Set())}
                className="ml-auto p-1 text-ink-tertiary hover:text-ink-primary transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface-0 dark:bg-slate-800/80 border-b border-surface-2 dark:border-slate-700">
              {!readOnly && (
                <th className="px-2 py-2.5 w-8">
                  <button onClick={toggleAll} className="text-ink-tertiary hover:text-ink-primary dark:hover:text-slate-200">
                    {selected.size === sorted.length && sorted.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
                  </button>
                </th>
              )}
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && toggleSort(col.key)}
                  className={clsx(
                    'px-3 py-2.5 text-left font-semibold text-ink-secondary dark:text-slate-300 whitespace-nowrap',
                    col.sortable && 'cursor-pointer hover:text-ink-primary dark:hover:text-slate-100 select-none'
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      sortKey === col.key
                        ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                        : <ArrowUpDown size={11} className="opacity-30" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (!readOnly ? 1 : 0)} className="px-3 py-12 text-center text-ink-tertiary dark:text-slate-500">
                  暂无申请数据
                </td>
              </tr>
            ) : (
              sorted.map(app => {
                const st = statusMap[app.status] || { label: app.status, color: 'default' }
                const ti = tierMap[app.tier]
                const deadline = app.submit_deadline ? app.submit_deadline.slice(0, 10) : '—'
                const daysLeft = daysUntilDeadline(app.submit_deadline)
                const isSelected = selected.has(app.id)

                return (
                  <tr
                    key={app.id}
                    className={clsx(
                      'border-b border-surface-2 dark:border-slate-700/50 hover:bg-surface-0 dark:hover:bg-slate-800/60 transition-colors cursor-pointer',
                      isSelected && 'bg-brand-50/50 dark:bg-brand-900/10',
                    )}
                  >
                    {!readOnly && (
                      <td className="px-2 py-2.5 w-8" onClick={(e) => { e.stopPropagation(); toggleSelect(app.id) }}>
                        <span className={clsx('text-ink-tertiary', isSelected && 'text-brand-600')}>
                          {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                        </span>
                      </td>
                    )}
                    <td onClick={() => onRowClick ? onRowClick(app) : (window.location.hash = 'student-detail/' + app.student_id)} className="px-3 py-2.5 font-medium text-ink-primary dark:text-slate-100 whitespace-nowrap">
                      {app.student_name || '—'}
                    </td>
                    <td onClick={() => onRowClick ? onRowClick(app) : (window.location.hash = 'student-detail/' + app.student_id)} className="px-3 py-2.5 text-ink-primary dark:text-slate-200 max-w-[180px] truncate">
                      {app.uni_name || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-ink-secondary dark:text-slate-300 max-w-[150px] truncate">
                      {app.department || app.program || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {ti ? <Badge color={ti.color}>{ti.label}</Badge> : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-ink-secondary dark:text-slate-300">
                      {app.route || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge color={st.color}>{st.label}</Badge>
                    </td>
                    <td className={clsx(
                      'px-3 py-2.5 tabular-nums whitespace-nowrap',
                      daysLeft !== null && daysLeft < 0 && 'text-red-500 font-semibold',
                      daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && 'text-amber-600 font-semibold',
                      daysLeft === null || daysLeft > 7 ? 'text-ink-secondary dark:text-slate-400' : ''
                    )}>
                      {deadline}
                      {daysLeft !== null && daysLeft >= 0 && daysLeft <= 21 && (
                        <span className="ml-1 text-[10px] opacity-70">({daysLeft}天)</span>
                      )}
                      {daysLeft !== null && daysLeft < 0 && (
                        <span className="ml-1 text-[10px]">(逾期{Math.abs(daysLeft)}天)</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ink-tertiary dark:text-slate-500">
                      {app.cycle_year || '—'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="sm:hidden divide-y divide-surface-2 dark:divide-slate-700">
        {/* Sort control */}
        <div className="flex items-center gap-2 px-3 py-2 bg-surface-0 dark:bg-slate-800/80">
          <span className="text-[10px] text-ink-tertiary dark:text-slate-400">排序:</span>
          <select
            value={sortKey}
            onChange={e => { setSortKey(e.target.value); setSortDir('asc') }}
            className="text-xs bg-transparent text-ink-primary dark:text-slate-200 border-none outline-none"
          >
            {columns.filter(c => c.sortable).map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="p-1 text-ink-tertiary">
            {sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          </button>
          <span className="ml-auto text-[10px] text-ink-tertiary dark:text-slate-500">{sorted.length} 条</span>
        </div>

        {sorted.length === 0 ? (
          <div className="px-3 py-10 text-center text-xs text-ink-tertiary dark:text-slate-500">
            暂无申请数据
          </div>
        ) : (
          sorted.map(app => {
            const st = statusMap[app.status] || { label: app.status, color: 'default' }
            const ti = tierMap[app.tier]
            const daysLeft = daysUntilDeadline(app.submit_deadline)

            return (
              <div
                key={app.id}
                onClick={() => { window.location.hash = 'student-detail/' + app.student_id }}
                className="px-3 py-3 active:bg-surface-0 dark:active:bg-slate-800/60 cursor-pointer"
              >
                {/* Row 1: Uni + Status */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <GraduationCap size={13} className="text-ink-tertiary dark:text-slate-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-ink-primary dark:text-slate-100 truncate">
                      {app.uni_name || '—'}
                    </span>
                  </div>
                  <Badge color={st.color}>{st.label}</Badge>
                </div>

                {/* Row 2: Department */}
                {(app.department || app.program) && (
                  <p className="text-[11px] text-ink-secondary dark:text-slate-300 truncate mb-1.5 ml-[21px]">
                    {app.department || app.program}
                  </p>
                )}

                {/* Row 3: Tags + Meta */}
                <div className="flex items-center gap-1.5 flex-wrap ml-[21px]">
                  <span className="flex items-center gap-0.5 text-[11px] text-ink-tertiary dark:text-slate-400">
                    <User size={11} />
                    {app.student_name || '—'}
                  </span>
                  {ti && <Badge color={ti.color}>{ti.label}</Badge>}
                  {app.route && <Badge color="purple">{app.route}</Badge>}
                  {app.submit_deadline && (
                    <span className={clsx(
                      'flex items-center gap-0.5 text-[11px] tabular-nums ml-auto',
                      daysLeft !== null && daysLeft < 0 && 'text-red-500 font-semibold',
                      daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && 'text-amber-600 font-semibold',
                      (daysLeft === null || daysLeft > 7) && 'text-ink-tertiary dark:text-slate-400',
                    )}>
                      <Clock size={11} />
                      {app.submit_deadline.slice(5, 10)}
                      {daysLeft !== null && daysLeft >= 0 && daysLeft <= 21 && ` (${daysLeft}天)`}
                      {daysLeft !== null && daysLeft < 0 && ` (逾期${Math.abs(daysLeft)}天)`}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </motion.div>
  )
}
