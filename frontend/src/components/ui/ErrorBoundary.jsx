import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-ink-secondary dark:text-slate-400">
          <AlertTriangle size={40} className="text-amber-500" />
          <h2 className="text-lg font-semibold text-ink-primary dark:text-slate-200">
            页面渲染出错
          </h2>
          <p className="text-sm max-w-md text-center">
            {this.state.error?.message || '发生了意外错误'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <RefreshCw size={14} />
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
