import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw } from 'lucide-react'

import { useGridLayout } from '../../../hooks/useGridLayout.js'
import { DragOverlayCard } from '../cards/DraggableCard.jsx'
import { BasicInfoCard }   from '../cards/BasicInfoCard.jsx'
import { MentorCard }      from '../cards/MentorCard.jsx'
import { AssessmentCard }  from '../cards/AssessmentCard.jsx'
import { SubjectsCard }    from '../cards/SubjectsCard.jsx'
import { TargetsCard }     from '../cards/TargetsCard.jsx'
import { ParentsCard }     from '../cards/ParentsCard.jsx'

import { User, UserCheck, TrendingUp, BookOpen, GraduationCap, Users } from 'lucide-react'

// ── 卡片默认配置 ──────────────────────────────────────────────
const DEFAULT_CARDS = [
  { id: 'basic',      span: 1, title: '基本信息',    icon: User,          iconColor: 'text-brand-600' },
  { id: 'mentor',     span: 1, title: '导师/规划师',  icon: UserCheck,     iconColor: 'text-amber-500' },
  { id: 'assessment', span: 1, title: '入学评估',    icon: TrendingUp,    iconColor: 'text-green-600' },
  { id: 'subjects',   span: 1, title: '选科记录',    icon: BookOpen,      iconColor: 'text-sky-600'   },
  { id: 'targets',    span: 2, title: '目标院校',    icon: GraduationCap, iconColor: 'text-red-500'   },
  { id: 'parents',    span: 2, title: '家长/监护人', icon: Users,         iconColor: 'text-slate-500' },
]

export function OverviewTab({ student, assessments, subjects, targets, mentors, parents, canEdit, handlers }) {
  // 每个学生用独立 localStorage key，互不干扰
  const { cards, reorder, toggleSpan, reset } = useGridLayout(DEFAULT_CARDS, student?.id || 'default')
  const [activeId, setActiveId] = useState(null)

  // dnd-kit 传感器 — PointerSensor 带 5px 容差，防止点击触发拖拽
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function handleDragStart({ active }) {
    setActiveId(active.id)
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over || active.id === over.id) return
    const oldIdx = cards.findIndex(c => c.id === active.id)
    const newIdx = cards.findIndex(c => c.id === over.id)
    reorder(arrayMove(cards, oldIdx, newIdx))
  }

  const activeCard = cards.find(c => c.id === activeId)

  // ── 渲染各业务卡片 ─────────────────────────────────────────
  function renderCard(card) {
    const commonProps = {
      id: card.id,
      span: card.span,
      onToggle: () => toggleSpan(card.id),
    }
    switch (card.id) {
      case 'basic':
        return <BasicInfoCard key={card.id} {...commonProps} student={student} />
      case 'mentor':
        return <MentorCard key={card.id} {...commonProps}
          mentors={mentors} canEdit={canEdit}
          onAssign={handlers.onAssignMentor} onRemove={handlers.onRemoveMentor} />
      case 'assessment':
        return <AssessmentCard key={card.id} {...commonProps}
          assessments={assessments} canEdit={canEdit} onAdd={handlers.onAddAssessment} />
      case 'subjects':
        return <SubjectsCard key={card.id} {...commonProps}
          subjects={subjects} canEdit={canEdit}
          onAdd={handlers.onAddSubject} onRemove={handlers.onRemoveSubject} />
      case 'targets':
        return <TargetsCard key={card.id} {...commonProps}
          targets={targets} canEdit={canEdit}
          onAdd={handlers.onAddTarget} onDelete={handlers.onDeleteTarget} />
      case 'parents':
        return <ParentsCard key={card.id} {...commonProps}
          parents={parents} canEdit={canEdit} onAdd={handlers.onAddParent} />
      default:
        return null
    }
  }

  return (
    <div>
      {/* 顶部工具条 — 重置布局 */}
      <div className="flex justify-end mb-4">
        <button
          onClick={reset}
          className="flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink-secondary transition-colors duration-fast py-1 px-2 rounded hover:bg-surface-2"
        >
          <RotateCcw size={11} />
          重置布局
        </button>
      </div>

      {/* dnd-kit 拖拽上下文 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
          {/*
            CSS Grid 2列，卡片通过 style.gridColumn 控制跨列
            AnimatePresence 让卡片排序时有平滑动画
          */}
          {/* 响应式：移动端1列，平板/桌面2列 */}
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start"
          >
            <AnimatePresence>
              {cards.map(card => renderCard(card))}
            </AnimatePresence>
          </motion.div>
        </SortableContext>

        {/* 拖动中的幽灵卡片 */}
        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
          {activeCard && (
            <DragOverlayCard
              title={activeCard.title}
              icon={activeCard.icon}
              iconColor={activeCard.iconColor}
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
