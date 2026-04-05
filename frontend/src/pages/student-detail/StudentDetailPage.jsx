import { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, AlertCircle } from 'lucide-react'

import { useStudentDetail }  from '../../hooks/useStudentDetail.js'
import { api }               from '../../lib/api.js'
import { StudentHeader }     from './StudentHeader.jsx'
import { TabBar }            from './TabBar.jsx'
import { EditStudentModal, AssignMentorModal, AddTargetModal, AddParentModal, AddAssessmentModal, AddSubjectModal, ComingSoonModal } from './ActionModals.jsx'
import { OverviewTab }       from './tabs/OverviewTab.jsx'
import { TimelineTab }       from './tabs/TimelineTab.jsx'
import { ApplicationsTab }   from './tabs/ApplicationsTab.jsx'
import { MaterialsTab }      from './tabs/MaterialsTab.jsx'
import { CommunicationsTab } from './tabs/CommunicationsTab.jsx'
import { FeedbackTab }       from './tabs/FeedbackTab.jsx'
import { ExamsTab }          from './tabs/ExamsTab.jsx'
import { EvalTab }           from './tabs/EvalTab.jsx'
import { AITab }             from './tabs/AITab.jsx'

// 个人陈述简单占位
const PSTab = ({ ps }) => (
  <div className="max-w-2xl">
    {ps?.content
      ? <div className="prose prose-sm dark:prose-invert whitespace-pre-wrap text-sm text-ink-secondary dark:text-slate-300 leading-relaxed">{ps.content}</div>
      : <div className="flex flex-col items-center justify-center py-16 text-ink-tertiary gap-2 text-sm">暂无个人陈述内容</div>
    }
  </div>
)

/**
 * StudentDetailPage — 根组件
 * 职责：数据、权限判断、操作 handler、Tab 路由
 */
