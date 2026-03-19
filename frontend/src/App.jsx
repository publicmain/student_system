import StudentDetailPage from './pages/student-detail/StudentDetailPage.jsx'

/**
 * App 入口 — 目前直接渲染学生详情页演示
 * 后续接入 React Router 时，把这里改成路由配置即可
 */
export default function App() {
  // 演示用：直接写死一个学生 ID
  // 实际接入时从 URL params 读取：useParams().studentId
  const studentId = window.location.pathname.split('/').pop() || 'demo'

  return <StudentDetailPage studentId={studentId} />
}
