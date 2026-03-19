/**
 * 空状态组件 — 卡片内容为空时展示
 */
export function EmptyState({ icon: Icon, label, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-ink-tertiary">
      {Icon && <Icon size={28} strokeWidth={1.5} className="opacity-60" />}
      <p className="text-xs">{label}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
