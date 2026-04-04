import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
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
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragStart = useCallback((event) => {
    const { active } = event
    // Find the app across all columns
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
    // Find which column we dropped into
    const targetCol = columns.find(c => c.id === overId)
    if (!targetCol) return

    // Map kanban column back to the first status in that group
    const newStatus = targetCol.statuses[0]
    const appId = active.id

    // Find current status
    let currentStatus = null
    for (const col of columns) {
      const found = col.apps.find(a => String(a.id) === String(appId))
      if (found) { currentStatus = found.status; break }
    }

    if (currentStatus !== newStatus) {
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
      <div className="flex gap-2 pb-4 min-h-[400px]">
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
