import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { motion } from 'framer-motion'
import KanbanColumn from './KanbanColumn.jsx'
import KanbanCard from './KanbanCard.jsx'

export default function KanbanBoard({ columns, onStatusChange, healthMap }) {
  const [activeApp, setActiveApp] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const handleDragStart = useCallback((event) => {
    const { active } = event
    for (const col of columns) {
      const app = col.apps.find(a => String(a.id) === String(active.id))
      if (app) { setActiveApp(app); break }
    }
  }, [columns])

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event
    setActiveApp(null)
    if (!over) return

    const overId = String(over.id)
    const targetCol = columns.find(c => c.id === overId)
    if (!targetCol) return

    const newStatus = targetCol.statuses[0]
    const appId = active.id

    let currentStatus = null
    let appInfo = null
    for (const col of columns) {
      const found = col.apps.find(a => String(a.id) === String(appId))
      if (found) { currentStatus = found.status; appInfo = found; break }
    }

    if (currentStatus !== newStatus) {
      const HIGH_RISK = ['enrolled', 'declined', 'rejected', 'withdrawn']
      if (HIGH_RISK.includes(newStatus)) {
        const name = appInfo?.student_name || '该学生'
        const uni = appInfo?.uni_name || '该院校'
        const label = targetCol.label
        if (!window.confirm(`确认将「${name} - ${uni}」移至「${label}」？此操作难以撤销。`)) return
      }
      onStatusChange(appId, newStatus)
    }
  }, [columns, onStatusChange])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-2 pb-4 min-h-[300px] sm:min-h-[400px] overflow-x-auto snap-x snap-mandatory sm:snap-none scrollbar-thin">
        {columns.map((col, i) => (
          <KanbanColumn key={col.id} column={col} index={i} healthMap={healthMap} />
        ))}
      </div>

      <DragOverlay>
        {activeApp && (
          <div className="rotate-2 opacity-90">
            <KanbanCard app={activeApp} isDragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
