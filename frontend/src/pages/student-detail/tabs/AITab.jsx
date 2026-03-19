import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, RefreshCw, AlertCircle, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../../../lib/api.js'
import { Button } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'

export function AITab({ studentId, canEdit }) {
  const [plan, setPlan]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [generating, setGen]    = useState(false)
  const [error, setError]       = useState(null)

  const fetchPlan = async () => {
    setLoading(true)
    try {
      const data = await api.ai.get(studentId)
      setPlan(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPlan() }, [studentId])

  const generate = async () => {
    setGen(true)
    try {
      await api.ai.generate(studentId)
      await fetchPlan()
    } catch (e) {
      setError(e.message)
    } finally {
      setGen(false)
    }
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-ink-tertiary">
      <Loader2 size={24} className="animate-spin text-brand-500" />
      <span className="text-sm">加载 AI 规划…</span>
    </div>
  )

  return (
    <div>
      {/* 顶栏 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-ink-primary dark:text-slate-100">AI 升学规划路线图</h2>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" icon={RefreshCw} size="sm" onClick={fetchPlan}>刷新</Button>
            <Button variant="warning" icon={Sparkles} size="sm" loading={generating} onClick={generate}>
              生成 AI 规划
            </Button>
          </div>
        )}
      </div>

      {/* 免责声明 */}
      <div className="text-xs text-ink-tertiary bg-surface-2 dark:bg-slate-800 rounded-card px-3 py-2 mb-6">
        AI 规划由模型辅助生成，须经规划师审核批准后方可发布。概率估算来自本系统历史数据，不构成录取承诺。
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-card bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 mb-4">
          <AlertCircle size={13} />{error}
        </div>
      )}

      {!plan || (!plan.content && !plan.sections) ? (
        <EmptyState
          icon={Sparkles}
          label={'暂无 AI 规划，点击"生成 AI 规划"创建'}
          action={canEdit && (
            <Button variant="warning" icon={Sparkles} size="sm" loading={generating} onClick={generate}>
              生成 AI 规划
            </Button>
          )}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="prose prose-sm dark:prose-invert max-w-none"
        >
          {/* 渲染 markdown 内容（简单版） */}
          <div
            className="text-sm text-ink-secondary dark:text-slate-300 leading-relaxed whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: plan.content || JSON.stringify(plan.sections, null, 2) }}
          />
        </motion.div>
      )}
    </div>
  )
}
