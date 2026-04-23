/**
 * app.js — 学生升学与学业规划管理系统 前端
 * 单页应用 (SPA)，Bootstrap 5 + 原生 JS
 */

// ════════════════════════════════════════════════════════
//  全局状态
// ════════════════════════════════════════════════════════
const State = {
  user: null,
  currentPage: null,
  currentStudentId: null,
  currentTaskId: null,
  currentCaseId: null,
  currentMatRequestId: null,
  staffList: [],
  subjectList: [],
  templateItems: [],   // 模板编辑器中的临时任务项列表
  settings: {},        // 系统设置（从 /api/settings 加载）
  settingsDraft: {},   // 设置页面的临时编辑状态
  previousPage: null,  // 上一个访问的页面（用于返回按钮）
  _navGeneration: 0,   // 导航代数计数器，用于检测过期的异步回调
};

// ════════════════════════════════════════════════════════
//  设置辅助函数
// ════════════════════════════════════════════════════════
function getPSQuestions() {
  try {
    const q = JSON.parse(State.settings.ps_questions || '[]');
    if (Array.isArray(q) && q.length > 0) return q;
  } catch(e) {}
  return [
    { label: '第一问：为什么对所选学科感兴趣？（学科动机）', hint: '描述您对该学科的热情、兴趣来源和学习动力...' },
    { label: '第二问：您为学习该学科做了哪些准备？（学业准备）', hint: '描述相关课程、阅读、研究项目、竞赛等学业经历...' },
    { label: '第三问：课外活动如何帮助您为大学学习做准备？（课外准备）', hint: '描述课外活动、实践、社会参与等如何与学科相关联...' },
  ];
}

function getAssessmentTypes() {
  try {
    const a = JSON.parse(State.settings.assessment_types || '[]');
    if (Array.isArray(a) && a.length > 0) return a;
  } catch(e) {}
  return [
    { name: '数学测评', max: 100, subs: false }, { name: '英语测评', max: 100, subs: false },
    { name: '雅思 IELTS', max: 9, subs: true }, { name: '托福 TOEFL', max: 120, subs: false },
    { name: 'SAT', max: 1600, subs: false }, { name: 'ACT', max: 36, subs: false },
    { name: 'A-Level模考', max: 100, subs: false }, { name: '面试评估', max: 100, subs: false },
    { name: '综合测评', max: 100, subs: false }, { name: '其他', max: 100, subs: false },
  ];
}

function getTaskCategories() {
  try {
    const c = JSON.parse(State.settings.task_categories || '[]');
    if (Array.isArray(c) && c.length > 0) return c;
  } catch(e) {}
  return ['材料', '申请', '考试', '面试', '沟通', '其他'];
}

function getAppRoutes() {
  try {
    const r = JSON.parse(State.settings.app_routes || '[]');
    if (Array.isArray(r) && r.length > 0) return r;
  } catch(e) {}
  return ['UK-UG', 'US', 'CA', 'AU', '通用'];
}

function getAppTiers() {
  try {
    const t = JSON.parse(State.settings.app_tiers || '[]');
    if (Array.isArray(t) && t.length > 0) return t;
  } catch(e) {}
  return ['冲刺', '意向', '保底', '通用'];
}

function getSubjectLevels() {
  try {
    const l = JSON.parse(State.settings.subject_levels || '[]');
    if (Array.isArray(l) && l.length > 0) return l;
  } catch(e) {}
  return ['A2', 'AS', 'Full A-Level', 'O-Level', 'IGCSE', '其他'];
}

function getExamBoards() {
  try {
    const b = JSON.parse(State.settings.exam_boards || '[]');
    if (Array.isArray(b) && b.length > 0) return b;
  } catch(e) {}
  return ['GCE A-Level', 'GCE O-Level', 'CIE A-Level', 'Edexcel A-Level', 'CIE IGCSE'];
}

function getSubjectList() {
  try {
    const s = JSON.parse(State.settings.subject_list || '[]');
    if (Array.isArray(s) && s.length > 0) return s;
  } catch(e) {}
  return [];
}

