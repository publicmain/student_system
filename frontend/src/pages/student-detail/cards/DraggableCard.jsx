import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'framer-motion'
import { GripVertical, Maximize2, Minimize2 } from 'lucide-react'
import { clsx } from 'clsx'

/**
 * DraggableCard — 可拖拽卡片容器
 *
 * 每张业务卡片（BasicInfoCard 等）都包在这里面。
 * 负责：拖拽逻辑、宽度切换、hover 动效、拖拽手柄渲染。
 *
 * Props:
 *   id         — 唯一 key（与 useGridLayout 对应）
 *   span       — 1（半宽）| 2（全宽）
 *   onToggle   — 切换宽度回调
 *   title      — 卡片标题
 *   icon       — Lucide 图标组件
 *   iconColor  — icon 颜色 class（Tailwind）
 *   actions    — 右侧操作按钮（JSX）
 *   children   — 卡片正文
 *   noPadding  — 卡片 body 是否去掉内边距（表格型内容用）
 */
export function DraggableCard({
  id,
  span = 1,
  onToggle,
  title,
  icon: Icon,
  iconColor = 'text-brand-600',
  actions,
  children,
  noPadding = false,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${span}`,
    zIndex: isDragging ? 50 : 'auto',
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout                         // 宽度切换时平滑动画
      layoutId={id}
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: isDragging ? 0.5 : 1,
        y: 0,
        scale: isDragging ? 1.02 : 1,
      }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      className={clsx(
        'group/card rounded-card border border-surface-3 bg-white',
        'shadow-card hover:shadow-card-hover',
        'transition-shadow duration-base',
        isDragging && 'shadow-card-drag ring-2 ring-brand-500/30',
      )}
    >
      {/* ── 卡片头部 ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-2 bg-surface-0/60 rounded-t-card">
        {/* 拖动手柄 — 仅 hover 时显示，cursor-grab */}
        <div
          {...attributes}
          {...listeners}
          className={clsx(
            'text-ink-tertiary cursor-grab active:cursor-grabbing',
            'opacity-0 group-hover/card:opacity-100',
            'transition-opacity duration-fast hover:text-ink-secondary',
            'p-0.5 rounded',
          )}
          title="拖动排序"
        >
          <GripVertical size={15} />
        </div>

        {/* 图标 + 标题 */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {Icon && <Icon size={14} className={clsx('flex-shrink-0', iconColor)} />}
          <span className="text-sm font-semibold text-ink-primary truncate">{title}</span>
        </div>

        {/* 右侧操作区 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {actions}
          {/* 宽度切换按钮 */}
          <button
            onClick={onToggle}
            title={span === 1 ? '展开为全宽' : '收回为半宽'}
            className={clsx(
              'p-1 rounded text-ink-tertiary',
              'opacity-0 group-hover/card:opacity-100',
              'hover:bg-surface-2 hover:text-ink-secondary',
              'transition-all duration-fast',
            )}
          >
            {span === 1
              ? <Maximize2 size={13} />
              : <Minimize2 size={13} />}
          </button>
        </div>
      </div>

      {/* ── 卡片内容 ── */}
      <div className={noPadding ? '' : 'p-4'}>
        {children}
      </div>
    </motion.div>
  )
}

/**
 * DragOverlayCard — 拖动中的"幽灵卡片"（跟随鼠标）
 * 在 DndContext 的 DragOverlay 里渲染
 */
export function DragOverlayCard({ title, icon: Icon, iconColor }) {
  return (
    <div className="rounded-card border border-brand-500/30 bg-white shadow-card-drag opacity-90 px-4 py-3">
      <div className="flex items-center gap-2">
        <GripVertical size={15} className="text-ink-tertiary" />
        {Icon && <Icon size={14} className={clsx('flex-shrink-0', iconColor)} />}
        <span className="text-sm font-semibold text-ink-primary">{title}</span>
      </div>
    </div>
  )
}
