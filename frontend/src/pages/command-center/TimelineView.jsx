import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { Badge } from '../../components/ui/Badge.jsx'
import { daysUntilDeadline } from '../../lib/dateUtils.js'

const tierColors = { '冲刺': 'red', '意向': 'amber', '保底': 'green', reach: 'red', target: 'amber', safety: 'green' }
const tierLabels = { '冲刺': '冲刺', '意向': '意向', '保底': '保底', reach: '冲刺', target: '意向', safety: '保底' }

function getMonthLabel(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getMonthDisplay(key) {
  const [y, m] = key.split('-')
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
  return `${y}年${months[parseInt(m) - 1]}`
}

export default function TimelineView({ apps }) {
  const months = useMemo(() => {
    const map = new Map()
    const withDeadline = apps.filter(a => a.submit_deadline)
    const noDeadline = apps.filter(a => !a.submit_deadline)

    withDeadline.forEach(app => {
      const key = getMonthLabel(app.submit_deadline)
      if (!key) { noDeadline.push(app); return }
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(app)
    })

    const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))

    if (noDeadline.length) {
      sorted.push(['no-deadline', noDeadline])
    }

    return sorted
  }, [apps])

  if (apps.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 sm:py-20 text-ink-tertiary dark:text-slate-500 text-sm">
        暂无申请数据
      </div>
    )
  }

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return (
    <div className="overflow-x-auto pb-4 snap-x snap-mandatory sm:snap-none scrollbar-thin">
      <div className="flex gap-3 sm:gap-4 min-w-max">
        {months.map(([monthKey, monthApps], i) => {
          const isCurrent = monthKey === currentMonth
          const isPast = monthKey !== 'no-deadline' && monthKey < currentMonth

          return (
            <motion.div
              key={monthKey}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={clsx(
                'flex-shrink-0 w-[72vw] sm:w-[220px] rounded-xl border snap-center',
                isCurrent
                  ? 'border-brand-500/50 bg-brand-50/30 dark:bg-brand-900/10'
                  : 'border-surface-3 dark:border-slate-700 bg-white dark:bg-slate-800',
                isPast && 'opacity-60'
              )}
            >
              {/* Month Header */}
              <div className={clsx(
                'px-3 py-2 border-b font-semibold text-xs flex items-center justify-between',
                isCurrent
                  ? 'border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300 bg-brand-50/50 dark:bg-brand-900/20'
                  : 'border-surface-2 dark:border-slate-700 text-ink-secondary dark:text-slate-300',
              )}>
                <span>{monthKey === 'no-deadline' ? '无截止日' : getMonthDisplay(monthKey)}</span>
                <span className="text-[10px] bg-surface-2 dark:bg-slate-700 rounded-full px-1.5 py-0.5">
                  {monthApps.length}
                </span>
              </div>

              {/* Apps */}
              <div className="p-2 space-y-1.5 max-h-[50vh] sm:max-h-[400px] overflow-y-auto scrollbar-thin">
                {monthApps.map(app => {
                  const daysLeft = daysUntilDeadline(app.submit_deadline)

                  return (
                    <div
                      key={app.id}
                      onClick={() => { window.location.hash = 'student-detail/' + app.student_id }}
                      className={clsx(
                        'rounded-lg border border-surface-2 dark:border-slate-700 bg-surface-0/50 dark:bg-slate-800/50 px-2.5 py-2 cursor-pointer active:bg-surface-1 dark:active:bg-slate-700/50',
                        daysLeft !== null && daysLeft < 0 && 'border-l-2 border-l-red-500',
                        daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && 'border-l-2 border-l-amber-500',
                      )}
                    >
                      <p className="text-[11px] font-semibold text-ink-primary dark:text-slate-100 truncate">
                        {app.uni_name}
                      </p>
                      <p className="text-[10px] text-ink-tertiary dark:text-slate-400 truncate">
                        {app.student_name} &middot; {app.department || app.program || '—'}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        {app.tier && (
                          <Badge color={tierColors[app.tier]} className="text-[8px] px-1 py-0">
                            {tierLabels[app.tier]}
                          </Badge>
                        )}
                        {app.submit_deadline && (
                          <span className={clsx(
                            'text-[9px] tabular-nums ml-auto',
                            daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-600' : 'text-ink-tertiary dark:text-slate-500'
                          )}>
                            {app.submit_deadline.slice(5, 10)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
