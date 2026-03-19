import { BookOpen, Plus, X } from 'lucide-react'
import { DraggableCard } from './DraggableCard.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'
import { Button } from '../../../components/ui/Button.jsx'

// 考试局颜色映射
const boardColors = {
  Edexcel: 'bg-blue-50 text-blue-700 border-blue-200',
  CIE:     'bg-purple-50 text-purple-700 border-purple-200',
  AQA:     'bg-green-50 text-green-700 border-green-200',
  OCR:     'bg-amber-50 text-amber-700 border-amber-200',
}

export function SubjectsCard({ id, span, onToggle, subjects = [], canEdit, onAdd, onRemove }) {
  return (
    <DraggableCard
      id={id} span={span} onToggle={onToggle}
      title="选科记录" icon={BookOpen} iconColor="text-sky-600"
      actions={canEdit && <Button variant="ghost" icon={Plus} onClick={onAdd}>添加</Button>}
    >
      {subjects.length === 0 ? (
        <EmptyState icon={BookOpen} label="暂无选科记录" />
      ) : (
        <div className="flex flex-wrap gap-2">
          {subjects.map(s => (
            <span
              key={s.id}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium
                ${boardColors[s.exam_board] || 'bg-surface-2 text-ink-secondary border-surface-3'}`}
            >
              <span className="font-bold">{s.code}</span>
              {s.level && <span className="opacity-70">{s.level}</span>}
              <span className="opacity-50">{s.exam_board}</span>
              {canEdit && (
                <button
                  onClick={() => onRemove(s.id)}
                  className="hover:opacity-100 opacity-50 transition-opacity ml-0.5"
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </DraggableCard>
  )
}
