import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../lib/api.js'

const STATUS_COLUMNS = [
  { key: 'pending',   label: '准备中',       color: 'slate'  },
  { key: 'applied',   label: '已提交',       color: 'blue'   },
  { key: 'submitted', label: '已提交(alt)',   color: 'blue'   },
  { key: 'offer',     label: '收到Offer',    color: 'green'  },
  { key: 'conditional_offer', label: '有条件录取', color: 'green' },
  { key: 'unconditional_offer', label: '无条件录取', color: 'emerald' },
  { key: 'firm',      label: 'Firm选择',     color: 'purple' },
  { key: 'insurance', label: 'Insurance',    color: 'purple' },
  { key: 'enrolled',  label: '已入学',       color: 'brand'  },
  { key: 'accepted',  label: '已接受',       color: 'brand'  },
  { key: 'declined',  label: '已拒绝',       color: 'red'    },
  { key: 'rejected',  label: '被拒绝',       color: 'red'    },
  { key: 'withdrawn', label: '已撤回',       color: 'red'    },
  { key: 'waitlisted',label: '等候名单',     color: 'amber'  },
  { key: 'draft',     label: '草稿',         color: 'slate'  },
]

// Kanban 合并列（把相似状态归入同一列）
const KANBAN_COLUMNS = [
  { id: 'preparing', label: '准备中',    statuses: ['pending', 'draft'],                 color: 'slate'  },
  { id: 'submitted', label: '已提交',    statuses: ['applied', 'submitted'],              color: 'blue'   },
  { id: 'offer',     label: '收到Offer', statuses: ['offer', 'conditional_offer', 'unconditional_offer', 'offer_received'], color: 'green'  },
  { id: 'accepted',  label: '已确认',    statuses: ['accepted', 'firm', 'insurance'],     color: 'purple' },
  { id: 'enrolled',  label: '已入学',    statuses: ['enrolled'],                          color: 'brand'  },
  { id: 'closed',    label: '已关闭',    statuses: ['declined', 'rejected', 'withdrawn', 'waitlisted'], color: 'red' },
]

export { STATUS_COLUMNS, KANBAN_COLUMNS }

