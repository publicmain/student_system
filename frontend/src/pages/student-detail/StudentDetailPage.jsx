import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, AlertCircle } from 'lucide-react'

import { useStudentDetail } from '../../hooks/useStudentDetail.js'
import { StudentHeader }   from './StudentHeader.jsx'
import { TabBar }          from './TabBar.jsx'
import { OverviewTab }     from './tabs/OverviewTab.jsx'

// 占位 Tab 内容 — 后续在这里替换成各自组件
const PlaceholderTab = ({ label }) => (
  <div className="flex items-center justify-center h-48 text-ink-tertiary text-sm">
    {label} 模块（开发中）
  </div>
)

/**
 * StudentDetailPage — 学生详情页根组件
 *
 * 职责：
 * 1. 拉取数据（useStudentDetail）
 * 2. 管理 activeTab 状态
 * 3. 向子组件透传数据 + 操作回调
 */
export default function StudentDetailPage({ studentId }) {
  const { data, loading, error } = useStudentDetail(studentId)
  const [activeTab, setActiveTab] = useState('overview')

  // ── 权限判断（与现有逻辑一致）────────────────────────────
  // 实际集成时替换为真实的 session/role 判断
  const canEdit = true

  // ── Tab 定义 ────────────────────────────────────────────
  const tabs = [
    { id: 'overview',   label: '概览' },
    { id: 'timeline',   label: '时间线任务',  count: data?.tasks?.filter(t => t.status !== 'done').length },
    { id: 'apps',       label: '申请管理',    count: data?.applications?.length },
    { id: 'materials',  label: '材料状态',    count: data?.materials?.length },
    { id: 'ps',         label: '个人陈述' },
    { id: 'comms',      label: '沟通记录',    count: data?.comms?.length },
    { id: 'feedback',   label: '反馈',        count: data?.feedback?.length },
    { id: 'exams',      label: '考试记录' },
    { id: 'eval',       label: '录取评估' },
    { id: 'ai',         label: 'AI 规划 ✨' },
  ]

  // ── 操作回调（调用现有 API） ──────────────────────────────
  // 实际集成时替换为真实的 API 调用 + 刷新逻辑
  const handlers = {
    onBack:          () => window.history.back(),
    onEdit:          () => alert('打开编辑学生弹窗'),
    onAssignMentor:  () => alert('打开分配导师弹窗'),
    onRemoveMentor:  (id) => alert(`移除导师 ${id}`),
    onTimeline:      () => alert('打开生成时间线弹窗'),
    onConsent:       () => alert('打开监护人同意弹窗'),
    onExportPDF:     () => alert('导出 PDF'),
    onAddAssessment: () => alert('添加评估'),
    onAddSubject:    () => alert('添加选科'),
    onRemoveSubject: (id) => alert(`移除科目 ${id}`),
    onAddTarget:     () => alert('添加目标院校'),
    onDeleteTarget:  (id) => alert(`删除院校 ${id}`),
    onAddParent:     () => alert('添加家长'),
  }

  // ── 加载状态 ─────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-surface-0">
      <div className="flex flex-col items-center gap-3 text-ink-tertiary">
        <Loader2 size={28} className="animate-spin text-brand-500" />
        <span className="text-sm">加载学生信息…</span>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-screen bg-surface-0">
      <div className="flex flex-col items-center gap-3 text-red-500 max-w-sm text-center">
        <AlertCircle size={32} />
        <p className="text-sm font-medium">加载失败</p>
        <p className="text-xs text-ink-tertiary">{error}</p>
      </div>
    </div>
  )

  const { student, assessments, subjects, targets, mentors, parents } = data

  return (
    <div className="min-h-screen bg-surface-0 flex flex-col">
      {/* ── 顶部标题栏 ── */}
      <StudentHeader
        student={student}
        canEdit={canEdit}
        onBack={handlers.onBack}
        handlers={handlers}
      />

      {/* ── Tab 导航 ── */}
      <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── 内容区（带切换动画）── */}
      <div className="flex-1 p-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          >
            {activeTab === 'overview' && (
              <OverviewTab
                student={student}
                assessments={assessments}
                subjects={subjects}
                targets={targets}
                mentors={mentors}
                parents={parents}
                canEdit={canEdit}
                handlers={handlers}
              />
            )}
            {activeTab === 'timeline'  && <PlaceholderTab label="时间线任务" />}
            {activeTab === 'apps'      && <PlaceholderTab label="申请管理" />}
            {activeTab === 'materials' && <PlaceholderTab label="材料状态" />}
            {activeTab === 'ps'        && <PlaceholderTab label="个人陈述" />}
            {activeTab === 'comms'     && <PlaceholderTab label="沟通记录" />}
            {activeTab === 'feedback'  && <PlaceholderTab label="反馈" />}
            {activeTab === 'exams'     && <PlaceholderTab label="考试记录" />}
            {activeTab === 'eval'      && <PlaceholderTab label="录取评估" />}
            {activeTab === 'ai'        && <PlaceholderTab label="AI 规划" />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
