import { useState, useEffect } from 'react'

/**
 * 拉取学生详情页所需的所有数据
 * 与现有 Express API 完全兼容
 */
export function useStudentDetail(studentId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!studentId || studentId === 'demo') {
      // 演示数据 — 不需要后端时用
      setData(DEMO_DATA)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    Promise.all([
      fetch(`/api/students/${studentId}`).then(r => r.json()),
      fetch(`/api/students/${studentId}/tasks`).then(r => r.json()),
      fetch(`/api/students/${studentId}/materials`).then(r => r.json()),
      fetch(`/api/students/${studentId}/communications`).then(r => r.json()),
      fetch(`/api/students/${studentId}/feedback`).then(r => r.json()),
      fetch(`/api/students/${studentId}/personal-statement`).then(r => r.json()),
    ])
      .then(([detail, tasks, materials, comms, feedback, ps]) => {
        setData({ ...detail, tasks, materials, comms, feedback, ps })
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [studentId])

  return { data, loading, error }
}

// ─── 演示数据（与真实 API 结构保持一致）─────────────────────
const DEMO_DATA = {
  student: {
    id: 'demo',
    name: 'Kexiang Yao',
    grade_level: 'G12',
    exam_board: 'Edexcel',
    enrol_date: '2026-03-19',
    date_of_birth: '2026-03-19',
    notes: '',
  },
  assessments: [],
  subjects: [],
  targets: [],
  mentors: [],
  applications: [],
  parents: [],
  agentInfo: null,
  tasks: [],
  materials: [],
  comms: [],
  feedback: [],
  ps: null,
}
