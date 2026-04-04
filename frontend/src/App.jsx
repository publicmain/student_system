import StudentDetailPage from './pages/student-detail/StudentDetailPage.jsx'
import CommandCenterPage from './pages/command-center/CommandCenterPage.jsx'
import ErrorBoundary from './components/ui/ErrorBoundary.jsx'

export default function App() {
  const page = window.__PAGE__

  if (page === 'command-center') {
    return (
      <ErrorBoundary>
        <CommandCenterPage />
      </ErrorBoundary>
    )
  }

  const studentId = window.__STUDENT_ID__ || window.location.pathname.split('/').pop() || 'demo'
  return (
    <ErrorBoundary>
      <StudentDetailPage studentId={studentId} />
    </ErrorBoundary>
  )
}
