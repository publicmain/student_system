import { TrendingUp, Plus } from 'lucide-react'
import { DraggableCard } from './DraggableCard.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'
import { Button } from '../../../components/ui/Button.jsx'

function ScoreBar({ score, max }) {
  const pct = Math.min((score / max) * 100, 100)
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-brand-500' : 'bg-amber-500'
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-ink-tertiary tabular-nums">{score}/{max}</span>
    </div>
  )
}

export function AssessmentCard({ id, span, onToggle, assessments = [], canEdit, onAdd }) {
  return (
    <DraggableCard
      id={id} span={span} onToggle={onToggle}
      title="入学评估" icon={TrendingUp} iconColor="text-green-600"
      noPadding
      actions={canEdit && <Button variant="ghost" icon={Plus} onClick={onAdd}>添加</Button>}
    >
      {assessments.length === 0 ? (
        <EmptyState icon={TrendingUp} label="暂无评估记录" />
      ) : (
        <ul className="divide-y divide-surface-2">
          {assessments.map(a => (
            <li key={a.id} className="px-4 py-3 hover:bg-surface-0 transition-colors duration-fast">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-primary truncate">{a.assess_type}</p>
                  <p className="text-xs text-ink-tertiary mt-0.5">
                    {a.subject || '—'} · {a.assess_date?.slice(0, 10)}
                    {a.percentile && ` · ${a.percentile}%ile`}
                  </p>
                </div>
                <span className="text-base font-bold text-brand-600 tabular-nums flex-shrink-0">
                  {a.score}
                </span>
              </div>
              <ScoreBar score={a.score} max={a.max_score} />
            </li>
          ))}
        </ul>
      )}
    </DraggableCard>
  )
}
