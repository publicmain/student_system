import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Phone, Mail, Video, FileText, Plus } from 'lucide-react'
import { clsx } from 'clsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Avatar } from '../../../components/ui/Avatar.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'

const typeConfig = {
  meeting: { icon: MessageSquare, label: '会面', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' },
  phone:   { icon: Phone,         label: '电话', color: 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400' },
  email:   { icon: Mail,          label: '邮件', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  video:   { icon: Video,         label: '视频', color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' },
  note:    { icon: FileText,      label: '备注', color: 'bg-surface-2 text-ink-secondary dark:bg-slate-700 dark:text-slate-300' },
}

function CommItem({ comm }) {
  const cfg = typeConfig[comm.comm_type] || typeConfig.note
  const Icon = cfg.icon
  const date = new Date(comm.created_at)
  const dateStr = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3"
    >
      {/* 时间轴线 */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', cfg.color)}>
          <Icon size={14} />
        </div>
        <div className="w-px flex-1 bg-surface-2 dark:bg-slate-700 mt-2 mb-2" />
      </div>

      {/* 内容 */}
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-medium text-ink-primary dark:text-slate-100">{comm.staff_name || '—'}</span>
          <span className="text-xs text-ink-tertiary">{cfg.label}</span>
          <span className="text-xs text-ink-tertiary ml-auto">{dateStr} {timeStr}</span>
        </div>
        <div className="bg-surface-0 dark:bg-slate-800/60 border border-surface-2 dark:border-slate-700 rounded-card p-3">
          <p className="text-sm text-ink-secondary dark:text-slate-300 leading-relaxed">{comm.content}</p>
        </div>
      </div>
    </motion.div>
  )
}

export function CommunicationsTab({ comms = [], studentId, canEdit, onRefresh }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-ink-tertiary">{comms.length} 条记录</p>
        {canEdit && <Button variant="primary" icon={Plus} size="sm">添加记录</Button>}
      </div>

      {comms.length === 0 ? (
        <EmptyState icon={MessageSquare} label="暂无沟通记录" />
      ) : (
        <div className="max-w-2xl">
          {[...comms].sort((a, b) => b.created_at?.localeCompare(a.created_at)).map(c => (
            <CommItem key={c.id} comm={c} />
          ))}
        </div>
      )}
    </div>
  )
}
