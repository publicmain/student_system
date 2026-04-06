import { User } from 'lucide-react'
import { DraggableCard } from './DraggableCard.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'

function InfoRow({ label, value }) {
  return (
    <div className="flex py-2.5 border-b border-surface-2 last:border-0 gap-4">
      <span className="text-xs text-ink-tertiary font-medium w-20 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-xs text-ink-primary flex-1">{value || '—'}</span>
    </div>
  )
}

function isUnder14(dob) {
  if (!dob) return false
  const diff = Date.now() - new Date(dob).getTime()
  return diff / (365.25 * 24 * 3600 * 1000) < 14
}

export function BasicInfoCard({ id, span, onToggle, student }) {
  const under14 = isUnder14(student?.date_of_birth)
  return (
    <DraggableCard id={id} span={span} onToggle={onToggle}
      title="基本信息" icon={User} iconColor="text-brand-600"
    >
      <InfoRow label="姓名" value={student?.name} />
      {student?.gender && <InfoRow label="性别" value={student.gender} />}
      <InfoRow label="年级" value={student?.grade_level} />
      <InfoRow label="考试局" value={student?.exam_board} />
      <InfoRow label="入学日期" value={student?.enrol_date?.slice(0, 10)} />
      <InfoRow
        label="出生日期"
        value={
          <span className="flex items-center gap-2">
            {student?.date_of_birth?.slice(0, 10) || '—'}
            {under14 && <Badge color="amber">未满14岁</Badge>}
          </span>
        }
      />
      {student?.nationality && <InfoRow label="国籍" value={student.nationality} />}
      {student?.current_school && <InfoRow label="原就读学校" value={student.current_school} />}
      {student?.phone && <InfoRow label="电话" value={student.phone} />}
      {student?.email && <InfoRow label="邮箱" value={student.email} />}
      {student?.wechat && <InfoRow label="微信" value={student.wechat} />}
      {student?.address && <InfoRow label="地址" value={student.address} />}
      {student?.target_countries && <InfoRow label="意向国家" value={student.target_countries} />}
      {student?.target_major && <InfoRow label="意向专业" value={student.target_major} />}
      {student?.health_notes && <InfoRow label="健康/特殊需求" value={student.health_notes} />}
      {student?.notes && <InfoRow label="备注" value={student.notes} />}
    </DraggableCard>
  )
}
