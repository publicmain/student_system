import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { GraduationCap, Plus, ExternalLink, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../../../lib/api.js'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'

const statusMap = {
  draft:           { label: '草稿',    color: 'default' },
  submitted:       { label: '已提交',  color: 'blue'    },
  offer_received:  { label: '收到录取', color: 'green'  },
  rejected:        { label: '拒绝',    color: 'red'     },
  waitlisted:      { label: '等候名单', color: 'amber'  },
  accepted:        { label: '已接受',  color: 'green'   },
  withdrawn:       { label: '已撤回',  color: 'default' },
}

const tierColor = { reach: 'red', target: 'amber', safety: 'green' }

function AppRow({ app, onSelect, selected }) {
  const st = statusMap[app.status] || { label: app.status, color: 'default' }
  return (
    <motion.div
      layout
      onClick={() => onSelect(app)}
      className={clsx(
        'flex items-center gap-4 px-4 py-3.5 border-b border-surface-2 dark:border-slate-700',
        'cursor-pointer transition-colors duration-fast',
        selected ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-surface-0 dark:hover:bg-slate-800/60',
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-primary dark:text-slate-100 truncate">{app.uni_name}</p>
        <p className="text-xs text-ink-tertiary mt-0.5 truncate">{app.program || app.department || '—'}</p>
      </div>
      {app.tier && <Badge color={tierColor[app.tier]}>{app.tier}</Badge>}
      <Badge color={st.color}>{st.label}</Badge>
      {app.deadline && (
        <span className="text-xs text-ink-tertiary tabular-nums hidden sm:block">
          {app.deadline.slice(0, 10)}
        </span>
      )}
    </motion.div>
  )
}

export function ApplicationsTab({ studentId, applications = [], canEdit, onRefresh }) {
  const [selected, setSelected] = useState(null)

  const submitted = applications.filter(a => a.status === 'submitted').length
  const offers    = applications.filter(a => a.status === 'offer_received' || a.status === 'accepted').length

  return (
    <div className="flex gap-4 h-[calc(100vh-280px)] min-h-[400px]">
      {/* 左侧列表 */}
      <div className="flex-1 min-w-0 flex flex-col rounded-card border border-surface-2 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        {/* 列表头 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-2 dark:border-slate-700 bg-surface-0 dark:bg-slate-800/80">
          <div className="flex items-center gap-3 text-xs text-ink-tertiary">
            <span><strong className="text-ink-primary dark:text-slate-100">{applications.length}</strong> 个申请</span>
            <span className="text-green-600 dark:text-green-400">{offers} 录取</span>
            <span>{submitted} 待回复</span>
          </div>
          {canEdit && <Button variant="primary" icon={Plus} size="sm">添加申请</Button>}
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {applications.length === 0 ? (
            <EmptyState icon={GraduationCap} label="暂无申请记录" />
          ) : (
            applications.map(app => (
              <AppRow key={app.id} app={app} selected={selected?.id === app.id} onSelect={setSelected} />
            ))
          )}
        </div>
      </div>

      {/* 右侧详情面板 */}
      <motion.div
        layout
        className={clsx(
          'rounded-card border border-surface-2 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden',
          'transition-all duration-base',
          selected ? 'w-72 flex-shrink-0' : 'w-0 border-0',
        )}
      >
        {selected && (
          <div className="p-4 h-full overflow-y-auto scrollbar-thin">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-ink-primary dark:text-slate-100">{selected.uni_name}</h3>
                <p className="text-xs text-ink-tertiary mt-0.5">{selected.program || '—'}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-ink-tertiary hover:text-ink-secondary text-lg leading-none">&times;</button>
            </div>

            <div className="space-y-3 text-xs">
              {[
                ['状态', <Badge color={statusMap[selected.status]?.color}>{statusMap[selected.status]?.label || selected.status}</Badge>],
                ['截止日期', selected.deadline?.slice(0, 10) || '—'],
                ['梯度', selected.tier ? <Badge color={tierColor[selected.tier]}>{selected.tier}</Badge> : '—'],
                ['备注', selected.notes || '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3">
                  <span className="text-ink-tertiary w-16 flex-shrink-0">{label}</span>
                  <span className="text-ink-primary dark:text-slate-100 flex-1">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
