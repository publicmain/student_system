import { motion } from 'framer-motion'
import { FolderOpen, CheckCircle2, XCircle, Clock, Upload, Plus } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'

const statusConfig = {
  pending:   { label: '待提交', color: 'amber', icon: Clock },
  submitted: { label: '已提交', color: 'blue',  icon: Upload },
  approved:  { label: '已通过', color: 'green', icon: CheckCircle2 },
  rejected:  { label: '未通过', color: 'red',   icon: XCircle },
}

function MaterialRow({ mat }) {
  const st = statusConfig[mat.status] || statusConfig.pending
  const Icon = st.icon
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-4 px-4 py-3.5 border-b border-surface-2 dark:border-slate-700 hover:bg-surface-0 dark:hover:bg-slate-800/60 transition-colors duration-fast"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-primary dark:text-slate-100 truncate">{mat.material_name || mat.name}</p>
        {mat.notes && <p className="text-xs text-ink-tertiary mt-0.5 truncate">{mat.notes}</p>}
      </div>
      <Badge color={st.color}><Icon size={10} />{st.label}</Badge>
      {mat.deadline && (
        <span className="text-xs text-ink-tertiary tabular-nums hidden sm:block">{mat.deadline.slice(0, 10)}</span>
      )}
    </motion.div>
  )
}

export function MaterialsTab({ materials = [], canEdit }) {
  const done = materials.filter(m => m.status === 'approved' || m.status === 'submitted').length
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-ink-tertiary">
          {materials.length} 项材料 · {done} 已提交
        </p>
        {canEdit && <Button variant="primary" icon={Plus} size="sm">添加材料</Button>}
      </div>

      {/* 进度条 */}
      {materials.length > 0 && (
        <div className="mb-6">
          <div className="h-1.5 rounded-full bg-surface-2 dark:bg-slate-700 overflow-hidden">
            <motion.div
              className="h-full bg-brand-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(done / materials.length) * 100}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      <div className="rounded-card border border-surface-2 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        {materials.length === 0 ? (
          <EmptyState icon={FolderOpen} label="暂无材料记录" />
        ) : (
          materials.map(m => <MaterialRow key={m.id} mat={m} />)
        )}
      </div>
    </div>
  )
}
