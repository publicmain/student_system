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
  return ['A2', 'AS', 'Full A-Level', '其他'];
}

function getExamBoards() {
  try {
    const b = JSON.parse(State.settings.exam_boards || '[]');
    if (Array.isArray(b) && b.length > 0) return b;
  } catch(e) {}
  return ['Edexcel', 'CIE', 'OCR', 'AQA', '其他'];
}

function getSubjectList() {
  try {
    const s = JSON.parse(State.settings.subject_list || '[]');
    if (Array.isArray(s) && s.length > 0) return s;
  } catch(e) {}
  return [];
}

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

// D-09: empty state helper
function emptyStateSm(msg, icon = 'inbox') {
  return `<div class="empty-state-sm"><i class="bi bi-${icon}"></i><p>${msg}</p></div>`;
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
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('confirm-modal'));
  modal.show();
  const okBtn = document.getElementById('confirm-ok');
  // Apply danger style for destructive operations
  okBtn.className = opts.danger ? 'btn btn-danger' : 'btn btn-primary';
  okBtn.textContent = opts.okLabel || '确认';
  okBtn.onclick = () => {
    if (okBtn.disabled) return;
    okBtn.disabled = true;
    modal.hide();
    try { callback(); } finally { setTimeout(() => { okBtn.disabled = false; }, 500); }
  };
}

// 通用表单弹窗 — 用于需要用户填写信息的操作
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

// 清理所有案例相关的全局变量，防止跨案例/跨页面数据泄漏
function _cleanupCaseGlobals() {
  window._currentCaseDetail = null;
  window._pendingFieldNotes = null;
  window._uifFlaggedFields = null;
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
  const map = { '冲刺': 'danger', '意向': 'primary', '保底': 'success' };
  return `<span class="badge bg-${map[tier]||'secondary'}">${tier||'—'}</span>`;
}

function statusBadge(status) {
  const map = {
    'pending': ['secondary', '待处理'], 'in_progress': ['warning text-dark', '进行中'], 'done': ['success', '已完成'],
    '未开始': ['secondary', '未开始'], '收集中': ['warning text-dark', '收集中'], '已上传': ['info', '已上传'],
    '已审核': ['primary', '已审核'], '已提交': ['success', '已提交'], '需补件': ['danger', '需补件'],
    '草稿': ['warning text-dark', '草稿'], '一审中': ['info', '一审中'], '需修改': ['danger', '需修改'],
    '二审中': ['primary', '二审中'], '定稿': ['success', '定稿'],
    'active': ['success', '在读'], 'Conditional': ['warning text-dark', '条件Offer'],
    'Unconditional': ['success', '无条件'], 'Rejected': ['danger', '拒信'], 'Pending': ['secondary', '待定'],
    'Waitlist': ['info', '候补'],
  };
  const [cls, label] = map[status] || ['secondary', status || '—'];
  return `<span class="badge bg-${cls}">${label}</span>`;
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
    window.history.replaceState(null, '', '#' + hashStr);
  } catch(e) {}

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  const fn = PAGES[page];
  if (fn) fn(params);
}

// 激活指定 Tab（渲染完成后调用）
function activateTab(tabId) {
  if (!tabId) return;
  setTimeout(() => {
    const link = document.querySelector(`.nav-tabs [href="#${tabId}"]`);
    if (link) new bootstrap.Tab(link).show();
  }, 80);
}
