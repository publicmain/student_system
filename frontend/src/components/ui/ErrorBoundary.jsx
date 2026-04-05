import { Component } from 'react'
import PropTypes from 'prop-types'
import { AlertTriangle, RefreshCw } from 'lucide-react'

/**
 * SectionErrorBoundary — lightweight, inline error boundary for individual sections.
 * Shows a small inline error message with a retry button instead of a full-page error.
 */
export class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[SectionErrorBoundary]', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle size={18} className="flex-shrink-0 text-red-400" />
          <span className="flex-1 min-w-0 truncate">
            {this.props.name ? `${this.props.name}加载出错` : '此区域加载出错'}
            {this.state.error?.message ? `: ${this.state.error.message}` : ''}
          </span>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-red-100 dark:bg-red-800/30 hover:bg-red-200 dark:hover:bg-red-800/50 text-red-700 dark:text-red-200 transition-colors flex-shrink-0"
          >
            <RefreshCw size={12} />
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

SectionErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  name: PropTypes.string,
}

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
