/**
 * 头像组件 — 显示姓名首字母
 */
export function Avatar({ name = '?', size = 'md' }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-8 h-8 text-sm', lg: 'w-10 h-10 text-base' }
  return (
    <div className={`${sizes[size]} rounded-full bg-brand-100 text-brand-600 font-bold flex items-center justify-center flex-shrink-0 select-none`}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
