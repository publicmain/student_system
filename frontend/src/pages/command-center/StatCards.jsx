import { FileText, Send, Trophy, AlertTriangle } from 'lucide-react'
import StatCard from '../../components/ui/StatCard.jsx'

export default function StatCards({ stats, riskCount, filters, onFiltersChange }) {
  if (!stats) return null

  const toggle = (statusGroup) => {
    onFiltersChange(prev => ({
      ...prev,
      status: prev.status === statusGroup ? null : statusGroup,
    }))
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard icon={FileText}       label="总申请" value={stats.total}     color="brand"  delay={0}
        onClick={() => onFiltersChange(prev => ({ ...prev, status: null }))}
        active={!filters?.status} />
      <StatCard icon={Send}           label="已提交" value={stats.submitted} color="blue"   delay={0.05}
        onClick={() => toggle('_submitted')}
        active={filters?.status === '_submitted'} />
      <StatCard icon={Trophy}         label="Offer"  value={stats.offers}    color="green"  delay={0.1}
        onClick={() => toggle('_offer')}
        active={filters?.status === '_offer'} />
      <StatCard icon={AlertTriangle}  label="风险"   value={stats.atRisk}    color="red"    delay={0.15}
        onClick={() => toggle('_risk')}
        active={filters?.status === '_risk'} />
    </div>
  )
}
