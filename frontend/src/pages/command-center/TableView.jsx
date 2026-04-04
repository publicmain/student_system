import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.jsx'

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

export default function TableView({ apps, onStatusChange }) {
  const [sortKey, setSortKey] = useState('submit_deadline')
  const [sortDir, setSortDir] = useState('asc')

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
      // 日期和数字用自然排序，其余用中文 locale
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl border border-surface-3 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-0 dark:bg-slate-800/80 border-b border-surface-2 dark:border-slate-700">
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
                <td colSpan={columns.length} className="px-3 py-12 text-center text-ink-tertiary dark:text-slate-500">
                  暂无申请数据
                </td>
              </tr>
            ) : (
              sorted.map(app => {
                const st = statusMap[app.status] || { label: app.status, color: 'default' }
                const ti = tierMap[app.tier]
                const deadline = app.submit_deadline ? app.submit_deadline.slice(0, 10) : '—'
                const daysLeft = app.submit_deadline
                  ? Math.ceil((new Date(app.submit_deadline) - new Date()) / 86400000)
                  : null

                return (
                  <tr
                    key={app.id}
                    className="border-b border-surface-2 dark:border-slate-700/50 hover:bg-surface-0 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <td className="px-3 py-2.5 font-medium text-ink-primary dark:text-slate-100 whitespace-nowrap">
                      {app.student_name || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-ink-primary dark:text-slate-200 max-w-[180px] truncate">
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
    </motion.div>
  )
}
