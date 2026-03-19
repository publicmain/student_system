import { useState, useCallback } from 'react'

const STORAGE_KEY = 'student-overview-grid-layout'

/**
 * 管理概览 Grid 的卡片顺序和宽度
 * 持久化到 localStorage，刷新后恢复
 */
export function useGridLayout(defaultCards) {
  const [cards, setCards] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      if (saved.length === 0) return defaultCards

      // 用保存的顺序 + span 合并默认卡片（防止新卡片丢失）
      const savedMap = Object.fromEntries(saved.map(c => [c.id, c]))
      const merged = saved
        .filter(s => defaultCards.find(d => d.id === s.id))
        .map(s => ({ ...defaultCards.find(d => d.id === s.id), span: s.span }))

      // 追加没有保存记录的新卡片
      defaultCards.forEach(d => {
        if (!savedMap[d.id]) merged.push(d)
      })
      return merged
    } catch {
      return defaultCards
    }
  })

  // 拖拽结束后更新顺序
  const reorder = useCallback((newCards) => {
    setCards(newCards)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newCards.map(c => ({ id: c.id, span: c.span }))))
  }, [])

  // 切换卡片宽度（span 1 ↔ 2）
  const toggleSpan = useCallback((id) => {
    setCards(prev => {
      const next = prev.map(c => c.id === id ? { ...c, span: c.span === 1 ? 2 : 1 } : c)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map(c => ({ id: c.id, span: c.span }))))
      return next
    })
  }, [])

  // 重置为默认布局
  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setCards(defaultCards)
  }, [defaultCards])

  return { cards, reorder, toggleSpan, reset }
}
