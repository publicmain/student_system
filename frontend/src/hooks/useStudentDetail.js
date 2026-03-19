import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api.js'

/**
 * 拉取学生详情页所需的全部数据，并暴露 refresh 方法供 mutation 后调用
 */
export function useStudentDetail(studentId) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchAll = useCallback(async () => {
    if (!studentId || studentId === 'demo') {
      setData(DEMO_DATA)
      setLoading(false)
      return
    }
    try {
      const [detail, tasks, materials, comms, feedback, ps] = await Promise.all([
        api.student.get(studentId),
        api.student.tasks(studentId),
        api.student.materials(studentId),
        api.student.comms(studentId),
        api.student.feedback(studentId),
        api.student.ps(studentId),
      ])
      setData({ ...detail, tasks, materials, comms, feedback, ps })
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    setLoading(true)
    fetchAll()
  }, [fetchAll])

  // refresh：mutation 后调用，局部更新不闪烁
  const refresh = useCallback(() => fetchAll(), [fetchAll])

  return { data, loading, error, refresh }
}

// ── 演示数据 ────────────────────────────────────────────────
const DEMO_DATA = {
  student: {
    id: 'demo', name: 'Kexiang Yao', grade_level: 'G12',
    exam_board: 'Edexcel', enrol_date: '2026-03-19',
    date_of_birth: '2012-05-10', notes: '',
  },
  assessments: [
    { id: '1', assess_type: 'Mock IELTS', subject: '英语', assess_date: '2026-02-01', score: 7.5, max_score: 9, percentile: 82 },
    { id: '2', assess_type: 'A-Level Mock', subject: 'Mathematics', assess_date: '2026-01-15', score: 88, max_score: 100, percentile: 91 },
  ],
  subjects: [
    { id: '1', code: 'MATH', level: 'A2', exam_board: 'Edexcel' },
    { id: '2', code: 'PHYS', level: 'A2', exam_board: 'Edexcel' },
    { id: '3', code: 'CHEM', level: 'AS', exam_board: 'Edexcel' },
  ],
  targets: [
    { id: '1', uni_name: 'Imperial College London', department: 'Mathematics', tier: 'reach' },
    { id: '2', uni_name: 'University of Manchester', department: 'Physics', tier: 'target' },
    { id: '3', uni_name: 'University of Leeds', department: 'Engineering', tier: 'safety' },
  ],
  mentors: [
    { id: '1', staff_name: '关老师', role: 'counselor' },
  ],
  applications: [
    { id: '1', uni_name: 'Imperial College London', program: 'Mathematics', status: 'submitted', deadline: '2026-01-15' },
    { id: '2', uni_name: 'University of Manchester', program: 'Physics', status: 'offer_received', deadline: '2026-01-15' },
  ],
  parents: [
    { id: '1', name: '姚先生', relation: '父亲', phone: '+65 9123 4567', email: 'father@example.com', wechat: 'yaodad' },
  ],
  agentInfo: null,
  tasks: [
    { id: '1', title: '准备 UCAS 个人陈述初稿', status: 'pending', due_date: '2026-04-01', category: 'Application' },
    { id: '2', title: '提交 Imperial 申请', status: 'done', due_date: '2026-01-15', category: 'Application' },
    { id: '3', title: '准备面试材料', status: 'pending', due_date: '2026-05-01', category: 'Interview' },
  ],
  materials: [],
  comms: [
    { id: '1', content: '与学生讨论了目标院校选择，建议增加 safety 选项。', created_at: '2026-03-10T09:00:00Z', staff_name: '关老师', comm_type: 'meeting' },
    { id: '2', content: '家长来电确认监护人同意书签署情况。', created_at: '2026-03-05T14:30:00Z', staff_name: '关老师', comm_type: 'phone' },
  ],
  feedback: [],
  ps: null,
}