// ── 入学管理 ──
function getIntakeCaseStatuses() {
  try { const v = JSON.parse(State.settings.intake_case_statuses || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['registered','collecting_docs','contract_signed','visa_in_progress','ipa_received','paid','arrived','oriented','closed'];
}
function getIntakeAllowedTransitions() {
  try { const v = JSON.parse(State.settings.intake_allowed_transitions || '{}'); if (typeof v === 'object' && Object.keys(v).length) return v; } catch(e) {}
  return { registered:['collecting_docs'], collecting_docs:['registered','contract_signed'], contract_signed:['collecting_docs','visa_in_progress'], visa_in_progress:['contract_signed','ipa_received'], ipa_received:['visa_in_progress','paid'], paid:['ipa_received','arrived'], arrived:['paid','oriented'], oriented:['arrived','closed'], closed:[] };
}
function getIntakeAutoTasks() {
  try { const v = JSON.parse(State.settings.intake_auto_tasks || '{}'); if (typeof v === 'object' && Object.keys(v).length) return v; } catch(e) {}
  return { collect_docs_days:14, visa_submit_days:14, fee_followup_days:7, fee_receipt_days:14, arrival_confirm_days:7, accommodation_days:14, orientation_days:3, student_pass_days:7, survey_days:14 };
}
function getIpaReminderDays() {
  try { const v = JSON.parse(State.settings.intake_ipa_reminder_days || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return [30, 14, 3];
}
function getIntakeYearRange() {
  try { const v = JSON.parse(State.settings.intake_year_range || '{}'); if (v.min && v.max) return v; } catch(e) {}
  return { min: 2000, max: 2100 };
}

// ── 签证与到校 ──
function getVisaDocumentTypes() {
  try { const v = JSON.parse(State.settings.visa_document_types || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['passport','offer_letter','ipa','insurance','accommodation'];
}
function getArrivalChecklist() {
  try { const v = JSON.parse(State.settings.arrival_checklist || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['airport_pickup','accommodation_check','sim_card','bank_account','orientation'];
}

// ── 财务配置 ──
function getDefaultCurrency() { return State.settings.default_currency || 'SGD'; }
function getCommissionRuleTypes() {
  try { const v = JSON.parse(State.settings.commission_rule_types || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['percent','fixed'];
}

// ── 录取评估 ──
function getGradeConversionALevel() {
  try { const v = JSON.parse(State.settings.grade_conversion_alevel || '{}'); if (typeof v === 'object' && Object.keys(v).length) return v; } catch(e) {}
  return { 'A*': 100, 'A': 90, 'B': 80, 'C': 70, 'D': 60, 'E': 50, 'U': 0 };
}
function getGradeConversionIB() {
  try { const v = JSON.parse(State.settings.grade_conversion_ib || '{}'); if (typeof v === 'object' && Object.keys(v).length) return v; } catch(e) {}
  return { '7': 100, '6': 85, '5': 70, '4': 55, '3': 40, '2': 25, '1': 10 };
}
function getCompetitivenessWeights() {
  try { const v = JSON.parse(State.settings.competitiveness_weights || '{}'); if (typeof v === 'object' && Object.keys(v).length) return v; } catch(e) {}
  return { academic: 0.3, language: 0.25, activities: 0.2, awards: 0.1, leadership: 0.15 };
}
function getAdmissionScoring() {
  try { const v = JSON.parse(State.settings.admission_scoring || '{}'); if (typeof v === 'object' && Object.keys(v).length) return v; } catch(e) {}
  return { prior_rate: 0.30, sample_size: 30, score_factors: [1.8, 1.4, 1.0, 0.7, 0.4], low_pass_multiplier: 0.6 };
}

// ── 文书管理 ──
function getEssayTypes() {
  try { const v = JSON.parse(State.settings.essay_types || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['main','supplement','personal_statement','why_school','diversity','activity'];
}
function getEssayStatuses() {
  try { const v = JSON.parse(State.settings.essay_statuses || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['collecting_material','draft','review','revision','final','submitted'];
}
function getEssayAnnotationStatuses() {
  try { const v = JSON.parse(State.settings.essay_annotation_statuses || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['open','accepted','rejected'];
}

// ── 课外活动 ──
function getActivityCategories() {
  try { const v = JSON.parse(State.settings.activity_categories || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['academic_competition','club_leadership','volunteer','internship','sports','arts','personal_project','research','other'];
}
function getActivityImpactLevels() {
  try { const v = JSON.parse(State.settings.activity_impact_levels || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['school','city','province','national','international'];
}
function getImpactWeightMap() {
  try { const v = JSON.parse(State.settings.impact_weight_map || '{}'); if (typeof v === 'object' && Object.keys(v).length) return v; } catch(e) {}
  return { international: 100, national: 80, province: 60, city: 40, school: 20 };
}

// ── 学生管理 ──
function getValidGradeLevels() {
  try { const v = JSON.parse(State.settings.valid_grade_levels || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['G9','G10','G11','G12','G13','Year 9','Year 10','Year 11','Year 12','Year 13','9','10','11','12','13','其他'];
}
function getValidStudentStatuses() {
  try { const v = JSON.parse(State.settings.valid_student_statuses || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['active','inactive','graduated','deleted'];
}
function getGradeRankMap() {
  try { const v = JSON.parse(State.settings.grade_rank_map || '{}'); if (typeof v === 'object' && Object.keys(v).length) return v; } catch(e) {}
  return { 'A*': 100, 'A': 90, 'B': 75, 'C': 60, 'D': 45, 'E': 30, 'U': 10 };
}

// ── 材料管理 ──
function getMaterialStatuses() {
  try { const v = JSON.parse(State.settings.material_statuses || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['未提交','已提交','已审核','需补充'];
}

// ── 申请管理 ──
function getApplicationStatuses() {
  try { const v = JSON.parse(State.settings.application_statuses || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['Pending','Submitted','Conditional Offer','Unconditional Offer','Rejected','Withdrawn','Firm','Insurance'];
}
function getReferenceTaskKeywords() {
  try { const v = JSON.parse(State.settings.reference_task_keywords || '[]'); if (Array.isArray(v) && v.length) return v; } catch(e) {}
  return ['reference%','推荐信%','参考人%'];
}

// ── 通知与审计 ──
function getAutoEscalateOverdueHours() { return parseInt(State.settings.auto_escalate_overdue_hours) || 24; }
function getAuditQueryDefaultLimit() { return parseInt(State.settings.audit_query_default_limit) || 200; }
function getAuditQueryMaxLimit() { return parseInt(State.settings.audit_query_max_limit) || 1000; }

// ── 系统安全 ──
function getPasswordMinLength() { return parseInt(State.settings.password_min_length) || 6; }
function getPasswordMaxLength() { return parseInt(State.settings.password_max_length) || 128; }
function getToastDelay() { return parseInt(State.settings.toast_delay_ms) || 3000; }
function getMaxBatchPrograms() { return parseInt(State.settings.max_batch_programs) || 50; }
function getDefaultTimezone() { return State.settings.default_timezone || 'Europe/London'; }

// ════════════════════════════════════════════════════════
//  API 辅助
// ════════════════════════════════════════════════════════
async function api(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  // 会话过期：返回登录页（排除登录和初始会话检查端点，避免首次打开页面误报"会话已过期"）
  const silentUrls = ['/api/auth/login', '/api/auth/me'];
  if (res.status === 401 && !silentUrls.includes(url)) {
    State.user = null;
    showToast('会话已过期，请重新登录', 'warning');
    setTimeout(() => {
      document.getElementById('main-content').innerHTML = '';
      document.getElementById('app').classList.add('d-none');
      document.getElementById('login-page').classList.remove('d-none');
    }, 1200);
    throw new Error('会话已过期，请重新登录');
  }
  let data = {};
  try { data = await res.json(); } catch(e) { if (!res.ok) throw new Error(`HTTP ${res.status}`); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const GET = (url) => api('GET', url);
const POST = (url, body) => api('POST', url, body);
const PUT = (url, body) => api('PUT', url, body);
const DEL = (url) => api('DELETE', url);

// ════════════════════════════════════════════════════════
//  Toast 通知
// ════════════════════════════════════════════════════════
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const body = document.getElementById('toast-body');
  toast.className = `toast align-items-center text-white border-0 bg-${type}`;
  body.textContent = msg;
  new bootstrap.Toast(toast, { delay: 3000 }).show();
}

// 将后端技术性错误映射为用户友好的中文描述
function _friendlyError(msg) {
  if (!msg) return '操作失败，请重试';
  const m = String(msg);
  if (m.includes('UNIQUE constraint failed')) return '数据重复：该记录已存在，请勿重复提交';
  if (m.includes('FOREIGN KEY constraint failed')) return '数据关联错误：请确认相关记录存在';
  if (m.includes('NOT NULL constraint failed')) return '有必填字段未填写，请检查表单';
  if (m.includes('HTTP 403') || m.includes('无权')) return '权限不足，无法执行此操作';
  if (m.includes('HTTP 404') || m.includes('不存在')) return '找不到该记录，可能已被删除';
  if (m.includes('HTTP 409') || m.includes('已有') || m.includes('重复')) return m; // 409 errors usually have clear messages
  if (m.includes('HTTP 500')) return '服务器内部错误，请联系管理员';
  if (m.includes('HTTP 502') || m.includes('HTTP 503')) return '服务暂时不可用，请稍后重试';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return '网络连接失败，请检查网络后重试';
  if (m.includes('会话已过期')) return '会话已过期，请重新登录';
  return m; // 已是可读中文消息，直接返回
}

function showError(msg) { showToast(_friendlyError(msg), 'danger'); }
function showSuccess(msg) { showToast(msg, 'success'); }

// UX-02: page-level error with retry button
function errorWithRetry(errMsg, retryFn) {
  const friendly = _friendlyError(errMsg);
  return `<div class="error-retry-block">
    <div class="alert alert-danger"><i class="bi bi-exclamation-triangle-fill me-2"></i>${escapeHtml(friendly)}</div>
    <button class="btn btn-outline-primary btn-sm btn-retry" onclick="${typeof retryFn === 'string' ? retryFn : 'location.reload()'}"><i class="bi bi-arrow-clockwise me-1"></i>重新加载</button>
  </div>`;
}

// D-09: empty state helper (enhanced with optional CTA)
function emptyStateSm(msg, icon = 'inbox', cta = null) {
  const ctaHtml = cta ? `<div class="empty-state-cta"><button class="btn btn-outline-primary btn-sm" onclick="${escapeHtml(cta.action)}"><i class="bi bi-${cta.icon || 'plus-circle'} me-1"></i>${escapeHtml(cta.label)}</button></div>` : '';
  return `<div class="empty-state-sm"><i class="bi bi-${icon}" aria-hidden="true"></i><p>${msg}</p>${ctaHtml}</div>`;
}

// D-10: skeleton loading rows helper
function skeletonTableRows(cols = 5, rows = 5) {
  const cells = Array(cols).fill(0).map((_, i) =>
    `<td><div class="skeleton" style="height:14px;width:${i===0?'80%':'60%'};border-radius:3px">&nbsp;</div></td>`
  ).join('');
  return Array(rows).fill(`<tr>${cells}</tr>`).join('');
}
function skeletonList(rows = 4) {
  return Array(rows).fill(0).map((_, i) => `<div class="skeleton-row">
    <div class="skeleton" style="width:36px;height:36px;border-radius:50%;flex-shrink:0"></div>
    <div style="flex:1"><div class="skeleton" style="height:13px;width:${60+i*5}%;margin-bottom:5px"></div><div class="skeleton" style="height:11px;width:40%"></div></div>
  </div>`).join('');
}

// ════════════════════════════════════════════════════════
//  A11Y: 骨架屏加载助手
// ════════════════════════════════════════════════════════
function skeletonDashboard() {
  return `<div class="row g-3 mb-4">${Array(6).fill('<div class="col-6 col-md-2"><div class="skeleton skeleton-stat-card"></div></div>').join('')}</div>
    <div class="row g-3 mb-4"><div class="col-md-8"><div class="skeleton" style="height:200px;border-radius:var(--radius-md)"></div></div><div class="col-md-4"><div class="skeleton" style="height:200px;border-radius:var(--radius-md)"></div></div></div>`;
}

// ════════════════════════════════════════════════════════
//  A11Y: 键盘交互支持 — 为 role="button" 元素添加 Enter/Space
// ════════════════════════════════════════════════════════
document.addEventListener('keydown', function(e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute('role') === 'button') {
    e.preventDefault();
    e.target.click();
  }
});

// A11Y: 通知面板打开时更新 aria-expanded
function _updateBellAria(expanded) {
  const bell = document.getElementById('notif-bell-btn');
  if (bell) bell.setAttribute('aria-expanded', String(expanded));
}

// ════════════════════════════════════════════════════════
//  表单实时验证助手
// ════════════════════════════════════════════════════════
function setupLiveValidation(formEl) {
  if (!formEl) return;
  formEl.querySelectorAll('[required], [aria-required="true"]').forEach(input => {
    input.addEventListener('blur', function() {
      if (!this.value.trim()) {
        this.classList.add('is-invalid-live');
        let errMsg = this.parentElement.querySelector('.field-error-msg');
        if (!errMsg) {
          errMsg = document.createElement('div');
          errMsg.className = 'field-error-msg';
          errMsg.textContent = '此字段为必填项';
          this.parentElement.appendChild(errMsg);
        }
        errMsg.classList.add('show');
      } else {
        this.classList.remove('is-invalid-live');
        const errMsg = this.parentElement.querySelector('.field-error-msg');
        if (errMsg) errMsg.classList.remove('show');
      }
    });
    input.addEventListener('input', function() {
      if (this.value.trim()) {
        this.classList.remove('is-invalid-live');
        const errMsg = this.parentElement.querySelector('.field-error-msg');
        if (errMsg) errMsg.classList.remove('show');
      }
    });
  });
}

// ════════════════════════════════════════════════════════
//  确认对话框
// ════════════════════════════════════════════════════════
function confirmAction(msg, callback, opts = {}) {
  const bodyEl = document.getElementById('confirm-body');
  // Support limited HTML (strong/em/br/div/p/span/small) — strip dangerous tags
  if (/<[a-z][\s\S]*>/i.test(msg)) {
    bodyEl.innerHTML = msg.replace(/<(script|iframe|object|embed|link|meta|style|svg)[^>]*>[\s\S]*?<\/\1>/gi, '')
                          .replace(/<(script|iframe|object|embed|link|meta|style|svg)[^>]*\/?>/gi, '')
                          .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  } else {
    bodyEl.textContent = msg;
  }
  const modalEl = document.getElementById('confirm-modal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  const okBtn = document.getElementById('confirm-ok');
  okBtn.className = opts.danger ? 'btn btn-danger' : 'btn btn-primary';
  okBtn.textContent = opts.okLabel || '确认';
  // 先禁用 OK，等 modal 完全 shown 后再启用；否则 show transition 期间点 OK
  // 会触发 Bootstrap "hide during showing" 的 bug（hide 静默失效，modal 卡死）
  okBtn.disabled = true;
  const onShown = () => {
    modalEl.removeEventListener('shown.bs.modal', onShown);
    okBtn.disabled = false;
  };
  modalEl.addEventListener('shown.bs.modal', onShown);
  okBtn.onclick = () => {
    if (okBtn.disabled) return;
    okBtn.disabled = true;
    // 等 confirm modal 完全 hidden 后再执行 callback，避免 callback 内若 hide 其他 modal
    // 干扰 Bootstrap 的 modal 栈清理（导致 backdrop 残留 / 页面锁死）
    const onHidden = () => {
      modalEl.removeEventListener('hidden.bs.modal', onHidden);
      try { callback(); } finally { setTimeout(() => { okBtn.disabled = false; }, 500); }
    };
    modalEl.addEventListener('hidden.bs.modal', onHidden);
    modal.hide();
  };
  modal.show();
}

// 通用表单弹窗 — 用于需要用户填写信息的操作
// WARNING: bodyHtml is set via innerHTML. Callers MUST escape any user-generated
// content with escapeHtml() before embedding it in bodyHtml to prevent XSS.
function showModal(title, bodyHtml, onOk, okLabel = '确定', size = '') {
  document.getElementById('generic-form-title').textContent = title;
  document.getElementById('generic-form-body').innerHTML = bodyHtml;
  document.getElementById('generic-form-ok').textContent = okLabel;
  const dlg = document.getElementById('generic-form-modal').querySelector('.modal-dialog');
  dlg.className = dlg.className.replace(/\bmodal-(sm|lg|xl)\b/g, '').trim();
  if (size) dlg.classList.add(`modal-${size}`);
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('generic-form-modal'));
  modal.show();
  const okBtn = document.getElementById('generic-form-ok');
  if (!onOk) {
    okBtn.style.display = 'none';
  } else {
    okBtn.style.display = '';
    okBtn.disabled = false;
    okBtn.onclick = async () => {
      if (okBtn.disabled) return;
      okBtn.disabled = true;
      const originalHtml = okBtn.innerHTML;
      okBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>处理中…`;
      try {
        const result = await onOk();
        if (result !== false) modal.hide();
      } catch(e) {
        showError(e.message);
      } finally {
        okBtn.disabled = false;
        okBtn.innerHTML = originalHtml;
      }
    };
  }
}

// ════════════════════════════════════════════════════════
//  工具函数
// ════════════════════════════════════════════════════════
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// 安全 ID：用于 onclick 属性中的动态值，确保只含安全字符
function safeId(id) { return String(id||'').replace(/[^a-zA-Z0-9_\-]/g, ''); }

// 检查当前导航代数是否仍然有效（用于异步回调中判断是否已导航离开）
function isNavStale(gen) { return gen !== State._navGeneration; }

// 清理所有案例相关的全局变量，防止跨案例/跨页面数据泄漏
function _cleanupCaseGlobals() {
  window._currentCaseDetail = null;
  window._pendingFieldNotes = null;
  window._uifFlaggedFields = {};
  window._fxFilter_state = null;
  window._fcActiveTab = null;
  window._matCurrentCompanyId = null;
  window._allPrograms = null;
  window._canEditPrograms = null;
  window._allBenchmarks = null;
  window._canEditBenchmarks = null;
  window._aiPlanModalCtx = null;
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('zh-CN');
}

function fmtDatetime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function isOverdue(dueDate, status) {
  if (!dueDate || status === 'done') return false;
  // Compare as local date strings to avoid UTC-offset false positives on date-only values
  const todayStr = new Date().toLocaleDateString('sv'); // YYYY-MM-DD in local time
  const dueDateStr = dueDate.slice(0, 10);
  return dueDateStr < todayStr;
}

function tierBadge(tier) {
  const map = { '冲刺': 'danger', '意向': 'primary', '保底': 'success', '通用': 'secondary' };
  return `<span class="badge badge-soft-${map[tier]||'secondary'}">${escapeHtml(tier||'—')}</span>`;
}

function statusBadge(status) {
  const map = {
    // Task statuses
    'pending': ['secondary', '待处理'], 'in_progress': ['warning', '进行中'], 'done': ['success', '已完成'],
    'todo': ['secondary', '待开始'],
    // Material statuses
    '未开始': ['secondary', '未开始'], '收集中': ['warning', '收集中'], '已上传': ['info', '已上传'],
    '已审核': ['primary', '已审核'], '已提交': ['success', '已提交'], '需补件': ['danger', '需补件'],
    // Essay statuses
    '草稿': ['warning', '草稿'], '一审中': ['info', '一审中'], '需修改': ['danger', '需修改'],
    '二审中': ['primary', '二审中'], '定稿': ['success', '定稿'],
    // Application statuses
    'applied': ['primary', '已提交'], 'offer': ['success', '有Offer'], 'firm': ['success', '已确认'],
    'declined': ['danger', '已拒绝'], 'enrolled': ['success', '已入学'], 'withdrawn': ['secondary', '已撤回'],
    'deleted': ['secondary', '已删除'],
    'waitlist': ['info', '候补'], 'interview': ['warning', '面试中'],
    'conditional': ['warning', '条件Offer'], 'unconditional': ['success', '无条件Offer'],
    'rejected': ['danger', '拒信'], 'conditional_offer': ['warning', '条件Offer'],
    'overdue': ['danger', '已逾期'],
    // Student statuses
    'active': ['success', '在读'],
    // Offer types (capitalized)
    'Conditional': ['warning', '条件Offer'], 'Unconditional': ['success', '无条件'],
    'Rejected': ['danger', '拒信'], 'Pending': ['secondary', '待定'], 'Waitlist': ['info', '候补'],
    // Intake statuses
    'registered': ['secondary', '已注册'], 'collecting_docs': ['info', '收集材料中'],
    'contract_signed': ['primary', '合同已签'], 'paid': ['success', '已付款'],
    'visa_in_progress': ['warning', '签证办理中'], 'ipa_received': ['success', '已获IPA'],
    'arrived': ['primary', '已到校'], 'oriented': ['success', '已入学'], 'closed': ['secondary', '已关闭'],
    // Feedback statuses
    'reviewed': ['info', '已阅/跟进中'], 'resolved': ['success', '已解决'],
    // Audit actions
    'CREATE': ['success', 'CREATE'], 'UPDATE': ['primary', 'UPDATE'],
    'DELETE': ['danger', 'DELETE'], 'VOID': ['warning', 'VOID'],
    'LOGIN': ['info', 'LOGIN'], 'AI_ENHANCE': ['info', 'AI'],
  };
  const [cls, label] = map[status] || ['secondary', status || '—'];
  return `<span class="badge badge-soft-${cls}">${escapeHtml(label)}</span>`;
}

function actionBadge(action) {
  return statusBadge(action);
}

// ════════════════════════════════════════════════════════
//  deltaBadge(value, options)
//  Δ 趋势徽章 — 仪表盘 KPI 卡片用
//  value: 数字（正=增长/负=下降/0=持平）
//  options: { positiveIsGood?: boolean, unit?: string, suffix?: string }
// ════════════════════════════════════════════════════════
function deltaBadge(value, options = {}) {
  if (value === null || value === undefined || isNaN(value)) return '';
  const n = Number(value);
  const { positiveIsGood = true, unit = '', suffix = '本周' } = options;
  if (n === 0) {
    return `<span class="kpi-delta kpi-delta-flat" title="${escapeHtml(suffix)}持平">— 0${unit}</span>`;
  }
  const isUp = n > 0;
  const isGood = (isUp && positiveIsGood) || (!isUp && !positiveIsGood);
  const cls = isGood ? 'kpi-delta-good' : 'kpi-delta-bad';
  const arrow = isUp ? '▲' : '▼';
  const absN = Math.abs(n);
  return `<span class="kpi-delta ${cls}" title="${escapeHtml(suffix)}变化">${arrow} ${isUp ? '+' : '-'}${absN}${unit}</span>`;
}

function priorityIcon(p) {
  if (p === 'high') return '<i class="bi bi-exclamation-circle-fill text-danger me-1"></i>';
  if (p === 'low') return '<i class="bi bi-arrow-down-circle text-muted me-1"></i>';
  return '<i class="bi bi-dot text-secondary me-1"></i>';
}

function hasRole(...roles) {
  return roles.includes(State.user?.role);
}

// ════════════════════════════════════════════════════════
//  路由 & 页面切换
// ════════════════════════════════════════════════════════
// NOTE: PAGES map moved to app.js (needs render function references)

function _forceCleanupModals() {
  // Only dispose/remove dynamically rendered or nav-moved modals — leave static index.html modals intact
  document.querySelectorAll('[data-nav-moved="1"],[data-rendered-modal="1"]').forEach(el => {
    const inst = bootstrap.Modal.getInstance(el);
    if (inst) { try { inst.dispose(); } catch(e) {} }
    el.remove();
  });
  // Also hide any lingering open static modals without disposing them
  document.querySelectorAll('.modal.show').forEach(el => {
    if (el.dataset.navMoved !== '1' && el.dataset.renderedModal !== '1') {
      const inst = bootstrap.Modal.getInstance(el);
      if (inst) { try { inst.hide(); } catch(e) {} }
      el.classList.remove('show');
      el.style.display = 'none';
      el.removeAttribute('aria-modal');
      el.setAttribute('aria-hidden', 'true');
    }
  });
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('padding-right');
  document.body.style.removeProperty('overflow');
}

function navigate(page, params = {}) {
  const mainContent = document.getElementById('main-content');
  const openModal = document.querySelector('.modal.show');

  if (openModal) {
    const inst = bootstrap.Modal.getInstance(openModal);
    if (inst) {
      // KEY FIX: move the modal from #main-content to body BEFORE calling hide().
      // Bootstrap's hide animation relies on transitionend firing on the element.
      // If the element lives inside #main-content and we replace innerHTML during
      // the animation, the element is detached and Bootstrap's cleanup never completes,
      // leaving the backdrop and modal-open class behind (page appears frozen).
      // Moving to body makes the element stable for the full close animation.
      if (mainContent && mainContent.contains(openModal)) {
        openModal.dataset.navMoved = '1';
        document.body.appendChild(openModal);
      }

      openModal.addEventListener('hidden.bs.modal', () => {
        // Remove moved/rendered modals and any residual Bootstrap state
        document.querySelectorAll('[data-nav-moved="1"],[data-rendered-modal="1"]').forEach(el => el.remove());
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('padding-right');
        document.body.style.removeProperty('overflow');
        _doNavigate(page, params);
      }, { once: true });

      inst.hide();
      return;
    }
  }

  _forceCleanupModals();
  _doNavigate(page, params);
}

function _doNavigate(page, params = {}) {
  State._navGeneration++;
  // ── 前端路由守卫：角色无权访问则拦截 ──
  if (State.user && !canAccessPage(page)) {
    document.getElementById('main-content').innerHTML = `
      <div class="d-flex flex-column align-items-center justify-content-center" style="height:60vh;">
        <i class="bi bi-shield-lock text-danger" style="font-size:4rem;"></i>
        <h4 class="mt-3 text-danger">无权访问</h4>
        <p class="text-muted">您的账号（${State.user.role}）无权查看此页面</p>
      </div>`;
    return;
  }

  // 记录上一页（排除 student-detail 自身，避免循环）
  if (State.currentPage && State.currentPage !== 'student-detail') {
    State.previousPage = State.currentPage;
  }
  // 离开案例详情时清除 case-level 全局缓存
  if ((State.currentPage === 'intake-case-detail' || document.getElementById('intakeDetailPanel')) && page !== 'intake-case-detail' && page !== 'intake-cases') {
    _cleanupCaseGlobals();
  }
  State.currentPage = page;
  if (params.studentId) State.currentStudentId = params.studentId;
  if (params.taskId) State.currentTaskId = params.taskId;
  if (params.caseId) State.currentCaseId = params.caseId;
  if (params.requestId) State.currentMatRequestId = params.requestId;

  // ── 写入 URL hash，刷新时可恢复 ──
  try {
    const hashParams = new URLSearchParams();
    // 只序列化有值的参数
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') hashParams.set(k, v);
    }
    // 如果是案例详情页，确保 caseId 在 hash 中
    if (page === 'intake-case-detail' && State.currentCaseId && !hashParams.has('caseId')) {
      hashParams.set('caseId', State.currentCaseId);
    }
    if (page === 'student-detail' && State.currentStudentId && !hashParams.has('studentId')) {
      hashParams.set('studentId', State.currentStudentId);
    }
    const hashStr = page + (hashParams.toString() ? '?' + hashParams.toString() : '');
    if (window.location.hash.slice(1) !== hashStr) {
      // 如果是响应浏览器 hashchange/popstate 事件，用 replaceState 避免重复历史条目
      if (State._hashNavInProgress) {
        window.history.replaceState(null, '', '#' + hashStr);
      } else {
        window.history.pushState(null, '', '#' + hashStr);
      }
    }
    State._lastHandledHash = window.location.hash;
  } catch(e) {}

  document.querySelectorAll('.sidebar .nav-item[data-page]').forEach(el => {
    const isActive = el.dataset.page === page;
    el.classList.toggle('active', isActive);
    if (isActive) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  const fn = PAGES[page];
  if (fn) fn(params);
}

// ── 通用页面渲染包装器 ─────────────────────────────────
async function renderPage(fetchFn, renderFn, options = {}) {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div>${
    options.loadingText ? `<p class="mt-2 text-muted small">${options.loadingText}</p>` : ''
  }</div>`;
  try {
    const data = await fetchFn();
    mc.innerHTML = renderFn(data);
    if (options.afterRender) options.afterRender(data);
  } catch (e) {
    mc.innerHTML = errorWithRetry((options.errorPrefix || '加载失败') + ': ' + e.message, `navigate('${State.currentPage||"dashboard"}')`);
  }
}

// ── 通用表格生成器 ──────────────────────────────────────
function renderTable(config) {
  const { columns, data, emptyText = '暂无数据', hover = true, striped = false, onRowClick } = config;
  if (!data || data.length === 0) {
    return `<div class="empty-state-block" style="padding:2rem">
      <i class="bi bi-inbox" style="font-size:2rem;opacity:.3"></i>
      <p class="text-muted mt-2">${escapeHtml(emptyText)}</p>
    </div>`;
  }
  const tableClass = `table table-sm${hover ? ' table-hover' : ''}${striped ? ' table-striped' : ''} mb-0`;
  const thead = columns.map(col =>
    `<th${col.width ? ` style="width:${col.width}"` : ''}${col.align ? ` class="text-${col.align}"` : ''}>${escapeHtml(col.label)}</th>`
  ).join('');
  const tbody = data.map(item => {
    const cells = columns.map(col => {
      const value = col.render ? col.render(item) : escapeHtml(String(item[col.key] ?? ''));
      const align = col.align ? ` class="text-${col.align}"` : '';
      return `<td${align}>${value}</td>`;
    }).join('');
    const rowAttr = onRowClick ? ` onclick="${onRowClick(item)}" style="cursor:pointer"` : '';
    return `<tr${rowAttr}>${cells}</tr>`;
  }).join('');
  return `<div class="table-responsive"><table class="${tableClass}"><thead class="table-light"><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

// 激活指定 Tab（渲染完成后调用）
function activateTab(tabId) {
  if (!tabId) return;
  setTimeout(() => {
    const link = document.querySelector(`.nav-tabs [href="#${tabId}"]`);
    if (link) new bootstrap.Tab(link).show();
  }, 80);
}

// ════════════════════════════════════════════════════════
//  Cmd+K 命令面板（UX-06）
//  - Ctrl/Cmd+K 打开
//  - 搜索：页面、学生（按姓名/ID）、最近访问
//  - ↑/↓ 选择 Enter 执行 Esc 关闭
// ════════════════════════════════════════════════════════
const CMDK = {
  open: false,
  activeIdx: 0,
  results: [],
  studentCache: null,
  studentCacheTime: 0,
  recentPages: [],
};

// 所有可搜索页面（从侧边栏推断）
function _cmdkAllPages() {
  // 标签 → 页面标签（图标 + 名称）
  return [
    { page: 'dashboard',          label: '总览仪表盘',       icon: 'speedometer2',    group: '页面' },
    { page: 'students',           label: '学生管理',         icon: 'person-vcard',    group: '页面' },
    { page: 'staff',              label: '师资管理',         icon: 'people',          group: '页面' },
    { page: 'feedback-list',      label: '反馈管理',         icon: 'chat-dots',       group: '页面' },
    { page: 'command-center',     label: '申请指挥中心',     icon: 'rocket-takeoff-fill', group: '页面' },
    { page: 'admission-programs', label: '录取评估库',       icon: 'mortarboard-fill',group: '页面' },
    { page: 'intake',             label: '入学管理',         icon: 'person-lines-fill',group: '页面' },
    { page: 'mat-companies',      label: '中介/代理',        icon: 'building',        group: '页面' },
    { page: 'finance',            label: '财务中心',         icon: 'currency-dollar', group: '页面' },
    { page: 'analytics',          label: '数据分析',         icon: 'bar-chart-line-fill', group: '页面' },
    { page: 'accounts',           label: '账号管理',         icon: 'people-fill',     group: '页面' },
    { page: 'audit',              label: '操作审计',         icon: 'clock-history',   group: '页面' },
    { page: 'settings',           label: '系统设置',         icon: 'gear',            group: '页面' },
    { page: 'student-portal',     label: '我的门户',         icon: 'person-fill',     group: '页面' },
    { page: 'parent-portal',      label: '家长门户',         icon: 'people-fill',     group: '页面' },
  ].filter(p => canAccessPage(p.page));
}

function _cmdkRecent() {
  try {
    const raw = localStorage.getItem('cmdk_recent_' + (State.user?.id || 'anon'));
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch(e) { return []; }
}
function _cmdkPushRecent(item) {
  try {
    const key = 'cmdk_recent_' + (State.user?.id || 'anon');
    const cur = _cmdkRecent();
    const filtered = cur.filter(r => !(r.type === item.type && r.ref === item.ref));
    filtered.unshift(item);
    localStorage.setItem(key, JSON.stringify(filtered.slice(0, 5)));
  } catch(e) {}
}

async function _cmdkStudents(query) {
  // 学生列表缓存 2 分钟
  if (!CMDK.studentCache || Date.now() - CMDK.studentCacheTime > 120000) {
    try {
      const list = await GET('/api/students');
      CMDK.studentCache = Array.isArray(list) ? list : [];
      CMDK.studentCacheTime = Date.now();
    } catch(e) {
      CMDK.studentCache = [];
    }
  }
  const q = (query || '').toLowerCase().trim();
  if (!q) return [];
  return CMDK.studentCache
    .filter(s => (s.name || '').toLowerCase().includes(q) || (s.id || '').toLowerCase().includes(q))
    .slice(0, 8)
    .map(s => ({
      type: 'student',
      ref: s.id,
      label: s.name + (s.exam_board ? `  ·  ${s.exam_board}` : ''),
      icon: 'person-badge',
      group: '学生',
      action: () => navigate('student-detail', { studentId: s.id }),
    }));
}

function _cmdkFuzzyMatch(text, query) {
  if (!query) return true;
  const t = (text || '').toLowerCase();
  const q = query.toLowerCase();
  if (t.includes(q)) return true;
  // 支持拼音首字母（简化：只匹配连续子序列）
  let ti = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx < 0) return false;
    ti = idx + 1;
  }
  return true;
}

async function _cmdkSearch(query) {
  const q = (query || '').trim();
  const role = State.user?.role;
  const allowed = ['principal','counselor','mentor','intake_staff'].includes(role);

  if (!q) {
    // 空 query → 显示最近 + 常用页面
    const recent = _cmdkRecent().map(r => ({
      ...r,
      group: '最近使用',
      action: r.type === 'page'
        ? () => navigate(r.ref)
        : () => navigate('student-detail', { studentId: r.ref }),
    }));
    const pages = _cmdkAllPages().slice(0, 8)
      .map(p => ({ ...p, type: 'page', ref: p.page, action: () => navigate(p.page) }));
    return [...recent, ...pages];
  }

  const pages = _cmdkAllPages()
    .filter(p => _cmdkFuzzyMatch(p.label, q) || _cmdkFuzzyMatch(p.page, q))
    .map(p => ({ ...p, type: 'page', ref: p.page, action: () => navigate(p.page) }));

  const students = allowed ? await _cmdkStudents(q) : [];
  return [...pages.slice(0, 6), ...students];
}

function _cmdkRender() {
  const box = document.getElementById('cmdk-results');
  if (!box) return;
  if (CMDK.results.length === 0) {
    box.innerHTML = '<div class="p-4 text-center text-muted small">未找到匹配结果</div>';
    return;
  }
  // 按 group 分组
  const groups = {};
  CMDK.results.forEach((item, idx) => {
    const g = item.group || '其他';
    if (!groups[g]) groups[g] = [];
    groups[g].push({ ...item, _idx: idx });
  });
  box.innerHTML = Object.entries(groups).map(([grp, items]) => `
    <div class="cmdk-group-title">${escapeHtml(grp)}</div>
    ${items.map(it => `
      <button class="cmdk-item${it._idx === CMDK.activeIdx ? ' cmdk-active' : ''}" data-idx="${it._idx}" role="option" aria-selected="${it._idx === CMDK.activeIdx}">
        <span class="cmdk-icon"><i class="bi bi-${escapeHtml(it.icon || 'arrow-right')}" aria-hidden="true"></i></span>
        <span class="cmdk-label">${escapeHtml(it.label)}</span>
        <span class="cmdk-hint">${it.type === 'student' ? '学生详情' : it.type === 'page' ? '页面' : ''}</span>
      </button>
    `).join('')}
  `).join('');
  // 绑定点击
  box.querySelectorAll('.cmdk-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      _cmdkExecute(idx);
    });
    btn.addEventListener('mouseenter', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      CMDK.activeIdx = idx;
      box.querySelectorAll('.cmdk-item').forEach(b => {
        b.classList.toggle('cmdk-active', parseInt(b.dataset.idx, 10) === idx);
      });
    });
  });
  // 滚动到激活项
  const active = box.querySelector('.cmdk-active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function _cmdkExecute(idx) {
  const item = CMDK.results[idx];
  if (!item || !item.action) return;
  _cmdkPushRecent({ type: item.type, ref: item.ref, label: item.label, icon: item.icon });
  closeCmdk();
  item.action();
}

function openCmdk() {
  const box = document.getElementById('cmdk-palette');
  if (!box) return;
  CMDK.open = true;
  CMDK.activeIdx = 0;
  box.style.display = 'flex';
  box.setAttribute('aria-hidden', 'false');
  box.classList.add('cmdk-open');
  const input = document.getElementById('cmdk-input');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 30);
  }
  _cmdkSearch('').then(r => { CMDK.results = r; _cmdkRender(); });
}

function closeCmdk() {
  const box = document.getElementById('cmdk-palette');
  if (!box) return;
  CMDK.open = false;
  box.style.display = 'none';
  box.setAttribute('aria-hidden', 'true');
  box.classList.remove('cmdk-open');
}

function _cmdkBind() {
  // 快捷键打开
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      if (!State.user) return; // 未登录不触发
      e.preventDefault();
      CMDK.open ? closeCmdk() : openCmdk();
      return;
    }
    if (!CMDK.open) return;
    if (e.key === 'Escape') { e.preventDefault(); closeCmdk(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      CMDK.activeIdx = Math.min(CMDK.activeIdx + 1, CMDK.results.length - 1);
      _cmdkRender();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      CMDK.activeIdx = Math.max(CMDK.activeIdx - 1, 0);
      _cmdkRender();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      _cmdkExecute(CMDK.activeIdx);
    }
  });

  // 点击背景关闭
  const box = document.getElementById('cmdk-palette');
  if (box) {
    box.addEventListener('click', (e) => {
      if (e.target === box) closeCmdk();
    });
  }
  const closeBtn = document.getElementById('cmdk-close');
  if (closeBtn) closeBtn.addEventListener('click', closeCmdk);

  // 输入搜索（防抖 120ms）
  const input = document.getElementById('cmdk-input');
  if (input) {
    let t = null;
    input.addEventListener('input', function() {
      clearTimeout(t);
      const val = input.value;
      t = setTimeout(async () => {
        CMDK.results = await _cmdkSearch(val);
        CMDK.activeIdx = 0;
        _cmdkRender();
      }, 120);
    });
  }
}

// 应用启动后绑定
document.addEventListener('DOMContentLoaded', () => {
  // 延迟，等 DOM/State 就绪
  setTimeout(_cmdkBind, 100);
});
