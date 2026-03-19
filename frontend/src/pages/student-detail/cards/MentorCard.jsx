import { UserCheck, Plus, X } from 'lucide-react'
import { DraggableCard } from './DraggableCard.jsx'
import { Avatar } from '../../../components/ui/Avatar.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'
import { Button } from '../../../components/ui/Button.jsx'

export function MentorCard({ id, span, onToggle, mentors = [], canEdit, onAssign, onRemove }) {
  return (
    <DraggableCard
      id={id} span={span} onToggle={onToggle}
      title="导师 / 规划师" icon={UserCheck} iconColor="text-amber-500"
      noPadding
      actions={canEdit && (
        <Button variant="ghost" icon={Plus} onClick={onAssign}>分配</Button>
      )}
    >
      {mentors.length === 0 ? (
        <EmptyState icon={UserCheck} label="暂未分配导师"
          action={canEdit && <Button variant="ghost" icon={Plus} onClick={onAssign}>立即分配</Button>}
        />
      ) : (
        <ul className="divide-y divide-surface-2">
          {mentors.map(m => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3 group/item hover:bg-surface-0 transition-colors duration-fast">
              <Avatar name={m.staff_name} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-primary truncate">{m.staff_name}</p>
                <p className="text-xs text-ink-tertiary">{m.role}</p>
              </div>
              {canEdit && (
                <button
                  onClick={() => onRemove(m.id)}
                  className="opacity-0 group-hover/item:opacity-100 text-ink-tertiary hover:text-red-500 transition-all duration-fast p-1 rounded hover:bg-red-50"
                >
                  <X size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </DraggableCard>
  )
}
