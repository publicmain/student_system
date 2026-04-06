import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Loader2, Sparkles, ExternalLink } from 'lucide-react'

const examples = [
  '所有冲刺申请的截止日',
  '哪些学生还没提交申请',
  'G5大学的申请进度',
  '新加坡路线的申请',
]

const statusLabels = {
  pending: '准备中', applied: '已提交', submitted: '已提交',
  offer: 'Offer', conditional_offer: 'Con.Offer', unconditional_offer: 'Unc.Offer',
  firm: '已确认', insurance: 'Insurance', enrolled: '已入学',
  declined: '已拒绝', rejected: '被拒', withdrawn: '已撤回',
}

const statusDots = {
  pending: 'bg-yellow-400', applied: 'bg-blue-400', submitted: 'bg-blue-400',
  offer: 'bg-green-400', conditional_offer: 'bg-green-400', unconditional_offer: 'bg-emerald-500',
  firm: 'bg-purple-500', insurance: 'bg-purple-400', enrolled: 'bg-brand-500',
  declined: 'bg-red-400', rejected: 'bg-red-500', withdrawn: 'bg-gray-400',
}

const tierStyles = {
  '冲刺': 'text-red-600 dark:text-red-400',
  '意向': 'text-blue-600 dark:text-blue-400',
  '保底': 'text-green-600 dark:text-green-400',
}

/* ── 根据用户查询关键词，判断用户最关心的字段 ── */
function detectFocus(query) {
  if (!query) return 'general'
  const q = query.toLowerCase()
  if (/截止|deadline|due|日期|时间/.test(q)) return 'deadline'
  if (/状态|进度|进展|offer|录取|结果/.test(q)) return 'status'
  if (/梯度|冲刺|意向|保底|tier/.test(q)) return 'tier'
  if (/路线|route|uk|us|sg|hk|au/.test(q)) return 'route'
  if (/学生|谁|哪些人/.test(q)) return 'student'
  return 'general'
}

function formatDeadline(d) {
  if (!d) return { text: '—', cls: 'text-ink-tertiary dark:text-slate-500' }
  const target = new Date(d)
  if (isNaN(target)) return { text: d, cls: '' }
  const now = new Date(); now.setHours(0,0,0,0); target.setHours(0,0,0,0)
  const days = Math.round((target - now) / 86400000)
  const y = target.getFullYear(), m = target.getMonth()+1, day = target.getDate()
  const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  if (days < 0) return { text: dateStr, sub: `逾期${Math.abs(days)}天`, cls: 'text-red-600 dark:text-red-400 font-bold' }
  if (days <= 7) return { text: dateStr, sub: `${days}天后`, cls: 'text-amber-600 dark:text-amber-400 font-semibold' }
  if (days <= 30) return { text: dateStr, sub: `${days}天后`, cls: 'text-amber-500 dark:text-amber-300' }
  return { text: dateStr, sub: `${days}天后`, cls: 'text-ink-primary dark:text-slate-200' }
}

function handleRowClick(app) {
  // 跳转到学生详情页
  if (app.student_id) {
    window.location.hash = `#student-detail?id=${app.student_id}`
  }
}

