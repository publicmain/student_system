import { ArrowLeft, Pencil, UserPlus, Sparkles, Shield, FileText } from 'lucide-react'
import { motion } from 'framer-motion'
import { Badge } from '../../components/ui/Badge.jsx'
import { Button } from '../../components/ui/Button.jsx'

function isUnder14(dob) {
  if (!dob) return false
  return (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000) < 14
}

/**
 * StudentHeader
 * 顶部区域：返回 + 学生名 + 标签 + 操作按钮
 * 固定高度，不随内容滚动
 */
export function StudentHeader({ student, canEdit, onBack, handlers }) {
  const under14 = isUnder14(student?.date_of_birth)

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center justify-between gap-4 py-5 px-6 border-b border-surface-2 bg-white sticky top-0 z-10"
    >
      {/* 左侧：返回 + 名字 + 标签 */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onBack}
          className="text-ink-tertiary hover:text-ink-primary hover:bg-surface-2 p-2 rounded-btn transition-all duration-fast flex-shrink-0"
        >
          <ArrowLeft size={16} />
        </button>

        {/* 学生头像 */}
        <div className="w-9 h-9 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center text-sm flex-shrink-0">
          {student?.name?.charAt(0) ?? '?'}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-ink-primary truncate">{student?.name}</h1>
            {student?.grade_level && <Badge color="slate">{student.grade_level}</Badge>}
            {student?.exam_board  && <Badge color="blue">{student.exam_board}</Badge>}
            {under14 && (
              <Badge color="amber">
                <Shield size={10} />未满14岁·合规
              </Badge>
            )}
          </div>
          <p className="text-xs text-ink-tertiary mt-0.5">
            入学 {student?.enrol_date?.slice(0, 10) || '—'}
          </p>
        </div>
      </div>

      {/* 右侧：操作按钮 */}
      {canEdit && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="secondary" icon={Pencil} onClick={handlers.onEdit}>编辑</Button>
          <Button variant="secondary" icon={UserPlus} onClick={handlers.onAssignMentor}>分配导师</Button>
          <Button variant="warning" icon={Sparkles} onClick={handlers.onTimeline}>生成时间线</Button>
          <Button variant="secondary" icon={Shield} onClick={handlers.onConsent}>监护人同意</Button>
          <Button variant="secondary" icon={FileText} onClick={handlers.onExportPDF}>导出 PDF</Button>
        </div>
      )}
    </motion.div>
  )
}
