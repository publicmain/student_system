import { useState, useCallback } from 'react'

/**
 * 管理概览 Grid 卡片顺序和宽度
 * key 参数 = studentId，每个学生独立保存布局
 */
export function useGridLayout(defaultCards, key = 'default') {
  const storageKey = `student-overview-layout:${key}`

  const [cards, setCards] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
      if (!saved.length) return defaultCards
      const savedMap = Object.fromEntries(saved.map(c => [c.id, c]))
      // 按保存顺序重建，追加新卡片到末尾
      const merged = saved
        .filter(s => defaultCards.find(d => d.id === s.id))
        .map(s => ({ ...defaultCards.find(d => d.id === s.id), span: s.span }))
      defaultCards.forEach(d => { if (!savedMap[d.id]) merged.push(d) })
      return merged
    } catch { return defaultCards }
  })

  const persist = useCallback((next) => {
    localStorage.setItem(storageKey, JSON.stringify(next.map(c => ({ id: c.id, span: c.span }))))
  }, [storageKey])

  const reorder = useCallback((newCards) => {
    setCards(newCards)
    persist(newCards)
  }, [persist])

  const toggleSpan = useCallback((id) => {
    setCards(prev => {
      const next = prev.map(c => c.id === id ? { ...c, span: c.span === 1 ? 2 : 1 } : c)
      persist(next)
      return next
    })
  }, [persist])

  const reset = useCallback(() => {
    localStorage.removeItem(storageKey)
    setCards(defaultCards)
  }, [storageKey, defaultCards])

  return { cards, reorder, toggleSpan, reset }
}
