import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BookMarked, Plus, Download } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../../../lib/api.js'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'

function gradeColor(score, max) {
  const pct = (score / max) * 100
  if (pct >= 85) return 'text-green-600 dark:text-green-400'
  if (pct >= 70) return 'text-brand-600 dark:text-brand-400'
  if (pct >= 55) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-500'
}

export function ExamsTab({ studentId, canEdit }) {
  const [exams, setExams]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.exam.list(studentId)
      .then(setExams)
      .catch(() => setExams([]))
      .finally(() => setLoading(false))
  }, [studentId])

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-ink-tertiary text-sm">加载中…</div>
  )

  const bySubject = exams.reduce((acc, e) => {
    const k = e.subject || '其他'
    if (!acc[k]) acc[k] = []
    acc[k].push(e)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-ink-tertiary">{exams.length} 条考试记录</p>
        <div className="flex gap-2">
          <a href={`/api/students/${studentId}/calendar.ics`}
            className="flex items-center gap-1.5 text-xs text-ink-secondary hover:text-ink-primary border border-surface-2 dark:border-slate-700 rounded-btn px-2.5 py-1.5 hover:bg-surface-2 dark:hover:bg-slate-700 transition-colors duration-fast">
            <Download size={12} /> ICS 日历
          </a>
          {canEdit && <Button variant="primary" icon={Plus} size="sm">添加记录</Button>}
        </div>
      </div>

      {exams.length === 0 ? (
        <EmptyState icon={BookMarked} label="暂无考试记录" />
      ) : (
        <div className="space-y-6">
          {Object.entries(bySubject).map(([subject, items]) => (
            <div key={subject}>
              <h3 className="text-xs font-semibold text-ink-tertiary uppercase tracking-wider mb-3">{subject}</h3>
              <div className="rounded-card border border-surface-2 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-surface-2 dark:border-slate-700 bg-surface-0 dark:bg-slate-800/80">
                      {['考试类型','日期','成绩','满分','等级'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-ink-tertiary font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-2 dark:divide-slate-700">
                    {items.map(e => (
                      <tr key={e.id} className="hover:bg-surface-0 dark:hover:bg-slate-800/60 transition-colors duration-fast">
                        <td className="px-4 py-3 font-medium text-ink-primary dark:text-slate-100">{e.exam_type}</td>
                        <td className="px-4 py-3 text-ink-tertiary tabular-nums">{e.exam_date?.slice(0, 10)}</td>
                        <td className={clsx('px-4 py-3 font-bold tabular-nums', gradeColor(e.score, e.max_score))}>{e.score}</td>
                        <td className="px-4 py-3 text-ink-tertiary">{e.max_score}</td>
                        <td className="px-4 py-3">{e.grade ? <Badge color="default">{e.grade}</Badge> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
