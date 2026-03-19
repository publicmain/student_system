import { ArrowLeft, Pencil, UserPlus, Sparkles, Shield, FileText, Sun, Moon } from 'lucide-react'
import { motion } from 'framer-motion'
import { Badge }   from '../../components/ui/Badge.jsx'
import { Button }  from '../../components/ui/Button.jsx'
import { useTheme } from '../../contexts/ThemeContext.jsx'

function isUnder14(dob) {
  if (!dob) return false
  return (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000) < 14
}

export function StudentHeader({ student, canEdit, onBack, handlers }) {
  const { dark, toggle } = useTheme()
  const under14 = isUnder14(student?.date_of_birth)

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center justify-between gap-4 py-4 px-4 md:px-6 border-b border-surface-2 dark:border-slate-700 bg-white dark:bg-slate-900 sticky top-0 z-20"
    >
      {/* 左：返回 + 名字 + 标签 */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onBack}
          className="text-ink-tertiary hover:text-ink-primary dark:hover:text-slate-100 hover:bg-surface-2 dark:hover:bg-slate-700 p-2 rounded-btn transition-all duration-fast flex-shrink-0"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="w-9 h-9 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center text-sm flex-shrink-0 select-none">
          {student?.name?.charAt(0) ?? '?'}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base md:text-lg font-bold text-ink-primary dark:text-slate-100 truncate">
              {student?.name}
            </h1>
            {student?.grade_level && <Badge color="slate">{student.grade_level}</Badge>}
            {student?.exam_board  && <Badge color="blue">{student.exam_board}</Badge>}
            {under14 && (
              <Badge color="amber">
                <Shield size={10} />未满14岁·合规
              </Badge>
            )}
          </div>
          <p className="text-xs text-ink-tertiary dark:text-slate-500 mt-0.5 hidden sm:block">
            入学 {student?.enrol_date?.slice(0, 10) || '—'}
          </p>
        </div>
      </div>

      {/* 右：操作 + 主题切换 */}
      <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
        {canEdit && (
          <>
            <Button variant="secondary" icon={Pencil}   size="sm" onClick={handlers.onEdit}   className="hidden md:inline-flex">编辑</Button>
            <Button variant="secondary" icon={UserPlus} size="sm" onClick={handlers.onAssignMentor} className="hidden md:inline-flex">分配导师</Button>
            <Button variant="warning"   icon={Sparkles} size="sm" onClick={handlers.onTimeline}>生成时间线</Button>
            <Button variant="secondary" icon={Shield}   size="sm" onClick={handlers.onConsent} className="hidden lg:inline-flex">监护人同意</Button>
            <Button variant="secondary" icon={FileText} size="sm" onClick={handlers.onExportPDF} className="hidden lg:inline-flex">PDF</Button>
          </>
        )}

        {/* 暗色模式切换 */}
        <button
          onClick={toggle}
          title={dark ? '切换浅色' : '切换深色'}
          className="p-2 rounded-btn text-ink-tertiary hover:text-ink-secondary dark:hover:text-slate-300 hover:bg-surface-2 dark:hover:bg-slate-700 transition-all duration-fast"
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </motion.div>
  )
}
