import { Users, Plus, Phone, Mail, MessageSquare } from 'lucide-react'
import { DraggableCard } from './DraggableCard.jsx'
import { Avatar } from '../../../components/ui/Avatar.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'

function ParentItem({ p }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-card border border-surface-2 bg-surface-0/50 hover:bg-white hover:border-surface-3 hover:shadow-card transition-all duration-base">
      <Avatar name={p.name} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-ink-primary">{p.name}</span>
          {p.relation && <span className="text-xs text-ink-tertiary">({p.relation})</span>}
        </div>
        <div className="mt-1.5 space-y-0.5">
          {p.phone && (
            <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <Phone size={10} className="text-ink-tertiary flex-shrink-0" />{p.phone}
            </div>
          )}
          {p.email && (
            <div className="flex items-center gap-1.5 text-xs text-ink-secondary break-all">
              <Mail size={10} className="text-ink-tertiary flex-shrink-0" />{p.email}
            </div>
          )}
          {p.wechat && (
            <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <MessageSquare size={10} className="text-ink-tertiary flex-shrink-0" />{p.wechat}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ParentsCard({ id, span, onToggle, parents = [], canEdit, onAdd }) {
  return (
    <DraggableCard
      id={id} span={span} onToggle={onToggle}
      title="家长 / 监护人" icon={Users} iconColor="text-slate-500"
      actions={canEdit && <Button variant="ghost" icon={Plus} onClick={onAdd}>添加</Button>}
    >
      {parents.length === 0 ? (
        <EmptyState icon={Users} label="暂无家长信息" />
      ) : (
        // 响应式网格：半宽1列，全宽2列
        <div className={`grid gap-3 ${span === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {parents.map(p => <ParentItem key={p.id} p={p} />)}
        </div>
      )}
    </DraggableCard>
  )
}
