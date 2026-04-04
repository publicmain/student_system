import { FileText, Send, Trophy, AlertTriangle } from 'lucide-react'
import StatCard from '../../components/ui/StatCard.jsx'

export default function StatCards({ stats, riskCount }) {
  if (!stats) return null
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard icon={FileText}       label="总申请" value={stats.total}     color="brand"  delay={0}    />
      <StatCard icon={Send}           label="已提交" value={stats.submitted} color="blue"   delay={0.05} />
      <StatCard icon={Trophy}         label="Offer"  value={stats.offers}    color="green"  delay={0.1}  />
      <StatCard icon={AlertTriangle}  label="风险"   value={stats.atRisk}    color="red"    delay={0.15} />
    </div>
  )
}
