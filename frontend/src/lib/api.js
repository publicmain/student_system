/**
 * API 工具层 — 封装所有对 Express 后端的请求
 * 与现有 server.js 路由完全对应
 */

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // 带 session cookie
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const get  = (url)        => request('GET',    url)
const post = (url, body)  => request('POST',   url, body)
const put  = (url, body)  => request('PUT',    url, body)
const del  = (url)        => request('DELETE', url)

// ── 学生 ─────────────────────────────────────────────────────
export const api = {
  student: {
    get:    (id)        => get(`/api/students/${id}`),
    update: (id, body)  => put(`/api/students/${id}`, body),
    tasks:  (id)        => get(`/api/students/${id}/tasks`),
    materials: (id)     => get(`/api/students/${id}/materials`),
    comms:  (id)        => get(`/api/students/${id}/communications`),
    feedback: (id)      => get(`/api/students/${id}/feedback`),
    ps:     (id)        => get(`/api/students/${id}/personal-statement`),
  },

  // ── 导师分配 ────────────────────────────────────────────────
  mentor: {
    assign: (studentId, staffId) =>
      post(`/api/students/${studentId}/mentors`, { staff_id: staffId }),
    remove: (assignId) => del(`/api/mentor-assignments/${assignId}`),
  },

  // ── 评估 ────────────────────────────────────────────────────
  assessment: {
    create: (studentId, body) => post(`/api/students/${studentId}/assessments`, body),
    delete: (id) => del(`/api/admission-assessments/${id}`),
  },

  // ── 选科 ────────────────────────────────────────────────────
  subject: {
    add:    (studentId, body) => post(`/api/students/${studentId}/subjects`, body),
    remove: (studentId, eid)  => del(`/api/students/${studentId}/subjects/${eid}`),
    list:   ()                => get('/api/subjects'),
  },

  // ── 目标院校 ─────────────────────────────────────────────────
  target: {
    add:    (studentId, body) => post(`/api/students/${studentId}/targets`, body),
    delete: (id)              => del(`/api/target-uni-lists/${id}`),
  },

  // ── 家长 ─────────────────────────────────────────────────────
  parent: {
    add:    (studentId, body) => post(`/api/students/${studentId}/parents`, body),
    remove: (id)              => del(`/api/parent-guardians/${id}`),
  },

  // ── 任务 ─────────────────────────────────────────────────────
  task: {
    create: (studentId, body) => post(`/api/students/${studentId}/tasks`, body),
    update: (id, body)        => put(`/api/tasks/${id}`, body),
    delete: (id)              => del(`/api/tasks/${id}`),
    done:   (id, isDone)      => put(`/api/tasks/${id}`, { status: isDone ? 'done' : 'pending' }),
  },

  // ── 沟通记录 ─────────────────────────────────────────────────
  comm: {
    create: (studentId, body) => post(`/api/students/${studentId}/communications`, body),
    delete: (id)              => del(`/api/communications/${id}`),
  },

  // ── 申请 ─────────────────────────────────────────────────────
  app: {
    list:   (studentId) => get(`/api/students/${studentId}/applications`),
    create: (studentId, body) => post(`/api/students/${studentId}/applications`, body),
    update: (id, body)        => put(`/api/applications/${id}`, body),
    delete: (id)              => del(`/api/applications/${id}`),
  },

  // ── 考试 ─────────────────────────────────────────────────────
  exam: {
    list:   (studentId) => get(`/api/students/${studentId}/exam-sittings`),
    create: (studentId, body) => post(`/api/students/${studentId}/exam-sittings`, body),
    delete: (id)              => del(`/api/exam-sittings/${id}`),
  },

  // ── 录取评估 ─────────────────────────────────────────────────
  eval: {
    list:      (studentId) => get(`/api/students/${studentId}/admission-evals`),
    benchmark: (studentId) => get(`/api/students/${studentId}/benchmark-evals`),
  },

  // ── AI 规划 ──────────────────────────────────────────────────
  ai: {
    get:      (studentId) => get(`/api/students/${studentId}/ai-plan`),
    generate: (studentId) => post(`/api/students/${studentId}/ai-plan`, {}),
  },

  // ── 指挥中心 ─────────────────────────────────────────────────
  commandCenter: {
    stats:      ()         => get('/api/command-center/stats'),
    riskAlerts: ()         => get('/api/command-center/risk-alerts'),
    allApps:    (params)   => {
      const qs = params ? new URLSearchParams(params).toString() : ''
      return get(`/api/applications${qs ? '?' + qs : ''}`)
    },
    updateApp:  (id, body) => put(`/api/applications/${id}`, body),
    aiRisks:    ()         => post('/api/command-center/ai-risk-alerts', {}),
    aiActions:  ()         => post('/api/command-center/ai-next-action', {}),
    aiNLQ:      (query)    => post('/api/command-center/ai-nlq', { query }),
    aiListScore:(sid)      => post('/api/command-center/ai-list-score', { student_id: sid }),
  },

  // ── 系统设置 ─────────────────────────────────────────────────
  settings: {
    get: () => get('/api/settings'),
  },

  // ── 师资 ─────────────────────────────────────────────────────
  staff: {
    list: () => get('/api/staff'),
  },
}
