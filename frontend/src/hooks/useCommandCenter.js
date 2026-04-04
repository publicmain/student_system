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

  // Filters
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    cycle_year: null,
    route: null,
    tier: null,
    status: null,
  })
  const [viewMode, setViewMode] = useState('kanban') // kanban | table | timeline

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
    // 保存原始状态用于回滚
    let prevStatus = null
    setApps(prev => {
      const target = prev.find(a => String(a.id) === id)
      if (target) prevStatus = target.status
      return prev.map(a => String(a.id) === id ? { ...a, status: newStatus } : a)
    })
    try {
      await api.commandCenter.updateApp(id, { status: newStatus })
    } catch (e) {
      // 回滚到原始状态
      if (prevStatus !== null) {
        setApps(prev => prev.map(a => String(a.id) === id ? { ...a, status: prevStatus } : a))
      }
      console.error('状态更新失败:', e.message)
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