export function useCommandCenter() {
  const [apps, setApps] = useState([])
  const [stats, setStats] = useState(null)
  const [riskAlerts, setRiskAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 从 URL 参数恢复筛选状态
  const initFromURL = () => {
    const hash = window.location.hash || ''
    const qIdx = hash.indexOf('?')
    if (qIdx === -1) return { search: '', filters: { cycle_year: null, route: null, tier: null, status: null }, viewMode: 'kanban' }
    const params = new URLSearchParams(hash.slice(qIdx + 1))
    return {
      search: params.get('q') || '',
      filters: {
        cycle_year: params.get('year') || null,
        route: params.get('route') || null,
        tier: params.get('tier') || null,
        status: params.get('status') || null,
      },
      viewMode: params.get('view') || 'kanban',
    }
  }
  const init = initFromURL()
  const [search, setSearch] = useState(init.search)
  const [filters, setFilters] = useState(init.filters)
  const [viewMode, setViewMode] = useState(init.viewMode)

  // 同步筛选条件到 URL（不触发页面跳转）
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (filters.cycle_year) params.set('year', filters.cycle_year)
    if (filters.route) params.set('route', filters.route)
    if (filters.tier) params.set('tier', filters.tier)
    if (filters.status) params.set('status', filters.status)
    if (viewMode !== 'kanban') params.set('view', viewMode)
    const qs = params.toString()
    const base = 'command-center'
    const newHash = qs ? `${base}?${qs}` : base
    if (window.location.hash !== '#' + newHash) {
      history.replaceState(null, '', '#' + newHash)
    }
  }, [search, filters, viewMode])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsRes, alertsRes, appsRes] = await Promise.all([
        api.commandCenter.stats(),
        api.commandCenter.riskAlerts(),
        api.commandCenter.allApps(),
      ])
      setStats(statsRes)
      setRiskAlerts(alertsRes.alerts || [])
      setApps(appsRes.applications || appsRes || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Apply client-side filters
  const filteredApps = useMemo(() => {
    let list = Array.isArray(apps) ? apps : []
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        (a.uni_name || '').toLowerCase().includes(q) ||
        (a.department || '').toLowerCase().includes(q) ||
        (a.student_name || '').toLowerCase().includes(q) ||
        (a.program || '').toLowerCase().includes(q)
      )
    }
    if (filters.cycle_year) list = list.filter(a => String(a.cycle_year) === String(filters.cycle_year))
    if (filters.route)      list = list.filter(a => a.route === filters.route)
    if (filters.tier)       list = list.filter(a => a.tier === filters.tier)
    if (filters.status)     list = list.filter(a => a.status === filters.status)
    return list
  }, [apps, search, filters])

  // Group by Kanban columns
  const kanbanData = useMemo(() => {
    return KANBAN_COLUMNS.map(col => ({
      ...col,
      apps: filteredApps.filter(a => col.statuses.includes(a.status)),
    }))
  }, [filteredApps])

  // Update app status (optimistic with rollback)
  const updateAppStatus = useCallback(async (appId, newStatus) => {
    const id = String(appId)
    // 保存原始状态和申请信息用于回滚和入学处理
    let prevStatus = null
    let targetApp = null
    setApps(prev => {
      const target = prev.find(a => String(a.id) === id)
      if (target) {
        prevStatus = target.status
        targetApp = target
      }
      return prev.map(a => String(a.id) === id ? { ...a, status: newStatus } : a)
    })
    try {
      await api.commandCenter.updateApp(id, { status: newStatus })

      // 状态变更成功后刷新统计和风险数据（保持一致性）
      Promise.all([
        api.commandCenter.stats().then(setStats).catch(() => {}),
        api.commandCenter.riskAlerts().then(r => setRiskAlerts(r.alerts || [])).catch(() => {}),
      ])

      // Feature 6: 当状态变更为 enrolled 时，提示创建入学案例
      if (newStatus === 'enrolled' && prevStatus !== 'enrolled' && targetApp) {
        const studentName = targetApp.student_name || '该学生'
        const uniName = targetApp.uni_name || '未知院校'
        const shouldCreate = window.confirm(
          `${studentName} 已确认入学 ${uniName}，是否创建入学管理案例？\n\n` +
          `将自动创建入学案例，包含签证办理和到达登记。`
        )
        if (shouldCreate) {
          try {
            const resp = await fetch('/api/intake-cases', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                student_name: targetApp.student_name,
                intake_year: targetApp.cycle_year || new Date().getFullYear(),
                program_name: `${uniName} - ${targetApp.department || targetApp.program || '主课程'}`,
              }),
            })
            const data = await resp.json().catch(() => ({}))
            if (!resp.ok) throw new Error(data.error || '创建失败')
            alert('入学案例已创建！可在入学管理模块中查看。')
          } catch (e) {
            alert('入学案例创建失败: ' + e.message)
          }
        }
      }
    } catch (e) {
      // 回滚到原始状态
      if (prevStatus !== null) {
        setApps(prev => prev.map(a => String(a.id) === id ? { ...a, status: prevStatus } : a))
      }
      // 向用户展示转换被拒绝的原因
      alert('状态变更失败: ' + e.message)
    }
  }, [])

  // Filter options from data
  const filterOptions = useMemo(() => {
    const allApps = Array.isArray(apps) ? apps : []
    return {
      cycleYears: [...new Set(allApps.map(a => a.cycle_year).filter(Boolean))].sort().reverse(),
      routes:     [...new Set(allApps.map(a => a.route).filter(Boolean))].sort(),
      tiers:      [...new Set(allApps.map(a => a.tier).filter(Boolean))].sort(),
    }
  }, [apps])

  return {
    apps: filteredApps,
    allApps: apps,
    stats,
    riskAlerts,
    loading,
    error,
    search, setSearch,
    filters, setFilters,
    viewMode, setViewMode,
    kanbanData,
    filterOptions,
    updateAppStatus,
    refresh: fetchAll,
  }
}
