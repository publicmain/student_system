/**
 * Shared date utility for deadline calculations
 */
export function daysUntilDeadline(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24))
}

export function deadlineStatus(dateStr) {
  const days = daysUntilDeadline(dateStr)
  if (days === null) return { days: null, isUrgent: false, isOverdue: false }
  return {
    days,
    isUrgent: days <= 7 && days >= 0,
    isOverdue: days < 0,
  }
}