export default function NLQueryInput({ result, loading, onQuery }) {
  const [query, setQuery] = useState('')
  const focus = detectFocus(query)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (query.trim()) onQuery(query.trim())
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-ink-tertiary dark:text-slate-400">
        用自然语言查询申请数据
      </p>

      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="例如：哪些学生的申请快到截止日了？"
          className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-surface-3 dark:border-slate-600 bg-white dark:bg-slate-800 text-ink-primary dark:text-slate-100 placeholder:text-ink-tertiary dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
        />
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary dark:text-slate-400" />
        {loading && <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-brand-600" />}
      </form>

      {/* Example Queries */}
      {!result && !loading && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-ink-tertiary dark:text-slate-500">试试这些：</p>
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => { setQuery(ex); onQuery(ex) }}
              className="block w-full text-left text-[11px] text-brand-600 dark:text-brand-400 hover:underline py-0.5"
            >
              &ldquo;{ex}&rdquo;
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {result?.error && (
        <p className="text-[11px] text-red-500">{result.error}</p>
      )}

      {/* AI Explanation */}
      {result?.explanation && (
        <div className="p-2 rounded-lg bg-brand-50/50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800">
          <p className="text-[11px] text-brand-700 dark:text-brand-300 flex items-start gap-1">
            <Sparkles size={11} className="mt-0.5 flex-shrink-0" />
            <span>{result.explanation}</span>
          </p>
        </div>
      )}

      {/* Results Table */}
      {result?.results && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-ink-tertiary dark:text-slate-500">
            找到 {result.results.length} 条结果
            <span className="ml-1 text-ink-quaternary">（点击查看详情）</span>
          </p>

          {/* ── 截止日焦点模式：大字体日期优先 ── */}
          {focus === 'deadline' && (
            <div className="overflow-y-auto max-h-[calc(100vh-380px)] scrollbar-thin space-y-0.5">
              {[...result.results]
                .sort((a, b) => {
                  if (!a.submit_deadline) return 1
                  if (!b.submit_deadline) return -1
                  return new Date(a.submit_deadline) - new Date(b.submit_deadline)
                })
                .map((app, i) => {
                  const dl = formatDeadline(app.submit_deadline)
                  return (
                    <motion.div
                      key={app.id || i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.015 }}
                      onClick={() => handleRowClick(app)}
                      className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-surface-2 dark:hover:bg-slate-700/50 transition-colors group border border-transparent hover:border-surface-3 dark:hover:border-slate-600"
                    >
                      {/* 截止日 — 最突出 */}
                      <div className="w-[85px] flex-shrink-0 text-right">
                        <div className={`text-[12px] leading-tight ${dl.cls}`}>{dl.text}</div>
                        {dl.sub && <div className={`text-[10px] leading-tight ${dl.cls}`}>{dl.sub}</div>}
                      </div>
                      <div className="w-px h-8 bg-surface-3 dark:bg-slate-600 flex-shrink-0" />
                      {/* 申请信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDots[app.status] || 'bg-gray-400'}`} />
                          <span className="text-[11px] font-medium text-ink-primary dark:text-slate-200 truncate">
                            {app.uni_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] text-ink-tertiary dark:text-slate-400 truncate">
                            {app.student_name}
                          </span>
                          {app.tier && (
                            <span className={`text-[9px] ${tierStyles[app.tier] || ''}`}>
                              {app.tier}
                            </span>
                          )}
                        </div>
                      </div>
                      <ExternalLink size={10} className="text-ink-quaternary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </motion.div>
                  )
                })}
            </div>
          )}

          {/* ── 状态焦点模式：按状态分组 ── */}
          {focus === 'status' && (
            <div className="overflow-y-auto max-h-[calc(100vh-380px)] scrollbar-thin space-y-0.5">
              {result.results.map((app, i) => (
                <motion.div
                  key={app.id || i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.015 }}
                  onClick={() => handleRowClick(app)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-surface-2 dark:hover:bg-slate-700/50 transition-colors group border border-transparent hover:border-surface-3 dark:hover:border-slate-600"
                >
                  {/* 状态 — 最突出 */}
                  <div className="flex items-center gap-1 w-[70px] flex-shrink-0">
                    <span className={`w-2 h-2 rounded-full ${statusDots[app.status] || 'bg-gray-400'}`} />
                    <span className="text-[11px] font-semibold text-ink-primary dark:text-slate-200">
                      {statusLabels[app.status] || app.status}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-ink-primary dark:text-slate-200 truncate">
                      {app.uni_name}
                    </div>
                    <div className="text-[10px] text-ink-tertiary dark:text-slate-400 truncate">
                      {app.student_name} · {app.department || ''}
                    </div>
                  </div>
                  <ExternalLink size={10} className="text-ink-quaternary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </motion.div>
              ))}
            </div>
          )}

          {/* ── 通用模式：紧凑表格 ── */}
          {(focus !== 'deadline' && focus !== 'status') && (
            <div className="overflow-y-auto max-h-[calc(100vh-380px)] scrollbar-thin">
              {/* 表头 */}
              <div className="flex items-center gap-1 px-2 py-1 text-[9px] font-medium text-ink-tertiary dark:text-slate-500 uppercase tracking-wider border-b border-surface-2 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
                <span className="flex-1">院校 / 专业</span>
                <span className="w-[50px] text-center">梯度</span>
                <span className="w-[55px] text-right">截止日</span>
              </div>
              {result.results.map((app, i) => {
                const dl = formatDeadline(app.submit_deadline)
                return (
                  <motion.div
                    key={app.id || i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.015 }}
                    onClick={() => handleRowClick(app)}
                    className="flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-surface-2 dark:hover:bg-slate-700/50 transition-colors group border-b border-surface-1 dark:border-slate-700/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDots[app.status] || 'bg-gray-400'}`} />
                        <span className="text-[11px] font-medium text-ink-primary dark:text-slate-200 truncate">
                          {app.uni_name}
                        </span>
                      </div>
                      <div className="text-[10px] text-ink-tertiary dark:text-slate-400 truncate pl-3">
                        {app.student_name}{app.department ? ` · ${app.department}` : ''}
                      </div>
                    </div>
                    {app.tier && (
                      <span className={`text-[10px] w-[50px] text-center font-medium flex-shrink-0 ${tierStyles[app.tier] || 'text-ink-tertiary'}`}>
                        {app.tier}
                      </span>
                    )}
                    <div className={`w-[55px] text-right flex-shrink-0 text-[10px] leading-tight ${dl.cls}`}>
                      {dl.text !== '—' ? dl.text.slice(5) : '—'}
                      {dl.sub && <div className="text-[9px]">{dl.sub}</div>}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
