import { motion } from 'framer-motion'
import { MessageCircle, CheckCircle2, Clock, Plus } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Avatar } from '../../../components/ui/Avatar.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'

const statusMap = {
  pending:  { label: '待处理', color: 'amber', icon: Clock },
  resolved: { label: '已解决', color: 'green', icon: CheckCircle2 },
}

function FeedbackCard({ fb }) {
  const st = statusMap[fb.status] || statusMap.pending
  const Icon = st.icon
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-card border border-surface-2 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar name={fb.student_name || '?'} size="sm" />
          <div>
            <p className="text-xs font-medium text-ink-primary dark:text-slate-100">{fb.student_name || '学生'}</p>
            <p className="text-xs text-ink-tertiary">{fb.created_at?.slice(0, 10)}</p>
          </div>
        </div>
        <Badge color={st.color}>
          <Icon size={10} />{st.label}
        </Badge>
      </div>

      <p className="text-sm text-ink-secondary dark:text-slate-300 leading-relaxed">{fb.content}</p>

      {fb.response && (
        <div className="border-l-2 border-brand-300 pl-3 mt-2">
          <p className="text-xs text-ink-tertiary mb-1">顾问回复</p>
          <p className="text-sm text-ink-secondary dark:text-slate-300">{fb.response}</p>
        </div>
      )}
    </motion.div>
  )
}

export function FeedbackTab({ feedback = [], canEdit }) {
  const pending = feedback.filter(f => f.status === 'pending').length
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 text-xs text-ink-tertiary">
          <span><strong className="text-ink-primary dark:text-slate-100">{feedback.length}</strong> 条反馈</span>
          {pending > 0 && <Badge color="amber"><Clock size={10} />{pending} 待处理</Badge>}
        </div>
      </div>

      {feedback.length === 0 ? (
        <EmptyState icon={MessageCircle} label="暂无反馈记录" />
      ) : (
        <div className="grid gap-3 max-w-2xl">
          {feedback.map(fb => <FeedbackCard key={fb.id} fb={fb} />)}
        </div>
      )}
    </div>
  )
}
