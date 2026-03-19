import { GraduationCap, Plus, Trash2 } from 'lucide-react'
import { DraggableCard } from './DraggableCard.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'

const tierConfig = {
  reach:  { label: 'Reach',  color: 'red' },
  target: { label: 'Target', color: 'amber' },
  safety: { label: 'Safety', color: 'green' },
}

export function TargetsCard({ id, span, onToggle, targets = [], canEdit, onAdd, onDelete }) {
  return (
    <DraggableCard
      id={id} span={span} onToggle={onToggle}
      title="目标院校" icon={GraduationCap} iconColor="text-red-500"
      noPadding
      actions={canEdit && <Button variant="ghost" icon={Plus} onClick={onAdd}>添加</Button>}
    >
      {targets.length === 0 ? (
        <EmptyState icon={GraduationCap} label="暂无目标院校" />
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-surface-2">
              <th className="text-left px-4 py-2.5 text-ink-tertiary font-medium">院校</th>
              <th className="text-left px-4 py-2.5 text-ink-tertiary font-medium">专业</th>
              <th className="text-left px-4 py-2.5 text-ink-tertiary font-medium">梯度</th>
              {canEdit && <th className="w-8 px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-2">
            {targets.map(t => {
              const tier = tierConfig[t.tier] || { label: t.tier, color: 'default' }
              return (
                <tr key={t.id} className="group/row hover:bg-surface-0 transition-colors duration-fast">
                  <td className="px-4 py-3 font-medium text-ink-primary">{t.uni_name}</td>
                  <td className="px-4 py-3 text-ink-secondary">{t.department || '—'}</td>
                  <td className="px-4 py-3"><Badge color={tier.color}>{tier.label}</Badge></td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onDelete(t.id)}
                        className="opacity-0 group-hover/row:opacity-100 text-ink-tertiary hover:text-red-500 transition-all duration-fast p-1 rounded hover:bg-red-50"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </DraggableCard>
  )
}
