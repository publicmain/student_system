import StudentDetailPage from './pages/student-detail/StudentDetailPage.jsx'
import CommandCenterPage from './pages/command-center/CommandCenterPage.jsx'

export default function App() {
  const page = window.__PAGE__

  if (page === 'command-center') {
    return <CommandCenterPage />
  }

  const studentId = window.__STUDENT_ID__ || window.location.pathname.split('/').pop() || 'demo'
  return <StudentDetailPage studentId={studentId} />
}