export default function StudentDetailPage({ studentId }) {
  const { data, loading, error, refresh } = useStudentDetail(studentId)
  const [activeTab, setActiveTab] = useState('overview')

  // ── Modal 状态 ──────────────────────────────────────────
  const [modal, setModal] = useState(null)
  const openModal = (name) => setModal(name)
  const closeModal = () => setModal(null)

  // ── 真实权限（接入 session 时替换）────────────────────────
  const userRole = window.__ROLE__ || 'principal'
  const canEdit  = ['principal', 'counselor', 'intake_staff'].includes(userRole)

  // ── 带 refresh 的 API 操作 ─────────────────────────────────
  const act = useCallback(async (fn) => {
    try { await fn(); refresh() }
    catch (e) { alert(e.message) }
  }, [refresh])

  const handlers = {
    onBack:          () => window.history.back(),
    onEdit:          () => openModal('edit'),
    onAssignMentor:  () => openModal('assignMentor'),
    onRemoveMentor:  (assignId) => act(() => api.mentor.remove(assignId)),
    onTimeline:      () => openModal('timeline'),
    onConsent:       () => openModal('consent'),
    onExportPDF:     () => window.open(`/api/intake-cases/export-pdf?student=${studentId}`, '_blank'),
    onAddAssessment: () => openModal('addAssessment'),
    onAddSubject:    () => openModal('addSubject'),
    onRemoveSubject: (eid) => act(() => api.subject.remove(studentId, eid)),
    onAddTarget:     () => openModal('addTarget'),
    onDeleteTarget:  (id) => act(() => api.target.delete(id)),
    onAddParent:     () => openModal('addParent'),
  }

  // ── Tab 定义 ─────────────────────────────────────────────
  const tabs = [
    { id: 'overview',   label: '概览' },
    { id: 'timeline',   label: '时间线任务', count: data?.tasks?.filter(t => t.status !== 'done').length || 0 },
    { id: 'apps',       label: '申请管理',   count: data?.applications?.length || 0 },
    { id: 'materials',  label: '材料状态',   count: data?.materials?.length || 0 },
    { id: 'ps',         label: '个人陈述' },
    { id: 'comms',      label: '沟通记录',   count: data?.comms?.length || 0 },
    { id: 'feedback',   label: '反馈',       count: data?.feedback?.filter(f => f.status === 'pending').length || 0 },
    { id: 'exams',      label: '考试记录' },
    { id: 'eval',       label: '录取评估' },
    { id: 'ai',         label: 'AI 规划 ✨' },
  ]

  // ── 加载 / 错误 ─────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-surface-0 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-3 text-ink-tertiary">
        <Loader2 size={28} className="animate-spin text-brand-500" />
        <span className="text-sm">加载学生信息…</span>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-screen bg-surface-0 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-3 text-red-500 max-w-sm text-center">
        <AlertCircle size={32} />
        <p className="text-sm font-medium">加载失败</p>
        <p className="text-xs text-ink-tertiary dark:text-slate-400">{error}</p>
      </div>
    </div>
  )

  const { student, assessments, subjects, targets, mentors, parents, tasks, materials, comms, feedback, ps, applications } = data

  return (
    <div className="min-h-screen bg-surface-0 dark:bg-slate-900 flex flex-col text-ink-primary dark:text-slate-100">
      {/* ── 固定顶部 ── */}
      <StudentHeader
        student={student} canEdit={canEdit}
        onBack={handlers.onBack} handlers={handlers}
      />

      {/* ── Tab 导航 ── */}
      <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── 内容区 ── */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        <AnimatePresence>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
          >
            {activeTab === 'overview' && (
              <OverviewTab
                student={student} assessments={assessments} subjects={subjects}
                targets={targets} mentors={mentors} parents={parents}
                canEdit={canEdit} handlers={handlers}
              />
            )}
            {activeTab === 'timeline' && (
              <TimelineTab tasks={tasks} studentId={studentId} canEdit={canEdit} onRefresh={refresh} />
            )}
            {activeTab === 'apps' && (
              <ApplicationsTab studentId={studentId} applications={applications} canEdit={canEdit} onRefresh={refresh} />
            )}
            {activeTab === 'materials' && (
              <MaterialsTab materials={materials} canEdit={canEdit} />
            )}
            {activeTab === 'ps' && <PSTab ps={ps} />}
            {activeTab === 'comms' && (
              <CommunicationsTab comms={comms} studentId={studentId} canEdit={canEdit} onRefresh={refresh} />
            )}
            {activeTab === 'feedback' && (
              <FeedbackTab feedback={feedback} canEdit={canEdit} />
            )}
            {activeTab === 'exams' && (
              <ExamsTab studentId={studentId} canEdit={canEdit} />
            )}
            {activeTab === 'eval' && (
              <EvalTab studentId={studentId} canEdit={canEdit} />
            )}
            {activeTab === 'ai' && (
              <AITab studentId={studentId} canEdit={canEdit} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Modals ── */}
      <EditStudentModal open={modal === 'edit'} onClose={closeModal} student={student} studentId={studentId} onSuccess={refresh} />
      <AssignMentorModal open={modal === 'assignMentor'} onClose={closeModal} studentId={studentId} onSuccess={refresh} />
      <AddTargetModal open={modal === 'addTarget'} onClose={closeModal} studentId={studentId} onSuccess={refresh} />
      <AddParentModal open={modal === 'addParent'} onClose={closeModal} studentId={studentId} onSuccess={refresh} />
      <AddAssessmentModal open={modal === 'addAssessment'} onClose={closeModal} studentId={studentId} onSuccess={refresh} />
      <AddSubjectModal open={modal === 'addSubject'} onClose={closeModal} studentId={studentId} onSuccess={refresh} />
      <ComingSoonModal open={modal === 'timeline'} onClose={closeModal} title="生成时间线" />
      <ComingSoonModal open={modal === 'consent'} onClose={closeModal} title="监护人同意" />
    </div>
  )
}

StudentDetailPage.propTypes = {
  studentId: PropTypes.string.isRequired,
}
