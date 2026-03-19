import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { Loader2 } from 'lucide-react'

/**
 * 统一按钮组件
 * variant: 'primary' | 'secondary' | 'ghost' | 'danger'
 * size: 'sm' | 'md'
 */
export function Button({
  children,
  variant = 'secondary',
  size = 'sm',
  loading = false,
  disabled = false,
  icon: Icon,
  onClick,
  className,
  ...props
}) {
  const base = 'inline-flex items-center gap-1.5 font-medium rounded-btn transition-all duration-fast select-none'

  const variants = {
    primary:   'bg-brand-600 text-white hover:bg-brand-700 shadow-sm hover:shadow active:scale-95',
    secondary: 'bg-surface-2 text-ink-primary hover:bg-surface-3 active:scale-95',
    ghost:     'text-ink-secondary hover:bg-surface-2 hover:text-ink-primary active:scale-95',
    danger:    'bg-red-50 text-red-600 hover:bg-red-100 active:scale-95',
    warning:   'bg-amber-500 text-white hover:bg-amber-600 shadow-sm active:scale-95',
  }

  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3.5 py-2 text-sm',
  }

  return (
    <motion.button
      whileTap={{ scale: disabled || loading ? 1 : 0.95 }}
      onClick={disabled || loading ? undefined : onClick}
      disabled={disabled || loading}
      className={clsx(
        base,
        variants[variant],
        sizes[size],
        (disabled || loading) && 'opacity-50 cursor-not-allowed',
        className
      )}
      {...props}
    >
      {loading
        ? <Loader2 size={12} className="animate-spin" />
        : Icon && <Icon size={12} />}
      {children}
    </motion.button>
  )
}
