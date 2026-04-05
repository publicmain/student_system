import { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal.jsx'
import { api } from '../../lib/api.js'
import { Loader2 } from 'lucide-react'

function FieldRow({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-ink-secondary dark:text-slate-300 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-surface-3 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-ink-primary dark:text-slate-100 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500'
const btnPrimary = 'px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors'
const btnSecondary = 'px-4 py-2 text-sm font-medium rounded-lg border border-surface-3 dark:border-slate-600 text-ink-secondary dark:text-slate-300 hover:bg-surface-1 dark:hover:bg-slate-700 transition-colors'

// ── Edit Student ────────────────────────────────────
export function EditStudentModal({ open, onClose, student, studentId, onSuccess }) {
  const [form, setForm] = useState({ name: '', grade_level: '', date_of_birth: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && student) {
      setForm({
        name: student.name || '',
        grade_level: student.grade_level || '',
        date_of_birth: student.date_of_birth?.slice(0, 10) || '',
        notes: student.notes || '',
      })
    }
  }, [open, student])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return alert('姓名不能为空')
    setSaving(true)
    try {
      await api.student.update(studentId, form)
      onSuccess()
      onClose()
    } catch (err) { alert('保存失败: ' + err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="编辑学生信息">
      <form onSubmit={handleSubmit}>
        <FieldRow label="姓名 *">
          <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        </FieldRow>
        <FieldRow label="年级">
          <input className={inputCls} value={form.grade_level} onChange={e => setForm(f => ({ ...f, grade_level: e.target.value }))} placeholder="如 Year 12" />
        </FieldRow>
        <FieldRow label="出生日期">
          <input type="date" className={inputCls} value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
        </FieldRow>
        <FieldRow label="备注">
          <textarea className={inputCls + ' h-20 resize-none'} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </FieldRow>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className={btnSecondary}>取消</button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}保存
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Assign Mentor ───────────────────────────────────
export function AssignMentorModal({ open, onClose, studentId, onSuccess }) {
  const [staff, setStaff] = useState([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/staff', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setStaff(Array.isArray(data) ? data : data.staff || []))
      .catch(() => setStaff([]))
      .finally(() => setLoading(false))
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selected) return alert('请选择导师')
    setSaving(true)
    try {
      await api.mentor.assign(studentId, selected)
      onSuccess()
      onClose()
    } catch (err) { alert('分配失败: ' + err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="分配导师">
      <form onSubmit={handleSubmit}>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-brand-500" /></div>
        ) : (
          <FieldRow label="选择导师 *">
            <select className={inputCls} value={selected} onChange={e => setSelected(e.target.value)} required>
              <option value="">请选择...</option>
              {staff.filter(s => ['counselor', 'mentor'].includes(s.role)).map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.role === 'counselor' ? '规划师' : '导师'}) — 当前 {s.current_students || 0} 名学生</option>
              ))}
            </select>
          </FieldRow>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className={btnSecondary}>取消</button>
          <button type="submit" disabled={saving || loading} className={btnPrimary}>
            {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}确认分配
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Add Target University ───────────────────────────
export function AddTargetModal({ open, onClose, studentId, onSuccess }) {
  const [form, setForm] = useState({ uni_name: '', department: '', tier: 'target', rationale: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setForm({ uni_name: '', department: '', tier: 'target', rationale: '' }) }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.uni_name.trim()) return alert('院校名称不能为空')
    setSaving(true)
    try {
      await api.target.add(studentId, form)
      onSuccess()
      onClose()
    } catch (err) { alert('添加失败: ' + err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="添加目标院校">
      <form onSubmit={handleSubmit}>
        <FieldRow label="院校名称 *">
          <input className={inputCls} value={form.uni_name} onChange={e => setForm(f => ({ ...f, uni_name: e.target.value }))} placeholder="如 Imperial College London" required />
        </FieldRow>
        <FieldRow label="专业/院系">
          <input className={inputCls} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="如 Computer Science" />
        </FieldRow>
        <FieldRow label="梯度">
          <select className={inputCls} value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))}>
            <option value="reach">冲刺 (Reach)</option>
            <option value="target">意向 (Target)</option>
            <option value="safety">保底 (Safety)</option>
          </select>
        </FieldRow>
        <FieldRow label="选择理由">
          <textarea className={inputCls + ' h-16 resize-none'} value={form.rationale} onChange={e => setForm(f => ({ ...f, rationale: e.target.value }))} />
        </FieldRow>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className={btnSecondary}>取消</button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}添加
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Add Parent ──────────────────────────────────────
export function AddParentModal({ open, onClose, studentId, onSuccess }) {
  const [form, setForm] = useState({ name: '', relation: 'mother', phone: '', email: '', wechat: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setForm({ name: '', relation: 'mother', phone: '', email: '', wechat: '' }) }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return alert('姓名不能为空')
    setSaving(true)
    try {
      await api.parent.add(studentId, form)
      onSuccess()
      onClose()
    } catch (err) { alert('添加失败: ' + err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="添加家长/监护人">
      <form onSubmit={handleSubmit}>
        <FieldRow label="姓名 *">
          <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        </FieldRow>
        <FieldRow label="关系">
          <select className={inputCls} value={form.relation} onChange={e => setForm(f => ({ ...f, relation: e.target.value }))}>
            <option value="mother">母亲</option>
            <option value="father">父亲</option>
            <option value="guardian">监护人</option>
            <option value="other">其他</option>
          </select>
        </FieldRow>
        <FieldRow label="电话">
          <input className={inputCls} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </FieldRow>
        <FieldRow label="邮箱">
          <input type="email" className={inputCls} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </FieldRow>
        <FieldRow label="微信">
          <input className={inputCls} value={form.wechat} onChange={e => setForm(f => ({ ...f, wechat: e.target.value }))} />
        </FieldRow>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className={btnSecondary}>取消</button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}添加
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Add Assessment ──────────────────────────────────
export function AddAssessmentModal({ open, onClose, studentId, onSuccess }) {
  const [form, setForm] = useState({ assess_type: 'SAT', assess_date: '', subject: '', score: '', max_score: '100', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setForm({ assess_type: 'SAT', assess_date: new Date().toISOString().slice(0, 10), subject: '', score: '', max_score: '100', notes: '' }) }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.assess_date) return alert('请选择评估日期')
    const body = { ...form, score: form.score ? Number(form.score) : undefined, max_score: form.max_score ? Number(form.max_score) : undefined }
    setSaving(true)
    try {
      await api.assessment.create(studentId, body)
      onSuccess()
      onClose()
    } catch (err) { alert('添加失败: ' + err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="添加评估记录">
      <form onSubmit={handleSubmit}>
        <FieldRow label="评估类型 *">
          <select className={inputCls} value={form.assess_type} onChange={e => setForm(f => ({ ...f, assess_type: e.target.value }))}>
            {['SAT', 'ACT', 'AP', 'IB', 'A-Level', 'GCSE', 'IELTS', 'TOEFL', 'GRE', 'GMAT', 'Other'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="评估日期 *">
          <input type="date" className={inputCls} value={form.assess_date} onChange={e => setForm(f => ({ ...f, assess_date: e.target.value }))} required />
        </FieldRow>
        <FieldRow label="科目">
          <input className={inputCls} value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="如 Mathematics" />
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="分数">
            <input type="number" className={inputCls} value={form.score} onChange={e => setForm(f => ({ ...f, score: e.target.value }))} />
          </FieldRow>
          <FieldRow label="满分">
            <input type="number" className={inputCls} value={form.max_score} onChange={e => setForm(f => ({ ...f, max_score: e.target.value }))} />
          </FieldRow>
        </div>
        <FieldRow label="备注">
          <textarea className={inputCls + ' h-16 resize-none'} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </FieldRow>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className={btnSecondary}>取消</button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}添加
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Add Subject ─────────────────────────────────────
export function AddSubjectModal({ open, onClose, studentId, onSuccess }) {
  const [subjects, setSubjects] = useState([])
  const [form, setForm] = useState({ subject_id: '', level: '', exam_board: '' })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api.subject.list()
      .then(data => setSubjects(Array.isArray(data) ? data : data.subjects || []))
      .catch(() => setSubjects([]))
      .finally(() => setLoading(false))
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.subject_id) return alert('请选择科目')
    setSaving(true)
    try {
      await api.subject.add(studentId, form)
      onSuccess()
      onClose()
    } catch (err) { alert('添加失败: ' + err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="添加科目">
      <form onSubmit={handleSubmit}>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-brand-500" /></div>
        ) : (
          <>
            <FieldRow label="科目 *">
              <select className={inputCls} value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} required>
                <option value="">请选择...</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </FieldRow>
            <FieldRow label="级别">
              <input className={inputCls} value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))} placeholder="如 A-Level, Higher" />
            </FieldRow>
            <FieldRow label="考试局">
              <input className={inputCls} value={form.exam_board} onChange={e => setForm(f => ({ ...f, exam_board: e.target.value }))} placeholder="如 Edexcel, CIE" />
            </FieldRow>
          </>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className={btnSecondary}>取消</button>
          <button type="submit" disabled={saving || loading} className={btnPrimary}>
            {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}添加
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Placeholder Modals (Coming Soon) ────────────────
export function ComingSoonModal({ open, onClose, title }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-center py-6">
        <p className="text-sm text-ink-secondary dark:text-slate-300 mb-2">此功能即将上线</p>
        <p className="text-xs text-ink-tertiary dark:text-slate-500">请稍后再试</p>
      </div>
      <div className="flex justify-end">
        <button onClick={onClose} className={btnSecondary}>关闭</button>
      </div>
    </Modal>
  )
}
