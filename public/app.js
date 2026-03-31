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
    setTimeout(() => { document.getElementById('main-content').innerHTML = ''; renderLogin(); }, 1200);
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
const PAGES = {
  dashboard: renderDashboard,
  counselor: renderCounselorWorkbench,
  mentor: renderMentorWorkbench,
  'student-portal': renderStudentPortal,
  'parent-portal': renderParentPortal,
  'agent-portal': renderAgentPortal,
  students: renderStudentList,
  'student-detail': renderStudentDetail,
  staff: renderStaffList,
  materials: renderMaterialsBoard,
  'feedback-list': renderFeedbackList,
  'templates': renderTemplates,
  'settings': renderSettings,
  'analytics': renderAnalytics,
  'audit': renderAuditLog,
  'admission-programs': renderAdmissionPrograms,
  'intake-dashboard': renderIntakeDashboard,
  'intake-cases': renderIntakeCases,
  'intake-case-detail': (params) => {
    // 重定向到 master-detail 模式：先渲染列表页，再在面板中打开详情
    const caseId = params?.caseId || State.currentCaseId;
    if (caseId) State.currentCaseId = caseId;
    renderIntakeCases().then(() => {
      if (caseId) showCaseDetail(caseId);
    });
  },
  'agents-management': renderAgentsManagement,
  'task-detail': renderTaskDetail,
  // MAT/ADM 独立页面已整合到入学案例详情 → 重定向
  'mat-requests': () => { showToast('材料收集已整合到入学案例详情页','info'); navigate('intake-cases'); },
  'mat-request-detail': () => { navigate('intake-cases'); },
  'mat-companies': renderMatCompanies, // 保留公司管理（可从创建材料收集弹窗访问）
  'adm-profiles': () => { showToast('申请表管理已整合到入学案例详情页','info'); navigate('intake-cases'); },
  'adm-form': () => { navigate('intake-cases'); },
  'adm-case-detail': () => { navigate('intake-cases'); },
};

// ── 页面级权限矩阵 ───────────────────────────────────────
// 明确声明每个页面允许访问的角色。未列出的页面默认所有已登录用户可访问。
const PAGE_ROLES = {
  // ── 升学规划模块（counselor/mentor/principal）
  'dashboard':          ['principal', 'counselor'],
  'counselor':          ['principal', 'counselor'],
  'mentor':             ['principal', 'mentor'],
  'students':           ['principal', 'counselor', 'mentor', 'intake_staff'],
  'student-detail':     ['principal', 'counselor', 'mentor', 'student', 'parent'],
  'staff':              ['principal', 'counselor'],
  'materials':          ['principal', 'counselor', 'mentor'],
  'feedback-list':      ['principal', 'counselor'],
  'templates':          ['principal', 'counselor'],
  'settings':           ['principal', 'counselor'],
  'analytics':          ['principal', 'counselor'],
  'audit':              ['principal'],
  'admission-programs': ['principal', 'counselor'],
  'task-detail':        ['principal', 'counselor', 'mentor', 'intake_staff', 'student_admin'],
  // ── 各角色专属门户
  'student-portal':     ['student'],
  'parent-portal':      ['parent'],
  'agent-portal':       ['agent'],
  // ── 入学管理模块（intake_staff/student_admin/principal，counselor 不可访问）
  'intake-dashboard':   ['principal', 'intake_staff', 'student_admin'],
  'intake-cases':       ['principal', 'intake_staff', 'student_admin'],
  'intake-case-detail': ['principal', 'intake_staff', 'student_admin'],
  // ── 代理市场（仅 principal）
  'agents-management':  ['principal'],
  // ── 中介协作模块
  'mat-requests':       ['principal', 'counselor', 'intake_staff'],
  'mat-request-detail': ['principal', 'counselor', 'intake_staff'],
  'mat-companies':      ['principal', 'counselor', 'intake_staff'],
  // ── 招生申请模块
  'adm-profiles':       ['principal', 'counselor', 'intake_staff'],
  'adm-form':           ['principal', 'counselor', 'intake_staff'],
  'adm-case-detail':    ['principal', 'counselor', 'intake_staff'],
};

function canAccessPage(page) {
  const allowed = PAGE_ROLES[page];
  if (!allowed) return false; // 未配置权限的页面默认拒绝（安全兜底）
  return allowed.includes(State.user?.role);
}

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
    window._currentCaseDetail = null;
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

// ════════════════════════════════════════════════════════
//  仪表盘 (校长)
// ════════════════════════════════════════════════════════
async function renderDashboard() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;

  try {
    const [stats, risks, workload] = await Promise.all([
      GET('/api/dashboard/stats'),
      GET('/api/dashboard/risks'),
      GET('/api/dashboard/workload'),
    ]);

    const tierMap = {};
    (stats.tierStats || []).forEach(t => tierMap[t.tier] = t.cnt);

    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-speedometer2 me-2"></i>总览仪表盘</h4>
      <small class="text-muted">更新时间：${new Date().toLocaleString('zh-CN')}</small>
    </div>

    <!-- 关键指标卡 -->
    <div class="row g-3 mb-4">
      <div class="col-md-3">
        <div class="stat-card bg-primary text-white">
          <div class="stat-icon"><i class="bi bi-people-fill"></i></div>
          <div class="stat-value">${stats.totalStudents}</div>
          <div class="stat-label">在读学生</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-card bg-success text-white">
          <div class="stat-icon"><i class="bi bi-file-earmark-check-fill"></i></div>
          <div class="stat-value">${stats.totalApplications}</div>
          <div class="stat-label">总申请数</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-card ${stats.overdueTasks>0?'bg-danger':'bg-success'} text-white">
          <div class="stat-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
          <div class="stat-value">${stats.overdueTasks}</div>
          <div class="stat-label">逾期任务</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-card bg-info text-white">
          <div class="stat-icon"><i class="bi bi-folder-check"></i></div>
          <div class="stat-value">${stats.pendingMaterials}</div>
          <div class="stat-label">待处理材料</div>
        </div>
      </div>
    </div>

    <!-- 第二行 -->
    <div class="row g-3 mb-4">
      <!-- 梯度分布 -->
      <div class="col-md-4">
        <div class="card h-100">
          <div class="card-header fw-semibold"><i class="bi bi-bar-chart-fill me-1 text-primary"></i> 目标院校梯度分布</div>
          <div class="card-body">
            ${(() => {
              const colors = {'冲刺':'danger','意向':'primary','保底':'success'};
              const maxCnt = Math.max(...['冲刺','意向','保底'].map(t => tierMap[t]||0), 1);
              return ['冲刺','意向','保底'].map(tier => {
                const cnt = tierMap[tier] || 0;
                const pct = Math.round(cnt / maxCnt * 100);
                return `<div class="mb-3">
                  <div class="d-flex justify-content-between mb-1">
                    <span>${tier}</span><span class="fw-bold">${cnt}</span>
                  </div>
                  <div class="progress" style="height:10px">
                    <div class="progress-bar bg-${colors[tier]}" style="width:${pct}%"></div>
                  </div>
                </div>`;
              }).join('');
            })()}
          </div>
        </div>
      </div>
      <!-- 师资负载 -->
      <div class="col-md-8">
        <div class="card h-100">
          <div class="card-header fw-semibold"><i class="bi bi-person-fill-gear me-1 text-success"></i> 师资负载</div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-sm table-hover mb-0">
                <thead class="table-light"><tr><th>姓名</th><th>角色</th><th>当前学生</th><th>容量</th><th>负载</th></tr></thead>
                <tbody>
                  ${workload.map(w => {
                    const pct = w.capacity_students > 0 ? Math.round(w.current_students/w.capacity_students*100) : 0;
                    const cls = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success';
                    return `<tr>
                      <td>${escapeHtml(w.name)}</td>
                      <td><span class="badge bg-secondary">${escapeHtml(w.role)}</span></td>
                      <td>${w.current_students}</td>
                      <td>${w.capacity_students || '—'}</td>
                      <td>
                        <div class="progress" style="height:6px;min-width:80px">
                          <div class="progress-bar bg-${cls}" style="width:${pct}%"></div>
                        </div>
                        <small class="text-${cls}">${pct}%</small>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 风险学生 -->
    <div class="card">
      <div class="card-header fw-semibold text-danger"><i class="bi bi-exclamation-triangle-fill me-1"></i> 风险学生（有逾期任务）</div>
      <div class="card-body p-0">
        ${risks.length === 0 ? '<p class="text-center text-muted py-3">🎉 暂无风险学生</p>' : `
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead class="table-light"><tr><th>姓名</th><th>年级</th><th>考试局</th><th>逾期任务数</th><th>操作</th></tr></thead>
            <tbody>
              ${risks.map(r => `<tr>
                <td class="fw-semibold">${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.grade_level)}</td>
                <td>${escapeHtml(r.exam_board||'—')}</td>
                <td><span class="badge bg-danger">${r.overdue_count}</span></td>
                <td><button class="btn btn-sm btn-outline-primary" onclick="navigate('student-detail',{studentId:'${r.id}'})">查看详情</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
    </div>`;
  } catch (e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════
//  规划师工作台
// ════════════════════════════════════════════════════════
async function renderCounselorWorkbench() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;
  try {
    const [students, feedback] = await Promise.all([
      GET('/api/students'),
      GET('/api/feedback'),
    ]);

    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-person-lines-fill me-2"></i>规划师工作台</h4>
      <button class="btn btn-primary btn-sm" onclick="openStudentModal()">
        <i class="bi bi-plus-lg me-1"></i>新增学生
      </button>
    </div>

    <div class="row g-3">
      <!-- 学生列表 -->
      <div class="col-md-8">
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span class="fw-semibold"><i class="bi bi-person-vcard me-1 text-primary"></i> 学生列表</span>
            <div class="d-flex gap-2">
              <input class="form-control form-control-sm" id="student-search" placeholder="搜索姓名..." style="width:150px">
              <select class="form-select form-select-sm" id="grade-filter" style="width:100px">
                <option value="">全部年级</option>
                <option value="G9">G9</option><option value="G10">G10</option>
                <option value="G11">G11</option><option value="G12">G12</option>
              </select>
            </div>
          </div>
          <div class="card-body p-0" id="counselor-student-list">
            ${renderStudentTable(students)}
          </div>
        </div>
      </div>

      <!-- 右侧面板 -->
      <div class="col-md-4">
        <!-- 待处理反馈 -->
        <div class="card mb-3">
          <div class="card-header fw-semibold">
            <i class="bi bi-chat-dots me-1 text-warning"></i> 待处理反馈
            <span class="badge bg-warning text-dark ms-1">${feedback.length}</span>
          </div>
          <div class="card-body p-0">
            ${feedback.length === 0 ? '<p class="text-center text-muted py-3 small">暂无待处理反馈</p>' :
            feedback.slice(0,5).map(f => `
              <div class="border-bottom p-2">
                <div class="d-flex justify-content-between">
                  <span class="small fw-semibold">${escapeHtml(f.student_name)}</span>
                  <span class="badge bg-secondary" style="font-size:10px">${escapeHtml(f.feedback_type)}</span>
                </div>
                <p class="small text-muted mb-0">${escapeHtml(f.content.substring(0,60))}...</p>
                <small class="text-muted">${fmtDatetime(f.created_at)}</small>
              </div>`).join('')}
            ${feedback.length > 5 ? `<div class="p-2 text-center"><a href="#" onclick="navigate('feedback-list')" class="small">查看全部 ${feedback.length} 条</a></div>` : ''}
          </div>
        </div>

        <!-- 即将逾期任务 -->
        <div class="card">
          <div class="card-header fw-semibold"><i class="bi bi-clock-history me-1 text-danger"></i> 近期截止任务</div>
          <div id="upcoming-tasks" class="card-body p-0">
            <div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div>
          </div>
        </div>
      </div>
    </div>`;

    loadUpcomingTasks();

    // 搜索过滤
    document.getElementById('student-search').oninput = (e) => filterStudents(students, e.target.value, document.getElementById('grade-filter').value);
    document.getElementById('grade-filter').onchange = (e) => filterStudents(students, document.getElementById('student-search').value, e.target.value);

  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

async function loadUpcomingTasks() {
  try {
    const students = await GET('/api/students');
    const el = document.getElementById('upcoming-tasks');
    if (!el) return;
    // Fetch all students' tasks concurrently instead of sliced serial requests
    const taskArrays = await Promise.all(
      students.map(s => GET(`/api/students/${s.id}/tasks`)
        .then(t => t.filter(x => x.status !== 'done').map(x => ({...x, student_name: s.name})))
        .catch(() => [])
      )
    );
    const tasks = taskArrays.flat();
    tasks.sort((a,b) => new Date(a.due_date) - new Date(b.due_date));
    const upcoming = tasks.slice(0,8);
    if (upcoming.length === 0) {
      el.innerHTML = '<p class="text-center text-muted py-3 small">暂无近期任务</p>';
    } else {
      el.innerHTML = upcoming.map(t => {
        const overdue = isOverdue(t.due_date, t.status);
        return `<div class="border-bottom p-2">
          <div class="d-flex justify-content-between">
            <span class="small ${overdue?'text-danger fw-bold':''}">${escapeHtml(t.title.substring(0,25))}</span>
            ${overdue ? '<i class="bi bi-exclamation-circle text-danger"></i>' : ''}
          </div>
          <div class="d-flex justify-content-between">
            <small class="text-muted">${escapeHtml(t.student_name)}</small>
            <small class="${overdue?'text-danger':'text-muted'}">${fmtDate(t.due_date)}</small>
          </div>
        </div>`;
      }).join('');
    }
  } catch(e) {}
}

function filterStudents(students, search, grade) {
  const filtered = students.filter(s => {
    const matchSearch = !search || s.name.includes(search);
    const matchGrade = !grade || s.grade_level === grade;
    return matchSearch && matchGrade;
  });
  const el = document.getElementById('counselor-student-list');
  if (el) el.innerHTML = renderStudentTable(filtered);
}

function renderStudentTable(students) {
  if (!students || students.length === 0) return '<p class="text-center text-muted py-4">暂无学生数据</p>';
  return `<div class="table-responsive">
    <table class="table table-hover mb-0">
      <thead class="table-light"><tr>
        <th>姓名</th><th>年级</th><th>考试局</th><th>逾期任务</th><th>导师</th><th>操作</th>
      </tr></thead>
      <tbody>
        ${students.map(s => `<tr>
          <td class="fw-semibold">${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.grade_level)}</td>
          <td><span class="badge bg-light text-dark border">${escapeHtml(s.exam_board||'—')}</span></td>
          <td>${s.overdue_count > 0 ? `<span class="badge bg-danger">${s.overdue_count} 逾期</span>` : '<span class="text-muted small">正常</span>'}</td>
          <td class="small text-muted">${escapeHtml((s.mentors||'').substring(0,20)||'—')}</td>
          <td>
            <button class="btn btn-sm btn-outline-primary" onclick="navigate('student-detail',{studentId:'${s.id}'})">
              <i class="bi bi-eye"></i>
            </button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// ════════════════════════════════════════════════════════
//  导师工作台
// ════════════════════════════════════════════════════════
async function renderMentorWorkbench() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;
  try {
    const students = await GET('/api/students');
    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-person-check-fill me-2"></i>导师工作台</h4>
    </div>
    <div class="row g-3">
      ${students.map(s => `
      <div class="col-md-6">
        <div class="card student-card">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <h6 class="fw-bold mb-1">${escapeHtml(s.name)} <span class="badge bg-secondary ms-1">${escapeHtml(s.grade_level)}</span></h6>
                <small class="text-muted">${escapeHtml(s.exam_board||'—')}</small>
              </div>
              ${s.overdue_count > 0 ? `<span class="badge bg-danger"><i class="bi bi-exclamation-triangle-fill me-1"></i>${s.overdue_count} 逾期</span>` : '<span class="badge bg-success">正常</span>'}
            </div>
            ${s.targets ? `<p class="small text-muted mt-2 mb-2">目标: ${escapeHtml(s.targets.substring(0,60))}</p>` : ''}
            <button class="btn btn-sm btn-outline-primary w-100" onclick="navigate('student-detail',{studentId:'${s.id}'})">
              <i class="bi bi-clipboard-check me-1"></i>查看学业计划
            </button>
          </div>
        </div>
      </div>`).join('')}
    </div>`;
  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════
//  学生门户
// ════════════════════════════════════════════════════════
async function renderStudentPortal() {
  if (State.user.role === 'student') {
    if (!State.user.linked_id) {
      document.getElementById('main-content').innerHTML =
        '<div class="alert alert-warning m-4"><i class="bi bi-exclamation-triangle me-2"></i>您的账号尚未关联学生档案，请联系管理员。</div>';
      return;
    }
    navigate('student-detail', { studentId: State.user.linked_id });
  } else {
    navigate('student-detail', { studentId: State.currentStudentId });
  }
}

// ════════════════════════════════════════════════════════
//  家长门户
// ════════════════════════════════════════════════════════
async function renderParentPortal(params = {}) {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;
  try {
    const students = await GET('/api/students');
    if (students.length === 0) {
      mc.innerHTML = '<div class="alert alert-info">暂无关联学生。</div>';
      return;
    }
    // Support multiple children: use selected id or default to first
    const selectedId = params.studentId || State._parentSelectedStudentId || students[0].id;
    State._parentSelectedStudentId = selectedId;
    const s = students.find(x => x.id === selectedId) || students[0];
    const [detail, tasks, comms, examSittings, assessments] = await Promise.all([
      GET(`/api/students/${s.id}`),
      GET(`/api/students/${s.id}/tasks`),
      GET(`/api/students/${s.id}/communications`),
      GET(`/api/students/${s.id}/exam-sittings`).catch(() => []),
      GET(`/api/students/${s.id}/assessments`).catch(() => []),
    ]);

    const stu = detail.student || s;
    const doneTasks = tasks.filter(t => t.status === 'done').length;
    const totalTasks = tasks.length;
    const overdueTasks = tasks.filter(t => isOverdue(t.due_date, t.status));
    const pendingTasks = tasks.filter(t => t.status !== 'done');

    const appStatusMap = {
      'pending':'准备中','applied':'已提交','offer':'有Offer','firm':'已确认',
      'declined':'已拒绝','enrolled':'已入学','withdrawn':'已撤回','waitlist':'候补','interview':'面试中'
    };

    mc.innerHTML = `
    <div class="page-header">
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <h4 class="mb-0"><i class="bi bi-people-fill me-2"></i>家长门户</h4>
        ${students.length > 1 ? `<select class="form-select form-select-sm" style="width:auto" onchange="renderParentPortal({studentId:this.value})">
          ${students.map(x => `<option value="${x.id}" ${x.id===s.id?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}
        </select>` : `<span class="text-muted">— ${escapeHtml(stu.name)} 的学业档案</span>`}
      </div>
      <button class="btn btn-outline-primary btn-sm" onclick="openFeedbackModal('${s.id}')">
        <i class="bi bi-chat-left-text me-1"></i>提交反馈
      </button>
    </div>

    <!-- 学生基本信息 -->
    <div class="card mb-4">
      <div class="card-header fw-semibold bg-light">
        <i class="bi bi-person-badge me-1 text-primary"></i>学生基本信息
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-6 col-md-3">
            <div class="text-muted small">姓名</div>
            <div class="fw-semibold">${escapeHtml(stu.name)}</div>
          </div>
          <div class="col-6 col-md-3">
            <div class="text-muted small">年级</div>
            <div class="fw-semibold">${escapeHtml(stu.grade_level||'—')}</div>
          </div>
          <div class="col-6 col-md-3">
            <div class="text-muted small">考试局</div>
            <div class="fw-semibold">${escapeHtml(stu.exam_board||'—')}</div>
          </div>
          <div class="col-6 col-md-3">
            <div class="text-muted small">入学日期</div>
            <div class="fw-semibold">${fmtDate(stu.enrol_date)}</div>
          </div>
          ${stu.date_of_birth ? `<div class="col-6 col-md-3">
            <div class="text-muted small">出生日期</div>
            <div class="fw-semibold">${fmtDate(stu.date_of_birth)}</div>
          </div>` : ''}
          ${stu.notes ? `<div class="col-12">
            <div class="text-muted small">备注</div>
            <div class="small">${escapeHtml(stu.notes)}</div>
          </div>` : ''}
        </div>
      </div>
    </div>

    <!-- 进度概览 -->
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-3">
        <div class="card text-center p-3">
          <div class="display-5 fw-bold text-primary">${doneTasks}<span class="fs-6 text-muted">/${totalTasks}</span></div>
          <div class="text-muted small">任务完成</div>
          <div class="progress mt-2" style="height:6px">
            <div class="progress-bar bg-primary" style="width:${totalTasks?Math.round(doneTasks/totalTasks*100):0}%"></div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card text-center p-3">
          <div class="display-5 fw-bold ${overdueTasks.length>0?'text-danger':'text-success'}">${overdueTasks.length}</div>
          <div class="text-muted small">逾期任务</div>
          <div class="mt-2 small ${overdueTasks.length>0?'text-danger':'text-success'}">${overdueTasks.length>0?'需要关注':'按时推进'}</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card text-center p-3">
          <div class="display-5 fw-bold text-info">${detail.applications.length}</div>
          <div class="text-muted small">申请院校</div>
          <div class="mt-2 small text-muted">${detail.targets.length} 个目标院校</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card text-center p-3">
          <div class="display-5 fw-bold text-warning">${detail.subjects.length}</div>
          <div class="text-muted small">选修科目</div>
          <div class="mt-2 small text-muted">${examSittings.length} 条考试记录</div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-3">
      <!-- 选修科目 -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-header fw-semibold"><i class="bi bi-book me-1 text-success"></i>选修科目</div>
          <div class="card-body p-0">
            ${detail.subjects.length === 0
              ? emptyStateSm('暂无选科记录','book')
              : `<table class="table table-sm mb-0">
                  <thead class="table-light"><tr><th>科目</th><th>等级</th><th>预测成绩</th><th>实际成绩</th></tr></thead>
                  <tbody>
                    ${detail.subjects.map(sub => `<tr>
                      <td class="small">${escapeHtml(sub.subject_name||sub.code||'—')}</td>
                      <td class="small text-muted">${escapeHtml(sub.level||'—')}</td>
                      <td class="small">${sub.predicted_grade ? `<span class="badge bg-info text-dark">${escapeHtml(sub.predicted_grade)}</span>` : '—'}</td>
                      <td class="small">${sub.actual_grade ? `<span class="badge bg-success">${escapeHtml(sub.actual_grade)}</span>` : '—'}</td>
                    </tr>`).join('')}
                  </tbody>
                </table>`}
          </div>
        </div>
      </div>

      <!-- 考试记录 -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-header fw-semibold"><i class="bi bi-clipboard-data me-1 text-warning"></i>考试成绩记录</div>
          <div class="card-body p-0">
            ${examSittings.length === 0
              ? emptyStateSm('暂无考试记录','clipboard-data')
              : `<table class="table table-sm mb-0">
                  <thead class="table-light"><tr><th>科目</th><th>成绩</th><th>考试日期</th><th>状态</th></tr></thead>
                  <tbody>
                    ${examSittings.slice(0,8).map(e => `<tr>
                      <td class="small">${escapeHtml(e.subject_name||e.subject_code||'—')}</td>
                      <td class="small fw-semibold">${e.grade ? `<span class="badge bg-primary">${escapeHtml(e.grade)}</span>` : (e.predicted_grade ? `<span class="badge bg-info text-dark">${escapeHtml(e.predicted_grade)}(预)</span>` : '—')}</td>
                      <td class="small text-muted">${fmtDate(e.sitting_date)||'—'}</td>
                      <td class="small">${e.grade ? '<span class="badge bg-success">已出分</span>' : '<span class="badge bg-secondary">待出分</span>'}</td>
                    </tr>`).join('')}
                  </tbody>
                </table>`}
          </div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-3">
      <!-- 申请状态 -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-header fw-semibold"><i class="bi bi-send me-1 text-primary"></i>申请院校状态</div>
          <div class="card-body p-0">
            ${detail.applications.length === 0
              ? emptyStateSm('暂无申请记录','file-earmark-text')
              : `<table class="table table-sm mb-0">
                  <thead class="table-light"><tr><th>院校</th><th>专业</th><th>状态</th><th>截止</th></tr></thead>
                  <tbody>
                    ${detail.applications.map(app => {
                      const st = appStatusMap[app.status] || app.status || '—';
                      const stColor = app.status==='offer'||app.status==='conditional' ? 'success'
                        : app.status==='reject' ? 'danger'
                        : app.status==='submitted' ? 'primary' : 'secondary';
                      return `<tr>
                        <td class="small">${escapeHtml(app.uni_name||'—')}</td>
                        <td class="small text-muted">${escapeHtml(app.department||'—')}</td>
                        <td><span class="badge bg-${stColor}">${st}</span></td>
                        <td class="small text-muted">${fmtDate(app.deadline)||'—'}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>`}
          </div>
        </div>
      </div>

      <!-- 目标院校 -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-header fw-semibold"><i class="bi bi-building me-1 text-info"></i>目标院校规划</div>
          <div class="card-body p-0">
            ${detail.targets.length === 0
              ? emptyStateSm('暂无目标院校','mortarboard')
              : `<table class="table table-sm mb-0">
                  <thead class="table-light"><tr><th>院校</th><th>专业</th><th>梯度</th></tr></thead>
                  <tbody>
                    ${detail.targets.map(t => `<tr>
                      <td class="small">${escapeHtml(t.uni_name)}</td>
                      <td class="small text-muted">${escapeHtml(t.department||'—')}</td>
                      <td>${tierBadge(t.tier)}</td>
                    </tr>`).join('')}
                  </tbody>
                </table>`}
          </div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-3">
      <!-- 近期模拟测试成绩 -->
      ${assessments.length > 0 ? `
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-header fw-semibold"><i class="bi bi-graph-up me-1 text-danger"></i>近期测试成绩</div>
          <div class="card-body p-0">
            <table class="table table-sm mb-0">
              <thead class="table-light"><tr><th>测试类型</th><th>科目</th><th>分数</th><th>日期</th></tr></thead>
              <tbody>
                ${assessments.slice(0,6).map(a => `<tr>
                  <td class="small">${escapeHtml(a.assess_type||'—')}</td>
                  <td class="small text-muted">${escapeHtml(a.subject||'—')}</td>
                  <td class="small fw-semibold">${a.score != null ? `${a.score}/${a.max_score||100}` : '—'}</td>
                  <td class="small text-muted">${fmtDate(a.assess_date)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>` : ''}

      <!-- 待完成任务 -->
      <div class="${assessments.length > 0 ? 'col-md-6' : 'col-12'}">
        <div class="card h-100">
          <div class="card-header fw-semibold"><i class="bi bi-calendar-check me-1 text-warning"></i>待完成任务</div>
          <div class="card-body p-0">
            ${pendingTasks.length === 0
              ? '<p class="text-center text-success py-3 small"><i class="bi bi-check-circle me-1"></i>所有任务已完成</p>'
              : pendingTasks.slice(0,6).map(t => {
                  const overdue = isOverdue(t.due_date, t.status);
                  return `<div class="d-flex align-items-start gap-2 p-2 border-bottom">
                    <i class="bi bi-circle${overdue?' text-danger':' text-muted'} mt-1"></i>
                    <div class="flex-grow-1">
                      <div class="small ${overdue?'text-danger fw-bold':''}">${escapeHtml(t.title)}</div>
                      <div class="d-flex gap-2 mt-1">
                        <small class="text-muted">${fmtDate(t.due_date)||'无截止日期'}</small>
                        ${overdue ? '<small class="text-danger fw-bold">已逾期</small>' : ''}
                        <small class="badge bg-light text-dark border">${escapeHtml(t.category||'其他')}</small>
                      </div>
                    </div>
                  </div>`;
                }).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- 沟通记录 -->
    <div class="card">
      <div class="card-header fw-semibold"><i class="bi bi-chat-left-dots me-1 text-secondary"></i>近期沟通记录</div>
      <div class="card-body p-0">
        ${comms.length === 0 ? emptyStateSm('暂无沟通记录','chat-dots') :
        comms.slice(0,5).map(c => `<div class="border-bottom p-3">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="badge bg-light text-dark border">${escapeHtml(c.channel||'—')}</span>
            <small class="text-muted">${fmtDatetime(c.comm_date)}</small>
          </div>
          <p class="small mb-1">${escapeHtml(c.summary||'')}</p>
          ${c.action_items ? `<div class="small text-primary"><i class="bi bi-arrow-right me-1"></i>待办：${escapeHtml(c.action_items)}</div>` : ''}
          ${c.staff_name ? `<div class="small text-muted mt-1">规划师：${escapeHtml(c.staff_name)}</div>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════
//  学生管理列表
// ════════════════════════════════════════════════════════
async function renderStudentList() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="p-3"><div class="skeleton" style="height:36px;width:260px;border-radius:6px;margin-bottom:1rem"></div><table class="table"><tbody>${skeletonTableRows(5,8)}</tbody></table></div>`;
  try {
    const students = await GET('/api/students');
    const isIntakeStaff = State.user.role === 'intake_staff';

    const renderRows = (list) => list.map(s => `<tr>
                <td class="fw-semibold">${isIntakeStaff ? escapeHtml(s.name) : `<a href="#" class="student-name-link fw-semibold" onclick="navigate('student-detail',{studentId:'${s.id}'})">${escapeHtml(s.name)}</a>`}</td>
                <td>${escapeHtml(s.grade_level)}</td>
                <td>${fmtDate(s.enrol_date)}</td>
                <td><span class="badge bg-light text-dark border">${escapeHtml(s.exam_board||'—')}</span></td>
                ${!isIntakeStaff ? `
                  <td class="small text-muted">${escapeHtml((s.mentors||'').substring(0,20)||'—')}</td>
                  <td class="small">${escapeHtml((s.targets||'').substring(0,30)||'—')}</td>` : ''}
                  <td>
                  ${isIntakeStaff
                    ? `<button class="btn btn-sm btn-outline-primary" onclick="navigate('intake-cases',{student_id:'${s.id}'})"><i class="bi bi-folder2-open me-1"></i>查看案例</button>`
                    : `<button class="btn btn-sm btn-outline-primary me-1" onclick="navigate('student-detail',{studentId:'${s.id}'})"><i class="bi bi-eye"></i></button>
                       ${hasRole('principal','counselor') ? `<button class="btn btn-sm btn-outline-secondary me-1" onclick="openStudentModal('${s.id}')"><i class="bi bi-pencil"></i></button>` : ''}
                       ${hasRole('principal') ? `<button class="btn btn-sm btn-outline-danger" data-sid="${escapeHtml(s.id)}" data-sname="${escapeHtml(s.name)}" onclick="deleteStudent(this.dataset.sid,this.dataset.sname)"><i class="bi bi-trash"></i></button>` : ''}`
                  }
                </td>
              </tr>`).join('') || '<tr><td colspan="10" class="text-center text-muted py-3">暂无匹配学生</td></tr>';

    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-person-vcard me-2"></i>${isIntakeStaff ? '学生查询' : '学生管理'}</h4>
      <div class="d-flex gap-2 align-items-center">
        <input class="form-control form-control-sm" id="studentListSearch" placeholder="搜索姓名..." style="width:160px" oninput="window._stuListFilter(this.value)">
        <select class="form-select form-select-sm" id="studentListGrade" style="width:100px" onchange="window._stuListFilter(document.getElementById('studentListSearch').value)">
          <option value="">全部年级</option>
          <option value="G9">G9</option><option value="G10">G10</option>
          <option value="G11">G11</option><option value="G12">G12</option>
        </select>
        ${hasRole('principal','counselor') ? `<button class="btn btn-primary btn-sm" onclick="openStudentModal()"><i class="bi bi-plus-lg me-1"></i>新增学生</button>` : ''}
      </div>
    </div>
    ${isIntakeStaff ? '<div class="alert alert-info py-2 small mb-3"><i class="bi bi-info-circle me-1"></i>此页面为只读查询，点击"查看案例"可进入入学管理详情</div>' : ''}
    <div class="card">
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead class="table-light">
              <tr><th>姓名</th><th>年级</th><th>入学日期</th><th>考试局</th>
              ${!isIntakeStaff ? '<th>导师</th><th>目标院校</th>' : ''}
              <th>操作</th></tr>
            </thead>
            <tbody id="studentListTbody">${renderRows(students)}</tbody>
          </table>
        </div>
      </div>
    </div>`;

    window._stuListFilter = (search) => {
      const grade = document.getElementById('studentListGrade')?.value || '';
      const filtered = students.filter(s =>
        (!search || s.name.toLowerCase().includes(search.toLowerCase())) &&
        (!grade || s.grade_level === grade)
      );
      const tbody = document.getElementById('studentListTbody');
      if (tbody) tbody.innerHTML = renderRows(filtered);
    };
  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════
//  学生详情
// ════════════════════════════════════════════════════════
async function renderStudentDetail({ studentId, activeTab } = {}) {
  const id = studentId || State.currentStudentId;
  if (!id) { navigate('students'); return; }
  State.currentStudentId = id;

  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;

  try {
    const [detail, tasks, materials, comms, feedback, ps] = await Promise.all([
      GET(`/api/students/${id}`),
      GET(`/api/students/${id}/tasks`),
      GET(`/api/students/${id}/materials`),
      GET(`/api/students/${id}/communications`),
      GET(`/api/students/${id}/feedback`),
      GET(`/api/students/${id}/personal-statement`),
    ]);

    const { student, assessments, subjects, targets, mentors, applications, parents, agentInfo } = detail;
    const canEdit = hasRole('principal','counselor');

    mc.innerHTML = `
    <div class="page-header">
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-outline-secondary btn-sm" onclick="navigate(State.previousPage||(hasRole('student')?'student-portal':hasRole('parent')?'parent-portal':'students'))"><i class="bi bi-arrow-left"></i></button>
        <h4 class="mb-0"><i class="bi bi-person-fill me-2 text-primary"></i>${escapeHtml(student.name)}</h4>
        <span class="badge bg-secondary">${escapeHtml(student.grade_level)}</span>
        <span class="badge bg-info">${escapeHtml(student.exam_board||'—')}</span>
        ${isUnder14(student.date_of_birth) ? `<span class="badge bg-warning text-dark" title="未满14周岁，需监护人同意"><i class="bi bi-shield-exclamation me-1"></i>未满14岁·合规</span>` : ''}
      </div>
      <div class="d-flex gap-2">
        ${canEdit ? `
          <button class="btn btn-outline-secondary btn-sm" onclick="openStudentModal('${id}')"><i class="bi bi-pencil me-1"></i>编辑</button>
          <button class="btn btn-outline-primary btn-sm" onclick="openAssignMentorModal('${id}')"><i class="bi bi-person-plus me-1"></i>分配导师</button>
          <button class="btn btn-warning btn-sm" onclick="openTimelineModal('${id}')"><i class="bi bi-magic me-1"></i>生成时间线</button>
          <button class="btn btn-outline-warning btn-sm" onclick="openConsentModal('${id}')"><i class="bi bi-shield-check me-1"></i>监护人同意</button>
        ` : ''}
        ${hasRole('parent','student') ? `<button class="btn btn-outline-primary btn-sm" onclick="openFeedbackModal('${id}')"><i class="bi bi-chat me-1"></i>提交反馈</button>` : ''}
      </div>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs mb-3" id="student-tabs">
      <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#tab-overview">概览</a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-timeline">时间线任务 <span class="badge bg-warning text-dark ms-1">${tasks.filter(t=>t.status!=='done').length}</span></a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-apps">申请管理 <span class="badge bg-primary ms-1">${applications.length}</span></a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-materials">材料状态 <span class="badge bg-info ms-1">${materials.length}</span></a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-ps">个人陈述</a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-comms">沟通记录 <span class="badge bg-secondary ms-1">${comms.length}</span></a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-feedback">反馈 <span class="badge bg-secondary ms-1">${feedback.length}</span></a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-exams">考试记录</a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-admission-eval">录取评估</a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-ai-plan">AI 规划 <i class="bi bi-stars text-warning ms-1"></i></a></li>
    </ul>

    <div class="tab-content" id="student-tab-content">
      <!-- 概览 -->
      <div class="tab-pane fade show active" id="tab-overview">
        <div class="overview-grid" id="overview-grid">

          <!-- 基本信息 -->
          <div class="overview-card" data-card-id="basic" data-span="1" draggable="true">
            <div class="ov-card">
              <div class="ov-card-header">
                <i class="bi bi-grip-vertical ov-drag-handle" title="拖动排序"></i>
                <span class="ov-card-title"><i class="bi bi-person-fill text-primary"></i>基本信息</span>
                <div class="ov-card-actions">
                  <button class="ov-card-btn" onclick="toggleCardSpan('basic')" title="切换宽度"><i class="bi bi-arrows-fullscreen"></i></button>
                </div>
              </div>
              <div class="ov-card-body">
                <table class="ov-info-table">
                  <tr><th>姓名</th><td>${escapeHtml(student.name)}</td></tr>
                  <tr><th>年级</th><td>${escapeHtml(student.grade_level)}</td></tr>
                  <tr><th>考试局</th><td>${escapeHtml(student.exam_board||'—')}</td></tr>
                  <tr><th>入学日期</th><td>${fmtDate(student.enrol_date)}</td></tr>
                  <tr><th>出生日期</th><td>${fmtDate(student.date_of_birth)||'—'}${isUnder14(student.date_of_birth) ? ' <span class="badge bg-warning text-dark ms-1" style="font-size:.7rem">未满14岁</span>' : ''}</td></tr>
                  ${student.notes ? `<tr><th>备注</th><td style="color:var(--text-secondary);font-size:.82rem">${escapeHtml(student.notes)}</td></tr>` : ''}
                </table>
              </div>
            </div>
          </div>

          <!-- 导师/规划师 -->
          <div class="overview-card" data-card-id="mentor" data-span="1" draggable="true">
            <div class="ov-card">
              <div class="ov-card-header">
                <i class="bi bi-grip-vertical ov-drag-handle" title="拖动排序"></i>
                <span class="ov-card-title"><i class="bi bi-person-check text-warning"></i>导师 / 规划师</span>
                <div class="ov-card-actions">
                  ${canEdit ? `<button class="ov-card-btn" onclick="openAssignMentorModal('${id}')" title="分配导师"><i class="bi bi-plus-lg"></i></button>` : ''}
                  <button class="ov-card-btn" onclick="toggleCardSpan('mentor')" title="切换宽度"><i class="bi bi-arrows-fullscreen"></i></button>
                </div>
              </div>
              <div class="ov-card-body p-0">
                ${mentors.length === 0
                  ? `<div class="ov-empty"><i class="bi bi-person-check"></i><span>暂未分配导师</span></div>`
                  : mentors.map(m => `<div class="ov-row-item">
                      <div class="ov-avatar">${escapeHtml(m.staff_name.charAt(0))}</div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:.875rem;font-weight:600;color:var(--text-primary)">${escapeHtml(m.staff_name)}</div>
                        <div style="font-size:.78rem;color:var(--text-tertiary)">${escapeHtml(m.role)}</div>
                      </div>
                      ${canEdit ? `<button class="ov-card-btn" style="color:#dc2626" onclick="removeMentor('${m.id}','${id}')" title="移除"><i class="bi bi-x-circle"></i></button>` : ''}
                    </div>`).join('')}
              </div>
            </div>
          </div>

          <!-- 入学评估 -->
          <div class="overview-card" data-card-id="assessment" data-span="1" draggable="true">
            <div class="ov-card">
              <div class="ov-card-header">
                <i class="bi bi-grip-vertical ov-drag-handle" title="拖动排序"></i>
                <span class="ov-card-title"><i class="bi bi-graph-up text-success"></i>入学评估</span>
                <div class="ov-card-actions">
                  ${canEdit ? `<button class="ov-card-btn" onclick="openAssessmentModal('${id}')" title="添加评估"><i class="bi bi-plus-lg"></i></button>` : ''}
                  <button class="ov-card-btn" onclick="toggleCardSpan('assessment')" title="切换宽度"><i class="bi bi-arrows-fullscreen"></i></button>
                </div>
              </div>
              <div class="ov-card-body p-0">
                ${assessments.length === 0
                  ? `<div class="ov-empty"><i class="bi bi-graph-up"></i><span>暂无评估记录</span></div>`
                  : assessments.map(a => `<div class="ov-row-item">
                      <div style="flex:1;min-width:0">
                        <div style="font-size:.875rem;font-weight:600;color:var(--text-primary)">${escapeHtml(a.assess_type)}</div>
                        <div style="font-size:.78rem;color:var(--text-tertiary)">${escapeHtml(a.subject||'—')} · ${fmtDate(a.assess_date)}</div>
                      </div>
                      <div style="text-align:right;flex-shrink:0">
                        <div class="ov-score">${a.score}<small style="color:var(--text-tertiary);font-size:.75rem;font-weight:400"> / ${a.max_score}</small></div>
                        ${a.percentile ? `<div style="font-size:.75rem;color:var(--text-tertiary)">${a.percentile}%ile</div>` : ''}
                      </div>
                    </div>`).join('')}
              </div>
            </div>
          </div>

          <!-- 选科记录 -->
          <div class="overview-card" data-card-id="subjects" data-span="1" draggable="true">
            <div class="ov-card">
              <div class="ov-card-header">
                <i class="bi bi-grip-vertical ov-drag-handle" title="拖动排序"></i>
                <span class="ov-card-title"><i class="bi bi-book text-info"></i>选科记录</span>
                <div class="ov-card-actions">
                  ${canEdit ? `<button class="ov-card-btn" onclick="openSubjectModal('${id}')" title="添加科目"><i class="bi bi-plus-lg"></i></button>` : ''}
                  <button class="ov-card-btn" onclick="toggleCardSpan('subjects')" title="切换宽度"><i class="bi bi-arrows-fullscreen"></i></button>
                </div>
              </div>
              <div class="ov-card-body">
                ${subjects.length === 0
                  ? `<div class="ov-empty" style="padding:.75rem"><i class="bi bi-book"></i><span>暂无选科记录</span></div>`
                  : `<div style="display:flex;flex-wrap:wrap;gap:.5rem">
                      ${subjects.map(s => `<span class="ov-subject-tag">
                        <strong>${escapeHtml(s.code)}</strong>
                        ${s.level ? `<span style="color:var(--text-secondary)">${escapeHtml(s.level)}</span>` : ''}
                        <span style="color:var(--text-tertiary);font-size:.75rem">${escapeHtml(s.exam_board||'')}</span>
                        ${canEdit ? `<button class="tag-remove" onclick="removeSubject('${s.id}','${id}')" title="移除"><i class="bi bi-x"></i></button>` : ''}
                      </span>`).join('')}
                    </div>`}
              </div>
            </div>
          </div>

          <!-- 目标院校 -->
          <div class="overview-card" data-card-id="targets" data-span="2" draggable="true">
            <div class="ov-card">
              <div class="ov-card-header">
                <i class="bi bi-grip-vertical ov-drag-handle" title="拖动排序"></i>
                <span class="ov-card-title"><i class="bi bi-mortarboard text-danger"></i>目标院校</span>
                <div class="ov-card-actions">
                  ${canEdit ? `<button class="ov-card-btn" onclick="openTargetModal('${id}')" title="添加院校"><i class="bi bi-plus-lg"></i></button>` : ''}
                  <button class="ov-card-btn" onclick="toggleCardSpan('targets')" title="切换宽度"><i class="bi bi-arrows-fullscreen"></i></button>
                </div>
              </div>
              <div class="ov-card-body p-0">
                ${targets.length === 0
                  ? `<div class="ov-empty"><i class="bi bi-mortarboard"></i><span>暂无目标院校，点击右上角 + 添加</span></div>`
                  : `<table style="width:100%;border-collapse:collapse;font-size:.875rem">
                      <thead><tr style="background:var(--surface-2)">
                        <th style="padding:.5rem 1rem;color:var(--text-tertiary);font-weight:500">院校</th>
                        <th style="padding:.5rem 1rem;color:var(--text-tertiary);font-weight:500">专业 / 方向</th>
                        <th style="padding:.5rem 1rem;color:var(--text-tertiary);font-weight:500">梯度</th>
                        ${canEdit ? '<th style="padding:.5rem 1rem;width:40px"></th>' : ''}
                      </tr></thead>
                      <tbody>
                        ${targets.map(t => `<tr style="border-top:1px solid var(--border)">
                          <td style="padding:.6rem 1rem;font-weight:500;color:var(--text-primary)">${escapeHtml(t.uni_name)}</td>
                          <td style="padding:.6rem 1rem;color:var(--text-secondary)">${escapeHtml(t.department||'—')}</td>
                          <td style="padding:.6rem 1rem">${tierBadge(t.tier)}</td>
                          ${canEdit ? `<td style="padding:.6rem 1rem"><button class="ov-card-btn" style="color:#dc2626" onclick="deleteTarget('${t.id}','${id}')"><i class="bi bi-trash"></i></button></td>` : ''}
                        </tr>`).join('')}
                      </tbody>
                    </table>`}
              </div>
            </div>
          </div>

          <!-- 家长/监护人 -->
          <div class="overview-card" data-card-id="parents" data-span="2" draggable="true">
            <div class="ov-card">
              <div class="ov-card-header">
                <i class="bi bi-grip-vertical ov-drag-handle" title="拖动排序"></i>
                <span class="ov-card-title"><i class="bi bi-people text-secondary"></i>家长 / 监护人</span>
                <div class="ov-card-actions">
                  ${canEdit ? `<button class="ov-card-btn" onclick="openParentModal('${id}')" title="添加家长"><i class="bi bi-plus-lg"></i></button>` : ''}
                  <button class="ov-card-btn" onclick="toggleCardSpan('parents')" title="切换宽度"><i class="bi bi-arrows-fullscreen"></i></button>
                </div>
              </div>
              <div class="ov-card-body">
                ${parents.length === 0
                  ? `<div class="ov-empty" style="padding:.75rem"><i class="bi bi-people"></i><span>暂无家长信息</span></div>`
                  : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.75rem">
                      ${parents.map(p => `<div class="ov-parent-card">
                        <div style="font-weight:600;color:var(--text-primary);margin-bottom:.3rem">
                          ${escapeHtml(p.name)}
                          <span style="font-weight:400;color:var(--text-tertiary);font-size:.8rem;margin-left:.3rem">${escapeHtml(p.relation||'')}</span>
                        </div>
                        ${p.phone ? `<div style="color:var(--text-secondary)"><i class="bi bi-telephone me-1"></i>${escapeHtml(p.phone)}</div>` : ''}
                        ${p.email ? `<div style="color:var(--text-secondary);word-break:break-all"><i class="bi bi-envelope me-1"></i>${escapeHtml(p.email)}</div>` : ''}
                        ${p.wechat ? `<div style="color:var(--text-secondary)"><i class="bi bi-wechat me-1"></i>${escapeHtml(p.wechat)}</div>` : ''}
                      </div>`).join('')}
                    </div>`}
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- 时间线任务 -->
      <div class="tab-pane fade" id="tab-timeline">
        <div class="d-flex justify-content-between mb-3">
          <h6 class="fw-semibold mb-0">里程碑任务列表</h6>
          <div class="d-flex gap-2">
            ${canEdit || hasRole('mentor') ? `
              <button class="btn btn-outline-secondary btn-sm" onclick="openTimelineModal('${id}')"><i class="bi bi-magic me-1"></i>生成模板</button>
              <button class="btn btn-primary btn-sm" onclick="openTaskModal('${id}')"><i class="bi bi-plus me-1"></i>添加任务</button>
            ` : ''}
          </div>
        </div>
        ${renderTaskList(tasks, id, canEdit || hasRole('mentor'))}
      </div>

      <!-- 申请管理 -->
      <div class="tab-pane fade" id="tab-apps">
        <div class="d-flex justify-content-between mb-3">
          <h6 class="fw-semibold mb-0">申请列表</h6>
          ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="openApplicationModal('${id}')"><i class="bi bi-plus me-1"></i>添加申请</button>` : ''}
        </div>
        ${renderApplicationList(applications, id, canEdit)}
      </div>

      <!-- 材料状态 -->
      <div class="tab-pane fade" id="tab-materials">
        <div class="d-flex justify-content-between mb-3">
          <h6 class="fw-semibold mb-0">材料清单</h6>
          <button class="btn btn-primary btn-sm" onclick="openMaterialModal('${id}')"><i class="bi bi-plus me-1"></i>添加材料</button>
        </div>
        ${renderMaterialList(materials, canEdit)}
      </div>

      <!-- 个人陈述 -->
      <div class="tab-pane fade" id="tab-ps">
        <div class="d-flex justify-content-between mb-3">
          <h6 class="fw-semibold mb-0">个人陈述（2026三问结构）</h6>
          <button class="btn btn-primary btn-sm" onclick="openPSModal('${id}')"><i class="bi bi-plus me-1"></i>${ps.length===0?'新建':'新版本'}</button>
        </div>
        ${renderPSList(ps, id)}
      </div>

      <!-- 沟通记录 -->
      <div class="tab-pane fade" id="tab-comms">
        <div class="d-flex justify-content-between mb-3">
          <h6 class="fw-semibold mb-0">沟通记录</h6>
          ${hasRole('principal','counselor','mentor') ? `<button class="btn btn-primary btn-sm" onclick="openCommModal('${id}')"><i class="bi bi-plus me-1"></i>记录沟通</button>` : ''}
        </div>
        ${renderCommList(comms)}
      </div>

      <!-- 反馈 -->
      <div class="tab-pane fade" id="tab-feedback">
        <div class="d-flex justify-content-between mb-3">
          <h6 class="fw-semibold mb-0">反馈记录</h6>
          <button class="btn btn-outline-primary btn-sm" onclick="openFeedbackModal('${id}')"><i class="bi bi-plus me-1"></i>提交反馈</button>
        </div>
        ${renderFeedbackItems(feedback, canEdit)}
      </div>

      <!-- 考试记录 tab -->
      <div class="tab-pane fade" id="tab-exams">
        <div class="d-flex justify-content-between mb-3">
          <h6 class="fw-semibold mb-0">考试记录</h6>
          <div class="d-flex gap-2">
            <a class="btn btn-outline-secondary btn-sm" href="/api/students/${id}/calendar.ics" title="下载日历 .ics"><i class="bi bi-calendar-check me-1"></i>ICS日历</a>
            ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="openExamSittingModal('${id}')"><i class="bi bi-plus me-1"></i>添加记录</button>` : ''}
          </div>
        </div>
        <div id="exam-sittings-container"><div class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> 加载中...</div></div>
      </div>

      <!-- 录取评估 Tab -->
      <div class="tab-pane fade" id="tab-admission-eval">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-semibold mb-0"><i class="bi bi-mortarboard-fill me-1 text-primary"></i>录取概率评估</h6>
          <div class="d-flex gap-2">
            ${canEdit ? `
            <button class="btn btn-primary btn-sm" onclick="openAdmissionEvalModal('${id}')">
              <i class="bi bi-play-circle me-1"></i>运行新评估
            </button>
            <button class="btn btn-info btn-sm text-white" onclick="openBenchmarkEvalModal('${id}')">
              <i class="bi bi-bar-chart-steps me-1"></i>基准评估
            </button>` : ''}
          </div>
        </div>
        <div class="alert alert-warning small py-2 mb-3">
          <i class="bi bi-exclamation-triangle me-1"></i>
          <strong>重要提示：</strong>概率估算基于历史数据与规则模型，仅供参考，<strong>不构成录取承诺</strong>。实际录取受多因素影响。
        </div>
        <div id="admission-evals-container"><div class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> 加载中...</div></div>
        <div class="mt-4">
          <h6 class="fw-semibold text-info"><i class="bi bi-bar-chart-steps me-1"></i>基准评估记录</h6>
          <div id="benchmark-evals-container"><div class="text-center text-muted py-3 small">加载中...</div></div>
        </div>
      </div>

      <!-- AI 规划 Tab -->
      <div class="tab-pane fade" id="tab-ai-plan">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-semibold mb-0"><i class="bi bi-stars me-1 text-warning"></i>AI 升学规划路线图</h6>
          ${canEdit ? `<div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-secondary" onclick="loadAIPlanTab('${id}')"><i class="bi bi-arrow-clockwise me-1"></i>刷新</button>
            <button class="btn btn-sm btn-warning" onclick="generateAIPlan('${id}')"><i class="bi bi-stars me-1"></i>生成 AI 规划</button>
          </div>` : ''}
        </div>
        <div class="alert alert-info py-2 small mb-3">
          <i class="bi bi-info-circle me-1"></i>AI 规划由模型辅助生成，须经规划师审核批准后方可发布。概率估算来自本系统历史数据，不构成录取承诺。
        </div>
        <div id="ai-plan-tab-container"><div class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> 加载中...</div></div>
      </div>
    </div>`;

    // 初始化概览卡片拖拽
    initOverviewDrag();

    // 激活指定标签页（如 tab-timeline）
    activateTab(activeTab);

    // 考试记录 tab：切换时加载
    const examsTabEl = document.querySelector('a[href="#tab-exams"]');
    if (examsTabEl) {
      examsTabEl.addEventListener('shown.bs.tab', () => loadExamSittings(id));
      if (activeTab === 'tab-exams') loadExamSittings(id);
    }

    // 录取评估 tab：切换时加载
    const evalTabEl = document.querySelector('a[href="#tab-admission-eval"]');
    if (evalTabEl) {
      evalTabEl.addEventListener('shown.bs.tab', () => {
        loadAdmissionEvals(id);
        loadBenchmarkEvals(id);
      });
      if (activeTab === 'tab-admission-eval') {
        loadAdmissionEvals(id);
        loadBenchmarkEvals(id);
      }
    }

    const aiPlanTabEl = document.querySelector('a[href="#tab-ai-plan"]');
    if (aiPlanTabEl) {
      aiPlanTabEl.addEventListener('shown.bs.tab', () => loadAIPlanTab(id));
      if (activeTab === 'tab-ai-plan') loadAIPlanTab(id);
    }

  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════
//  概览卡片拖拽 & 布局持久化
// ════════════════════════════════════════════════════════
function initOverviewDrag() {
  const grid = document.getElementById('overview-grid');
  if (!grid) return;

  // 应用已保存布局（顺序 + 宽度）
  const saved = JSON.parse(localStorage.getItem('student-overview-layout') || '[]');
  if (saved.length > 0) {
    saved.forEach(({ id, span }) => {
      const card = grid.querySelector(`[data-card-id="${id}"]`);
      if (card) {
        card.dataset.span = span;
        card.style.gridColumn = `span ${span}`;
      }
    });
    // 按保存顺序重排 DOM
    saved.forEach(({ id }) => {
      const card = grid.querySelector(`[data-card-id="${id}"]`);
      if (card) grid.appendChild(card);
    });
  } else {
    // 应用默认 data-span
    grid.querySelectorAll('.overview-card').forEach(card => {
      card.style.gridColumn = `span ${card.dataset.span || 1}`;
    });
  }

  // 拖拽逻辑
  let dragSrc = null;
  grid.querySelectorAll('.overview-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragSrc = card;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      grid.querySelectorAll('.overview-card').forEach(c => c.classList.remove('drag-over'));
      dragSrc = null;
      saveOverviewLayout();
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === card) return;
      const rect = card.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      card.classList.add('drag-over');
      if (e.clientY < mid) grid.insertBefore(dragSrc, card);
      else grid.insertBefore(dragSrc, card.nextSibling);
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
  });
}

function saveOverviewLayout() {
  const grid = document.getElementById('overview-grid');
  if (!grid) return;
  const layout = [...grid.querySelectorAll('.overview-card')].map(c => ({
    id: c.dataset.cardId,
    span: parseInt(c.dataset.span) || 1,
  }));
  localStorage.setItem('student-overview-layout', JSON.stringify(layout));
}

function toggleCardSpan(cardId) {
  const card = document.querySelector(`[data-card-id="${cardId}"]`);
  if (!card) return;
  const current = parseInt(card.dataset.span) || 1;
  const next = current === 1 ? 2 : 1;
  card.dataset.span = next;
  card.style.gridColumn = `span ${next}`;
  saveOverviewLayout();
}

function renderTaskList(tasks, studentId, canEdit) {
  if (tasks.length === 0) return emptyStateSm('暂无任务，点击"生成模板"快速创建时间线。','calendar-check');
  const groups = {};
  tasks.forEach(t => {
    const g = t.category || '其他';
    if (!groups[g]) groups[g] = [];
    groups[g].push(t);
  });
  return Object.entries(groups).map(([cat, items]) => `
    <div class="mb-3">
      <div class="fw-semibold text-muted small mb-2">${cat.toUpperCase()}</div>
      ${items.map(t => {
        const overdue = isOverdue(t.due_date, t.status);
        return `<div class="task-item d-flex align-items-start gap-3 p-3 border rounded mb-2${overdue?' task-overdue':''}">
          <div class="pt-1">
            ${t.status === 'done'
              ? `<i class="bi bi-check-circle-fill text-success fs-5"></i>`
              : `<button class="btn btn-link p-0" onclick="toggleTaskDone('${t.id}','${studentId}','${t.status}')"><i class="bi bi-circle text-muted fs-5"></i></button>`}
          </div>
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between">
              <span class="${t.status==='done'?'text-decoration-line-through text-muted':'fw-semibold'} cursor-pointer" onclick="navigate('task-detail',{taskId:'${t.id}'})" style="cursor:pointer">${priorityIcon(t.priority)}${escapeHtml(t.title)}</span>
              <div class="d-flex gap-1">
                ${statusBadge(t.status)}
                <button class="btn btn-link btn-sm p-0 text-info" onclick="navigate('task-detail',{taskId:'${t.id}'})" title="查看详情"><i class="bi bi-box-arrow-up-right"></i></button>
                ${canEdit ? `
                  <button class="btn btn-link btn-sm p-0 text-secondary" onclick="openTaskModal('${studentId}','${t.id}')"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-link btn-sm p-0 text-danger" onclick="deleteTask('${t.id}','${studentId}')"><i class="bi bi-trash"></i></button>
                ` : ''}
              </div>
            </div>
            ${t.description ? `<div class="small text-muted">${escapeHtml(t.description)}</div>` : ''}
            <div class="small ${overdue?'text-danger fw-bold':'text-muted'}">
              <i class="bi bi-calendar2 me-1"></i>${fmtDate(t.due_date)}
              ${t.due_time ? `<span class="ms-1 text-secondary">${escapeHtml(t.due_time)}</span>` : ''}
              ${t.due_timezone ? `<span class="badge bg-light text-dark border ms-1" title="截止时区">${escapeHtml(t.due_timezone)}</span>` : ''}
              ${overdue ? '<span class="ms-2 badge bg-danger">已逾期</span>' : ''}
              ${t.completed_at ? `<span class="ms-2 text-success"><i class="bi bi-check me-1"></i>完成于 ${fmtDate(t.completed_at)}</span>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`).join('');
}

// ════════════════════════════════════════════════════════
//  任务详情页
// ════════════════════════════════════════════════════════
async function renderTaskDetail({ taskId } = {}) {
  const tid = taskId || State.currentTaskId;
  if (!tid) { navigate('dashboard'); return; }
  State.currentTaskId = tid;

  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;

  try {
    const { task, student, intakeCase, application, assignee } = await GET(`/api/tasks/${tid}`);
    const canEdit = hasRole('principal','counselor','mentor','intake_staff');
    const overdue = isOverdue(task.due_date, task.status);
    const backPage = State.previousPage || (task.intake_case_id ? 'intake-cases' : 'students');

    mc.innerHTML = `
    <div class="page-header">
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-outline-secondary btn-sm" onclick="navigate('${backPage}')"><i class="bi bi-arrow-left"></i></button>
        <h4 class="mb-0"><i class="bi bi-check2-square me-2 text-primary"></i>任务详情</h4>
        ${statusBadge(task.status)}
        ${overdue ? '<span class="badge bg-danger">已逾期</span>' : ''}
      </div>
      ${canEdit ? `<div class="d-flex gap-2">
        <button class="btn btn-outline-secondary btn-sm" onclick="openTaskModal('${task.student_id}','${task.id}')"><i class="bi bi-pencil me-1"></i>编辑</button>
        ${task.status !== 'done' ? `<button class="btn btn-success btn-sm" onclick="markTaskDoneAndRefresh('${task.id}','${task.student_id}')"><i class="bi bi-check2 me-1"></i>标记完成</button>` : ''}
      </div>` : ''}
    </div>

    <div class="row g-3">
      <!-- 任务主信息 -->
      <div class="col-md-8">
        <div class="card">
          <div class="card-header fw-semibold"><i class="bi bi-card-text me-1 text-primary"></i>任务信息</div>
          <div class="card-body">
            <h5 class="mb-3">${priorityIcon(task.priority)}${escapeHtml(task.title)}</h5>
            ${task.description ? `<div class="alert alert-light mb-3">${escapeHtml(task.description)}</div>` : ''}
            <table class="table table-sm table-borderless">
              <tr><th class="text-muted" width="25%">分类</th><td><span class="badge bg-light text-dark border">${escapeHtml(task.category||'—')}</span></td></tr>
              <tr><th class="text-muted">优先级</th><td>${priorityIcon(task.priority)} ${escapeHtml(task.priority||'normal')}</td></tr>
              <tr><th class="text-muted">状态</th><td>${statusBadge(task.status)}</td></tr>
              <tr><th class="text-muted">截止日期</th><td class="${overdue?'text-danger fw-bold':''}"><i class="bi bi-calendar2 me-1"></i>${fmtDate(task.due_date)||'—'}${task.due_time ? ' ' + escapeHtml(task.due_time) : ''}${task.due_timezone ? ` <span class="badge bg-light text-dark border">${escapeHtml(task.due_timezone)}</span>` : ''}${overdue ? ' <span class="badge bg-danger">已逾期</span>' : ''}</td></tr>
              ${task.completed_at ? `<tr><th class="text-muted">完成时间</th><td class="text-success"><i class="bi bi-check me-1"></i>${fmtDatetime(task.completed_at)}</td></tr>` : ''}
              <tr><th class="text-muted">负责人</th><td>${assignee ? escapeHtml(assignee.name) + ' <span class="text-muted small">(' + escapeHtml(assignee.role) + ')</span>' : '<span class="text-muted">未分配</span>'}</td></tr>
              <tr><th class="text-muted">创建时间</th><td class="text-muted small">${fmtDatetime(task.created_at)}</td></tr>
              <tr><th class="text-muted">更新时间</th><td class="text-muted small">${fmtDatetime(task.updated_at)}</td></tr>
            </table>
          </div>
        </div>
      </div>

      <!-- 关联信息 -->
      <div class="col-md-4">
        <!-- 关联学生（intake_staff 不显示升学模块跳转） -->
        ${student ? `
        <div class="card mb-3">
          <div class="card-header fw-semibold d-flex justify-content-between align-items-center">
            <span><i class="bi bi-person-fill me-1 text-primary"></i>关联学生</span>
            ${!hasRole('intake_staff') ? `<button class="btn btn-link btn-sm p-0" onclick="navigate('student-detail',{studentId:'${student.id}'})"><i class="bi bi-arrow-right"></i></button>` : ''}
          </div>
          <div class="card-body">
            <div class="fw-semibold">${escapeHtml(student.name)}</div>
            <div class="small text-muted">${escapeHtml(student.grade_level)} · ${escapeHtml(student.exam_board||'—')}</div>
            ${!hasRole('intake_staff') ? `
            <button class="btn btn-outline-primary btn-sm w-100 mt-2" onclick="navigate('student-detail',{studentId:'${student.id}',activeTab:'tab-timeline'})">
              <i class="bi bi-list-task me-1"></i>查看学生任务列表
            </button>` : ''}
          </div>
        </div>` : ''}

        <!-- 关联入学案例 -->
        ${intakeCase ? `
        <div class="card mb-3">
          <div class="card-header fw-semibold d-flex justify-content-between align-items-center">
            <span><i class="bi bi-file-earmark-text me-1 text-warning"></i>关联入学案例</span>
            <button class="btn btn-link btn-sm p-0" onclick="navigate('intake-case-detail',{caseId:'${intakeCase.id}'})"><i class="bi bi-arrow-right"></i></button>
          </div>
          <div class="card-body">
            <div class="fw-semibold">${escapeHtml(intakeCase.program_name||'—')}</div>
            <div class="small text-muted">${escapeHtml(intakeCase.intake_year||'')} · ${statusBadge(intakeCase.status)}</div>
            <button class="btn btn-outline-warning btn-sm w-100 mt-2" onclick="navigate('intake-case-detail',{caseId:'${intakeCase.id}'})">
              <i class="bi bi-arrow-right me-1"></i>查看入学案例
            </button>
          </div>
        </div>` : ''}

        <!-- 关联申请 -->
        ${application ? `
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-building me-1 text-danger"></i>关联申请</div>
          <div class="card-body">
            <div class="fw-semibold">${escapeHtml(application.uni_name)}</div>
            <div class="small text-muted">${escapeHtml(application.department||'—')}</div>
            <div class="mt-1">${statusBadge(application.status)}</div>
          </div>
        </div>` : ''}

        ${!student && !intakeCase && !application ? `
        <div class="card">
          <div class="card-body text-muted small text-center py-3">暂无关联实体</div>
        </div>` : ''}
      </div>
    </div>

    <!-- 文件附件区 -->
    <div class="card mt-3" id="task-files-card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span class="fw-semibold"><i class="bi bi-paperclip me-1 text-secondary"></i>文件附件</span>
        ${canEdit ? `<button class="btn btn-sm btn-outline-primary" onclick="_taskFileUploadToggle()">
          <i class="bi bi-upload me-1"></i>上传文件
        </button>` : ''}
      </div>
      <!-- 上传表单（默认隐藏） -->
      <div id="task-upload-form" class="d-none border-bottom px-3 py-2 bg-light">
        <div class="row g-2 align-items-end">
          <div class="col-md-3">
            <label class="form-label mb-1 small fw-semibold">文档类型</label>
            <input class="form-control form-control-sm" id="tuf-type" placeholder="如：护照、成绩单、合同…" />
          </div>
          <div class="col-md-3">
            <label class="form-label mb-1 small fw-semibold">文件名称</label>
            <input class="form-control form-control-sm" id="tuf-title" placeholder="可选描述" />
          </div>
          <div class="col-md-4">
            <label class="form-label mb-1 small fw-semibold">选择文件</label>
            <input type="file" class="form-control form-control-sm" id="tuf-file" />
          </div>
          <div class="col-md-2 d-flex gap-1">
            <button class="btn btn-primary btn-sm w-100" onclick="_taskFileUpload('${task.student_id}','${task.intake_case_id||''}','${task.application_id||''}')">
              <i class="bi bi-upload me-1"></i>上传
            </button>
            <button class="btn btn-outline-secondary btn-sm" onclick="_taskFileUploadToggle()">✕</button>
          </div>
        </div>
        <div id="tuf-progress" class="mt-2 d-none">
          <div class="progress" style="height:6px"><div class="progress-bar progress-bar-striped progress-bar-animated w-100"></div></div>
        </div>
      </div>
      <!-- 文件列表 -->
      <div class="card-body p-0" id="task-files-list">
        <div class="text-center text-muted small py-3"><div class="spinner-border spinner-border-sm me-1"></div>加载中…</div>
      </div>
    </div>`;

    // 加载该任务关联的文件
    _loadTaskFiles(task.student_id, task.intake_case_id||null, task.application_id||null);

  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// 展开/收起上传表单
function _taskFileUploadToggle() {
  const form = document.getElementById('task-upload-form');
  if (form) form.classList.toggle('d-none');
}

// 加载任务相关文件列表
async function _loadTaskFiles(studentId, intakeCaseId, applicationId) {
  const el = document.getElementById('task-files-list');
  if (!el) return;
  try {
    let filtered;
    if (intakeCaseId) {
      // intake 任务：直接从入学案例的文件接口获取，不依赖 student_id
      filtered = await GET(`/api/intake-cases/${intakeCaseId}/docs`);
    } else if (studentId) {
      const all = await GET(`/api/students/${studentId}/materials`);
      filtered = applicationId ? all.filter(m => m.application_id === applicationId) : all;
    } else {
      filtered = [];
    }



    if (filtered.length === 0) {
      el.innerHTML = '<p class="text-muted small text-center py-3 mb-0">暂无附件，点击右上角上传文件</p>';
      return;
    }

    const statusColors = { '未开始':'secondary','进行中':'primary','已完成':'success','已提交':'info','已审核':'warning' };
    el.innerHTML = `<table class="table table-sm table-hover mb-0">
      <thead class="table-light"><tr>
        <th class="ps-3">文件名</th><th>类型</th><th>状态</th><th>版本</th><th>操作</th>
      </tr></thead>
      <tbody>
        ${filtered.map(m => `<tr>
          <td class="ps-3 fw-semibold">${escapeHtml(m.title || m.material_type)}</td>
          <td><span class="badge bg-light text-dark border">${escapeHtml(m.material_type)}</span></td>
          <td><span class="badge bg-${statusColors[m.status]||'secondary'}">${escapeHtml(m.status)}</span></td>
          <td class="text-muted small">v${m.version||1}</td>
          <td>
            ${m.file_path
              ? `<a class="btn btn-xs btn-outline-primary btn-sm py-0 px-1" href="/api/files/${encodeURIComponent(m.file_path)}" target="_blank" title="下载"><i class="bi bi-download"></i></a>`
              : '<span class="text-muted small">未上传</span>'}
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  } catch(e) {
    el.innerHTML = `<p class="text-danger small text-center py-2 mb-0">加载失败: ${escapeHtml(e.message)}</p>`;
  }
}

// 上传文件到任务
async function _taskFileUpload(studentId, intakeCaseId, applicationId) {
  const typeEl  = document.getElementById('tuf-type');
  const titleEl = document.getElementById('tuf-title');
  const fileEl  = document.getElementById('tuf-file');
  const prog    = document.getElementById('tuf-progress');

  const material_type = typeEl?.value?.trim();
  if (!material_type) { showError('请填写文档类型（如：护照、成绩单）'); typeEl?.focus(); return; }
  const file = fileEl?.files?.[0];
  if (!file) { showError('请选择要上传的文件'); return; }

  prog?.classList.remove('d-none');
  try {
    // 1. 创建 material 记录
    const body = {
      material_type,
      title: titleEl?.value?.trim() || material_type,
      ...(intakeCaseId ? { intake_case_id: intakeCaseId } : {}),
      ...(applicationId ? { application_id: applicationId } : {}),
    };
    const created = await POST(`/api/students/${studentId}/materials`, body);

    // 2. 上传文件
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch(`/api/materials/${created.id}/upload`, { method: 'POST', body: fd });
    if (!resp.ok) { const err = await resp.json(); throw new Error(err.error || '上传失败'); }

    showSuccess('文件上传成功');
    // 清空表单
    typeEl.value = ''; titleEl.value = ''; fileEl.value = '';
    document.getElementById('task-upload-form')?.classList.add('d-none');
    // 刷新列表
    _loadTaskFiles(studentId, intakeCaseId || null, applicationId || null);
  } catch(e) {
    showError('上传失败：' + e.message);
  } finally {
    prog?.classList.add('d-none');
  }
}

async function markTaskDoneAndRefresh(taskId, studentId) {
  const res = await GET(`/api/tasks/${taskId}`);
  const t = res.task || res;
  await PUT(`/api/tasks/${taskId}`, {
    title: t.title,
    description: t.description||'',
    category: t.category||'其他',
    due_date: t.due_date||null,
    status: 'done',
    priority: t.priority||'normal',
    assigned_to: t.assigned_to||null,
  });
  showSuccess('任务已标记完成');
  // intake_staff / student_admin 只回入学模块，不跳升学模块
  if (State.user.role === 'intake_staff' || State.user.role === 'student_admin') {
    if (t.intake_case_id) navigate('intake-case-detail', { caseId: t.intake_case_id });
    else navigate('intake-cases');
  } else {
    navigate('student-detail', { studentId: studentId || t.student_id, activeTab: 'tab-timeline' });
  }
}

function renderApplicationList(applications, studentId, canEdit) {
  if (applications.length === 0) return emptyStateSm('暂无申请记录','file-earmark-text');
  return `<div class="row g-3">
    ${applications.map(a => `
    <div class="col-md-6">
      <div class="card border-${a.tier==='冲刺'?'danger':a.tier==='意向'?'primary':'success'}">
        <div class="card-body">
          <div class="d-flex justify-content-between mb-2">
            <h6 class="fw-bold mb-0">${escapeHtml(a.uni_name)}</h6>
            ${tierBadge(a.tier)}
          </div>
          <div class="small text-muted mb-2">${escapeHtml(a.department||'—')} · ${escapeHtml(a.route||'—')} · ${escapeHtml(String(a.cycle_year||'—'))}年入学</div>
          <div class="d-flex gap-2 flex-wrap mb-2">
            ${statusBadge(a.status)}
            ${a.offer_type ? statusBadge(a.offer_type) : ''}
          </div>
          <div class="small">
            <span class="text-muted">截止日: </span><span class="${isOverdue(a.submit_deadline, a.status)?'text-danger fw-bold':''}">${fmtDate(a.submit_deadline)}</span>
            ${a.submit_date ? ` <span class="text-muted ms-2">提交: ${fmtDate(a.submit_date)}</span>` : ''}
          </div>
          ${a.conditions ? `<div class="small text-muted mt-1">条件: ${escapeHtml(a.conditions)}</div>` : ''}
          ${canEdit ? `
          <div class="mt-2 d-flex gap-1">
            <button class="btn btn-sm btn-outline-secondary" onclick="openApplicationModal('${studentId}','${a.id}')"><i class="bi bi-pencil"></i> 编辑</button>
            ${hasRole('principal','counselor') ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteApplication('${a.id}','${studentId}','${escapeHtml(a.uni_name)}')"><i class="bi bi-trash"></i></button>` : ''}
          </div>` : ''}
        </div>
      </div>
    </div>`).join('')}
  </div>`;
}

function renderMaterialList(materials, canEdit) {
  if (materials.length === 0) return emptyStateSm('暂无材料记录','folder');
  return `<div class="table-responsive">
    <table class="table table-hover">
      <thead class="table-light"><tr><th>类型</th><th>标题</th><th>状态</th><th>版本</th><th>备注</th><th>最后更新</th>${canEdit?'<th>操作</th>':''}</tr></thead>
      <tbody>
        ${materials.map(m => `<tr>
          <td><span class="badge bg-light text-dark border">${escapeHtml(m.material_type)}</span></td>
          <td>${escapeHtml(m.title||'—')}</td>
          <td>${statusBadge(m.status)}</td>
          <td>v${escapeHtml(String(m.version))}</td>
          <td class="small text-muted">${escapeHtml(m.notes||'—')}</td>
          <td class="small text-muted">${fmtDate(m.updated_at)}</td>
          ${canEdit ? `<td>
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-outline-secondary" data-mid="${escapeHtml(m.id)}" data-mtype="${escapeHtml(m.material_type)}" data-mtitle="${escapeHtml(m.title||'')}" data-mstatus="${escapeHtml(m.status)}" data-mnotes="${escapeHtml(m.notes||'')}" data-mver="${escapeHtml(String(m.version))}" onclick="openMaterialEditModal(this.dataset.mid,this.dataset.mtype,this.dataset.mtitle,this.dataset.mstatus,this.dataset.mnotes,this.dataset.mver)">
                <i class="bi bi-pencil"></i>
              </button>
              ${m.file_path ? `<a class="btn btn-sm btn-outline-primary" href="/api/files/${encodeURIComponent(m.file_path)}" target="_blank" title="下载文件"><i class="bi bi-download"></i></a>` : ''}
            </div>
          </td>` : `<td>${m.file_path ? `<a class="btn btn-sm btn-outline-primary" href="/api/files/${encodeURIComponent(m.file_path)}" target="_blank"><i class="bi bi-download"></i></a>` : ''}</td>`}
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderPSList(psList, studentId) {
  if (psList.length === 0) return `
    <div class="text-center py-4">
      <i class="bi bi-file-earmark-text display-4 text-muted"></i>
      <p class="text-muted mt-2">还没有个人陈述记录。点击"新建"开始。</p>
    </div>`;
  const qs = getPSQuestions();
  return psList.map(ps => {
    // Prefer content_json answers, fall back to q1/q2/q3
    let answers = [];
    try { if (ps.content_json) answers = JSON.parse(ps.content_json); } catch(e) {}
    if (!answers.length) answers = [ps.q1_content, ps.q2_content, ps.q3_content].filter(a => a);
    return `
    <div class="card mb-3 ${ps.status==='定稿'||ps.status==='已提交'?'border-success':''}">
      <div class="card-header d-flex justify-content-between">
        <span class="fw-semibold">版本 v${ps.version} <small class="text-muted ms-2">${fmtDate(ps.created_at)}</small></span>
        <div class="d-flex gap-2 align-items-center">
          ${statusBadge(ps.status)}
          <small class="text-muted">${ps.char_count||0} 字符</small>
          <button class="btn btn-sm btn-outline-secondary" onclick="openPSEditModal('${studentId}','${ps.id}')">
            <i class="bi bi-pencil"></i>
          </button>
        </div>
      </div>
      <div class="card-body">
        ${answers.map((a, i) => a ? `
          <div class="mb-3">
            <div class="small fw-semibold text-primary mb-1">${escapeHtml(qs[i]?.label || `第${i+1}问`)}</div>
            <p class="small">${escapeHtml(a.substring(0,200))}${a.length>200?'…':''}</p>
          </div>` : '').join('')}
        ${ps.review_notes ? `<div class="alert alert-warning small py-2 mb-0"><i class="bi bi-chat-square-text me-1"></i>审阅意见: ${escapeHtml(ps.review_notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderCommList(comms) {
  if (comms.length === 0) return emptyStateSm('暂无沟通记录','chat-dots');
  return comms.map(c => `
    <div class="card mb-2">
      <div class="card-body py-2">
        <div class="d-flex justify-content-between mb-1">
          <div class="d-flex gap-2 align-items-center">
            <span class="badge bg-secondary">${escapeHtml(c.channel)}</span>
            ${c.staff_name ? `<span class="small text-muted">${escapeHtml(c.staff_name)}</span>` : ''}
            ${c.parent_name ? `<span class="small text-muted">← ${escapeHtml(c.parent_name)}</span>` : ''}
          </div>
          <small class="text-muted">${fmtDatetime(c.comm_date)}</small>
        </div>
        <p class="small mb-1">${escapeHtml(c.summary)}</p>
        ${c.action_items ? `<div class="small text-primary"><i class="bi bi-check2-square me-1"></i>待办: ${escapeHtml(c.action_items)}</div>` : ''}
      </div>
    </div>`).join('');
}

function renderFeedbackItems(feedback, canEdit) {
  if (feedback.length === 0) return emptyStateSm('暂无反馈记录','chat-right-text');
  return feedback.map(f => `
    <div class="card mb-2 ${f.status==='resolved'?'border-success':''}">
      <div class="card-body py-2">
        <div class="d-flex justify-content-between mb-1">
          <div class="d-flex gap-2">
            <span class="badge bg-secondary">${escapeHtml(f.feedback_type)}</span>
            <span class="badge bg-light text-dark">${escapeHtml(f.from_role)}</span>
            ${f.rating ? `<span>${'⭐'.repeat(parseInt(f.rating))}</span>` : ''}
          </div>
          <div class="d-flex gap-2">
            ${statusBadge(f.status)}
            <small class="text-muted">${fmtDatetime(f.created_at)}</small>
          </div>
        </div>
        <p class="small mb-1">${escapeHtml(f.content)}</p>
        ${f.response ? `<div class="alert alert-success small py-1 mb-0"><i class="bi bi-reply me-1"></i>${escapeHtml(f.response)}</div>` : ''}
        ${canEdit && f.status === 'pending' ? `
          <button class="btn btn-sm btn-outline-success mt-1" data-fbid="${escapeHtml(f.id)}" data-fbcontent="${escapeHtml(f.content)}" onclick="openFeedbackResponse(this.dataset.fbid, this.dataset.fbcontent)">
            <i class="bi bi-reply me-1"></i>回复
          </button>` : ''}
      </div>
    </div>`).join('');
}

// ════════════════════════════════════════════════════════
//  师资管理
// ════════════════════════════════════════════════════════
async function renderStaffList() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;
  try {
    const staff = await GET('/api/staff');
    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-people me-2"></i>师资管理</h4>
      ${hasRole('principal') ? `<button class="btn btn-success btn-sm" onclick="openStaffModal()"><i class="bi bi-plus-lg me-1"></i>新增教职工</button>` : ''}
    </div>
    <div class="row g-3">
      ${staff.map(s => {
        const pct = s.capacity_students > 0 ? Math.round(s.current_students/s.capacity_students*100) : 0;
        const cls = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success';
        let subjects = [];
        try { subjects = JSON.parse(s.subjects||'[]'); } catch(e) {}
        let boards = [];
        try { boards = JSON.parse(s.exam_board_exp||'[]'); } catch(e) {}
        return `
        <div class="col-md-4">
          <div class="card h-100">
            <div class="card-body">
              <div class="d-flex align-items-center gap-3 mb-3">
                <div class="avatar-lg">${escapeHtml(s.name.charAt(0))}</div>
                <div>
                  <div class="fw-bold">${escapeHtml(s.name)}</div>
                  <span class="badge bg-secondary">${escapeHtml(s.role)}</span>
                </div>
              </div>
              <div class="small mb-2">
                <i class="bi bi-envelope me-1 text-muted"></i>${escapeHtml(s.email||'—')}
              </div>
              <div class="small mb-2">
                <i class="bi bi-telephone me-1 text-muted"></i>${escapeHtml(s.phone||'—')}
              </div>
              ${subjects.length > 0 ? `<div class="small mb-2"><i class="bi bi-book me-1 text-muted"></i>${subjects.map(x=>escapeHtml(x)).join('、')}</div>` : ''}
              ${boards.length > 0 ? `<div class="small mb-2">${boards.map(b=>`<span class="badge bg-light text-dark border me-1">${escapeHtml(b)}</span>`).join('')}</div>` : ''}
              <div class="mt-2">
                <div class="d-flex justify-content-between small mb-1">
                  <span>学生负载</span>
                  <span class="text-${cls}">${s.current_students}/${s.capacity_students||'—'}</span>
                </div>
                ${s.capacity_students ? `<div class="progress" style="height:6px"><div class="progress-bar bg-${cls}" style="width:${pct}%"></div></div>` : ''}
              </div>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════
//  材料看板
// ════════════════════════════════════════════════════════
async function renderMaterialsBoard() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;
  try {
    const students = await GET('/api/students');
    // Fetch all students' materials concurrently
    const matArrays = await Promise.all(
      students.map(s => GET(`/api/students/${s.id}/materials`)
        .then(mats => mats.map(m => ({...m, student_name: s.name, student_id: s.id})))
        .catch(() => [])
      )
    );
    const allMaterials = matArrays.flat();

    const statuses = ['未开始','收集中','已上传','已审核','已提交','需补件'];
    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-folder2-open me-2"></i>材料状态看板</h4>
    </div>
    <div class="row g-3">
      ${statuses.map(st => {
        const items = allMaterials.filter(m => m.status === st);
        const colors = {'未开始':'secondary','收集中':'warning','已上传':'info','已审核':'primary','已提交':'success','需补件':'danger'};
        return `
        <div class="col-md-4 col-lg-2">
          <div class="card">
            <div class="card-header text-center fw-semibold bg-${colors[st]} bg-opacity-10">
              ${st} <span class="badge bg-${colors[st]}">${items.length}</span>
            </div>
            <div class="card-body p-2" style="min-height:120px;max-height:400px;overflow-y:auto">
              ${items.map(m => `
                <div class="kanban-card mb-2 p-2 border rounded" onclick="navigate('student-detail',{studentId:'${escapeHtml(m.student_id)}'})">
                  <div class="small fw-semibold">${escapeHtml(m.student_name)}</div>
                  <div class="small text-muted">${escapeHtml(m.material_type)}</div>
                  <div class="small text-muted">${escapeHtml(m.title||'')}</div>
                </div>`).join('')}
              ${items.length === 0 ? '<p class="text-center text-muted small py-2">—</p>' : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════
//  反馈管理
// ════════════════════════════════════════════════════════
async function renderFeedbackList() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;
  try {
    const feedback = await GET('/api/feedback');
    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-chat-dots me-2"></i>反馈管理</h4>
    </div>
    <div class="card">
      <div class="card-body p-0">
        ${feedback.length === 0 ? '<p class="text-center text-muted py-4">暂无待处理反馈</p>' :
        feedback.map(f => `
        <div class="border-bottom p-3 d-flex gap-3">
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between mb-1">
              <span class="fw-semibold">${escapeHtml(f.student_name)}</span>
              <div class="d-flex gap-2">
                <span class="badge bg-secondary">${escapeHtml(f.feedback_type)}</span>
                <span class="badge bg-light text-dark">${escapeHtml(f.from_role)}</span>
                ${f.rating ? `<span>${'⭐'.repeat(parseInt(f.rating))}</span>` : ''}
                <small class="text-muted">${fmtDatetime(f.created_at)}</small>
              </div>
            </div>
            <p class="small mb-2">${escapeHtml(f.content)}</p>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-success" data-fbid="${escapeHtml(f.id)}" data-fbcontent="${escapeHtml(f.content)}" onclick="openFeedbackResponse(this.dataset.fbid, this.dataset.fbcontent)">
                <i class="bi bi-reply me-1"></i>回复并标记解决
              </button>
              <button class="btn btn-sm btn-outline-primary" onclick="navigate('student-detail',{studentId:'${f.student_id}'})">
                查看学生
              </button>
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════
//  模态框 Open 函数
// ════════════════════════════════════════════════════════

async function openStudentModal(id = null) {
  if (id) {
    try {
      const d = await GET(`/api/students/${id}`);
      const s = d.student;
      document.getElementById('s-id').value = s.id;
      document.getElementById('s-name').value = s.name;
      document.getElementById('s-grade').value = s.grade_level;
      document.getElementById('s-board').value = s.exam_board || '';
      document.getElementById('s-enrol').value = s.enrol_date || '';
      document.getElementById('s-dob').value = s.date_of_birth || '';
      document.getElementById('s-notes').value = s.notes || '';
      document.getElementById('student-modal-title').textContent = '编辑学生信息';
    } catch(e) { showError(e.message); return; }
  } else {
    document.getElementById('s-id').value = '';
    document.getElementById('s-name').value = '';
    document.getElementById('s-grade').value = 'G12';
    document.getElementById('s-board').value = 'Edexcel';
    document.getElementById('s-enrol').value = '';
    document.getElementById('s-dob').value = '';
    document.getElementById('s-notes').value = '';
    document.getElementById('student-modal-title').textContent = '新增学生';
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('student-modal')).show();
}

function openStaffModal() {
  document.getElementById('st-id').value = '';
  document.getElementById('st-name').value = '';
  document.getElementById('st-email').value = '';
  document.getElementById('st-phone').value = '';
  document.getElementById('st-subjects').value = '';
  document.getElementById('st-capacity').value = '20';
  ['eb-edexcel','eb-cie','eb-alevel'].forEach(id => document.getElementById(id).checked = false);
  bootstrap.Modal.getOrCreateInstance(document.getElementById('staff-modal')).show();
}

async function openTaskModal(studentId, taskId = null) {
  document.getElementById('task-student-id').value = studentId;
  document.getElementById('task-id').value = taskId || '';
  // Populate task categories dynamically
  const catSelect = document.getElementById('task-category');
  catSelect.innerHTML = getTaskCategories().map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  if (taskId) {
    try {
      const res = await GET(`/api/tasks/${taskId}`);
      const task = res.task || res; // 兼容新格式 {task,...} 和旧格式
      document.getElementById('task-title').value = task.title || '';
      document.getElementById('task-desc').value = task.description || '';
      document.getElementById('task-category').value = task.category || '其他';
      document.getElementById('task-due').value = task.due_date || '';
      document.getElementById('task-priority').value = task.priority || 'normal';
      document.getElementById('task-status').value = task.status || 'pending';
    } catch(e) {
      showError('加载任务详情失败：' + e.message);
      return;
    }
  } else {
    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-category').value = '其他';
    document.getElementById('task-due').value = '';
    document.getElementById('task-priority').value = 'normal';
    document.getElementById('task-status').value = 'pending';
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('task-modal')).show();
}

function openMaterialModal(studentId) {
  document.getElementById('mat-id').value = '';
  document.getElementById('mat-student-id').value = studentId;
  document.getElementById('mat-title').value = '';
  document.getElementById('mat-notes').value = '';
  document.getElementById('mat-status').value = '未开始';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('material-modal')).show();
}

function openMaterialEditModal(id, type, title, status, notes, _version) {
  document.getElementById('mat-id').value = id;
  document.getElementById('mat-type').value = type;
  document.getElementById('mat-title').value = title;
  document.getElementById('mat-status').value = status;
  document.getElementById('mat-notes').value = notes;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('material-modal')).show();
}

function openTargetModal(studentId) {
  document.getElementById('tgt-student-id').value = studentId;
  document.getElementById('tgt-id').value = '';
  document.getElementById('tgt-name').value = '';
  document.getElementById('tgt-dept').value = '';
  document.getElementById('tgt-tier').value = '意向';
  document.getElementById('tgt-rank').value = '1';
  document.getElementById('tgt-rationale').value = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('target-modal')).show();
}

async function openApplicationModal(studentId, appId = null) {
  document.getElementById('app-student-id').value = studentId;
  if (appId) {
    document.getElementById('app-id').value = appId;
    try {
      const d = await GET(`/api/applications/${appId}`);
      const a = d.application;
      document.getElementById('app-uni').value = a.uni_name || '';
      document.getElementById('app-dept').value = a.department || '';
      document.getElementById('app-tier').value = a.tier || '意向';
      document.getElementById('app-route').value = a.route || 'UK-UG';
      document.getElementById('app-year').value = a.cycle_year || 2026;
      document.getElementById('app-deadline').value = a.submit_deadline || '';
      document.getElementById('app-submit-date').value = a.submit_date || '';
      document.getElementById('app-offer-type').value = a.offer_type || 'Pending';
      document.getElementById('app-status').value = a.status || 'pending';
      document.getElementById('app-notes').value = a.notes || '';
      document.getElementById('app-modal-title').textContent = '编辑申请';
      // Load ext fields after showing
      setTimeout(() => loadAppExtFields(appId, document.getElementById('app-route').value), 100);
    } catch(e) { showError(e.message); return; }
  } else {
    document.getElementById('app-id').value = '';
    document.getElementById('app-uni').value = '';
    document.getElementById('app-dept').value = '';
    document.getElementById('app-tier').value = '意向';
    document.getElementById('app-route').value = 'UK-UG';
    document.getElementById('app-year').value = '2026';
    document.getElementById('app-deadline').value = '';
    document.getElementById('app-submit-date').value = '';
    document.getElementById('app-offer-type').value = 'Pending';
    document.getElementById('app-status').value = 'pending';
    document.getElementById('app-notes').value = '';
    document.getElementById('app-modal-title').textContent = '添加申请';
    // Show ext fields for default route (UK-UG) even for new application
    setTimeout(() => loadAppExtFields(null, document.getElementById('app-route').value), 100);
  }
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('application-modal'));
  modal.show();
  // wire route change to reload ext fields
  document.getElementById('app-route').onchange = () => {
    const id = document.getElementById('app-id').value;
    loadAppExtFields(id || null, document.getElementById('app-route').value);
  };
}

async function openTimelineModal(studentId) {
  document.getElementById('tl-student-id').value = studentId;
  document.getElementById('tl-deadline').value = '';
  document.getElementById('tl-template-preview').classList.add('d-none');

  const sel = document.getElementById('tl-template-id');
  sel.innerHTML = '<option value="">— 加载中 —</option>';

  try {
    const templates = await GET('/api/templates');
    const routeIcons = { 'UK-UG':'🇬🇧','US':'🇺🇸','CA':'🇨🇦','AU':'🇦🇺','SG':'🇸🇬','通用':'🌐' };
    const tierLabels = { '冲刺':'冲刺', '意向':'意向', '保底':'保底', '通用':'通用' };
    // Group by route
    const groups = {};
    templates.forEach(t => { (groups[t.route] = groups[t.route] || []).push(t); });
    sel.innerHTML = '<option value="">— 请选择模板 —</option>' +
      Object.entries(groups).map(([route, tpls]) =>
        `<optgroup label="${routeIcons[route]||'📋'} ${route}">` +
        tpls.map(t =>
          `<option value="${escapeHtml(t.id)}" data-desc="${escapeHtml(t.description||'')}" data-count="${t.item_count}">` +
          `${escapeHtml(tierLabels[t.tier]||t.tier)} · ${escapeHtml(t.name)} (${t.item_count}项)` +
          `</option>`
        ).join('') + '</optgroup>'
      ).join('');
    // Show preview on change
    sel.onchange = () => {
      const opt = sel.selectedOptions[0];
      const desc = opt?.dataset?.desc;
      const count = opt?.dataset?.count;
      const preview = document.getElementById('tl-template-preview');
      const text = document.getElementById('tl-preview-text');
      if (desc || count) {
        text.textContent = `${desc || ''}  共 ${count} 项任务`;
        preview.classList.remove('d-none');
      } else {
        preview.classList.add('d-none');
      }
    };
  } catch(e) {
    sel.innerHTML = '<option value="">加载失败，请重试</option>';
  }

  bootstrap.Modal.getOrCreateInstance(document.getElementById('timeline-modal')).show();
}

function openCommModal(studentId) {
  document.getElementById('comm-student-id').value = studentId;
  document.getElementById('comm-summary').value = '';
  document.getElementById('comm-actions').value = '';
  document.getElementById('comm-date').value = new Date().toISOString().slice(0,16);
  bootstrap.Modal.getOrCreateInstance(document.getElementById('comm-modal')).show();
}

function openFeedbackModal(studentId) {
  document.getElementById('fb-student-id').value = studentId;
  document.getElementById('fb-content').value = '';
  document.getElementById('fb-rating').value = '';
  document.getElementById('fb-type').value = '阶段反馈';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('feedback-modal')).show();
}

async function openAssignAgentModal(studentId, currentAgentId, caseId) {
  // 加载代理列表
  let agents = [];
  try { agents = await GET('/api/agents'); } catch(e) {}

  const sel = `<select class="form-select" id="assign-agent-select">
    <option value="">— 无代理 / 直接招生 —</option>
    ${agents.map(a => `<option value="${escapeHtml(a.id)}" ${a.id === currentAgentId ? 'selected' : ''}>${escapeHtml(a.name)} (${escapeHtml(a.type||'')})</option>`).join('')}
  </select>`;

  // 动态创建小弹窗
  let modal = document.getElementById('assign-agent-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'assign-agent-modal';
    modal.className = 'modal fade';
    modal.innerHTML = `<div class="modal-dialog modal-sm">
      <div class="modal-content">
        <div class="modal-header py-2"><h6 class="modal-title mb-0"><i class="bi bi-person-badge me-1 text-info"></i>关联来源代理</h6><button class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body" id="assign-agent-body"></div>
        <div class="modal-footer py-2">
          <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">取消</button>
          <button class="btn btn-info btn-sm" id="assign-agent-save">保存</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('assign-agent-body').innerHTML = sel;
  // 保存后刷新当前页（入学案例详情 or 学生档案）
  const callerPage = State.currentPage;
  document.getElementById('assign-agent-save').onclick = async () => {
    const agentId = document.getElementById('assign-agent-select').value || null;
    try {
      await PUT(`/api/students/${studentId}`, { agent_id: agentId, _partial: true });
      bootstrap.Modal.getInstance(modal).hide();
      showSuccess('代理关联已更新');
      // 刷新当前页
      if (callerPage === 'intake-case-detail' || caseId) {
        if (caseId) State.currentCaseId = caseId;
        renderIntakeCaseDetail();
      } else {
        navigate('student-detail', { studentId });
      }
    } catch(e) { showError(e.message); }
  };
  bootstrap.Modal.getOrCreateInstance(modal).show();
}

async function openAssignMentorModal(studentId) {
  document.getElementById('am-student-id').value = studentId;
  document.getElementById('am-date').value = new Date().toISOString().split('T')[0];
  // 加载教职工列表
  try {
    const staff = State.staffList.length > 0 ? State.staffList : await GET('/api/staff');
    if (State.staffList.length === 0) State.staffList = staff;
    const select = document.getElementById('am-staff');
    select.innerHTML = staff.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.role)}) — ${s.current_students}/${s.capacity_students||'?'}</option>`).join('');
  } catch(e) {}
  bootstrap.Modal.getOrCreateInstance(document.getElementById('assign-mentor-modal')).show();
}

function renderPSQuestionFields(questions, answers = []) {
  const container = document.getElementById('ps-questions-container');
  if (!container) return;
  const minQ = parseInt(State.settings.ps_min_chars_per_q) || 350;
  container.innerHTML = questions.map((q, i) => `
    <div class="col-12 mb-2">
      <label class="form-label fw-semibold">${q.label}</label>
      <textarea class="form-control ps-q-field" id="ps-q-${i}" data-qi="${i}" rows="5"
        placeholder="${(q.hint||'').replace(/"/g,'&quot;')}">${(answers[i]||'').replace(/</g,'&lt;')}</textarea>
      <div class="d-flex justify-content-between small mt-1">
        <span id="ps-q-warn-${i}" class="text-danger" style="display:none"><i class="bi bi-exclamation-triangle me-1"></i>每问至少 ${minQ} 字符</span>
        <span class="text-muted ms-auto"><span id="ps-q-count-${i}">0</span> / <span class="text-secondary">${minQ}</span>+ 字符</span>
      </div>
    </div>`).join('');
  // Attach input listeners
  container.querySelectorAll('.ps-q-field').forEach(el => {
    el.addEventListener('input', updatePSCount);
  });
  updatePSCount();
}

function openPSModal(studentId) {
  document.getElementById('ps-student-id').value = studentId;
  document.getElementById('ps-id').value = '';
  document.getElementById('ps-status').value = '草稿';
  document.getElementById('ps-review-notes').value = '';
  // Apply settings to modal header
  const s = State.settings;
  if (s.ps_modal_title) document.getElementById('ps-modal-title').textContent = s.ps_modal_title;
  if (s.ps_char_limit) document.getElementById('ps-char-limit-display').textContent = s.ps_char_limit;
  // Render dynamic questions
  renderPSQuestionFields(getPSQuestions(), []);
  bootstrap.Modal.getOrCreateInstance(document.getElementById('ps-modal')).show();
}

async function openPSEditModal(studentId, psId) {
  try {
    const psList = await GET(`/api/students/${studentId}/personal-statement`);
    const ps = psList.find(p => p.id === psId);
    if (!ps) return;
    document.getElementById('ps-student-id').value = studentId;
    document.getElementById('ps-id').value = psId;
    document.getElementById('ps-status').value = ps.status || '草稿';
    document.getElementById('ps-review-notes').value = ps.review_notes || '';
    // Apply settings to modal header
    const s = State.settings;
    if (s.ps_modal_title) document.getElementById('ps-modal-title').textContent = s.ps_modal_title;
    if (s.ps_char_limit) document.getElementById('ps-char-limit-display').textContent = s.ps_char_limit;
    // Load answers: prefer content_json, fall back to q1/q2/q3
    let answers = [];
    try { if (ps.content_json) answers = JSON.parse(ps.content_json); } catch(e2) {}
    if (!answers.length) answers = [ps.q1_content||'', ps.q2_content||'', ps.q3_content||''].filter(Boolean);
    renderPSQuestionFields(getPSQuestions(), answers);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('ps-modal')).show();
  } catch(e) { showError(e.message); }
}

function updatePSCount() {
  const minQ = parseInt(State.settings.ps_min_chars_per_q) || 350;
  const charLimit = parseInt(State.settings.ps_char_limit) || 4000;
  let total = 0;
  document.querySelectorAll('.ps-q-field').forEach((el, i) => {
    const len = el.value.length;
    total += len;
    const sp = document.getElementById(`ps-q-count-${i}`);
    if (sp) {
      sp.textContent = len;
      sp.className = len < minQ ? 'text-danger fw-bold' : 'text-success';
    }
    const warn = document.getElementById(`ps-q-warn-${i}`);
    if (warn) warn.style.display = len > 0 && len < minQ ? '' : 'none';
  });
  const totalEl = document.getElementById('ps-total-count');
  if (totalEl) {
    totalEl.textContent = total;
    totalEl.className = total > charLimit ? 'text-danger fw-bold' : 'text-primary';
  }
  const limitEl = document.getElementById('ps-char-limit-display');
  if (limitEl) limitEl.textContent = charLimit;
}

function onAssessTypeChange(type) {
  const types = getAssessmentTypes();
  const found = types.find(t => t.name === type);
  if (found) document.getElementById('asm-max').value = found.max;
  const hasSubs = found?.subs || false;
  document.getElementById('asm-subscore-section').classList.toggle('d-none', !hasSubs);
  if (hasSubs) document.getElementById('asm-subject').value = type;
}

function openAssessmentModal(studentId) {
  document.getElementById('asm-student-id').value = studentId;
  document.getElementById('asm-date').value = new Date().toISOString().split('T')[0];
  // Populate types dynamically from settings
  const types = getAssessmentTypes();
  const sel = document.getElementById('asm-type');
  sel.innerHTML = types.map(t => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join('');
  const first = types[0];
  document.getElementById('asm-max').value = first?.max ?? 100;
  document.getElementById('asm-subject').value = '';
  document.getElementById('asm-score').value = '';
  document.getElementById('asm-percentile').value = '';
  document.getElementById('asm-notes').value = '';
  document.getElementById('asm-subscore-section').classList.add('d-none');
  ['asm-ielts-l','asm-ielts-r','asm-ielts-w','asm-ielts-s'].forEach(id => {
    document.getElementById(id).value = '';
  });
  bootstrap.Modal.getOrCreateInstance(document.getElementById('assessment-modal')).show();
}

async function saveAssessment() {
  if (!acquireSubmit('saveAssessment')) return;
  const studentId = document.getElementById('asm-student-id').value;
  const score = parseFloat(document.getElementById('asm-score').value);
  if (isNaN(score)) { releaseSubmit('saveAssessment'); showError('请输入有效分数'); return; }
  const type = document.getElementById('asm-type').value;
  const isIELTS = type === '雅思 IELTS';

  // 组装备注（含雅思分项）
  let notes = document.getElementById('asm-notes').value;
  if (isIELTS) {
    const l = document.getElementById('asm-ielts-l').value;
    const r = document.getElementById('asm-ielts-r').value;
    const w = document.getElementById('asm-ielts-w').value;
    const s = document.getElementById('asm-ielts-s').value;
    if (l||r||w||s) notes = `L:${l||'-'} R:${r||'-'} W:${w||'-'} S:${s||'-'}${notes?' | '+notes:''}`;
  }

  const body = {
    assess_date: document.getElementById('asm-date').value,
    assess_type: type,
    subject: document.getElementById('asm-subject').value,
    score,
    max_score: parseFloat(document.getElementById('asm-max').value) || 100,
    percentile: parseFloat(document.getElementById('asm-percentile').value) || null,
    notes,
  };
  try {
    await POST(`/api/students/${studentId}/assessments`, body);
    showSuccess('评估记录已保存');
    bootstrap.Modal.getInstance(document.getElementById('assessment-modal')).hide();
    navigate('student-detail', { studentId });
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveAssessment'); }
}

function openParentModal(studentId) {
  document.getElementById('par-student-id').value = studentId;
  document.getElementById('par-name').value = '';
  document.getElementById('par-phone').value = '';
  document.getElementById('par-email').value = '';
  document.getElementById('par-wechat').value = '';
  document.getElementById('par-relation').value = '父';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('parent-modal')).show();
}

async function saveParent() {
  if (!acquireSubmit('saveParent')) return;
  const studentId = document.getElementById('par-student-id').value;
  const name = document.getElementById('par-name').value.trim();
  if (!name) { releaseSubmit('saveParent'); showError('请填写家长姓名'); return; }
  try {
    await POST(`/api/students/${studentId}/parents`, {
      name,
      relation: document.getElementById('par-relation').value,
      phone: document.getElementById('par-phone').value,
      email: document.getElementById('par-email').value,
      wechat: document.getElementById('par-wechat').value,
    });
    bootstrap.Modal.getInstance(document.getElementById('parent-modal')).hide();
    showSuccess('家长信息已保存');
    navigate('student-detail', { studentId });
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveParent'); }
}

async function openSubjectModal(studentId) {
  document.getElementById('subj-student-id').value = studentId;

  // Populate subject list — always use /api/subjects for UUID-based values
  const subjSel = document.getElementById('subj-code');
  try {
    if (!State.subjectList || State.subjectList.length === 0) {
      State.subjectList = await GET('/api/subjects');
    }
    subjSel.innerHTML = State.subjectList.map(s =>
      `<option value="${escapeHtml(s.id)}">${escapeHtml(s.code)} — ${escapeHtml(s.name)}</option>`
    ).join('');
    if (State.subjectList.length === 0) {
      subjSel.innerHTML = '<option value="">暂无科目，请先在系统设置中添加</option>';
    }
  } catch(e) { showError('科目列表加载失败'); return; }

  // Populate level and exam board from settings
  const levelSel = document.getElementById('subj-level');
  levelSel.innerHTML = getSubjectLevels().map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');

  const boardSel = document.getElementById('subj-board');
  boardSel.innerHTML = getExamBoards().map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');

  bootstrap.Modal.getOrCreateInstance(document.getElementById('subject-modal')).show();
}

async function saveSubject() {
  if (!acquireSubmit('saveSubject')) return;
  const studentId = document.getElementById('subj-student-id').value;
  const sel = document.getElementById('subj-code');
  const subjectId = sel.value;
  if (!subjectId) { releaseSubmit('saveSubject'); showError('请选择科目'); return; }
  try {
    await POST(`/api/students/${studentId}/subjects`, {
      subject_id: subjectId,
      level: document.getElementById('subj-level').value,
      exam_board: document.getElementById('subj-board').value,
    });
    bootstrap.Modal.getInstance(document.getElementById('subject-modal')).hide();
    showSuccess('选科记录已保存');
    navigate('student-detail', { studentId });
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveSubject'); }
}

function openFeedbackResponse(fbId, originalContent) {
  document.getElementById('fbr-id').value = fbId;
  document.getElementById('fbr-response').value = '';
  document.getElementById('fbr-status').value = 'resolved';
  document.getElementById('fbr-original').textContent = originalContent || '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('feedback-response-modal')).show();
}

async function saveFeedbackResponse() {
  if (!acquireSubmit('saveFeedbackResponse')) return;
  const fbId = document.getElementById('fbr-id').value;
  const response = document.getElementById('fbr-response').value.trim();
  if (!response) { releaseSubmit('saveFeedbackResponse'); showError('请填写回复内容'); return; }
  try {
    await PUT(`/api/feedback/${fbId}`, {
      status: document.getElementById('fbr-status').value,
      response,
    });
    bootstrap.Modal.getInstance(document.getElementById('feedback-response-modal')).hide();
    showSuccess('已回复并标记解决');
    navigate(State.currentPage);
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveFeedbackResponse'); }
}

// ════════════════════════════════════════════════════════
//  防重复提交工具：包裹异步保存函数，确保同一操作不会并发执行
//  用法：在保存函数开头调用 if (!acquireSubmit('key')) return;
//        在 finally 块中调用 releaseSubmit('key');
// ════════════════════════════════════════════════════════
const _submitLocks = new Set();
function acquireSubmit(key) {
  if (_submitLocks.has(key)) return false;
  _submitLocks.add(key);
  return true;
}
function releaseSubmit(key) { _submitLocks.delete(key); }

async function saveStudent() {
  if (!acquireSubmit('saveStudent')) return;
  const id = document.getElementById('s-id').value;
  const body = {
    name: document.getElementById('s-name').value,
    grade_level: document.getElementById('s-grade').value,
    exam_board: document.getElementById('s-board').value,
    enrol_date: document.getElementById('s-enrol').value,
    date_of_birth: document.getElementById('s-dob').value || null,
    notes: document.getElementById('s-notes').value,
  };
  try {
    if (id) {
      await PUT(`/api/students/${id}`, body);
      showSuccess('学生信息已更新');
    } else {
      await POST('/api/students', body);
      showSuccess('学生已新增');
    }
    bootstrap.Modal.getInstance(document.getElementById('student-modal')).hide();
    navigate(State.currentPage);
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveStudent'); }
}

async function saveStaff() {
  if (!acquireSubmit('saveStaff')) return;
  const boards = [];
  if (document.getElementById('eb-edexcel').checked) boards.push('Edexcel');
  if (document.getElementById('eb-cie').checked) boards.push('CIE');
  if (document.getElementById('eb-alevel').checked) boards.push('A-Level');
  const subjStr = document.getElementById('st-subjects').value;
  const subjects = subjStr ? subjStr.split(',').map(s=>s.trim()).filter(Boolean) : [];
  const body = {
    name: document.getElementById('st-name').value,
    role: document.getElementById('st-role').value,
    email: document.getElementById('st-email').value,
    phone: document.getElementById('st-phone').value,
    exam_board_exp: boards,
    subjects,
    capacity_students: parseInt(document.getElementById('st-capacity').value) || 20,
  };
  try {
    const res = await POST('/api/staff', body);
    bootstrap.Modal.getInstance(document.getElementById('staff-modal')).hide();
    State.staffList = [];
    navigate('staff');
    // Show credentials in a dedicated modal rather than a fleeting toast
    setTimeout(() => showStaffCredentials(res.username, res.default_password), 300);
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveStaff'); }
}

function showStaffCredentials(username, password) {
  const existingEl = document.getElementById('staff-cred-modal');
  if (existingEl) existingEl.remove();
  const div = document.createElement('div');
  div.id = 'staff-cred-modal';
  div.className = 'modal fade';
  div.setAttribute('tabindex', '-1');
  div.setAttribute('data-bs-backdrop', 'static');
  div.innerHTML = `
    <div class="modal-dialog modal-sm">
      <div class="modal-content">
        <div class="modal-header bg-success text-white">
          <h5 class="modal-title"><i class="bi bi-person-check me-2"></i>账号已创建</h5>
        </div>
        <div class="modal-body">
          <p class="small text-muted mb-3">请将以下登录凭据安全告知该教职工，密码仅显示一次：</p>
          <div class="mb-2">
            <label class="form-label small fw-semibold">登录账号</label>
            <div class="input-group input-group-sm">
              <input class="form-control" id="cred-username" value="${escapeHtml(username)}" readonly>
              <button class="btn btn-outline-secondary" onclick="navigator.clipboard.writeText(document.getElementById('cred-username').value).then(()=>showToast('已复制','success'))">
                <i class="bi bi-clipboard"></i>
              </button>
            </div>
          </div>
          <div class="mb-2">
            <label class="form-label small fw-semibold">初始密码</label>
            <div class="input-group input-group-sm">
              <input class="form-control" id="cred-password" value="${escapeHtml(password)}" readonly>
              <button class="btn btn-outline-secondary" onclick="navigator.clipboard.writeText(document.getElementById('cred-password').value).then(()=>showToast('已复制','success'))">
                <i class="bi bi-clipboard"></i>
              </button>
            </div>
          </div>
          <div class="alert alert-warning py-2 small mt-3"><i class="bi bi-exclamation-triangle me-1"></i>该密码不会再次显示，请妥善记录后关闭</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-success w-100" data-bs-dismiss="modal">我已记录，关闭</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
  new bootstrap.Modal(div).show();
  div.addEventListener('hidden.bs.modal', () => div.remove());
}

async function saveTask() {
  if (!acquireSubmit('saveTask')) return;
  const studentId = document.getElementById('task-student-id').value;
  const taskId = document.getElementById('task-id').value;
  const body = {
    title: document.getElementById('task-title').value,
    description: document.getElementById('task-desc').value,
    category: document.getElementById('task-category').value,
    due_date: document.getElementById('task-due').value,
    priority: document.getElementById('task-priority').value,
    status: document.getElementById('task-status').value,
  };
  if (!body.title) { releaseSubmit('saveTask'); showError('请输入任务标题'); return; }
  try {
    if (taskId) {
      await PUT(`/api/tasks/${taskId}`, body);
      showSuccess('任务已更新');
    } else {
      await POST(`/api/students/${studentId}/tasks`, body);
      showSuccess('任务已添加');
    }
    bootstrap.Modal.getInstance(document.getElementById('task-modal')).hide();
    navigate('student-detail', { studentId, activeTab: 'tab-timeline' });
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveTask'); }
}

async function saveMaterial() {
  if (!acquireSubmit('saveMaterial')) return;
  const id = document.getElementById('mat-id').value;
  const studentId = document.getElementById('mat-student-id').value;
  const body = {
    material_type: document.getElementById('mat-type').value,
    title: document.getElementById('mat-title').value,
    status: document.getElementById('mat-status').value,
    notes: document.getElementById('mat-notes').value,
  };
  try {
    if (id) {
      await PUT(`/api/materials/${id}`, body);
      showSuccess('材料已更新');
    } else {
      await POST(`/api/students/${studentId}/materials`, body);
      showSuccess('材料已添加');
    }
    bootstrap.Modal.getInstance(document.getElementById('material-modal')).hide();
    navigate('student-detail', { studentId });
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveMaterial'); }
}

async function saveTarget() {
  if (!acquireSubmit('saveTarget')) return;
  const studentId = document.getElementById('tgt-student-id').value;
  const body = {
    uni_name: document.getElementById('tgt-name').value,
    department: document.getElementById('tgt-dept').value,
    tier: document.getElementById('tgt-tier').value,
    priority_rank: parseInt(document.getElementById('tgt-rank').value) || 1,
    rationale: document.getElementById('tgt-rationale').value,
  };
  if (!body.uni_name) { releaseSubmit('saveTarget'); showError('请输入院校名称'); return; }
  try {
    await POST(`/api/students/${studentId}/targets`, body);
    showSuccess('目标院校已添加');
    bootstrap.Modal.getInstance(document.getElementById('target-modal')).hide();
    navigate('student-detail', { studentId });
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveTarget'); }
}

async function saveApplication() {
  if (!acquireSubmit('saveApplication')) return;
  const studentId = document.getElementById('app-student-id').value;
  const appId = document.getElementById('app-id').value;
  const body = {
    uni_name: document.getElementById('app-uni').value,
    department: document.getElementById('app-dept').value,
    tier: document.getElementById('app-tier').value,
    route: document.getElementById('app-route').value,
    cycle_year: parseInt(document.getElementById('app-year').value),
    submit_deadline: document.getElementById('app-deadline').value,
    submit_date: document.getElementById('app-submit-date').value || null,
    offer_type: document.getElementById('app-offer-type').value,
    status: document.getElementById('app-status').value,
    notes: document.getElementById('app-notes').value,
  };
  if (!body.uni_name) { releaseSubmit('saveApplication'); showError('请输入院校名称'); return; }
  try {
    let savedId = appId;
    if (appId) {
      await PUT(`/api/applications/${appId}`, body);
      showSuccess('申请已更新');
    } else {
      body.student_id = studentId;
      const res = await POST('/api/applications', body);
      savedId = res.id;
      showSuccess('申请已添加');
    }
    // Save ext fields if present
    if (savedId) await saveAppExtFields(savedId, body.route);
    bootstrap.Modal.getInstance(document.getElementById('application-modal')).hide();
    navigate('student-detail', { studentId });
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveApplication'); }
}

async function generateTimeline() {
  const studentId = document.getElementById('tl-student-id').value;
  const templateId = document.getElementById('tl-template-id').value;
  const deadline = document.getElementById('tl-deadline').value;
  if (!templateId) { showError('请选择一个模板'); return; }
  if (!deadline) { showError('请选择申请截止基准日期'); return; }
  try {
    const res = await POST(`/api/templates/${templateId}/apply`, { student_id: studentId, base_date: deadline });
    showSuccess(`已生成 ${res.created} 个里程碑任务`);
    bootstrap.Modal.getInstance(document.getElementById('timeline-modal')).hide();
    navigate('student-detail', { studentId, activeTab: 'tab-timeline' });
  } catch(e) { showError(e.message); }
}

async function saveComm() {
  if (!acquireSubmit('saveComm')) return;
  const studentId = document.getElementById('comm-student-id').value;
  const body = {
    channel: document.getElementById('comm-channel').value,
    summary: document.getElementById('comm-summary').value,
    action_items: document.getElementById('comm-actions').value,
    comm_date: document.getElementById('comm-date').value,
  };
  if (!body.summary) { releaseSubmit('saveComm'); showError('请填写沟通摘要'); return; }
  try {
    await POST(`/api/students/${studentId}/communications`, body);
    showSuccess('沟通记录已保存');
    bootstrap.Modal.getInstance(document.getElementById('comm-modal')).hide();
    navigate('student-detail', { studentId });
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveComm'); }
}

function openChangePasswordModal() {
  document.getElementById('pwd-current').value = '';
  document.getElementById('pwd-new').value = '';
  document.getElementById('pwd-confirm').value = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('change-password-modal')).show();
}

async function submitChangePassword() {
  if (!acquireSubmit('changePassword')) return;
  const current_password = document.getElementById('pwd-current').value;
  const new_password = document.getElementById('pwd-new').value;
  const confirm = document.getElementById('pwd-confirm').value;
  if (!current_password || !new_password) { releaseSubmit('changePassword'); showError('请填写当前密码和新密码'); return; }
  if (new_password !== confirm) { releaseSubmit('changePassword'); showError('两次输入的新密码不一致'); return; }
  if (new_password.length < 6) { releaseSubmit('changePassword'); showError('新密码至少需要6位字符'); return; }
  try {
    await PUT('/api/auth/password', { current_password, new_password });
    bootstrap.Modal.getInstance(document.getElementById('change-password-modal'))?.hide();
    showSuccess('密码已修改，请重新登录');
    setTimeout(async () => {
      await POST('/api/auth/logout');
      State.user = null;
      document.getElementById('app').classList.add('d-none');
      document.getElementById('login-page').classList.remove('d-none');
      document.getElementById('login-password').value = '';
    }, 1500);
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('changePassword'); }
}

async function saveFeedback() {
  if (!acquireSubmit('saveFeedback')) return;
  const studentId = document.getElementById('fb-student-id').value;
  const body = {
    feedback_type: document.getElementById('fb-type').value,
    content: document.getElementById('fb-content').value,
    rating: document.getElementById('fb-rating').value || null,
  };
  if (!body.content) { releaseSubmit('saveFeedback'); showError('请填写反馈内容'); return; }
  try {
    await POST(`/api/students/${studentId}/feedback`, body);
    showSuccess('反馈已提交，感谢您的反馈！');
    bootstrap.Modal.getInstance(document.getElementById('feedback-modal')).hide();
    navigate(State.currentPage, { studentId });
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveFeedback'); }
}

async function saveMentor() {
  if (!acquireSubmit('saveMentor')) return;
  const studentId = document.getElementById('am-student-id').value;
  const body = {
    staff_id: document.getElementById('am-staff').value,
    role: document.getElementById('am-role').value,
    start_date: document.getElementById('am-date').value,
  };
  try {
    await POST(`/api/students/${studentId}/mentors`, body);
    showSuccess('导师已分配');
    bootstrap.Modal.getInstance(document.getElementById('assign-mentor-modal')).hide();
    navigate('student-detail', { studentId });
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveMentor'); }
}

async function savePS() {
  if (!acquireSubmit('savePS')) return;
  const studentId = document.getElementById('ps-student-id').value;
  const psId = document.getElementById('ps-id').value;
  const answers = [];
  document.querySelectorAll('.ps-q-field').forEach(el => answers.push(el.value));
  const status = document.getElementById('ps-status').value;

  // Hard-block: if finalizing/submitting, every question must meet minimum
  const minQ = parseInt(State.settings.ps_min_chars_per_q) || 350;
  const finalStatuses = ['定稿', '已提交'];
  if (finalStatuses.includes(status)) {
    const shortQs = answers.map((a, i) => ({ i, len: a.length })).filter(x => x.len < minQ);
    if (shortQs.length > 0) {
      releaseSubmit('savePS');
      showError(`状态为"${status}"时，每问至少需要 ${minQ} 字符。当前不足：第 ${shortQs.map(x => x.i + 1).join('、')} 问`);
      return;
    }
  }
  // Only enforce char limit for finalized statuses; for drafts, warn but allow saving
  const charLimit = parseInt(State.settings.ps_char_limit) || 4000;
  const totalChars = answers.reduce((s, a) => s + a.length, 0);
  if (totalChars > charLimit && finalStatuses.includes(status)) {
    releaseSubmit('savePS');
    showError(`状态为"${status}"时，总字符数（${totalChars}）不得超出上限（${charLimit}），请缩减内容后再提交。`);
    return;
  }
  if (totalChars > charLimit) {
    showToast(`提示：总字符数（${totalChars}）已超出建议上限（${charLimit}），草稿已保存，定稿前请缩减内容。`, 'warning');
  }

  const body = {
    content_json: answers,
    q1_content: answers[0]||'',
    q2_content: answers[1]||'',
    q3_content: answers[2]||'',
    status,
    review_notes: document.getElementById('ps-review-notes').value,
  };
  try {
    if (psId) {
      await PUT(`/api/personal-statements/${psId}`, body);
      showSuccess('个人陈述已更新');
    } else {
      await POST(`/api/students/${studentId}/personal-statement`, body);
      showSuccess('个人陈述新版本已保存');
    }
    bootstrap.Modal.getInstance(document.getElementById('ps-modal')).hide();
    navigate('student-detail', { studentId });
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('savePS'); }
}

// ════════════════════════════════════════════════════════
//  删除操作
// ════════════════════════════════════════════════════════

function deleteStudent(id, name) {
  confirmAction(`确定要归档学生 "${name}"？`, async () => {
    try {
      await DEL(`/api/students/${id}`);
      showSuccess('学生已归档');
      navigate('students');
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

function deleteTask(id, studentId) {
  const lockKey = `deleteTask_${id}`;
  confirmAction('确定删除此任务？', async () => {
    if (!acquireSubmit(lockKey)) return;
    try {
      await DEL(`/api/tasks/${id}`);
      showSuccess('任务已删除');
      navigate('student-detail', { studentId });
    } catch(e) { showError(e.message); }
    finally { releaseSubmit(lockKey); }
  }, { danger: true });
}

async function toggleTaskDone(id, studentId, currentStatus) {
  const newStatus = currentStatus === 'done' ? 'pending' : 'done';
  try {
    const res = await GET(`/api/tasks/${id}`);
    const task = res.task || res;
    await PUT(`/api/tasks/${id}`, {
      title: task.title,
      description: task.description || '',
      category: task.category || '其他',
      due_date: task.due_date || null,
      status: newStatus,
      priority: task.priority || 'normal',
      assigned_to: task.assigned_to || null,
    });
    navigate('student-detail', { studentId, activeTab: 'tab-timeline' });
  } catch(e) { showError(e.message); }
}

function deleteApplication(appId, studentId, uniName) {
  confirmAction(`确定删除申请「${uniName}」？此操作不可撤销。`, async () => {
    try {
      await DEL(`/api/applications/${appId}`);
      showSuccess('申请已删除');
      navigate('student-detail', { studentId, activeTab: 'tab-applications' });
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

function deleteTarget(id, studentId) {
  confirmAction('确定删除此目标院校？', async () => {
    try {
      await DEL(`/api/students/${studentId}/targets/${id}`);
      showSuccess('目标院校已删除');
      navigate('student-detail', { studentId });
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

function removeMentor(id, studentId) {
  confirmAction('确定解除此导师分配？', async () => {
    try {
      await DEL(`/api/students/${studentId}/mentors/${id}`);
      showSuccess('导师分配已解除');
      navigate('student-detail', { studentId });
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

function removeSubject(id, studentId) {
  confirmAction('确定删除此选科记录？', async () => {
    try {
      await DEL(`/api/students/${studentId}/subjects/${id}`);
      showSuccess('选科记录已删除');
      navigate('student-detail', { studentId });
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

// ════════════════════════════════════════════════════════
//  事件绑定
// ════════════════════════════════════════════════════════
function bindEvents() {
  // 登录
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    try {
      const res = await POST('/api/auth/login', { username, password });
      State.user = res.user;
      if (res.must_change_password) {
        // 首次登录强制修改密码：先进入应用再弹窗
        initApp();
        setTimeout(() => {
          showError('您使用的是初始密码，请立即修改密码后继续使用系统。');
          openChangePasswordModal();
        }, 500);
      } else {
        initApp();
      }
    } catch(err) {
      document.getElementById('login-error').textContent = err.message;
      document.getElementById('login-error').classList.remove('d-none');
    }
  });

  // 退出
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await POST('/api/auth/logout');
    State.user = null;
    document.getElementById('app').classList.add('d-none');
    document.getElementById('login-page').classList.remove('d-none');
    document.getElementById('login-password').value = '';
  });


  // 侧边栏切换
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
    document.getElementById('main-content').classList.toggle('sidebar-collapsed');
  });

  // 导航项
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });

  // 保存按钮
  document.getElementById('save-student-btn').onclick = saveStudent;
  document.getElementById('save-staff-btn').onclick = saveStaff;
  document.getElementById('save-task-btn').onclick = saveTask;
  document.getElementById('save-material-btn').onclick = saveMaterial;
  document.getElementById('save-target-btn').onclick = saveTarget;
  document.getElementById('save-application-btn').onclick = saveApplication;
  document.getElementById('gen-timeline-btn').onclick = generateTimeline;
  document.getElementById('save-comm-btn').onclick = saveComm;
  document.getElementById('save-feedback-btn').onclick = saveFeedback;
  document.getElementById('save-mentor-btn').onclick = saveMentor;
  document.getElementById('save-ps-btn').onclick = savePS;
  document.getElementById('save-assessment-btn').onclick = saveAssessment;
  document.getElementById('save-template-btn').onclick = saveTemplate;
  document.getElementById('do-apply-template-btn').onclick = doApplyTemplate;
  document.getElementById('save-consent-btn').onclick = saveConsent;
  document.getElementById('save-subject-btn').onclick = saveSubject;
  document.getElementById('save-subject-item-btn').onclick = saveSubjectItem;
  document.getElementById('save-parent-btn').onclick = saveParent;
  document.getElementById('save-feedback-response-btn').onclick = saveFeedbackResponse;
  document.getElementById('save-tpl-item-btn').onclick = saveTemplateItem;
  document.getElementById('save-exam-sitting-btn').onclick = saveExamSitting;
  document.getElementById('notif-bell-btn').onclick = toggleNotifPanel;
  document.getElementById('notif-generate-btn').onclick = generateNotifications;
  document.getElementById('notif-read-all-btn').onclick = markAllNotificationsRead;

}

// ════════════════════════════════════════════════════════
//  角色权限导航控制
// ════════════════════════════════════════════════════════
function setupNavForRole(role) {
  // 隐藏/显示导航项
  document.querySelectorAll('.nav-item').forEach(el => {
    const roles = (el.dataset.roles || '').split(',').map(r => r.trim());
    el.style.display = (roles[0] === '' || roles.includes(role)) ? '' : 'none';
  });
  // 隐藏/显示导航分区标题（data-section-roles 控制）
  document.querySelectorAll('[data-section-roles]').forEach(el => {
    const roles = el.dataset.sectionRoles.split(',').map(r => r.trim());
    el.style.display = roles.includes(role) ? '' : 'none';
  });
}

// ════════════════════════════════════════════════════════
//  应用初始化
// ════════════════════════════════════════════════════════
function initApp() {
  const user = State.user;
  document.getElementById('login-page').classList.add('d-none');
  document.getElementById('app').classList.remove('d-none');
  document.getElementById('nav-username').textContent = user.name || user.username;

  const roleLabels = {
    principal: '校长', counselor: '升学规划师', mentor: '导师',
    student: '学生', parent: '家长', agent: '代理',
    intake_staff: '入学管理员', student_admin: '学生管理员'
  };
  document.getElementById('nav-role-badge').textContent = roleLabels[user.role] || user.role;

  setupNavForRole(user.role);

  // 通知铃（counselor/principal/intake_staff/student_admin 可见）
  const bellWrap = document.getElementById('notif-bell-wrap');
  if (bellWrap && ['principal','counselor','intake_staff','student_admin'].includes(user.role)) {
    bellWrap.classList.remove('d-none');
    loadNotificationBadge();
    setInterval(loadNotificationBadge, 15 * 1000); // 每15秒刷新
  }

  // 打印页脚
  let pf = document.getElementById('print-footer');
  if (!pf) { pf = document.createElement('div'); pf.id = 'print-footer'; document.body.appendChild(pf); }
  pf.textContent = State.settings?.print_footer || '';

  // 启动打印按钮注入观察器
  _mainObs.observe(document.getElementById('main-content'), { childList: true });

  // ── 恢复 URL hash 中的页面状态，否则跳默认页 ──
  const defaultPages = {
    principal: 'dashboard',
    counselor: 'counselor',
    mentor: 'mentor',
    student: 'student-portal',
    parent: 'parent-portal',
    agent: 'agent-portal',
    intake_staff: 'intake-dashboard',
    student_admin: 'intake-dashboard',
  };
  let restored = false;
  try {
    const hash = window.location.hash.slice(1);
    if (hash && hash.length > 2) {
      const qIdx = hash.indexOf('?');
      const hashPage = qIdx >= 0 ? hash.substring(0, qIdx) : hash;
      const hashQuery = qIdx >= 0 ? hash.substring(qIdx + 1) : '';
      if (hashPage && PAGES[hashPage]) {
        const params = {};
        if (hashQuery) new URLSearchParams(hashQuery).forEach((v, k) => { params[k] = v; });
        navigate(hashPage, params);
        restored = true;
      }
    }
  } catch(e) {}
  if (!restored) navigate(defaultPages[user.role] || 'dashboard');

  // 会话超时提醒
  _setupSessionWarning();
}

function _setupSessionWarning() {
  const mins = parseInt(localStorage.getItem('pref_session_warn') || '30');
  if (!mins) return;
  let timer;
  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      showToast(`您已 ${mins} 分钟无操作，会话即将过期，请注意保存。`, 'warning');
    }, mins * 60 * 1000);
  };
  ['click','keydown','mousemove','touchstart'].forEach(ev => document.addEventListener(ev, reset, { passive: true }));
  reset();
}

// ════════════════════════════════════════════════════════
//  PDF 导出
// ════════════════════════════════════════════════════════
function exportPDF() {
  window.print();
}

// 在 page-header 右侧注入 PDF 按钮（通用）
function injectPrintBtn() {
  const header = document.querySelector('.page-header');
  if (!header || header.querySelector('.print-btn')) return;
  const btn = document.createElement('button');
  btn.className = 'btn btn-outline-secondary btn-sm print-btn';
  btn.innerHTML = '<i class="bi bi-printer me-1"></i>导出PDF';
  btn.onclick = exportPDF;
  const right = header.querySelector('.d-flex:last-child') || header;
  right.appendChild(btn);
}

// 渲染完主内容后注入打印按钮（通过 MutationObserver 监听）
const _mainObs = new MutationObserver(() => {
  injectPrintBtn();
});

// ════════════════════════════════════════════════════════
//  时间线模板管理页
// ════════════════════════════════════════════════════════

async function renderTemplates() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;
  try {
    const templates = await GET('/api/templates');
    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-layout-text-sidebar-reverse me-2"></i>时间线模板管理</h4>
      <div class="d-flex gap-2">
        <button class="btn btn-primary btn-sm" onclick="openTemplateModal()">
          <i class="bi bi-plus me-1"></i>新建自定义模板
        </button>
      </div>
    </div>
    <div class="alert alert-info small py-2">
      <i class="bi bi-info-circle me-1"></i>
      系统内置模板不可编辑，可"复制"后在副本上修改。自定义模板可直接编辑和删除。
      应用模板时，系统根据每个任务的"提前天数"从申请截止日倒推自动生成里程碑。
    </div>
    <div class="row g-3">
      ${templates.map(t => {
        const isSystem = !!t.is_system;
        const tierColors = { '冲刺':'danger','意向':'primary','保底':'success','通用':'secondary' };
        const routeIcons = { 'UK-UG':'🇬🇧','US':'🇺🇸','CA':'🇨🇦','AU':'🇦🇺','SG':'🇸🇬','通用':'🌐' };
        return `
        <div class="col-md-6 col-lg-4">
          <div class="template-card p-3 h-100 d-flex flex-column">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <div class="fw-bold">${routeIcons[t.route]||'📋'} ${t.name}</div>
                <div class="d-flex gap-1 mt-1">
                  <span class="badge bg-light text-dark border">${t.route||'—'}</span>
                  <span class="badge bg-${tierColors[t.tier]||'secondary'}">${t.tier||'通用'}</span>
                  ${isSystem ? '<span class="badge bg-secondary">系统内置</span>' : '<span class="badge bg-info">自定义</span>'}
                </div>
              </div>
              <span class="badge bg-light text-dark border">${t.item_count} 项任务</span>
            </div>
            ${t.description ? `<p class="small text-muted mb-2">${t.description}</p>` : ''}
            <div class="mt-auto d-flex gap-1 flex-wrap">
              <button class="btn btn-sm btn-primary" onclick="openApplyTemplateModal('${t.id}')">
                <i class="bi bi-magic me-1"></i>应用到学生
              </button>
              <button class="btn btn-sm btn-outline-secondary" onclick="previewTemplate('${t.id}')">
                <i class="bi bi-eye me-1"></i>预览
              </button>
              ${isSystem
                ? `<button class="btn btn-sm btn-outline-secondary" onclick="copyTemplate('${t.id}')"><i class="bi bi-copy me-1"></i>复制</button>`
                : `<button class="btn btn-sm btn-outline-primary" onclick="openTemplateModal('${t.id}')"><i class="bi bi-pencil me-1"></i>编辑</button>
                   <button class="btn btn-sm btn-outline-danger" onclick="deleteTemplate('${t.id}','${t.name}')"><i class="bi bi-trash me-1"></i>删除</button>`
              }
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
    injectPrintBtn();
  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// 预览模板（展开所有任务项）
async function previewTemplate(templateId) {
  try {
    const { template, items } = await GET(`/api/templates/${templateId}`);
    const html = `
      <div class="fw-bold mb-2">${template.name}</div>
      <p class="small text-muted">${template.description||''}</p>
      <table class="table table-sm">
        <thead class="table-light"><tr><th>#</th><th>任务</th><th>分类</th><th>提前天数</th><th>优先级</th></tr></thead>
        <tbody>
          ${items.map((item,i) => `<tr>
            <td>${i+1}</td>
            <td>${escapeHtml(item.title)}</td>
            <td><span class="badge bg-secondary">${escapeHtml(item.category)}</span></td>
            <td>${item.days_before_deadline >= 0 ? '提前 '+item.days_before_deadline+' 天' : '截止后 '+Math.abs(item.days_before_deadline)+' 天'}</td>
            <td>${item.priority==='high'?'<span class="badge bg-danger">高</span>':item.priority==='low'?'<span class="badge bg-secondary">低</span>':'<span class="badge bg-light text-dark">普通</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    document.getElementById('confirm-body').innerHTML = html;
    document.getElementById('confirm-ok').style.display = 'none';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('confirm-modal')).show();
    setTimeout(() => { document.getElementById('confirm-ok').style.display = ''; }, 100);
  } catch(e) { showError(e.message); }
}

async function copyTemplate(templateId) {
  try {
    const res = await POST(`/api/templates/${templateId}/copy`);
    showSuccess('模板已复制，可在副本上编辑');
    if (State.currentPage === 'settings') {
      await renderSettings();
      activateTab('stab-tpl');
    } else {
      await renderTemplates();
    }
    openTemplateModal(res.id);
  } catch(e) { showError(e.message); }
}

async function deleteTemplate(templateId, name) {
  confirmAction(`确定删除模板"${name}"？`, async () => {
    try {
      await DEL(`/api/templates/${templateId}`);
      showSuccess('模板已删除');
      renderTemplates();
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

// 打开模板编辑器
async function openTemplateModal(templateId = null) {
  State.templateItems = [];
  document.getElementById('tpl-id').value = templateId || '';
  document.getElementById('tpl-items-list').innerHTML = '<div class="text-center text-muted py-3 small">暂无任务项，点击"添加任务项"</div>';

  // Populate routes and tiers dynamically
  const routeSel = document.getElementById('tpl-route');
  routeSel.innerHTML = getAppRoutes().map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  const tierSel = document.getElementById('tpl-tier');
  tierSel.innerHTML = getAppTiers().map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');

  if (templateId) {
    try {
      const { template, items } = await GET(`/api/templates/${templateId}`);
      document.getElementById('tpl-name').value = template.name;
      document.getElementById('tpl-desc').value = template.description || '';
      document.getElementById('tpl-route').value = template.route || 'UK-UG';
      document.getElementById('tpl-tier').value = template.tier || '意向';
      document.getElementById('tpl-modal-title').textContent = '编辑模板';
      State.templateItems = items.map(i => ({
        title: i.title, description: i.description||'', category: i.category,
        days_before_deadline: i.days_before_deadline, priority: i.priority
      }));
    } catch(e) { showError(e.message); return; }
  } else {
    document.getElementById('tpl-name').value = '';
    document.getElementById('tpl-desc').value = '';
    document.getElementById('tpl-route').value = 'UK-UG';
    document.getElementById('tpl-tier').value = '意向';
    document.getElementById('tpl-modal-title').textContent = '新建时间线模板';
  }
  renderTemplateItemsList();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('template-edit-modal')).show();
}

function renderTemplateItemsList() {
  const el = document.getElementById('tpl-items-list');
  if (State.templateItems.length === 0) {
    el.innerHTML = '<div class="text-center text-muted py-3 small">暂无任务项，点击"添加任务项"</div>';
    return;
  }
  el.innerHTML = State.templateItems.map((item, idx) => `
    <div class="template-item-row">
      <span class="drag-handle">⠿</span>
      <span class="flex-grow-1 small fw-semibold">${escapeHtml(item.title)}</span>
      <span class="badge bg-secondary me-1" style="font-size:10px">${escapeHtml(item.category)}</span>
      <span class="badge bg-light text-dark border me-1" style="font-size:10px">
        ${item.days_before_deadline >= 0 ? '提前'+item.days_before_deadline+'天' : '截止后'+Math.abs(item.days_before_deadline)+'天'}
      </span>
      ${item.priority==='high'?'<span class="badge bg-danger me-1">高</span>':''}
      <button class="btn btn-link btn-sm p-0 text-primary me-1" onclick="editTemplateItem(${idx})"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-link btn-sm p-0 text-danger" onclick="removeTemplateItem(${idx})"><i class="bi bi-trash"></i></button>
    </div>`).join('');
}

function openTemplateItemModal(idx = -1) {
  document.getElementById('tpl-item-idx').value = idx;
  // Populate category select dynamically
  const catSel = document.getElementById('tpl-item-category');
  catSel.innerHTML = getTaskCategories().map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  if (idx >= 0) {
    const item = State.templateItems[idx];
    document.getElementById('tpl-item-modal-title').textContent = '编辑任务项';
    document.getElementById('tpl-item-title').value = item.title;
    document.getElementById('tpl-item-category').value = item.category;
    document.getElementById('tpl-item-days').value = item.days_before_deadline;
    document.getElementById('tpl-item-priority').value = item.priority;
    document.getElementById('tpl-item-desc').value = item.description || '';
  } else {
    document.getElementById('tpl-item-modal-title').textContent = '添加任务项';
    document.getElementById('tpl-item-title').value = '';
    document.getElementById('tpl-item-days').value = '30';
    document.getElementById('tpl-item-priority').value = 'normal';
    document.getElementById('tpl-item-desc').value = '';
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('template-item-modal')).show();
}

function saveTemplateItem() {
  const title = document.getElementById('tpl-item-title').value.trim();
  if (!title) { showError('请填写任务名称'); return; }
  const idx = parseInt(document.getElementById('tpl-item-idx').value);
  const item = {
    title,
    category: document.getElementById('tpl-item-category').value,
    days_before_deadline: parseInt(document.getElementById('tpl-item-days').value) || 30,
    priority: document.getElementById('tpl-item-priority').value,
    description: document.getElementById('tpl-item-desc').value,
  };
  if (idx >= 0) {
    State.templateItems[idx] = item;
  } else {
    State.templateItems.push(item);
  }
  bootstrap.Modal.getInstance(document.getElementById('template-item-modal')).hide();
  renderTemplateItemsList();
}

function addTemplateItemRow() { openTemplateItemModal(-1); }

function editTemplateItem(idx) { openTemplateItemModal(idx); }

function removeTemplateItem(idx) {
  State.templateItems.splice(idx, 1);
  renderTemplateItemsList();
}

async function saveTemplate() {
  if (!acquireSubmit('saveTemplate')) return;
  const id = document.getElementById('tpl-id').value;
  const name = document.getElementById('tpl-name').value.trim();
  if (!name) { releaseSubmit('saveTemplate'); showError('请输入模板名称'); return; }
  if (State.templateItems.length === 0) { releaseSubmit('saveTemplate'); showError('请至少添加一个任务项'); return; }
  const body = {
    name,
    description: document.getElementById('tpl-desc').value,
    route: document.getElementById('tpl-route').value,
    tier: document.getElementById('tpl-tier').value,
    items: State.templateItems,
  };
  try {
    if (id) {
      await PUT(`/api/templates/${id}`, body);
      showSuccess('模板已更新');
    } else {
      await POST('/api/templates', body);
      showSuccess('模板已创建');
    }
    bootstrap.Modal.getInstance(document.getElementById('template-edit-modal')).hide();
    if (State.currentPage === 'settings') {
      await renderSettings();
      activateTab('stab-tpl');
    } else {
      renderTemplates();
    }
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveTemplate'); }
}

async function openApplyTemplateModal(templateId) {
  document.getElementById('apply-tpl-id').value = templateId;
  document.getElementById('apply-tpl-deadline').value = '';
  try {
    const students = await GET('/api/students');
    const sel = document.getElementById('apply-tpl-student');
    sel.innerHTML = students.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.grade_level)})</option>`).join('');
  } catch(e) {}
  bootstrap.Modal.getOrCreateInstance(document.getElementById('apply-template-modal')).show();
}

async function doApplyTemplate() {
  const templateId = document.getElementById('apply-tpl-id').value;
  const studentId = document.getElementById('apply-tpl-student').value;
  const deadline = document.getElementById('apply-tpl-deadline').value;
  if (!deadline) { showError('请选择申请截止基准日期'); return; }
  try {
    const res = await POST(`/api/templates/${templateId}/apply`, {
      student_id: studentId, base_date: deadline
    });
    showSuccess(`已为学生生成 ${res.created} 个里程碑任务`);
    bootstrap.Modal.getInstance(document.getElementById('apply-template-modal')).hide();
    navigate('student-detail', { studentId, activeTab: 'tab-timeline' });
  } catch(e) { showError(e.message); }
}

// ════════════════════════════════════════════════════════
//  系统设置页
// ════════════════════════════════════════════════════════

async function renderSettings() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;
  try {
    const [settings, templates] = await Promise.all([GET('/api/settings'), GET('/api/templates')]);
    State.settings = settings;
    // Initialize draft from current settings
    State.settingsDraft = {
      ps_questions: JSON.parse(settings.ps_questions || '[]').map(q => ({...q})),
      assessment_types: JSON.parse(settings.assessment_types || '[]').map(t => ({...t})),
      task_categories: [...(JSON.parse(settings.task_categories || '[]'))],
      app_routes: [...(JSON.parse(settings.app_routes || '[]'))],
      app_tiers: [...(JSON.parse(settings.app_tiers || '[]'))],
      subject_levels: [...(JSON.parse(settings.subject_levels || '[]'))],
      exam_boards: [...(JSON.parse(settings.exam_boards || '[]'))],
      subject_list: JSON.parse(settings.subject_list || '[]').map(s => ({...s})),
    };

    const tierColors = { '冲刺':'danger','意向':'primary','保底':'success','通用':'secondary' };
    const routeIcons = { 'UK-UG':'🇬🇧','US':'🇺🇸','CA':'🇨🇦','AU':'🇦🇺','SG':'🇸🇬','通用':'🌐' };

    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-gear me-2"></i>系统设置</h4>
    </div>
    <ul class="nav nav-tabs mb-3" id="settings-tabs">
      <li class="nav-item"><a class="nav-link active" href="#stab-appearance" data-bs-toggle="tab"><i class="bi bi-palette me-1"></i>外观与显示</a></li>
      <li class="nav-item"><a class="nav-link" href="#stab-ps" data-bs-toggle="tab"><i class="bi bi-file-earmark-text me-1"></i>个人陈述</a></li>
      <li class="nav-item"><a class="nav-link" href="#stab-assess" data-bs-toggle="tab"><i class="bi bi-clipboard-data me-1"></i>评估类型</a></li>
      <li class="nav-item"><a class="nav-link" href="#stab-appconfig" data-bs-toggle="tab"><i class="bi bi-sliders me-1"></i>申请与任务</a></li>
      <li class="nav-item"><a class="nav-link" href="#stab-subject" data-bs-toggle="tab"><i class="bi bi-book me-1"></i>选科配置</a></li>
      <li class="nav-item"><a class="nav-link" href="#stab-system" data-bs-toggle="tab"><i class="bi bi-building me-1"></i>系统信息</a></li>
      <li class="nav-item"><a class="nav-link" href="#stab-tpl" data-bs-toggle="tab"><i class="bi bi-layout-text-sidebar-reverse me-1"></i>时间线模板</a></li>
      <li class="nav-item"><a class="nav-link" href="#stab-anchors" data-bs-toggle="tab"><i class="bi bi-calendar-event me-1"></i>锚点事件</a></li>
      <li class="nav-item"><a class="nav-link" href="#stab-escalation" data-bs-toggle="tab"><i class="bi bi-bell me-1"></i>升级政策</a></li>
    </ul>
    <div class="tab-content">

      <!-- ── 外观与显示 ── -->
      <div class="tab-pane fade show active" id="stab-appearance">
        <div class="row g-3">
          <!-- 主题模式 -->
          <div class="col-md-6">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-moon-stars me-1 text-primary"></i>主题模式</div>
              <div class="card-body">
                <p class="small text-muted mb-3">选择界面显示风格，深色模式可减少夜间用眼疲劳。</p>
                <div class="d-flex gap-3 flex-wrap">
                  ${[
                    {v:'light', icon:'bi-sun', label:'浅色'},
                    {v:'dark',  icon:'bi-moon', label:'深色'},
                    {v:'auto',  icon:'bi-circle-half', label:'跟随系统'},
                  ].map(t => `
                  <div class="form-check">
                    <input class="form-check-input" type="radio" name="pref-theme" id="theme-${t.v}" value="${t.v}" ${(localStorage.getItem('pref_theme')||'light')===t.v?'checked':''} onchange="applyTheme('${t.v}')">
                    <label class="form-check-label" for="theme-${t.v}"><i class="bi ${t.icon} me-1"></i>${t.label}</label>
                  </div>`).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- 主题色 -->
          <div class="col-md-6">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-palette me-1 text-primary"></i>主题色</div>
              <div class="card-body">
                <p class="small text-muted mb-3">选择系统主色调，影响按钮、选中状态等主要颜色。</p>
                <div class="d-flex gap-3 flex-wrap align-items-center" id="accent-swatches">
                  ${[
                    {key:'blue',   color:'#2563eb', label:'蓝色'},
                    {key:'green',  color:'#16a34a', label:'绿色'},
                    {key:'purple', color:'#7c3aed', label:'紫色'},
                    {key:'orange', color:'#ea580c', label:'橙色'},
                    {key:'red',    color:'#dc2626', label:'红色'},
                    {key:'teal',   color:'#0d9488', label:'青色'},
                  ].map(c => {
                    const active = (localStorage.getItem('pref_accent')||'blue') === c.key;
                    return `<div class="text-center" style="cursor:pointer" onclick="applyAccent('${c.key}')">
                      <div style="width:36px;height:36px;border-radius:50%;background:${c.color};margin:0 auto;
                        border:3px solid ${active?'#fff':'transparent'};
                        box-shadow:${active?'0 0 0 2px '+c.color:'0 1px 3px rgba(0,0,0,.2)'};"
                        id="swatch-${c.key}"></div>
                      <div class="small text-muted mt-1" style="font-size:11px">${c.label}</div>
                    </div>`;
                  }).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- 字体大小 -->
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-type me-1 text-info"></i>字体大小</div>
              <div class="card-body">
                <select class="form-select" id="pref-fontsize" onchange="applyFontSize(this.value)">
                  <option value="small"  ${(localStorage.getItem('pref_fontsize')||'normal')==='small' ?'selected':''}>小 (12px)</option>
                  <option value="normal" ${(localStorage.getItem('pref_fontsize')||'normal')==='normal'?'selected':''}>标准 (14px)</option>
                  <option value="large"  ${(localStorage.getItem('pref_fontsize')||'normal')==='large' ?'selected':''}>大 (16px)</option>
                </select>
                <div class="form-text mt-2">立即生效，无需刷新。</div>
              </div>
            </div>
          </div>

          <!-- 信息密度 -->
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-layout-three-columns me-1 text-info"></i>信息密度</div>
              <div class="card-body">
                <select class="form-select" id="pref-density" onchange="applyDensity(this.value)">
                  <option value="compact" ${(localStorage.getItem('pref_density')||'normal')==='compact'?'selected':''}>紧凑</option>
                  <option value="normal"  ${(localStorage.getItem('pref_density')||'normal')==='normal' ?'selected':''}>标准</option>
                  <option value="loose"   ${(localStorage.getItem('pref_density')||'normal')==='loose'  ?'selected':''}>宽松</option>
                </select>
                <div class="form-text mt-2">调整表格、卡片间距。</div>
              </div>
            </div>
          </div>

          <!-- 侧边栏默认 -->
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-layout-sidebar me-1 text-info"></i>侧边栏默认状态</div>
              <div class="card-body">
                <select class="form-select" id="pref-sidebar">
                  <option value="expanded" ${(localStorage.getItem('pref_sidebar')||'expanded')==='expanded'?'selected':''}>默认展开</option>
                  <option value="collapsed" ${(localStorage.getItem('pref_sidebar')||'expanded')==='collapsed'?'selected':''}>默认折叠</option>
                </select>
                <div class="form-text mt-2">下次登录时生效。</div>
              </div>
            </div>
          </div>

          <!-- 每页显示条数 -->
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-card-list me-1 text-warning"></i>每页学生条数</div>
              <div class="card-body">
                <select class="form-select" id="pref-pagesize">
                  <option value="10"  ${(localStorage.getItem('pref_pagesize')||'20')==='10' ?'selected':''}>10 条</option>
                  <option value="20"  ${(localStorage.getItem('pref_pagesize')||'20')==='20' ?'selected':''}>20 条</option>
                  <option value="50"  ${(localStorage.getItem('pref_pagesize')||'20')==='50' ?'selected':''}>50 条</option>
                  <option value="100" ${(localStorage.getItem('pref_pagesize')||'20')==='100'?'selected':''}>100 条</option>
                </select>
                <div class="form-text mt-2">学生列表每次加载条数。</div>
              </div>
            </div>
          </div>

          <!-- 逾期预警阈值 -->
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-exclamation-triangle me-1 text-danger"></i>逾期预警提前天数</div>
              <div class="card-body">
                <input type="number" class="form-control" id="cfg-overdue-threshold" min="1" max="30"
                  value="${settings.overdue_threshold_days||7}" placeholder="7">
                <div class="form-text mt-2">距截止日期少于此天数时标为橙色警告。</div>
              </div>
            </div>
          </div>

          <!-- 会话超时提醒 -->
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-clock-history me-1 text-warning"></i>会话超时提醒</div>
              <div class="card-body">
                <select class="form-select" id="pref-session-warn">
                  <option value="0"   ${(localStorage.getItem('pref_session_warn')||'30')==='0'  ?'selected':''}>关闭</option>
                  <option value="15"  ${(localStorage.getItem('pref_session_warn')||'30')==='15' ?'selected':''}>15 分钟</option>
                  <option value="30"  ${(localStorage.getItem('pref_session_warn')||'30')==='30' ?'selected':''}>30 分钟</option>
                  <option value="60"  ${(localStorage.getItem('pref_session_warn')||'30')==='60' ?'selected':''}>1 小时</option>
                </select>
                <div class="form-text mt-2">无操作多久后弹出提醒。</div>
              </div>
            </div>
          </div>

          <!-- 重置外观 -->
          <div class="col-12 d-flex gap-2">
            <button class="btn btn-primary" onclick="saveAppearanceSettings()"><i class="bi bi-check-lg me-1"></i>保存外观设置</button>
            <button class="btn btn-outline-secondary" onclick="resetAppearanceSettings()"><i class="bi bi-arrow-counterclockwise me-1"></i>恢复默认</button>
          </div>
        </div>
      </div>

      <!-- ── 个人陈述 ── -->
      <div class="tab-pane fade" id="stab-ps">
        <div class="card">
          <div class="card-header fw-semibold">个人陈述表单设置</div>
          <div class="card-body">
            <div class="row g-3 mb-4">
              <div class="col-md-8">
                <label class="form-label fw-semibold">弹窗标题</label>
                <input class="form-control" id="cfg-ps-title" value="${settings.ps_modal_title||''}">
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold">总字符数上限</label>
                <input type="number" class="form-control" id="cfg-ps-charlimit" value="${settings.ps_char_limit||4000}">
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold">每问最少字符数 <span class="badge bg-danger ms-1">硬校验</span></label>
                <input type="number" class="form-control" id="cfg-ps-minq" value="${settings.ps_min_chars_per_q||350}">
                <div class="form-text">定稿/提交时强制拦截不足问</div>
              </div>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="fw-semibold">问题列表 <span class="text-muted fw-normal small ms-1">（可自定义问题数量与内容）</span></div>
              <button class="btn btn-sm btn-outline-primary" onclick="addPSQuestionDraft()"><i class="bi bi-plus me-1"></i>添加问题</button>
            </div>
            <div id="cfg-ps-questions-list" class="border rounded mb-3" style="min-height:60px">
              <!-- rendered by renderPSQuestionsDraft() -->
            </div>
            <button class="btn btn-primary" onclick="savePSSettings()">
              <i class="bi bi-check-lg me-1"></i>保存个人陈述设置
            </button>
          </div>
        </div>
      </div>

      <!-- ── 评估类型 ── -->
      <div class="tab-pane fade" id="stab-assess">
        <div class="card">
          <div class="card-header fw-semibold">入学评估 / 考试类型</div>
          <div class="card-body">
            <div class="alert alert-info small py-2 mb-3">
              <i class="bi bi-info-circle me-1"></i>
              管理"添加入学评估"弹窗中的考试类型，可自定义每种类型的名称、满分分值，以及是否展示分项成绩输入（如雅思 L/R/W/S）。
            </div>
            <div id="cfg-assess-list" class="border rounded mb-3" style="min-height:60px">
              <!-- rendered by renderAssessTypesDraft() -->
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-primary" onclick="addAssessTypeDraft()"><i class="bi bi-plus me-1"></i>添加类型</button>
              <button class="btn btn-primary" onclick="saveAssessmentTypes()"><i class="bi bi-check-lg me-1"></i>保存评估类型</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 申请与任务配置 ── -->
      <div class="tab-pane fade" id="stab-appconfig">
        <div class="row g-3">
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold">申请通道</div>
              <div class="card-body">
                <div id="cfg-routes-list" class="mb-2"></div>
                <div class="input-group input-group-sm">
                  <input class="form-control" id="cfg-route-input" placeholder="新通道名称">
                  <button class="btn btn-outline-primary" onclick="addListItemDraft('app_routes','cfg-route-input','cfg-routes-list')"><i class="bi bi-plus"></i></button>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold">申请梯度</div>
              <div class="card-body">
                <div id="cfg-tiers-list" class="mb-2"></div>
                <div class="input-group input-group-sm">
                  <input class="form-control" id="cfg-tier-input" placeholder="新梯度名称">
                  <button class="btn btn-outline-primary" onclick="addListItemDraft('app_tiers','cfg-tier-input','cfg-tiers-list')"><i class="bi bi-plus"></i></button>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold">任务分类</div>
              <div class="card-body">
                <div id="cfg-cats-list" class="mb-2"></div>
                <div class="input-group input-group-sm">
                  <input class="form-control" id="cfg-cat-input" placeholder="新分类名称">
                  <button class="btn btn-outline-primary" onclick="addListItemDraft('task_categories','cfg-cat-input','cfg-cats-list')"><i class="bi bi-plus"></i></button>
                </div>
              </div>
            </div>
          </div>
          <div class="col-12">
            <button class="btn btn-primary" onclick="saveAppConfig()"><i class="bi bi-check-lg me-1"></i>保存申请与任务配置</button>
          </div>
        </div>
      </div>

      <!-- ── 选科配置 ── -->
      <div class="tab-pane fade" id="stab-subject">
        <div class="row g-3">
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold">科目级别</div>
              <div class="card-body">
                <div id="cfg-levels-list" class="mb-2"></div>
                <div class="input-group input-group-sm">
                  <input class="form-control" id="cfg-level-input" placeholder="新级别（如 IB HL）">
                  <button class="btn btn-outline-primary" onclick="addListItemDraft('subject_levels','cfg-level-input','cfg-levels-list')"><i class="bi bi-plus"></i></button>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold">考试局</div>
              <div class="card-body">
                <div id="cfg-boards-list" class="mb-2"></div>
                <div class="input-group input-group-sm">
                  <input class="form-control" id="cfg-board-input" placeholder="新考试局（如 WJEC）">
                  <button class="btn btn-outline-primary" onclick="addListItemDraft('exam_boards','cfg-board-input','cfg-boards-list')"><i class="bi bi-plus"></i></button>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold d-flex justify-content-between align-items-center">
                <span>科目列表</span>
                <button class="btn btn-outline-primary btn-sm" onclick="openSubjectItemModal(-1)"><i class="bi bi-plus"></i></button>
              </div>
              <div class="card-body p-0">
                <div id="cfg-subjlist-list" style="max-height:300px;overflow-y:auto;"></div>
              </div>
            </div>
          </div>
          <div class="col-12">
            <button class="btn btn-primary" onclick="saveSubjectConfig()"><i class="bi bi-check-lg me-1"></i>保存选科配置</button>
          </div>
        </div>
      </div>

      <!-- ── 系统信息 ── -->
      <div class="tab-pane fade" id="stab-system">
        <div class="row g-3">
          <!-- 基本信息 -->
          <div class="col-12">
            <div class="card">
              <div class="card-header fw-semibold"><i class="bi bi-building me-1 text-primary"></i>机构基本信息</div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-md-5">
                    <label class="form-label fw-semibold">机构 / 学校名称</label>
                    <input class="form-control" id="cfg-school-name" value="${settings.school_name||''}" placeholder="如：XX国际学校">
                  </div>
                  <div class="col-md-3">
                    <label class="form-label fw-semibold">当前学年</label>
                    <input class="form-control" id="cfg-academic-year" value="${settings.academic_year||''}" placeholder="如：2025-2026">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label fw-semibold">系统联系邮箱</label>
                    <input type="email" class="form-control" id="cfg-contact-email" value="${settings.contact_email||''}" placeholder="admin@school.com">
                    <div class="form-text">用于系统通知发件地址（预留）</div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label fw-semibold">系统时区</label>
                    <select class="form-select" id="cfg-timezone">
                      ${['Asia/Shanghai','Asia/Hong_Kong','Asia/Singapore','Asia/Tokyo','Europe/London','America/New_York','America/Los_Angeles'].map(tz =>
                        `<option ${(settings.timezone||'Asia/Shanghai')===tz?'selected':''}>${tz}</option>`
                      ).join('')}
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label fw-semibold">打印页脚文字</label>
                    <input class="form-control" id="cfg-print-footer" value="${settings.print_footer||''}" placeholder="如：本报告由升学规划系统生成">
                    <div class="form-text">打印时显示在页面底部</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 默认业务参数 -->
          <div class="col-12">
            <div class="card">
              <div class="card-header fw-semibold"><i class="bi bi-sliders2 me-1 text-success"></i>业务默认参数</div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-md-3">
                    <label class="form-label fw-semibold">默认申请年份</label>
                    <input type="number" class="form-control" id="cfg-default-year" value="${settings.default_cycle_year||new Date().getFullYear()+1}" min="2020" max="2035">
                    <div class="form-text">新建申请时的默认 cycle year</div>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label fw-semibold">默认任务优先级</label>
                    <select class="form-select" id="cfg-default-priority">
                      <option value="high"   ${(settings.default_task_priority||'normal')==='high'  ?'selected':''}>高</option>
                      <option value="normal" ${(settings.default_task_priority||'normal')==='normal'?'selected':''}>普通</option>
                      <option value="low"    ${(settings.default_task_priority||'normal')==='low'   ?'selected':''}>低</option>
                    </select>
                    <div class="form-text">新建任务时的初始优先级</div>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label fw-semibold">每位规划师容量上限</label>
                    <input type="number" class="form-control" id="cfg-counselor-cap" value="${settings.counselor_capacity||20}" min="1" max="100">
                    <div class="form-text">超出时仪表盘高亮显示</div>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label fw-semibold">材料审核超时天数</label>
                    <input type="number" class="form-control" id="cfg-material-timeout" value="${settings.material_review_days||7}" min="1" max="30">
                    <div class="form-text">提交后超过此天数未审核则预警</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="col-12">
            <button class="btn btn-primary" onclick="saveSystemInfo()"><i class="bi bi-check-lg me-1"></i>保存系统信息</button>
          </div>
        </div>
      </div>

      <!-- ── 时间线模板 ── -->
      <div class="tab-pane fade" id="stab-tpl">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="alert alert-info small py-2 mb-0 flex-grow-1 me-3">
            <i class="bi bi-info-circle me-1"></i>系统内置模板不可编辑，可"复制"后修改。自定义模板可直接编辑和删除。
          </div>
          <button class="btn btn-primary btn-sm" onclick="openTemplateModal()"><i class="bi bi-plus me-1"></i>新建模板</button>
        </div>
        <div class="row g-3">
          ${templates.map(t => {
            const isSystem = !!t.is_system;
            return `
            <div class="col-md-6 col-lg-4">
              <div class="template-card p-3 h-100 d-flex flex-column">
                <div class="d-flex justify-content-between align-items-start mb-2">
                  <div>
                    <div class="fw-bold">${routeIcons[t.route]||'📋'} ${t.name}</div>
                    <div class="d-flex gap-1 mt-1">
                      <span class="badge bg-light text-dark border">${t.route||'—'}</span>
                      <span class="badge bg-${tierColors[t.tier]||'secondary'}">${t.tier||'通用'}</span>
                      ${isSystem ? '<span class="badge bg-secondary">系统内置</span>' : '<span class="badge bg-info">自定义</span>'}
                    </div>
                  </div>
                  <span class="badge bg-light text-dark border">${t.item_count} 项任务</span>
                </div>
                ${t.description ? `<p class="small text-muted mb-2">${t.description}</p>` : ''}
                <div class="mt-auto d-flex gap-1 flex-wrap">
                  <button class="btn btn-sm btn-primary" onclick="openApplyTemplateModal('${t.id}')"><i class="bi bi-magic me-1"></i>应用到学生</button>
                  <button class="btn btn-sm btn-outline-secondary" onclick="previewTemplate('${t.id}')"><i class="bi bi-eye me-1"></i>预览</button>
                  ${isSystem
                    ? `<button class="btn btn-sm btn-outline-secondary" onclick="copyTemplate('${t.id}')"><i class="bi bi-copy me-1"></i>复制</button>`
                    : `<button class="btn btn-sm btn-outline-primary" onclick="openTemplateModal('${t.id}')"><i class="bi bi-pencil me-1"></i>编辑</button>
                       <button class="btn btn-sm btn-outline-danger" onclick="deleteTemplateFromSettings('${t.id}','${t.name}')"><i class="bi bi-trash me-1"></i>删除</button>`}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- ── 锚点事件 ── -->
      <div class="tab-pane fade" id="stab-anchors">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-calendar-event me-1 text-primary"></i>日历锚点事件</div>
          <div class="card-body">
            <p class="small text-muted">锚点事件用于模板中"基于考试局结果日"类型任务的日期计算。内置事件自动填充，可添加自定义事件。</p>
            <div id="anchor-events-container"><div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div></div>
            <hr>
            <div class="fw-semibold small mb-2">添加自定义锚点事件</div>
            <div class="row g-2">
              <div class="col-md-3">
                <input class="form-control form-control-sm" id="new-anchor-type" placeholder="锚点类型（如 CIE_Jun）">
              </div>
              <div class="col-md-4">
                <input class="form-control form-control-sm" id="new-anchor-name" placeholder="事件名称">
              </div>
              <div class="col-md-3">
                <input type="date" class="form-control form-control-sm" id="new-anchor-date">
              </div>
              <div class="col-md-2">
                <button class="btn btn-primary btn-sm w-100" onclick="addAnchorEvent()"><i class="bi bi-plus me-1"></i>添加</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 升级政策 ── -->
      <div class="tab-pane fade" id="stab-escalation">
        <div class="card">
          <div class="card-header fw-semibold"><i class="bi bi-bell me-1 text-warning"></i>通知升级政策</div>
          <div class="card-body">
            <p class="small text-muted">设置在任务截止日前后多少天发送通知提醒，以及通知对象角色。</p>
            <div id="escalation-policy-container"><div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div></div>
          </div>
        </div>
      </div>

    </div>`;

    // Render draft editors
    renderPSQuestionsDraft();
    renderAssessTypesDraft();
    renderListDraft('app_routes', 'cfg-routes-list');
    renderListDraft('app_tiers', 'cfg-tiers-list');
    renderListDraft('task_categories', 'cfg-cats-list');
    renderListDraft('subject_levels', 'cfg-levels-list');
    renderListDraft('exam_boards', 'cfg-boards-list');
    renderSubjectListDraft();

    // Load anchor events and escalation policy on tab activation
    const anchorsTab = document.querySelector('a[href="#stab-anchors"]');
    if (anchorsTab) anchorsTab.addEventListener('shown.bs.tab', renderAnchorEventsList, { once: false });
    const escalTab = document.querySelector('a[href="#stab-escalation"]');
    if (escalTab) escalTab.addEventListener('shown.bs.tab', loadEscalationPolicy, { once: false });

  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// ── PS问题草稿编辑器 ──
function renderPSQuestionsDraft() {
  const el = document.getElementById('cfg-ps-questions-list');
  if (!el) return;
  const qs = State.settingsDraft.ps_questions || [];
  if (qs.length === 0) {
    el.innerHTML = '<div class="text-center text-muted py-3 small">暂无问题，点击"添加问题"</div>';
    return;
  }
  el.innerHTML = qs.map((q, i) => `
    <div class="p-2 border-bottom" style="background:${i%2===0?'#fafafa':'#fff'}">
      <div class="d-flex align-items-start gap-2">
        <div class="d-flex flex-column gap-1 pt-1">
          <button class="btn btn-link btn-sm p-0 text-muted" onclick="movePSQuestion(${i},-1)" ${i===0?'disabled':''}><i class="bi bi-chevron-up"></i></button>
          <button class="btn btn-link btn-sm p-0 text-muted" onclick="movePSQuestion(${i},1)" ${i===qs.length-1?'disabled':''}><i class="bi bi-chevron-down"></i></button>
        </div>
        <div class="flex-grow-1">
          <div class="row g-2">
            <div class="col-md-6">
              <label class="form-label mb-1 small text-muted">问题标签</label>
              <input class="form-control form-control-sm" id="cfg-pslabel-${i}" value="${escapeHtml(q.label||'')}" placeholder="问题标签...">
            </div>
            <div class="col-md-6">
              <label class="form-label mb-1 small text-muted">占位提示（placeholder）</label>
              <input class="form-control form-control-sm" id="cfg-pshint-${i}" value="${escapeHtml(q.hint||'')}" placeholder="输入框提示文字...">
            </div>
          </div>
        </div>
        <button class="btn btn-link btn-sm p-0 text-danger mt-1" onclick="removePSQuestion(${i})"><i class="bi bi-trash"></i></button>
      </div>
    </div>`).join('');
}

function addPSQuestionDraft() {
  if (!State.settingsDraft.ps_questions) State.settingsDraft.ps_questions = [];
  State.settingsDraft.ps_questions.push({ label: `第${State.settingsDraft.ps_questions.length+1}问：`, hint: '' });
  renderPSQuestionsDraft();
}

function removePSQuestion(idx) {
  State.settingsDraft.ps_questions.splice(idx, 1);
  renderPSQuestionsDraft();
}

function movePSQuestion(idx, dir) {
  const arr = State.settingsDraft.ps_questions;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  renderPSQuestionsDraft();
}

async function savePSSettings() {
  if (!acquireSubmit('savePSSettings')) return;
  // Read current label/hint values from DOM into draft
  const qs = State.settingsDraft.ps_questions || [];
  qs.forEach((q, i) => {
    const labelEl = document.getElementById(`cfg-pslabel-${i}`);
    const hintEl = document.getElementById(`cfg-pshint-${i}`);
    if (labelEl) q.label = labelEl.value;
    if (hintEl) q.hint = hintEl.value;
  });
  try {
    await PUT('/api/settings/ps_modal_title', { value: document.getElementById('cfg-ps-title')?.value || '' });
    await PUT('/api/settings/ps_char_limit', { value: document.getElementById('cfg-ps-charlimit')?.value || '4000' });
    await PUT('/api/settings/ps_min_chars_per_q', { value: document.getElementById('cfg-ps-minq')?.value || '350' });
    await PUT('/api/settings/ps_questions', { value: JSON.stringify(qs) });
    State.settings = await GET('/api/settings');
    showSuccess('个人陈述设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('savePSSettings'); }
}

// ── 评估类型草稿编辑器 ──
function renderAssessTypesDraft() {
  const el = document.getElementById('cfg-assess-list');
  if (!el) return;
  const types = State.settingsDraft.assessment_types || [];
  if (types.length === 0) {
    el.innerHTML = '<div class="text-center text-muted py-3 small">暂无评估类型</div>';
    return;
  }
  el.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm mb-0">
        <thead class="table-light"><tr>
          <th>评估名称</th><th style="width:100px">满分</th><th style="width:120px">分项成绩</th><th style="width:60px">操作</th>
        </tr></thead>
        <tbody>
          ${types.map((t,i) => `<tr>
            <td><input class="form-control form-control-sm" id="cfg-aname-${i}" value="${escapeHtml(t.name||'')}"></td>
            <td><input type="number" class="form-control form-control-sm" id="cfg-amax-${i}" value="${t.max||100}"></td>
            <td class="text-center align-middle">
              <div class="form-check form-switch d-inline-block">
                <input class="form-check-input" type="checkbox" id="cfg-asubs-${i}" ${t.subs?'checked':''}>
                <label class="form-check-label small" for="cfg-asubs-${i}">启用</label>
              </div>
            </td>
            <td><button class="btn btn-link btn-sm p-0 text-danger" onclick="removeAssessTypeDraft(${i})"><i class="bi bi-trash"></i></button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function addAssessTypeDraft() {
  if (!State.settingsDraft.assessment_types) State.settingsDraft.assessment_types = [];
  State.settingsDraft.assessment_types.push({ name: '新类型', max: 100, subs: false });
  renderAssessTypesDraft();
}

function removeAssessTypeDraft(idx) {
  State.settingsDraft.assessment_types.splice(idx, 1);
  renderAssessTypesDraft();
}

async function saveAssessmentTypes() {
  if (!acquireSubmit('saveAssessmentTypes')) return;
  const types = State.settingsDraft.assessment_types || [];
  types.forEach((t, i) => {
    const nEl = document.getElementById(`cfg-aname-${i}`);
    const mEl = document.getElementById(`cfg-amax-${i}`);
    const sEl = document.getElementById(`cfg-asubs-${i}`);
    if (nEl) t.name = nEl.value;
    if (mEl) t.max = parseFloat(mEl.value) || 100;
    if (sEl) t.subs = sEl.checked;
  });
  try {
    await PUT('/api/settings/assessment_types', { value: JSON.stringify(types) });
    State.settings = await GET('/api/settings');
    showSuccess('评估类型已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveAssessmentTypes'); }
}

// ── 通用列表草稿编辑器 ──
function renderListDraft(key, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const arr = State.settingsDraft[key] || [];
  el.innerHTML = arr.map((item, i) => `
    <span class="badge bg-light text-dark border me-1 mb-1 d-inline-flex align-items-center gap-1" style="font-size:13px;padding:6px 8px">
      ${escapeHtml(item)}
      <button class="btn btn-link p-0 text-danger" style="line-height:1;font-size:14px" onclick="removeListItemDraft('${key}',${i},'${elId}')">×</button>
    </span>`).join('');
}

function addListItemDraft(key, inputId, elId) {
  const input = document.getElementById(inputId);
  const val = input?.value.trim();
  if (!val) return;
  if (!State.settingsDraft[key]) State.settingsDraft[key] = [];
  if (!State.settingsDraft[key].includes(val)) {
    State.settingsDraft[key].push(val);
    renderListDraft(key, elId);
  }
  if (input) input.value = '';
}

function removeListItemDraft(key, idx, elId) {
  State.settingsDraft[key]?.splice(idx, 1);
  renderListDraft(key, elId);
}

async function saveAppConfig() {
  if (!acquireSubmit('saveAppConfig')) return;
  try {
    await PUT('/api/settings/app_routes', { value: JSON.stringify(State.settingsDraft.app_routes || []) });
    await PUT('/api/settings/app_tiers', { value: JSON.stringify(State.settingsDraft.app_tiers || []) });
    await PUT('/api/settings/task_categories', { value: JSON.stringify(State.settingsDraft.task_categories || []) });
    State.settings = await GET('/api/settings');
    showSuccess('申请与任务配置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveAppConfig'); }
}

// ── 科目列表草稿编辑器 ──
function renderSubjectListDraft() {
  const el = document.getElementById('cfg-subjlist-list');
  if (!el) return;
  const arr = State.settingsDraft.subject_list || [];
  el.innerHTML = arr.length === 0
    ? '<p class="text-muted small p-2 mb-0">暂无科目</p>'
    : arr.map((s, i) => `
      <div class="d-flex align-items-center justify-content-between px-2 py-1 border-bottom">
        <span class="small"><span class="badge bg-secondary me-1">${s.code}</span>${s.name}</span>
        <div class="d-flex gap-1">
          <button class="btn btn-link btn-sm p-0 text-primary" onclick="openSubjectItemModal(${i})" title="编辑"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-link btn-sm p-0 text-danger" onclick="removeSubjectItem(${i})" title="删除"><i class="bi bi-trash"></i></button>
        </div>
      </div>`).join('');
}

function openSubjectItemModal(idx) {
  const item = idx >= 0 ? (State.settingsDraft.subject_list || [])[idx] : null;
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('subject-item-modal'));
  document.getElementById('subj-item-idx').value = idx;
  document.getElementById('subj-item-code').value = item ? item.code : '';
  document.getElementById('subj-item-name').value = item ? item.name : '';
  modal.show();
}

function saveSubjectItem() {
  const idx = parseInt(document.getElementById('subj-item-idx').value);
  const code = document.getElementById('subj-item-code').value.trim().toUpperCase();
  const name = document.getElementById('subj-item-name').value.trim();
  if (!code || !name) { showError('科目代码和名称不能为空'); return; }
  if (!State.settingsDraft.subject_list) State.settingsDraft.subject_list = [];
  if (idx >= 0) {
    State.settingsDraft.subject_list[idx] = { code, name };
  } else {
    State.settingsDraft.subject_list.push({ code, name });
  }
  bootstrap.Modal.getInstance(document.getElementById('subject-item-modal')).hide();
  renderSubjectListDraft();
}

function removeSubjectItem(idx) {
  State.settingsDraft.subject_list?.splice(idx, 1);
  renderSubjectListDraft();
}

async function saveSubjectConfig() {
  if (!acquireSubmit('saveSubjectConfig')) return;
  try {
    await PUT('/api/settings/subject_levels', { value: JSON.stringify(State.settingsDraft.subject_levels || []) });
    await PUT('/api/settings/exam_boards',    { value: JSON.stringify(State.settingsDraft.exam_boards || []) });
    await PUT('/api/settings/subject_list',   { value: JSON.stringify(State.settingsDraft.subject_list || []) });
    State.settings = await GET('/api/settings');
    showSuccess('选科配置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveSubjectConfig'); }
}

// ════════════════════════════════════════════════════════
//  监护人同意模块
// ════════════════════════════════════════════════════════

function isUnder14(dob) {
  if (!dob) return false;
  const birth = new Date(dob);
  const now = new Date();
  const age = now.getFullYear() - birth.getFullYear() -
    (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate()) ? 1 : 0);
  return age < 14;
}

async function loadConsentHistory(studentId) {
  const histEl = document.getElementById('consent-history-list');
  if (!histEl) return;
  histEl.innerHTML = '<p class="text-muted small">加载中...</p>';
  try {
    const records = await GET(`/api/students/${studentId}/consents`);
    if (records.length === 0) {
      histEl.innerHTML = '<p class="text-muted small">暂无同意记录</p>';
    } else {
      histEl.innerHTML = `<div class="fw-semibold small mb-2">历史记录</div>` + records.map(r => {
        const scope = (() => { try { return JSON.parse(r.consent_scope||'[]'); } catch(e) { return []; } })();
        return `<div class="d-flex justify-content-between align-items-start border rounded p-2 mb-2 ${r.consented ? 'border-success' : 'border-danger bg-danger bg-opacity-5'}">
          <div>
            <span class="badge ${r.consented ? 'bg-success' : 'bg-danger'} me-2">${r.consented ? '有效' : '已撤回'}</span>
            <strong>${r.guardian_name}</strong>（${r.relation||''}）v${r.consent_version}
            <div class="small text-muted mt-1">同意日期：${r.consent_date} | 范围：${scope.join('、') || '未指定'}</div>
            ${r.revoke_date ? `<div class="small text-danger">撤回于：${r.revoke_date.split('T')[0]} — ${r.revoke_reason||''}</div>` : ''}
          </div>
          ${r.consented ? `<button class="btn btn-sm btn-outline-danger ms-2" onclick="revokeConsent('${r.id}')">撤回</button>` : ''}
        </div>`;
      }).join('');
    }
  } catch(e) { histEl.innerHTML = `<p class="text-danger small">${escapeHtml(e.message)}</p>`; }
}

async function openConsentModal(studentId) {
  document.getElementById('consent-student-id').value = studentId;
  document.getElementById('consent-guardian-name').value = '';
  document.getElementById('consent-relation').value = '父';
  document.getElementById('consent-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('consent-version').value = '1.0';
  document.querySelectorAll('.consent-scope').forEach(cb => { cb.checked = ['data_storage','counseling'].includes(cb.value); });

  bootstrap.Modal.getOrCreateInstance(document.getElementById('consent-modal')).show();
  loadConsentHistory(studentId);
}

async function saveConsent() {
  if (!acquireSubmit('saveConsent')) return;
  const studentId = document.getElementById('consent-student-id').value;
  const scope = [...document.querySelectorAll('.consent-scope:checked')].map(cb => cb.value);
  const body = {
    guardian_name: document.getElementById('consent-guardian-name').value.trim(),
    relation: document.getElementById('consent-relation').value,
    consent_date: document.getElementById('consent-date').value,
    consent_version: document.getElementById('consent-version').value || '1.0',
    consent_scope: scope,
    consented: true,
  };
  if (!body.guardian_name || !body.consent_date) { releaseSubmit('saveConsent'); showError('监护人姓名和同意日期必填'); return; }
  try {
    await POST(`/api/students/${studentId}/consents`, body);
    showSuccess('同意记录已保存');
    document.getElementById('consent-guardian-name').value = '';
    loadConsentHistory(studentId); // 只刷新历史，不重新打开模态框
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveConsent'); }
}

function revokeConsent(consentId) {
  // Use confirmAction with inline reason input instead of window.prompt
  const wrapperId = 'revoke-reason-wrap';
  confirmAction(
    `确认撤回此同意记录？<br><div class="mt-2"><label class="form-label small">撤回原因（可选）</label><input class="form-control form-control-sm" id="${wrapperId}" placeholder="请输入撤回原因..."></div>`,
    async () => {
      const reason = document.getElementById(wrapperId)?.value || '';
      try {
        await PUT(`/api/consents/${consentId}/revoke`, { revoke_reason: reason });
        showSuccess('同意已撤回');
        const sid = document.getElementById('consent-student-id').value;
        loadConsentHistory(sid);
      } catch(e) { showError(e.message); }
    }
  );
}

// ════════════════════════════════════════════════════════
//  考试记录 (ExamSitting)
// ════════════════════════════════════════════════════════
async function loadExamSittings(studentId) {
  const container = document.getElementById('exam-sittings-container');
  if (!container) return;
  try {
    const sittings = await GET(`/api/students/${studentId}/exam-sittings`);
    const canEdit = hasRole('principal','counselor');
    if (sittings.length === 0) {
      container.innerHTML = '<p class="text-center text-muted py-4">暂无考试记录。</p>';
      return;
    }
    container.innerHTML = `<div class="table-responsive">
      <table class="table table-hover">
        <thead class="table-light">
          <tr><th>考试局</th><th>科目</th><th>级别</th><th>考试季/年份</th><th>预期</th><th>实际</th><th>考试日期</th>${canEdit?'<th>操作</th>':''}</tr>
        </thead>
        <tbody>
          ${sittings.map(s => `<tr>
            <td><span class="badge bg-secondary">${escapeHtml(s.exam_board)}</span></td>
            <td>${escapeHtml(s.subject)}</td>
            <td class="small">${escapeHtml(s.component||'—')} ${s.subject_code?`<span class="text-muted">${escapeHtml(s.subject_code)}</span>`:''}</td>
            <td class="small">${escapeHtml(s.series||'')} ${s.year}</td>
            <td>${escapeHtml(s.predicted_grade||'—')}</td>
            <td class="${s.actual_grade?'fw-bold text-success':'text-muted'}">${escapeHtml(s.actual_grade||'—')}</td>
            <td class="small text-muted">${fmtDate(s.sitting_date)||'—'}</td>
            ${canEdit ? `<td>
              <button class="btn btn-link btn-sm p-0 text-secondary me-1" onclick="openExamSittingModal('${studentId}','${s.id}')"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-link btn-sm p-0 text-danger" onclick="deleteExamSitting('${s.id}','${studentId}')"><i class="bi bi-trash"></i></button>
            </td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } catch(e) {
    if (container) container.innerHTML = `<p class="text-danger small">${escapeHtml(e.message)}</p>`;
  }
}

async function openExamSittingModal(studentId, sittingId = '') {
  document.getElementById('es-id').value = sittingId;
  document.getElementById('es-student-id').value = studentId;
  const titleEl = document.getElementById('exam-sitting-modal-title');
  if (sittingId) {
    titleEl.textContent = '编辑考试记录';
    try {
      const sittings = await GET(`/api/students/${studentId}/exam-sittings`);
      const s = sittings.find(x => String(x.id) === String(sittingId));
      if (s) {
        document.getElementById('es-board').value = s.exam_board || 'CIE';
        document.getElementById('es-session').value = s.series || 'May/Jun';
        document.getElementById('es-year').value = s.year || 2025;
        document.getElementById('es-subject').value = s.subject || '';
        document.getElementById('es-level').value = s.component || '';
        document.getElementById('es-paper-code').value = s.subject_code || '';
        document.getElementById('es-predicted').value = s.predicted_grade || '';
        document.getElementById('es-actual').value = s.actual_grade || '';
        document.getElementById('es-exam-date').value = s.sitting_date || '';
        document.getElementById('es-result-date').value = s.results_date || '';
        document.getElementById('es-notes').value = s.notes || '';
      }
    } catch(e) {}
  } else {
    titleEl.textContent = '添加考试记录';
    ['es-subject','es-paper-code','es-predicted','es-actual','es-exam-date','es-result-date','es-notes'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('es-board').value = 'CIE';
    document.getElementById('es-session').value = 'May/Jun';
    document.getElementById('es-year').value = new Date().getFullYear();
    document.getElementById('es-level').value = '';
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('exam-sitting-modal')).show();
}

async function saveExamSitting() {
  if (!acquireSubmit('saveExamSitting')) return;
  const studentId = document.getElementById('es-student-id').value;
  const sittingId = document.getElementById('es-id').value;
  const body = {
    exam_board: document.getElementById('es-board').value,
    series: document.getElementById('es-session').value,
    year: parseInt(document.getElementById('es-year').value),
    subject: document.getElementById('es-subject').value.trim(),
    component: document.getElementById('es-level').value,
    subject_code: document.getElementById('es-paper-code').value.trim(),
    predicted_grade: document.getElementById('es-predicted').value.trim(),
    actual_grade: document.getElementById('es-actual').value.trim(),
    sitting_date: document.getElementById('es-exam-date').value || null,
    results_date: document.getElementById('es-result-date').value || null,
    notes: document.getElementById('es-notes').value.trim(),
  };
  if (!body.subject) { releaseSubmit('saveExamSitting'); showError('科目名称必填'); return; }
  try {
    if (sittingId) {
      await PUT(`/api/exam-sittings/${sittingId}`, body);
    } else {
      await POST(`/api/students/${studentId}/exam-sittings`, body);
    }
    bootstrap.Modal.getInstance(document.getElementById('exam-sitting-modal'))?.hide();
    showSuccess('考试记录已保存');
    loadExamSittings(studentId);
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveExamSitting'); }
}

async function deleteExamSitting(sittingId, studentId) {
  confirmAction('确定删除此考试记录？', async () => {
    try {
      await DEL(`/api/exam-sittings/${sittingId}`);
      showSuccess('已删除');
      loadExamSittings(studentId);
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

// ════════════════════════════════════════════════════════
//  外观与显示 — 偏好设置（localStorage，立即生效）
// ════════════════════════════════════════════════════════

function applyStoredPrefs() {
  applyTheme(localStorage.getItem('pref_theme') || 'light', false);
  applyAccent(localStorage.getItem('pref_accent') || 'blue', false);
  applyFontSize(localStorage.getItem('pref_fontsize') || 'normal', false);
  applyDensity(localStorage.getItem('pref_density') || 'normal', false);
  // sidebar default on load
  if (localStorage.getItem('pref_sidebar') === 'collapsed') {
    document.querySelector('.sidebar')?.classList.add('collapsed');
    document.getElementById('main-content')?.classList.add('sidebar-collapsed');
  }
  // watch OS theme changes for auto mode
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem('pref_theme') || 'light') === 'auto') applyTheme('auto', false);
  });
}

function applyTheme(mode, save = true) {
  if (save) localStorage.setItem('pref_theme', mode);
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const useDark = mode === 'dark' || (mode === 'auto' && prefersDark);
  document.body.classList.toggle('dark-mode', useDark);
}

const ACCENT_COLORS = {
  blue:   '#2563eb', green:  '#16a34a', purple: '#7c3aed',
  orange: '#ea580c', red:    '#dc2626', teal:   '#0d9488',
};

function applyAccent(key, save = true) {
  if (save) localStorage.setItem('pref_accent', key);
  document.body.setAttribute('data-accent', key);
  // Update swatch borders if panel is open
  Object.keys(ACCENT_COLORS).forEach(k => {
    const el = document.getElementById(`swatch-${k}`);
    if (!el) return;
    const active = k === key;
    el.style.border = `3px solid ${active ? '#fff' : 'transparent'}`;
    el.style.boxShadow = active ? `0 0 0 2px ${ACCENT_COLORS[k]}` : '0 1px 3px rgba(0,0,0,.2)';
  });
}

function applyFontSize(size, save = true) {
  if (save) localStorage.setItem('pref_fontsize', size);
  document.body.setAttribute('data-fontsize', size);
}

function applyDensity(density, save = true) {
  if (save) localStorage.setItem('pref_density', density);
  document.body.setAttribute('data-density', density);
}

async function saveAppearanceSettings() {
  if (!acquireSubmit('saveAppearanceSettings')) return;
  // Save localStorage prefs (already applied on change)
  const theme    = document.querySelector('input[name="pref-theme"]:checked')?.value || 'light';
  const sidebar  = document.getElementById('pref-sidebar')?.value || 'expanded';
  const pagesize = document.getElementById('pref-pagesize')?.value || '20';
  const sessWarn = document.getElementById('pref-session-warn')?.value || '30';
  localStorage.setItem('pref_theme', theme);
  localStorage.setItem('pref_sidebar', sidebar);
  localStorage.setItem('pref_pagesize', pagesize);
  localStorage.setItem('pref_session_warn', sessWarn);
  applyTheme(theme, false);
  // Save overdue threshold to DB
  const threshold = document.getElementById('cfg-overdue-threshold')?.value || '7';
  try {
    await PUT('/api/settings/overdue_threshold_days', { value: threshold });
    State.settings = await GET('/api/settings');
  } catch(e) {
    // ignore DB errors for appearance settings
  } finally {
    releaseSubmit('saveAppearanceSettings');
  }
  showSuccess('外观设置已保存');
}

function resetAppearanceSettings() {
  confirmAction('确定恢复所有外观设置为默认值？', () => {
    ['pref_theme','pref_accent','pref_fontsize','pref_density','pref_sidebar','pref_pagesize','pref_session_warn'].forEach(k => localStorage.removeItem(k));
    applyTheme('light', false);
    applyAccent('blue', false);
    applyFontSize('normal', false);
    applyDensity('normal', false);
    document.body.removeAttribute('data-accent');
    document.body.removeAttribute('data-fontsize');
    document.body.removeAttribute('data-density');
    showSuccess('已恢复默认外观');
    navigate('settings');
  });
}

async function saveSystemInfo() {
  if (!acquireSubmit('saveSystemInfo')) return;
  try {
    const saves = [
      ['school_name',           document.getElementById('cfg-school-name')?.value || ''],
      ['academic_year',         document.getElementById('cfg-academic-year')?.value || ''],
      ['contact_email',         document.getElementById('cfg-contact-email')?.value || ''],
      ['timezone',              document.getElementById('cfg-timezone')?.value || 'Asia/Shanghai'],
      ['print_footer',          document.getElementById('cfg-print-footer')?.value || ''],
      ['default_cycle_year',    document.getElementById('cfg-default-year')?.value || ''],
      ['default_task_priority', document.getElementById('cfg-default-priority')?.value || 'normal'],
      ['counselor_capacity',    document.getElementById('cfg-counselor-cap')?.value || '20'],
      ['material_review_days',  document.getElementById('cfg-material-timeout')?.value || '7'],
      ['overdue_threshold_days',document.getElementById('cfg-overdue-threshold')?.value || '7'],
    ];
    for (const [key, value] of saves) {
      await PUT(`/api/settings/${key}`, { value });
    }
    State.settings = await GET('/api/settings');
    showSuccess('系统信息已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveSystemInfo'); }
}

async function deleteTemplateFromSettings(templateId, name) {
  confirmAction(`确定删除模板"${name}"？`, async () => {
    try {
      await DEL(`/api/templates/${templateId}`);
      showSuccess('模板已删除');
      renderSettings();
      setTimeout(() => activateTab('stab-tpl'), 100);
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

// ════════════════════════════════════════════════════════
//  通知中心
// ════════════════════════════════════════════════════════
async function loadNotificationBadge() {
  try {
    const notifs = await GET('/api/notifications');
    const unread = notifs.filter(n => !n.is_read).length;
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = unread > 0 ? (unread > 99 ? '99+' : unread) : '';
      badge.style.display = unread > 0 ? '' : 'none';
    }
    // refresh panel list if open
    const panel = document.getElementById('notif-panel');
    if (panel && panel.style.display !== 'none') renderNotifList(notifs);
  } catch(e) {}
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  if (panel.style.display === 'none' || !panel.style.display) {
    panel.style.display = 'block';
    loadNotificationsPanel();
  } else {
    panel.style.display = 'none';
  }
}

async function loadNotificationsPanel() {
  const listEl = document.getElementById('notif-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="p-3 text-center text-muted small"><div class="spinner-border spinner-border-sm"></div></div>';
  try {
    const notifs = await GET('/api/notifications');
    renderNotifList(notifs);
  } catch(e) {
    listEl.innerHTML = `<div class="p-3 text-danger small">${escapeHtml(e.message)}</div>`;
  }
}

function renderNotifList(notifs) {
  const listEl = document.getElementById('notif-list');
  if (!listEl) return;
  if (notifs.length === 0) {
    listEl.innerHTML = '<div class="p-3 text-center text-muted small">暂无通知</div>';
    return;
  }
  listEl.innerHTML = notifs.slice(0, 30).map(n => `
    <div class="list-group-item list-group-item-action p-3 ${n.is_read?'':'bg-light'}" style="cursor:default">
      <div class="d-flex justify-content-between align-items-start">
        <div class="flex-grow-1">
          <div class="small fw-semibold ${n.is_read?'text-muted':''}">${escapeHtml(n.title||n.message||'')}</div>
          <div class="small text-muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px" title="${escapeHtml(n.message||'')}">${escapeHtml(n.message||'')}</div>
          <div class="small text-muted">${fmtDate(n.created_at)||''} · ${n.type||''}</div>
        </div>
        ${!n.is_read ? `<button class="btn btn-link btn-sm p-0 ms-2 text-secondary" onclick="markNotifRead('${n.id}')" title="标为已读"><i class="bi bi-check2"></i></button>` : ''}
      </div>
    </div>`).join('');
}

async function markNotifRead(id) {
  try {
    await PUT(`/api/notifications/${id}/read`, {});
    loadNotificationBadge();
  } catch(e) {}
}

async function markAllNotificationsRead() {
  try {
    await PUT('/api/notifications/read-all', {});
    showSuccess('已全部标记为已读');
    loadNotificationBadge();
  } catch(e) { showError(e.message); }
}

async function generateNotifications() {
  try {
    const btn = document.getElementById('notif-generate-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass"></i>'; }
    const res = await POST('/api/notifications/generate', {});
    showSuccess(`已生成 ${res.created || 0} 条通知`);
    loadNotificationBadge();
  } catch(e) { showError(e.message); }
  finally {
    const btn = document.getElementById('notif-generate-btn');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i>'; }
  }
}

// ════════════════════════════════════════════════════════
//  数据分析页
// ════════════════════════════════════════════════════════
async function renderAnalytics() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;
  try {
    // Server returns: { admissionRate, taskStats, counselorKPI, templateEff, routeStats }
    const d = await GET('/api/analytics/overview');

    // Derive aggregated task totals from taskStats array
    const taskStats = d.taskStats || [];
    const totalTasks = taskStats.reduce((s, r) => s + (r.total||0), 0);
    const doneTasks  = taskStats.reduce((s, r) => s + (r.done||0), 0);
    const overdueTasks = taskStats.reduce((s, r) => s + (r.overdue||0), 0);
    const pendingTasks = totalTasks - doneTasks;

    const ar = d.admissionRate || {};
    const offerRate = ar.total > 0 ? Math.round((ar.offers||0) / ar.total * 100) : null;

    const routeStats = (d.routeStats || []).map(r => ({
      route: r.route,
      total: r.cnt || 0,
      rate: r.cnt > 0 ? Math.round((r.offers||0) / r.cnt * 100) : null,
    }));

    const counselorKPI = (d.counselorKPI || []).map(r => ({
      name: r.name,
      student_count: r.students || 0,
      done_tasks: r.done_tasks || 0,
      total_tasks: r.total_tasks || 0,
      overdue: r.overdue_tasks || 0,
    }));

    const templateEff = (d.templateEff || []).map(r => ({
      name: r.name,
      route: r.route,
      total_tasks: r.total_tasks || 0,
      completion_rate: r.total_tasks > 0 ? Math.round((r.done_tasks||0) / r.total_tasks * 100) : null,
    }));

    mc.innerHTML = `
    <div class="page-header">
      <h4 class="mb-0"><i class="bi bi-bar-chart-line-fill me-2 text-primary"></i>数据分析</h4>
    </div>

    <!-- KPI Cards -->
    <div class="row g-3 mb-4">
      <div class="col-md-3">
        <div class="card text-center border-0 bg-primary bg-opacity-10">
          <div class="card-body">
            <div class="fs-2 fw-bold text-primary">${offerRate != null ? offerRate + '%' : '—'}</div>
            <div class="text-muted small">整体录取率</div>
            <div class="small">${ar.offers||0} Offer / ${ar.total||0} 申请</div>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center border-0 bg-success bg-opacity-10">
          <div class="card-body">
            <div class="fs-2 fw-bold text-success">${doneTasks}</div>
            <div class="text-muted small">已完成任务</div>
            <div class="small">共 ${totalTasks} 任务</div>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center border-0 bg-danger bg-opacity-10">
          <div class="card-body">
            <div class="fs-2 fw-bold text-danger">${overdueTasks}</div>
            <div class="text-muted small">逾期任务</div>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center border-0 bg-warning bg-opacity-10">
          <div class="card-body">
            <div class="fs-2 fw-bold text-warning">${pendingTasks}</div>
            <div class="text-muted small">待处理任务</div>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-4">
      <!-- 任务类别分布 -->
      <div class="col-md-4">
        <div class="card">
          <div class="card-header fw-semibold"><i class="bi bi-pie-chart me-1 text-info"></i>任务分类分布</div>
          <div class="card-body p-0">
            ${taskStats.length===0 ? '<p class="text-center text-muted py-3 small">暂无数据</p>' :
            `<table class="table table-sm mb-0">
              <thead class="table-light"><tr><th>分类</th><th class="text-end">完成</th><th class="text-end">总计</th></tr></thead>
              <tbody>${taskStats.map(r=>`<tr>
                <td>${r.category||'其他'}</td>
                <td class="text-end text-success">${r.done||0}</td>
                <td class="text-end">${r.total||0}</td>
              </tr>`).join('')}</tbody>
            </table>`}
          </div>
        </div>
      </div>

      <!-- 申请路线分布 -->
      <div class="col-md-4">
        <div class="card">
          <div class="card-header fw-semibold"><i class="bi bi-globe me-1 text-success"></i>申请路线分布</div>
          <div class="card-body p-0">
            ${routeStats.length===0 ? '<p class="text-center text-muted py-3 small">暂无数据</p>' :
            `<table class="table table-sm mb-0">
              <thead class="table-light"><tr><th>路线</th><th class="text-end">申请数</th><th class="text-end">录取率</th></tr></thead>
              <tbody>${routeStats.map(r=>`<tr>
                <td>${r.route||'—'}</td>
                <td class="text-end">${r.total}</td>
                <td class="text-end">${r.rate!=null?r.rate+'%':'—'}</td>
              </tr>`).join('')}</tbody>
            </table>`}
          </div>
        </div>
      </div>

      <!-- 规划师绩效 -->
      <div class="col-md-4">
        <div class="card">
          <div class="card-header fw-semibold"><i class="bi bi-person-lines-fill me-1 text-warning"></i>规划师绩效</div>
          <div class="card-body p-0">
            ${counselorKPI.length===0 ? '<p class="text-center text-muted py-3 small">暂无数据</p>' :
            `<table class="table table-sm mb-0">
              <thead class="table-light"><tr><th>规划师</th><th class="text-end">学生数</th><th class="text-end">已完成</th><th class="text-end">逾期</th></tr></thead>
              <tbody>${counselorKPI.map(r=>`<tr>
                <td>${r.name||'—'}</td>
                <td class="text-end">${r.student_count}</td>
                <td class="text-end text-success">${r.done_tasks}</td>
                <td class="text-end ${r.overdue>0?'text-danger':''}">${r.overdue}</td>
              </tr>`).join('')}</tbody>
            </table>`}
          </div>
        </div>
      </div>
    </div>

    <!-- 模板效果 -->
    <div class="card mb-4">
      <div class="card-header fw-semibold"><i class="bi bi-diagram-3 me-1 text-primary"></i>时间线模板效果</div>
      <div class="card-body p-0">
        ${templateEff.length===0 ? '<p class="text-center text-muted py-3 small">暂无数据</p>' :
        `<div class="table-responsive">
          <table class="table table-sm mb-0">
            <thead class="table-light"><tr><th>模板名称</th><th>路线</th><th class="text-end">生成任务</th><th class="text-end">完成率</th></tr></thead>
            <tbody>${templateEff.map(r=>`<tr>
              <td>${r.name||'—'}</td>
              <td class="small text-muted">${r.route||'—'}</td>
              <td class="text-end">${r.total_tasks}</td>
              <td class="text-end ${(r.completion_rate||0)>=80?'text-success':(r.completion_rate||0)>=50?'text-warning':'text-danger'}">${r.completion_rate!=null?r.completion_rate+'%':'—'}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`}
      </div>
    </div>`;
  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════
//  操作审计页
// ════════════════════════════════════════════════════════
async function renderAuditLog() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `
  <div class="page-header">
    <h4 class="mb-0"><i class="bi bi-clock-history me-2 text-secondary"></i>操作审计日志</h4>
    <div class="d-flex gap-2">
      <button class="btn btn-outline-secondary btn-sm" onclick="exportAuditCSV()"><i class="bi bi-download me-1"></i>导出CSV</button>
    </div>
  </div>
  <div class="card mb-3">
    <div class="card-body py-2">
      <div class="row g-2 align-items-end">
        <div class="col-md-3">
          <label class="form-label small mb-1">操作类型</label>
          <select class="form-select form-select-sm" id="audit-filter-action">
            <option value="">全部</option>
            <option value="CREATE">CREATE（新建）</option>
            <option value="UPDATE">UPDATE（修改）</option>
            <option value="DELETE">DELETE（删除）</option>
            <option value="VOID">VOID（作废）</option>
            <option value="LOGIN">LOGIN（登录）</option>
            <option value="AI_ENHANCE">AI_ENHANCE（AI增强）</option>
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small mb-1">目标类型</label>
          <select class="form-select form-select-sm" id="audit-filter-entity">
            <option value="">全部</option>
            <option value="students">学生</option>
            <option value="applications">申请</option>
            <option value="milestone_tasks">任务</option>
            <option value="material_items">材料</option>
            <option value="personal_statements">个人陈述</option>
            <option value="staff">教职工</option>
            <option value="finance_invoices">账单</option>
            <option value="admission_evaluations">录取评估</option>
            <option value="benchmark_evaluations">基准评估</option>
            <option value="ai_student_plans">AI规划</option>
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-1">开始日期</label>
          <input type="date" class="form-control form-control-sm" id="audit-filter-from">
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-1">结束日期</label>
          <input type="date" class="form-control form-control-sm" id="audit-filter-to">
        </div>
        <div class="col-md-2">
          <button class="btn btn-primary btn-sm w-100" onclick="loadAuditLogs()"><i class="bi bi-search me-1"></i>查询</button>
        </div>
      </div>
    </div>
  </div>
  <div id="audit-log-table"><div class="text-center py-4"><div class="spinner-border text-secondary"></div></div></div>`;
  loadAuditLogs();
}

async function loadAuditLogs() {
  const tableEl = document.getElementById('audit-log-table');
  if (!tableEl) return;
  tableEl.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-secondary"></div></div>';
  try {
    const params = new URLSearchParams();
    const action = document.getElementById('audit-filter-action')?.value.trim();
    const entity = document.getElementById('audit-filter-entity')?.value.trim();
    const from = document.getElementById('audit-filter-from')?.value;
    const to = document.getElementById('audit-filter-to')?.value;
    if (action) params.set('action', action);
    if (entity) params.set('entity_type', entity);
    if (from) params.set('start', from);
    if (to) params.set('end', to);
    params.set('limit', '200');
    const logs = await GET('/api/audit?' + params.toString());
    if (logs.length === 0) {
      tableEl.innerHTML = '<p class="text-center text-muted py-4">暂无日志记录</p>';
      return;
    }
    tableEl.innerHTML = `<div class="table-responsive">
      <table class="table table-sm table-hover">
        <thead class="table-light">
          <tr><th>时间</th><th>操作者</th><th>操作</th><th>目标类型</th><th>目标ID</th><th>变更前</th><th>变更后</th></tr>
        </thead>
        <tbody>
          ${logs.map(l => `<tr>
            <td class="small text-muted text-nowrap">${fmtDatetime(l.created_at)||''}</td>
            <td class="small">${l.user_name||l.username||'—'}</td>
            <td><span class="badge bg-secondary">${l.action}</span></td>
            <td class="small">${l.entity||'—'}</td>
            <td class="small text-muted">${l.entity_id||'—'}</td>
            <td class="small text-muted" style="max-width:150px;overflow:hidden;text-overflow:ellipsis" title="${(l.before_value||'').replace(/"/g,'&quot;')}">${l.before_value||'—'}</td>
            <td class="small text-muted" style="max-width:150px;overflow:hidden;text-overflow:ellipsis" title="${(l.after_value||'').replace(/"/g,'&quot;')}">${l.after_value||'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } catch(e) {
    tableEl.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

function exportAuditCSV() {
  const params = new URLSearchParams();
  const action = document.getElementById('audit-filter-action')?.value.trim();
  const entity = document.getElementById('audit-filter-entity')?.value.trim();
  const from = document.getElementById('audit-filter-from')?.value;
  const to = document.getElementById('audit-filter-to')?.value;
  if (action) params.set('action', action);
  if (entity) params.set('entity_type', entity);
  if (from) params.set('start', from);
  if (to) params.set('end', to);
  window.open('/api/audit/export?' + params.toString(), '_blank');
}

// ════════════════════════════════════════════════════════
//  P1.1 锚点事件管理（settings 页面内调用）
// ════════════════════════════════════════════════════════
async function renderAnchorEventsList() {
  const container = document.getElementById('anchor-events-container');
  if (!container) return;
  container.innerHTML = '<div class="text-center py-2 text-muted small"><div class="spinner-border spinner-border-sm"></div></div>';
  try {
    const events = await GET('/api/anchor-events');
    if (events.length === 0) {
      container.innerHTML = '<p class="text-muted small py-2">暂无锚点事件（内置事件已自动填充）。</p>';
      return;
    }
    container.innerHTML = `<table class="table table-sm">
      <thead class="table-light"><tr><th>类型</th><th>名称</th><th>日期</th><th>来源</th><th></th></tr></thead>
      <tbody>
        ${events.map(e => `<tr>
          <td class="small">${e.anchor_type||'—'}</td>
          <td class="small">${e.name}</td>
          <td class="small">${fmtDate(e.event_date)||'—'}</td>
          <td class="small">${e.source==='builtin'?'<span class="badge bg-light text-dark border">内置</span>':'<span class="badge bg-primary">自定义</span>'}</td>
          <td>${e.source!=='builtin'?`<button class="btn btn-link btn-sm p-0 text-danger" onclick="deleteAnchorEvent('${e.id}')"><i class="bi bi-trash"></i></button>`:'—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  } catch(err) {
    container.innerHTML = `<p class="text-danger small">${err.message}</p>`;
  }
}

async function addAnchorEvent() {
  const type = document.getElementById('new-anchor-type')?.value.trim();
  const name = document.getElementById('new-anchor-name')?.value.trim();
  const date = document.getElementById('new-anchor-date')?.value;
  if (!type || !name || !date) { showError('类型、名称、日期均必填'); return; }
  try {
    await POST('/api/anchor-events', { anchor_type: type, name, event_date: date, source: 'custom' });
    showSuccess('锚点事件已添加');
    document.getElementById('new-anchor-type').value = '';
    document.getElementById('new-anchor-name').value = '';
    document.getElementById('new-anchor-date').value = '';
    renderAnchorEventsList();
  } catch(e) { showError(e.message); }
}

async function deleteAnchorEvent(id) {
  confirmAction('确定删除此锚点事件？', async () => {
    try {
      await DEL(`/api/anchor-events/${id}`);
      showSuccess('已删除');
      renderAnchorEventsList();
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

// ════════════════════════════════════════════════════════
//  升级政策 UI（settings 页面内）
// ════════════════════════════════════════════════════════
async function loadEscalationPolicy() {
  const container = document.getElementById('escalation-policy-container');
  if (!container) return;
  try {
    const policies = await GET('/api/escalation-policies');
    const p = policies[0];
    if (!p) { container.innerHTML = '<p class="text-muted small">暂无升级政策。</p>'; return; }
    const triggerDays = JSON.parse(p.trigger_days || '[]');
    container.innerHTML = `
    <div class="row g-3">
      <div class="col-md-6">
        <label class="form-label fw-semibold">触发天数（逗号分隔，负数=逾期后）</label>
        <input class="form-control" id="esc-trigger-days" value="${triggerDays.join(',')}" placeholder="-30,-14,-3,1,3">
        <div class="form-text">负数=截止前N天，正数=逾期后N天</div>
      </div>
      <div class="col-md-4">
        <label class="form-label fw-semibold">目标角色</label>
        <select class="form-select" id="esc-target-role">
          <option value="counselor" ${p.target_role==='counselor'?'selected':''}>规划师</option>
          <option value="principal" ${p.target_role==='principal'?'selected':''}>校长</option>
          <option value="mentor" ${p.target_role==='mentor'?'selected':''}>导师</option>
        </select>
      </div>
      <div class="col-md-2 d-flex align-items-end">
        <button class="btn btn-primary w-100" onclick="saveEscalationPolicy('${p.id}')">保存</button>
      </div>
    </div>`;
  } catch(e) {
    if (container) container.innerHTML = `<p class="text-danger small">${escapeHtml(e.message)}</p>`;
  }
}

async function saveEscalationPolicy(policyId) {
  if (!acquireSubmit('saveEscalationPolicy')) return;
  const daysStr = document.getElementById('esc-trigger-days')?.value || '';
  const triggerDays = daysStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  const targetRole = document.getElementById('esc-target-role')?.value;
  try {
    await PUT(`/api/escalation-policies/${policyId}`, { trigger_days: triggerDays, target_role: targetRole });
    showSuccess('升级政策已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveEscalationPolicy'); }
}

// ════════════════════════════════════════════════════════
//  P1.3 申请路线扩展字段
// ════════════════════════════════════════════════════════
async function loadAppExtFields(appId, route) {
  const container = document.getElementById('app-ext-fields');
  if (!container) return;
  container.innerHTML = '';
  if (!route) return;
  // Load existing ext data when editing; empty object for new applications
  let data = {};
  if (appId) {
    try {
      const ext = await GET(`/api/applications/${appId}/ext`);
      data = ext || {};
    } catch(e) {} // ext might not exist yet, that's fine
  }
  try {
    if (route === 'UK-UG') {
      container.innerHTML = `
        <div class="col-12"><hr class="my-2"><div class="fw-semibold small text-muted mb-2">UK-UG 专属字段</div></div>
        <div class="col-md-6">
          <label class="form-label small">UCAS 申请人ID</label>
          <input class="form-control form-control-sm" id="ext-ucas-id" value="${data.ucas_personal_id||''}">
        </div>
        <div class="col-md-6">
          <label class="form-label small">志愿序号 (1–5)</label>
          <input type="number" class="form-control form-control-sm" id="ext-choice-number" min="1" max="5" value="${data.ucas_choice_number||''}">
        </div>
        <div class="col-md-6">
          <label class="form-label small">推荐信状态</label>
          <select class="form-select form-select-sm" id="ext-ref-status">
            <option value="">—</option>
            <option ${data.reference_status==='pending'?'selected':''}>pending</option>
            <option ${data.reference_status==='submitted'?'selected':''}>submitted</option>
            <option ${data.reference_status==='confirmed'?'selected':''}>confirmed</option>
          </select>
        </div>`;
    } else if (route === 'US') {
      container.innerHTML = `
        <div class="col-12"><hr class="my-2"><div class="fw-semibold small text-muted mb-2">US 专属字段</div></div>
        <div class="col-md-6">
          <label class="form-label small">申请类型</label>
          <select class="form-select form-select-sm" id="ext-app-type">
            <option value="">—</option>
            <option ${data.app_type==='ED'?'selected':''}>ED</option>
            <option ${data.app_type==='EA'?'selected':''}>EA</option>
            <option ${data.app_type==='RD'?'selected':''}>RD</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label small">申请平台</label>
          <input class="form-control form-control-sm" id="ext-platform" value="${data.platform||''}" placeholder="CommonApp / Coalition">
        </div>
        <div class="col-md-6">
          <label class="form-label small">具有约束力？</label>
          <select class="form-select form-select-sm" id="ext-binding">
            <option value="0" ${!data.is_binding?'selected':''}>否</option>
            <option value="1" ${data.is_binding?'selected':''}>是</option>
          </select>
        </div>`;
    } else if (route && route.startsWith('SG')) {
      container.innerHTML = `
        <div class="col-12"><hr class="my-2"><div class="fw-semibold small text-muted mb-2">SG 专属字段</div></div>
        <div class="col-md-6">
          <label class="form-label small">申请门户</label>
          <input class="form-control form-control-sm" id="ext-portal" value="${data.portal_name||''}">
        </div>
        <div class="col-md-6">
          <label class="form-label small">面试形式</label>
          <select class="form-select form-select-sm" id="ext-interview-status">
            <option value="">—</option>
            <option ${data.interview_format==='online'?'selected':''} value="online">线上</option>
            <option ${data.interview_format==='in-person'?'selected':''} value="in-person">现场</option>
            <option ${data.interview_format==='portfolio-review'?'selected':''} value="portfolio-review">作品集</option>
          </select>
        </div>`;
    }
  } catch(e) {} // unexpected error
}

async function saveAppExtFields(appId, route) {
  if (!appId) return;
  const body = {};
  if (route === 'UK-UG') {
    body.ucas_personal_id = document.getElementById('ext-ucas-id')?.value.trim() || null;
    body.ucas_choice_number = parseInt(document.getElementById('ext-choice-number')?.value) || null;
    body.reference_status = document.getElementById('ext-ref-status')?.value || null;
  } else if (route === 'US') {
    body.app_type = document.getElementById('ext-app-type')?.value || null;
    body.platform = document.getElementById('ext-platform')?.value.trim() || null;
    body.is_binding = document.getElementById('ext-binding')?.value === '1' ? 1 : 0;
  } else if (route && route.startsWith('SG')) {
    body.portal_name = document.getElementById('ext-portal')?.value.trim() || null;
    const interviewFormat = document.getElementById('ext-interview-status')?.value || null;
    body.interview_required = interviewFormat ? 1 : 0;
    body.interview_format = interviewFormat;
  }
  if (Object.keys(body).length > 0) {
    try { await PUT(`/api/applications/${appId}/ext`, body); } catch(e) {}
  }
}

// ════════════════════════════════════════════════════════
//  录取评估库管理页
// ════════════════════════════════════════════════════════
async function renderAdmissionPrograms() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;

  try {
    const [programs, benchmarks] = await Promise.all([
      GET('/api/uni-programs'),
      GET('/api/eval-benchmarks').catch(() => [])
    ]);
    const canEdit = hasRole('principal', 'counselor');

    // 按国家分组
    const byCountry = {};
    programs.forEach(p => {
      const c = p.country || '其他';
      if (!byCountry[c]) byCountry[c] = [];
      byCountry[c].push(p);
    });

    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-mortarboard-fill me-2 text-primary"></i>录取评估库</h4>
    </div>

    <!-- 两个 Tab -->
    <ul class="nav nav-tabs mb-3" id="eval-lib-tabs">
      <li class="nav-item">
        <a class="nav-link active" data-bs-toggle="tab" href="#tab-uni-programs">
          <i class="bi bi-building me-1"></i>院校专业库
          <span class="badge bg-primary ms-1">${programs.length}</span>
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link" data-bs-toggle="tab" href="#tab-benchmarks">
          <i class="bi bi-bar-chart-steps me-1"></i>基准评估库
          <span class="badge bg-info ms-1">${benchmarks.length}</span>
        </a>
      </li>
    </ul>

    <div class="tab-content">
      <!-- 院校专业库 Tab -->
      <div class="tab-pane fade show active" id="tab-uni-programs">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="d-flex gap-2">
            <input type="text" class="form-control form-control-sm" id="prog-search" placeholder="搜索院校/专业..." style="width:220px" oninput="filterPrograms(this.value)">
          </div>
          ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="openUniProgramModal()"><i class="bi bi-plus me-1"></i>新增专业</button>` : ''}
        </div>
        <div class="row g-3 mb-3">
          <div class="col-md-3">
            <div class="stat-card bg-primary text-white">
              <div class="stat-icon"><i class="bi bi-building"></i></div>
              <div class="stat-value">${programs.length}</div>
              <div class="stat-label">专业条目</div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="stat-card bg-info text-white">
              <div class="stat-icon"><i class="bi bi-flag"></i></div>
              <div class="stat-value">${Object.keys(byCountry).length}</div>
              <div class="stat-label">覆盖国家/地区</div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="stat-card bg-success text-white">
              <div class="stat-icon"><i class="bi bi-graph-up"></i></div>
              <div class="stat-value">${programs.filter(p => p.hist_applicants).length}</div>
              <div class="stat-label">有历史数据</div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="stat-card bg-warning text-dark">
              <div class="stat-icon"><i class="bi bi-calendar-check"></i></div>
              <div class="stat-value">${programs.filter(p => p.ucas_early_deadline).length}</div>
              <div class="stat-label">早截止专业</div>
            </div>
          </div>
        </div>
        <div id="prog-list-container">
          ${renderProgramCards(programs, canEdit)}
        </div>
      </div>

      <!-- 基准评估库 Tab -->
      <div class="tab-pane fade" id="tab-benchmarks">
        <div id="benchmark-lib-container"></div>
      </div>
    </div>
    `;

    // Store for filtering
    window._allPrograms = programs;
    window._canEditPrograms = canEdit;

    // Init benchmark tab on first show
    const bmTabEl = document.querySelector('a[href="#tab-benchmarks"]');
    if (bmTabEl) {
      bmTabEl.addEventListener('shown.bs.tab', () => renderBenchmarkLibraryTab(canEdit), { once: true });
    }

  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

function filterPrograms(q) {
  if (!window._allPrograms) return;
  const filtered = q ? window._allPrograms.filter(p =>
    (p.uni_name||'').toLowerCase().includes(q.toLowerCase()) ||
    (p.program_name||'').toLowerCase().includes(q.toLowerCase()) ||
    (p.department||'').toLowerCase().includes(q.toLowerCase())
  ) : window._allPrograms;
  document.getElementById('prog-list-container').innerHTML = renderProgramCards(filtered, window._canEditPrograms);
}

function renderProgramCards(programs, canEdit) {
  if (!programs.length) return '<div class="text-center text-muted py-5"><i class="bi bi-inbox display-4 d-block mb-2"></i>暂无专业条目，点击"新增专业"开始录入。</div>';

  const byCountry = {};
  programs.forEach(p => {
    const c = p.country || '其他';
    if (!byCountry[c]) byCountry[c] = [];
    byCountry[c].push(p);
  });

  const countryIcon = { 'UK': '🇬🇧', 'US': '🇺🇸', 'SG': '🇸🇬', 'CA': '🇨🇦', 'AU': '🇦🇺' };

  return Object.entries(byCountry).map(([country, progs]) => `
    <div class="mb-4">
      <h6 class="fw-bold text-muted mb-2">${countryIcon[country]||'🌍'} ${escapeHtml(country)} <span class="badge bg-secondary ms-1">${progs.length}</span></h6>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>院校</th><th>专业/项目</th><th>通道</th><th>学术要求</th>
              <th>语言要求</th><th>截止日期</th><th>历史录取率</th>
              ${canEdit ? '<th>操作</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${progs.map(p => {
              const gradeReqs = (() => { try { return JSON.parse(p.grade_requirements||'[]'); } catch(e) { return []; } })();
              const gradeStr = gradeReqs.length
                ? gradeReqs.map(r => `${r.subject||'?'}≥${r.min_grade||'?'}${r.required?'*':''}`).join(', ')
                : '—';
              const langStr = p.ielts_overall ? `IELTS≥${p.ielts_overall}` : p.toefl_overall ? `TOEFL≥${p.toefl_overall}` : '—';
              const rateStr = p.hist_offer_rate != null ? `${Math.round(p.hist_offer_rate*100)}%` : '—';
              const confBadge = p.hist_applicants >= 20 ? 'success' : p.hist_applicants >= 5 ? 'warning' : 'secondary';
              return `<tr>
                <td class="fw-semibold">${escapeHtml(p.uni_name)}</td>
                <td>${escapeHtml(p.program_name)}${p.department ? `<br><small class="text-muted">${escapeHtml(p.department)}</small>` : ''}</td>
                <td><span class="badge bg-info text-dark">${escapeHtml(p.route||'—')}</span>${p.ucas_early_deadline ? ' <span class="badge bg-danger">早截止</span>' : ''}</td>
                <td class="small">${escapeHtml(gradeStr)}</td>
                <td class="small">${escapeHtml(langStr)}</td>
                <td class="small">${p.app_deadline ? fmtDate(p.app_deadline) + (p.app_deadline_time ? ' '+escapeHtml(p.app_deadline_time) : '') : '—'}</td>
                <td>${rateStr !== '—' ? `<span class="badge bg-${confBadge}">${rateStr}</span><small class="text-muted ms-1">(n=${p.hist_applicants||0})</small>` : '<span class="text-muted small">—</span>'}</td>
                ${canEdit ? `<td>
                  <button class="btn btn-outline-primary btn-xs me-1" onclick="openUniProgramModal('${p.id}')"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-outline-danger btn-xs" data-pid="${escapeHtml(p.id)}" data-pname="${escapeHtml(p.uni_name+' '+p.program_name)}" onclick="deleteUniProgram(this.dataset.pid,this.dataset.pname)"><i class="bi bi-trash"></i></button>
                </td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');
}

// ── 专业编辑模态框 ────────────────────────────────────
let _gradeReqRows = [];
let _extraTestRows = [];

async function openUniProgramModal(id = null) {
  _gradeReqRows = [];
  _extraTestRows = [];
  document.getElementById('up-id').value = '';
  document.getElementById('up-uni-name').value = '';
  document.getElementById('up-program-name').value = '';
  document.getElementById('up-department').value = '';
  document.getElementById('up-country').value = 'UK';
  document.getElementById('up-route').value = 'UK-UG';
  document.getElementById('up-cycle-year').value = '';
  document.getElementById('up-deadline').value = '';
  document.getElementById('up-deadline-time').value = '';
  document.getElementById('up-deadline-tz').value = 'Europe/London';
  document.getElementById('up-early-deadline').checked = false;
  document.getElementById('up-notes').value = '';
  document.getElementById('up-grade-type').value = 'A-Level';
  document.getElementById('up-min-subjects').value = '3';
  document.getElementById('up-ielts').value = '';
  document.getElementById('up-ielts-comp').value = '';
  document.getElementById('up-toefl').value = '';
  document.getElementById('up-duolingo').value = '';
  document.getElementById('up-ref-required').checked = false;
  document.getElementById('up-ref-notes').value = '';
  document.getElementById('up-w-academic').value = '0.6';
  document.getElementById('up-w-language').value = '0.25';
  document.getElementById('up-w-extra').value = '0.15';
  document.getElementById('up-hist-year').value = '';
  document.getElementById('up-hist-applicants').value = '';
  document.getElementById('up-hist-offers').value = '';
  document.getElementById('up-hist-rate').value = '';
  document.getElementById('up-hist-avg-grade').value = '';
  renderGradeReqList();
  renderExtraTestList();

  if (id) {
    document.getElementById('uni-program-modal-title').textContent = '编辑院校专业';
    try {
      const p = await GET(`/api/uni-programs/${id}`);
      document.getElementById('up-id').value = p.id;
      document.getElementById('up-uni-name').value = p.uni_name || '';
      document.getElementById('up-program-name').value = p.program_name || '';
      document.getElementById('up-department').value = p.department || '';
      document.getElementById('up-country').value = p.country || 'UK';
      document.getElementById('up-route').value = p.route || 'UK-UG';
      document.getElementById('up-cycle-year').value = p.cycle_year || '';
      document.getElementById('up-deadline').value = p.app_deadline || '';
      document.getElementById('up-deadline-time').value = p.app_deadline_time || '';
      document.getElementById('up-deadline-tz').value = p.app_deadline_tz || 'Europe/London';
      document.getElementById('up-early-deadline').checked = !!p.ucas_early_deadline;
      document.getElementById('up-notes').value = p.notes || '';
      document.getElementById('up-grade-type').value = p.grade_type || 'A-Level';
      document.getElementById('up-min-subjects').value = p.min_subjects || 3;
      document.getElementById('up-ielts').value = p.ielts_overall || '';
      document.getElementById('up-ielts-comp').value = p.ielts_min_component || '';
      document.getElementById('up-toefl').value = p.toefl_overall || '';
      document.getElementById('up-duolingo').value = p.duolingo_min || '';
      document.getElementById('up-ref-required').checked = !!p.reference_required;
      document.getElementById('up-ref-notes').value = p.reference_notes || '';
      document.getElementById('up-w-academic').value = p.weight_academic || 0.6;
      document.getElementById('up-w-language').value = p.weight_language || 0.25;
      document.getElementById('up-w-extra').value = p.weight_extra || 0.15;
      document.getElementById('up-hist-year').value = p.hist_data_year || '';
      document.getElementById('up-hist-applicants').value = p.hist_applicants || '';
      document.getElementById('up-hist-offers').value = p.hist_offers || '';
      document.getElementById('up-hist-rate').value = p.hist_offer_rate != null ? (Math.round(p.hist_offer_rate*1000)/10)+'%' : '';
      document.getElementById('up-hist-avg-grade').value = p.hist_avg_grade || '';
      _gradeReqRows = (() => { try { return JSON.parse(p.grade_requirements||'[]'); } catch(e) { return []; } })();
      _extraTestRows = (() => { try { return JSON.parse(p.extra_tests||'[]'); } catch(e) { return []; } })();
      renderGradeReqList();
      renderExtraTestList();
    } catch(e) { showError('加载专业信息失败'); return; }
  } else {
    document.getElementById('uni-program-modal-title').textContent = '新增院校专业';
  }

  // auto-calculate offer rate
  ['up-hist-applicants', 'up-hist-offers'].forEach(fid => {
    document.getElementById(fid).addEventListener('input', () => {
      const apps = parseInt(document.getElementById('up-hist-applicants').value) || 0;
      const offs = parseInt(document.getElementById('up-hist-offers').value) || 0;
      document.getElementById('up-hist-rate').value = apps > 0 ? (Math.round(offs/apps*1000)/10)+'%' : '';
    });
  });

  document.getElementById('save-uni-program-btn').onclick = saveUniProgram;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('uni-program-modal')).show();
}

function addGradeRequirement() {
  _gradeReqRows.push({ subject: '', min_grade: 'A', required: true, notes: '' });
  renderGradeReqList();
}

function removeGradeReq(idx) {
  _gradeReqRows.splice(idx, 1);
  renderGradeReqList();
}

function renderGradeReqList() {
  const container = document.getElementById('grade-req-list');
  if (!_gradeReqRows.length) {
    container.innerHTML = '<p class="text-muted small">点击「添加科目要求」来设置每个科目的最低等级。</p>';
    return;
  }
  container.innerHTML = _gradeReqRows.map((r, i) => `
    <div class="row g-2 align-items-center mb-2 border rounded p-2">
      <div class="col-md-4">
        <input type="text" class="form-control form-control-sm" placeholder="科目名 如 Mathematics" value="${r.subject||''}"
          oninput="_gradeReqRows[${i}].subject=this.value">
      </div>
      <div class="col-md-2">
        <select class="form-select form-select-sm" onchange="_gradeReqRows[${i}].min_grade=this.value">
          ${['A*','A','B','C','D','E'].map(g => `<option ${r.min_grade===g?'selected':''}>${g}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-3">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="req-required-${i}" ${r.required?'checked':''}
            onchange="_gradeReqRows[${i}].required=this.checked">
          <label class="form-check-label small" for="req-required-${i}">必修（硬门槛）</label>
        </div>
      </div>
      <div class="col-md-2">
        <input type="text" class="form-control form-control-sm" placeholder="备注" value="${r.notes||''}"
          oninput="_gradeReqRows[${i}].notes=this.value">
      </div>
      <div class="col-md-1 text-end">
        <button class="btn btn-outline-danger btn-sm" onclick="removeGradeReq(${i})"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  `).join('');
}

function addExtraTest() {
  _extraTestRows.push({ test: '', required: true, min_score: '', deadline: '', notes: '' });
  renderExtraTestList();
}

function removeExtraTest(idx) {
  _extraTestRows.splice(idx, 1);
  renderExtraTestList();
}

function renderExtraTestList() {
  const container = document.getElementById('extra-test-list');
  if (!_extraTestRows.length) {
    container.innerHTML = '<p class="text-muted small">如 LNAT、Writing Test、Design Challenge 等。</p>';
    return;
  }
  container.innerHTML = _extraTestRows.map((r, i) => `
    <div class="row g-2 align-items-center mb-2 border rounded p-2">
      <div class="col-md-3">
        <input type="text" class="form-control form-control-sm" placeholder="测试名称 如 LNAT" value="${r.test||''}"
          oninput="_extraTestRows[${i}].test=this.value">
      </div>
      <div class="col-md-2">
        <input type="number" class="form-control form-control-sm" placeholder="最低分" value="${r.min_score||''}"
          oninput="_extraTestRows[${i}].min_score=this.value">
      </div>
      <div class="col-md-2">
        <input type="date" class="form-control form-control-sm" value="${r.deadline||''}"
          oninput="_extraTestRows[${i}].deadline=this.value" title="测试截止日期">
      </div>
      <div class="col-md-2">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="et-required-${i}" ${r.required?'checked':''}
            onchange="_extraTestRows[${i}].required=this.checked">
          <label class="form-check-label small" for="et-required-${i}">必须</label>
        </div>
      </div>
      <div class="col-md-2">
        <input type="text" class="form-control form-control-sm" placeholder="备注" value="${r.notes||''}"
          oninput="_extraTestRows[${i}].notes=this.value">
      </div>
      <div class="col-md-1 text-end">
        <button class="btn btn-outline-danger btn-sm" onclick="removeExtraTest(${i})"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  `).join('');
}

async function saveUniProgram() {
  if (!acquireSubmit('saveUniProgram')) return;
  const id = document.getElementById('up-id').value;
  const apps = parseInt(document.getElementById('up-hist-applicants').value) || null;
  const offs = parseInt(document.getElementById('up-hist-offers').value) || null;
  const body = {
    uni_name: document.getElementById('up-uni-name').value.trim(),
    program_name: document.getElementById('up-program-name').value.trim(),
    department: document.getElementById('up-department').value.trim() || null,
    country: document.getElementById('up-country').value,
    route: document.getElementById('up-route').value,
    cycle_year: parseInt(document.getElementById('up-cycle-year').value) || null,
    app_deadline: document.getElementById('up-deadline').value || null,
    app_deadline_time: document.getElementById('up-deadline-time').value.trim() || null,
    app_deadline_tz: document.getElementById('up-deadline-tz').value.trim() || 'Europe/London',
    ucas_early_deadline: document.getElementById('up-early-deadline').checked ? 1 : 0,
    notes: document.getElementById('up-notes').value.trim() || null,
    grade_type: document.getElementById('up-grade-type').value,
    min_subjects: parseInt(document.getElementById('up-min-subjects').value) || 3,
    grade_requirements: _gradeReqRows,
    ielts_overall: parseFloat(document.getElementById('up-ielts').value) || null,
    ielts_min_component: parseFloat(document.getElementById('up-ielts-comp').value) || null,
    toefl_overall: parseInt(document.getElementById('up-toefl').value) || null,
    duolingo_min: parseInt(document.getElementById('up-duolingo').value) || null,
    extra_tests: _extraTestRows,
    reference_required: document.getElementById('up-ref-required').checked ? 1 : 0,
    reference_notes: document.getElementById('up-ref-notes').value.trim() || null,
    weight_academic: parseFloat(document.getElementById('up-w-academic').value) || 0.6,
    weight_language: parseFloat(document.getElementById('up-w-language').value) || 0.25,
    weight_extra: parseFloat(document.getElementById('up-w-extra').value) || 0.15,
    hist_data_year: parseInt(document.getElementById('up-hist-year').value) || null,
    hist_applicants: apps,
    hist_offers: offs,
    hist_offer_rate: apps && offs ? offs/apps : null,
    hist_avg_grade: document.getElementById('up-hist-avg-grade').value.trim() || null,
  };
  if (!body.uni_name || !body.program_name) { releaseSubmit('saveUniProgram'); showError('院校名和专业名必填'); return; }
  try {
    if (id) { await PUT(`/api/uni-programs/${id}`, body); }
    else { await POST('/api/uni-programs', body); }
    bootstrap.Modal.getInstance(document.getElementById('uni-program-modal'))?.hide();
    showSuccess('保存成功');
    renderAdmissionPrograms();
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveUniProgram'); }
}

async function deleteUniProgram(id, name) {
  confirmAction(`确定删除「${name}」？`, async () => {
    try {
      await DEL(`/api/uni-programs/${id}`);
      showSuccess('已删除');
      renderAdmissionPrograms();
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

// ── 学生录取评估 ──────────────────────────────────────
async function loadAdmissionEvals(studentId) {
  const container = document.getElementById('admission-evals-container');
  if (!container) return;
  try {
    const evals = await GET(`/api/students/${studentId}/admission-evals`);
    if (!evals.length) {
      container.innerHTML = `<div class="text-center text-muted py-4">
        <i class="bi bi-mortarboard display-4 d-block mb-2"></i>
        暂无评估记录。点击"运行新评估"选择目标专业进行匹配分析。
      </div>`;
      return;
    }
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>院校 / 专业</th><th>通道</th><th>硬门槛</th>
              <th>学术</th><th>语言</th><th>综合分</th>
              <th>录取概率区间</th><th>置信度</th><th>评估时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${evals.map(e => {
              const passEl = e.hard_pass ? '<span class="badge bg-success">通过</span>' : '<span class="badge bg-danger">未通过</span>';
              const probEl = e.prob_mid != null
                ? `<span class="text-muted small">${e.prob_low}%</span> — <strong class="text-primary">${e.prob_mid}%</strong> — <span class="text-muted small">${e.prob_high}%</span>`
                : '—';
              const confMap = { high: ['success','高'], medium: ['warning','中'], low: ['secondary','低'] };
              const [cc, cl] = confMap[e.confidence] || ['secondary', '—'];
              const scoreColor = e.score_total >= 75 ? 'success' : e.score_total >= 55 ? 'warning' : 'danger';
              return `<tr>
                <td>
                  <div class="fw-semibold">${escapeHtml(e.uni_name)}</div>
                  <div class="small text-muted">${escapeHtml(e.program_name)}${e.department ? ' · '+escapeHtml(e.department) : ''}</div>
                </td>
                <td><span class="badge bg-info text-dark">${escapeHtml(e.route||'—')}</span></td>
                <td>${passEl}</td>
                <td><span class="badge bg-secondary">${e.score_academic||0}</span></td>
                <td><span class="badge bg-secondary">${e.score_language||0}</span></td>
                <td><span class="badge bg-${scoreColor}">${e.score_total||0}</span></td>
                <td class="text-nowrap">${probEl}</td>
                <td><span class="badge bg-${cc}">${cl}</span></td>
                <td class="small text-muted">${fmtDate(e.created_at)}</td>
                <td class="text-nowrap">
                  <button class="btn btn-outline-primary btn-xs me-1" onclick="showEvalDetail('${e.id}')"><i class="bi bi-eye"></i></button>
                  <button class="btn btn-outline-danger btn-xs" data-eid="${escapeHtml(e.id)}" data-elabel="${escapeHtml(e.uni_name+' / '+e.program_name)}" data-esid="${escapeHtml(studentId)}" onclick="deleteAdmissionEval(this.dataset.eid,this.dataset.elabel,this.dataset.esid)"><i class="bi bi-trash"></i></button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

async function deleteAdmissionEval(evalId, label, studentId) {
  confirmAction(`确定删除评估记录「${label}」？此操作不可恢复。`, async () => {
    try {
      await DEL(`/api/admission-evals/${evalId}`);
      loadAdmissionEvals(studentId);
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

async function openAdmissionEvalModal(studentId) {
  try {
    const programs = await GET('/api/uni-programs');
    if (!programs.length) {
      showError('录取评估库为空，请先在「录取评估库」页面录入专业要求');
      return;
    }

    // Build a simple select modal using confirm dialog as base
    const body = `
      <div class="mb-3">
        <label class="form-label fw-semibold">选择目标专业</label>
        <select class="form-select" id="eval-prog-select">
          <option value="">— 请选择 —</option>
          ${programs.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.uni_name)} — ${escapeHtml(p.program_name)} (${escapeHtml(p.country)})</option>`).join('')}
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label">备注（可选）</label>
        <input type="text" class="form-control" id="eval-notes" placeholder="评估备注...">
      </div>
      <div class="alert alert-info small py-2">
        评估将基于学生当前的考试成绩和测评记录进行计算。请确保成绩数据已录入。
      </div>
    `;

    document.getElementById('confirm-body').innerHTML = body;
    document.getElementById('confirm-ok').textContent = '运行评估';
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('confirm-modal'));
    modal.show();
    document.getElementById('confirm-ok').onclick = async () => {
      const programId = document.getElementById('eval-prog-select').value;
      const notes = document.getElementById('eval-notes').value.trim();
      if (!programId) { showError('请选择目标专业'); return; }
      modal.hide();
      // Reset button text
      document.getElementById('confirm-ok').textContent = '确定';
      document.getElementById('confirm-body').textContent = '确定执行此操作？';
      try {
        const result = await POST(`/api/students/${studentId}/admission-eval`, { program_id: programId, notes });
        showSuccess('评估完成');
        loadAdmissionEvals(studentId);
        showEvalDetail(result.id);
      } catch(e) { showError(e.message); }
    };
    // Reset on close — remove previous handler before adding new one to avoid accumulation
    const _confirmModalEl = document.getElementById('confirm-modal');
    if (_confirmModalEl._evalResetHandler) {
      _confirmModalEl.removeEventListener('hidden.bs.modal', _confirmModalEl._evalResetHandler);
    }
    const _resetHandler = () => {
      document.getElementById('confirm-ok').textContent = '确定';
      document.getElementById('confirm-body').textContent = '确定执行此操作？';
      delete _confirmModalEl._evalResetHandler;
    };
    _confirmModalEl._evalResetHandler = _resetHandler;
    _confirmModalEl.addEventListener('hidden.bs.modal', _resetHandler, { once: true });
  } catch(e) { showError(e.message); }
}

async function showEvalDetail(evalId) {
  try {
    const ev = await GET(`/api/admission-evals/${evalId}`);
    const gaps = (() => { try { return JSON.parse(ev.gaps||'[]'); } catch(e) { return []; } })();
    const hardFails = (() => { try { return JSON.parse(ev.hard_fails||'[]'); } catch(e) { return []; } })();

    const probBar = (low, mid, high) => {
      if (mid == null) return '—';
      const color = mid >= 60 ? '#198754' : mid >= 35 ? '#fd7e14' : '#dc3545';
      return `
        <div class="mb-1">
          <div style="background:#e9ecef;border-radius:8px;height:24px;position:relative;overflow:hidden;">
            <div style="background:${color};opacity:0.25;position:absolute;left:${low}%;width:${high-low}%;height:100%;"></div>
            <div style="background:${color};position:absolute;left:${mid-1}%;width:3px;height:100%;border-radius:2px;"></div>
          </div>
          <div class="d-flex justify-content-between mt-1">
            <small class="text-muted">保守 ${low}%</small>
            <strong style="color:${color}">${mid}%</strong>
            <small class="text-muted">乐观 ${high}%</small>
          </div>
        </div>`;
    };

    const scoreRing = (score, label) => {
      const color = score >= 75 ? '#198754' : score >= 55 ? '#fd7e14' : '#dc3545';
      return `<div class="text-center">
        <div style="width:60px;height:60px;border-radius:50%;border:4px solid ${color};display:flex;align-items:center;justify-content:center;margin:0 auto;">
          <strong style="color:${color}">${score||0}</strong>
        </div>
        <div class="small text-muted mt-1">${label}</div>
      </div>`;
    };

    const confMap = { high: ['success','高 (数据充足)'], medium: ['warning text-dark','中 (数据有限)'], low: ['secondary','低 (数据不足)'] };
    const [cc, cl] = confMap[ev.confidence] || ['secondary','—'];

    document.getElementById('eval-result-body').innerHTML = `
      <div class="mb-3">
        <h6 class="fw-bold">${ev.uni_name}</h6>
        <div class="text-muted small">${ev.program_name}${ev.department ? ' · '+ev.department : ''} · ${ev.route||'—'} · 评估时间: ${fmtDate(ev.created_at)}</div>
      </div>

      <!-- 硬门槛 -->
      <div class="mb-3">
        <h6 class="fw-semibold">硬门槛检查</h6>
        ${ev.hard_pass
          ? '<div class="alert alert-success py-2 small"><i class="bi bi-check-circle-fill me-1"></i>通过所有必备条件</div>'
          : `<div class="alert alert-danger py-2 small"><i class="bi bi-x-circle-fill me-1"></i>未通过以下必备条件：
            <ul class="mb-0 mt-1">${hardFails.map(f => `<li>${escapeHtml(f.message)}</li>`).join('')}</ul>
          </div>`
        }
      </div>

      <!-- 评分圆圈 -->
      <div class="mb-3">
        <h6 class="fw-semibold">维度得分</h6>
        <div class="d-flex justify-content-around py-2 border rounded">
          ${scoreRing(ev.score_academic, '学术')}
          ${scoreRing(ev.score_language, '语言')}
          ${scoreRing(ev.score_extra, '额外测试')}
          ${scoreRing(ev.score_total, '综合')}
        </div>
      </div>

      <!-- 概率区间 -->
      <div class="mb-3">
        <h6 class="fw-semibold">录取概率估算</h6>
        ${probBar(ev.prob_low, ev.prob_mid, ev.prob_high)}
        <div class="d-flex justify-content-between align-items-center mt-2">
          <span class="small text-muted">置信度：<span class="badge bg-${cc}">${cl}</span></span>
          ${ev.hist_offer_rate != null ? `<span class="small text-muted">历史录取率: ${Math.round(parseFloat(ev.hist_offer_rate)*100)}% (n=${ev.hist_applicants||0})</span>` : '<span class="small text-muted">历史数据不足</span>'}
        </div>
        ${ev.confidence_note ? `<div class="small text-muted mt-1 fst-italic">${ev.confidence_note}</div>` : ''}
      </div>

      <!-- 差距分析 -->
      ${gaps.length ? `
      <div class="mb-3">
        <h6 class="fw-semibold">差距分析</h6>
        <div class="table-responsive">
          <table class="table table-sm table-bordered">
            <thead class="table-light"><tr><th>维度</th><th>项目</th><th>当前</th><th>要求</th><th>差距</th><th>可弥补</th></tr></thead>
            <tbody>
              ${gaps.map(g => {
                const gapColor = g.gap != null && g.gap < 0 ? 'text-danger' : 'text-success';
                return `<tr>
                  <td class="small">${g.dimension==='academic'?'学术':g.dimension==='language'?'语言':'测试'}</td>
                  <td class="small">${g.subject || g.test || '—'}</td>
                  <td class="small">${g.current != null ? g.current : '<span class="text-muted">未知</span>'}</td>
                  <td class="small">${g.required != null ? g.required : '—'}</td>
                  <td class="small ${gapColor}">${g.gap != null ? (g.gap >= 0 ? '+' : '')+g.gap : '—'}</td>
                  <td class="small">${g.closable ? '<i class="bi bi-check text-success"></i>' : '<i class="bi bi-x text-danger"></i>'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="small text-muted mt-1 p-2 bg-light rounded">${gaps.map(g => g.message).join(' · ')}</div>
      </div>
      ` : ''}

      <div class="alert alert-warning small py-2">
        <i class="bi bi-exclamation-triangle me-1"></i>概率区间仅供参考，不构成录取承诺。实际录取受申请材料质量、竞争情况、面试表现等多因素影响。
      </div>

      <!-- AI 增强分析区域 -->
      <div class="border-top pt-3 mt-2">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h6 class="fw-semibold mb-0"><i class="bi bi-stars text-warning me-1"></i>AI 智能分析</h6>
          ${ev.ai_result
            ? `<span class="badge bg-success small">已分析</span>`
            : `<button class="btn btn-sm btn-outline-warning" id="ai-enhance-btn" onclick="runAIEnhance('${evalId}')">
                <i class="bi bi-stars me-1"></i>运行 AI 分析
              </button>`
          }
        </div>
        <div id="ai-enhance-result">
          ${ev.ai_result ? renderAIEvalResult(JSON.parse(ev.ai_result), probBar) : '<div class="text-muted small">点击"运行 AI 分析"，由 GPT-4o 基于大模型训练数据（含真实录取案例）给出独立概率估计。</div>'}
        </div>
      </div>
    `;

    bootstrap.Modal.getOrCreateInstance(document.getElementById('eval-result-modal')).show();
  } catch(e) { showError(e.message); }
}

function renderAIEvalResult(ai, probBar) {
  const confMap = { high: ['success','高'], medium: ['warning text-dark','中'], low: ['secondary','低'] };
  const [cc, cl] = confMap[ai.confidence] || ['secondary','—'];
  return `
    <div class="border rounded p-3 bg-light">
      <div class="mb-2">
        <div class="small fw-semibold text-muted mb-1">AI 概率区间</div>
        ${probBar(ai.prob_low, ai.prob_mid, ai.prob_high)}
        <span class="badge bg-${cc} mt-1">置信度：${cl}</span>
      </div>
      <div class="mb-2">
        <div class="small fw-semibold text-muted">推理依据</div>
        <div class="small">${escapeHtml(ai.reasoning)}</div>
      </div>
      <div class="row g-2 mb-2">
        <div class="col-6">
          <div class="small fw-semibold text-success">优势</div>
          <ul class="mb-0 small ps-3">${ai.strengths.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>
        </div>
        <div class="col-6">
          <div class="small fw-semibold text-danger">风险</div>
          <ul class="mb-0 small ps-3">${ai.concerns.map(c=>`<li>${escapeHtml(c)}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="small border-top pt-2 mt-1">
        <i class="bi bi-lightbulb text-warning me-1"></i><strong>建议：</strong>${escapeHtml(ai.recommendation)}
      </div>
      <div class="small text-muted mt-1 fst-italic">${escapeHtml(ai.data_note)}</div>
    </div>`;
}

async function runAIEnhance(evalId) {
  const btn = document.getElementById('ai-enhance-btn');
  const container = document.getElementById('ai-enhance-result');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>分析中…'; }
  container.innerHTML = '<div class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm me-2"></div>AI 分析中，请稍候（约 10-20 秒）…</div>';
  try {
    const ai = await POST(`/api/admission-evals/${evalId}/ai-enhance`, {});
    // Re-fetch probBar from parent context (re-use inline version)
    const color = ai.prob_mid >= 60 ? '#198754' : ai.prob_mid >= 35 ? '#fd7e14' : '#dc3545';
    const pb = (low, mid, high) => `
      <div class="mb-1">
        <div style="background:#e9ecef;border-radius:8px;height:24px;position:relative;overflow:hidden;">
          <div style="background:${color};opacity:0.25;position:absolute;left:${low}%;width:${high-low}%;height:100%;"></div>
          <div style="background:${color};position:absolute;left:${mid-1}%;width:3px;height:100%;border-radius:2px;"></div>
        </div>
        <div class="d-flex justify-content-between mt-1">
          <small class="text-muted">保守 ${low}%</small>
          <strong style="color:${color}">${mid}%</strong>
          <small class="text-muted">乐观 ${high}%</small>
        </div>
      </div>`;
    container.innerHTML = renderAIEvalResult(ai, pb);
    if (btn) { btn.remove(); }
    const header = container.previousElementSibling?.querySelector('.badge');
    if (header) header.outerHTML = '<span class="badge bg-success small">已分析</span>';
  } catch(e) {
    container.innerHTML = `<div class="alert alert-danger small py-2">${escapeHtml(e.message)}</div>`;
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-stars me-1"></i>重试 AI 分析'; }
  }
}

// ════════════════════════════════════════════════════════
//  基准评估库管理
// ════════════════════════════════════════════════════════

async function renderBenchmarkLibraryTab(canEdit) {
  const container = document.getElementById('benchmark-lib-container');
  if (!container) return;
  container.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>';
  try {
    const benchmarks = await GET('/api/eval-benchmarks');
    window._allBenchmarks = benchmarks;
    window._canEditBenchmarks = canEdit;
    _renderBenchmarkTable(benchmarks, canEdit);
  } catch(e) {
    container.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

function _renderBenchmarkTable(benchmarks, canEdit) {
  const container = document.getElementById('benchmark-lib-container');
  if (!container) return;

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="d-flex gap-2 flex-wrap">
        <select class="form-select form-select-sm" id="bm-filter-country" onchange="filterBenchmarkTable()" style="width:120px">
          <option value="">全部地区</option>
          <option value="UK">🇬🇧 UK</option>
          <option value="US">🇺🇸 US</option>
          <option value="CA">🇨🇦 CA</option>
          <option value="AU">🇦🇺 AU</option>
          <option value="NZ">🇳🇿 NZ</option>
          <option value="SG">🇸🇬 SG</option>
          <option value="HK">🇭🇰 HK</option>
        </select>
        <select class="form-select form-select-sm" id="bm-filter-tier" onchange="filterBenchmarkTable()" style="width:110px">
          <option value="">全部梯度</option>
          <option value="冲刺">冲刺</option>
          <option value="意向">意向</option>
          <option value="保底">保底</option>
        </select>
        <select class="form-select form-select-sm" id="bm-filter-subject" onchange="filterBenchmarkTable()" style="width:140px">
          <option value="">全部专业</option>
          <option value="CS">计算机</option>
          <option value="Business">商科</option>
          <option value="Mathematics">数学</option>
          <option value="Engineering">工程</option>
          <option value="Science">科学</option>
          <option value="Medicine">医学</option>
          <option value="Humanities">人文</option>
          <option value="Law">法律</option>
        </select>
      </div>
      ${canEdit ? `<button class="btn btn-info btn-sm text-white" onclick="openBenchmarkModal(null)"><i class="bi bi-plus me-1"></i>新增基准</button>` : ''}
    </div>
    <div class="table-responsive">
      <table class="table table-hover table-sm align-middle">
        <thead class="table-light">
          <tr>
            <th>显示名</th><th>地区</th><th>梯度</th><th>专业领域</th>
            <th>成绩类型</th><th>主要要求</th><th>IELTS</th><th>通过率</th>
            ${canEdit ? '<th>操作</th>' : ''}
          </tr>
        </thead>
        <tbody id="bm-table-body">
          ${_renderBenchmarkRows(benchmarks, canEdit)}
        </tbody>
      </table>
    </div>`;
}

function _renderBenchmarkRows(benchmarks, canEdit) {
  const TIER_COLORS = { '冲刺': 'danger', '意向': 'warning', '保底': 'success' };
  const COUNTRY_FLAGS = { UK:'🇬🇧', US:'🇺🇸', CA:'🇨🇦', AU:'🇦🇺', NZ:'🇳🇿', SG:'🇸🇬', HK:'🇭🇰' };
  if (!benchmarks.length) return '<tr><td colspan="9" class="text-center text-muted py-3">暂无基准数据</td></tr>';
  return benchmarks.map(bm => {
    const gradeReqs = (() => { try { return JSON.parse(bm.grade_requirements||'[]'); } catch(e) { return []; } })();
    const reqSummary = gradeReqs.slice(0, 3).map(r => `${r.subject} ${r.min_grade}${r.required ? '*' : ''}`).join(', ');
    const passRate = bm.benchmark_pass_rate != null ? `${Math.round(parseFloat(bm.benchmark_pass_rate)*100)}%` : '—';
    const tierColor = TIER_COLORS[bm.tier] || 'secondary';
    const flag = COUNTRY_FLAGS[bm.country] || '';
    return `<tr>
      <td class="fw-semibold small">${escapeHtml(bm.display_name)}</td>
      <td>${flag} ${escapeHtml(bm.country)}</td>
      <td><span class="badge bg-${tierColor}">${escapeHtml(bm.tier)}</span></td>
      <td class="small">${escapeHtml(bm.subject_area)}</td>
      <td class="small">${escapeHtml(bm.grade_type||'A-Level')}</td>
      <td class="small text-muted">${escapeHtml(reqSummary)||'—'}</td>
      <td class="small">${bm.ielts_overall || '—'}</td>
      <td class="small">${passRate}</td>
      ${canEdit ? `<td class="text-nowrap">
        <button class="btn btn-outline-secondary btn-xs me-1" onclick="openBenchmarkModalById('${escapeHtml(bm.id)}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-danger btn-xs" onclick="deleteBenchmark('${escapeHtml(bm.id)}','${escapeHtml(bm.display_name)}')"><i class="bi bi-trash"></i></button>
      </td>` : ''}
    </tr>`;
  }).join('');
}

function filterBenchmarkTable() {
  const country = document.getElementById('bm-filter-country')?.value || '';
  const tier = document.getElementById('bm-filter-tier')?.value || '';
  const subject = document.getElementById('bm-filter-subject')?.value || '';
  let filtered = window._allBenchmarks || [];
  if (country) filtered = filtered.filter(b => b.country === country);
  if (tier) filtered = filtered.filter(b => b.tier === tier);
  if (subject) filtered = filtered.filter(b => b.subject_area === subject);
  const tbody = document.getElementById('bm-table-body');
  if (tbody) tbody.innerHTML = _renderBenchmarkRows(filtered, window._canEditBenchmarks);
}

function openBenchmarkModalById(id) {
  const bm = (window._allBenchmarks || []).find(b => b.id === id);
  openBenchmarkModal(bm || null);
}

function openBenchmarkModal(bm) {
  document.getElementById('bm-edit-id').value = bm?.id || '';
  document.getElementById('benchmark-modal-title').textContent = bm ? '编辑基准' : '新建基准';
  document.getElementById('bm-country').value = bm?.country || '';
  document.getElementById('bm-tier').value = bm?.tier || '';
  document.getElementById('bm-subject-area').value = bm?.subject_area || '';
  document.getElementById('bm-display-name').value = bm?.display_name || '';
  document.getElementById('bm-grade-type').value = bm?.grade_type || 'A-Level';
  document.getElementById('bm-ielts').value = bm?.ielts_overall || '';
  document.getElementById('bm-toefl').value = bm?.toefl_overall || '';
  document.getElementById('bm-w-academic').value = bm?.weight_academic ?? 0.60;
  document.getElementById('bm-w-language').value = bm?.weight_language ?? 0.25;
  document.getElementById('bm-w-extra').value = bm?.weight_extra ?? 0.15;
  document.getElementById('bm-pass-rate').value = bm?.benchmark_pass_rate || '';
  document.getElementById('bm-grade-requirements').value = bm?.grade_requirements || '[]';
  document.getElementById('bm-extra-tests').value = bm?.extra_tests || '[]';
  document.getElementById('bm-notes').value = bm?.notes || '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('benchmark-modal')).show();
}

async function saveBenchmark() {
  if (!acquireSubmit('saveBenchmark')) return;
  const id = document.getElementById('bm-edit-id').value;
  const country = document.getElementById('bm-country').value;
  const tier = document.getElementById('bm-tier').value;
  const subject_area = document.getElementById('bm-subject-area').value;
  if (!country || !tier || !subject_area) { releaseSubmit('saveBenchmark'); showError('请选择地区、梯度和专业领域'); return; }

  // Validate JSON fields
  for (const fieldId of ['bm-grade-requirements', 'bm-extra-tests']) {
    try { JSON.parse(document.getElementById(fieldId).value || '[]'); }
    catch(e) { releaseSubmit('saveBenchmark'); showError(`${fieldId === 'bm-grade-requirements' ? '成绩要求' : '附加考试'}JSON格式错误: ${e.message}`); return; }
  }

  const display_name = document.getElementById('bm-display-name').value.trim() ||
    `${country} ${tier}-${subject_area}`;

  const payload = {
    country, tier, subject_area, display_name,
    grade_type: document.getElementById('bm-grade-type').value,
    ielts_overall: parseFloat(document.getElementById('bm-ielts').value) || null,
    toefl_overall: parseInt(document.getElementById('bm-toefl').value) || null,
    weight_academic: parseFloat(document.getElementById('bm-w-academic').value) || 0.60,
    weight_language: parseFloat(document.getElementById('bm-w-language').value) || 0.25,
    weight_extra: parseFloat(document.getElementById('bm-w-extra').value) || 0.15,
    benchmark_pass_rate: parseFloat(document.getElementById('bm-pass-rate').value) || null,
    grade_requirements: document.getElementById('bm-grade-requirements').value || '[]',
    extra_tests: document.getElementById('bm-extra-tests').value || '[]',
    notes: document.getElementById('bm-notes').value.trim()
  };

  try {
    if (id) {
      await PUT(`/api/eval-benchmarks/${id}`, payload);
    } else {
      await POST('/api/eval-benchmarks', payload);
    }
    bootstrap.Modal.getInstance(document.getElementById('benchmark-modal'))?.hide();
    showSuccess('保存成功');
    renderBenchmarkLibraryTab(window._canEditBenchmarks);
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveBenchmark'); }
}

async function deleteBenchmark(id, label) {
  confirmAction(`确定删除基准「${label}」？此操作不可恢复。`, async () => {
    try {
      await DEL(`/api/eval-benchmarks/${id}`);
      showSuccess('已删除');
      renderBenchmarkLibraryTab(window._canEditBenchmarks);
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

// ════════════════════════════════════════════════════════
//  学生基准评估
// ════════════════════════════════════════════════════════

async function loadBenchmarkEvals(studentId) {
  const container = document.getElementById('benchmark-evals-container');
  if (!container) return;
  try {
    const evals = await GET(`/api/students/${studentId}/benchmark-evals`);
    if (!evals.length) {
      container.innerHTML = `<div class="text-center text-muted py-3 small">
        暂无基准评估记录。点击"基准评估"按钮选择地区/梯度/专业进行分析。
      </div>`;
      return;
    }
    const TIER_COLORS = { '冲刺': 'danger', '意向': 'warning', '保底': 'success' };
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover table-sm align-middle">
          <thead class="table-light">
            <tr><th>基准</th><th>地区</th><th>梯度</th><th>硬门槛</th>
              <th>综合分</th><th>概率区间</th><th>置信度</th><th>评估时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${evals.map(e => {
              const tierColor = TIER_COLORS[e.tier] || 'secondary';
              const passEl = e.hard_pass ? '<span class="badge bg-success">通过</span>' : '<span class="badge bg-danger">未通过</span>';
              const probEl = e.prob_mid != null
                ? `<span class="text-muted small">${e.prob_low}%</span> — <strong class="text-primary">${e.prob_mid}%</strong> — <span class="text-muted small">${e.prob_high}%</span>`
                : '—';
              const confMap = { high: ['success','高'], medium: ['warning','中'], low: ['secondary','低'] };
              const [cc, cl] = confMap[e.confidence] || ['secondary','—'];
              const scoreColor = e.score_total >= 75 ? 'success' : e.score_total >= 55 ? 'warning' : 'danger';
              return `<tr>
                <td class="small fw-semibold">${escapeHtml(e.display_name || e.benchmark_id)}</td>
                <td class="small">${escapeHtml(e.country||'—')}</td>
                <td><span class="badge bg-${tierColor}">${escapeHtml(e.tier||'—')}</span></td>
                <td>${passEl}</td>
                <td><span class="badge bg-${scoreColor}">${e.score_total||0}</span></td>
                <td class="text-nowrap small">${probEl}</td>
                <td><span class="badge bg-${cc}">${cl}</span></td>
                <td class="small text-muted">${fmtDate(e.created_at)}</td>
                <td class="text-nowrap">
                  <button class="btn btn-outline-info btn-xs me-1" onclick="showBenchmarkEvalDetail('${e.id}')"><i class="bi bi-eye"></i></button>
                  <button class="btn btn-outline-danger btn-xs" onclick="deleteBenchmarkEval('${escapeHtml(e.id)}','${escapeHtml(e.display_name||'')}','${escapeHtml(studentId)}')"><i class="bi bi-trash"></i></button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-danger small py-2">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

async function deleteBenchmarkEval(evalId, label, studentId) {
  confirmAction(`确定删除基准评估「${label}」？此操作不可恢复。`, async () => {
    try {
      await DEL(`/api/benchmark-evals/${evalId}`);
      loadBenchmarkEvals(studentId);
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

// 3步向导状态
let _bmWizardState = { studentId: '', step: 1, country: '', tier: '', subjectArea: '' };

const COUNTRY_DATA = [
  { code: 'UK', label: '🇬🇧 英国' },
  { code: 'US', label: '🇺🇸 美国' },
  { code: 'CA', label: '🇨🇦 加拿大' },
  { code: 'AU', label: '🇦🇺 澳大利亚' },
  { code: 'NZ', label: '🇳🇿 新西兰' },
  { code: 'SG', label: '🇸🇬 新加坡' },
  { code: 'HK', label: '🇭🇰 香港' }
];

const TIER_DATA = [
  { code: '冲刺', label: '🔴 冲刺', desc: '顶尖院校，竞争激烈' },
  { code: '意向', label: '🟡 意向', desc: '主流院校，有把握冲刺' },
  { code: '保底', label: '🟢 保底', desc: '稳妥选择，录取率较高' }
];

const SUBJECT_DATA = [
  { code: 'CS', label: '💻 计算机' },
  { code: 'Business', label: '📊 商科/经济' },
  { code: 'Mathematics', label: '📐 数学' },
  { code: 'Engineering', label: '⚙️ 工程' },
  { code: 'Science', label: '🔬 自然科学' },
  { code: 'Medicine', label: '🏥 医学' },
  { code: 'Humanities', label: '🎭 人文艺术' },
  { code: 'Law', label: '⚖️ 法律' }
];

function openBenchmarkEvalModal(studentId) {
  _bmWizardState = { studentId, step: 1, country: '', tier: '', subjectArea: '' };
  _renderBmWizard();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('benchmark-eval-modal')).show();
}

function _renderBmWizard() {
  const body = document.getElementById('benchmark-eval-wizard-body');
  const footer = document.getElementById('benchmark-eval-wizard-footer');
  const s = _bmWizardState;

  const stepIndicator = `
    <div class="d-flex align-items-center gap-2 mb-3 small text-muted">
      <span class="${s.step >= 1 ? 'fw-bold text-info' : ''}">① 地区</span>
      <span>›</span>
      <span class="${s.step >= 2 ? 'fw-bold text-info' : ''}">② 梯度</span>
      <span>›</span>
      <span class="${s.step >= 3 ? 'fw-bold text-info' : ''}">③ 专业</span>
    </div>`;

  if (s.step === 1) {
    body.innerHTML = stepIndicator + `
      <p class="text-muted small mb-3">选择目标院校所在地区：</p>
      <div class="d-flex flex-wrap gap-2">
        ${COUNTRY_DATA.map(c => `
          <button class="btn btn-outline-secondary btn-sm" onclick="_bmSelectCountry('${c.code}')">
            ${c.label}
          </button>`).join('')}
      </div>`;
    footer.innerHTML = `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>`;
  } else if (s.step === 2) {
    body.innerHTML = stepIndicator + `
      <p class="text-muted small mb-3">地区：<strong>${s.country}</strong>　选择学校梯度：</p>
      <div class="d-flex flex-column gap-2">
        ${TIER_DATA.map(t => `
          <button class="btn btn-outline-secondary text-start py-2" onclick="_bmSelectTier('${t.code}')">
            <span class="fw-bold">${t.label}</span>
            <span class="text-muted small ms-2">${t.desc}</span>
          </button>`).join('')}
      </div>`;
    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="_bmBack()">返回</button>
      <button class="btn btn-secondary ms-auto" data-bs-dismiss="modal">取消</button>`;
  } else if (s.step === 3) {
    body.innerHTML = stepIndicator + `
      <p class="text-muted small mb-3">地区：<strong>${s.country}</strong>　梯度：<strong>${s.tier}</strong>　选择专业领域：</p>
      <div class="d-flex flex-wrap gap-2" id="bm-subject-btns">
        ${SUBJECT_DATA.map(sa => `
          <button class="btn btn-outline-secondary btn-sm" onclick="_bmSelectSubject('${sa.code}')">
            ${sa.label}
          </button>`).join('')}
      </div>
      <div id="bm-check-result" class="mt-3"></div>`;
    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="_bmBack()">返回</button>
      <button class="btn btn-secondary ms-auto" data-bs-dismiss="modal">取消</button>`;
  }
}

function _bmBack() {
  _bmWizardState.step -= 1;
  if (_bmWizardState.step < 1) _bmWizardState.step = 1;
  _renderBmWizard();
}

function _bmSelectCountry(code) {
  _bmWizardState.country = code;
  _bmWizardState.step = 2;
  _renderBmWizard();
}

function _bmSelectTier(code) {
  _bmWizardState.tier = code;
  _bmWizardState.step = 3;
  _renderBmWizard();
}

async function _bmSelectSubject(code) {
  _bmWizardState.subjectArea = code;
  const resultEl = document.getElementById('bm-check-result');
  // Disable buttons
  document.querySelectorAll('#bm-subject-btns button').forEach(b => b.disabled = true);
  resultEl.innerHTML = '<div class="text-center text-muted small py-2"><div class="spinner-border spinner-border-sm me-1"></div>查找基准...</div>';

  const s = _bmWizardState;
  try {
    const bms = await GET(`/api/eval-benchmarks?country=${encodeURIComponent(s.country)}&tier=${encodeURIComponent(s.tier)}&subject_area=${encodeURIComponent(s.subjectArea)}`);
    const bm = bms[0];
    if (!bm) {
      resultEl.innerHTML = `<div class="alert alert-warning small py-2">
        <i class="bi bi-exclamation-triangle me-1"></i>
        暂无 <strong>${s.country} ${s.tier} ${code}</strong> 基准数据，请联系管理员添加。
      </div>`;
      document.querySelectorAll('#bm-subject-btns button').forEach(b => b.disabled = false);
      return;
    }
    const gradeReqs = (() => { try { return JSON.parse(bm.grade_requirements||'[]'); } catch(e) { return []; } })();
    const passRate = bm.benchmark_pass_rate != null ? `${Math.round(parseFloat(bm.benchmark_pass_rate)*100)}%` : '—';
    resultEl.innerHTML = `
      <div class="border rounded p-3 bg-light">
        <div class="fw-bold mb-1">${escapeHtml(bm.display_name)}</div>
        <div class="small text-muted mb-2">成绩类型: ${bm.grade_type || 'A-Level'} · IELTS: ${bm.ielts_overall || '—'} · 参考通过率: ${passRate}</div>
        ${gradeReqs.length ? `<div class="small mb-2">
          <strong>主要成绩要求：</strong>
          ${gradeReqs.map(r => `<span class="badge bg-secondary me-1">${r.subject} ${r.min_grade}${r.required ? ' (必须)' : ''}</span>`).join('')}
        </div>` : ''}
        ${bm.notes ? `<div class="small text-muted fst-italic">${escapeHtml(bm.notes)}</div>` : ''}
        <div class="mt-3 d-flex justify-content-end">
          <button class="btn btn-info btn-sm text-white" onclick="_bmRunEval('${escapeHtml(bm.id)}')">
            <i class="bi bi-play-circle me-1"></i>运行基准评估
          </button>
        </div>
      </div>`;
  } catch(e) {
    resultEl.innerHTML = `<div class="alert alert-danger small py-2">${escapeHtml(e.message)}</div>`;
    document.querySelectorAll('#bm-subject-btns button').forEach(b => b.disabled = false);
  }
}

async function _bmRunEval(benchmarkId) {
  const s = _bmWizardState;
  const body = document.getElementById('benchmark-eval-wizard-body');
  const spinnerEl = document.createElement('div');
  spinnerEl.className = 'text-center text-muted small py-2 mt-2';
  spinnerEl.innerHTML = '<div class="spinner-border spinner-border-sm me-1"></div>评估中...';
  body.appendChild(spinnerEl);
  document.querySelectorAll('#benchmark-eval-wizard-body button').forEach(b => b.disabled = true);
  try {
    const result = await POST(`/api/students/${s.studentId}/benchmark-eval`, { benchmark_id: benchmarkId });
    bootstrap.Modal.getInstance(document.getElementById('benchmark-eval-modal'))?.hide();
    showSuccess('基准评估完成');
    loadBenchmarkEvals(s.studentId);
    showBenchmarkEvalDetail(result.id);
  } catch(e) {
    spinnerEl.remove();
    showError(e.message);
    document.querySelectorAll('#benchmark-eval-wizard-body button').forEach(b => b.disabled = false);
  }
}

async function showBenchmarkEvalDetail(evalId) {
  try {
    const ev = await GET(`/api/benchmark-evals/${evalId}`);
    const gaps = (() => { try { return JSON.parse(ev.gaps||'[]'); } catch(e) { return []; } })();
    const hardFails = (() => { try { return JSON.parse(ev.hard_fails||'[]'); } catch(e) { return []; } })();

    const probBar = (low, mid, high) => {
      if (mid == null) return '—';
      const color = mid >= 60 ? '#198754' : mid >= 35 ? '#fd7e14' : '#dc3545';
      return `
        <div class="mb-1">
          <div style="background:#e9ecef;border-radius:8px;height:24px;position:relative;overflow:hidden;">
            <div style="background:${color};opacity:0.25;position:absolute;left:${low}%;width:${high-low}%;height:100%;"></div>
            <div style="background:${color};position:absolute;left:${mid-1}%;width:3px;height:100%;border-radius:2px;"></div>
          </div>
          <div class="d-flex justify-content-between mt-1">
            <small class="text-muted">保守 ${low}%</small>
            <strong style="color:${color}">${mid}%</strong>
            <small class="text-muted">乐观 ${high}%</small>
          </div>
        </div>`;
    };

    const scoreRing = (score, label) => {
      const color = score >= 75 ? '#198754' : score >= 55 ? '#fd7e14' : '#dc3545';
      return `<div class="text-center">
        <div style="width:60px;height:60px;border-radius:50%;border:4px solid ${color};display:flex;align-items:center;justify-content:center;margin:0 auto;">
          <strong style="color:${color}">${score||0}</strong>
        </div>
        <div class="small text-muted mt-1">${label}</div>
      </div>`;
    };

    const TIER_COLORS = { '冲刺': 'danger', '意向': 'warning', '保底': 'success' };
    const COUNTRY_FLAGS = { UK:'🇬🇧', US:'🇺🇸', CA:'🇨🇦', AU:'🇦🇺', NZ:'🇳🇿', SG:'🇸🇬', HK:'🇭🇰' };
    const confMap = { high: ['success','高 (数据充足)'], medium: ['warning text-dark','中 (数据有限)'], low: ['secondary','低 (数据不足)'] };
    const [cc, cl] = confMap[ev.confidence] || ['secondary','—'];
    const tierColor = TIER_COLORS[ev.tier] || 'secondary';
    const flag = COUNTRY_FLAGS[ev.country] || '';
    const passRate = ev.benchmark_pass_rate != null ? `${Math.round(parseFloat(ev.benchmark_pass_rate)*100)}%` : '未知';

    document.getElementById('benchmark-eval-result-body').innerHTML = `
      <div class="mb-3">
        <h6 class="fw-bold">${escapeHtml(ev.display_name || '基准评估')}</h6>
        <div class="d-flex gap-2 flex-wrap align-items-center mt-1">
          <span class="badge bg-secondary">${flag} ${escapeHtml(ev.country||'—')}</span>
          <span class="badge bg-${tierColor}">${escapeHtml(ev.tier||'—')}</span>
          <span class="badge bg-info text-dark">${escapeHtml(ev.subject_area||'—')}</span>
          <span class="text-muted small">评估时间: ${fmtDate(ev.created_at)}</span>
        </div>
      </div>

      <!-- 硬门槛 -->
      <div class="mb-3">
        <h6 class="fw-semibold">硬门槛检查</h6>
        ${ev.hard_pass
          ? '<div class="alert alert-success py-2 small"><i class="bi bi-check-circle-fill me-1"></i>通过所有必备条件</div>'
          : `<div class="alert alert-danger py-2 small"><i class="bi bi-x-circle-fill me-1"></i>未通过以下必备条件：
            <ul class="mb-0 mt-1">${hardFails.map(f => `<li>${escapeHtml(f.message)}</li>`).join('')}</ul>
          </div>`
        }
      </div>

      <!-- 评分圆圈 -->
      <div class="mb-3">
        <h6 class="fw-semibold">维度得分</h6>
        <div class="d-flex justify-content-around py-2 border rounded">
          ${scoreRing(ev.score_academic, '学术')}
          ${scoreRing(ev.score_language, '语言')}
          ${scoreRing(ev.score_extra, '额外测试')}
          ${scoreRing(ev.score_total, '综合')}
        </div>
      </div>

      <!-- 概率区间 -->
      <div class="mb-3">
        <h6 class="fw-semibold">录取概率估算</h6>
        ${probBar(ev.prob_low, ev.prob_mid, ev.prob_high)}
        <div class="d-flex justify-content-between align-items-center mt-2">
          <span class="small text-muted">置信度：<span class="badge bg-${cc}">${cl}</span></span>
          <span class="small text-muted">行业参考通过率: ${passRate}</span>
        </div>
        ${ev.confidence_note ? `<div class="small text-muted mt-1 fst-italic">${ev.confidence_note}</div>` : ''}
      </div>

      <!-- 差距分析 -->
      ${gaps.length ? `
      <div class="mb-3">
        <h6 class="fw-semibold">差距分析</h6>
        <div class="table-responsive">
          <table class="table table-sm table-bordered">
            <thead class="table-light"><tr><th>维度</th><th>项目</th><th>当前</th><th>要求</th><th>差距</th><th>可弥补</th></tr></thead>
            <tbody>
              ${gaps.map(g => {
                const gapColor = g.gap != null && g.gap < 0 ? 'text-danger' : 'text-success';
                return `<tr>
                  <td class="small">${g.dimension==='academic'?'学术':g.dimension==='language'?'语言':'测试'}</td>
                  <td class="small">${g.subject || g.test || '—'}</td>
                  <td class="small">${g.current != null ? g.current : '<span class="text-muted">未知</span>'}</td>
                  <td class="small">${g.required != null ? g.required : '—'}</td>
                  <td class="small ${gapColor}">${g.gap != null ? (g.gap >= 0 ? '+' : '')+g.gap : '—'}</td>
                  <td class="small">${g.closable ? '<i class="bi bi-check text-success"></i>' : '<i class="bi bi-x text-danger"></i>'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="small text-muted mt-1 p-2 bg-light rounded">${gaps.map(g => g.message).join(' · ')}</div>
      </div>
      ` : ''}

      <div class="alert alert-warning small py-2">
        <i class="bi bi-exclamation-triangle me-1"></i>基准评估基于行业通用标准，仅供参考，不代表特定院校的实际录取要求。
      </div>

      <!-- AI 增强分析区域 -->
      <div class="border-top pt-3 mt-2">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h6 class="fw-semibold mb-0"><i class="bi bi-stars text-warning me-1"></i>AI 智能分析</h6>
          ${ev.ai_result
            ? `<span class="badge bg-success small">已分析</span>`
            : `<button class="btn btn-sm btn-outline-warning" id="bm-ai-enhance-btn" onclick="runBenchmarkAIEnhance('${evalId}')">
                <i class="bi bi-stars me-1"></i>运行 AI 分析
              </button>`
          }
        </div>
        <div id="bm-ai-enhance-result">
          ${ev.ai_result ? renderAIEvalResult(JSON.parse(ev.ai_result), probBar) : '<div class="text-muted small">点击"运行 AI 分析"，由 GPT-4o 给出独立概率估计。</div>'}
        </div>
      </div>
    `;

    bootstrap.Modal.getOrCreateInstance(document.getElementById('benchmark-eval-result-modal')).show();
  } catch(e) { showError(e.message); }
}

async function runBenchmarkAIEnhance(evalId) {
  const btn = document.getElementById('bm-ai-enhance-btn');
  const container = document.getElementById('bm-ai-enhance-result');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>分析中…'; }
  container.innerHTML = '<div class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm me-2"></div>AI 分析中，请稍候（约 10-20 秒）…</div>';
  try {
    const ai = await POST(`/api/benchmark-evals/${evalId}/ai-enhance`, {});
    const color = ai.prob_mid >= 60 ? '#198754' : ai.prob_mid >= 35 ? '#fd7e14' : '#dc3545';
    const pb = (low, mid, high) => `
      <div class="mb-1">
        <div style="background:#e9ecef;border-radius:8px;height:24px;position:relative;overflow:hidden;">
          <div style="background:${color};opacity:0.25;position:absolute;left:${low}%;width:${high-low}%;height:100%;"></div>
          <div style="background:${color};position:absolute;left:${mid-1}%;width:3px;height:100%;border-radius:2px;"></div>
        </div>
        <div class="d-flex justify-content-between mt-1">
          <small class="text-muted">保守 ${low}%</small>
          <strong style="color:${color}">${mid}%</strong>
          <small class="text-muted">乐观 ${high}%</small>
        </div>
      </div>`;
    container.innerHTML = renderAIEvalResult(ai, pb);
    if (btn) btn.remove();
  } catch(e) {
    container.innerHTML = `<div class="alert alert-danger small py-2">${escapeHtml(e.message)}</div>`;
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-stars me-1"></i>重试 AI 分析'; }
  }
}

// ════════════════════════════════════════════════════════
//  AI 升学规划功能
// ════════════════════════════════════════════════════════

const AI_STATUS_MAP = {
  draft: { label: '草稿', color: 'secondary' },
  approved: { label: '已批准', color: 'success' },
  published: { label: '已发布', color: 'primary' },
  archived: { label: '已存档', color: 'secondary' }
};

async function loadAIPlanTab(studentId) {
  const container = document.getElementById('ai-plan-tab-container');
  if (!container) return;
  try {
    const plans = await GET(`/api/students/${studentId}/ai-plans`).catch(() => null);
    if (!plans || plans.length === 0) {
      container.innerHTML = `<div class="text-center text-muted py-5">
        <i class="bi bi-stars display-4 d-block mb-3 text-warning opacity-50"></i>
        <p class="mb-0">暂无 AI 规划记录。</p>
        <p class="small">点击上方"生成 AI 规划"按钮开始。</p>
      </div>`;
      return;
    }
    const rows = plans.map(p => {
      const st = AI_STATUS_MAP[p.status] || { label: p.status, color: 'secondary' };
      const approvedBy = p.approved_by ? '已批准' : '—';
      const publishedAt = p.published_at ? fmtDate(p.published_at) : '—';
      return `<tr>
        <td><span class="badge bg-${st.color}">${st.label}</span></td>
        <td class="small text-muted">${fmtDate(p.created_at)}</td>
        <td class="small text-muted">${escapeHtml(p.model || '—')}</td>
        <td class="small text-muted">${approvedBy}</td>
        <td class="small text-muted">${publishedAt}</td>
        <td class="text-nowrap">
          <button class="btn btn-outline-primary btn-xs me-1" onclick="openAIPlanModal('${p.id}','${studentId}')"><i class="bi bi-eye"></i> 预览</button>
          ${p.status === 'draft' ? `<button class="btn btn-outline-warning btn-xs me-1" onclick="approveAIPlan('${p.id}','${studentId}')"><i class="bi bi-check-lg"></i> 批准</button>` : ''}
          ${p.status === 'approved' ? `<button class="btn btn-outline-success btn-xs me-1" onclick="publishAIPlan('${p.id}','${studentId}')"><i class="bi bi-send"></i> 发布</button>` : ''}
          ${!['archived'].includes(p.status) ? `<button class="btn btn-outline-secondary btn-xs" onclick="archiveAIPlan('${p.id}','${studentId}')"><i class="bi bi-archive"></i></button>` : ''}
        </td>
      </tr>`;
    }).join('');
    container.innerHTML = `<div class="table-responsive">
      <table class="table table-hover align-middle table-sm">
        <thead class="table-light"><tr>
          <th>状态</th><th>生成时间</th><th>模型</th><th>批准状态</th><th>发布时间</th><th>操作</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

async function generateAIPlan(studentId) {
  // Route selection prompt
  const routes = ['UK-UG', 'US', 'SG', 'CA', 'AU'];
  const routeOpts = routes.map(r => `<option value="${r}">${r}</option>`).join('');

  document.getElementById('confirm-title').textContent = '生成 AI 规划';
  document.getElementById('confirm-body').innerHTML = `
    <div class="mb-3">
      <label class="form-label">申请方向（路线）</label>
      <select id="ai-route-select" class="form-select form-select-sm">
        ${routeOpts}
      </select>
    </div>
    <div class="alert alert-warning py-2 small">
      <i class="bi bi-shield-exclamation me-1"></i>
      AI 规划将调用 OpenAI API 处理学生（脱敏）数据。请确保已获取监护人同意。
      生成约需 15–30 秒。
    </div>`;

  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('confirm-modal'));
  modal.show();

  document.getElementById('confirm-ok').onclick = async () => {
    if (!acquireSubmit('generateAIPlan')) return;
    modal.hide();
    const routeFocus = [document.getElementById('ai-route-select')?.value || 'UK-UG'];

    const container = document.getElementById('ai-plan-tab-container');
    if (container) container.innerHTML = `<div class="text-center py-5">
      <div class="spinner-border text-warning mb-3"></div>
      <p class="text-muted">AI 规划生成中，请稍候（约 15–30 秒）...</p>
    </div>`;

    try {
      await POST(`/api/students/${studentId}/ai-plan/generate`, { route_focus: routeFocus });
      showSuccess('AI 规划草稿生成成功！');
      loadAIPlanTab(studentId);
    } catch (e) {
      showError('生成失败：' + e.message);
      if (container) container.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
    } finally {
      releaseSubmit('generateAIPlan');
    }
  };
}

async function openAIPlanModal(planId, studentId) {
  try {
    const plan = await GET(`/api/ai-plans/${planId}`);
    const planData = JSON.parse(plan.plan_json || '{}');
    const st = AI_STATUS_MAP[plan.status] || { label: plan.status, color: 'secondary' };
    const risks = planData.risk?.flags || [];
    const conf = planData.confidence || {};

    // Status bar
    document.getElementById('ai-plan-status-badge').innerHTML = `<span class="badge bg-${st.color}">${st.label}</span>`;
    document.getElementById('ai-plan-meta-info').textContent =
      `生成于 ${fmtDate(plan.created_at)}  •  模型: ${plan.model || '—'}  •  版本: ${plan.prompt_version || '—'}`;
    document.getElementById('ai-plan-risk-summary').innerHTML = risks.length
      ? `<span class="badge bg-danger-subtle text-danger-emphasis border"><i class="bi bi-exclamation-triangle me-1"></i>${risks.length} 项风险</span>`
      : `<span class="badge bg-success-subtle text-success-emphasis border"><i class="bi bi-check-circle me-1"></i>无风险标志</span>`;

    // Parent view
    const pv = planData.parent_view || {};
    document.getElementById('ai-parent-view-content').innerHTML = `
      <div class="mb-4">
        <h6 class="text-muted small fw-bold text-uppercase mb-2">执行摘要</h6>
        <p>${escHtml(pv.executive_summary || '')}</p>
      </div>
      ${(pv.roadmap_sections || []).map(s => `
        <div class="mb-4">
          <h6 class="fw-semibold"><i class="bi bi-arrow-right-circle-fill text-primary me-2"></i>${escHtml(s.title)}</h6>
          <p class="text-muted">${escHtml(s.content).replace(/\n/g, '<br>')}</p>
        </div>`).join('')}
      ${risks.length ? `<div class="alert alert-warning mt-3">
        <strong><i class="bi bi-exclamation-triangle me-1"></i>风险提示</strong>
        <ul class="mb-0 mt-2">${risks.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>
      </div>` : ''}
      <div class="border-top pt-3 mt-4">
        <small class="text-muted fst-italic">${escHtml(pv.disclaimer || '')}</small>
      </div>`;

    // Counselor view
    const cv = planData.counselor_view || {};
    document.getElementById('ai-counselor-view-content').innerHTML = `
      <div class="row g-4">
        <div class="col-md-4">
          <h6 class="fw-semibold"><i class="bi bi-check-square me-1 text-success"></i>规划假设</h6>
          <ul class="small">${(cv.assumptions || []).map(a => `<li>${escHtml(a)}</li>`).join('')}</ul>
        </div>
        <div class="col-md-4">
          <h6 class="fw-semibold"><i class="bi bi-question-circle me-1 text-warning"></i>数据缺口</h6>
          <ul class="small">${(cv.data_gaps || []).map(d => `<li>${escHtml(d)}</li>`).join('')}</ul>
        </div>
        <div class="col-md-4">
          <h6 class="fw-semibold"><i class="bi bi-lightbulb me-1 text-primary"></i>推荐依据</h6>
          <ul class="small">${(cv.rationale || []).map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="mt-3 p-3 bg-light rounded small">
        <strong>置信度：</strong> <span class="badge bg-${conf.level === 'high' ? 'success' : conf.level === 'medium' ? 'warning' : 'secondary'}">${conf.level || '—'}</span>
        &nbsp; ${escHtml(conf.note || '')}
      </div>`;

    // Apply tab
    const af = planData.auto_fill || {};
    const alreadyApplied = plan.status === 'published' ? '' :
      `<div class="alert alert-info small py-2 mb-3">勾选要写入系统的内容，点击"应用到系统"。此操作不可撤销。</div>`;
    document.getElementById('ai-apply-content').innerHTML = alreadyApplied + `
      <h6 class="fw-semibold mb-2">目标院校 (${(af.targets||[]).length} 所)</h6>
      ${(af.targets||[]).length ? `<table class="table table-sm table-hover mb-4"><thead class="table-light"><tr><th>选</th><th>院校</th><th>专业</th><th>梯度</th><th>推荐理由</th></tr></thead><tbody>
        ${(af.targets||[]).map((t,i) => `<tr>
          <td><input type="checkbox" class="ai-apply-check" data-section="targets" data-idx="${i}" checked></td>
          <td class="fw-semibold">${escHtml(t.uni_name)}</td>
          <td>${escHtml(t.department)}</td>
          <td><span class="badge bg-secondary">${escHtml(t.tier)}</span></td>
          <td class="small text-muted">${escHtml(t.rationale)}</td>
        </tr>`).join('')}
      </tbody></table>` : '<p class="text-muted small">无</p>'}

      <h6 class="fw-semibold mb-2">时间线模板 (${(af.template_applications||[]).length} 套)</h6>
      ${(af.template_applications||[]).length ? `<table class="table table-sm table-hover mb-4"><thead class="table-light"><tr><th>选</th><th>模板名称</th><th>基准截止日</th><th>梯度</th></tr></thead><tbody>
        ${(af.template_applications||[]).map((t,i) => `<tr>
          <td><input type="checkbox" class="ai-apply-check" data-section="template_applications" data-idx="${i}" checked></td>
          <td>${escHtml(t.template_name)}</td>
          <td>${t.base_deadline_iso ? t.base_deadline_iso.slice(0,10) : '—'}</td>
          <td><span class="badge bg-secondary">${escHtml(t.tier)}</span></td>
        </tr>`).join('')}
      </tbody></table>` : '<p class="text-muted small">无</p>'}

      <h6 class="fw-semibold mb-2">自定义任务 (${(af.custom_tasks||[]).length} 条)</h6>
      ${(af.custom_tasks||[]).length ? `<table class="table table-sm table-hover mb-4"><thead class="table-light"><tr><th>选</th><th>任务</th><th>分类</th><th>截止日</th><th>优先级</th></tr></thead><tbody>
        ${(af.custom_tasks||[]).map((t,i) => `<tr>
          <td><input type="checkbox" class="ai-apply-check" data-section="custom_tasks" data-idx="${i}" checked></td>
          <td>${escHtml(t.title)}</td>
          <td>${escHtml(t.category)}</td>
          <td>${t.due_iso ? t.due_iso.slice(0,10) : '—'}</td>
          <td><span class="badge bg-${t.priority==='high'?'danger':t.priority==='low'?'info':'secondary'}">${t.priority}</span></td>
        </tr>`).join('')}
      </tbody></table>` : '<p class="text-muted small">无</p>'}

      <h6 class="fw-semibold mb-2">申请草稿 (${(af.draft_applications||[]).length} 条)</h6>
      ${(af.draft_applications||[]).length ? `<table class="table table-sm table-hover mb-4"><thead class="table-light"><tr><th>选</th><th>院校</th><th>专业</th><th>通道</th><th>梯度</th><th>截止日</th></tr></thead><tbody>
        ${(af.draft_applications||[]).map((t,i) => `<tr>
          <td><input type="checkbox" class="ai-apply-check" data-section="draft_applications" data-idx="${i}" checked></td>
          <td class="fw-semibold">${escHtml(t.uni_name)}</td>
          <td>${escHtml(t.department)}</td>
          <td><span class="badge bg-info text-dark">${escHtml(t.route)}</span></td>
          <td><span class="badge bg-secondary">${escHtml(t.tier)}</span></td>
          <td>${t.deadline_iso ? t.deadline_iso.slice(0,10) : '—'}</td>
        </tr>`).join('')}
      </tbody></table>` : '<p class="text-muted small">无</p>'}`;

    // Footer action buttons
    const footer = document.getElementById('ai-plan-action-btns');
    footer.innerHTML = '';
    if (plan.status === 'draft') {
      footer.innerHTML += `<button class="btn btn-warning" onclick="approveAIPlan('${planId}','${studentId}',true)"><i class="bi bi-check-lg me-1"></i>批准规划</button>`;
    }
    if (plan.status === 'approved') {
      footer.innerHTML += `<button class="btn btn-success me-2" onclick="applyAIPlan('${planId}','${studentId}')"><i class="bi bi-database-fill-up me-1"></i>应用到系统</button>`;
      footer.innerHTML += `<button class="btn btn-primary" onclick="publishAIPlan('${planId}','${studentId}',true)"><i class="bi bi-send me-1"></i>发布给家长</button>`;
    }

    // Store current context for modal actions
    window._aiPlanModalCtx = { planId, studentId };

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('ai-plan-modal'));
    modal.show();
  } catch (e) {
    showError('加载规划失败：' + e.message);
  }
}

// escHtml: see escapeHtml() at top of file (same function, keeps old call sites working)
const escHtml = escapeHtml;

async function approveAIPlan(planId, studentId, fromModal = false) {
  confirmAction('确认批准此 AI 规划草稿？批准后规划师可将其发布给家长/学生查看。', async () => {
    try {
      await PUT(`/api/ai-plans/${planId}/approve`, {});
      showSuccess('规划已批准！');
      if (fromModal) { bootstrap.Modal.getInstance(document.getElementById('ai-plan-modal'))?.hide(); }
      loadAIPlanTab(studentId);
    } catch (e) { showError(e.message); }
  });
}

async function applyAIPlan(planId, studentId) {
  // Collect selected sections from checkboxes
  const checked = document.querySelectorAll('.ai-apply-check:checked');
  const selected = [...new Set([...checked].map(c => c.dataset.section))];
  if (selected.length === 0) { showError('请至少选择一项要应用的内容'); return; }
  confirmAction(`确定将选中的 ${selected.length} 类内容写入系统？此操作不可撤销，请确认 AI 规划内容准确后再应用。`, async () => {
    try {
      const r = await POST(`/api/ai-plans/${planId}/apply`, { selected_sections: selected });
      showSuccess(`已应用：目标院校 ${r.counts.targets} 所 / 模板任务 ${r.counts.templates} 条 / 自定义任务 ${r.counts.tasks} 条 / 申请草稿 ${r.counts.applications} 条`);
      bootstrap.Modal.getInstance(document.getElementById('ai-plan-modal'))?.hide();
      loadAIPlanTab(studentId);
    } catch (e) { showError(e.message); }
  }, { danger: true });
}

async function publishAIPlan(planId, studentId, fromModal = false) {
  confirmAction('确认发布规划给家长/学生查看？发布后家长将可见此规划内容。', async () => {
    try {
      await PUT(`/api/ai-plans/${planId}/publish`, {});
      showSuccess('规划已发布！');
      if (fromModal) { bootstrap.Modal.getInstance(document.getElementById('ai-plan-modal'))?.hide(); }
      loadAIPlanTab(studentId);
    } catch (e) { showError(e.message); }
  });
}

async function archiveAIPlan(planId, studentId) {
  confirmAction('确认存档此规划？存档后将不可修改或重新发布。', async () => {
    try {
      await PUT(`/api/ai-plans/${planId}/archive`, {});
      showSuccess('规划已存档');
      loadAIPlanTab(studentId);
    } catch (e) { showError(e.message); }
  });
}

// ════════════════════════════════════════════════════════
//  应用启动
// ════════════════════════════════════════════════════════
async function start() {
  applyStoredPrefs(); // 立即应用外观偏好（深色模式、主题色等）
  bindEvents();
  // 检查是否已登录
  try {
    const res = await GET('/api/auth/me');
    State.user = res.user;
    // 加载系统设置
    try { State.settings = await GET('/api/settings'); } catch(e) {}
    initApp();
  } catch(e) {
    // 未登录，显示登录页
    document.getElementById('login-page').classList.remove('d-none');
    document.getElementById('app').classList.add('d-none');
  }
}

// Alias for navigate (used by intake pages)
function showPage(page, params) { navigate(page, params || {}); }

// ══════════════════════════════════════════════════════
//  INTAKE DASHBOARD
// ══════════════════════════════════════════════════════
async function renderIntakeDashboard() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>';
  let data;
  try {
    data = await api('GET', '/api/intake-dashboard');
  } catch(e) {
    main.innerHTML = `<div class="alert alert-danger m-4">数据加载失败: ${escapeHtml(e.message)}</div>`;
    return;
  }
  const role = State.user.role;
  const isPrincipal    = role === 'principal';
  const isStudentAdmin = role === 'student_admin';
  const statusMap  = { registered:'已注册', collecting_docs:'收集材料中', contract_signed:'合同已签', paid:'已付款', visa_in_progress:'签证办理中', ipa_received:'已获IPA', arrived:'已到校', oriented:'已入学', closed:'已关闭' };
  const statusColor = { registered:'secondary', collecting_docs:'info', contract_signed:'primary', paid:'success', visa_in_progress:'warning', ipa_received:'success', arrived:'primary', oriented:'success', closed:'dark' };

  const upcomingTasksHtml = (tasks) => (tasks||[]).length
    ? (tasks||[]).map(t => `
      <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
        <div style="min-width:0">
          <div class="fw-semibold small text-truncate">${escapeHtml(t.title)}</div>
          <div class="text-muted" style="font-size:0.75rem">${escapeHtml(t.student_name||'')} · ${fmtDate(t.due_date)}</div>
        </div>
        <button class="btn btn-sm btn-outline-danger py-0 ms-2 flex-shrink-0" onclick="navigate('task-detail',{taskId:'${t.id}'})">查看</button>
      </div>`).join('')
    : '<div class="text-muted text-center py-3 small">近7天无到期任务</div>';

  // ── student_admin（小明）：到校后视图 ──
  if (isStudentAdmin) {
    main.innerHTML = `
      <div class="page-header mb-4">
        <h4><i class="bi bi-mortarboard me-2"></i>学管工作台</h4>
        <div class="page-header-actions">
          <button class="btn btn-primary btn-sm" onclick="navigate('intake-cases')"><i class="bi bi-list me-1"></i>查看我的学生</button>
        </div>
      </div>
      <div class="row g-3 mb-4">
        <div class="col-6 col-md-3">
          <div class="stat-card bg-primary text-white" style="cursor:pointer" onclick="navigate('intake-cases')">
            <div class="stat-icon"><i class="bi bi-person-check-fill"></i></div>
            <div class="stat-value">${data.arrivedCount||0}</div>
            <div class="stat-label">已到校·待跟进</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="stat-card bg-success text-white">
            <div class="stat-icon"><i class="bi bi-mortarboard-fill"></i></div>
            <div class="stat-value">${data.orientedCount||0}</div>
            <div class="stat-label">已完成入学</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="stat-card ${(data.overdueMyTasks||0)>0?'bg-danger':'bg-success'} text-white">
            <div class="stat-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
            <div class="stat-value">${data.overdueMyTasks||0}</div>
            <div class="stat-label">我的逾期任务</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="stat-card bg-info text-white">
            <div class="stat-icon"><i class="bi bi-calendar-check"></i></div>
            <div class="stat-value">${data.thisMonthOriented||0}</div>
            <div class="stat-label">本月已入学</div>
          </div>
        </div>
      </div>
      <div class="row g-3">
        <div class="col-md-6">
          <div class="card border-primary h-100">
            <div class="card-header fw-semibold text-primary"><i class="bi bi-person-check me-1"></i>待接收学生（已到校）</div>
            <div class="card-body p-0">
              ${(data.pendingOrientation||[]).length
                ? data.pendingOrientation.map(c => `
                  <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
                    <div>
                      <div class="fw-semibold small">${escapeHtml(c.student_name||'')}</div>
                      <div class="text-muted" style="font-size:0.75rem">${escapeHtml(c.program_name||'')} · 到校 ${c.updated_at?new Date(c.updated_at).toLocaleDateString('zh-CN'):''}</div>
                    </div>
                    <button class="btn btn-sm btn-primary py-0 ms-2 flex-shrink-0" onclick="showCaseDetail('${c.id}')">开始跟进</button>
                  </div>`).join('')
                : '<div class="text-muted text-center py-4 small"><i class="bi bi-check-circle me-1 text-success"></i>暂无待接收学生</div>'}
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card border-danger h-100">
            <div class="card-header fw-semibold text-danger"><i class="bi bi-clock-history me-1"></i>7天内到期任务</div>
            <div class="card-body p-0">${upcomingTasksHtml(data.upcomingTasks)}</div>
          </div>
        </div>
      </div>`;
    return;
  }

  // ── intake_staff（关）：入学前视图 ──
  const intakeStaffStatusCards = isPrincipal ? '' : `
    <div class="col-6 col-md-3">
      <div class="stat-card bg-primary text-white">
        <div class="stat-icon"><i class="bi bi-person-lines-fill"></i></div>
        <div class="stat-value">${data.total||0}</div>
        <div class="stat-label">进行中案例</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="stat-card ${(data.overdueTasks||0)>0?'bg-danger':'bg-success'} text-white">
        <div class="stat-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
        <div class="stat-value">${data.overdueTasks||0}</div>
        <div class="stat-label">我的逾期任务</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="stat-card bg-warning text-dark">
        <div class="stat-icon"><i class="bi bi-calendar-x"></i></div>
        <div class="stat-value">${data.ipaExpiringSoon?.length||0}</div>
        <div class="stat-label">IPA 即将到期</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="stat-card bg-success text-white">
        <div class="stat-icon"><i class="bi bi-person-plus-fill"></i></div>
        <div class="stat-value">${data.thisMonthNew?.cnt||0}</div>
        <div class="stat-label">本月新增案例</div>
      </div>
    </div>`;

  const principalStatCards = !isPrincipal ? '' : `
    <div class="col-6 col-md-3">
      <div class="stat-card bg-primary text-white">
        <div class="stat-icon"><i class="bi bi-person-lines-fill"></i></div>
        <div class="stat-value">${data.total||0}</div>
        <div class="stat-label">进行中案例</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="stat-card ${(data.overdueTasks||0)>0?'bg-danger':'bg-success'} text-white">
        <div class="stat-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
        <div class="stat-value">${data.overdueTasks||0}</div>
        <div class="stat-label">逾期任务</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="stat-card ${(data.unpaidInvoices?.cnt||0)>0?'bg-danger':'bg-success'} text-white">
        <div class="stat-icon"><i class="bi bi-receipt-cutoff"></i></div>
        <div class="stat-value">${data.unpaidInvoices?.cnt||0}</div>
        <div class="stat-label">未结账单 · ${(data.unpaidInvoices?.total||0).toFixed(0)} SGD</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="stat-card bg-info text-white">
        <div class="stat-icon"><i class="bi bi-currency-dollar"></i></div>
        <div class="stat-value">${data.pendingCommissions?.cnt||0}</div>
        <div class="stat-label">待审佣金 · ${(data.pendingCommissions?.total||0).toFixed(0)} SGD</div>
      </div>
    </div>`;

  main.innerHTML = `
    <div class="page-header mb-4">
      <h4><i class="bi bi-house-door me-2"></i>入学总览</h4>
      <div class="page-header-actions">
        <button class="btn btn-primary btn-sm" onclick="navigate('intake-cases')"><i class="bi bi-list me-1"></i>所有案例</button>
      </div>
    </div>
    <div class="row g-3 mb-4">${isPrincipal ? principalStatCards : intakeStaffStatusCards}</div>
    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <div class="card h-100">
          <div class="card-header fw-semibold">案例状态分布</div>
          <div class="card-body">
            ${(data.byStatus||[]).map(s => {
              const totalAll = (data.byStatus||[]).reduce((a,b)=>a+b.cnt,0)||1;
              const pct = Math.round(s.cnt/totalAll*100);
              return `<div class="mb-2">
                <div class="d-flex justify-content-between mb-1">
                  <span class="badge bg-${statusColor[s.status]||'secondary'}">${statusMap[s.status]||s.status}</span>
                  <span class="fw-bold">${s.cnt}</span>
                </div>
                <div class="progress" style="height:5px"><div class="progress-bar bg-${statusColor[s.status]||'secondary'}" style="width:${pct}%"></div></div>
              </div>`;
            }).join('')||'<div class="text-muted text-center py-3 small">暂无案例</div>'}
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card border-warning h-100">
          <div class="card-header fw-semibold text-warning"><i class="bi bi-exclamation-triangle me-1"></i>IPA 即将到期（30天内）</div>
          <div class="card-body p-0">
            ${(data.ipaExpiringSoon||[]).length ? (data.ipaExpiringSoon||[]).map(v => `
              <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
                <div>
                  <div class="fw-semibold small">${escapeHtml(v.student_name||'')}</div>
                  <div class="text-muted" style="font-size:0.75rem">${escapeHtml(v.program_name||'')} · ${v.ipa_expiry_date}</div>
                </div>
                <button class="btn btn-sm btn-outline-warning py-0" onclick="showCaseDetail('${v.case_id}')">查看</button>
              </div>`).join('')
            : '<div class="text-muted text-center py-3 small">暂无即将到期的IPA</div>'}
          </div>
        </div>
      </div>
      <div class="col-md-4">
        ${isPrincipal
          ? `<div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-funnel me-1 text-info"></i>渠道来源转化</div>
              <div class="card-body">
                ${(data.channelFunnel||[]).length ? data.channelFunnel.map(ch => {
                  const srcMap2 = { agent:'代理机构', personal:'个人推荐', organic:'自然流量' };
                  const rate = ch.total>0?Math.round(ch.converted/ch.total*100):0;
                  return `<div class="mb-3">
                    <div class="d-flex justify-content-between mb-1">
                      <span class="small fw-semibold">${srcMap2[ch.source_type]||ch.source_type}</span>
                      <span class="small text-muted">${ch.converted}/${ch.total} · ${rate}%</span>
                    </div>
                    <div class="progress" style="height:6px"><div class="progress-bar bg-info" style="width:${rate}%"></div></div>
                  </div>`;}).join('')
                : '<div class="text-muted text-center py-3 small">暂无渠道数据</div>'}
              </div>
            </div>`
          : `<div class="card border-danger h-100">
              <div class="card-header fw-semibold text-danger"><i class="bi bi-clock-history me-1"></i>7天内到期任务</div>
              <div class="card-body p-0">${upcomingTasksHtml(data.upcomingTasks)}</div>
            </div>`}
      </div>
    </div>
    ${isPrincipal && (data.agentPerformance||[]).length ? `
    <div class="card">
      <div class="card-header fw-semibold"><i class="bi bi-graph-up me-1 text-success"></i>代理绩效看板</div>
      <div class="table-responsive">
        <table class="table table-sm mb-0 align-middle">
          <thead class="table-light">
            <tr><th>代理/推荐人</th><th>类型</th><th>总案例</th><th>已签合同</th><th>已付款</th><th>转化率</th><th>待付佣金(SGD)</th><th>已付佣金(SGD)</th></tr>
          </thead>
          <tbody>
            ${data.agentPerformance.map(a => {
              const rate = a.total_cases>0?Math.round(a.signed_cases/a.total_cases*100):0;
              return `<tr>
                <td class="fw-semibold">${escapeHtml(a.name)}</td>
                <td><span class="badge bg-light text-dark border">${a.type==='agency'?'机构':'个人'}</span></td>
                <td>${a.total_cases}</td><td>${a.signed_cases}</td><td>${a.paid_cases}</td>
                <td><div class="d-flex align-items-center gap-1">
                  <div class="progress flex-grow-1" style="height:5px;min-width:50px"><div class="progress-bar bg-success" style="width:${rate}%"></div></div>
                  <span class="small">${rate}%</span></div></td>
                <td class="${a.pending_commission>0?'text-warning fw-bold':''}">${Number(a.pending_commission||0).toFixed(2)}</td>
                <td class="text-success">${Number(a.paid_commission||0).toFixed(2)}</td>
              </tr>`;}).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
  `;
}

// ══════════════════════════════════════════════════════
//  INTAKE CASES LIST
// ══════════════════════════════════════════════════════
async function renderIntakeCases(params = {}) {
  // 清理可能残留的 Bootstrap modal 遮罩，防止页面卡死
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="p-3"><div class="skeleton" style="height:36px;width:220px;border-radius:6px;margin-bottom:1rem"></div><table class="table"><tbody>${skeletonTableRows(7,6)}</tbody></table></div>`;
  let cases;
  try {
    const qs = params.student_id ? `?student_id=${encodeURIComponent(params.student_id)}` : '';
    cases = await api('GET', '/api/intake-cases' + qs);
  } catch(e) {
    main.innerHTML = `<div class="alert alert-danger m-4">案例数据加载失败: ${escapeHtml(e.message)}</div>`;
    return;
  }
  const statusMap = { registered:'已注册', collecting_docs:'收集材料中', contract_signed:'合同已签', paid:'已付款', visa_in_progress:'签证办理中', ipa_received:'已获IPA', arrived:'已到校', oriented:'已入学', closed:'已关闭' };
  const statusColor = { registered:'secondary', collecting_docs:'info', contract_signed:'primary', paid:'success', visa_in_progress:'warning', ipa_received:'success', arrived:'primary', oriented:'success', closed:'dark' };
  const isStudentAdminView = hasRole('student_admin');

  let _intakeFilter = 'all';
  const filterCases = () => {
    if (_intakeFilter === 'all') return cases;
    const grp = filterGroups.find(g => g.key === _intakeFilter);
    if (grp?.match) return cases.filter(c => grp.match.includes(c.status));
    return cases.filter(c => c.status === _intakeFilter);
  };

  // ── 学管视图：简化表格，聚焦到校后 ──
  const renderTableStudentAdmin = () => {
    const filtered = filterCases();
    const tbody = document.getElementById('intakeCaseTbody');
    if (!tbody) return;
    tbody.innerHTML = filtered.length ? filtered.map(c => {
      const isArrived = c.status === 'arrived';
      const rowClass = isArrived ? 'table-primary' : '';
      return `<tr class="${rowClass}">
        <td><div class="fw-semibold">${escapeHtml(c.student_name||'')}</div></td>
        <td>${escapeHtml(c.program_name||'')}</td>
        <td><span class="badge bg-${statusColor[c.status]||'secondary'}">${statusMap[c.status]||c.status}</span></td>
        <td class="text-muted small">${c.updated_at ? new Date(c.updated_at).toLocaleDateString('zh-CN') : '—'}</td>
        <td><button class="btn btn-sm btn-outline-primary" onclick="showCaseDetail('${c.id}')"><i class="bi bi-eye"></i></button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" class="text-center text-muted py-4">暂无需跟进的学生</td></tr>';
  };

  // ── 入学顾问/校长视图：完整表格 ──
  const visaStatusMap = { pending:'待办', submitted:'已提交', ipa_received:'已获IPA', approved:'已批准', rejected:'已拒签', expired:'已过期', not_required:'无需签证' };
  const renderTableFull = () => {
    const keyword = (document.getElementById('intakeSearchInput')?.value||'').trim().toLowerCase();
    let filtered = filterCases();
    if (keyword) filtered = filtered.filter(c => (c.student_name||'').toLowerCase().includes(keyword) || (c.program_name||'').toLowerCase().includes(keyword));
    const srcMap = { agent:'代理', personal:'推荐', organic:'自然' };
    const srcColor = { agent:'primary', personal:'info', organic:'secondary' };
    const tbody = document.getElementById('intakeCaseTbody');
    if (!tbody) return;
    tbody.innerHTML = filtered.length ? filtered.map(c => {
      const srcLabel = c.agent_name ? escapeHtml(c.agent_name) : (srcMap[c.referral_type]||'—');
      const srcBg = c.referral_type ? (srcColor[c.referral_type]||'secondary') : 'light text-dark border';
      const visaLabel = visaStatusMap[c.visa_status] || c.visa_status || '—';
      const visaBg = c.visa_status === 'approved' || c.visa_status === 'ipa_received' ? 'success' : c.visa_status === 'rejected' || c.visa_status === 'expired' ? 'danger' : 'secondary';
      const ipaInvoiceHtml = [
        c.ipa_expiry_date ? `<div class="small ${new Date(c.ipa_expiry_date)<new Date()?'text-danger fw-bold':'text-muted'}">IPA: ${c.ipa_expiry_date}</div>` : '',
        c.invoice_status ? `<span class="badge bg-${c.invoice_status==='paid'?'success':c.invoice_status==='unpaid'?'danger':'warning'} text-xs">${c.invoice_status==='paid'?'已付':c.invoice_status==='unpaid'?'未付':'部分付'}</span>` : '',
      ].filter(Boolean).join('') || '—';
      return `<tr>
        <td><div class="fw-semibold">${escapeHtml(c.student_name||'')}</div><div class="text-xs text-muted">${c.intake_year||''}</div></td>
        <td>${escapeHtml(c.program_name||'')}</td>
        <td>${c.referral_type ? `<span class="badge bg-${srcBg}" title="${srcMap[c.referral_type]||c.referral_type}">${srcLabel}</span>` : '<span class="text-muted">—</span>'}</td>
        <td><span class="badge bg-${statusColor[c.status]||'secondary'}">${statusMap[c.status]||c.status}</span>
          ${c.review_status && c.review_status !== 'draft' ? `<br>${admReviewBadge(c.review_status)}` : ''}</td>
        <td><span class="badge bg-${visaBg} text-xs">${visaLabel}</span></td>
        <td>${ipaInvoiceHtml}</td>
        <td><div class="d-flex gap-1 justify-content-center">
          <button class="btn btn-sm btn-outline-primary" onclick="showCaseDetail('${c.id}')"><i class="bi bi-eye"></i></button>
          ${hasRole('principal','intake_staff') ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteIntakeCase('${c.id}','${escapeHtml(c.student_name||'')}')"><i class="bi bi-trash3"></i></button>` : ''}
        </div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="text-center text-muted py-4">暂无案例</td></tr>';
  };

  const renderTable = isStudentAdminView ? renderTableStudentAdmin : renderTableFull;

  // 状态筛选chip组（角色差异化）
  // 筛选组：合并相近状态为阶段组，减少按钮数量
  const filterGroups = isStudentAdminView
    ? [
        { key:'all', label:'全部' },
        { key:'arrived', label:'待跟进' },
        { key:'oriented', label:'已入学' },
        { key:'closed', label:'已关闭' },
      ]
    : [
        { key:'all', label:'全部' },
        { key:'_pre', label:'前期', match:['registered','collecting_docs','contract_signed'] },
        { key:'_visa', label:'签证', match:['visa_in_progress','ipa_received'] },
        { key:'_post', label:'付款到校', match:['paid','arrived'] },
        { key:'oriented', label:'已入学' },
        { key:'closed', label:'已关闭' },
      ];

  // 计算分组计数
  const _filterCount = (f) => {
    if (f.key==='all') return cases.length;
    if (f.match) return cases.filter(c=>f.match.includes(c.status)).length;
    return cases.filter(c=>c.status===f.key).length;
  };
  const filterBarHtml = '';

  const tableHeaders = isStudentAdminView
    ? '<th>学生</th><th>课程/项目</th><th>状态</th><th>最后更新</th><th>操作</th>'
    : '<th>学生 / 学年</th><th>课程/项目</th><th>来源渠道</th><th>状态</th><th>签证</th><th>IPA到期 / 账单</th><th class="text-center">操作</th>';

  const arrivedCount = cases.filter(c => c.status === 'arrived').length;

  // ── Master-Detail 布局：左侧卡片列表 + 右侧详情面板 ──
  const renderCardList = () => {
    const keyword = (document.getElementById('intakeSearchInput')?.value||'').trim().toLowerCase();
    let filtered = filterCases();
    if (keyword) filtered = filtered.filter(c => (c.student_name||'').toLowerCase().includes(keyword) || (c.program_name||'').toLowerCase().includes(keyword));
    const list = document.getElementById('intakeCaseList');
    if (!list) return;
    list.innerHTML = filtered.length ? filtered.map(c => {
      const isActive = State.currentCaseId === c.id;
      return `<div class="case-card ${isActive?'active':''}" onclick="showCaseDetail('${c.id}')" data-case-id="${c.id}">
        <div class="case-card-name">${escapeHtml(c.student_name||'')}</div>
        <div class="case-card-sub">${escapeHtml(c.program_name||'')} · ${statusMap[c.status]||c.status}</div>
      </div>`;
    }).join('') : '<div class="text-center text-muted py-4" style="font-size:.85rem">暂无案例</div>';
  };

  main.innerHTML = `
    <div class="intake-master-detail">
      <!-- 左侧列表面板 -->
      <div class="intake-list-panel">
        <div class="intake-list-header">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span style="font-size:.85rem;font-weight:600;color:#334155">${isStudentAdminView ? '我的学生' : '入学案例'} <span style="color:#94a3b8;font-weight:400">${cases.length}</span></span>
            ${hasRole('principal','intake_staff','counselor') ? `
              <button class="btn btn-primary btn-sm" onclick="showCreateIntakeModal()" style="padding:2px 8px;font-size:.75rem"><i class="bi bi-plus-lg"></i></button>` : ''}
          </div>
          <div class="input-group input-group-sm mb-2">
            <span class="input-group-text" style="background:#f8fafc;border-right:0"><i class="bi bi-search text-muted" style="font-size:.75rem"></i></span>
            <input type="text" class="form-control" id="intakeSearchInput" placeholder="搜索..." style="border-left:0;font-size:.8rem" oninput="window._intakeCaseRenderTable&&window._intakeCaseRenderTable()">
          </div>
          <div class="d-flex gap-1 flex-wrap">${filterGroups.map(f =>
            `<button class="btn btn-sm${f.key==='all'?' active-filter':''}" data-fkey="${f.key}" onclick="_intakeCaseFilter('${f.key}')" style="font-size:.7rem;padding:1px 7px">${f.label} <span style="opacity:.5">${_filterCount(f)}</span></button>`
          ).join('')}</div>
        </div>
        <div class="intake-list-body" id="intakeCaseList"></div>
      </div>
      <!-- 右侧详情面板 -->
      <div class="intake-detail-panel" id="intakeDetailPanel">
        <div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted" style="min-height:400px">
          <i class="bi bi-arrow-left-circle" style="font-size:3rem;opacity:.2"></i>
          <div class="mt-2" style="font-size:.9rem">选择一个案例查看详情</div>
        </div>
      </div>
    </div>
  `;
  window._intakeCaseRenderTable = renderCardList;
  renderCardList();

  window._intakeCaseFilter = (key) => {
    _intakeFilter = key;
    document.querySelectorAll('.intake-list-header button[data-fkey]').forEach(b => {
      // CSS 会自动处理 active 样式 — 此处只需切换 class
      b.classList.toggle('active-filter', b.dataset.fkey === key);
    });
    renderCardList();
  };

  // 如果之前有选中的案例，自动加载
  if (State.currentCaseId) showCaseDetail(State.currentCaseId);
}

function toggleProgramOther(el) {
  const other = document.getElementById('createIntakeProgramOther');
  if (!other) return;
  if (el.value === '__other__') {
    other.classList.remove('d-none');
    other.focus();
  } else {
    other.classList.add('d-none');
    other.value = '';
  }
}

// ════════════════════════════════════════════════════════
//  CASE FILES — 文件发送/回收/签字 前端函数
// ════════════════════════════════════════════════════════

// 上传案例文件（通用弹窗）
function showUploadCaseFileModal(caseId, defaultType, defaultName) {
  const typeOptions = [
    { v:'offer_letter', l:'录取通知书' },
    { v:'contract',     l:'合同' },
    { v:'signed_contract', l:'已签合同' },
    { v:'ipa',          l:'IPA文件' },
    { v:'visa_form',    l:'签证表格' },
    { v:'invoice_file', l:'账单文件' },
    { v:'other',        l:'其他' },
  ];
  showModal('上传案例文件', `
    <div class="mb-3">
      <label class="form-label">文件类型 <span class="text-danger">*</span></label>
      <select class="form-select" id="cf-type">
        ${typeOptions.map(o => `<option value="${o.v}" ${o.v===defaultType?'selected':''}>${o.l}</option>`).join('')}
      </select>
    </div>
    <div class="mb-3">
      <label class="form-label">文件名称 <span class="text-danger">*</span></label>
      <input type="text" class="form-control" id="cf-name" value="${escapeHtml(defaultName||'')}" placeholder="如：2026年入学录取通知书">
    </div>
    <div class="mb-3">
      <label class="form-label">选择文件 <span class="text-danger">*</span></label>
      <input type="file" class="form-control" id="cf-file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip">
      <div class="form-text">支持 PDF / Word / 图片 / ZIP，最大 10MB</div>
    </div>
    <div class="mb-3">
      <label class="form-label">备注</label>
      <input type="text" class="form-control" id="cf-notes" placeholder="可选">
    </div>
  `, async () => {
    const file = document.getElementById('cf-file').files[0];
    const name = document.getElementById('cf-name').value.trim();
    const type = document.getElementById('cf-type').value;
    if (!file || !name) { showError('请填写文件名称并选择文件'); return false; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('file_type', type);
    fd.append('display_name', name);
    fd.append('notes', document.getElementById('cf-notes').value);
    try {
      await apiFd('POST', `/api/intake-cases/${caseId}/case-files`, fd);
      showSuccess('文件已上传');
      setTimeout(() => _refreshCaseDetail(caseId), 400);
    } catch(e) { showError(e.message); return false; }
  }, '上传');
}

// 发送文件给学生（生成查看链接 + 可选邮件）
function sendCaseFile(fileId, caseId, withWatermark = false, watermarkText = '仅供查看') {
  showModal('发送文件给学生', `
    <div class="mb-3">
      <label class="form-label">学生邮箱（选填，填写后自动发邮件）</label>
      <input type="email" class="form-control" id="sf-email" placeholder="student@example.com">
    </div>
    <div class="mb-3">
      <label class="form-label">学生姓名</label>
      <input type="text" class="form-control" id="sf-name" placeholder="学生姓名（可选）">
    </div>
    ${withWatermark ? `<div class="alert alert-warning py-2 small"><i class="bi bi-droplet me-1"></i>将发送带水印版本（"${escapeHtml(watermarkText)}"）</div>` : ''}
  `, async () => {
    try {
      const res = await api('POST', `/api/case-files/${fileId}/send`, {
        student_email: document.getElementById('sf-email').value.trim() || undefined,
        student_name: document.getElementById('sf-name').value.trim() || undefined,
        with_watermark: withWatermark ? 1 : 0,
        watermark_text: watermarkText,
      });
      // 显示链接
      showSuccess('链接已生成' + (document.getElementById('sf-email').value ? '，邮件已发送' : ''));
      // 复制链接到剪贴板
      if (res.url) {
        try { await navigator.clipboard.writeText(res.url); showSuccess('链接已复制到剪贴板'); } catch(e) {}
      }
      setTimeout(() => _refreshCaseDetail(caseId), 600);
    } catch(e) { showError(e.message); return false; }
  }, '确认发送');
}

// 删除案例文件
function deleteCaseFile(fileId, caseId) {
  confirmAction('确认删除此文件？删除后无法恢复，相关发送记录也将一并删除。', async () => {
    try {
      await api('DELETE', `/api/case-files/${fileId}`);
      showSuccess('文件已删除');
      _refreshCaseDetail(caseId);
    } catch(e) { showError(e.message); }
  });
}

// 生成学生上传已签合同链接
async function genContractUploadLink(caseId) {
  const box = document.getElementById(`upload-link-box-${caseId}`);
  try {
    const res = await api('POST', `/api/intake-cases/${caseId}/contract-upload-link`, {
      student_name: '',
    });
    const input = document.getElementById(`upload-link-text-${caseId}`);
    if (input) input.value = res.url;
    if (box) box.classList.remove('d-none');
    showSuccess('上传链接已生成');
  } catch(e) { showError(e.message); }
}

// 发送上传链接至学生邮箱
async function sendUploadLinkByEmail(caseId) {
  const email = document.getElementById(`upload-link-email-${caseId}`)?.value?.trim();
  if (!email) { showError('请填写学生邮箱'); return; }
  const url = document.getElementById(`upload-link-text-${caseId}`)?.value;
  if (!url) { showError('请先生成链接'); return; }
  try {
    await api('POST', `/api/intake-cases/${caseId}/contract-upload-link`, { student_email: email });
    showSuccess('邮件已发送');
  } catch(e) { showError(e.message); }
}

// 复制签字链接
function copySignLink(token) {
  const url = `${location.origin}/s/sign/${token}`;
  navigator.clipboard.writeText(url).then(() => showSuccess('签字链接已复制')).catch(() => {
    prompt('请手动复制链接：', url);
  });
}

// 复制文本框内容
function copyText(inputId) {
  const el = document.getElementById(inputId);
  if (el) {
    navigator.clipboard.writeText(el.value).then(() => showSuccess('已复制')).catch(() => {
      el.select(); document.execCommand('copy'); showSuccess('已复制');
    });
  }
}

// 发送签字请求弹窗
function showCreateSignatureModal(caseId) {
  showModal('发送签字请求', `
    <div class="mb-3">
      <label class="form-label">签字标题 <span class="text-danger">*</span></label>
      <input type="text" class="form-control" id="sig-title" placeholder="如：入学申请授权确认书" value="入学申请签字确认">
    </div>
    <div class="mb-3">
      <label class="form-label">说明（学生可见）</label>
      <textarea class="form-control" id="sig-desc" rows="2" placeholder="请说明签字目的..."></textarea>
    </div>
    <div class="mb-3">
      <label class="form-label">学生姓名</label>
      <input type="text" class="form-control" id="sig-name" placeholder="可选">
    </div>
    <div class="mb-3">
      <label class="form-label">学生邮箱（选填，填写后自动发邮件）</label>
      <input type="email" class="form-control" id="sig-email" placeholder="student@example.com">
    </div>
  `, async () => {
    const title = document.getElementById('sig-title').value.trim();
    if (!title) { showError('请填写签字标题'); return false; }
    try {
      const res = await api('POST', `/api/intake-cases/${caseId}/signature-requests`, {
        title,
        description: document.getElementById('sig-desc').value.trim(),
        student_name: document.getElementById('sig-name').value.trim() || undefined,
        student_email: document.getElementById('sig-email').value.trim() || undefined,
      });
      showSuccess('签字请求已发送');
      if (res.url) {
        try { await navigator.clipboard.writeText(res.url); showSuccess('签字链接已复制到剪贴板'); } catch(e) {}
      }
      setTimeout(() => _refreshCaseDetail(caseId), 600);
    } catch(e) { showError(e.message); return false; }
  }, '发送');
}

// 辅助：multipart form-data POST
async function apiFd(method, url, formData) {
  const res = await fetch(url, { method, body: formData, credentials: 'include' });
  let data = {};
  try { data = await res.json(); } catch(e) {
    if (!res.ok) throw new Error(`请求失败 (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

// ─── File Exchange Center helpers ────────────────────────────────────────────
// Alias: refreshes the current case detail page
async function loadCaseDetail(_caseId) {
  // 记住当前活跃的 Tab（刷新后恢复）
  const activeTab = document.querySelector('#fcTabs .nav-link.active')?.getAttribute('href');
  if (activeTab) window._fcActiveTab = activeTab;
  await renderIntakeCaseDetail();
  // 恢复 Tab
  if (window._fcActiveTab) {
    const tab = document.querySelector(`#fcTabs .nav-link[href="${window._fcActiveTab}"]`);
    if (tab) { new bootstrap.Tab(tab).show(); }
  }
}

function copyToClipboard(text, successMsg = '已复制') {
  navigator.clipboard.writeText(text).then(() => showSuccess(successMsg)).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); showSuccess(successMsg);
  });
}

function fxAddUploadItem() {
  const container = document.getElementById('fxUploadItems');
  const idx = container.querySelectorAll('.fxItem').length + 1;
  const row = document.createElement('div');
  row.className = 'd-flex gap-2 mb-2 align-items-center fxItem';
  row.innerHTML = `<span class="text-muted" style="width:20px;text-align:center">${idx}</span>`
    + '<input class="form-control form-control-sm flex-grow-1 fxItemName" placeholder="文件名称">'
    + '<div class="form-check mb-0 d-flex align-items-center gap-1"><input type="checkbox" class="form-check-input fxItemReq" checked><span class="small">必须</span></div>'
    + '<button class="btn btn-sm btn-outline-danger py-0 px-1" title="删除"><i class="bi bi-x-lg"></i></button>';
  row.querySelector('button').onclick = () => { row.remove(); fxRenumberItems(); };
  container.appendChild(row);
}
function fxRenumberItems() {
  document.querySelectorAll('#fxUploadItems .fxItem').forEach((row, i) => {
    const num = row.querySelector('span');
    if (num) num.textContent = i + 1;
  });
}

function openFxNewModal(caseId, mode) {
  const caseData = window._currentCaseDetail;
  const prefillEmail = caseData ? (caseData.student_email || '') : '';
  const prefillName  = caseData ? (caseData.student_name  || '') : '';
  const isRequest = mode === 'request';

  // ── 发送文件弹窗 ──
  const sendHtml = `
<div class="mb-3">
  <label class="form-label fw-semibold">文件标题 <span class="text-danger">*</span></label>
  <input id="fxTitle" class="form-control" placeholder="例如：录取通知书、签证材料清单">
</div>
<div class="mb-3">
  <label class="form-label fw-semibold">上传文件 <span class="text-danger">*</span></label>
  <input id="fxFile" type="file" class="form-control">
</div>
<div class="mb-3">
  <label class="form-label fw-semibold">备注 <span class="text-muted fw-normal small">(可选)</span></label>
  <textarea id="fxDesc" class="form-control" rows="2" placeholder="给学生的说明"></textarea>
</div>
<div class="row g-2 mb-3">
  <div class="col-6">
    <label class="form-label fw-semibold">学生邮箱</label>
    <input id="fxStudentEmail" class="form-control" value="${escapeHtml(prefillEmail)}" placeholder="留空则不发邮件">
  </div>
  <div class="col-6">
    <label class="form-label fw-semibold">学生姓名</label>
    <input id="fxStudentName" class="form-control" value="${escapeHtml(prefillName)}">
  </div>
</div>
<div class="form-check mb-2">
  <input id="fxRequestReply" type="checkbox" class="form-check-input">
  <label class="form-check-label" for="fxRequestReply">需要学生签字/回传</label>
</div>
<div id="fxReplyWrap" class="d-none border rounded p-2 mb-3 bg-light">
  <div class="row g-2">
    <div class="col-8"><label class="form-label small fw-semibold">回传说明</label><input id="fxReplyInstruction" class="form-control form-control-sm" placeholder="请签字后拍照上传"></div>
    <div class="col-4"><label class="form-label small fw-semibold">截止日期</label><input id="fxDeadline" type="date" class="form-control form-control-sm"></div>
  </div>
</div>
<div class="form-check">
  <input id="fxSendNow" type="checkbox" class="form-check-input" checked>
  <label class="form-check-label" for="fxSendNow">立即发送给学生</label>
</div>`;

  // ── 请求上传弹窗（完全不同的布局）──
  const requestHtml = `
<div class="alert alert-info py-2 mb-3 small">
  <i class="bi bi-info-circle me-1"></i>创建上传请求后，系统将生成链接发给学生。学生打开链接即可按清单逐项上传文件。
</div>
<div class="mb-3">
  <label class="form-label fw-semibold">请求标题 <span class="text-danger">*</span></label>
  <input id="fxTitle" class="form-control" placeholder="例如：补交入学材料、签证材料补充">
</div>
<div class="mb-3">
  <label class="form-label fw-semibold">需要学生上传的文件 <span class="text-danger">*</span></label>
  <div id="fxUploadItems" class="mb-2">
    <div class="d-flex gap-2 mb-2 align-items-center fxItem">
      <span class="text-muted" style="width:20px;text-align:center">1</span>
      <input class="form-control form-control-sm flex-grow-1 fxItemName" placeholder="文件名称，如：体检报告">
      <div class="form-check mb-0 d-flex align-items-center gap-1"><input type="checkbox" class="form-check-input fxItemReq" checked><span class="small">必须</span></div>
      <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="this.parentElement.remove();fxRenumberItems()" title="删除"><i class="bi bi-x-lg"></i></button>
    </div>
  </div>
  <button class="btn btn-sm btn-outline-primary" onclick="fxAddUploadItem()"><i class="bi bi-plus-lg me-1"></i>添加文件项</button>
</div>
<div class="row g-2 mb-3">
  <div class="col-6">
    <label class="form-label fw-semibold">截止日期</label>
    <input id="fxDeadline" type="date" class="form-control">
  </div>
  <div class="col-6">
    <label class="form-label fw-semibold">补充说明 <span class="text-muted fw-normal small">(可选)</span></label>
    <input id="fxReplyInstruction" class="form-control" placeholder="如：请提供近3个月内的文件">
  </div>
</div>
<div class="row g-2 mb-3">
  <div class="col-6">
    <label class="form-label fw-semibold">学生邮箱</label>
    <input id="fxStudentEmail" class="form-control" value="${escapeHtml(prefillEmail)}" placeholder="留空则不发邮件">
  </div>
  <div class="col-6">
    <label class="form-label fw-semibold">学生姓名</label>
    <input id="fxStudentName" class="form-control" value="${escapeHtml(prefillName)}">
  </div>
</div>
<div class="form-check">
  <input id="fxSendNow" type="checkbox" class="form-check-input" checked>
  <label class="form-check-label" for="fxSendNow">创建后立即发送链接给学生</label>
</div>`;

  const html = isRequest ? requestHtml : sendHtml;

  const modalTitle = isRequest ? '📤 请求学生上传文件' : '📨 发送文件给学生';
  showModal(modalTitle, html, async () => {
    const titleVal = document.getElementById('fxTitle').value.trim();
    if (!titleVal) { showError('请填写标题'); return false; }

    if (isRequest) {
      // 请求上传模式：校验至少有一个文件项
      const items = [];
      document.querySelectorAll('#fxUploadItems .fxItem').forEach(row => {
        const name = row.querySelector('.fxItemName')?.value?.trim();
        if (name) items.push({ name, required: row.querySelector('.fxItemReq')?.checked ? 1 : 0 });
      });
      if (!items.length) { showError('请至少添加一个需要学生上传的文件项'); return false; }
      const fd = new FormData();
      fd.append('title', titleVal);
      fd.append('request_reply', '1');
      fd.append('reply_instruction', document.getElementById('fxReplyInstruction')?.value?.trim() || '');
      fd.append('deadline_at', document.getElementById('fxDeadline')?.value || '');
      fd.append('upload_items', JSON.stringify(items));
      fd.append('student_email', document.getElementById('fxStudentEmail').value.trim());
      fd.append('student_name', document.getElementById('fxStudentName').value.trim());
      try {
        const rec = await apiFd('POST', `/api/intake-cases/${caseId}/file-exchange`, fd);
        if (document.getElementById('fxSendNow').checked) await api('PUT', `/api/file-exchange/${rec.id}/send`);
        showSuccess('上传请求已创建' + (document.getElementById('fxSendNow').checked ? '，链接已发送' : ''));
        loadCaseDetail(caseId);
      } catch(e) { showError(e.message); return false; }
    } else {
      // 发送文件模式：校验必须有附件
      const fileInput = document.getElementById('fxFile');
      if (!fileInput.files.length) { showError('请选择要发送的文件'); return false; }
      const fd = new FormData();
      fd.append('title', titleVal);
      fd.append('description', document.getElementById('fxDesc')?.value?.trim() || '');
      fd.append('request_reply', document.getElementById('fxRequestReply')?.checked ? '1' : '0');
      fd.append('reply_instruction', document.getElementById('fxReplyInstruction')?.value?.trim() || '');
      fd.append('deadline_at', document.getElementById('fxDeadline')?.value || '');
      fd.append('student_email', document.getElementById('fxStudentEmail').value.trim());
      fd.append('student_name', document.getElementById('fxStudentName').value.trim());
      fd.append('file', fileInput.files[0]);

      try {
        const rec = await apiFd('POST', `/api/intake-cases/${caseId}/file-exchange`, fd);
        if (document.getElementById('fxSendNow').checked) await api('PUT', `/api/file-exchange/${rec.id}/send`);
        showSuccess('文件已创建' + (document.getElementById('fxSendNow').checked ? '并发送' : ''));
        loadCaseDetail(caseId);
      } catch(e) { showError(e.message); return false; }
    }
  }, isRequest ? '创建上传请求' : '保存', 'lg');

  // 发送模式：绑定"要求回传"toggle
  if (!isRequest) {
    setTimeout(() => {
      const cb = document.getElementById('fxRequestReply');
      if (cb) cb.onchange = () => document.getElementById('fxReplyWrap')?.classList.toggle('d-none', !cb.checked);
    }, 100);
  }
}

async function fxSendRecord(recordId, caseId) {
  try {
    await api('PUT', `/api/file-exchange/${recordId}/send`);
    showSuccess('已发送给学生');
    await loadCaseDetail(caseId);
  } catch(e) { showError(e.message); }
}

async function fxRemindRecord(recordId, caseId) {
  try {
    await api('POST', `/api/file-exchange/${recordId}/remind`);
    showSuccess('催办邮件已发送');
    await loadCaseDetail(caseId);
  } catch(e) { showError(e.message); }
}

async function fxCloseRecord(recordId, caseId) {
  confirmAction('确认关闭该文件记录？关闭后学生将无法再上传回传文件。', async () => {
    try {
      await api('PUT', `/api/file-exchange/${recordId}/close`);
      showSuccess('记录已关闭');
      await loadCaseDetail(caseId);
    } catch(e) { showError(e.message); }
  });
}

async function fxDeleteRecord(recordId, caseId) {
  confirmAction('确认删除该文件记录？此操作不可恢复。', async () => {
    try {
      await api('DELETE', `/api/file-exchange/${recordId}`);
      showSuccess('记录已删除');
      await loadCaseDetail(caseId);
    } catch(e) { showError(e.message); }
  }, { danger: true, okLabel: '确认删除' });
}

function fxEditRecord(recordId, caseId) {
  const caseData = window._currentCaseDetail;
  const r = (caseData?.fileExchange || []).find(rec => rec.id === recordId);
  if (!r) { showError('找不到记录，请刷新页面'); return; }
  const html = `
<div class="mb-2">
  <label class="form-label fw-semibold mb-1">文件标题 <span class="text-danger">*</span></label>
  <input id="fxEditTitle" class="form-control form-control-sm" value="${escapeHtml(r.title||'')}">
</div>
<div class="mb-2">
  <label class="form-label fw-semibold mb-1">说明 / 备注</label>
  <textarea id="fxEditDesc" class="form-control form-control-sm" rows="2">${escapeHtml(r.description||'')}</textarea>
</div>
<div class="row g-2">
  <div class="col-6">
    <label class="form-label fw-semibold mb-1">学生邮箱</label>
    <input id="fxEditEmail" class="form-control form-control-sm" value="${escapeHtml(r.student_email||'')}">
  </div>
  <div class="col-6">
    <label class="form-label fw-semibold mb-1">学生姓名</label>
    <input id="fxEditName" class="form-control form-control-sm" value="${escapeHtml(r.student_name||'')}">
  </div>
</div>`;
  showModal('编辑文件记录', html, async () => {
    const titleVal = document.getElementById('fxEditTitle').value.trim();
    if (!titleVal) { showError('标题不能为空'); return false; }
    try {
      await api('PATCH', `/api/file-exchange/${recordId}`, {
        title: titleVal,
        description: document.getElementById('fxEditDesc').value.trim(),
        student_email: document.getElementById('fxEditEmail').value.trim(),
        student_name: document.getElementById('fxEditName').value.trim(),
      });
      showSuccess('记录已更新');
      await loadCaseDetail(caseId);
    } catch(e) { showError(e.message); return false; }
  }, '保存');
}

// 文件收发筛选Tab — 客户端过滤，无需重渲染整页
function fxFilterTab(filter) {
  window._fxFilter_state = filter || 'all';
  document.querySelectorAll('.fx-tab-btn').forEach(b => {
    const active = b.dataset.tab === filter;
    b.className = `btn btn-sm py-0 px-2 ${active ? 'btn-primary' : 'btn-outline-secondary'} fx-tab-btn`;
    const badge = b.querySelector('.fx-tab-count');
    if (badge) badge.className = `badge ${active ? 'bg-white text-primary' : 'bg-secondary'} fx-tab-count`;
  });
  const container = document.getElementById('fx-records-container');
  if (!container) return;
  let visibleCount = 0;
  container.querySelectorAll('.fx-record').forEach(el => {
    const tabs = el.dataset.fxTabs ? el.dataset.fxTabs.split(' ') : ['all'];
    const show = tabs.includes(filter) || filter === 'all';
    el.style.display = show ? '' : 'none';
    if (show) visibleCount++;
  });
  let emptyMsg = container.querySelector('.fx-empty-msg');
  const totalRecords = container.querySelectorAll('.fx-record').length;
  if (totalRecords > 0) {
    if (!emptyMsg) {
      emptyMsg = document.createElement('div');
      emptyMsg.className = 'text-center text-muted py-3 small fx-empty-msg';
      emptyMsg.textContent = '该分类暂无记录';
      container.appendChild(emptyMsg);
    }
    emptyMsg.style.display = visibleCount === 0 ? '' : 'none';
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function deleteIntakeCase(caseId, studentName) {
  const lockKey = `deleteCase_${caseId}`;
  confirmAction(
    `<div class="alert alert-danger py-2 mb-2 small">删除后所有关联数据（签证、到校、账单、任务、材料、问卷）将一并删除，不可恢复。</div>
     确认删除学生 <strong>${escapeHtml(studentName)}</strong> 的入学案例？`,
    async () => {
      if (!acquireSubmit(lockKey)) return;
      try {
        await api('DELETE', `/api/intake-cases/${caseId}`);
        showSuccess('案例已删除');
        renderIntakeCases();
      } catch(e) { showError(e.message); }
      finally { releaseSubmit(lockKey); }
    },
    { danger: true, okLabel: '确认删除' }
  );
}

async function showCreateIntakeModal() {
  // 重置字段
  const progSel = document.getElementById('createIntakeProgram');
  if (progSel) progSel.value = '';
  const progOther = document.getElementById('createIntakeProgramOther');
  if (progOther) { progOther.value = ''; progOther.classList.add('d-none'); }
  document.getElementById('createIntakeYear').value = new Date().getFullYear();
  document.getElementById('createIntakeNotes').value = '';
  document.getElementById('createIntakeSourceType').value = '';
  document.getElementById('createIntakeAgentWrap').style.display = 'none';
  // 先弹窗（modal 在 index.html 中，不随页面重渲染）
  const stuNameEl = document.getElementById('createIntakeStudentName');
  if (stuNameEl) stuNameEl.value = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('createIntakeModal')).show();
  // 加载代理列表
  api('GET', '/api/agents').catch(() => []).then(agents => {
    const agentSel = document.getElementById('createIntakeAgentId');
    if (agentSel) agentSel.innerHTML = '<option value="">-- 请选择 --</option>' +
      agents.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} (${escapeHtml(a.type||'')})</option>`).join('');
  });
}

function toggleIntakeAgentSelect(val) {
  document.getElementById('createIntakeAgentWrap').style.display = val === 'agent' ? '' : 'none';
}

async function submitCreateIntake() {
  if (!acquireSubmit('createIntake')) return;
  const studentName = document.getElementById('createIntakeStudentName')?.value?.trim();
  const progSel = document.getElementById('createIntakeProgram');
  const program_name = progSel?.value === '__other__'
    ? (document.getElementById('createIntakeProgramOther')?.value?.trim() || '')
    : (progSel?.value?.trim() || '');
  const intake_year = parseInt(document.getElementById('createIntakeYear')?.value);
  const notes = document.getElementById('createIntakeNotes')?.value?.trim();
  const source_type = document.getElementById('createIntakeSourceType')?.value;
  const agent_id = document.getElementById('createIntakeAgentId')?.value || null;
  if (!studentName || !program_name) { releaseSubmit('createIntake'); showError('请填写所有必填字段'); return; }
  if (isNaN(intake_year) || intake_year < 2000 || intake_year > 2100) { releaseSubmit('createIntake'); showError('请输入有效学年（2000-2100）'); return; }
  if (source_type === 'agent' && !agent_id) { releaseSubmit('createIntake'); showError('请选择代理机构'); return; }
  try {
    let referral_id = null;
    if (source_type) {
      const ref = await api('POST', '/api/referrals', { source_type, agent_id: agent_id || null });
      referral_id = ref.id;
    }
    const newCase = await api('POST', '/api/intake-cases', { student_name: studentName, intake_year, program_name, notes, referral_id, case_owner_staff_id: State.user?.linked_id || null });
    bootstrap.Modal.getOrCreateInstance(document.getElementById('createIntakeModal')).hide();
    showSuccess('案例已创建');
    await renderIntakeCases();
    if (newCase?.id) showCaseDetail(newCase.id);
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('createIntake'); }
}

async function showCaseDetail(caseId) {
  State.currentCaseId = caseId;
  // Master-Detail 模式：渲染到右侧面板
  const detailPanel = document.getElementById('intakeDetailPanel');
  if (detailPanel) {
    detailPanel.innerHTML = '<div class="text-center py-5"><span class="spinner-border spinner-border-sm"></span> 加载中...</div>';
    // 高亮左侧卡片并滚动到可见
    document.querySelectorAll('.case-card').forEach(el => {
      const isActive = el.dataset.caseId === caseId;
      el.classList.toggle('active', isActive);
      if (isActive) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    try {
      await _renderCaseDetailInto(detailPanel, caseId);
    } catch(e) { detailPanel.innerHTML = '<div class="text-center text-danger py-5">加载失败</div>'; }
  } else {
    showPage('intake-case-detail');
  }
}

async function _renderCaseDetailInto(container, caseId) {
  State.currentCaseId = caseId;
  await renderIntakeCaseDetail();
}

// 刷新案例详情：如果在 master-detail 面板中就直接刷新面板，否则导航
function _refreshCaseDetail(caseId) {
  if (caseId) State.currentCaseId = caseId;
  if (document.getElementById('intakeDetailPanel')) {
    renderIntakeCaseDetail();
  } else {
    navigate('intake-case-detail', { caseId: caseId || State.currentCaseId });
  }
}

function closeCaseDetailPanel() {
  State.currentCaseId = null;
  const panel = document.getElementById('intakeDetailPanel');
  if (panel) {
    panel.innerHTML = `
      <div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted" style="min-height:400px">
        <i class="bi bi-arrow-left-circle" style="font-size:3rem;opacity:.2"></i>
        <div class="mt-2" style="font-size:.9rem">选择一个案例查看详情</div>
      </div>`;
  }
  document.querySelectorAll('.case-card').forEach(el => el.classList.remove('active'));
}

// ══════════════════════════════════════════════════════
//  CASE DETAIL CARD SYSTEM — helpers
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// 文件中心 4 个 Tab 渲染函数
// ══════════════════════════════════════════════════════════

function _renderAgentTab(c) {
  const mr = c.matRequest;
  const admDocs = c.admDocs || [];
  const allDocsOk = admDocs.length >= 3 && admDocs.every(d => d.status === 'done');
  const docLabels = {SAF:'Student Application Form',FORM16:'Form 16 (Student Pass)',V36:'V36 (Additional Info)'};

  if (!mr) {
    return `
      <div class="text-center py-4">
        <i class="bi bi-person-badge text-muted" style="font-size:2.5rem"></i>
        <p class="text-muted mt-2 mb-3">尚未发起代理材料收集</p>
        ${hasRole('principal','intake_staff','counselor') ? `
          <button class="btn btn-primary" onclick="showCreateMatRequestForCase('${c.id}')">
            <i class="bi bi-send me-1"></i>发起材料收集
          </button>` : ''}
      </div>
      ${allDocsOk ? `<div class="border rounded p-2 mt-3 text-center" style="background:#f8fdf8"><span class="text-success small"><i class="bi bi-check-circle-fill me-1"></i>3 份文件已生成</span> <a href="#" class="small ms-2" onclick="event.preventDefault();document.querySelector('[href=\\'#fcAll\\']').click()">前往下载 →</a></div>` : ''}`;
  }

  const items = mr.items || [];
  const approved = items.filter(i => i.status === 'APPROVED').length;
  const uploaded = items.filter(i => i.status === 'UPLOADED').length;
  const total = items.length;
  const pct = total > 0 ? Math.round(approved / total * 100) : 0;
  const uif = mr.uif;
  const uifStatus = uif?.status || 'DRAFT';
  const tokenInfo = mr.token;
  const agentLink = tokenInfo ? (location.origin + '/agent.html?token=' + tokenInfo.token) : null;

  // 计算文件和表单的独立状态
  const filesAllApproved = items.length > 0 && items.filter(i=>i.is_required).every(i=>i.status==='APPROVED');
  const filesHaveIssue = items.some(i=>i.status==='REJECTED');
  const uifStatusLabel = {SUBMITTED:'待审核',APPROVED:'已通过',RETURNED:'已打回',MERGED:'已处理',DRAFT:'草稿中'}[uifStatus] || '未提交';
  const uifStatusColor = {SUBMITTED:'warning',APPROVED:'success',RETURNED:'danger',MERGED:'success',DRAFT:'secondary'}[uifStatus] || 'secondary';
  const fileStatusLabel = filesAllApproved ? '全部通过' : filesHaveIssue ? '有退回' : uploaded > 0 ? `${uploaded} 待审核` : approved > 0 ? `${approved}/${total} 已审核` : '待上传';
  const fileStatusColor = filesAllApproved ? 'success' : filesHaveIssue ? 'danger' : uploaded > 0 ? 'warning' : 'secondary';
  // 综合状态
  const bothApproved = filesAllApproved && (uifStatus === 'APPROVED' || uifStatus === 'MERGED');
  const hasOutdatedPdf = admDocs.some(d => d.is_outdated);

  const rejectedItems = items.filter(i => i.status === 'REJECTED');
  // 智能推荐下一步动作
  const _nextAction = (() => {
    if (mr.status==='REVISION_NEEDED') return { text:'等待代理重新提交', icon:'bi-hourglass', style:'muted' };
    if (uploaded>0) return { text:'审核待处理文件', icon:'bi-folder-check', style:'action', onclick:`document.querySelector('.py-2.border-bottom .btn-outline-success')?.scrollIntoView({behavior:'smooth',block:'center'})` };
    if (uifStatus==='SUBMITTED' && !filesHaveIssue) return { text:'审核表单内容', icon:'bi-file-text', style:'action', onclick:`viewUifDetail('${mr.id}')` };
    if (rejectedItems.length>0) return { text:'退回 '+rejectedItems.length+' 项待修改', icon:'bi-arrow-return-left', style:'warn', onclick:`returnUif('${mr.id}')` };
    if ((uifStatus==='APPROVED'||uifStatus==='MERGED') && !allDocsOk) return { text:'生成 PDF 申请文件', icon:'bi-file-earmark-pdf', style:'action', onclick:`generateDocsFromUif('${mr.id}')` };
    if (allDocsOk && hasOutdatedPdf) return { text:'PDF 需要更新', icon:'bi-arrow-clockwise', style:'warn', onclick:`generateDocsFromUif('${mr.id}')` };
    if (allDocsOk && !hasOutdatedPdf && bothApproved) return { text:'审核完成，PDF 已就绪', icon:'bi-check-circle', style:'done' };
    return null;
  })();
  return `
    ${_nextAction ? `<div class="next-action-bar next-action-${_nextAction.style} mb-3"${_nextAction.onclick?` onclick="${_nextAction.onclick}" style="cursor:pointer"`:''}>
      <i class="bi ${_nextAction.icon} me-2"></i>
      <span>${_nextAction.text}</span>
      ${_nextAction.style==='action'?'<i class="bi bi-chevron-right ms-auto"></i>':''}
    </div>` : ''}
    <!-- 审核摘要 (一行) -->
    <div class="d-flex align-items-center gap-3 flex-wrap mb-3 pb-2 border-bottom" style="font-size:.82rem">
      <span class="text-muted">文件 <span style="color:${filesAllApproved?'#166534':filesHaveIssue?'#991b1b':'#475569'};font-weight:500">${fileStatusLabel}</span></span>
      <span class="text-muted">表单 <span style="color:${uifStatusColor==='success'?'#166534':uifStatusColor==='danger'?'#991b1b':'#475569'};font-weight:500">${uifStatusLabel}</span></span>
      ${bothApproved ? `<span style="color:#166534"><i class="bi bi-check-circle me-1"></i>全部通过</span>` : ''}
      ${mr.status==='REVISION_NEEDED' ? `<span style="color:#991b1b"><i class="bi bi-arrow-return-left me-1"></i>已退回</span>` : ''}
      ${rejectedItems.length>0 && ['SUBMITTED','APPROVED','MERGED'].includes(mr.status) ? `<button class="btn btn-sm btn-outline-secondary" style="font-size:.75rem" onclick="returnUif('${mr.id}')"><i class="bi bi-arrow-return-left me-1"></i>退回 (${rejectedItems.length})</button>` : ''}
      ${['SUBMITTED','APPROVED','MERGED'].includes(mr.status) && !rejectedItems.length ? `<button class="btn btn-sm btn-outline-secondary" style="font-size:.75rem" onclick="returnUif('${mr.id}')">退回修改</button>` : ''}
    </div>
    ${mr.return_reason && mr.status==='REVISION_NEEDED' ? `<div class="small mb-3" style="color:#991b1b;padding:5px 8px;background:#fef2f2;border-radius:4px;border:1px solid #fecaca">${escapeHtml(mr.return_reason)}</div>` : ''}

    <!-- 文件审核 -->
    <div class="border rounded p-3 mb-3" style="border-color:#e5e7eb !important">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span style="font-size:.82rem;font-weight:600;color:#334155">上传文件 <span style="font-weight:400;color:#94a3b8">${approved}/${total}</span></span>
        ${approved===total&&total>0?`<span style="font-size:.7rem;color:#166534;background:#dcfce7;padding:1px 6px;border-radius:3px">全部通过</span>`
          :uploaded>0?`<span style="font-size:.7rem;color:#92400e;background:#fef3c7;padding:1px 6px;border-radius:3px">${uploaded} 待审核</span>`
          :rejectedItems.length>0?`<span style="font-size:.7rem;color:#991b1b;background:#fee2e2;padding:1px 6px;border-radius:3px">${rejectedItems.length} 不通过</span>`:''}
      </div>
      ${items.map(item => `
        <div class="py-2 border-bottom" style="font-size:.85rem">
          <div class="d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center gap-1">
              <i class="bi ${item.status==='APPROVED'?'bi-check-circle-fill':item.status==='REJECTED'?'bi-x-circle-fill':item.status==='UPLOADED'?'bi-clock':'bi-circle'}" style="font-size:.8rem;color:${item.status==='APPROVED'?'#86efac':item.status==='REJECTED'?'#fca5a5':item.status==='UPLOADED'?'#fbbf24':'#d1d5db'}"></i>
              <span>${escapeHtml(item.name)}</span>
              ${item.is_required?'<span class="text-danger" style="font-size:.65rem">必须</span>':''}
            </div>
            <div class="d-flex align-items-center gap-1 flex-shrink-0">
              ${item.file_id ? `<button class="btn btn-sm btn-outline-primary py-0 px-1" onclick="previewMatFile('${item.id}','${escapeHtml(item.file_name||item.name)}')" title="预览"><i class="bi bi-eye"></i></button>
                <a href="/api/mat-request-items/${item.id}/download" class="btn btn-sm btn-outline-secondary py-0 px-1" download title="下载"><i class="bi bi-download"></i></a>` : ''}
              ${item.file_id && !['APPROVED','REJECTED'].includes(item.status) ? `
                <button class="btn btn-sm btn-outline-success py-0 px-1" onclick="reviewMatItem('${item.id}','approve')" title="通过"><i class="bi bi-check-lg"></i></button>
                <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="showRejectInput('${item.id}')" title="不通过"><i class="bi bi-x-lg"></i></button>` : ''}
            </div>
          </div>
          ${item.status==='REJECTED'&&item.reject_reason ? `<div class="small text-danger mt-1 ms-4"><i class="bi bi-exclamation-circle me-1"></i>${escapeHtml(item.reject_reason)}</div>` : ''}
          <div id="reject-input-${item.id}" class="d-none mt-1 ms-4">
            <div class="d-flex gap-2 align-items-center">
              <input type="text" class="form-control form-control-sm" style="flex:1" placeholder="请填写不通过原因..." id="reject-reason-${item.id}">
              <button class="btn btn-sm btn-danger px-3" onclick="reviewMatItem('${item.id}','reject',document.getElementById('reject-reason-${item.id}').value)"><i class="bi bi-check2 me-1"></i>确认</button>
              <button class="btn btn-sm btn-outline-secondary px-2" onclick="document.getElementById('reject-input-${item.id}').classList.add('d-none')">取消</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <!-- 表单内容审核 -->
    <div class="border rounded p-3 mb-3" style="border-color:#e5e7eb !important">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span style="font-size:.82rem;font-weight:600;color:#334155">表单 ${mr.current_version ? `<span style="font-weight:400;color:#94a3b8">v${mr.current_version}</span>` : ''}</span>
      </div>
      ${uifStatus==='SUBMITTED' ? `
        <div class="small text-muted mb-2">代理已提交表单，请点击查看并逐项审核。</div>
        <button class="btn btn-sm btn-primary" onclick="viewUifDetail('${mr.id}')"><i class="bi bi-eye me-1"></i>查看并审核表单</button>
        ${(() => { const fn = window._pendingFieldNotes || {}; let cnt = Object.keys(fn).length; if (!cnt && mr.uif?.field_notes) { try { cnt = Object.keys(JSON.parse(mr.uif.field_notes)).length; } catch(e) {} } return cnt ? '<div class="small text-danger mt-2"><i class="bi bi-exclamation-circle me-1"></i>已标记 ' + cnt + ' 个问题字段，待退回</div>' : ''; })()}` : ''}
      ${uifStatus==='APPROVED' ? `
        <div class="small text-success mb-2"><i class="bi bi-check-circle-fill me-1"></i>表单内容已审核通过</div>
        <button class="btn btn-sm btn-outline-primary" onclick="viewUifDetail('${mr.id}')"><i class="bi bi-eye me-1"></i>查看表单内容</button>` : ''}
      ${uifStatus==='RETURNED' ? `
        <div class="small text-danger"><i class="bi bi-clock me-1"></i>已打回，等待代理修改后重新提交</div>
        <button class="btn btn-sm btn-outline-primary mt-1" onclick="viewUifDetail('${mr.id}')"><i class="bi bi-eye me-1"></i>查看表单内容</button>` : ''}
      ${uifStatus==='MERGED' ? `
        <div class="small text-success mb-2"><i class="bi bi-check-circle-fill me-1"></i>表单内容已处理</div>
        <button class="btn btn-sm btn-outline-primary" onclick="viewUifDetail('${mr.id}')"><i class="bi bi-eye me-1"></i>查看表单内容</button>` : ''}
      ${!uifStatus || uifStatus==='DRAFT' ? `<div class="small text-muted">代理正在填写中，尚未提交</div>` : ''}
      ${mr.current_version > 1 ? `<div class="mt-2"><button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="showVersionHistory('${mr.id}')"><i class="bi bi-clock-history me-1"></i>版本历史 (${mr.current_version})</button></div>` : ''}
    </div>

    <!-- 操作栏 -->
    <div class="d-flex gap-2 flex-wrap align-items-center pt-2 mt-2 border-top" style="font-size:.8rem">
      <!-- 主操作（视觉突出） -->
      ${(uifStatus==='APPROVED' || uifStatus==='MERGED') && !allDocsOk ? `
        <button class="btn btn-sm btn-primary" onclick="generateDocsFromUif('${mr.id}')"><i class="bi bi-file-earmark-pdf me-1"></i>生成 PDF</button>` : ''}
      ${allDocsOk && hasOutdatedPdf ? `
        <button class="btn btn-sm" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:.78rem" onclick="generateDocsFromUif('${mr.id}')"><i class="bi bi-arrow-clockwise me-1"></i>更新 PDF</button>` : ''}
      ${allDocsOk && !hasOutdatedPdf ? `
        <span style="color:#166534;font-size:.78rem"><i class="bi bi-check-circle-fill me-1"></i>PDF 就绪</span>` : ''}
      <!-- 分隔 -->
      <span style="color:#e2e8f0">|</span>
      <!-- 次要操作（统一灰调） -->
      ${allDocsOk && !hasOutdatedPdf ? `<button class="btn btn-sm btn-outline-secondary" style="font-size:.72rem" onclick="generateDocsFromUif('${mr.id}')">重新生成</button>` : ''}
      ${agentLink ? `<button class="btn btn-sm btn-outline-secondary" style="font-size:.72rem" onclick="navigator.clipboard.writeText('${agentLink}');showToast('链接已复制')"><i class="bi bi-link-45deg me-1"></i>复制链接</button>` : ''}
      ${(mr.reviewActions||[]).length ? `<button class="btn btn-sm btn-outline-secondary" style="font-size:.72rem" type="button" data-bs-toggle="collapse" data-bs-target="#matReviewHistory">记录 (${mr.reviewActions.length})</button>` : ''}
      ${mr.current_version > 1 ? `<button class="btn btn-sm btn-outline-secondary" style="font-size:.72rem" onclick="showVersionHistory('${mr.id}')">v${mr.current_version}</button>` : ''}
    </div>

    <!-- 审核记录（折叠） -->
    ${(mr.reviewActions||[]).length ? `
    <div class="collapse mb-3" id="matReviewHistory">
      <div class="border rounded p-3" style="background:#fafafa">
        <h6 class="mb-2" style="font-size:.85rem"><i class="bi bi-clock-history text-secondary me-1"></i>审核记录</h6>
        <div style="max-height:250px;overflow-y:auto">
          ${mr.reviewActions.map(a => `
            <div class="border-bottom py-2" style="font-size:.82rem">
              <div class="d-flex justify-content-between">
                <span class="fw-semibold">${a.action_type==='RETURN'?'<i class="bi bi-arrow-return-left text-danger me-1"></i>退回':'<i class="bi bi-check-circle text-success me-1"></i>通过'}</span>
                <span class="text-muted">${a.created_at?.slice(0,16)||''}</span>
              </div>
              <div class="text-muted small">${escapeHtml(a.actor_name||'')} · v${a.version_no||0}</div>
              ${a.reason?`<div class="small mt-1" style="color:#7f1d1d">${escapeHtml(a.reason)}</div>`:''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>` : ''}
  `;
}

function _renderStudentTab(c) {
  const fxRecords = c.fileExchange || [];
  const fxSent = fxRecords.filter(r => r.direction === 'admin_to_student');

  const _fxBadge = r => {
    const isOD = r.deadline_at && new Date(r.deadline_at) < new Date() && !['replied','closed'].includes(r.status);
    const s = isOD ? 'overdue' : r.status;
    const map = {draft:'草稿',sent:'已发送',viewed:'已查看',awaiting_upload:'待回传',overdue:'已逾期',replied:'已回传',closed:'已完成'};
    const color = {draft:'secondary',sent:'primary',viewed:'info',awaiting_upload:'warning',overdue:'danger',replied:'success',closed:'dark'};
    return `<span class="badge bg-${color[s]||'secondary'}" style="font-size:.72rem">${map[s]||s}</span>`;
  };

  return `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <span class="text-muted small">与学生/家长的文件协作</span>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-primary" onclick="openFxNewModal('${c.id}','send')"><i class="bi bi-send me-1"></i>发送文件</button>
        <button class="btn btn-sm btn-outline-primary" onclick="openFxNewModal('${c.id}','request')"><i class="bi bi-cloud-arrow-up me-1"></i>请求上传</button>
      </div>
    </div>
    ${fxSent.length === 0 ? `
      <div class="text-center py-4 text-muted">
        <i class="bi bi-inbox" style="font-size:2rem"></i>
        <p class="mt-2 mb-0">暂无文件收发记录</p>
        <small>点击"发送文件"向学生发送文件或请求上传</small>
      </div>` : fxSent.map(r => {
      const replies = r.replies || [];
      const isDone = ['replied','closed'].includes(r.status);
      return `
        <div class="border rounded p-3 mb-2">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              ${_fxBadge(r)}
              <span class="fw-semibold ms-1" style="font-size:.88rem">${escapeHtml(r.title)}</span>
              ${r.request_reply?'<span class="badge bg-warning text-dark ms-1" style="font-size:.65rem">需回传</span>':''}
            </div>
            <div class="dropdown">
              <button class="btn btn-sm btn-outline-secondary py-0 px-2" data-bs-toggle="dropdown" data-bs-strategy="fixed"><i class="bi bi-three-dots"></i></button>
              <ul class="dropdown-menu dropdown-menu-end">
                ${!r.sent_at && r.status==='draft' ? `<li><a class="dropdown-item small text-success" href="#" onclick="fxSendRecord('${r.id}','${c.id}');return false"><i class="bi bi-send me-2"></i>发送</a></li>` : ''}
                ${r.sent_at && !isDone ? `<li><a class="dropdown-item small" href="#" onclick="fxSendRecord('${r.id}','${c.id}');return false"><i class="bi bi-send me-2"></i>重新发送</a></li>` : ''}
                ${r.sent_at && !isDone ? `<li><a class="dropdown-item small" href="#" onclick="fxRemindRecord('${r.id}','${c.id}');return false"><i class="bi bi-bell me-2"></i>催办</a></li>` : ''}
                ${r.file_path ? `<li><a class="dropdown-item small" href="/api/file-exchange/${r.id}/download" download><i class="bi bi-download me-2"></i>下载</a></li>` : ''}
                ${replies.length ? `<li><a class="dropdown-item small" href="/api/file-exchange/${r.id}/reply-download" download><i class="bi bi-file-earmark-arrow-down me-2"></i>下载回传</a></li>` : ''}
                ${!isDone ? `<li><a class="dropdown-item small" href="#" onclick="fxCloseRecord('${r.id}','${c.id}');return false"><i class="bi bi-check2-circle me-2"></i>完成</a></li>` : ''}
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item small text-danger" href="#" onclick="fxDeleteRecord('${r.id}','${c.id}');return false"><i class="bi bi-trash3 me-2"></i>删除</a></li>
              </ul>
            </div>
          </div>
          <div class="small text-muted mt-1">
            ${r.created_by_name||''} · ${r.created_at ? new Date(r.created_at).toLocaleDateString('zh-CN') : ''}
            ${r.sent_at ? ` · 已发送 ${new Date(r.sent_at).toLocaleDateString('zh-CN')}` : ''}
            ${r.viewed_at ? ' · <span class="text-success">已查看</span>' : r.sent_at ? ' · 未查看' : ''}
            ${r.deadline_at ? ` · 截止 ${r.deadline_at}` : ''}
          </div>
          ${replies.length ? `<div class="small text-success mt-1"><i class="bi bi-check-circle me-1"></i>学生已回传 ${replies.length} 个文件</div>` : ''}
        </div>`;
    }).join('')}
  `;
}

function _renderSystemTab(c) {
  const admDocs = c.admDocs || [];
  const caseFiles = c.caseFiles || [];
  const docLabels = {SAF:'Student Application Form',FORM16:'Form 16 (Student Pass)',V36:'V36 (Additional Info)'};

  return `
    ${admDocs.length > 0 ? `
      <h6 class="mb-2" style="font-size:.9rem"><i class="bi bi-file-earmark-pdf text-danger me-1"></i>申请文件（系统生成）</h6>
      ${admDocs.filter(d=>d.status==='done').map(d => `
        <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
          <span style="font-size:.85rem"><i class="bi bi-file-earmark-pdf text-danger me-2"></i>${docLabels[d.doc_type]||d.doc_type}</span>
          <a href="/api/adm-docs/${d.id}/download" class="btn btn-sm btn-success py-0 px-2" download><i class="bi bi-download me-1"></i>${Math.round((d.file_size||0)/1024)}KB</a>
        </div>`).join('')}
      <hr class="my-3">` : ''}

    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0" style="font-size:.9rem"><i class="bi bi-folder text-secondary me-1"></i>内部案例文件</h6>
    </div>
    ${caseFiles.length > 0 ? caseFiles.map(cf => `
      <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
        <span style="font-size:.85rem"><i class="bi bi-file-earmark me-2 text-muted"></i>${escapeHtml(cf.label||cf.file_name||'文件')}</span>
        <span class="text-muted small">${cf.created_at ? new Date(cf.created_at).toLocaleDateString('zh-CN') : ''}</span>
      </div>`).join('') : '<div class="text-muted small py-2">暂无内部文件</div>'}
  `;
}

function _renderAllFilesTab(c) {
  const allFiles = [];
  const docLabels = {SAF:'Student Application Form',FORM16:'Form 16 (Student Pass)',V36:'V36 (Additional Info)'};

  // 申请文件
  (c.admDocs||[]).forEach(d => { if(d.status==='done') allFiles.push({cat:'申请文件',icon:'bi-file-earmark-pdf',color:'#dc3545',name:docLabels[d.doc_type]||d.doc_type,size:d.file_size,date:d.generated_at,url:'/api/adm-docs/'+d.id+'/download'}); });
  // 代理上传
  (c.matRequest?.items||[]).forEach(i => { if(i.file_id) allFiles.push({cat:'代理上传',icon:'bi-folder-check',color:'#0d6efd',name:i.name+(i.file_name?' ('+i.file_name+')':''),size:i.file_size,date:i.uploaded_at,url:'/api/mat-request-items/'+i.id+'/download',badge:i.status==='APPROVED'?'已通过':i.status==='REJECTED'?'已退回':'待审核',badgeColor:i.status==='APPROVED'?'success':i.status==='REJECTED'?'danger':'warning'}); });
  // 文件收发
  (c.fileExchange||[]).forEach(fe => { if(fe.file_path) allFiles.push({cat:'发给学生',icon:'bi-send',color:'#6f42c1',name:fe.title||fe.original_name||'文件',size:fe.file_size,date:fe.created_at,url:'/api/file-exchange/'+fe.id+'/download'}); (fe.replies||[]).forEach(r => { if(r.file_path) allFiles.push({cat:'学生回传',icon:'bi-arrow-left',color:'#198754',name:r.original_name||'回传文件',size:r.file_size,date:r.created_at,url:'/api/file-exchange/'+r.id+'/reply-download'}); }); });
  // 案例文件
  (c.caseFiles||[]).forEach(cf => allFiles.push({cat:'内部文件',icon:'bi-file-earmark',color:'#fd7e14',name:cf.label||cf.file_name||'文件',size:cf.file_size,date:cf.created_at}));

  allFiles.sort((a,b) => (b.date||'').localeCompare(a.date||''));

  if(allFiles.length === 0) return `<div class="text-center py-4 text-muted"><i class="bi bi-archive" style="font-size:2rem"></i><p class="mt-2">暂无文件</p></div>`;

  return `
    <div class="small text-muted mb-3">共 ${allFiles.length} 个文件</div>
    ${allFiles.map(f => `
      <div class="d-flex justify-content-between align-items-center py-2 border-bottom" style="font-size:.83rem">
        <div class="d-flex align-items-center gap-2 min-width-0 flex-grow-1">
          <i class="bi ${f.icon}" style="color:${f.color}"></i>
          <span class="text-truncate">${escapeHtml(f.name)}</span>
          <span class="badge bg-light text-dark border" style="font-size:.65rem">${f.cat}</span>
          ${f.badge?`<span class="badge bg-${f.badgeColor}" style="font-size:.6rem">${f.badge}</span>`:''}
        </div>
        <div class="d-flex align-items-center gap-2 flex-shrink-0">
          <span class="text-muted" style="font-size:.72rem">${f.size?Math.round(f.size/1024)+'KB':''}</span>
          ${f.url?`<a href="${f.url}" class="btn btn-sm btn-outline-primary py-0 px-1" download><i class="bi bi-download"></i></a>`:''}
        </div>
      </div>`).join('')}
  `;
}

function _renderDocSection(admDocs, docLabels, requestId, allDocsOk) {
  if (admDocs.length === 0) return '';
  return `
    <div class="border rounded p-3" style="background:#f8fdf8;border-color:#c3e6c3 !important">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="mb-0" style="font-size:.9rem;color:#1b7f4b"><i class="bi bi-file-earmark-check me-1"></i>申请文件 (${admDocs.length} 份)</h6>
        ${allDocsOk?'<span class="badge bg-success">全部就绪</span>':''}
      </div>
      ${admDocs.map(d => `
        <div class="d-flex justify-content-between align-items-center py-2 ${d !== admDocs[admDocs.length-1]?'border-bottom':''}">
          <div>
            <i class="bi bi-file-earmark-pdf text-danger me-2"></i>
            <span style="font-size:.88rem;font-weight:500">${docLabels[d.doc_type]||d.doc_type}</span>
            <span class="text-muted ms-1" style="font-size:.75rem">${Math.round((d.file_size||0)/1024)} KB</span>
          </div>
          <a href="/api/adm-docs/${d.id}/download" class="btn btn-sm btn-success py-1 px-3" download>
            <i class="bi bi-download me-1"></i>下载
          </a>
        </div>`).join('')}
    </div>`;
}

// 旧卡片系统已废弃（改为左栏摘要+右栏Tab），但保留定义避免引用报错
const _CASE_CARD_META = {
  visa:        { label:'签证状态',   icon:'bi-passport',        defaultCol:'left',  defaultOrder:1, unlockHint:'合同已签后解锁' },
  tasks:       { label:'任务清单',   icon:'bi-check2-square',   defaultCol:'left',  defaultOrder:2, unlockHint:null },
  arrival:     { label:'到校信息',   icon:'bi-airplane',        defaultCol:'left',  defaultOrder:5, unlockHint:'已获IPA后解锁' },
  survey:      { label:'满意度调查', icon:'bi-clipboard-check', defaultCol:'right', defaultOrder:5, unlockHint:'学生入学后解锁' },
};

function _getCaseLayout(caseId) {
  try {
    const saved = localStorage.getItem('case_card_layout_' + caseId);
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  const left  = Object.entries(_CASE_CARD_META).filter(([,m]) => m.defaultCol==='left' ).sort((a,b)=>a[1].defaultOrder-b[1].defaultOrder).map(([id])=>id);
  const right = Object.entries(_CASE_CARD_META).filter(([,m]) => m.defaultCol==='right').sort((a,b)=>a[1].defaultOrder-b[1].defaultOrder).map(([id])=>id);
  return { left, right, hidden:[], collapsed:[] };
}

function _saveCaseLayout(caseId) {
  const layout = { left:[], right:[], hidden:[], collapsed:[] };
  const lc = document.getElementById('case-col-left');
  const rc = document.getElementById('case-col-right');
  if (lc) lc.querySelectorAll('.case-card-wrap').forEach(w => layout.left.push(w.dataset.cardId));
  if (rc) rc.querySelectorAll('.case-card-wrap').forEach(w => layout.right.push(w.dataset.cardId));
  document.querySelectorAll('#case-restore-btns [data-card-id]').forEach(b => layout.hidden.push(b.dataset.cardId));
  document.querySelectorAll('.case-card-wrap').forEach(w => {
    if (w.querySelector('.case-card-body')?.classList.contains('is-collapsed')) layout.collapsed.push(w.dataset.cardId);
  });
  localStorage.setItem('case_card_layout_' + caseId, JSON.stringify(layout));
}

function _buildCaseCardHtml(cardId, body, headerExtra, caseId, isRight, isCollapsed, isClosed) {
  const meta = _CASE_CARD_META[cardId];
  return `<div class="case-card-wrap" data-card-id="${cardId}" draggable="true">
    <div class="card${isClosed?' border-secondary opacity-75':''}">
      <div class="card-header d-flex align-items-center py-2" style="gap:3px">
        <i class="bi bi-grip-vertical case-card-handle" title="拖动此处可调整卡片顺序" style="cursor:grab"></i>
        <i class="bi ${meta.icon} text-primary" style="font-size:0.9rem"></i>
        <span class="fw-semibold ms-1 flex-grow-1 text-truncate" style="font-size:0.9rem">${meta.label}</span>
        ${isClosed ? '<span class="badge bg-secondary ms-1" style="font-size:0.65rem"><i class="bi bi-lock me-1"></i>已关闭</span>' : (headerExtra||'')}
        <div class="d-flex align-items-center" style="gap:1px;margin-left:4px">
          <button class="case-card-btn card-move-right${isRight?' d-none':''}" title="移至右栏" onclick="moveCaseCard('${cardId}','${caseId}','right')"><i class="bi bi-arrow-right"></i></button>
          <button class="case-card-btn card-move-left${!isRight?' d-none':''}" title="移至左栏" onclick="moveCaseCard('${cardId}','${caseId}','left')"><i class="bi bi-arrow-left"></i></button>
          <button class="case-card-btn" title="${isCollapsed?'展开':'折叠'}" onclick="toggleCaseCard('${cardId}','${caseId}')"><i class="collapse-icon bi bi-chevron-${isCollapsed?'down':'up'}"></i></button>
          <button class="case-card-btn" title="隐藏此卡片" onclick="hideCaseCard('${cardId}','${caseId}')"><i class="bi bi-x-lg"></i></button>
        </div>
      </div>
      <div class="case-card-body${isCollapsed?' is-collapsed':''}" style="${isClosed?'pointer-events:none;user-select:none':''}">
        ${isClosed ? `<div class="position-relative">${body}<div style="position:absolute;inset:0;background:rgba(248,249,250,0.45);z-index:1;border-radius:0 0 4px 4px"></div></div>` : body}
      </div>
    </div>
  </div>`;
}

function toggleCaseCard(cardId, caseId) {
  const body = document.querySelector(`.case-card-wrap[data-card-id="${cardId}"] .case-card-body`);
  const icon = document.querySelector(`.case-card-wrap[data-card-id="${cardId}"] .collapse-icon`);
  if (!body) return;
  body.classList.toggle('is-collapsed');
  if (icon) icon.className = `collapse-icon bi bi-chevron-${body.classList.contains('is-collapsed')?'down':'up'}`;
  _saveCaseLayout(caseId);
}

function hideCaseCard(cardId, caseId) {
  const wrap = document.querySelector(`.case-card-wrap[data-card-id="${cardId}"]`);
  if (!wrap) return;
  wrap.remove();
  const bar = document.getElementById('case-restore-bar');
  const btns = document.getElementById('case-restore-btns');
  if (bar && btns) {
    bar.classList.remove('d-none');
    const meta = _CASE_CARD_META[cardId];
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-outline-secondary py-0';
    btn.dataset.cardId = cardId;
    btn.innerHTML = `<i class="bi ${meta.icon} me-1"></i>${meta.label}`;
    btn.onclick = () => restoreCaseCard(cardId, caseId, btn);
    btns.appendChild(btn);
  }
  _saveCaseLayout(caseId);
}

function restoreCaseCard(cardId, caseId, btn) {
  btn.remove();
  const btns = document.getElementById('case-restore-btns');
  const bar  = document.getElementById('case-restore-bar');
  if (bar && btns && !btns.children.length) bar.classList.add('d-none');
  try {
    const layout = _getCaseLayout(caseId);
    layout.hidden = (layout.hidden||[]).filter(h => h !== cardId);
    localStorage.setItem('case_card_layout_' + caseId, JSON.stringify(layout));
  } catch(e) {}
  renderIntakeCaseDetail();
}

function moveCaseCard(cardId, caseId, direction) {
  const wrap = document.querySelector(`.case-card-wrap[data-card-id="${cardId}"]`);
  const lc = document.getElementById('case-col-left');
  const rc = document.getElementById('case-col-right');
  if (!wrap || !lc || !rc) return;
  if (direction === 'right') {
    rc.appendChild(wrap);
    wrap.querySelector('.card-move-right')?.classList.add('d-none');
    wrap.querySelector('.card-move-left')?.classList.remove('d-none');
  } else {
    lc.appendChild(wrap);
    wrap.querySelector('.card-move-left')?.classList.add('d-none');
    wrap.querySelector('.card-move-right')?.classList.remove('d-none');
  }
  _saveCaseLayout(caseId);
}

function resetCaseLayout(caseId) {
  localStorage.removeItem('case_card_layout_' + caseId);
  renderIntakeCaseDetail();
}

function initCaseCardDrag(caseId) {
  let dragEl = null;
  let handleActive = false;
  document.querySelectorAll('.case-card-wrap').forEach(wrap => {
    const handle = wrap.querySelector('.case-card-handle');
    if (handle) handle.addEventListener('mousedown', () => { handleActive = true; });
    wrap.addEventListener('dragstart', e => {
      if (!handleActive) { e.preventDefault(); return; }
      dragEl = wrap;
      setTimeout(() => wrap.classList.add('is-dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', wrap.dataset.cardId);
    });
    wrap.addEventListener('dragend', () => {
      if (dragEl) dragEl.classList.remove('is-dragging');
      dragEl = null; handleActive = false;
      document.querySelectorAll('.case-card-wrap').forEach(w => w.classList.remove('drop-before','drop-after'));
      document.querySelectorAll('.case-col').forEach(col => col.classList.remove('drop-target'));
      _saveCaseLayout(caseId);
    });
    wrap.addEventListener('dragover', e => {
      if (!dragEl || dragEl === wrap) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.case-card-wrap').forEach(w => w.classList.remove('drop-before','drop-after'));
      const rect = wrap.getBoundingClientRect();
      wrap.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
    });
    wrap.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragEl || dragEl === wrap) return;
      const targetCol = wrap.closest('.case-col');
      if (!targetCol) return;
      document.querySelectorAll('.case-card-wrap').forEach(w => w.classList.remove('drop-before','drop-after'));
      const rect = wrap.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) targetCol.insertBefore(dragEl, wrap);
      else targetCol.insertBefore(dragEl, wrap.nextSibling);
      const isRight = targetCol.id === 'case-col-right';
      dragEl.querySelector('.card-move-right')?.classList.toggle('d-none', isRight);
      dragEl.querySelector('.card-move-left')?.classList.toggle('d-none', !isRight);
      _saveCaseLayout(caseId);
    });
  });
  document.querySelectorAll('.case-col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drop-target'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop-target'); });
    col.addEventListener('drop', e => {
      col.classList.remove('drop-target');
      if (!dragEl || col.contains(dragEl)) return;
      e.preventDefault();
      col.appendChild(dragEl);
      const isRight = col.id === 'case-col-right';
      dragEl.querySelector('.card-move-right')?.classList.toggle('d-none', isRight);
      dragEl.querySelector('.card-move-left')?.classList.toggle('d-none', !isRight);
      _saveCaseLayout(caseId);
    });
  });
  document.addEventListener('mouseup', () => { handleActive = false; }, { passive: true });
}

// ══════════════════════════════════════════════════════
//  INTAKE CASE DETAIL
// ══════════════════════════════════════════════════════
async function renderIntakeCaseDetail() {
  // 清理可能残留的 Bootstrap modal 遮罩
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
  // 自动检测 master-detail 模式：如果 #intakeDetailPanel 在 DOM 中，渲染到面板内
  const _detailPanel = document.getElementById('intakeDetailPanel');
  const _inPanel = !!_detailPanel;
  const main = _detailPanel || document.getElementById('main-content');
  // 兼容直接传参和 State 两种方式
  if (!State.currentCaseId) {
    // 尝试从 URL hash 恢复
    try {
      const h = window.location.hash.slice(1);
      const qi = h.indexOf('?');
      if (qi > 0) {
        const sp = new URLSearchParams(h.substring(qi + 1));
        if (sp.get('caseId')) State.currentCaseId = sp.get('caseId');
      }
    } catch(e) {}
  }
  if (!State.currentCaseId) { main.innerHTML = '<div class="alert alert-warning">未选择案例</div>'; return; }
  main.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>';
  let c;
  try {
    c = await api('GET', `/api/intake-cases/${State.currentCaseId}`);
  } catch(e) {
    main.innerHTML = `<div class="alert alert-danger m-4">案例详情加载失败: ${escapeHtml(e.message)}</div>`;
    return;
  }
  const statusMap   = { registered:'已注册', collecting_docs:'收集材料中', contract_signed:'合同已签', paid:'已付款', visa_in_progress:'签证办理中', ipa_received:'已获IPA', arrived:'已到校', oriented:'已入学', closed:'已关闭' };
  const statusColor = { registered:'secondary', collecting_docs:'info', contract_signed:'primary', paid:'success', visa_in_progress:'warning', ipa_received:'success', arrived:'primary', oriented:'success', closed:'dark' };
  const visaStatusMap = { not_started:'未开始', submitted:'已提交', ipa_received:'已获IPA', additional_docs:'需补件', medical:'体检中', complete_formalities:'完成手续中', approved:'已批准', rejected:'被拒', reapply:'重新申请' };

  const allStatuses = ['registered','collecting_docs','contract_signed','visa_in_progress','ipa_received','paid','arrived','oriented','closed'];
  const curIdx = allStatuses.indexOf(c.status);
  // 各状态对应的时间戳字段（从案例和签证记录中提取）
  const statusDateMap = {
    registered: c.created_at?.slice(0,10),
    contract_signed: c.contract_signed_at?.slice(0,10),
    visa_in_progress: c.visa?.submission_date,
    ipa_received: c.visa?.ipa_issue_date,
    arrived: c.arrival?.actual_arrival,
    oriented: c.arrival?.orientation_done ? c.arrival?.orientation_date : null,
    closed: c.status==='closed' ? c.updated_at?.slice(0,10) : null,
  };

  // ── Stage-based card eligibility ──
  const _stageOrder = ['registered','collecting_docs','contract_signed','visa_in_progress','ipa_received','paid','arrived','oriented','closed'];
  const _si = _stageOrder.indexOf(c.status);
  const _isStudentAdmin = hasRole('student_admin');
  const _isIntakeStaff  = hasRole('intake_staff');
  const _handedOff      = c.phase_handed_off || _si >= 7; // oriented 及以后视为已交接
  const _eligible = {
    all_files:   !_isStudentAdmin,  // 文件总览：始终显示
    mat_adm:     !_isStudentAdmin,  // 材料收集与申请文件
    // 学管老师（student_admin）只负责到校后：隐藏签证、财务、文件中心
    visa:        (_si >= 3 || (c.visa && c.visa.status !== 'not_started')) && !_isStudentAdmin,
    tasks:       true,
    materials:   (_si >= 1 || (c.materials?.length > 0)) && !_isStudentAdmin,
    file_center: hasRole('principal','intake_staff'),
    arrival:     (_si >= 4 || !!(c.arrival?.expected_arrival || c.arrival?.actual_arrival)) && !_isStudentAdmin,
    survey:      (_si >= 7 || !!c.survey) && _isStudentAdmin,
  };
  window._currentCaseDetail = c;
  const _layout = _getCaseLayout(c.id);
  // Add newly eligible cards to their default column if not in layout yet
  const _allInLayout = new Set([...(_layout.left||[]), ...(_layout.right||[]), ...(_layout.hidden||[])]);
  Object.keys(_CASE_CARD_META).forEach(id => {
    if (_eligible[id] && !_allInLayout.has(id)) {
      const col = _CASE_CARD_META[id].defaultCol;
      if (!_layout[col]) _layout[col] = [];
      _layout[col].push(id);
    }
  });
  const _hidden = new Set(_layout.hidden||[]);
  const _collapsed = new Set(_layout.collapsed||[]);

  // Build card HTML (local function using closure over c, visaStatusMap, etc.)
  const _buildCard = (cardId, isRight) => {
    if (!_eligible[cardId] || _hidden.has(cardId)) return '';
    const isCollapsed = _collapsed.has(cardId);
    let body = '', headerExtra = '';

    if (cardId === 'mat_adm') {
      const mr = c.matRequest;
      const admDocs = c.admDocs || [];
      const allDocsOk = admDocs.length >= 3 && admDocs.every(d => d.status === 'done');
      const docLabels = {SAF:'Student Application Form',FORM16:'Form 16 (Student Pass)',V36:'V36 (Additional Info)'};

      if (!mr) {
        // ── 无材料收集请求 ──
        body = `
          <div class="text-center py-4">
            <i class="bi bi-folder-plus text-muted" style="font-size:2.5rem"></i>
            <p class="text-muted mt-2 mb-3">尚未发起材料收集请求</p>
            ${hasRole('principal','intake_staff','counselor') ? `
              <button class="btn btn-primary" onclick="showCreateMatRequestForCase('${c.id}')">
                <i class="bi bi-send me-1"></i>发起材料收集
              </button>
              <div class="small text-muted mt-2">创建后将生成 Agent 填写链接</div>` : ''}
          </div>
          ${admDocs.length > 0 ? _renderDocSection(admDocs, docLabels, mr?.id, allDocsOk) : ''}`;
      } else {
        // ── 已有材料收集请求 — 3 区块设计 ──
        const items = mr.items || [];
        const approved = items.filter(i => i.status === 'APPROVED').length;
        const uploaded = items.filter(i => i.status === 'UPLOADED').length;
        const total = items.length;
        const pct = total > 0 ? Math.round(approved / total * 100) : 0;
        const uif = mr.uif;
        const uifStatus = uif?.status || 'DRAFT';
        const tokenInfo = mr.token;
        const agentLink = tokenInfo ? (location.origin + '/agent.html?token=' + tokenInfo.token) : null;

        // ── 区块 1: 材料收集状态 ──
        const sec1 = `
          <div class="border rounded p-3 mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="mb-0" style="font-size:.9rem"><i class="bi bi-folder-check text-primary me-1"></i>材料收集</h6>
              <span class="badge bg-${mr.status==='COMPLETED'?'success':mr.status==='SUBMITTED'?'info':'secondary'}">${mr.status}</span>
            </div>
            <div class="d-flex justify-content-between small text-muted mb-1">
              <span>已审核 ${approved} / ${total} 项</span>
              ${uploaded>0?`<span class="text-primary">${uploaded} 待审核</span>`:''}
            </div>
            <div class="progress mb-3" style="height:6px"><div class="progress-bar bg-success" style="width:${pct}%"></div></div>
            ${items.map(item => `
              <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                <div>
                  <span style="font-size:.85rem">${escapeHtml(item.name)}</span>
                  ${item.is_required?'<span class="text-danger ms-1" style="font-size:.7rem">必须</span>':''}
                  ${item.reject_reason?`<div class="text-danger small mt-1">退回：${escapeHtml(item.reject_reason)}</div>`:''}
                </div>
                <div class="d-flex align-items-center gap-1 flex-shrink-0">
                  <span class="badge bg-${item.status==='APPROVED'?'success':item.status==='UPLOADED'?'primary':item.status==='REJECTED'?'danger':'secondary'}" style="font-size:.72rem">${item.status==='APPROVED'?'✓ 已通过':item.status==='UPLOADED'?'待审核':item.status==='REJECTED'?'已退回':'待上传'}</span>
                  ${item.file_id ? `<a href="/api/mat-request-items/${item.id}/download" class="btn btn-sm btn-outline-secondary py-0 px-1" download title="下载"><i class="bi bi-download"></i></a>` : ''}
                  ${item.file_id && !['APPROVED'].includes(item.status) ? `
                    <button class="btn btn-sm btn-outline-success py-0 px-1" onclick="reviewMatItem('${item.id}','approve')" title="通过"><i class="bi bi-check-lg"></i></button>
                    <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="reviewMatItem('${item.id}','reject')" title="退回"><i class="bi bi-x-lg"></i></button>` : ''}
                </div>
              </div>`).join('')}
            ${agentLink ? `
              <div class="mt-3 p-2 rounded" style="background:#f0f4ff">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="small text-muted"><i class="bi bi-link-45deg me-1"></i>Agent 填写链接</span>
                  <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="navigator.clipboard.writeText('${agentLink}');showToast('链接已复制到剪贴板')">
                    <i class="bi bi-clipboard me-1"></i>复制链接
                  </button>
                </div>
              </div>` : ''}
          </div>`;

        // ── 区块 2: 学生信息表 (UIF) ──
        const uifBadgeColor = uifStatus==='SUBMITTED'?'warning':uifStatus==='MERGED'?'success':uifStatus==='DRAFT'?'secondary':'secondary';
        const uifBadgeText = uifStatus==='SUBMITTED'?'已提交，待处理':uifStatus==='MERGED'?'已处理':uifStatus==='DRAFT'?'草稿中':'未提交';
        const sec2 = `
          <div class="border rounded p-3 mb-3">
            <div class="d-flex justify-content-between align-items-center">
              <h6 class="mb-0" style="font-size:.9rem"><i class="bi bi-person-lines-fill text-info me-1"></i>学生信息表 (UIF)</h6>
              <span class="badge bg-${uifBadgeColor}">${uifBadgeText}</span>
            </div>
            ${uifStatus==='SUBMITTED'||uifStatus==='MERGED' ? `
              <div class="mt-2">
                <button class="btn btn-sm ${allDocsOk?'btn-outline-primary':'btn-primary'}" onclick="generateDocsFromUif('${mr.id}')">
                  <i class="bi bi-${allDocsOk?'arrow-clockwise':'file-earmark-pdf'} me-1"></i>${allDocsOk?'重新生成申请文件':'生成 3 份申请文件 (SAF / Form16 / V36)'}
                </button>
              </div>` : `
              <div class="mt-2 small text-muted">等待代理通过链接提交学生信息后，可在此生成申请文件。</div>`}
          </div>`;

        // ── 区块 3: 申请文件 ──
        const sec3 = _renderDocSection(admDocs, docLabels, mr.id, allDocsOk);

        body = sec1 + sec2 + sec3;
      }
    } else if (cardId === 'all_files') {
      // ── 文件总览：汇聚所有文件来源 ──
      const allFilesList = [];

      // 1. 申请文件 (SAF/Form16/V36)
      const admDocs = c.admDocs || [];
      const docLabels = {SAF:'Student Application Form',FORM16:'Form 16 (Student Pass)',V36:'V36 (Additional Info)'};
      admDocs.forEach(d => {
        if(d.status==='done') allFilesList.push({
          cat:'申请文件', catIcon:'bi-file-earmark-pdf', catColor:'#dc3545',
          name: docLabels[d.doc_type]||d.doc_type,
          size: d.file_size, date: d.generated_at,
          url: '/api/adm-docs/'+d.id+'/download'
        });
      });

      // 2. 材料收集上传的文件
      const matItems = c.matRequest?.items || [];
      matItems.forEach(item => {
        if(item.file_id) allFilesList.push({
          cat:'代理上传材料', catIcon:'bi-folder-check', catColor:'#0d6efd',
          name: item.name + (item.file_name?' ('+item.file_name+')':''),
          size: item.file_size, date: item.uploaded_at,
          url: '/api/mat-request-items/'+item.id+'/download',
          badge: item.status==='APPROVED'?'已通过':item.status==='REJECTED'?'已退回':'待审核',
          badgeColor: item.status==='APPROVED'?'success':item.status==='REJECTED'?'danger':'warning'
        });
      });

      // 3. 文件收发中心的文件
      (c.fileExchange||[]).forEach(fe => {
        if(fe.file_id) allFilesList.push({
          cat:'文件收发', catIcon:'bi-arrow-left-right', catColor:'#6f42c1',
          name: fe.title||fe.file_name||'文件',
          size: fe.file_size, date: fe.created_at,
          url: '/api/file-exchange/'+fe.id+'/download',
          badge: fe.status, badgeColor: fe.status==='replied'?'success':fe.status==='closed'?'secondary':'info'
        });
        // 回复文件
        (fe.replies||[]).forEach(r => {
          if(r.file_id) allFilesList.push({
            cat:'学生回传', catIcon:'bi-arrow-left', catColor:'#198754',
            name: r.file_name||'回复文件',
            size: r.file_size, date: r.created_at,
            url: '/api/file-exchange/'+r.id+'/reply-download'
          });
        });
      });

      // 4. 案例文件
      (c.caseFiles||[]).forEach(cf => {
        allFilesList.push({
          cat:'案例文件', catIcon:'bi-file-earmark', catColor:'#fd7e14',
          name: cf.label||cf.file_name||'文件',
          size: cf.file_size, date: cf.created_at,
          url: '/api/intake-cases/'+c.id+'/docs'
        });
      });

      // 按日期排序（最新在前）
      allFilesList.sort((a,b) => (b.date||'').localeCompare(a.date||''));

      const totalCount = allFilesList.length;
      const totalSize = allFilesList.reduce((sum,f) => sum + (f.size||0), 0);

      if(totalCount === 0) {
        body = `<div class="text-center py-4 text-muted">
          <i class="bi bi-archive" style="font-size:2rem"></i>
          <p class="mt-2 mb-0">暂无文件</p>
          <small>材料上传、申请文件生成、文件收发后将自动汇总至此</small>
        </div>`;
      } else {
        // 按分类分组显示
        const cats = {};
        allFilesList.forEach(f => { if(!cats[f.cat]) cats[f.cat]=[]; cats[f.cat].push(f); });

        body = `
          <div class="d-flex justify-content-between align-items-center mb-3 px-1">
            <span class="small text-muted">共 ${totalCount} 个文件，${(totalSize/1024/1024).toFixed(1)} MB</span>
          </div>
          ${Object.entries(cats).map(([cat, files]) => `
            <div class="mb-3">
              <div class="d-flex align-items-center gap-1 mb-2">
                <i class="bi ${files[0].catIcon}" style="color:${files[0].catColor}"></i>
                <span class="fw-semibold" style="font-size:.85rem">${cat}</span>
                <span class="badge bg-secondary" style="font-size:.65rem">${files.length}</span>
              </div>
              ${files.map(f => `
                <div class="d-flex justify-content-between align-items-center py-2 px-2 border-bottom" style="font-size:.83rem">
                  <div class="d-flex align-items-center gap-2 flex-grow-1 min-width-0">
                    <i class="bi bi-file-earmark text-muted"></i>
                    <span class="text-truncate">${escapeHtml(f.name)}</span>
                    ${f.badge?`<span class="badge bg-${f.badgeColor||'secondary'}" style="font-size:.65rem">${f.badge}</span>`:''}
                  </div>
                  <div class="d-flex align-items-center gap-2 flex-shrink-0">
                    <span class="text-muted" style="font-size:.72rem">${f.size ? Math.round(f.size/1024)+'KB' : ''}</span>
                    <a href="${f.url}" class="btn btn-sm btn-outline-primary py-0 px-2" download title="下载">
                      <i class="bi bi-download"></i>
                    </a>
                  </div>
                </div>`).join('')}
            </div>`).join('')}
        `;
      }
    }
    if (cardId === 'visa') {
      headerExtra = `<span class="badge bg-info ms-1" style="font-size:0.7rem">${visaStatusMap[c.visa?.status]||'-'}</span>`;
      body = c.visa ? `<div class="card-body">
        <div class="row g-2 mb-2">
          <div class="col-md-3"><label class="form-label small text-muted">提交日期</label><div class="small">${c.visa.submission_date||'-'}</div></div>
          <div class="col-md-3"><label class="form-label small text-muted">IPA签发</label><div class="small ${c.visa.ipa_issue_date?'text-success fw-semibold':''}">${c.visa.ipa_issue_date||'-'}</div></div>
          <div class="col-md-3"><label class="form-label small text-muted">IPA到期</label><div class="small ${c.visa.ipa_expiry_date&&new Date(c.visa.ipa_expiry_date)<new Date()?'text-danger fw-bold':c.visa.ipa_expiry_date?'text-warning':''}">${c.visa.ipa_expiry_date||'-'}</div></div>
          <div class="col-md-3"><label class="form-label small text-muted">当前状态</label><div class="small">${visaStatusMap[c.visa.status]||c.visa.status}</div></div>
        </div>
        <div class="row g-2">
          <div class="col-md-4"><label class="form-label small">签证状态</label>
            <select class="form-select form-select-sm" id="visaStatus">
              ${['not_started','submitted','ipa_received','additional_docs','medical','complete_formalities','approved','rejected','reapply'].map(s => `<option value="${s}" ${c.visa.status===s?'selected':''}>${visaStatusMap[s]}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-4"><label class="form-label small">IPA签发日期</label><input type="date" class="form-control form-control-sm" id="ipaIssueDate" value="${c.visa.ipa_issue_date||''}"></div>
          <div class="col-md-4"><label class="form-label small">IPA到期日期</label><input type="date" class="form-control form-control-sm" id="ipaExpiryDate" value="${c.visa.ipa_expiry_date||''}"></div>
        </div>
        <div class="mt-2 d-flex gap-2 flex-wrap align-items-center">
          <button class="btn btn-sm btn-warning fw-semibold" onclick="markIpaReceived('${c.visa.id}')" title="点击后将自动把案例状态推进至「IPA已收到」并创建到期提醒任务"><i class="bi bi-envelope-check me-1"></i>标记IPA已收到</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="saveVisaStatus('${c.visa.id}')"><i class="bi bi-floppy me-1"></i>仅保存签证信息</button>
          <span class="text-muted small"><i class="bi bi-info-circle me-1"></i>「标记IPA」会自动推进案例状态，「仅保存」只更新签证信息</span>
        </div>
      </div>` : '<div class="card-body text-muted small py-3 text-center">无签证信息</div>';
    }
    if (cardId === 'tasks') {
      // 任务卡操作权限：intake_staff 交接后只读，student_admin 只看自己的阶段
      const canAddTask = hasRole('principal') || (_isIntakeStaff && !_handedOff) || (_isStudentAdmin && _si >= 6);
      if (canAddTask) headerExtra = `<button class="btn btn-sm btn-outline-primary py-0 px-1" onclick="showAddCaseTaskModal('${c.id}')"><i class="bi bi-plus-lg"></i></button>`;
      // intake_staff 交接后任务变为只读提示
      const taskReadOnlyBanner = (_isIntakeStaff && _handedOff)
        ? `<div class="alert alert-light m-2 py-2 small text-muted"><i class="bi bi-lock me-1"></i>案例已移交学管，任务进入只读模式</div>`
        : '';
      const visibleTasks = c.tasks || [];
      body = `<div class="card-body p-0">${taskReadOnlyBanner}${visibleTasks.length ? `<ul class="list-group list-group-flush">${visibleTasks.map(t => {
        const isOverdue = t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date();
        return `<li class="list-group-item d-flex justify-content-between align-items-center${isOverdue?' list-group-item-danger':''}" style="cursor:pointer" onclick="navigate('task-detail',{taskId:'${t.id}'})">
          <div>
            <span class="fw-semibold text-primary small">${escapeHtml(t.title)}</span>
            ${t.due_date?`<span class="badge bg-${isOverdue?'danger':'secondary'} ms-1">${t.due_date}</span>`:''}
            <span class="badge bg-${t.priority==='high'?'danger':t.priority==='low'?'secondary':'primary'} ms-1">${t.priority}</span>
          </div>
          <span class="badge bg-${t.status==='done'?'success':t.status==='in_progress'?'warning':'secondary'}">${t.status==='done'?'已完成':t.status==='in_progress'?'进行中':'待处理'}</span>
        </li>`;}).join('')}</ul>` : '<div class="text-center text-muted py-3 small">暂无任务</div>'}</div>`;
    }
    if (cardId === 'materials') {
      headerExtra = `<button class="btn btn-sm btn-outline-primary py-0 px-1" onclick="showAddDocModal('${c.id}')"><i class="bi bi-plus-lg"></i></button>`;
      body = `<div class="card-body p-0">${c.materials?.length ? `<ul class="list-group list-group-flush">${c.materials.map(m => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <div><span class="fw-semibold small">${escapeHtml(m.title||m.material_type)}</span><span class="badge bg-secondary ms-1">${m.material_type}</span></div>
          <span class="badge bg-${m.status==='已审核'||m.status==='已提交'?'success':m.status==='需补件'?'danger':'secondary'}">${m.status}</span>
        </li>`).join('')}</ul>` : '<div class="text-center text-muted py-3 small">暂无材料</div>'}</div>`;
    }
    // ── 文件收发中心（统一文件往来工作台）──────────────────
    if (cardId === 'file_center') {
      const fxRecords = c.fileExchange || [];
      const fxSent     = fxRecords; // all are admin_to_student from API
      const fxReceived = fxRecords.filter(r => r.replies && r.replies.length > 0);
      const fxPending  = fxSent.filter(r => r.request_reply && !['replied','closed'].includes(r.status));

      const _fxStatusBadge = r => {
        const isOverdue = r.deadline_at && new Date(r.deadline_at) < new Date() && !['replied','closed'].includes(r.status);
        const s = isOverdue ? 'overdue' : r.status;
        const map = { draft:'草稿', sent:'已发送', viewed:'已查看', awaiting_upload:'待回传', overdue:'已逾期', replied:'已回传', closed:'已完成', uploaded_by_student:'学生上传' };
        const color = { draft:'secondary', sent:'primary', viewed:'info', awaiting_upload:'warning', overdue:'danger', replied:'success', closed:'dark', uploaded_by_student:'info' };
        return `<span class="badge bg-${color[s]||'secondary'}" style="font-size:.7rem">${map[s]||s}</span>`;
      };

      headerExtra = `<button class="btn btn-sm btn-primary py-0 px-2" onclick="openFxNewModal('${c.id}')"><i class="bi bi-plus-lg me-1"></i>新建</button>`;

      const _renderRecord = r => {
        const replies = r.replies || [];
        const viewUrl = r.access_token ? `${location.origin}/s/fx/${r.access_token}` : null;
        const _isOverdue = r.deadline_at && new Date(r.deadline_at) < new Date() && !['replied','closed'].includes(r.status);
        const _isDone = ['replied','closed'].includes(r.status);
        const _fxTabs = ['all'];
        if (r.sent_at) _fxTabs.push('sent');
        if (replies.length > 0) _fxTabs.push('received');
        if (r.request_reply && !_isDone) _fxTabs.push('pending');
        if (_isOverdue) _fxTabs.push('overdue');
        if (_isDone) _fxTabs.push('done');
        // D-02: Primary actions (≤3) + overflow dropdown
        const _primaryBtns = [
          r.file_path ? `<a class="btn btn-sm btn-outline-secondary py-0 px-2" href="/api/file-exchange/${r.id}/download" title="下载文件"><i class="bi bi-download"></i></a>` : '',
          (!r.sent_at && r.status==='draft') ? `<button class="btn btn-sm btn-success py-0 px-2" onclick="fxSendRecord('${r.id}','${c.id}')" title="发送给学生"><i class="bi bi-send"></i> 发送</button>` : '',
          replies.length ? `<a class="btn btn-sm btn-outline-success py-0 px-2" href="/api/file-exchange/${r.id}/reply-download" title="下载回传件"><i class="bi bi-file-earmark-arrow-down"></i></a>` : '',
          (!_isDone) ? `<button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="fxCloseRecord('${r.id}','${c.id}')" title="关闭（标记完成）"><i class="bi bi-check2-circle"></i></button>` : '',
        ].filter(Boolean).slice(0, 3).join('');
        const _dropId = `fxdrop-${r.id}`;
        const _overflowItems = [
          (!r.sent_at && r.status==='draft') ? `<li><a class="dropdown-item small text-success fw-semibold" href="#" onclick="fxSendRecord('${r.id}','${c.id}');return false"><i class="bi bi-send me-2"></i>发送给学生</a></li>` : '',
          (r.sent_at && !_isDone) ? `<li><a class="dropdown-item small" href="#" onclick="fxSendRecord('${r.id}','${c.id}');return false"><i class="bi bi-send me-2"></i>重新发送</a></li>` : '',
          `<li><a class="dropdown-item small" href="#" onclick="fxEditRecord('${r.id}','${c.id}');return false"><i class="bi bi-pencil me-2"></i>编辑</a></li>`,
          (r.sent_at && !_isDone) ? `<li><a class="dropdown-item small" href="#" onclick="fxRemindRecord('${r.id}','${c.id}');return false"><i class="bi bi-bell me-2"></i>催办</a></li>` : '',
          viewUrl ? `<li><a class="dropdown-item small" href="#" onclick="copyToClipboard('${viewUrl}','链接已复制');return false"><i class="bi bi-link-45deg me-2"></i>复制链接</a></li>` : '',
          r.file_path ? `<li><a class="dropdown-item small" href="/api/file-exchange/${r.id}/download" download><i class="bi bi-download me-2"></i>下载文件</a></li>` : '',
          replies.length ? `<li><a class="dropdown-item small" href="/api/file-exchange/${r.id}/reply-download" download><i class="bi bi-file-earmark-arrow-down me-2"></i>下载回传件</a></li>` : '',
          (!_isDone) ? `<li><a class="dropdown-item small" href="#" onclick="fxCloseRecord('${r.id}','${c.id}');return false"><i class="bi bi-check2-circle me-2"></i>标记完成</a></li>` : '',
          '<li><hr class="dropdown-divider"></li>',
          `<li><a class="dropdown-item small text-danger" href="#" onclick="fxDeleteRecord('${r.id}','${c.id}');return false"><i class="bi bi-trash3 me-2"></i>删除</a></li>`,
        ].filter(Boolean).join('');
        return `<div class="fx-record" data-fx-tabs="${_fxTabs.join(' ')}">
          <div class="d-flex align-items-start gap-2">
            <div class="flex-grow-1 min-width-0">
              <div class="d-flex align-items-center gap-2 flex-wrap">
                ${_fxStatusBadge(r)}
                <span class="fx-record-title text-truncate" style="max-width:200px" title="${escapeHtml(r.title)}">${escapeHtml(r.title)}</span>
                ${r.direction==='student_to_admin'?'<span class="badge bg-light text-dark border text-2xs">← 学生上传</span>':''}
                ${r.request_reply?'<span class="badge bg-warning text-dark text-2xs">需回传</span>':''}
              </div>
              ${r.description ? `<div class="fx-record-meta mt-1">${escapeHtml(r.description)}</div>` : ''}
              <div class="fx-record-meta mt-1">
                ${r.created_by_name||'—'} · ${new Date(r.created_at).toLocaleDateString('zh-CN')}
                ${r.sent_at ? `· <i class="bi bi-send me-1"></i>${new Date(r.sent_at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}` : ''}
                ${r.viewed_at ? `· <i class="bi bi-eye me-1 text-success"></i>已查看` : r.sent_at ? '· 未查看' : ''}
                ${r.deadline_at ? `· 截止 <span class="${new Date(r.deadline_at)<new Date()?'text-danger fw-bold':''}">${r.deadline_at}</span>` : ''}
              </div>
              ${replies.length ? `<div class="fx-record-meta mt-1 text-success"><i class="bi bi-check-circle me-1"></i>学生已回传 ${replies.length} 个文件 (${new Date(r.replied_at||replies[0]?.created_at).toLocaleDateString('zh-CN')})</div>` : ''}
            </div>
            <div class="fx-actions">
              ${_primaryBtns}
              <div class="dropdown">
                <button class="btn btn-sm btn-outline-secondary py-0 px-2" data-bs-toggle="dropdown" data-bs-strategy="fixed" aria-expanded="false" title="更多操作"><i class="bi bi-three-dots"></i></button>
                <ul class="dropdown-menu dropdown-menu-end" id="${_dropId}">${_overflowItems}</ul>
              </div>
            </div>
          </div>
        </div>`;
      };

      // Filter tabs state (client-side only — no page reload)
      const _fxFilter = window._fxFilter_state || 'all';
      const _fxOverdueCount = fxSent.filter(r => r.deadline_at && new Date(r.deadline_at) < new Date() && !['replied','closed'].includes(r.status)).length;
      const _fxDoneCount = fxRecords.filter(r => ['replied','closed'].includes(r.status)).length;

      body = `<div class="card-body p-0">
        <div class="d-flex gap-1 px-2 pt-2 pb-1 flex-wrap border-bottom" style="font-size:.78rem">
          ${[['all','全部',fxRecords.length],['sent','已发出',fxSent.length],['received','已回传',fxReceived.length],['pending','待回传',fxPending.length],['overdue','已逾期',_fxOverdueCount],['done','已完成',_fxDoneCount]].map(([k,l,n]) =>
            `<button class="btn btn-sm py-0 px-2 ${_fxFilter===k?'btn-primary':'btn-outline-secondary'} fx-tab-btn" data-tab="${k}" onclick="fxFilterTab('${k}')">${l} <span class="badge ${_fxFilter===k?'bg-white text-primary':'bg-secondary'} fx-tab-count">${n}</span></button>`
          ).join('')}
        </div>
        <div class="p-2" id="fx-records-container">
          ${fxRecords.length
            ? fxRecords.map(_renderRecord).join('')
            : '<div class="text-center text-muted py-3 small">暂无记录</div>'}
        </div>
      </div>`;
    }

    if (cardId === 'arrival') {
      const canExport = ['arrived','oriented','closed'].includes(c.status);
      if (canExport) headerExtra = `<div class="d-flex gap-1">
        <a class="btn btn-outline-success btn-sm py-0" href="/api/intake-cases/${c.id}/orientation-export" download><i class="bi bi-file-earmark-excel"></i></a>
        <button class="btn btn-outline-secondary btn-sm py-0" onclick="printOrientationPDF('${c.id}')"><i class="bi bi-printer"></i></button>
        ${hasRole('principal','student_admin')?`<button class="btn btn-outline-primary btn-sm py-0" onclick="sendOrientationToGuan('${c.id}')"><i class="bi bi-send"></i></button>`:''}
      </div>`;
      body = c.arrival ? `<div class="card-body">
        <div class="form-section-title"><i class="bi bi-airplane me-1"></i>到达信息</div>
        <div class="row g-2">
          <div class="col-md-3"><label class="form-label small text-muted">预计到达</label><input type="date" class="form-control form-control-sm" id="arrExpected" value="${c.arrival.expected_arrival||''}"></div>
          <div class="col-md-3"><label class="form-label small text-muted">实际到达</label><input type="date" class="form-control form-control-sm" id="arrActual" value="${c.arrival.actual_arrival||''}"></div>
          <div class="col-md-3"><label class="form-label small text-muted">航班号</label><input type="text" class="form-control form-control-sm" id="arrFlight" value="${c.arrival.flight_no||''}"></div>
          <div class="col-md-3"><label class="form-label small text-muted">Orientation日期</label><input type="date" class="form-control form-control-sm" id="arrOrientation" value="${c.arrival.orientation_date||''}"></div>
        </div>
        <div class="form-section-title mt-3"><i class="bi bi-house me-1"></i>住宿与联系</div>
        <div class="row g-2">
          <div class="col-md-6"><label class="form-label small text-muted">住宿安排</label><input type="text" class="form-control form-control-sm" id="arrAccom" value="${c.arrival.accommodation||''}"></div>
          <div class="col-md-6"><label class="form-label small text-muted">住宿地址</label><input type="text" class="form-control form-control-sm" id="arrAccomAddr" value="${c.arrival.accommodation_address||''}"></div>
          <div class="col-md-4"><label class="form-label small text-muted">紧急联系人</label><input type="text" class="form-control form-control-sm" id="arrEcName" value="${c.arrival.emergency_contact_name||''}"></div>
          <div class="col-md-4"><label class="form-label small text-muted">紧急联系电话</label><input type="text" class="form-control form-control-sm" id="arrEcPhone" value="${c.arrival.emergency_contact_phone||''}"></div>
          <div class="col-md-4"><label class="form-label small text-muted">本地银行账户</label><input type="text" class="form-control form-control-sm" id="arrBankAcc" value="${c.arrival.local_bank_account||''}"></div>
        </div>
        <div class="form-section-title mt-3"><i class="bi bi-card-text me-1"></i>证件与进度</div>
        <div class="row g-2">
          <div class="col-md-4"><label class="form-label small text-muted">学生证号</label><input type="text" class="form-control form-control-sm" id="arrPassNo" value="${c.arrival.student_pass_no||''}"></div>
          <div class="col-md-4"><label class="form-label small text-muted">学生证有效期</label><input type="date" class="form-control form-control-sm" id="arrPassExpiry" value="${c.arrival.student_pass_expiry||''}"></div>
          <div class="col-md-12 d-flex gap-3 mt-1">
            <div class="form-check"><input class="form-check-input" type="checkbox" id="arrPickup" ${c.arrival.pickup_arranged?'checked':''}><label class="form-check-label small" for="arrPickup">接机已安排</label></div>
            <div class="form-check"><input class="form-check-input" type="checkbox" id="arrOrientDone" ${c.arrival.orientation_done?'checked':''}><label class="form-check-label small" for="arrOrientDone">Orientation已完成</label></div>
            <div class="form-check"><input class="form-check-input" type="checkbox" id="arrPassIssued" ${c.arrival.student_pass_issued?'checked':''}><label class="form-check-label small" for="arrPassIssued">学生准证已办</label></div>
          </div>
          <div class="col-12"><label class="form-label small text-muted">备注</label><textarea class="form-control form-control-sm" id="arrOrientNotes" rows="2">${c.arrival.orientation_notes||''}</textarea></div>
        </div>
        <button class="btn btn-sm btn-primary mt-3" onclick="saveArrival('${c.arrival.id}')">保存信息</button>
      </div>`
      : '<div class="card-body"><div class="text-muted small py-2"><i class="bi bi-info-circle me-1"></i>暂无到校记录。请先将案例状态推进至「已获IPA」，系统将自动创建到校信息表。</div></div>';
    }
    if (cardId === 'survey') {
      body = `<div class="card-body">${c.survey ? `
        <div class="d-flex align-items-center gap-2 mb-2">
          <span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>已提交</span>
          <span class="text-muted small">问卷已提交，不可修改</span>
        </div>
        <div class="mb-1">总体满意度: <strong>${'★'.repeat(c.survey.overall_satisfaction)}${'☆'.repeat(5-(c.survey.overall_satisfaction||0))}</strong> (${c.survey.overall_satisfaction}/5)</div>
        <div class="mb-1 small"><span class="text-muted">住宿：</span>${c.survey.accommodation_ok?'满意':'不满意'} · <span class="text-muted">Orientation：</span>${c.survey.orientation_helpful?'有帮助':'帮助不大'}</div>
        ${c.survey.support_needed?`<div class="small"><span class="text-muted">额外支持：</span>${escapeHtml(c.survey.support_needed)}</div>`:''}
        ${c.survey.comments?`<div class="text-muted small">${escapeHtml(c.survey.comments)}</div>`:''}
      ` : (c.status==='oriented'||c.status==='closed') ? `
        <div class="alert alert-light py-2 mb-2 small"><i class="bi bi-info-circle me-1 text-primary"></i>建议优先生成外链发给学生自行填写；若学生无法操作，再由内部代填。内部代填后学生无法再提交。</div>
        <button class="btn btn-sm btn-success w-100 mb-2" onclick="generateSurveyLink('${c.id}')"><i class="bi bi-link-45deg me-1"></i>生成外链发给学生（推荐）</button>
        <button class="btn btn-sm btn-outline-secondary w-100" onclick="showSurveyModal('${c.id}')"><i class="bi bi-pencil me-1"></i>内部代填问卷</button>
        <div id="survey-link-box-${c.id}" class="d-none mt-2">
          <div class="input-group input-group-sm">
            <input type="text" class="form-control" id="survey-link-text-${c.id}" readonly>
            <button class="btn btn-outline-secondary" onclick="copySurveyLink('${c.id}')"><i class="bi bi-copy"></i></button>
          </div>
          <button class="btn btn-sm btn-outline-primary mt-1 w-100" onclick="sendSurveyLinkByEmail('${c.id}','${escapeHtml(c.student_name||'')}')"><i class="bi bi-envelope me-1"></i>发送链接至学生邮箱</button>
        </div>
      ` : '<div class="text-muted small">待案例进入"已入学"状态后可发送调查</div>'}</div>`;
    }
    return _buildCaseCardHtml(cardId, body, headerExtra, c.id, isRight, isCollapsed, c.status === 'closed');
  };

  // 旧卡片渲染已停用（新布局使用 Tab 系统）
  const _leftColHtml = '';
  const _rightColHtml = '';
  const _hiddenEligible = [...(_layout.left||[]),...(_layout.right||[])].filter(id => _eligible[id] && _hidden.has(id));
  // Locked cards: eligible=false (not yet reached stage)
  const _lockedCards = Object.keys(_CASE_CARD_META).filter(id => !_eligible[id]);

  // 面板模式下重新高亮左侧卡片
  if (_inPanel) {
    document.querySelectorAll('.case-card').forEach(el => el.classList.toggle('active', el.dataset.caseId === c.id));
  }
  main.innerHTML = `
    <div class="case-detail-header ${_inPanel?'case-detail-header--panel':''}">
      ${_inPanel
        ? `<button class="btn btn-outline-secondary btn-sm flex-shrink-0" onclick="closeCaseDetailPanel()" title="关闭"><i class="bi bi-x-lg"></i></button>`
        : `<button class="btn btn-outline-secondary btn-sm flex-shrink-0" onclick="showPage('intake-cases')"><i class="bi bi-arrow-left"></i> 返回列表</button>`}
      <div class="flex-grow-1 min-width-0">
        <div class="d-flex align-items-center gap-2 flex-wrap">
          ${_inPanel?'<h5':'<h4'} class="mb-0 text-truncate">
            ${!hasRole('intake_staff','student_admin')
              ? `<a href="#" class="student-name-link" onclick="navigate('student-detail',{studentId:'${c.student_id}'})" title="查看学生档案">${escapeHtml(c.student_name||'')}</a>`
              : `<span>${escapeHtml(c.student_name||'')}</span>`}
          ${_inPanel?'</h5>':'</h4>'}
          <span class="badge bg-${statusColor[c.status]||'secondary'}">${statusMap[c.status]||c.status}</span>
        </div>
        <div class="text-muted" style="font-size:.8rem">${escapeHtml(c.program_name||'')} · ${c.intake_year}${c.owner_name ? ' · '+escapeHtml(c.owner_name) : ''}</div>
      </div>
      ${!hasRole('intake_staff','student_admin') ? `<button class="btn btn-outline-primary btn-sm flex-shrink-0" onclick="navigate('student-detail',{studentId:'${c.student_id}'})"><i class="bi bi-person-fill${_inPanel?'':' me-1'}"></i>${_inPanel?'':'查看学生'}</button>` : ''}
    </div>

    ${_handedOff && _isIntakeStaff ? `<div class="text-muted small mb-2" style="padding:6px 10px;background:#f8fafc;border-radius:6px;border:1px solid #e5e7eb"><i class="bi bi-check-circle me-1"></i>已移交学管，当前为只读视图</div>` : ''}
    ${_isStudentAdmin && _si < 6 ? `<div class="text-muted small mb-2" style="padding:6px 10px;background:#f8fafc;border-radius:6px;border:1px solid #e5e7eb"><i class="bi bi-hourglass me-1"></i>学生尚未到校，到校后系统会通知你</div>` : ''}
    ${_isStudentAdmin && _si >= 6 && _si < 7 ? `<div class="small mb-2" style="padding:6px 10px;background:#eef2ff;border-radius:6px;border:1px solid #c7d2fe;color:#4338ca"><i class="bi bi-person-check me-1"></i>学生已到校，请完成 Orientation</div>` : ''}

    <!-- 流程进度 (轻量线性) -->
    <div class="tl-strip mb-3">
      <div class="d-flex align-items-center overflow-auto" style="gap:0">
        ${(() => {
          const _ALLOWED = {
            'registered':['collecting_docs'],'collecting_docs':['registered','contract_signed'],
            'contract_signed':['collecting_docs','visa_in_progress'],'visa_in_progress':['contract_signed','ipa_received'],
            'ipa_received':['visa_in_progress','paid'],'paid':['ipa_received','arrived'],
            'arrived':['paid','oriented'],'oriented':['arrived','closed'],'closed':[]
          };
          const validNext = new Set(_ALLOWED[c.status]||[]);
          const canOperate = hasRole('principal')||(_isIntakeStaff&&!_handedOff)||(_isStudentAdmin&&curIdx>=allStatuses.indexOf('arrived'));
          return allStatuses.map((s,i) => {
            const done=i<curIdx, current=i===curIdx, isNext=canOperate&&validNext.has(s);
            const dot = done?'tl-done':current?'tl-current':'tl-future';
            const dateStr = statusDateMap[s]||'';
            const tipParts = [statusMap[s]];
            if (dateStr) tipParts.push(dateStr);
            if (isNext) tipParts.push('点击切换');
            else if (current) tipParts.push('当前');
            const tip = tipParts.join(' · ');
            const line = i>0?`<div class="tl-line ${done||current?'tl-line-done':''}"></div>`:'';
            const node = isNext
              ? `<button class="tl-dot ${dot} tl-clickable" onclick="updateCaseStatus('${c.id}','${s}','${statusMap[s]}')" title="${tip}">${done?'✓':''}</button>`
              : `<div class="tl-dot ${dot}" title="${tip}">${done?'✓':''}</div>`;
            return `<div class="tl-step" style="flex:1;min-width:${_inPanel?'60':'80'}px">
              <div class="d-flex align-items-center">${line}${node}${i<allStatuses.length-1?`<div class="tl-line ${done?'tl-line-done':''}"></div>`:''}</div>
              <div class="tl-label ${current?'tl-label-current':''}" style="font-size:${_inPanel?'.6':'.65'}rem">${statusMap[s]}${current&&dateStr?`<div style="font-size:.55rem;color:#94a3b8">${dateStr}</div>`:''}</div>
            </div>`;
          }).join('');
        })()}
      </div>
    </div>

    ${_inPanel ? `
    <!-- ═══ 面板模式：横向摘要条 + 全宽 Tabs ═══ -->
    <div class="case-summary-strip">
      ${_eligible.visa ? `<div class="css-chip">
        <i class="bi bi-passport text-warning"></i>
        <span>签证</span>
        <span class="badge bg-${c.visa?.status==='approved'?'success':c.visa?.status==='rejected'?'danger':'info'}">${visaStatusMap[c.visa?.status]||'未开始'}</span>
        ${hasRole('principal','intake_staff') ? `<button class="css-chip-btn" onclick="openVisaEditPanel('${c.id}')"><i class="bi bi-pencil"></i></button>` : ''}
      </div>` : ''}
      <div class="css-chip">
        <i class="bi bi-check2-square text-primary"></i>
        <span>待办</span>
        <span class="badge bg-primary">${(c.tasks||[]).filter(t=>t.status!=='done').length}</span>
        <button class="css-chip-btn" onclick="document.getElementById('quickTaskInput')?.classList.toggle('d-none')"><i class="bi bi-plus-lg"></i></button>
      </div>
      ${_eligible.arrival ? `<div class="css-chip">
        <i class="bi bi-airplane text-info"></i>
        <span>${c.arrival?.actual_arrival ? '已到校 '+c.arrival.actual_arrival : c.arrival?.expected_arrival ? '预计 '+c.arrival.expected_arrival : '到校'}</span>
        ${hasRole('principal','intake_staff') ? `<button class="css-chip-btn" onclick="openArrivalEditPanel('${c.id}')"><i class="bi bi-pencil"></i></button>` : ''}
      </div>` : ''}
      ${_eligible.survey ? `<div class="css-chip">
        <i class="bi bi-clipboard-check text-success"></i>
        <span>${c.survey ? '调查 '+c.survey.overall_score+'/5' : '调查未发'}</span>
      </div>` : ''}
      <div class="css-chip">
        <i class="bi bi-person-fill text-secondary"></i>
        <span class="text-muted">负责人</span>
        <span>${escapeHtml(c.owner_name||'未分配')}</span>
      </div>
      ${c.agent_name ? `<div class="css-chip">
        <i class="bi bi-person-badge text-info"></i>
        <span class="text-muted">代理</span>
        <span>${escapeHtml(c.agent_name)}</span>
      </div>` : ''}
    </div>
    <!-- 待办快速添加（展开时显示在摘要条下方） -->
    <div id="quickTaskInput" class="d-none mb-2">
      <div class="input-group input-group-sm">
        <input type="text" class="form-control" id="sideTaskTitle" placeholder="新任务标题...">
        <button class="btn btn-primary" onclick="addQuickTask('${c.id}')"><i class="bi bi-check"></i></button>
      </div>
    </div>
    <!-- 全宽主工作区 -->
    <div class="card" style="flex:1;min-width:0">
      <div class="card-header p-0" style="background:none;border-bottom:none">
        <ul class="nav nav-tabs" id="fcTabs" role="tablist" style="border-bottom:2px solid #e5e7eb;font-size:.85rem">
          <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#fcAgent" role="tab" style="padding:.5rem .75rem"><i class="bi bi-person-badge me-1"></i>代理</a></li>
          ${hasRole('principal','intake_staff') ? `<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#fcStudent" role="tab" style="padding:.5rem .75rem"><i class="bi bi-person me-1"></i>学生</a></li>` : ''}
          <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#fcAll" role="tab" style="padding:.5rem .75rem"><i class="bi bi-archive me-1"></i>文件</a></li>
          <li class="nav-item ms-auto"><a class="nav-link" data-bs-toggle="tab" href="#fcTasks" role="tab" style="padding:.5rem .75rem"><i class="bi bi-check2-square me-1"></i>待办 <span class="badge bg-primary" style="font-size:.65rem">${(c.tasks||[]).filter(t=>t.status!=='done').length}</span></a></li>
        </ul>
      </div>
      <div class="card-body tab-content p-2">
    ` : `
    <!-- ═══ 全屏模式：左栏摘要 + 右栏文件中心 ═══ -->
    <div class="case-detail-inner">
      <!-- 左栏：案例摘要面板 -->
      <div id="caseSidePanel" class="case-side-fixed">
        <div class="card case-side-card">
          <!-- 签证 -->
          ${_eligible.visa ? `
          <div class="card-body py-2 px-3 border-bottom">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="fw-semibold small"><i class="bi bi-passport me-1 text-warning"></i>签证</span>
              <div class="d-flex align-items-center gap-1">
                <span class="badge bg-${c.visa?.status==='approved'?'success':c.visa?.status==='rejected'?'danger':'info'}" style="font-size:.7rem">${visaStatusMap[c.visa?.status]||'未开始'}</span>
                ${hasRole('principal','intake_staff') ? `<button class="btn btn-outline-secondary py-0 px-1" style="font-size:.7rem" onclick="openVisaEditPanel('${c.id}')"><i class="bi bi-pencil"></i></button>` : ''}
              </div>
            </div>
            ${c.visa?.submission_date ? `<div class="small text-muted">提交: ${c.visa.submission_date}</div>` : ''}
            ${c.visa?.ipa_issue_date ? `<div class="small text-success">IPA: ${c.visa.ipa_issue_date}</div>` : ''}
            ${c.visa?.solar_app_no ? `<div class="small text-muted">SOLAR: ${c.visa.solar_app_no}</div>` : ''}
          </div>` : ''}
          <!-- 待办任务 -->
          <div class="card-body py-2 px-3 border-bottom">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="fw-semibold small"><i class="bi bi-check2-square me-1 text-primary"></i>待办</span>
              <div class="d-flex align-items-center gap-1">
                <span class="badge bg-primary" style="font-size:.7rem">${(c.tasks||[]).filter(t=>t.status!=='done').length}</span>
                <button class="btn btn-outline-primary py-0 px-1" style="font-size:.7rem" onclick="document.getElementById('quickTaskInput').classList.toggle('d-none')"><i class="bi bi-plus-lg"></i></button>
              </div>
            </div>
            <div id="quickTaskInput" class="d-none mb-2">
              <div class="input-group input-group-sm">
                <input type="text" class="form-control" id="sideTaskTitle" placeholder="新任务标题...">
                <button class="btn btn-primary" onclick="addQuickTask('${c.id}')"><i class="bi bi-check"></i></button>
              </div>
            </div>
            ${(c.tasks||[]).slice(0,8).map(t => `
              <div class="d-flex align-items-center gap-1 py-1">
                <input type="checkbox" class="form-check-input" style="min-width:14px" ${t.status==='done'?'checked':''} onchange="toggleTaskComplete('${t.id}','${c.id}')">
                <span class="small text-truncate flex-grow-1 ${t.status==='done'?'text-decoration-line-through text-muted':''}" style="max-width:180px">${escapeHtml(t.title)}</span>
                <span class="text-muted flex-shrink-0" style="font-size:.68rem">${t.due_date?.slice(5)||''}</span>
              </div>`).join('')}
            ${(c.tasks||[]).length > 8 ? `<div class="small text-muted mt-1">还有 ${(c.tasks||[]).length-8} 项</div>` : ''}
            ${(c.tasks||[]).length === 0 ? `<div class="small text-muted">暂无待办</div>` : ''}
          </div>
          <!-- 到校 -->
          ${_eligible.arrival ? `
          <div class="card-body py-2 px-3 border-bottom">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="fw-semibold small"><i class="bi bi-airplane me-1 text-info"></i>到校</span>
              ${hasRole('principal','intake_staff') ? `<button class="btn btn-outline-secondary py-0 px-1" style="font-size:.7rem" onclick="openArrivalEditPanel('${c.id}')"><i class="bi bi-pencil"></i></button>` : ''}
            </div>
            ${c.arrival?.actual_arrival
              ? `<div class="small text-success">✓ 已到校: ${c.arrival.actual_arrival}</div>
                 ${c.arrival?.flight_no?`<div class="small text-muted">航班: ${c.arrival.flight_no}</div>`:''}
                 ${c.arrival?.accommodation?`<div class="small text-muted">住宿: ${escapeHtml(c.arrival.accommodation)}</div>`:''}`
              : c.arrival?.expected_arrival
                ? `<div class="small text-muted">预计: ${c.arrival.expected_arrival}</div>`
                : `<div class="small text-muted">暂无到校信息</div>`}
          </div>` : ''}
          <!-- 满意度调查 -->
          ${_eligible.survey ? `
          <div class="card-body py-2 px-3 border-bottom">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="fw-semibold small"><i class="bi bi-clipboard-check me-1 text-success"></i>满意度调查</span>
            </div>
            ${c.survey
              ? `<div class="small text-success">✓ 已完成 (${c.survey.overall_score||'-'}/5)</div>`
              : `<button class="btn btn-sm btn-outline-success w-100 py-0" onclick="sendSurvey('${c.id}')"><i class="bi bi-send me-1"></i>发送调查</button>`}
          </div>` : ''}
          <!-- 案例信息 -->
          <div class="card-body py-2 px-3">
            <div class="fw-semibold small mb-1"><i class="bi bi-info-circle me-1 text-secondary"></i>信息</div>
            <div class="small text-muted">负责人: ${escapeHtml(c.owner_name||'未分配')}</div>
            <div class="small text-muted">创建: ${c.created_at?.slice(0,10)||''}</div>
            ${c.referral_type ? `<div class="small text-muted">来源: ${c.referral_type==='agent'?'代理':'内部'} ${c.agent_name?'('+escapeHtml(c.agent_name)+')':''}</div>` : ''}
            ${c.notes ? `<div class="small text-muted mt-1">备注: ${escapeHtml(c.notes).substring(0,60)}${c.notes.length>60?'...':''}</div>` : ''}
          </div>
        </div>
      </div>

      <!-- 右栏：文件中心 (Tab) -->
      <div class="flex-grow-1" style="min-width:0">
        <div class="card">
          <div class="card-header p-0" style="background:none;border-bottom:none">
            <ul class="nav nav-tabs" id="fcTabs" role="tablist" style="border-bottom:2px solid #e5e7eb">
              <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#fcAgent" role="tab"><i class="bi bi-person-badge me-1"></i>代理协作</a></li>
              ${hasRole('principal','intake_staff') ? `<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#fcStudent" role="tab"><i class="bi bi-person me-1"></i>学生协作</a></li>` : ''}
              <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#fcAll" role="tab"><i class="bi bi-archive me-1"></i>全部文件</a></li>
            </ul>
          </div>
          <div class="card-body tab-content p-3">

            <!-- Tab 1: 代理协作 -->
            <div class="tab-pane fade show active" id="fcAgent" role="tabpanel">
              ${_renderAgentTab(c)}
            </div>

            <!-- Tab 2: 学生协作 -->
            <div class="tab-pane fade" id="fcStudent" role="tabpanel">
              ${_renderStudentTab(c)}
            </div>

            <!-- Tab 3: 全部文件 -->
            <div class="tab-pane fade" id="fcAll" role="tabpanel">
              ${_renderAllFilesTab(c)}
            </div>

          </div>
        </div>
      </div>
    </div>
    `}

    ${_inPanel ? `
            <!-- Tab 1: 代理协作 -->
            <div class="tab-pane fade show active" id="fcAgent" role="tabpanel">
              ${_renderAgentTab(c)}
            </div>

            <!-- Tab 2: 学生协作 -->
            <div class="tab-pane fade" id="fcStudent" role="tabpanel">
              ${_renderStudentTab(c)}
            </div>

            <!-- Tab 3: 全部文件 -->
            <div class="tab-pane fade" id="fcAll" role="tabpanel">
              ${_renderAllFilesTab(c)}
            </div>

            <!-- Tab 4: 待办任务 -->
            <div class="tab-pane fade" id="fcTasks" role="tabpanel">
              <div id="quickTaskInput2" class="mb-2">
                <div class="input-group input-group-sm">
                  <input type="text" class="form-control" id="sideTaskTitle2" placeholder="新任务标题...">
                  <button class="btn btn-primary" onclick="addQuickTask('${c.id}','sideTaskTitle2')"><i class="bi bi-check"></i></button>
                </div>
              </div>
              ${(c.tasks||[]).map(t => `
                <div class="d-flex align-items-center gap-2 py-1 border-bottom">
                  <input type="checkbox" class="form-check-input" style="min-width:14px" ${t.status==='done'?'checked':''} onchange="toggleTaskComplete('${t.id}','${c.id}')">
                  <span class="small flex-grow-1 ${t.status==='done'?'text-decoration-line-through text-muted':''}">${escapeHtml(t.title)}</span>
                  <span class="text-muted flex-shrink-0" style="font-size:.7rem">${t.due_date?.slice(5)||''}</span>
                </div>`).join('')}
              ${(c.tasks||[]).length === 0 ? '<div class="text-muted small py-2">暂无待办</div>' : ''}
            </div>
      </div>
    </div>
    ` : ''}

    <!-- 保留旧卡片网格（隐藏，供旧代码引用不报错） -->
    <div class="case-grid d-none">
      <div class="case-col" id="case-col-left" data-col="left"></div>
      <div class="case-col" id="case-col-right" data-col="right"></div>
    </div>
  `;

  // Wire up modal buttons (use .onclick = to prevent listener accumulation on re-render)
  const submitTaskBtn = document.getElementById('submitTaskBtn');
  if (submitTaskBtn) submitTaskBtn.onclick = async () => {
    if (!acquireSubmit('caseTask')) return;
    const title = document.getElementById('newTaskTitle')?.value?.trim();
    if (!title) { releaseSubmit('caseTask'); showError('请输入任务标题'); return; }
    try {
      await api('POST', `/api/intake-cases/${c.id}/tasks`, {
        title,
        due_date: document.getElementById('newTaskDue')?.value||null,
        priority: document.getElementById('newTaskPriority')?.value,
        category: document.getElementById('newTaskCategory')?.value||'其他'
      });
      bootstrap.Modal.getInstance(document.getElementById('addCaseTaskModal'))?.hide();
      showSuccess('任务已添加'); renderIntakeCaseDetail();
    } catch(e) { showError(e.message); }
    finally { releaseSubmit('caseTask'); }
  };

  const submitDocBtn = document.getElementById('submitDocBtn');
  if (submitDocBtn) submitDocBtn.onclick = async () => {
    if (!acquireSubmit('caseDoc')) return;
    try {
      await api('POST', `/api/intake-cases/${c.id}/docs`, {
        material_type: document.getElementById('newDocType')?.value,
        title: document.getElementById('newDocTitle')?.value||null
      });
      bootstrap.Modal.getInstance(document.getElementById('addDocModal'))?.hide();
      showSuccess('材料已添加'); renderIntakeCaseDetail();
    } catch(e) { showError(e.message); }
    finally { releaseSubmit('caseDoc'); }
  };

  const submitInvBtn = document.getElementById('submitInvBtn');
  if (submitInvBtn) submitInvBtn.onclick = async () => {
    if (!acquireSubmit('caseInv')) return;
    const name = document.getElementById('invItemName')?.value?.trim();
    const amount = parseFloat(document.getElementById('invAmount')?.value);
    const due_at = document.getElementById('invDue')?.value;
    if (!name || !amount) { releaseSubmit('caseInv'); showError('请填写费用项目和金额'); return; }
    try {
      await api('POST', `/api/intake-cases/${c.id}/invoices`, {
        currency: 'SGD',
        items: [{ name, amount }],
        due_at: due_at ? due_at + 'T23:59:00+08:00' : null
      });
      bootstrap.Modal.getInstance(document.getElementById('createInvoiceModal'))?.hide();
      showSuccess('账单已生成'); renderIntakeCaseDetail();
    } catch(e) { showError(e.message); }
    finally { releaseSubmit('caseInv'); }
  };

  const submitSurvBtn = document.getElementById('submitSurvBtn');
  if (submitSurvBtn) submitSurvBtn.onclick = async () => {
    if (!acquireSubmit('caseSurv')) return;
    try {
      await api('POST', `/api/intake-cases/${c.id}/surveys`, {
        overall_satisfaction: parseInt(document.getElementById('survSatisfaction')?.value)||5,
        accommodation_ok: document.getElementById('survAccom')?.checked,
        orientation_helpful: document.getElementById('survOrient')?.checked,
        support_needed: document.getElementById('survSupport')?.value||null,
        comments: document.getElementById('survComments')?.value||null,
        filled_by: 'internal'  // F-03: 内部代填，区别于学生外链自填 'student_external'
      });
      bootstrap.Modal.getInstance(document.getElementById('surveyModal'))?.hide();
      showSuccess('问卷已提交'); renderIntakeCaseDetail();
    } catch(e) { showError(e.message); }
    finally { releaseSubmit('caseSurv'); }
  };

  // 初始化卡片拖拽
  initCaseCardDrag(c.id);
  // 应用文件收发筛选（客户端过滤，无需重渲染页面）
  fxFilterTab(window._fxFilter_state || 'all');
  // D-18: init Bootstrap tooltips
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
    if (!el._bsTooltip) el._bsTooltip = new bootstrap.Tooltip(el);
  });
}

function updateCaseStatus(caseId, status, label) {
  // U-13: 各状态会自动创建的任务提示
  const autoTaskHint = {
    'contract_signed':  '系统将自动创建：收集护照及入学材料任务',
    'visa_in_progress': '系统将自动创建：提交签证申请任务',
    'ipa_received':     '系统将自动创建：提醒到校日期及接机安排任务',
    'paid':             '系统将自动创建：跟进学费缴纳及确认收据任务',
    'arrived':          '系统将自动创建：完成登记与Orientation任务，并通知学管老师',
    'oriented':         '系统将自动创建：发送满意度问卷任务',
  };
  const hint = autoTaskHint[status];
  // H-03: 检测卡片表单是否有未保存的修改
  const inputs = document.querySelectorAll('.case-card-body input[type="text"], .case-card-body input[type="date"], .case-card-body textarea, .case-card-body select');
  const hasDirty = Array.from(inputs).some(el => el.defaultValue !== undefined && el.value !== el.defaultValue && el.value !== '');
  // H-04: 关闭案例特殊警告
  const isClose = status === 'closed';
  // 判断是否回退（前端 _stageOrder 对比）
  const _stageOrder = ['registered','collecting_docs','contract_signed','visa_in_progress','ipa_received','paid','arrived','oriented','closed'];
  const currentStatusEl = document.querySelector('.badge.fs-6.bg-primary');
  const currentStatusText = currentStatusEl?.textContent?.trim() || '';
  const statusMapRev = { '已注册':'registered','收集材料中':'collecting_docs','合同已签':'contract_signed','已付款':'paid','签证办理中':'visa_in_progress','已获IPA':'ipa_received','已到校':'arrived','已入学':'oriented','已关闭':'closed' };
  const currentStatus = statusMapRev[currentStatusText];
  const isBackward = currentStatus && _stageOrder.indexOf(status) < _stageOrder.indexOf(currentStatus);

  let msg = '';
  if (hasDirty) msg += `<div class="alert alert-warning py-2 mb-2 small"><i class="bi bi-exclamation-triangle me-1"></i>检测到卡片中有未保存的内容，切换状态后将会丢失，建议先保存。</div>`;
  if (isBackward) msg += `<div class="alert alert-info py-2 mb-2 small"><i class="bi bi-arrow-counterclockwise me-1"></i>你正在<strong>回退</strong>案例状态（${currentStatusText} → ${label}）。</div>`;
  if (isClose) msg += `<div class="alert alert-danger py-2 mb-2 small"><i class="bi bi-lock me-1"></i><strong>关闭后案例将进入终态，无法再变更。</strong></div>`;
  msg += `确认将案例状态切换至「<strong>${label}</strong>」？`;
  if (hint) msg += `<div class="text-muted small mt-2"><i class="bi bi-robot me-1"></i>${hint}</div>`;

  const lockKey = `caseStatus_${caseId}`;
  confirmAction(msg, async () => {
    if (!acquireSubmit(lockKey)) return;
    try {
      await api('PUT', `/api/intake-cases/${caseId}/status`, { status });
      showSuccess('状态已更新'); renderIntakeCaseDetail();
    } catch(e) { showError(e.message); }
    finally { releaseSubmit(lockKey); }
  }, { danger: isClose });
}

async function markIpaReceived(visaId) {
  if (!acquireSubmit('markIpa')) return;
  const ipa_issue_date = document.getElementById('ipaIssueDate')?.value;
  const ipa_expiry_date = document.getElementById('ipaExpiryDate')?.value;
  if (!ipa_issue_date) { releaseSubmit('markIpa'); showError('请填写 IPA 签发日期'); return; }
  if (ipa_expiry_date && ipa_expiry_date <= ipa_issue_date) { releaseSubmit('markIpa'); showError('IPA 到期日期必须晚于签发日期'); return; }
  try {
    await api('PUT', `/api/visa-cases/${visaId}/ipa`, { ipa_issue_date, ipa_expiry_date });
    showSuccess('IPA 已标记收到，系统已自动创建到期提醒任务'); renderIntakeCaseDetail();
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('markIpa'); }
}

async function saveVisaStatus(visaId) {
  if (!acquireSubmit('saveVisaStatus')) return;
  const status = document.getElementById('visaStatus')?.value;
  if (!status) { releaseSubmit('saveVisaStatus'); showError('请选择签证状态'); return; }
  const ipa_issue_date = document.getElementById('ipaIssueDate')?.value || null;
  const ipa_expiry_date = document.getElementById('ipaExpiryDate')?.value || null;
  if (ipa_expiry_date && ipa_issue_date && ipa_expiry_date <= ipa_issue_date) {
    releaseSubmit('saveVisaStatus'); showError('IPA 到期日期必须晚于签发日期'); return;
  }
  try {
    await api('PUT', `/api/visa-cases/${visaId}`, { status, ipa_issue_date, ipa_expiry_date });
    showSuccess('签证信息已保存'); renderIntakeCaseDetail();
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveVisaStatus'); }
}

async function saveArrival(arrivalId) {
  if (!acquireSubmit('saveArrival')) return;
  try {
    await api('PUT', `/api/arrival-records/${arrivalId}`, {
      expected_arrival: document.getElementById('arrExpected')?.value||null,
      actual_arrival: document.getElementById('arrActual')?.value||null,
      flight_no: document.getElementById('arrFlight')?.value||null,
      orientation_date: document.getElementById('arrOrientation')?.value||null,
      accommodation: document.getElementById('arrAccom')?.value||null,
      insurance_provider: document.getElementById('arrInsurance')?.value||null,
      pickup_arranged: document.getElementById('arrPickup')?.checked ? 1 : 0,
      orientation_done: document.getElementById('arrOrientDone')?.checked ? 1 : 0,
      student_pass_issued: document.getElementById('arrPassIssued')?.checked ? 1 : 0,
      notes: document.getElementById('arrNotes')?.value||null,
      accommodation_address: document.getElementById('arrAccomAddr')?.value||null,
      emergency_contact_name: document.getElementById('arrEcName')?.value||null,
      emergency_contact_phone: document.getElementById('arrEcPhone')?.value||null,
      student_pass_no: document.getElementById('arrPassNo')?.value||null,
      student_pass_expiry: document.getElementById('arrPassExpiry')?.value||null,
      local_bank_account: document.getElementById('arrBankAcc')?.value||null,
      orientation_notes: document.getElementById('arrOrientNotes')?.value||null,
    });
    showSuccess('到校信息已保存'); renderIntakeCaseDetail();
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveArrival'); }
}

// ── 合同前文件：渲染 4 个槽位
function renderPreContractSlots(caseId, allMaterials) {
  const slots = [
    { tag: 'letter',   label: '录取通知书 (Letter)' },
    { tag: 'invoice',  label: 'Invoice' },
    { tag: 'contract', label: '合同 (Contract)' },
    { tag: 'form12',   label: 'Form 12' },
  ];
  return `<div class="list-group list-group-flush">${slots.map(slot => {
    const found = allMaterials.find(m => m.doc_tag === slot.tag && m.file_path);
    return `<div class="list-group-item d-flex justify-content-between align-items-center">
      <span class="fw-semibold small">${slot.label}</span>
      <div class="d-flex align-items-center gap-2">
        ${found
          ? `<span class="badge bg-success">已上传</span>
             <a class="btn btn-xs btn-sm btn-outline-primary py-0 px-1" href="/api/files/${encodeURIComponent(found.file_path)}" target="_blank"><i class="bi bi-download"></i></a>`
          : `<span class="badge bg-secondary">未上传</span>`}
        ${hasRole('principal','intake_staff')
          ? `<label class="btn btn-xs btn-sm btn-outline-secondary py-0 px-1 mb-0" title="上传文件">
               <i class="bi bi-upload"></i>
               <input type="file" class="d-none" onchange="uploadPreContractDoc('${caseId}','','${slot.tag}','${slot.label}',this)">
             </label>`
          : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
}

// 上传合同前文件
async function uploadPreContractDoc(caseId, studentId, docTag, label, inputEl) {
  const file = inputEl.files[0];
  if (!file) return;
  try {
    showToast('上传中...', 'info');
    // 1. 创建 material_items 记录（走 intake-case 专用接口，不依赖学生表）
    const mat = await api('POST', `/api/intake-cases/${caseId}/docs`, {
      material_type: label,
      title: label,
      doc_tag: docTag,
      status: '已上传'
    });
    // 2. 上传文件
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch(`/api/materials/${mat.id}/upload`, { method:'POST', body:fd });
    if (!resp.ok) throw new Error(await resp.text());
    showSuccess(`${label} 上传成功`);
    renderIntakeCaseDetail();
  } catch(e) { showError('上传失败：' + e.message); inputEl.value=''; }
}

// 打包发送 modal
let _sendDocsCaseId = null;
async function openSendDocsModal(caseId) {
  _sendDocsCaseId = caseId;
  document.getElementById('sendDocsEmail').value = '';
  const listEl = document.getElementById('sendDocsFileList');
  listEl.textContent = '加载文件列表中...';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('sendDocsModal')).show();
  try {
    const mats = await GET(`/api/students/_/materials?intake_case_id=${caseId}`).catch(() => []);
    // 重新取案例详情获取材料
    const caseData = await GET(`/api/intake-cases/${caseId}`);
    const files = (caseData.materials || []).filter(m => m.file_path);
    listEl.innerHTML = files.length
      ? `<div class="small">将发送以下文件（共 ${files.length} 份）：</div><ul class="small mb-0">${files.map(f=>`<li>${escapeHtml(f.title||f.material_type)}</li>`).join('')}</ul>`
      : '<span class="text-danger small">该案例暂无已上传文件</span>';
  } catch(e) { listEl.textContent = '加载失败'; }
}

async function confirmSendDocs() {
  const email = document.getElementById('sendDocsEmail')?.value?.trim();
  if (!email) { showError('请输入学生邮箱'); return; }
  try {
    const res = await api('POST', `/api/intake-cases/${_sendDocsCaseId}/send-docs`, { email });
    bootstrap.Modal.getInstance(document.getElementById('sendDocsModal'))?.hide();
    showSuccess(`已标记发送至 ${email}（共 ${res.file_count} 份文件）`);
    setTimeout(() => renderIntakeCaseDetail(), 400);
  } catch(e) { showError(e.message); }
}

// Orientation PDF 打印（浏览器打印对话框）
async function printOrientationPDF(caseId) {
  try {
    const c = await api('GET', `/api/intake-cases/${caseId}`);
    const ar = c.arrival || {};
    const rows = [
      ['学生姓名', c.student_name || ''],
      ['课程/项目', c.program_name || ''],
      ['入学年份', c.intake_year || ''],
      ['预计到校日期', ar.expected_arrival || ''],
      ['实际到校日期', ar.actual_arrival || ''],
      ['航班号', ar.flight_no || ''],
      ['Orientation日期', ar.orientation_date || ''],
      ['住宿安排', ar.accommodation || ''],
      ['住宿地址', ar.accommodation_address || ''],
      ['紧急联系人', ar.emergency_contact_name || ''],
      ['紧急联系电话', ar.emergency_contact_phone || ''],
      ['学生证号', ar.student_pass_no || ''],
      ['学生证有效期', ar.student_pass_expiry || ''],
      ['本地银行账户', ar.local_bank_account || ''],
      ['Orientation已完成', ar.orientation_done ? '是' : '否'],
      ['学生准证已办理', ar.student_pass_issued ? '是' : '否'],
      ['备注', ar.orientation_notes || ''],
    ];
    const tableRows = rows.map(([k, v]) => `<tr><th style="width:40%;padding:6px 8px;background:#f8f9fa;border:1px solid #dee2e6">${escapeHtml(String(k))}</th><td style="padding:6px 8px;border:1px solid #dee2e6">${escapeHtml(String(v))}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Orientation 记录表</title><style>body{font-family:Arial,sans-serif;margin:2cm}h2{margin-bottom:1em}table{border-collapse:collapse;width:100%}@media print{button{display:none}}</style></head><body><h2>Orientation 记录表</h2><table>${tableRows}</table><br><button onclick="window.print()">打印</button></body></html>`;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  } catch(e) { showError('无法生成打印页面：' + e.message); }
}

// 发送 Orientation 给关老师
async function sendOrientationToGuan(caseId) {
  try {
    const r = await api('POST', `/api/intake-cases/${caseId}/orientation-send`, {});
    showSuccess(`Orientation 表格已发送至 ${r.sent_to}（请检查控制台或邮箱）`);
  } catch(e) { showError(e.message); }
}

// 生成满意度调查外链
async function generateSurveyLink(caseId) {
  try {
    const r = await api('POST', `/api/intake-cases/${caseId}/survey-link`, {});
    const box = document.getElementById(`survey-link-box-${caseId}`);
    const txt = document.getElementById(`survey-link-text-${caseId}`);
    if (box && txt) { txt.value = r.url; box.classList.remove('d-none'); }
    showSuccess('调查链接已生成');
  } catch(e) { showError(e.message); }
}

function copySurveyLink(caseId) {
  const txt = document.getElementById(`survey-link-text-${caseId}`);
  if (txt) { navigator.clipboard.writeText(txt.value).then(() => showSuccess('链接已复制')); }
}

async function sendSurveyLinkByEmail(caseId, studentName) {
  const name = studentName || '学生';
  const inputId = 'surveyEmailInput_' + caseId;
  confirmAction(
    `<div class="mb-2">将调查链接发送给 <strong>${escapeHtml(name)}</strong></div>` +
    `<label class="form-label small">学生邮箱 <span class="text-danger">*</span></label>` +
    `<input type="email" class="form-control" id="${inputId}" placeholder="example@email.com" autocomplete="email">` +
    `<div class="form-text">系统将向该邮箱发送满意度调查链接</div>`,
    async () => {
      const emailEl = document.getElementById(inputId);
      const email = emailEl?.value?.trim();
      if (!email) { showError('请输入邮箱地址'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('邮箱格式不正确，请重新输入'); return; }
      try {
        await api('POST', `/api/intake-cases/${caseId}/send-survey-link`, { email });
        showSuccess(`调查链接已发送至 ${email}（请检查控制台或邮箱）`);
      } catch(e) { showError(e.message); }
    },
    { okLabel: '发送' }
  );
}

function showAddCaseTaskModal(caseId) {
  ['newTaskTitle','newTaskDue','newTaskCategory'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const pri = document.getElementById('newTaskPriority');
  if (pri) pri.value = 'normal';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('addCaseTaskModal')).show();
}

function showAddDocModal(caseId) {
  const el = document.getElementById('newDocTitle');
  if (el) el.value = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('addDocModal')).show();
}

function showCreateInvoiceModal(caseId) {
  ['invItemName','invDue'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const invAmount = document.getElementById('invAmount');
  if (invAmount) invAmount.value = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('createInvoiceModal')).show();
}

function showAddPaymentModal(invoiceId, invoiceNo) {
  ['payAmount','payRef'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const payMethod = document.getElementById('payMethod');
  if (payMethod) payMethod.value = 'bank_transfer';
  // 每次打开时才设置日期，避免跨天后显示过期日期
  const payDate = document.getElementById('payDate');
  if (payDate) payDate.value = new Date().toISOString().slice(0,10);
  const payModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('addPaymentModal'));
  document.getElementById('submitPayBtn').onclick = async () => {
    if (!acquireSubmit('casePayment')) return;
    const paid_amount = parseFloat(document.getElementById('payAmount')?.value);
    const method = document.getElementById('payMethod')?.value;
    const paid_at = document.getElementById('payDate')?.value;
    const reference_no = document.getElementById('payRef')?.value||null;
    if (paid_amount == null || isNaN(paid_amount) || paid_amount <= 0) { releaseSubmit('casePayment'); showError('请输入有效的收款金额（须大于0）'); return; }
    try {
      await api('POST', `/api/invoices/${invoiceId}/payments`, { paid_amount, method, paid_at, reference_no });
      bootstrap.Modal.getInstance(document.getElementById('addPaymentModal'))?.hide();
      showSuccess('收款已录入'); renderIntakeCaseDetail();
    } catch(e) { showError(e.message); }
    finally { releaseSubmit('casePayment'); }
  };
  payModal.show();
}

function showSurveyModal(caseId) {
  // 重置问卷字段
  const sat = document.getElementById('survSatisfaction'); if (sat) sat.value = '5';
  const accom = document.getElementById('survAccom'); if (accom) accom.checked = true;
  const orient = document.getElementById('survOrient'); if (orient) orient.checked = true;
  const support = document.getElementById('survSupport'); if (support) support.value = '';
  const comments = document.getElementById('survComments'); if (comments) comments.value = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('surveyModal')).show();
}

// ══════════════════════════════════════════════════════
//  FINANCE WORKBENCH
// ══════════════════════════════════════════════════════
async function renderFinanceWorkbench() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>';
  const isPrincipal = State.user.role === 'principal';
  let invoices = [], commissions = [];
  try {
    const requests = [api('GET', '/api/invoices')];
    if (isPrincipal) requests.push(api('GET', '/api/commissions'));
    const results = await Promise.all(requests);
    invoices = results[0] || [];
    commissions = isPrincipal ? (results[1] || []) : [];
  } catch(e) {
    main.innerHTML = `<div class="alert alert-danger m-4">财务数据加载失败: ${escapeHtml(e.message)}</div>`;
    return;
  }
  main.innerHTML = `
    <h2 class="mb-4"><i class="bi bi-currency-dollar me-2"></i>财务工作台</h2>
    <ul class="nav nav-tabs mb-3" id="finTabs">
      <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#finInvoices">账单管理</a></li>
      ${isPrincipal ? '<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#finCommissions">佣金管理</a></li>' : ''}
    </ul>
    <div class="tab-content">
      <div class="tab-pane fade show active" id="finInvoices">
        <div class="table-responsive">
          <table class="table table-hover align-middle">
            <thead class="table-light">
              <tr><th>账单号</th><th>学生</th><th>课程</th><th>金额</th><th>已付</th><th>状态</th><th>到期</th><th>操作</th></tr>
            </thead>
            <tbody>
              ${invoices.length ? invoices.map(inv => `
                <tr>
                  <td class="fw-semibold">${escapeHtml(inv.invoice_no)}</td>
                  <td>${escapeHtml(inv.student_name||'')}</td>
                  <td>${escapeHtml(inv.program_name||'')}</td>
                  <td>${inv.currency} ${inv.amount_total}</td>
                  <td>${inv.paid_amount||0}</td>
                  <td><span class="badge bg-${inv.status==='paid'?'success':inv.status==='unpaid'?'danger':inv.status==='void'?'dark':'warning'}">${inv.status==='paid'?'已付':inv.status==='unpaid'?'未付':inv.status==='void'?'已作废':'部分付'}</span></td>
                  <td>${inv.due_at?.slice(0,10)||'-'}</td>
                  <td class="text-nowrap">
                    ${inv.status==='unpaid'||inv.status==='partial'?`<button class="btn btn-sm btn-outline-primary me-1" onclick="showAddPaymentModalFinance('${inv.id}','${inv.invoice_no}')">录入收款</button>`:''}
                    ${inv.status!=='void'&&inv.status!=='paid'?`<button class="btn btn-sm btn-outline-secondary me-1" onclick="voidInvoice('${inv.id}','${escapeHtml(inv.invoice_no)}')">作废</button>`:''}
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteInvoice('${inv.id}','${escapeHtml(inv.invoice_no)}')"><i class="bi bi-trash3"></i></button>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="8" class="text-center text-muted">暂无账单</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div class="tab-pane fade" id="finCommissions">
        <div class="table-responsive">
          <table class="table table-hover align-middle">
            <thead class="table-light">
              <tr><th>来源</th><th>账单号</th><th>基数</th><th>佣金</th><th>规则</th><th>状态</th><th>操作</th></tr>
            </thead>
            <tbody>
              ${commissions.length ? commissions.map(cp => `
                <tr>
                  <td>${escapeHtml(cp.agent_name||cp.anonymous_label||cp.source_type||'')}</td>
                  <td>${escapeHtml(cp.invoice_no||'')}</td>
                  <td>${cp.currency} ${cp.base_amount}</td>
                  <td class="fw-semibold">${cp.currency} ${cp.commission_amount}</td>
                  <td>${escapeHtml(cp.rule_name||'')}</td>
                  <td><span class="badge bg-${cp.status==='paid'?'success':cp.status==='approved'?'primary':cp.status==='void'?'dark':'warning'}">${cp.status==='paid'?'已付款':cp.status==='approved'?'已审批':cp.status==='void'?'已作废':'待审批'}</span></td>
                  <td>
                    ${cp.status==='pending'?`<button class="btn btn-sm btn-outline-primary" onclick="approveCommission('${cp.id}')">审批</button>`:''}
                    ${cp.status==='approved'?`<button class="btn btn-sm btn-outline-success" onclick="payCommission('${cp.id}')">打款</button>`:''}
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="7" class="text-center text-muted">暂无佣金记录</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Payment modal for finance page -->
    <div class="modal fade" id="finPayModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header"><h5 class="modal-title">录入收款</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <div class="mb-3"><label class="form-label">收款金额</label><input type="number" class="form-control" id="finPayAmount"></div>
            <div class="mb-3"><label class="form-label">支付方式</label><select class="form-select" id="finPayMethod"><option value="bank_transfer">银行转账</option><option value="card">刷卡</option><option value="cash">现金</option><option value="online">线上</option></select></div>
            <div class="mb-3"><label class="form-label">支付日期</label><input type="date" class="form-control" id="finPayDate" value="${new Date().toISOString().slice(0,10)}"></div>
            <div class="mb-3"><label class="form-label">参考号</label><input type="text" class="form-control" id="finPayRef"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
            <button class="btn btn-primary" id="finPaySubmit">录入</button>
          </div>
        </div>
      </div>
    </div>
  `;
  const _finModal = document.getElementById('finPayModal');
  if (_finModal) { _finModal.dataset.renderedModal = '1'; document.body.appendChild(_finModal); }
}

function showAddPaymentModalFinance(invoiceId, invoiceNo) {
  // Clear previous values
  const fa = document.getElementById('finPayAmount'); if (fa) fa.value = '';
  const fr = document.getElementById('finPayRef'); if (fr) fr.value = '';
  const fd = document.getElementById('finPayDate'); if (fd) fd.value = new Date().toISOString().slice(0,10);
  const m = bootstrap.Modal.getOrCreateInstance(document.getElementById('finPayModal'));
  document.getElementById('finPaySubmit').onclick = async () => {
    if (!acquireSubmit('finPayment')) return;
    const paid_amount = parseFloat(document.getElementById('finPayAmount')?.value);
    if (paid_amount == null || isNaN(paid_amount) || paid_amount < 0) { releaseSubmit('finPayment'); showError('请输入有效金额（须 ≥ 0）'); return; }
    try {
      await api('POST', `/api/invoices/${invoiceId}/payments`, {
        paid_amount,
        method: document.getElementById('finPayMethod')?.value,
        paid_at: document.getElementById('finPayDate')?.value,
        reference_no: document.getElementById('finPayRef')?.value||null
      });
      bootstrap.Modal.getInstance(document.getElementById('finPayModal'))?.hide();
      showSuccess('收款已录入'); renderFinanceWorkbench();
    } catch(e) { showError(e.message); }
    finally { releaseSubmit('finPayment'); }
  };
  m.show();
}

function approveCommission(id) {
  confirmAction('确认审批此佣金记录？审批后将可进行打款操作。', async () => {
    try {
      await api('PUT', `/api/commissions/${id}/approve`);
      showSuccess('佣金已审批'); renderFinanceWorkbench();
    } catch(e) { showError(e.message); }
  });
}

function payCommission(id) {
  confirmAction('确认将此佣金标记为已打款？此操作不可撤销，请确认款项已实际支付。', async () => {
    try {
      await api('PUT', `/api/commissions/${id}/pay`);
      showSuccess('佣金已标记打款'); renderFinanceWorkbench();
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

function voidInvoice(invoiceId, invoiceNo) {
  confirmAction(
    `<div class="alert alert-warning py-2 mb-2 small"><i class="bi bi-exclamation-triangle me-1"></i><strong>作废后账单将无法恢复，已记录的收款数据不会删除，但账单将标记为无效。</strong></div>` +
    `确认作废账单「<strong>${escapeHtml(invoiceNo)}</strong>」？` +
    `<div class="mt-2"><label class="form-label small">作废原因（可选，建议填写便于审计）</label><input class="form-control form-control-sm" id="void-reason-input" placeholder="如：金额有误、重复开单等..."></div>`,
    async () => {
      const void_reason = document.getElementById('void-reason-input')?.value?.trim() || null;
      try {
        await api('PUT', `/api/invoices/${invoiceId}/void`, { void_reason });
        showSuccess('账单已作废'); renderFinanceWorkbench();
      } catch(e) { showError(e.message); }
    },
    { danger: true, okLabel: '确认作废' }
  );
}

function deleteInvoice(invoiceId, invoiceNo) {
  confirmAction(
    `<div class="alert alert-danger py-2 mb-2 small"><i class="bi bi-exclamation-triangle me-1"></i><strong>删除后账单及所有关联收款记录将永久移除，不可恢复。</strong></div>` +
    `确认删除账单「<strong>${escapeHtml(invoiceNo)}</strong>」？`,
    async () => {
      try {
        await api('DELETE', `/api/invoices/${invoiceId}`);
        showSuccess('账单已删除');
        if ((State.currentPage === 'intake-case-detail' || document.getElementById('intakeDetailPanel'))) renderIntakeCaseDetail();
        else renderFinanceWorkbench();
      } catch(e) { showError(e.message); }
    },
    { danger: true, okLabel: '确认删除' }
  );
}

function reconcilePayment(paymentId) {
  confirmAction('确认对账此收款记录？确认后将标记为已对账，并触发佣金计算。', async () => {
    try {
      await api('PUT', `/api/payments/${paymentId}/reconcile`);
      showSuccess('收款已对账'); renderIntakeCaseDetail();
    } catch(e) { showError(e.message); }
  });
}

// ══════════════════════════════════════════════════════
//  AGENTS MANAGEMENT
// ══════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════
//  代理自助门户（agent 角色专用）
// ════════════════════════════════════════════════════════
async function renderAgentPortal() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>';
  try {
    const [me, referrals, students, commissions] = await Promise.all([
      GET('/api/agent/me'),
      GET('/api/agent/my-referrals'),
      GET('/api/agent/my-students'),
      GET('/api/agent/my-commissions'),
    ]);
    const statusLabels = {
      registered: '已登记', collecting_docs: '收集材料', contract_signed: '已签约',
      visa_in_progress: '签证中', paid: '已付款', ipa_received: '收到IPA',
      arrived: '已到达', oriented: '已入学', closed: '已结案',
    };
    const statusLabelColors = { registered:'secondary', collecting_docs:'info', contract_signed:'primary', paid:'success', visa_in_progress:'warning', ipa_received:'success', arrived:'primary', oriented:'success', closed:'dark' };
    const commStatus = { pending: '待审批', approved: '已审批', paid: '已付款', void: '已作废' };
    const totalCommission = commissions.filter(c => c.status === 'paid').reduce((s, c) => s + (c.commission_amount || 0), 0);
    const pendingCommission = commissions.filter(c => c.status === 'pending').reduce((s, c) => s + (c.commission_amount || 0), 0);

    main.innerHTML = `
      <div class="page-header"><h2><i class="bi bi-person-badge me-2"></i>代理门户</h2></div>
      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <div class="card h-100">
            <div class="card-body">
              <h6 class="text-muted mb-2">代理信息</h6>
              <div class="fw-bold fs-5">${escapeHtml(me.name)}</div>
              <div class="text-muted small">${me.type || ''}</div>
              <hr class="my-2">
              <div class="small"><i class="bi bi-envelope me-1"></i>${escapeHtml(me.email || '-')}</div>
              <div class="small"><i class="bi bi-phone me-1"></i>${escapeHtml(me.phone || '-')}</div>
              <div class="mt-2"><span class="badge ${me.status === 'active' ? 'bg-success' : 'bg-secondary'}">${me.status === 'active' ? '合作中' : '已停止'}</span></div>
            </div>
          </div>
        </div>
        <div class="col-md-2">
          <div class="card text-center h-100">
            <div class="card-body d-flex flex-column justify-content-center">
              <div class="fs-2 fw-bold text-primary">${students.length}</div>
              <div class="text-muted small">名下学生</div>
            </div>
          </div>
        </div>
        <div class="col-md-2">
          <div class="card text-center h-100">
            <div class="card-body d-flex flex-column justify-content-center">
              <div class="fs-2 fw-bold text-info">${referrals.length}</div>
              <div class="text-muted small">转介记录</div>
            </div>
          </div>
        </div>
        <div class="col-md-2">
          <div class="card text-center h-100">
            <div class="card-body d-flex flex-column justify-content-center">
              <div class="fs-5 fw-bold text-warning">${pendingCommission.toFixed(2)}</div>
              <div class="text-muted small">待结佣金(SGD)</div>
            </div>
          </div>
        </div>
        <div class="col-md-2">
          <div class="card text-center h-100">
            <div class="card-body d-flex flex-column justify-content-center">
              <div class="fs-5 fw-bold text-success">${totalCommission.toFixed(2)}</div>
              <div class="text-muted small">已到账佣金(SGD)</div>
            </div>
          </div>
        </div>
      </div>

      <ul class="nav nav-tabs mb-3" id="agentPortalTabs">
        <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#ap-students"><i class="bi bi-people me-1"></i>我的学生 (${students.length})</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#ap-commissions"><i class="bi bi-currency-dollar me-1"></i>佣金记录 (${commissions.length})</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#ap-referrals"><i class="bi bi-diagram-3 me-1"></i>转介记录 (${referrals.length})</a></li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="ap-students">
          <div class="table-responsive">
            <table class="table table-hover">
              <thead><tr><th>学生姓名</th><th>年级</th><th>项目</th><th>入学年份</th><th>入学进度</th><th>登记时间</th></tr></thead>
              <tbody>
                ${students.length === 0 ? '<tr><td colspan="6" class="text-center text-muted">暂无学生</td></tr>' :
                  students.map(s => `
                    <tr>
                      <td class="fw-semibold">${escapeHtml(s.name)}</td>
                      <td>${escapeHtml(s.grade_level || '-')}</td>
                      <td>${escapeHtml(s.program_name || '-')}</td>
                      <td>${s.intake_year || '-'}</td>
                      <td><span class="badge bg-${statusLabelColors[s.case_status]||'secondary'}">${statusLabels[s.case_status] || s.case_status || '-'}</span></td>
                      <td class="text-muted small">${(s.case_created_at || '').slice(0, 10)}</td>
                    </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="tab-pane fade" id="ap-commissions">
          <div class="table-responsive">
            <table class="table table-hover">
              <thead><tr><th>账单号</th><th>计算基准</th><th>佣金金额</th><th>币种</th><th>规则</th><th>状态</th><th>到账日期</th></tr></thead>
              <tbody>
                ${commissions.length === 0 ? '<tr><td colspan="7" class="text-center text-muted">暂无佣金记录</td></tr>' :
                  commissions.map(c => `
                    <tr>
                      <td>${escapeHtml(c.invoice_no || '-')}</td>
                      <td>${(c.base_amount || 0).toFixed(2)}</td>
                      <td class="fw-semibold">${(c.commission_amount || 0).toFixed(2)}</td>
                      <td>${escapeHtml(c.currency || 'SGD')}</td>
                      <td>${escapeHtml(c.rule_name || '-')}</td>
                      <td><span class="badge ${c.status === 'paid' ? 'bg-success' : c.status === 'approved' ? 'bg-info' : c.status === 'void' ? 'bg-secondary' : 'bg-warning text-dark'}">${commStatus[c.status] || c.status}</span></td>
                      <td class="text-muted small">${(c.paid_at || '').slice(0, 10) || '-'}</td>
                    </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="tab-pane fade" id="ap-referrals">
          <div class="table-responsive">
            <table class="table table-hover">
              <thead><tr><th>来源类型</th><th>标签</th><th>案例数</th><th>备注</th><th>日期</th></tr></thead>
              <tbody>
                ${referrals.length === 0 ? '<tr><td colspan="5" class="text-center text-muted">暂无转介记录</td></tr>' :
                  referrals.map(r => `
                    <tr>
                      <td>${escapeHtml(r.source_type || '-')}</td>
                      <td>${escapeHtml(r.anonymous_label || r.referrer_name || '-')}</td>
                      <td><span class="badge bg-primary">${r.case_count || 0}</span></td>
                      <td class="text-muted small">${escapeHtml(r.notes || '-')}</td>
                      <td class="text-muted small">${(r.created_at || '').slice(0, 10)}</td>
                    </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  } catch (e) {
    main.innerHTML = `<div class="alert alert-danger m-3">${e.message}</div>`;
  }
}

async function renderAgentsManagement() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>';
  let agents = [], rules = [];
  try {
    [agents, rules] = await Promise.all([api('GET', '/api/agents'), api('GET', '/api/commission-rules')]);
  } catch(e) {
    main.innerHTML = `<div class="alert alert-danger m-4">代理数据加载失败: ${escapeHtml(e.message)}</div>`;
    return;
  }
  main.innerHTML = `
    <div class="page-header mb-4">
      <h4><i class="bi bi-people me-2"></i>代理管理</h4>
      <div class="page-header-actions">
        <button class="btn btn-primary btn-sm" onclick="showCreateAgentModal()"><i class="bi bi-plus-lg me-1"></i>新增代理</button>
      </div>
    </div>
    <div class="table-responsive">
      <table class="table table-hover align-middle">
        <thead class="table-light">
          <tr><th>名称</th><th>类型</th><th>联系方式</th><th>佣金规则</th><th>关联学生</th><th>引入案例</th><th>合同签署</th><th>转化率</th><th>佣金(SGD)</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody id="agentTableBody">
          ${agents.length ? agents.map(a => {
            const convRate = a.referral_count>0 ? Math.round((a.signed_count||0)/a.referral_count*100) : 0;
            return `<tr>
              <td class="fw-semibold">${escapeHtml(a.name)}</td>
              <td><span class="badge bg-light text-dark border">${a.type==='agency'?'机构代理':'个人推荐'}</span></td>
              <td class="small">${escapeHtml(a.email||a.phone||a.contact||'—')}</td>
              <td class="small">${escapeHtml(a.rule_name||'—')}</td>
              <td class="text-center">
                ${(a.student_count||0) > 0
                  ? `<button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="toggleAgentStudents('${a.id}', this)">
                      <i class="bi bi-person-lines-fill me-1"></i>${a.student_count}
                    </button>`
                  : `<span class="text-muted">0</span>`}
              </td>
              <td class="text-center">${a.referral_count||0}</td>
              <td class="text-center">${a.signed_count||0}</td>
              <td>
                <div class="d-flex align-items-center gap-1">
                  <div class="progress flex-grow-1" style="height:5px;min-width:40px"><div class="progress-bar bg-success" style="width:${convRate}%"></div></div>
                  <span class="small">${convRate}%</span>
                </div>
              </td>
              <td class="small">
                <span class="${(a.pending_commission||0)>0?'text-warning fw-bold':'text-muted'}">待付: ${Number(a.pending_commission||0).toFixed(0)}</span><br>
                <span class="text-success">已付: ${Number(a.paid_commission||0).toFixed(0)}</span>
              </td>
              <td><span class="badge bg-${a.status==='active'?'success':'danger'}">${a.status==='active'?'启用':'停用'}</span></td>
              <td><button class="btn btn-sm btn-outline-secondary" onclick="toggleAgentStatus('${a.id}','${a.status}')">
                ${a.status==='active'?'停用':'启用'}
              </button></td>
            </tr>
            <tr id="agent-students-${a.id}" class="d-none bg-light">
              <td colspan="11" class="p-0">
                <div class="agent-students-panel px-4 py-3"></div>
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="11" class="text-center text-muted">暂无代理</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="modal fade" id="createAgentModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header"><h5 class="modal-title">新增代理/推荐人</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <div class="mb-3"><label class="form-label">名称 *</label><input type="text" class="form-control" id="agentName"></div>
            <div class="mb-3"><label class="form-label">类型 *</label><select class="form-select" id="agentType"><option value="agency">机构代理</option><option value="personal_referral">个人推荐</option></select></div>
            <div class="mb-3"><label class="form-label">邮箱</label><input type="email" class="form-control" id="agentEmail"></div>
            <div class="mb-3"><label class="form-label">电话</label><input type="text" class="form-control" id="agentPhone"></div>
            <div class="mb-3"><label class="form-label">佣金规则</label>
              <select class="form-select" id="agentRuleId">
                <option value="">-- 无 --</option>
                ${rules.map(r => `<option value="${r.id}">${escapeHtml(r.name)} (${r.type==='percent'?(r.rate*100)+'%':r.currency+' '+r.fixed_amount})</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
            <button class="btn btn-primary" onclick="submitCreateAgent()">创建</button>
          </div>
        </div>
      </div>
    </div>
  `;
  const _agentModal = document.getElementById('createAgentModal');
  if (_agentModal) { _agentModal.dataset.renderedModal = '1'; document.body.appendChild(_agentModal); }
}

function showCreateAgentModal() {
  // Clear fields
  ['agentName','agentEmail','agentPhone'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const at = document.getElementById('agentType'); if (at) at.value = 'agency';
  const ar = document.getElementById('agentRuleId'); if (ar) ar.value = '';
  const m = bootstrap.Modal.getOrCreateInstance(document.getElementById('createAgentModal'));
  m.show();
}

async function submitCreateAgent() {
  if (!acquireSubmit('createAgent')) return;
  const name = document.getElementById('agentName')?.value?.trim();
  const type = document.getElementById('agentType')?.value;
  const email = document.getElementById('agentEmail')?.value||null;
  const phone = document.getElementById('agentPhone')?.value||null;
  const commission_rule_id = document.getElementById('agentRuleId')?.value||null;
  if (!name) { releaseSubmit('createAgent'); showError('请输入代理名称'); return; }
  try {
    await api('POST', '/api/agents', { name, type, email, phone, commission_rule_id });
    bootstrap.Modal.getInstance(document.getElementById('createAgentModal'))?.hide();
    showSuccess('代理已创建'); renderAgentsManagement();
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('createAgent'); }
}

async function toggleAgentStatus(agentId, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  try {
    await api('PUT', `/api/agents/${agentId}`, { status: newStatus });
    showSuccess('状态已更新'); renderAgentsManagement();
  } catch(e) { showError(e.message); }
}

async function toggleAgentStudents(agentId, btn) {
  const row = document.getElementById(`agent-students-${agentId}`);
  if (!row) return;
  const panel = row.querySelector('.agent-students-panel');
  if (!row.classList.contains('d-none')) {
    row.classList.add('d-none');
    btn.innerHTML = `<i class="bi bi-person-lines-fill me-1"></i>${btn.textContent.trim()}`;
    return;
  }
  // Load students
  panel.innerHTML = '<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div>';
  row.classList.remove('d-none');
  const caseStatusMap = { registered:'已注册', collecting_docs:'收集材料中', contract_signed:'合同已签', paid:'已付款', visa_in_progress:'签证办理中', ipa_received:'已获IPA', arrived:'已到校', oriented:'已入学', closed:'已关闭' };
  const caseStatusColor = { registered:'secondary', collecting_docs:'info', contract_signed:'primary', paid:'success', visa_in_progress:'warning', ipa_received:'success', arrived:'primary', oriented:'success', closed:'dark' };
  try {
    const students = await api('GET', `/api/agents/${agentId}/students`);
    if (students.length === 0) {
      panel.innerHTML = '<div class="text-muted small py-2">该代理暂无关联学生</div>';
      return;
    }
    panel.innerHTML = `
      <div class="fw-semibold small text-primary mb-2"><i class="bi bi-person-lines-fill me-1"></i>关联学生（${students.length} 人）</div>
      <table class="table table-sm table-bordered mb-0 bg-white">
        <thead class="table-light">
          <tr><th>学生姓名</th><th>年级</th><th>考试局</th><th>课程/项目</th><th>入学年份</th><th>案例状态</th><th>注册时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          ${students.map(s => `<tr>
            <td class="fw-semibold">${escapeHtml(s.name)}</td>
            <td class="small">${escapeHtml(s.grade_level||'—')}</td>
            <td class="small">${escapeHtml(s.exam_board||'—')}</td>
            <td class="small">${escapeHtml(s.program_name||'—')}</td>
            <td class="small text-center">${s.intake_year||'—'}</td>
            <td><span class="badge bg-${caseStatusColor[s.case_status]||'secondary'}">${caseStatusMap[s.case_status]||s.case_status||'—'}</span></td>
            <td class="small text-muted">${fmtDate(s.enrolled_at)}</td>
            <td>
              <button class="btn btn-xs btn-sm btn-outline-primary py-0 px-1" onclick="showCaseDetail('${s.case_id}')">查看案例</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch(e) {
    panel.innerHTML = `<div class="text-danger small">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════
//  中介协作 — 材料收集
// ════════════════════════════════════════════════════════

const MAT_STATUS_MAP = {
  PENDING:          ['secondary', '待响应'],
  IN_PROGRESS:      ['primary',   '进行中'],
  SUBMITTED:        ['warning',   '待审核'],
  REVISION_NEEDED:  ['danger',    '需修改'],
  APPROVED:         ['success',   '已审核'],
  COMPLETED:        ['success',   '已完成'],
  CANCELLED:        ['dark',      '已取消'],
};

function matStatusBadge(s) {
  const [cls, label] = MAT_STATUS_MAP[s] || ['secondary', s];
  return `<span class="badge bg-${cls}">${label}</span>`;
}

function matProgress(approved, total) {
  const pct = total > 0 ? Math.round(approved / total * 100) : 0;
  return `<div class="d-flex align-items-center gap-2">
    <div class="progress flex-grow-1" style="height:6px;min-width:60px">
      <div class="progress-bar bg-success" style="width:${pct}%"></div>
    </div>
    <small class="text-muted">${approved}/${total}</small>
  </div>`;
}

// ── 材料收集请求列表 ──────────────────────────────────
async function renderMatRequests() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';
  let requests = [];
  try {
    requests = await GET('/api/mat-requests');
  } catch(e) {
    main.innerHTML = `<div class="alert alert-danger m-4">加载失败: ${escapeHtml(e.message)}</div>`;
    return;
  }

  // Group by status for kanban counts
  const counts = {};
  for (const r of requests) counts[r.status] = (counts[r.status] || 0) + 1;

  main.innerHTML = `
    <div class="page-header mb-4">
      <h4><i class="bi bi-folder-check me-2"></i>材料收集请求</h4>
      <div class="page-header-actions gap-2 d-flex">
        <select class="form-select form-select-sm" id="matStatusFilter" style="width:auto">
          <option value="">全部状态</option>
          ${Object.entries(MAT_STATUS_MAP).map(([k,[,l]]) => `<option value="${k}">${l}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="openCreateMatRequestModal()">
          <i class="bi bi-plus-lg me-1"></i>新建请求
        </button>
      </div>
    </div>

    <!-- 状态汇总 -->
    <div class="row g-3 mb-4">
      ${[['PENDING','待响应','secondary'],['IN_PROGRESS','进行中','primary'],['SUBMITTED','待审核','warning'],['COMPLETED','已完成','success']].map(([s,l,c]) => `
        <div class="col-6 col-md-3">
          <div class="card text-center py-3 border-${c}" style="cursor:pointer" onclick="document.getElementById('matStatusFilter').value='${s}';filterMatRequests()">
            <div class="fs-4 fw-bold text-${c}">${counts[s] || 0}</div>
            <div class="small text-muted">${l}</div>
          </div>
        </div>`).join('')}
    </div>

    <div class="table-responsive">
      <table class="table table-hover align-middle" id="matRequestsTable">
        <thead class="table-light">
          <tr>
            <th>案件名称</th><th>中介公司</th><th>联系人</th>
            <th>截止日期</th><th>状态</th><th>进度</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${requests.length ? requests.map(r => {
            const overdue = r.is_overdue && !['COMPLETED','CANCELLED','APPROVED'].includes(r.status);
            return `<tr class="${overdue ? 'table-danger' : ''}">
              <td>
                <div class="fw-semibold">${escapeHtml(r.title)}</div>
                ${r.student_name ? `<div class="small text-muted">学生：${escapeHtml(r.student_name)}</div>` : ''}
              </td>
              <td class="small">${escapeHtml(r.company_name)}</td>
              <td class="small">${escapeHtml(r.contact_name)}</td>
              <td class="small ${overdue ? 'text-danger fw-bold' : ''}">
                ${r.deadline}${overdue ? ' <i class="bi bi-exclamation-circle"></i>' : ''}
              </td>
              <td>${matStatusBadge(r.status)}</td>
              <td style="min-width:120px">${matProgress(r.item_approved || 0, r.item_total || 0)}</td>
              <td>
                <button class="btn btn-xs btn-sm btn-outline-primary py-0 px-2 me-1"
                  onclick="navigate('mat-request-detail',{requestId:'${r.id}'})">详情</button>
                ${!['COMPLETED','CANCELLED'].includes(r.status) ? `
                  <button class="btn btn-xs btn-sm btn-outline-secondary py-0 px-2"
                    onclick="matManualRemind('${r.id}')">催件</button>` : ''}
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="7" class="text-center text-muted py-4">暂无材料收集请求</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- 新建请求模态框 -->
    <div class="modal fade" id="createMatRequestModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-folder-plus me-2"></i>新建材料收集请求</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-12">
                <label class="form-label fw-semibold">案件标题 *</label>
                <input type="text" class="form-control" id="mrTitle" placeholder="如：张伟 2025秋 材料收集">
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">中介公司 *
                  <a href="#" class="ms-2 small" onclick="event.preventDefault();navigate('mat-companies')" title="去添加公司">
                    <i class="bi bi-plus-circle"></i> 新增公司
                  </a>
                </label>
                <select class="form-select" id="mrCompany" onchange="loadMatContacts(this.value)">
                  <option value="">-- 选择公司 --</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">联系人 *</label>
                <select class="form-select" id="mrContact">
                  <option value="">-- 先选公司 --</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">截止日期 *</label>
                <input type="date" class="form-control" id="mrDeadline">
              </div>
              <div class="col-md-6">
                <label class="form-label">关联学生（可选）</label>
                <select class="form-select" id="mrStudent">
                  <option value="">-- 不关联 --</option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label">备注</label>
                <textarea class="form-control" id="mrNotes" rows="2"></textarea>
              </div>
              <div class="col-12">
                <label class="form-label fw-semibold">材料清单 *</label>
                <div id="mrItemsList">
                  ${['护照首页','在读证明','成绩单'].map((n,i) => `
                    <div class="d-flex gap-2 mb-2 align-items-center mr-item-row">
                      <input type="text" class="form-control form-control-sm mr-item-name" value="${n}" placeholder="材料名称">
                      <input type="text" class="form-control form-control-sm mr-item-desc" placeholder="说明（可选）">
                      <div class="form-check mb-0 text-nowrap">
                        <input class="form-check-input mr-item-required" type="checkbox" checked id="req${i}">
                        <label class="form-check-label small" for="req${i}">必填</label>
                      </div>
                      <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="this.closest('.mr-item-row').remove()">
                        <i class="bi bi-trash3"></i>
                      </button>
                    </div>`).join('')}
                </div>
                <button class="btn btn-sm btn-outline-primary mt-1" onclick="addMatItemRow()">
                  <i class="bi bi-plus-lg me-1"></i>添加材料项
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
            <button class="btn btn-primary" onclick="submitCreateMatRequest()">
              <i class="bi bi-send me-1"></i>创建并发送邀请邮件
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Filter handler
  document.getElementById('matStatusFilter').addEventListener('change', filterMatRequests);
  // Load companies into modal
  _loadMatCompaniesIntoSelect();
  // Load students into modal
  _loadStudentsIntoMatSelect();
  // Move modal to <body> so Bootstrap can manage it properly
  // (modals inside #main-content break when Bootstrap tries to show/hide them)
  const _mrModalEl = document.getElementById('createMatRequestModal');
  if (_mrModalEl) { _mrModalEl.dataset.renderedModal = '1'; document.body.appendChild(_mrModalEl); }
}

function filterMatRequests() {
  const val = document.getElementById('matStatusFilter')?.value;
  document.querySelectorAll('#matRequestsTable tbody tr').forEach(row => {
    if (!val) { row.style.display = ''; return; }
    const badge = row.querySelector('.badge');
    const statusText = badge ? badge.textContent : '';
    const [,label] = MAT_STATUS_MAP[val] || [];
    row.style.display = (statusText === label) ? '' : 'none';
  });
}

async function _loadMatCompaniesIntoSelect() {
  try {
    const companies = await GET('/api/mat-companies');
    const sel = document.getElementById('mrCompany');
    if (!sel) return;
    companies.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.name;
      sel.appendChild(o);
    });
  } catch(e) { /* ignore */ }
}

async function _loadStudentsIntoMatSelect() {
  try {
    const students = await GET('/api/students');
    const sel = document.getElementById('mrStudent');
    if (!sel) return;
    students.forEach(s => {
      const o = document.createElement('option');
      o.value = s.id; o.textContent = `${s.name} (${s.grade_level || '—'})`;
      sel.appendChild(o);
    });
  } catch(e) { /* ignore */ }
}

async function loadMatContacts(companyId) {
  const sel = document.getElementById('mrContact');
  if (!sel) return;
  if (!companyId) { sel.innerHTML = '<option value="">-- 先选公司 --</option>'; return; }
  try {
    const contacts = await GET(`/api/mat-companies/${companyId}/contacts`);
    sel.innerHTML = '<option value="">-- 选择联系人 --</option>' +
      contacts.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.email)})</option>`).join('');
  } catch(e) { sel.innerHTML = '<option value="">加载失败</option>'; }
}

function addMatItemRow() {
  const list = document.getElementById('mrItemsList');
  const idx = list.querySelectorAll('.mr-item-row').length;
  const div = document.createElement('div');
  div.className = 'd-flex gap-2 mb-2 align-items-center mr-item-row';
  div.innerHTML = `
    <input type="text" class="form-control form-control-sm mr-item-name" placeholder="材料名称">
    <input type="text" class="form-control form-control-sm mr-item-desc" placeholder="说明（可选）">
    <div class="form-check mb-0 text-nowrap">
      <input class="form-check-input mr-item-required" type="checkbox" checked id="req${idx}">
      <label class="form-check-label small" for="req${idx}">必填</label>
    </div>
    <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="this.closest('.mr-item-row').remove()">
      <i class="bi bi-trash3"></i>
    </button>`;
  list.appendChild(div);
}

async function openCreateMatRequestModal() {
  const el = document.getElementById('createMatRequestModal');
  if (!el) return;
  // Set default deadline 14 days from now
  const d = new Date(); d.setDate(d.getDate() + 14);
  const dl = document.getElementById('mrDeadline');
  if (dl) dl.value = d.toISOString().split('T')[0];
  bootstrap.Modal.getOrCreateInstance(el).show();
}

async function submitCreateMatRequest() {
  const title = document.getElementById('mrTitle')?.value?.trim();
  const company_id = document.getElementById('mrCompany')?.value;
  const contact_id = document.getElementById('mrContact')?.value;
  const deadline = document.getElementById('mrDeadline')?.value;
  const student_id = document.getElementById('mrStudent')?.value || null;
  const notes = document.getElementById('mrNotes')?.value?.trim() || null;

  if (!title || !company_id || !contact_id || !deadline) {
    showError('请填写所有必填字段（标题、公司、联系人、截止日期）'); return;
  }

  const itemRows = document.querySelectorAll('.mr-item-row');
  const items = [];
  itemRows.forEach(row => {
    const name = row.querySelector('.mr-item-name')?.value?.trim();
    const desc = row.querySelector('.mr-item-desc')?.value?.trim();
    const req = row.querySelector('.mr-item-required')?.checked !== false;
    if (name) items.push({ name, description: desc || null, is_required: req });
  });
  if (items.length === 0) { showError('请至少添加一个材料项目'); return; }

  try {
    await POST('/api/mat-requests', { title, company_id, contact_id, deadline, student_id, notes, items });
    bootstrap.Modal.getInstance(document.getElementById('createMatRequestModal'))?.hide();
    showSuccess('材料收集请求已创建，邀请邮件已发送');
    renderMatRequests();
  } catch(e) { showError('创建失败: ' + e.message); }
}

async function matManualRemind(requestId) {
  if (!confirm('确定发送催件邮件？')) return;
  try {
    await POST(`/api/mat-requests/${requestId}/remind`, {});
    showSuccess('催件邮件已发送');
  } catch(e) { showError('发送失败: ' + e.message); }
}

// ── 材料收集请求详情 ──────────────────────────────────
async function renderMatRequestDetail({ requestId } = {}) {
  const id = requestId || State.currentMatRequestId;
  if (!id) { navigate('mat-requests'); return; }
  State.currentMatRequestId = id;

  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';
  let r;
  try { r = await GET(`/api/mat-requests/${id}`); }
  catch(e) { main.innerHTML = `<div class="alert alert-danger m-4">加载失败: ${escapeHtml(e.message)}</div>`; return; }

  const overdue = r.is_overdue && !['COMPLETED','CANCELLED','APPROVED'].includes(r.status);
  const uifData = r.uif ? JSON.parse(r.uif.data || '{}') : {};

  main.innerHTML = `
    <div class="page-header mb-4">
      <div>
        <button class="btn btn-sm btn-outline-secondary me-2" onclick="navigate('mat-requests')">
          <i class="bi bi-arrow-left"></i>
        </button>
        <span class="fw-bold fs-5">${escapeHtml(r.title)}</span>
        <span class="ms-2">${matStatusBadge(r.status)}</span>
        ${overdue ? '<span class="badge bg-danger ms-1">逾期</span>' : ''}
      </div>
      <div class="page-header-actions gap-2 d-flex">
        ${!['COMPLETED','CANCELLED'].includes(r.status) ? `
          <button class="btn btn-sm btn-outline-warning" onclick="matManualRemind('${r.id}')">
            <i class="bi bi-bell me-1"></i>发催件邮件
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="matCancelRequest('${r.id}')">
            <i class="bi bi-x-circle me-1"></i>取消请求
          </button>` : ''}
      </div>
    </div>

    <!-- 基本信息 -->
    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <div class="card p-3">
          <div class="small text-muted mb-1">中介公司</div>
          <div class="fw-semibold">${escapeHtml(r.company_name)}</div>
          <div class="small mt-1">${escapeHtml(r.contact_name)} · <a href="mailto:${escapeHtml(r.contact_email)}">${escapeHtml(r.contact_email)}</a></div>
          ${r.contact_phone ? `<div class="small text-muted">${escapeHtml(r.contact_phone)}</div>` : ''}
        </div>
      </div>
      <div class="col-md-4">
        <div class="card p-3">
          <div class="small text-muted mb-1">截止日期</div>
          <div class="fw-semibold ${overdue ? 'text-danger' : ''}">${r.deadline}</div>
          ${r.student_name ? `<div class="small mt-1 text-muted">学生：${escapeHtml(r.student_name)}</div>` : ''}
          ${r.notes ? `<div class="small mt-1">${escapeHtml(r.notes)}</div>` : ''}
        </div>
      </div>
      <div class="col-md-4">
        <div class="card p-3">
          <div class="small text-muted mb-1">材料进度</div>
          <div class="fw-semibold">${r.items.filter(i=>i.status==='APPROVED').length} / ${r.items.length} 项已审核</div>
          <div class="mt-2">${matProgress(r.items.filter(i=>i.status==='APPROVED').length, r.items.length)}</div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs mb-3" id="matDetailTabs">
      <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#matItemsTab">材料清单</a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#matUifTab">
        学生信息表 (UIF) ${r.uif?.status === 'SUBMITTED' ? '<span class="badge bg-warning ms-1">待审核</span>' : ''}
      </a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#matReminderTab">催件日志</a></li>
    </ul>
    <div class="tab-content">

      <!-- 材料清单 Tab -->
      <div class="tab-pane fade show active" id="matItemsTab">
        <div class="table-responsive">
          <table class="table align-middle">
            <thead class="table-light">
              <tr><th>材料名称</th><th>说明</th><th>状态</th><th>文件</th><th>审核</th></tr>
            </thead>
            <tbody id="matItemsBody">
              ${r.items.map(item => `
                <tr id="item-row-${item.id}">
                  <td>
                    <span class="fw-semibold">${escapeHtml(item.name)}</span>
                    ${item.is_required ? '<span class="badge bg-danger ms-1" style="font-size:10px">必填</span>' : ''}
                  </td>
                  <td class="small text-muted">${item.description ? escapeHtml(item.description) : '—'}</td>
                  <td>${matItemStatusBadge(item.status)}
                    ${item.reject_reason ? `<div class="small text-danger mt-1">退回：${escapeHtml(item.reject_reason)}</div>` : ''}
                  </td>
                  <td>
                    ${item.file_id ? `
                      <a href="/api/mat-request-items/${item.id}/download" class="btn btn-xs btn-sm btn-outline-primary py-0 px-2" download>
                        <i class="bi bi-download me-1"></i>${escapeHtml(item.file_name || '下载')}
                      </a>
                      <div class="small text-muted">${item.uploaded_at ? fmtDatetime(item.uploaded_at) : ''}</div>
                    ` : '<span class="text-muted small">未上传</span>'}
                  </td>
                  <td>
                    ${item.file_id && !['APPROVED','CANCELLED'].includes(item.status) ? `
                      <button class="btn btn-xs btn-sm btn-success py-0 px-2 me-1"
                        onclick="reviewMatItem('${item.id}','approve')">通过</button>
                      <button class="btn btn-xs btn-sm btn-danger py-0 px-2"
                        onclick="reviewMatItem('${item.id}','reject')">退回</button>
                    ` : item.status === 'APPROVED' ? `<span class="text-success small"><i class="bi bi-check-circle me-1"></i>已通过</span>` : '—'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- UIF Tab -->
      <div class="tab-pane fade" id="matUifTab">
        ${r.uif && r.uif.status !== 'DRAFT' ? `
          <div class="card p-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <div>
                <span class="fw-semibold">UIF 状态：</span>
                <span class="badge bg-${r.uif.status==='SUBMITTED'?'warning':r.uif.status==='MERGED'?'success':'secondary'}">${r.uif.status}</span>
              </div>
              ${r.uif.status === 'SUBMITTED' ? `
                <div class="d-flex gap-2">
                  <button class="btn btn-sm btn-primary" onclick="generateDocsFromUif('${r.id}')">
                    <i class="bi bi-file-earmark-pdf me-1"></i>生成申请文件 (SAF/F16/V36)
                  </button>
                  ${r.student_id ? `<button class="btn btn-sm btn-success" onclick="showUifMergePanel('${r.id}')">
                    <i class="bi bi-arrow-right-square me-1"></i>合并到学生档案
                  </button>` : ''}
                </div>` : r.uif.status === 'MERGED' ? `
                <div class="d-flex align-items-center gap-2">
                  <span class="text-success small"><i class="bi bi-check-circle me-1"></i>已生成</span>
                  <button class="btn btn-sm btn-outline-primary" onclick="generateDocsFromUif('${r.id}')">
                    <i class="bi bi-arrow-clockwise me-1"></i>重新生成
                  </button>
                </div>` : ''}
            </div>
            <div id="uifDataDisplay">${renderUifDataDisplay(uifData)}</div>
          </div>
        ` : `<div class="alert alert-info">中介尚未提交学生信息表。</div>`}
      </div>

      <!-- 催件日志 Tab -->
      <div class="tab-pane fade" id="matReminderTab">
        ${r.reminders.length ? `
          <table class="table table-sm">
            <thead class="table-light"><tr><th>类型</th><th>发送至</th><th>时间</th><th>状态</th></tr></thead>
            <tbody>
              ${r.reminders.map(log => `<tr>
                <td><span class="badge bg-secondary">${log.type}</span></td>
                <td class="small">${escapeHtml(log.sent_to || '—')}</td>
                <td class="small text-muted">${fmtDatetime(log.sent_at)}</td>
                <td><span class="badge bg-${log.status==='sent'?'success':'danger'}">${log.status}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div class="text-muted p-3">暂无催件记录</div>'}
      </div>
    </div>
  `;
}

function matItemStatusBadge(s) {
  const map = {
    PENDING:   ['secondary', '待上传'],
    UPLOADED:  ['info',      '已上传'],
    REVIEWING: ['warning',   '审核中'],
    APPROVED:  ['success',   '已通过'],
    REJECTED:  ['danger',    '已退回'],
  };
  const [cls, label] = map[s] || ['secondary', s];
  return `<span class="badge bg-${cls}">${label}</span>`;
}

function renderUifDataDisplay(data) {
  if (!data || Object.keys(data).length === 0) return '<div class="text-muted">暂无数据</div>';
  const sections = [
    ['基本信息', ['cn_name','en_name','gender','dob','nationality','passport_no','passport_expiry']],
    ['联系信息', ['phone','email','wechat','emergency_name','emergency_rel','emergency_phone']],
    ['教育背景', ['school','grade','grad_date','grades_notes']],
    ['语言成绩', ['ielts','toefl','other_lang']],
    ['申请意向', ['target_countries','target_major','intake_season','budget','scholarship']],
    ['附加信息', ['activities','ps_draft','agent_notes']],
  ];
  const labels = {
    cn_name:'中文姓名',en_name:'英文姓名',gender:'性别',dob:'出生日期',
    nationality:'国籍',passport_no:'护照号',passport_expiry:'护照有效期',
    phone:'手机',email:'邮箱',wechat:'微信',emergency_name:'紧急联系人',
    emergency_rel:'关系',emergency_phone:'紧急联系电话',
    school:'就读学校',grade:'年级',grad_date:'预计毕业',grades_notes:'成绩情况',
    ielts:'雅思',toefl:'托福',other_lang:'其他语言',
    target_countries:'目标国家',target_major:'目标专业',intake_season:'申请轮次',
    budget:'预算',scholarship:'奖学金需求',activities:'课外活动',ps_draft:'个人陈述草稿',agent_notes:'中介备注',
  };
  return sections.map(([title, fields]) => {
    const rows = fields.filter(f => data[f]).map(f =>
      `<tr><td class="small text-muted" style="width:140px">${labels[f]||f}</td>
       <td class="small">${escapeHtml(String(data[f]))}</td></tr>`).join('');
    if (!rows) return '';
    return `<div class="mb-3"><div class="fw-semibold small text-primary mb-1">${title}</div>
      <table class="table table-sm table-bordered mb-0">${rows}</table></div>`;
  }).join('');
}

// ── 表单字段级问题标记 ──
window._uifFlaggedFields = {};

function toggleUifFlag(btn) {
  const key = btn.dataset.key;
  const label = btn.dataset.label;
  const row = btn.closest('tr');
  const section = btn.closest('.mb-3');
  if (window._uifFlaggedFields[key]) {
    delete window._uifFlaggedFields[key];
    btn.style.opacity = '.3';
    btn.style.color = '';
    if (row) row.style.background = '';
    if (section && !row) section.style.background = '';
    // 移除备注输入
    const noteEl = (row?.parentElement || section)?.querySelector('.flag-note-' + key);
    if (noteEl) noteEl.remove();
  } else {
    window._uifFlaggedFields[key] = label;
    btn.style.opacity = '1';
    btn.style.color = '#dc2626';
    if (row) {
      row.style.background = '#fef2f2';
      const noteRow = document.createElement('tr');
      noteRow.className = 'flag-note-' + key;
      noteRow.innerHTML = '<td colspan="3" style="padding:2px 8px"><input type="text" class="form-control form-control-sm" placeholder="问题说明（可选）" data-flag-key="' + key + '" style="border-color:#fca5a5"></td>';
      row.after(noteRow);
    } else if (section) {
      section.style.background = '#fef2f2';
      section.style.borderRadius = '6px';
      section.style.padding = '8px';
      const noteDiv = document.createElement('div');
      noteDiv.className = 'flag-note-' + key + ' mt-1';
      noteDiv.innerHTML = '<input type="text" class="form-control form-control-sm" placeholder="问题说明（可选）" data-flag-key="' + key + '" style="border-color:#fca5a5">';
      section.appendChild(noteDiv);
    }
  }
  // 更新计数 + 按钮显隐联动
  const count = Object.keys(window._uifFlaggedFields).length;
  const countEl = document.getElementById('uifFlagCount');
  if (countEl) countEl.textContent = '已标记 ' + count + ' 个问题字段';
  const issueBtn = document.getElementById('uifConfirmIssuesBtn');
  if (issueBtn) issueBtn.style.display = count > 0 ? '' : 'none';
  const approveBtn = document.getElementById('uifApproveBtn');
  if (approveBtn) approveBtn.style.display = count > 0 ? 'none' : '';
}

async function confirmUifIssues(requestId) {
  const fieldNotes = {};
  document.querySelectorAll('[data-flag-key]').forEach(el => {
    const key = el.dataset.flagKey;
    const note = el.value?.trim() || window._uifFlaggedFields[key] || '需要修改';
    fieldNotes[key] = note;
  });
  for (const [k, label] of Object.entries(window._uifFlaggedFields)) {
    if (!fieldNotes[k]) fieldNotes[k] = label + ' 需要修改';
  }
  const count = Object.keys(fieldNotes).length;

  // 直接保存到后端（持久化，不依赖 window 变量）
  try {
    await api('PUT', '/api/mat-uif/' + requestId + '/field-notes', { field_notes: fieldNotes });
  } catch(e) { console.error('Save field notes failed:', e.message); }

  window._pendingFieldNotes = fieldNotes;
  bootstrap.Modal.getInstance(document.getElementById('uifDetailModal'))?.hide();
  showSuccess('已标记 ' + count + ' 个表单问题，请在审核总览中确认退回');
  loadCaseDetail();
}

async function approveUifFromDetail(requestId) {
  if (!confirm('确认表单内容无误，审核通过？')) return;
  try {
    await api('POST', '/api/mat-requests/' + requestId + '/approve');
    bootstrap.Modal.getInstance(document.getElementById('uifDetailModal'))?.hide();
    showSuccess('表单已审核通过');
    loadCaseDetail();
  } catch(e) { showError(e.message); }
}

// ── 文件预览 ──
function previewMatFile(itemId, fileName) {
  const url = '/api/mat-request-items/' + itemId + '/preview';
  const dlUrl = '/api/mat-request-items/' + itemId + '/download';
  const ext = (fileName || '').split('.').pop().toLowerCase();
  const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext);
  const isPdf = ext === 'pdf';

  let content;
  if (isImage) {
    content = `<div class="text-center"><img src="${url}" style="max-width:100%;max-height:75vh;border-radius:6px"></div>`;
  } else if (isPdf) {
    content = `<iframe src="${url}" style="width:100%;height:75vh;border:none;border-radius:6px"></iframe>`;
  } else {
    content = `<div class="text-center py-5">
      <i class="bi bi-file-earmark" style="font-size:3rem;color:#999"></i>
      <p class="text-muted mt-2">此文件类型不支持在线预览</p>
      <a href="${dlUrl}" class="btn btn-primary" download><i class="bi bi-download me-1"></i>下载查看</a>
    </div>`;
  }

  const modalId = 'filePreviewModal';
  let modal = document.getElementById(modalId);
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = modalId;
  modal.className = 'modal fade';
  modal.setAttribute('tabindex', '-1');
  modal.innerHTML = `<div class="modal-dialog modal-xl modal-dialog-centered"><div class="modal-content">
    <div class="modal-header py-2">
      <h6 class="modal-title"><i class="bi bi-eye me-2"></i>${escapeHtml(fileName)}</h6>
      <div class="d-flex gap-2 align-items-center">
        <a href="${dlUrl}" class="btn btn-sm btn-outline-primary" download><i class="bi bi-download"></i></a>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
    </div>
    <div class="modal-body p-2">${content}</div>
  </div></div>`;
  document.body.appendChild(modal);
  bootstrap.Modal.getOrCreateInstance(modal).show();
  modal.addEventListener('hidden.bs.modal', () => modal.remove());
}

function showRejectInput(itemId) {
  document.getElementById('reject-input-' + itemId)?.classList.remove('d-none');
  document.getElementById('reject-reason-' + itemId)?.focus();
}

async function reviewMatItem(itemId, action, directReason) {
  let reason = directReason || null;
  if (action === 'reject' && !reason) {
    reason = '需要重新上传';
  }
  try {
    await PUT(`/api/mat-request-items/${itemId}/review`, { action, reason });
    showSuccess(action === 'approve' ? '文件已通过' : '已标记为不通过');
    // 刷新：优先刷新 intake case detail（如果当前在 case 页面），否则刷新 MAT 页面
    if ((State.currentPage === 'intake-case-detail' || document.getElementById('intakeDetailPanel')) && State.currentCaseId) {
      renderIntakeCaseDetail(State.currentCaseId);
    } else if (State.currentMatRequestId) {
      renderMatRequestDetail({ requestId: State.currentMatRequestId });
    }
  } catch(e) { showError('操作失败: ' + e.message); }
}

async function matCancelRequest(id) {
  if (!confirm('确定取消该材料收集请求？此操作将作废所有 Magic Link。')) return;
  try {
    await DEL(`/api/mat-requests/${id}`);
    showSuccess('已取消');
    navigate('mat-requests');
  } catch(e) { showError('操作失败: ' + e.message); }
}

// ── 从 intake case 创建材料收集请求 ──
function addMatCaseItem() {
  const html = '<div class="d-flex gap-2 mb-2 align-items-center mat-case-item-row">' +
    '<input type="text" class="form-control form-control-sm" placeholder="材料名称" data-role="item-name">' +
    '<div class="form-check mb-0 text-nowrap"><input class="form-check-input" type="checkbox" checked data-role="item-required"><label class="form-check-label small">必填</label></div>' +
    '<button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="this.closest(\'.mat-case-item-row\').remove()"><i class="bi bi-x"></i></button></div>';
  document.getElementById('matCaseItemsList').insertAdjacentHTML('beforeend', html);
}

async function showCreateMatRequestForCase(caseId) {
  // 获取中介公司列表
  let companies = [];
  try { companies = await GET('/api/mat-companies'); } catch(e) {}
  if (companies.length === 0) {
    showError('请先在系统中添加中介公司信息');
    return;
  }

  const companyOpts = companies.map(co => `<option value="${co.id}">${escapeHtml(co.name)}</option>`).join('');

  const html = `
    <div class="mb-3">
      <label class="form-label fw-semibold">选择中介公司 <span class="text-danger">*</span></label>
      <select id="matCaseCompany" class="form-select" onchange="loadContactsForMatCase(this.value)">
        <option value="">请选择...</option>${companyOpts}
      </select>
    </div>
    <div class="mb-3">
      <label class="form-label fw-semibold">联系人 <span class="text-danger">*</span></label>
      <select id="matCaseContact" class="form-select"><option value="">请先选择公司</option></select>
    </div>
    <div class="mb-3">
      <label class="form-label fw-semibold">截止日期</label>
      <input type="date" id="matCaseDeadline" class="form-control" value="${new Date(Date.now()+14*86400000).toISOString().slice(0,10)}">
    </div>
    <div class="mb-3">
      <label class="form-label fw-semibold">需要上传的材料 <span class="text-danger">*</span></label>
      <div id="matCaseItemsList">
        ${['护照首页','在读证明','成绩单'].map((n, i) => `
          <div class="d-flex gap-2 mb-2 align-items-center mat-case-item-row">
            <input type="text" class="form-control form-control-sm" value="${n}" data-role="item-name">
            <div class="form-check mb-0 text-nowrap">
              <input class="form-check-input" type="checkbox" checked data-role="item-required" id="mcr${i}">
              <label class="form-check-label small" for="mcr${i}">必填</label>
            </div>
            <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="this.closest('.mat-case-item-row').remove()"><i class="bi bi-x"></i></button>
          </div>`).join('')}
      </div>
      <button class="btn btn-sm btn-outline-primary" onclick="addMatCaseItem()"><i class="bi bi-plus me-1"></i>添加材料项</button>
    </div>
    <div class="mb-3">
      <label class="form-label fw-semibold">备注</label>
      <textarea id="matCaseNotes" class="form-control" rows="2" placeholder="可选"></textarea>
    </div>
  `;

  // 用 Bootstrap modal 或简单 confirm
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="modal fade" id="matCaseModal" tabindex="-1">
      <div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h6 class="modal-title">发起材料收集</h6><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">${html}</div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
          <button type="button" class="btn btn-primary" id="matCaseSubmitBtn">
            <i class="bi bi-send me-1"></i>创建并发送链接
          </button>
        </div>
      </div></div>
    </div>`;
  document.body.appendChild(container);
  const modal = new bootstrap.Modal(container.querySelector('.modal'));
  modal.show();

  // 加载联系人
  window.loadContactsForMatCase = async function(companyId) {
    const sel = document.getElementById('matCaseContact');
    if (!companyId) { sel.innerHTML = '<option value="">请先选择公司</option>'; return; }
    try {
      const contacts = await GET(`/api/mat-companies/${companyId}/contacts`);
      sel.innerHTML = '<option value="">请选择联系人...</option>' + contacts.map(co => `<option value="${co.id}">${escapeHtml(co.name)} (${escapeHtml(co.email||'')})</option>`).join('');
    } catch(e) { sel.innerHTML = '<option value="">加载失败</option>'; }
  };

  container.querySelector('#matCaseSubmitBtn').onclick = async function() {
    const company_id = document.getElementById('matCaseCompany').value;
    const contact_id = document.getElementById('matCaseContact').value;
    const deadline = document.getElementById('matCaseDeadline').value;
    const notes = document.getElementById('matCaseNotes').value;
    if (!company_id || !contact_id) { showToast('请选择公司和联系人', 'warning'); return; }

    // 收集材料项
    const items = [];
    document.querySelectorAll('.mat-case-item-row').forEach(row => {
      const name = row.querySelector('[data-role="item-name"]')?.value?.trim();
      const required = row.querySelector('[data-role="item-required"]')?.checked;
      if (name) items.push({ name, is_required: !!required });
    });
    if (!items.length) { showToast('请至少添加一项需要上传的材料', 'warning'); return; }

    this.disabled = true;
    this.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>创建中...';
    try {
      const res = await POST(`/api/intake-cases/${caseId}/mat-request`, { company_id, contact_id, deadline, notes, items });
      modal.hide();
      showToast('材料收集请求已创建，Magic Link 已生成', 'success');
      // 刷新当前 case 页面
      setTimeout(() => renderIntakeCaseDetail(caseId), 500);
    } catch(e) {
      showToast(e.message, 'danger');
      this.disabled = false;
      this.innerHTML = '<i class="bi bi-send me-1"></i>创建并发送链接';
    }
  };

  container.querySelector('.modal').addEventListener('hidden.bs.modal', () => container.remove());
}

// ── 查看 UIF 表单内容 ──
async function viewUifDetail(requestId) {
  try {
    // 从当前已加载的 case 数据获取 UIF，或重新请求 case detail
    const caseData = await api('GET', `/api/intake-cases/${State.currentCaseId}`);
    const uif = caseData.matRequest?.uif;
    if (!uif || !uif.data) { showError('UIF 数据不存在'); return; }
    const d = typeof uif.data === 'string' ? JSON.parse(uif.data) : (uif.data || {});

    // 字段分组和中文标签
    const groups = [
      { title: '课程信息', icon: 'bi-mortarboard', fields: [
        ['course_name','申请课程'],['course_code','课程代码'],['intake_year','入学年份'],['intake_month','入学月份'],
        ['study_mode','学习模式'],['campus','校区'],['school_name','学校名称']
      ]},
      { title: '准证类型', icon: 'bi-card-heading', fields: [
        ['sg_pass_type','新加坡准证类型'],['requires_student_pass','需要学生准证'],['was_ever_sg_citizen_or_pr','曾是SC/PR'],
        ['sg_nric_fin','NRIC/FIN'],['sg_pass_expiry','准证到期'],
        ['prior_sg_study','曾在新加坡就读'],['prior_sg_school','曾就读学校'],['prior_sg_year','就读年份']
      ]},
      { title: '个人信息', icon: 'bi-person', fields: [
        ['surname','姓氏'],['given_name','名字'],['chinese_name','中文名'],['alias','别名'],
        ['gender','性别'],['dob','出生日期'],['birth_certificate_no','出生证号'],
        ['nationality','国籍'],['birth_country','出生国'],['birth_city','出生城市'],['birth_province_state','出生省/州'],
        ['race','种族'],['religion','宗教'],['occupation','职业'],['marital_status','婚姻状况']
      ]},
      { title: '联系方式', icon: 'bi-telephone', fields: [
        ['email','邮箱'],['phone_mobile','手机号'],['phone_home','家庭电话'],
        ['sg_address','新加坡地址'],['sg_tel_no','新加坡电话'],
        ['address_line1','家乡地址1'],['address_line2','家乡地址2'],
        ['city','城市'],['state_province','省/州'],['postal_code','邮编'],['country_of_residence','居住国'],
        ['hometown_address','家乡完整地址']
      ]},
      { title: '护照信息', icon: 'bi-passport', fields: [
        ['passport_type','证件类型'],['passport_no','护照号码'],['passport_issue_country','签发国'],
        ['passport_issue_place','签发地'],['passport_issue_date','签发日期'],['passport_expiry','有效期'],
        ['foreign_identification_no','外国识别号'],['malaysian_id_no','马来西亚IC号']
      ]},
      { title: '语言能力', icon: 'bi-translate', fields: [
        ['native_language','母语'],['english_proficiency','英语水平'],['highest_lang_proficiency','最高语言水平'],
        ['ielts_score','雅思'],['toefl_score','托福'],['other_lang_test','其他语言考试'],['other_lang_score','其他分数'],
        ['need_english_placement_test','需要英语分级测试']
      ]},
      { title: '财务信息', icon: 'bi-cash-stack', fields: [
        ['financial_source','资金来源'],['applicant_monthly_income','申请人月收入'],['applicant_current_saving','申请人存款'],
        ['father_monthly_income','父亲月收入'],['father_current_saving','父亲存款'],
        ['mother_monthly_income','母亲月收入'],['mother_current_saving','母亲存款'],
        ['spouse_monthly_income','配偶月收入'],['spouse_current_saving','配偶存款'],
        ['sponsor_name','赞助人'],['sponsor_relation','赞助关系'],
        ['other_financial_support','其他经济支持'],['other_financial_details','详情'],['other_financial_amount','金额'],
        ['bank_statement_available','有银行证明']
      ]},
      { title: '个人声明', icon: 'bi-shield-check', fields: [
        ['antecedent_q1','曾被拒绝入境/遣返'],['antecedent_q2','曾被法院定罪'],
        ['antecedent_q3','曾被禁止入境新加坡'],['antecedent_q4','曾用不同护照/姓名入境'],
        ['antecedent_remarks','声明备注']
      ]},
      { title: '监护人信息', icon: 'bi-person-check', fields: [
        ['guardian_surname','监护人姓'],['guardian_given_name','监护人名'],['guardian_relation','关系'],
        ['guardian_nationality','国籍'],['guardian_phone','电话'],['guardian_email','邮箱'],
        ['guardian_address','地址'],['guardian_passport_no','护照/证件号'],['guardian_occupation','职业']
      ]},
      { title: '同意与签名', icon: 'bi-pen', fields: [
        ['pdpa_consent','PDPA同意'],['pdpa_marketing','营销同意'],['pdpa_photo_video','拍摄同意'],
        ['f16_declaration_agreed','Form16声明'],['v36_declaration_agreed','V36声明'],['sig_date','签名日期']
      ]}
    ];

    // 格式化值
    function fmtVal(k, v) {
      if (v === null || v === undefined || v === '') return '<span class="text-muted">—</span>';
      if (k.startsWith('_')) return '<span class="text-muted">[数据]</span>';
      if (typeof v === 'string' && v.startsWith('data:image')) return '<img src="'+v+'" style="max-width:80px;max-height:80px;border-radius:4px">';
      if (['1','true'].includes(String(v))) return '<i class="bi bi-check-circle-fill text-success"></i> 是';
      if (['0','false'].includes(String(v)) && (k.includes('consent') || k.includes('agreed') || k.includes('antecedent') || k.includes('requires') || k.includes('was_ever') || k.includes('need_') || k.includes('other_financial') || k.includes('bank_statement') || k.includes('prior_sg') || k.includes('no_education') || k.includes('no_employment'))) return '<i class="bi bi-x-circle text-danger"></i> 否';
      return escapeHtml(String(v));
    }

    // 数组数据
    const family = d._family || [];
    const education = d._education || [];
    const employment = d._employment || [];
    const residence = d._residence || [];

    let html = '<div style="max-height:70vh;overflow-y:auto;padding-right:8px">';
    html += '<div class="alert alert-info py-2 small mb-3"><i class="bi bi-info-circle me-1"></i>点击字段右侧的 <i class="bi bi-flag text-danger"></i> 标记有问题的字段，完成后点击底部按钮。</div>';

    // 分组渲染 — 每行加标记按钮
    for (const g of groups) {
      const rows = g.fields.filter(([k]) => d[k] !== undefined && d[k] !== null).map(([k, label]) =>
        `<tr data-field="${k}">
          <td class="text-muted small" style="width:30%;vertical-align:top;padding:4px 8px">${label}</td>
          <td class="small" style="padding:4px 8px">${fmtVal(k, d[k])}</td>
          <td style="width:40px;padding:4px;text-align:center;vertical-align:top">
            <button class="btn btn-sm p-0 uif-flag-btn" data-key="${k}" data-label="${escapeHtml(label)}" onclick="toggleUifFlag(this)" title="标记问题" style="opacity:.3;font-size:.9rem"><i class="bi bi-flag-fill"></i></button>
          </td>
        </tr>`
      );
      if (!rows.length) continue;
      html += `<div class="mb-3"><div class="fw-semibold small mb-1" style="color:var(--primary)"><i class="${g.icon} me-1"></i>${g.title}</div>
        <table class="table table-sm table-bordered mb-0" style="font-size:.85rem"><tbody>${rows.join('')}</tbody></table></div>`;
    }

    // 家庭成员
    if (family.length) {
      html += '<div class="mb-3"><div class="fw-semibold small mb-1" style="color:var(--primary)"><i class="bi bi-people me-1"></i>家庭成员 ('+family.length+'人) <button class="btn btn-sm p-0 uif-flag-btn ms-2" data-key="_family" data-label="家庭成员" onclick="toggleUifFlag(this)" title="标记问题" style="opacity:.3;font-size:.85rem"><i class="bi bi-flag-fill"></i></button></div>';
      html += '<table class="table table-sm table-bordered mb-0" style="font-size:.8rem"><thead><tr><th>关系</th><th>姓名</th><th>出生日期</th><th>国籍</th><th>SG身份</th><th>职业</th></tr></thead><tbody>';
      for (const m of family) {
        html += `<tr><td>${escapeHtml(m.member_type||'')}</td><td>${escapeHtml((m.surname||'')+' '+(m.given_name||''))}</td><td>${escapeHtml(m.dob||'')}</td><td>${escapeHtml(m.nationality||'')}</td><td>${escapeHtml(m.sg_status||'')}</td><td>${escapeHtml(m.occupation||'')}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }

    // 教育经历
    if (education.length) {
      html += '<div class="mb-3"><div class="fw-semibold small mb-1" style="color:var(--primary)"><i class="bi bi-book me-1"></i>教育经历 ('+education.length+'条) <button class="btn btn-sm p-0 uif-flag-btn ms-2" data-key="_education" data-label="教育经历" onclick="toggleUifFlag(this)" title="标记问题" style="opacity:.3;font-size:.85rem"><i class="bi bi-flag-fill"></i></button></div>';
      html += '<table class="table table-sm table-bordered mb-0" style="font-size:.8rem"><thead><tr><th>学校</th><th>国家</th><th>时间</th><th>学历</th></tr></thead><tbody>';
      for (const e of education) {
        html += `<tr><td>${escapeHtml(e.institution_name||'')}</td><td>${escapeHtml(e.country||'')}</td><td>${escapeHtml((e.date_from||'')+' ~ '+(e.date_to||''))}</td><td>${escapeHtml(e.qualification||'')}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }

    // 工作经历
    if (employment.length) {
      html += '<div class="mb-3"><div class="fw-semibold small mb-1" style="color:var(--primary)"><i class="bi bi-briefcase me-1"></i>工作经历 ('+employment.length+'条) <button class="btn btn-sm p-0 uif-flag-btn ms-2" data-key="_employment" data-label="工作经历" onclick="toggleUifFlag(this)" title="标记问题" style="opacity:.3;font-size:.85rem"><i class="bi bi-flag-fill"></i></button></div>';
      html += '<table class="table table-sm table-bordered mb-0" style="font-size:.8rem"><thead><tr><th>公司</th><th>国家</th><th>时间</th><th>职位</th><th>职责</th></tr></thead><tbody>';
      for (const e of employment) {
        html += `<tr><td>${escapeHtml(e.employer||'')}</td><td>${escapeHtml(e.country||'')}</td><td>${escapeHtml((e.date_from||'')+' ~ '+(e.date_to||''))}</td><td>${escapeHtml(e.position||'')}</td><td>${escapeHtml(e.nature_of_duties||'')}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }

    // 居住史
    if (residence.length) {
      html += '<div class="mb-3"><div class="fw-semibold small mb-1" style="color:var(--primary)"><i class="bi bi-geo-alt me-1"></i>居住史 ('+residence.length+'条) <button class="btn btn-sm p-0 uif-flag-btn ms-2" data-key="_residence" data-label="居住史" onclick="toggleUifFlag(this)" title="标记问题" style="opacity:.3;font-size:.85rem"><i class="bi bi-flag-fill"></i></button></div>';
      html += '<table class="table table-sm table-bordered mb-0" style="font-size:.8rem"><thead><tr><th>国家</th><th>地址</th><th>从</th><th>到</th></tr></thead><tbody>';
      for (const r of residence) {
        html += `<tr><td>${escapeHtml(r.country||'')}</td><td>${escapeHtml(r.address||'')}</td><td>${escapeHtml(r.date_from||'')}</td><td>${escapeHtml(r.date_to||'present')}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }

    // 证件照
    if (d._id_photo_data) {
      html += '<div class="mb-3"><div class="fw-semibold small mb-1" style="color:var(--primary)"><i class="bi bi-camera me-1"></i>证件照</div>';
      html += '<img src="'+d._id_photo_data+'" style="max-width:120px;max-height:160px;border-radius:6px;border:1px solid #ddd">';
      html += '</div>';
    }

    html += '</div>';

    // 弹窗展示
    const modalId = 'uifDetailModal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal fade';
    modal.setAttribute('tabindex','-1');
    modal.innerHTML = `<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title"><i class="bi bi-file-text me-2"></i>审核表单内容</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body" id="uifDetailBody"></div>
      <div class="modal-footer d-flex justify-content-between">
        <div><span class="small text-muted" id="uifFlagCount">已标记 0 个问题字段</span></div>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
          <button type="button" class="btn btn-warning" id="uifConfirmIssuesBtn" onclick="confirmUifIssues('${requestId}')" style="display:none">
            <i class="bi bi-exclamation-triangle me-1"></i>确认标记问题
          </button>
          <button type="button" class="btn btn-success" id="uifApproveBtn" onclick="approveUifFromDetail('${requestId}')">
            <i class="bi bi-check-circle me-1"></i>表单审核通过
          </button>
        </div>
      </div>
    </div></div>`;
    document.body.appendChild(modal);
    document.getElementById('uifDetailBody').innerHTML = html;
    bootstrap.Modal.getOrCreateInstance(modal).show();
  } catch(e) {
    showError('获取表单数据失败: ' + e.message);
  }
}

// ── 退回弹窗中追加文件项 ──
function addReturnItem() {
  const html = '<div class="d-flex gap-2 mb-2 align-items-center ret-add-row">' +
    '<input class="form-control form-control-sm" placeholder="文件名称（如：体检报告）" data-role="ret-item-name">' +
    '<div class="form-check flex-shrink-0"><input class="form-check-input" type="checkbox" data-role="ret-item-required"><label class="form-check-label small">必须</label></div>' +
    '<button class="btn btn-sm btn-outline-danger py-0 px-1 flex-shrink-0" onclick="this.closest(\'.ret-add-row\').remove()" title="删除"><i class="bi bi-x"></i></button>' +
    '</div>';
  document.getElementById('retAddItemsList').insertAdjacentHTML('beforeend', html);
}

// ── UIF 审核通过 ──
async function approveUif(requestId) {
  if (!confirm('确认审核通过？通过后可生成正式申请文件。')) return;
  try {
    await api('POST', `/api/mat-requests/${requestId}/approve`);
    showSuccess('已审核通过');
    loadCaseDetail();
  } catch(e) { showError(e.message); }
}

// ── UIF 打回修改（支持三类问题）──
async function returnUif(requestId) {
  // 获取文件列表，自动识别已标记为 REJECTED 的
  const caseData = await api('GET', `/api/intake-cases/${State.currentCaseId}`);
  const allItems = caseData.matRequest?.items || [];
  const rejectedItems = allItems.filter(i => i.status === 'REJECTED');
  const otherItems = allItems.filter(i => i.file_id && i.status !== 'REJECTED' && i.status !== 'APPROVED');

  // 已退回文件（自动带出，已勾选）
  const rejectedHtml = rejectedItems.length ? rejectedItems.map(item =>
    `<div class="d-flex align-items-center gap-2 mb-1 py-1" style="background:#fef2f2;border-radius:4px;padding:4px 8px">
      <i class="bi bi-x-circle-fill text-danger"></i>
      <span class="small fw-semibold">${escapeHtml(item.name)}</span>
      <span class="small text-danger">${item.reject_reason ? escapeHtml(item.reject_reason) : '需重新上传'}</span>
      <input type="hidden" class="auto-reject-item" value="${item.id}" data-reason="${escapeHtml(item.reject_reason||'需重新上传')}">
    </div>`
  ).join('') : '';

  // 其他待审核文件（可手动勾选追加）
  const otherHtml = otherItems.length ? otherItems.map(item =>
    `<div class="form-check mb-1">
      <input class="form-check-input" type="checkbox" id="retFile-${item.id}" value="${item.id}" onchange="document.getElementById('retFN-${item.id}').classList.toggle('d-none',!this.checked)">
      <label class="form-check-label small" for="retFile-${item.id}">${escapeHtml(item.name)}</label>
      <input class="form-control form-control-sm mt-1 d-none" id="retFN-${item.id}" placeholder="问题说明">
    </div>`
  ).join('') : '';

  // 表单字段问题（优先从后端读取，其次从 window 变量）
  let pendingFields = window._pendingFieldNotes || {};
  if (!Object.keys(pendingFields).length && caseData.matRequest?.uif?.field_notes) {
    try { pendingFields = JSON.parse(caseData.matRequest.uif.field_notes); } catch(e) {}
  }
  const fieldIssueHtml = Object.keys(pendingFields).length ? `
    <div class="border rounded p-3 mb-3">
      <div class="fw-semibold small mb-2"><i class="bi bi-input-cursor-text me-1 text-primary"></i>已标记的表单问题 (${Object.keys(pendingFields).length})</div>
      ${Object.entries(pendingFields).map(([k, v]) => `<div class="small py-1" style="color:#1d4ed8"><code style="background:#eff6ff;padding:1px 4px;border-radius:3px">${escapeHtml(k)}</code> ${escapeHtml(v)}</div>`).join('')}
    </div>` : '';

  const html = `
    <div class="mb-3">
      <label class="form-label fw-semibold">退回原因概述 <span class="text-danger">*</span></label>
      <textarea id="returnReason" class="form-control" rows="3" placeholder="请说明需要修改的内容，代理会看到这段话。"></textarea>
    </div>

    ${fieldIssueHtml}

    ${rejectedHtml ? `<div class="border rounded p-3 mb-3">
      <div class="fw-semibold small mb-2"><i class="bi bi-x-circle-fill me-1 text-danger"></i>已标记退回的文件 (${rejectedItems.length})</div>
      <div class="small text-muted mb-2">以下文件已在审核中标记为不通过，将自动包含在退回通知中</div>
      ${rejectedHtml}
    </div>` : ''}

    ${otherHtml ? `<div class="border rounded p-3 mb-3">
      <div class="fw-semibold small mb-2"><i class="bi bi-file-earmark-x me-1 text-warning"></i>追加退回文件 <span class="text-muted fw-normal">(可选)</span></div>
      ${otherHtml}
    </div>` : ''}

    <div class="border rounded p-3 mb-3">
      <div class="fw-semibold small mb-2"><i class="bi bi-plus-circle me-1 text-primary"></i>追加文件项 <span class="text-muted fw-normal">(可选)</span></div>
      <div class="small text-muted mb-2">如果需要代理额外上传新文件，在此添加</div>
      <div id="retAddItemsList"></div>
      <button class="btn btn-sm btn-outline-secondary" onclick="addReturnItem()"><i class="bi bi-plus me-1"></i>添加文件项</button>
    </div>

    <div class="rounded p-2 text-center" style="background:#f8f9fa">
      <small class="text-muted"><i class="bi bi-envelope me-1"></i>确认后将向代理发送通知邮件</small>
    </div>`;

  showModal('退回修改', html, async () => {
    const reason = document.getElementById('returnReason').value.trim();
    if (!reason) { showError('请填写退回原因'); return false; }

    // 收集退回文件：自动退回项 + 手动追加项
    const fileRejects = [];
    // 已在审核中标记为 REJECTED 的（自动带入）
    document.querySelectorAll('.auto-reject-item').forEach(el => {
      fileRejects.push({ item_id: el.value, reason: el.dataset.reason || '需要重新上传' });
    });
    // 手动追加勾选的
    document.querySelectorAll('[id^="retFile-"]:checked').forEach(cb => {
      const noteEl = document.getElementById('retFN-' + cb.value);
      fileRejects.push({ item_id: cb.value, reason: noteEl?.value?.trim() || '需要重新上传' });
    });

    // 收集追加文件项
    const addItems = [];
    document.querySelectorAll('.ret-add-row').forEach(row => {
      const name = row.querySelector('[data-role="ret-item-name"]')?.value?.trim();
      const required = row.querySelector('[data-role="ret-item-required"]')?.checked;
      if (name) addItems.push({ name, is_required: !!required });
    });

    // 合并表单字段问题
    const fieldNotes = Object.keys(pendingFields).length ? pendingFields : null;

    try {
      await api('POST', `/api/mat-requests/${requestId}/return`, {
        reason,
        field_notes: fieldNotes,
        file_rejects: fileRejects.length ? fileRejects : null,
        add_items: addItems.length ? addItems : null
      });
      window._pendingFieldNotes = {}; // 清空
      showSuccess('已退回修改，代理将收到汇总通知邮件');
      loadCaseDetail();
    } catch(e) { showError(e.message); return false; }
  }, '确认退回');
}

// ── 版本历史查看 ──
async function showVersionHistory(requestId) {
  try {
    const data = await api('GET', `/api/mat-requests/${requestId}/versions`);
    const versions = data.uifVersions || data || [];
    const itemVersions = data.itemVersions || [];
    const html = `
      <div style="max-height:500px;overflow-y:auto">
        <h6 class="fw-bold mb-3">表单版本</h6>
        ${versions.map(v => `
          <div class="border rounded p-3 mb-2 ${v.is_current?'border-primary':''}">
            <div class="d-flex justify-content-between align-items-center">
              <span class="fw-semibold">v${v.version_no} ${v.is_current?'<span class="badge bg-primary ms-1">当前</span>':''}</span>
              <span class="badge bg-${v.status==='APPROVED'?'success':v.status==='RETURNED'?'danger':v.status==='SUBMITTED'?'warning':'secondary'}">${v.status}</span>
            </div>
            <div class="small text-muted mt-1">提交: ${v.submitted_at||'-'} ${v.reviewed_at ? '| 审核: '+v.reviewed_at : ''}</div>
            ${v.return_reason ? `<div class="small text-danger mt-1"><i class="bi bi-exclamation-circle me-1"></i>${escapeHtml(v.return_reason)}</div>` : ''}
          </div>`).join('') || '<p class="text-muted">暂无版本记录</p>'}
        ${itemVersions.length ? `
          <h6 class="fw-bold mt-4 mb-3">文件版本</h6>
          ${itemVersions.map(iv => `
            <div class="d-flex justify-content-between align-items-center py-1 border-bottom small">
              <span>${escapeHtml(iv.item_name||'')} v${iv.version_no}</span>
              <span class="badge bg-${iv.status==='APPROVED'?'success':iv.status==='REJECTED'?'danger':'secondary'}" style="font-size:.7rem">${iv.status}</span>
              <span class="text-muted">${iv.uploaded_at||''}</span>
            </div>`).join('')}` : ''}
      </div>`;
    showModal('版本历史', html, null, null, 'lg');
  } catch(e) { showError(e.message); }
}

async function generateDocsFromUif(requestId) {
  if (!confirm('将根据代理提交的信息生成 Student Application Form、Form 16、V36 三份申请文件。确认继续？')) return;
  const btn = event?.target?.closest('button');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>生成中...'; }
  try {
    const res = await fetch(`/api/mat-requests/${requestId}/generate-documents`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '生成失败');
    showToast('正在生成申请文件，请稍候...', 'info');
    // Poll for completion (check every 2s, max 30s)
    const profileId = data.profileId;
    if (profileId) {
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const chk = await fetch(`/api/adm-profiles/${profileId}`).then(r => r.json());
          // 只检查 is_latest=1 的文档
          const docs = (chk.documents || []).filter(d => d.is_latest === 1 || d.is_latest === true);
          const allDone = docs.length >= 3 && docs.every(d => d.status === 'done');
          const anyFail = docs.some(d => d.status === 'error');
          if (allDone || anyFail || attempts >= 15) {
            clearInterval(poll);
            if (allDone) {
              showToast('三份申请文件已生成完成！', 'success');
            } else if (anyFail) {
              showToast('部分文件生成失败，请查看详情', 'warning');
            } else {
              showToast('生成超时，请手动刷新查看', 'warning');
            }
            // 刷新当前页面
            if ((State.currentPage === 'intake-case-detail' || document.getElementById('intakeDetailPanel')) && State.currentCaseId) {
              renderIntakeCaseDetail(State.currentCaseId);
            } else {
              renderMatRequestDetail({ requestId: State.currentMatRequestId || requestId });
            }
          }
        } catch(e) { /* polling error, continue */ }
      }, 2000);
    } else {
      setTimeout(() => {
        if ((State.currentPage === 'intake-case-detail' || document.getElementById('intakeDetailPanel')) && State.currentCaseId) {
          renderIntakeCaseDetail(State.currentCaseId);
        } else {
          renderMatRequestDetail({ requestId: State.currentMatRequestId || requestId });
        }
      }, 3000);
    }
  } catch(e) {
    showToast(e.message, 'danger');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-file-earmark-pdf me-1"></i>生成申请文件 (SAF/F16/V36)'; }
  }
}

async function showUifMergePanel(requestId) {
  let data = {};
  try {
    const uif = await GET(`/api/mat-uif/${requestId}`);
    data = JSON.parse(uif.data || '{}');
  } catch(e) { showError('加载 UIF 数据失败'); return; }

  const labels = {
    cn_name:'中文姓名', en_name:'英文姓名', gender:'性别', dob:'出生日期',
    nationality:'国籍', passport_no:'护照号码', passport_expiry:'护照有效期',
    phone:'手机号码', email:'电子邮箱', wechat:'微信号', emergency_name:'紧急联系人',
    emergency_rel:'关系', emergency_phone:'紧急联系电话',
    school:'就读学校', grade:'年级', grad_date:'预计毕业日期', grades_notes:'成绩情况',
    ielts:'雅思成绩', toefl:'托福成绩', other_lang:'其他语言成绩',
    target_countries:'目标国家', target_major:'目标专业', intake_season:'申请轮次',
    budget:'留学预算', scholarship:'奖学金需求', activities:'课外活动',
    ps_draft:'个人陈述草稿', agent_notes:'中介备注',
  };
  // Fields that map directly to a student table column
  // en_name excluded: students.name stores Chinese name; English name goes to notes
  const directMap = { dob: 'date_of_birth', grade: 'grade_level' };

  const sections = [
    ['基本信息', ['cn_name','en_name','gender','dob','nationality','passport_no','passport_expiry']],
    ['联系信息', ['phone','email','wechat','emergency_name','emergency_rel','emergency_phone']],
    ['教育背景', ['school','grade','grad_date','grades_notes']],
    ['语言成绩', ['ielts','toefl','other_lang']],
    ['申请意向', ['target_countries','target_major','intake_season','budget','scholarship']],
    ['附加信息', ['activities','ps_draft','agent_notes']],
  ];

  const sectionsHtml = sections.map(([title, fields]) => {
    const rows = fields.filter(f => data[f]).map(f => {
      const col = directMap[f];
      return `<div class="d-flex align-items-start gap-2 py-2 border-bottom">
        <input type="checkbox" class="form-check-input mt-1 uif-merge-check flex-shrink-0"
          id="uif_${f}" name="${f}" value="${escapeHtml(String(data[f]))}" checked>
        <label class="form-check-label w-100" for="uif_${f}">
          <div class="d-flex gap-1 align-items-center">
            <span class="text-muted small">${labels[f] || f}</span>
            ${col ? `<span class="badge bg-primary" style="font-size:10px">→ 更新 ${col}</span>`
                  : `<span class="badge bg-secondary" style="font-size:10px">→ 追加备注</span>`}
          </div>
          <div class="fw-semibold small text-break">${escapeHtml(String(data[f]))}</div>
        </label>
      </div>`;
    }).join('');
    if (!rows) return '';
    return `<div class="mb-3">
      <div class="fw-semibold text-primary small mb-1 border-bottom pb-1">${title}</div>
      ${rows}
    </div>`;
  }).join('');

  if (!sectionsHtml.trim()) {
    showModal('合并 UIF', '<div class="alert alert-info">UIF 中没有已填写的数据。</div>');
    return;
  }

  showModal('合并 UIF 到学生档案', `
    <div class="alert alert-info py-2 small mb-3">
      <i class="bi bi-info-circle me-1"></i>
      勾选要合并的字段。<span class="badge bg-primary">→ 更新字段</span> 直接写入档案对应列，
      <span class="badge bg-secondary">→ 追加备注</span> 追加到学生备注。
      <label class="ms-3">
        <input type="checkbox" id="uifCheckAll" checked onchange="document.querySelectorAll('.uif-merge-check').forEach(c=>c.checked=this.checked)">
        全选/取消
      </label>
    </div>
    <div style="max-height:420px;overflow-y:auto">${sectionsHtml}</div>
  `, async () => {
    const fields = {};
    document.querySelectorAll('.uif-merge-check:checked').forEach(el => {
      fields[el.name] = el.value;
    });
    if (Object.keys(fields).length === 0) { showError('请至少勾选一个字段'); return false; }
    const lockKey = `uif-merge-${requestId}`;
    if (!acquireSubmit(lockKey)) return false;
    try {
      const { applied } = await POST(`/api/mat-uif/${requestId}/merge`, { fields });
      showSuccess(`已成功合并 ${applied.length} 个字段到学生档案`);
      renderMatRequestDetail({ requestId: State.currentMatRequestId });
    } finally {
      releaseSubmit(lockKey);
    }
  }, '合并到档案', 'lg');
}

// ── 中介公司管理 ──────────────────────────────────────
async function renderMatCompanies() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';
  let companies = [];
  try { companies = await GET('/api/mat-companies'); }
  catch(e) { main.innerHTML = `<div class="alert alert-danger m-4">加载失败: ${escapeHtml(e.message)}</div>`; return; }

  main.innerHTML = `
    <div class="page-header mb-4">
      <h4><i class="bi bi-building me-2"></i>中介公司管理</h4>
      <div class="page-header-actions">
        <button class="btn btn-primary btn-sm" onclick="openAddMatCompanyModal()">
          <i class="bi bi-plus-lg me-1"></i>新增公司
        </button>
      </div>
    </div>
    <div class="table-responsive">
      <table class="table table-hover align-middle">
        <thead class="table-light">
          <tr><th>公司名称</th><th>城市</th><th>国家</th><th>合同日期</th><th>联系人数</th><th>活跃请求</th><th>操作</th></tr>
        </thead>
        <tbody>
          ${companies.length ? companies.map(c => `<tr>
            <td class="fw-semibold">${escapeHtml(c.name)}</td>
            <td class="small">${escapeHtml(c.city || '—')}</td>
            <td class="small">${escapeHtml(c.country || '—')}</td>
            <td class="small">${c.agreement_date || '—'}</td>
            <td class="text-center">${c.contact_count || 0}</td>
            <td class="text-center">${c.active_requests || 0}</td>
            <td>
              <button class="btn btn-xs btn-sm btn-outline-primary py-0 px-2 me-1"
                onclick="showMatCompanyDetail('${c.id}','${escapeHtml(c.name)}')">
                <i class="bi bi-person-lines-fill me-1"></i>联系人
              </button>
            </td>
          </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted py-4">暂无中介公司</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- 公司联系人弹窗 -->
    <div class="modal fade" id="matCompanyDetailModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="matCompanyDetailTitle">联系人管理</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="matCompanyDetailBody">加载中...</div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增公司弹窗 -->
    <div class="modal fade" id="addMatCompanyModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">新增中介公司</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3"><label class="form-label fw-semibold">公司名称 *</label>
              <input type="text" class="form-control" id="mcName"></div>
            <div class="row g-2 mb-3">
              <div class="col"><label class="form-label">城市</label>
                <input type="text" class="form-control" id="mcCity"></div>
              <div class="col"><label class="form-label">国家</label>
                <input type="text" class="form-control" id="mcCountry"></div>
            </div>
            <div class="mb-3"><label class="form-label">合同签署日期</label>
              <input type="date" class="form-control" id="mcAgreementDate"></div>
            <div class="mb-3"><label class="form-label">备注</label>
              <textarea class="form-control" id="mcNotes" rows="2"></textarea></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
            <button class="btn btn-primary" onclick="submitAddMatCompany()">创建</button>
          </div>
        </div>
      </div>
    </div>
  `;
  // Move modals to <body> so Bootstrap can manage them properly
  ['matCompanyDetailModal', 'addMatCompanyModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.dataset.renderedModal = '1'; document.body.appendChild(el); }
  });
}

function openAddMatCompanyModal() {
  ['mcName','mcCity','mcCountry','mcNotes'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  const el = document.getElementById('addMatCompanyModal');
  if (el) bootstrap.Modal.getOrCreateInstance(el).show();
}

async function submitAddMatCompany() {
  const name = document.getElementById('mcName')?.value?.trim();
  if (!name) { showError('公司名称必填'); return; }
  try {
    await POST('/api/mat-companies', {
      name,
      city: document.getElementById('mcCity')?.value?.trim() || null,
      country: document.getElementById('mcCountry')?.value?.trim() || null,
      agreement_date: document.getElementById('mcAgreementDate')?.value || null,
      notes: document.getElementById('mcNotes')?.value?.trim() || null,
    });
    bootstrap.Modal.getInstance(document.getElementById('addMatCompanyModal'))?.hide();
    showSuccess('公司已添加');
    renderMatCompanies();
  } catch(e) { showError('添加失败: ' + e.message); }
}

async function showMatCompanyDetail(companyId, companyName) {
  const el = document.getElementById('matCompanyDetailModal');
  if (!el) return;
  document.getElementById('matCompanyDetailTitle').textContent = `${companyName} — 联系人`;
  document.getElementById('matCompanyDetailBody').innerHTML = '<div class="text-center py-3"><div class="spinner-border"></div></div>';
  const modal = bootstrap.Modal.getOrCreateInstance(el);
  modal.show();
  try {
    const contacts = await GET(`/api/mat-companies/${companyId}/contacts`);
    document.getElementById('matCompanyDetailBody').innerHTML = `
      <div class="mb-3 text-end">
        <button class="btn btn-sm btn-primary" onclick="openAddMatContactForm('${companyId}')">
          <i class="bi bi-person-plus me-1"></i>新增联系人
        </button>
      </div>
      <div id="addContactFormArea"></div>
      <table class="table table-sm align-middle">
        <thead class="table-light"><tr><th>姓名</th><th>邮箱</th><th>手机</th><th>微信</th><th>角色</th></tr></thead>
        <tbody>
          ${contacts.length ? contacts.map(c => `<tr>
            <td class="fw-semibold">${escapeHtml(c.name)}</td>
            <td class="small"><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></td>
            <td class="small">${escapeHtml(c.phone || '—')}</td>
            <td class="small">${escapeHtml(c.wechat || '—')}</td>
            <td>${c.is_admin ? '<span class="badge bg-primary">管理员</span>' : '<span class="badge bg-secondary">跟单员</span>'}</td>
          </tr>`).join('') : '<tr><td colspan="5" class="text-center text-muted">暂无联系人</td></tr>'}
        </tbody>
      </table>`;
    window._matCurrentCompanyId = companyId;
  } catch(e) {
    document.getElementById('matCompanyDetailBody').innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

function openAddMatContactForm(companyId) {
  const area = document.getElementById('addContactFormArea');
  if (!area) return;
  area.innerHTML = `
    <div class="card p-3 mb-3 bg-light">
      <div class="row g-2">
        <div class="col-md-4"><label class="form-label small fw-semibold">姓名 *</label>
          <input type="text" class="form-control form-control-sm" id="newContactName"></div>
        <div class="col-md-4"><label class="form-label small fw-semibold">邮箱 *</label>
          <input type="email" class="form-control form-control-sm" id="newContactEmail"></div>
        <div class="col-md-4"><label class="form-label small">手机</label>
          <input type="text" class="form-control form-control-sm" id="newContactPhone"></div>
        <div class="col-md-4"><label class="form-label small">微信</label>
          <input type="text" class="form-control form-control-sm" id="newContactWechat"></div>
        <div class="col-md-4 d-flex align-items-end">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="newContactIsAdmin">
            <label class="form-check-label small" for="newContactIsAdmin">公司管理员</label>
          </div>
        </div>
        <div class="col-12 d-flex gap-2">
          <button class="btn btn-sm btn-primary" onclick="submitAddMatContact('${companyId}')">保存</button>
          <button class="btn btn-sm btn-secondary" onclick="document.getElementById('addContactFormArea').innerHTML=''">取消</button>
        </div>
      </div>
    </div>`;
}

async function submitAddMatContact(companyId) {
  const name = document.getElementById('newContactName')?.value?.trim();
  const email = document.getElementById('newContactEmail')?.value?.trim();
  if (!name || !email) { showError('姓名和邮箱必填'); return; }
  try {
    await POST(`/api/mat-companies/${companyId}/contacts`, {
      name, email,
      phone: document.getElementById('newContactPhone')?.value?.trim() || null,
      wechat: document.getElementById('newContactWechat')?.value?.trim() || null,
      is_admin: document.getElementById('newContactIsAdmin')?.checked ? 1 : 0,
    });
    showSuccess('联系人已添加');
    renderMatCompanies(); // 刷新主列表（更新联系人数）
    const company = await GET('/api/mat-companies');
    const c = company.find(x => x.id === companyId);
    await showMatCompanyDetail(companyId, c?.name || '');
  } catch(e) { showError('添加失败: ' + e.message); }
}

// ══════════════════════════════════════════════════════════════════════════
//  ADM MODULE — Admission Form Wizard + Document Management
// ══════════════════════════════════════════════════════════════════════════

// ─── State for the step wizard ─────────────────────────────────────────────
const AdmState = {
  profileId: null,
  draft: {},      // mirror of adm_profiles fields
  step: 1,
  totalSteps: 11,
  // sub-arrays (loaded from API)
  family: [],
  residence: [],
  education: [],
  employment: [],
  guardian: null,
  parentPrAdditional: [],
  spousePrAdditional: null,
  signatures: {},  // { applicant: {file_id, sig_date}, guardian: {...} }
};

// ─── Review status badge ────────────────────────────────────────────────────
function admReviewBadge(status) {
  const map = {
    draft: ['secondary', '草稿'],
    submitted: ['info', '已提交'],
    generating_documents: ['warning', '生成文件中'],
    generation_failed: ['danger', '生成失败'],
    pending_review: ['primary', '待审核'],
    pending_additional_docs: ['warning', '待补件'],
    approved: ['success', '审核通过'],
    case_created: ['success', '已创建案例'],
  };
  const [color, label] = map[status] || ['secondary', status];
  return `<span class="badge bg-${color}">${label}</span>`;
}

// ─── List page ─────────────────────────────────────────────────────────────
async function renderAdmProfiles() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';

  let profiles = [];
  try { profiles = await GET('/api/adm-profiles'); }
  catch(e) { main.innerHTML = `<div class="alert alert-danger m-4">加载失败: ${escapeHtml(e.message)}</div>`; return; }

  const canCreate = ['principal','counselor','intake_staff'].includes(State.user?.role);

  main.innerHTML = `
    <div class="page-header mb-4 d-flex justify-content-between align-items-center">
      <h4><i class="bi bi-file-earmark-person me-2"></i>招生申请表</h4>
      ${canCreate ? `<button class="btn btn-primary" onclick="renderAdmFormWizard()">
        <i class="bi bi-plus-circle me-1"></i>新建申请表</button>` : ''}
    </div>
    <div class="table-responsive">
      <table class="table table-hover align-middle">
        <thead class="table-light">
          <tr>
            <th>申请人</th><th>课程</th><th>入学年</th><th>来源</th>
            <th>审核状态</th><th>提交时间</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${profiles.length ? profiles.map(p => `
            <tr>
              <td><strong>${escapeHtml(p.surname||'')} ${escapeHtml(p.given_name||'')}</strong>
                ${p.chinese_name ? `<small class="text-muted ms-1">${escapeHtml(p.chinese_name)}</small>` : ''}</td>
              <td>${escapeHtml(p.course_name||'—')}</td>
              <td>${escapeHtml(p.intake_year||'—')}</td>
              <td><span class="badge bg-${p.source_type==='agent'?'warning':'secondary'}">${p.source_type==='agent'?'中介':'Staff'}</span></td>
              <td>${admReviewBadge(p.review_status || p.status)}</td>
              <td><small class="text-muted">${p.submitted_at ? p.submitted_at.slice(0,10) : (p.created_at||'').slice(0,10)}</small></td>
              <td>
                <button class="btn btn-sm btn-outline-primary" onclick="renderAdmCaseDetail('${p.id}')">
                  <i class="bi bi-eye"></i></button>
                ${canCreate && p.status==='draft' ? `<button class="btn btn-sm btn-outline-secondary ms-1" onclick="renderAdmFormWizard('${p.id}')">
                  <i class="bi bi-pencil"></i></button>` : ''}
              </td>
            </tr>
          `).join('') : '<tr><td colspan="7" class="text-center text-muted py-4">暂无申请表</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

// ─── Case detail (view mode) ───────────────────────────────────────────────
async function renderAdmCaseDetail(profileId) {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';

  let p;
  try { p = await GET(`/api/adm-profiles/${profileId}`); }
  catch(e) { main.innerHTML = `<div class="alert alert-danger m-4">加载失败: ${escapeHtml(e.message)}</div>`; return; }

  const reviewStatus = p.review_status || p.status;
  const canReview = ['principal','intake_staff'].includes(State.user?.role);
  const isPending = reviewStatus === 'pending_review';
  const isFailed  = reviewStatus === 'generation_failed';
  const isApproved = reviewStatus === 'approved';

  // Latest documents
  const latestDocs = {};
  (p.documents || []).forEach(d => { if (d.is_latest) latestDocs[d.doc_type] = d; });

  main.innerHTML = `
    <div class="page-header mb-3 d-flex justify-content-between align-items-center">
      <div>
        <button class="btn btn-sm btn-outline-secondary me-2" onclick="renderAdmProfiles()">
          <i class="bi bi-arrow-left"></i></button>
        <strong>${escapeHtml(p.surname||'')} ${escapeHtml(p.given_name||'')}</strong>
        <small class="text-muted ms-2">${escapeHtml(p.course_name||'')} · ${escapeHtml(p.intake_year||'')}</small>
      </div>
      <div class="d-flex gap-2 align-items-center">
        ${admReviewBadge(reviewStatus)}
        ${p.status === 'submitted' ? `<button class="btn btn-sm ${isFailed?'btn-warning':'btn-outline-secondary'}" onclick="admRegenerateDocs('${p.id}')">
          <i class="bi bi-arrow-clockwise me-1"></i>重新生成文件</button>` : ''}
        ${isPending && canReview ? `
          <button class="btn btn-sm btn-success" onclick="admReview('${p.id}','approve')">
            <i class="bi bi-check-circle me-1"></i>审核通过</button>
          <button class="btn btn-sm btn-outline-warning" onclick="admReview('${p.id}','request_docs')">
            <i class="bi bi-exclamation-circle me-1"></i>退回补件</button>` : ''}
        ${isApproved && canReview ? `<button class="btn btn-sm btn-primary" onclick="admCreateCase('${p.id}')">
          <i class="bi bi-folder-plus me-1"></i>创建入学案例</button>` : ''}
        ${p.status === 'draft' ? `<button class="btn btn-sm btn-outline-primary" onclick="renderAdmFormWizard('${p.id}')">
          <i class="bi bi-pencil me-1"></i>继续填写</button>` : ''}
      </div>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs mb-3" id="admDetailTabs">
      <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#admTab-profile">申请信息</a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#admTab-docs">生成文件</a></li>
    </ul>
    <div class="tab-content">
      <div class="tab-pane fade show active" id="admTab-profile">
        ${_admRenderProfileSummary(p)}
      </div>
      <div class="tab-pane fade" id="admTab-docs">
        ${_admRenderDocuments(latestDocs, p)}
      </div>
    </div>
  `;
}

function _admRenderProfileSummary(p) {
  const fieldRow = (label, value) => value
    ? `<div class="col-md-4 mb-2"><small class="text-muted d-block">${label}</small><span>${escapeHtml(String(value))}</span></div>`
    : '';

  const tableSection = (title, headers, rows, emptyMsg='暂无数据') => `
    <div class="mb-3">
      <div class="fw-semibold text-primary small mb-1">${title}</div>
      ${rows.length ? `<table class="table table-sm table-bordered mb-0">
        <thead class="table-light"><tr>${headers.map(h=>`<th class="small">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td class="small">${escapeHtml(String(c||''))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>` : `<div class="text-muted small">${emptyMsg}</div>`}
    </div>`;

  return `
    <div class="card mb-3"><div class="card-header fw-semibold">课程与来源</div><div class="card-body"><div class="row">
      ${fieldRow('课程', p.course_name)}${fieldRow('课程代码', p.course_code)}${fieldRow('入学年', p.intake_year)}
      ${fieldRow('入学月', p.intake_month)}${fieldRow('学习模式', p.study_mode)}${fieldRow('校区', p.campus)}
      ${fieldRow('来源', p.source_type)}
    </div></div></div>

    <div class="card mb-3"><div class="card-header fw-semibold">申请人基本信息</div><div class="card-body"><div class="row">
      ${fieldRow('英文姓', p.surname)}${fieldRow('英文名', p.given_name)}${fieldRow('中文姓名', p.chinese_name)}
      ${fieldRow('性别', p.gender)}${fieldRow('出生日期', p.dob)}${fieldRow('出生国', p.birth_country)}
      ${fieldRow('国籍', p.nationality)}${fieldRow('婚姻状况', p.marital_status)}
    </div></div></div>

    <div class="card mb-3"><div class="card-header fw-semibold">护照与新加坡状态</div><div class="card-body"><div class="row">
      ${fieldRow('护照号', p.passport_no)}${fieldRow('护照到期', p.passport_expiry)}
      ${fieldRow('SG Pass 类型', p.sg_pass_type)}${fieldRow('NRIC/FIN', p.sg_nric_fin)}
    </div></div></div>

    <div class="card mb-3"><div class="card-body">
      ${tableSection('家庭成员', ['关系','姓名','国籍','SG状态','职业'],
        (p.family||[]).map(m=>[m.member_type,`${m.surname||''} ${m.given_name||''}`.trim(),m.nationality,m.sg_status,m.occupation]))}
      ${tableSection('教育经历', ['学校','国家','学历','专业','时间段','GPA'],
        (p.education||[]).map(e=>[e.institution_name,e.country,e.qualification,e.major,`${e.date_from||''}–${e.date_to||''}`,e.gpa]))}
      ${tableSection('工作经历', ['雇主','国家','职位','时间段'],
        (p.employment||[]).map(e=>[e.employer,e.country,e.position,`${e.date_from||''}–${e.is_current?'至今':(e.date_to||'')}`]))}
      ${tableSection('近五年居住史', ['国家','城市','地址','从','到','目的'],
        (p.residence||[]).map(r=>[r.country,r.city,r.address,r.date_from,r.date_to||'至今',r.purpose]))}
    </div></div>
  `;
}

function _admRenderDocuments(latestDocs, p) {
  const docDefs = [
    { type:'SAF',    label:'Student Application Form' },
    { type:'FORM16', label:'Form 16' },
    { type:'V36',    label:'V36' },
  ];
  const statusIcon = s => ({
    done:'<i class="bi bi-check-circle-fill text-success"></i>',
    failed:'<i class="bi bi-x-circle-fill text-danger"></i>',
    generating:'<i class="bi bi-arrow-clockwise text-warning"></i>',
    pending:'<i class="bi bi-clock text-muted"></i>',
  }[s] || '<i class="bi bi-dash text-muted"></i>');

  return `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="text-muted small"><i class="bi bi-info-circle me-1"></i>文件在"正式提交"后自动生成。</div>
      ${p.status === 'submitted' ? `<button class="btn btn-sm btn-outline-primary" onclick="admRegenerateDocs('${p.id}')">
        <i class="bi bi-arrow-clockwise me-1"></i>重新生成全部文件</button>` : ''}
    </div>
    <div class="row g-3">
      ${docDefs.map(({ type, label }) => {
        const doc = latestDocs[type];
        const hasFile = doc?.status === 'done' && doc?.file_id;
        return `<div class="col-md-4">
          <div class="card h-100">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <h6 class="fw-semibold mb-0">${label}</h6>
                ${doc ? statusIcon(doc.status) : '<span class="text-muted small">未生成</span>'}
              </div>
              ${doc ? `<small class="text-muted d-block">版本 v${doc.version_no}</small>
                <small class="text-muted d-block">${doc.generated_at ? doc.generated_at.slice(0,16) : ''}</small>
                ${doc.status==='failed' ? `<div class="text-danger small mt-1">${escapeHtml(doc.error_message||'')}</div>` : ''}` : ''}
            </div>
            ${hasFile ? `<div class="card-footer">
              <a class="btn btn-sm btn-outline-primary w-100" href="/api/adm-docs/${doc.id}/download" target="_blank">
                <i class="bi bi-download me-1"></i>下载</a>
            </div>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
    ${Object.values(latestDocs).some(d => d.status === 'generating') ? `
      <div class="text-center mt-3">
        <div class="spinner-border spinner-border-sm text-warning me-2"></div>
        <span class="text-muted small">文件生成中，请稍候…</span>
        <script>setTimeout(()=>renderAdmCaseDetail('${p.id}'), 5000)</script>
      </div>` : ''}
  `;
}

// ── 左栏摘要操作函数 ──
async function addQuickTask(caseId, inputId) {
  const input = document.getElementById(inputId || 'sideTaskTitle');
  const title = input?.value?.trim();
  if (!title) return;
  try {
    await api('POST', `/api/intake-cases/${caseId}/tasks`, { title, priority: 'normal', category: '入学' });
    input.value = '';
    showToast('任务已添加');
    renderIntakeCaseDetail();
  } catch(e) { showToast(e.message, 'danger'); }
}

async function toggleTaskComplete(taskId, caseId) {
  try {
    const res = await api('GET', `/api/tasks/${taskId}`);
    const t = res.task || res;
    const newStatus = t.status === 'done' ? 'pending' : 'done';
    await api('PUT', `/api/tasks/${taskId}`, {
      title: t.title,
      description: t.description,
      category: t.category,
      due_date: t.due_date,
      status: newStatus,
      priority: t.priority,
      assigned_to: t.assigned_to
    });
    loadCaseDetail();
  } catch(e) { showToast(e.message, 'danger'); }
}

function openVisaEditPanel(caseId) {
  // 打开旧的签证编辑卡片作为弹窗——复用旧代码
  const c = window._currentCaseDetail;
  if (!c) return;
  const visa = c.visa || {};
  showModal('编辑签证信息', `
    <div class="row g-2">
      <div class="col-6"><label class="form-label small">签证状态</label>
        <select id="visaStatus" class="form-select form-select-sm">
          <option value="not_started" ${visa.status==='not_started'?'selected':''}>未开始</option>
          <option value="submitted" ${visa.status==='submitted'?'selected':''}>已提交</option>
          <option value="ipa_received" ${visa.status==='ipa_received'?'selected':''}>已获IPA</option>
          <option value="approved" ${visa.status==='approved'?'selected':''}>已批准</option>
          <option value="rejected" ${visa.status==='rejected'?'selected':''}>被拒</option>
        </select></div>
      <div class="col-6"><label class="form-label small">SOLAR申请号</label><input class="form-control form-control-sm" id="visaSolar" value="${escapeHtml(visa.solar_app_no||'')}"></div>
      <div class="col-6"><label class="form-label small">提交日期</label><input type="date" class="form-control form-control-sm" id="visaSubmDate" value="${visa.submission_date||''}"></div>
      <div class="col-6"><label class="form-label small">IPA签发日期</label><input type="date" class="form-control form-control-sm" id="visaIpaDate" value="${visa.ipa_issue_date||''}"></div>
    </div>`, async () => {
    try {
      await api('PUT', '/api/visa-cases/' + (visa.id || caseId), {
        status: document.getElementById('visaStatus').value,
        solar_app_no: document.getElementById('visaSolar').value,
        submission_date: document.getElementById('visaSubmDate').value,
        ipa_issue_date: document.getElementById('visaIpaDate').value,
      });
      showToast('签证信息已更新');
      renderIntakeCaseDetail();
    } catch(e) { showToast(e.message, 'danger'); return false; }
  });
}

function openArrivalEditPanel(caseId) {
  const c = window._currentCaseDetail;
  const arr = c?.arrival || {};
  showModal('编辑到校信息', `
    <div class="row g-2">
      <div class="col-6"><label class="form-label small">预计到达</label><input type="date" class="form-control form-control-sm" id="arrExp" value="${arr.expected_arrival||''}"></div>
      <div class="col-6"><label class="form-label small">实际到达</label><input type="date" class="form-control form-control-sm" id="arrAct" value="${arr.actual_arrival||''}"></div>
      <div class="col-6"><label class="form-label small">航班号</label><input class="form-control form-control-sm" id="arrFlt" value="${escapeHtml(arr.flight_no||'')}"></div>
      <div class="col-6"><label class="form-label small">住宿安排</label><input class="form-control form-control-sm" id="arrAcc" value="${escapeHtml(arr.accommodation||'')}"></div>
    </div>`, async () => {
    try {
      await api('PUT', '/api/arrival-records/' + (arr.id || caseId), {
        expected_arrival: document.getElementById('arrExp').value,
        actual_arrival: document.getElementById('arrAct').value,
        flight_no: document.getElementById('arrFlt').value,
        accommodation: document.getElementById('arrAcc').value,
      });
      showToast('到校信息已更新');
      renderIntakeCaseDetail();
    } catch(e) { showToast(e.message, 'danger'); return false; }
  });
}

function openInvoicePanel(caseId) {
  showModal('创建发票', `
    <div class="row g-2">
      <div class="col-6"><label class="form-label small">金额 (SGD)</label><input type="number" class="form-control form-control-sm" id="invAmount" placeholder="15000"></div>
      <div class="col-6"><label class="form-label small">到期日</label><input type="date" class="form-control form-control-sm" id="invDue"></div>
      <div class="col-12"><label class="form-label small">备注</label><input class="form-control form-control-sm" id="invNotes" placeholder="学费 Semester 1"></div>
    </div>`, async () => {
    const amount = document.getElementById('invAmount').value;
    if (!amount) { showToast('请输入金额', 'warning'); return false; }
    try {
      await api('POST', `/api/intake-cases/${caseId}/invoices`, {
        amount, due_date: document.getElementById('invDue').value, notes: document.getElementById('invNotes').value
      });
      showToast('发票已创建');
      renderIntakeCaseDetail();
    } catch(e) { showToast(e.message, 'danger'); return false; }
  });
}

async function sendSurvey(caseId) {
  if (!confirm('发送满意度调查链接给学生？')) return;
  try {
    await api('POST', `/api/intake-cases/${caseId}/send-survey-link`);
    showToast('调查链接已发送');
    renderIntakeCaseDetail();
  } catch(e) { showToast(e.message, 'danger'); }
}

async function admRegenerateDocs(profileId) {
  if (!confirm('确定要重新生成所有申请文件？')) return;
  try {
    await POST(`/api/adm-profiles/${profileId}/regenerate-doc`, {});
    showSuccess('已触发重新生成，请稍候刷新');
    setTimeout(() => renderAdmCaseDetail(profileId), 2000);
  } catch(e) { showError('操作失败: ' + e.message); }
}

async function admReview(profileId, decision) {
  const labels = { approve:'审核通过', request_docs:'退回补件' };
  const note = decision !== 'approve' ? prompt('请填写退回原因（将通知申请方）：') : null;
  if (decision !== 'approve' && note === null) return; // cancelled
  try {
    await PUT(`/api/adm-profiles/${profileId}/review`, { decision, note });
    showSuccess(`操作成功: ${labels[decision]}`);
    renderAdmCaseDetail(profileId);
  } catch(e) { showError('操作失败: ' + e.message); }
}

async function admCreateCase(profileId) {
  if (!confirm('确定要基于此申请表创建正式入学案例？')) return;
  try {
    const res = await POST(`/api/adm-profiles/${profileId}/create-case`, {});
    showSuccess('入学案例已创建');
    navigate('intake-cases', { caseId: res.intake_case_id });
  } catch(e) { showError('创建失败: ' + e.message); }
}

// ─── Step Wizard ────────────────────────────────────────────────────────────
async function renderAdmFormWizard(profileId = null) {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';

  // Load or create profile
  if (profileId) {
    try {
      const p = await GET(`/api/adm-profiles/${profileId}`);
      Object.assign(AdmState, {
        profileId: p.id,
        draft: { ...p },
        step: Math.min((p.step_completed || 0) + 1, 11),
        family: p.family || [],
        residence: p.residence || [],
        education: p.education || [],
        employment: p.employment || [],
        guardian: p.guardian || null,
        parentPrAdditional: p.parentPrAdditional || [],
        spousePrAdditional: p.spousePrAdditional || null,
        signatures: {},
      });
      (p.signatures||[]).forEach(s => { AdmState.signatures[s.sig_type] = s; });
    } catch(e) { main.innerHTML = `<div class="alert alert-danger m-4">加载失败</div>`; return; }
  } else {
    // New profile
    try {
      const res = await POST('/api/adm-profiles', { source_type: 'staff' });
      Object.assign(AdmState, {
        profileId: res.id, draft: { source_type:'staff' }, step: 1,
        family:[], residence:[], education:[], employment:[],
        guardian: null, parentPrAdditional: [], spousePrAdditional: null, signatures:{},
      });
    } catch(e) { main.innerHTML = `<div class="alert alert-danger m-4">创建草稿失败</div>`; return; }
  }

  _admRenderStep();
}

function _admRenderStep() {
  const main = document.getElementById('main-content');
  const { step, totalSteps } = AdmState;
  const stepTitles = [
    '','案例来源与课程','申请人基本信息','护照与新加坡状态','联系方式与地址',
    '家庭成员','近五年居住史','教育背景与语言','工作经历','财务支持',
    '条件区块','声明、PDPA 与签字'
  ];

  // Progress bar
  const pct = Math.round(((step-1) / (totalSteps-1)) * 100);

  main.innerHTML = `
    <div class="page-header mb-3 d-flex justify-content-between align-items-center">
      <div>
        <button class="btn btn-sm btn-outline-secondary me-2" onclick="_admConfirmLeave()">
          <i class="bi bi-arrow-left"></i></button>
        <strong>招生申请表</strong>
        <small class="text-muted ms-2">第 ${step}/${totalSteps} 步 — ${stepTitles[step]}</small>
      </div>
      <button class="btn btn-sm btn-outline-secondary" onclick="_admSaveDraft(true)">
        <i class="bi bi-floppy me-1"></i>保存草稿</button>
    </div>

    <div class="progress mb-4" style="height:8px">
      <div class="progress-bar" style="width:${pct}%"></div>
    </div>

    <!-- Step nav pills -->
    <div class="d-flex flex-wrap gap-1 mb-4">
      ${Array.from({length: totalSteps}, (_,i) => i+1).map(s => `
        <span class="badge ${s===step?'bg-primary':s<step?'bg-success':'bg-light text-dark'}"
          style="cursor:${s<=AdmState.draft.step_completed+1?'pointer':'default'}"
          onclick="${s<=AdmState.draft.step_completed+1?`_admGoToStep(${s})`:''}">
          ${s}</span>
      `).join('')}
    </div>

    <div id="adm-step-content">
      ${_admStepContent(step)}
    </div>

    <div class="d-flex justify-content-between mt-4 pt-3 border-top">
      ${step > 1
        ? `<button class="btn btn-outline-secondary" onclick="_admPrevStep()"><i class="bi bi-arrow-left me-1"></i>上一步</button>`
        : `<div></div>`}
      ${step < totalSteps
        ? `<button class="btn btn-primary" onclick="_admNextStep()">下一步<i class="bi bi-arrow-right ms-1"></i></button>`
        : `<button class="btn btn-success" onclick="_admFinalSubmit()"><i class="bi bi-send me-1"></i>正式提交</button>`}
    </div>
  `;

  // Re-init signature canvas if on step 11
  if (step === 11) { setTimeout(_admInitSignatureCanvases, 100); }
}

function _admStepContent(step) {
  const d = AdmState.draft;
  const tf = (name, label, val, required=false, type='text') =>
    `<div class="col-md-6 mb-3">
      <label class="form-label fw-semibold small">${label}${required?'<span class="text-danger ms-1">*</span>':''}</label>
      <input type="${type}" class="form-control form-control-sm adm-field" name="${name}" value="${escapeHtml(String(val||''))}">
    </div>`;
  const sel = (name, label, options, val, required=false) =>
    `<div class="col-md-6 mb-3">
      <label class="form-label fw-semibold small">${label}${required?'<span class="text-danger ms-1">*</span>':''}</label>
      <select class="form-select form-select-sm adm-field" name="${name}">
        <option value="">— 请选择 —</option>
        ${options.map(o => typeof o==='string'
          ? `<option value="${o}" ${val===o?'selected':''}>${o}</option>`
          : `<option value="${o[0]}" ${val===o[0]?'selected':''}>${o[1]}</option>`
        ).join('')}
      </select>
    </div>`;
  const chk = (name, label, val) =>
    `<div class="col-md-6 mb-3 d-flex align-items-center gap-2">
      <input type="checkbox" class="form-check-input adm-field" name="${name}" id="adm_${name}" ${val?'checked':''}>
      <label class="form-check-label small" for="adm_${name}">${label}</label>
    </div>`;

  // ── Steps 1–11 HTML ──
  switch(step) {
    case 1: return `<div class="row">
      ${sel('source_type','案例来源 *',[['staff','Staff 直接创建'],['agent','中介送来']],d.source_type,true)}
      ${d.source_type==='agent' ? tf('agent_id','中介 ID',d.agent_id) : '<div class="col-md-6"></div>'}
      ${tf('course_name','课程名称 *',d.course_name,true)}
      ${tf('course_code','课程代码',d.course_code)}
      ${tf('intake_year','入学年 *',d.intake_year,true)}
      ${sel('intake_month','入学月份',['January','February','March','April','May','June','July','August','September','October','November','December'],d.intake_month)}
      ${sel('study_mode','学习模式',['Full-time','Part-time'],d.study_mode)}
      ${tf('campus','校区',d.campus)}
      ${tf('school_name','学校/机构名称',d.school_name)}
      ${tf('commencement_date','课程开始日期',d.commencement_date,false,'date')}
      ${tf('period_applied_from','申请期间（开始）',d.period_applied_from,false,'date')}
      ${tf('period_applied_to','申请期间（结束）',d.period_applied_to,false,'date')}
      ${chk('requires_student_pass','需要学生准证 (Student Pass)',d.requires_student_pass!==0)}
    </div>`;

    case 2: return `<div class="row">
      ${tf('surname','英文姓 (Surname) *',d.surname,true)}
      ${tf('given_name','英文名 (Given Name) *',d.given_name,true)}
      ${tf('chinese_name','中文姓名',d.chinese_name)}
      ${sel('gender','性别 *',['Male','Female','Other'],d.gender,true)}
      ${tf('dob','出生日期 *',d.dob,true,'date')}
      ${tf('birth_country','出生国家 *',d.birth_country,true)}
      ${tf('birth_city','出生城市',d.birth_city)}
      ${tf('nationality','国籍 *',d.nationality,true)}
      ${tf('race','种族',d.race)}
      ${tf('religion','宗教',d.religion)}
      ${sel('marital_status','婚姻状况 *',['Single','Married','Divorced','Widowed'],d.marital_status,true)}
      ${tf('occupation','职业',d.occupation)}
    </div>`;

    case 3: return `<div class="row">
      ${sel('passport_type','证件类型 *',[['Passport','护照'],['Travel Document','旅行证件'],['IC','身份证']],d.passport_type,true)}
      ${tf('passport_no','护照/证件号码 *',d.passport_no,true)}
      ${tf('passport_issue_date','签发日期',d.passport_issue_date,false,'date')}
      ${tf('passport_expiry','到期日期 *',d.passport_expiry,true,'date')}
      ${tf('passport_issue_country','签发国家',d.passport_issue_country)}
      ${tf('alias','别名 / Alias',d.alias)}
      ${tf('birth_certificate_no','出生证号码',d.birth_certificate_no)}
      ${tf('birth_province_state','出生省/州 (Province/State)',d.birth_province_state)}
      ${tf('foreign_identification_no','外国身份证号 (FIN)',d.foreign_identification_no)}
      ${tf('malaysian_id_no','马来西亚身份证号 (如适用)',d.malaysian_id_no)}
      <div class="col-12"><hr><h6 class="fw-semibold text-primary">新加坡状态</h6></div>
      ${sel('sg_pass_type','在新加坡的 Pass 类型 *',[['SC','Singapore Citizen'],['PR','Permanent Resident'],['EP','Employment Pass'],['S Pass','S Pass'],['DP','Dependant Pass'],['Student Pass','Student Pass'],['None','无']],d.sg_pass_type,true)}
      ${tf('sg_nric_fin','NRIC / FIN 号码',d.sg_nric_fin)}
      ${tf('sg_pass_expiry','Pass 到期日期',d.sg_pass_expiry,false,'date')}
      ${chk('was_ever_sg_citizen_or_pr','曾经是新加坡公民或PR',d.was_ever_sg_citizen_or_pr)}
      ${chk('prior_sg_study','曾在新加坡就读',d.prior_sg_study)}
      ${d.prior_sg_study ? tf('prior_sg_school','曾就读学校',d.prior_sg_school)+tf('prior_sg_year','就读年份',d.prior_sg_year) : ''}
    </div>`;

    case 4: return `<div class="row">
      ${tf('phone_mobile','手机号码 *',d.phone_mobile,true)}
      ${tf('phone_home','家庭电话',d.phone_home)}
      ${tf('email','电子邮箱 *',d.email,true,'email')}
      ${tf('address_line1','地址第一行 *',d.address_line1,true)}
      ${tf('address_line2','地址第二行',d.address_line2)}
      ${tf('city','城市 *',d.city,true)}
      ${tf('state_province','州/省',d.state_province)}
      ${tf('postal_code','邮政编码',d.postal_code)}
      ${tf('country_of_residence','居住国家 *',d.country_of_residence,true)}
      <div class="col-12"><hr><h6 class="fw-semibold text-primary">新加坡住址（如与上方不同）</h6></div>
      ${tf('sg_address','新加坡地址',d.sg_address)}
      ${tf('sg_tel_no','新加坡电话',d.sg_tel_no)}
      <div class="col-12"><hr><h6 class="fw-semibold text-primary">家乡地址</h6></div>
      ${tf('hometown_address','家乡地址（如与上方不同）',d.hometown_address)}
    </div>`;

    case 5: return `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="fw-semibold mb-0">家庭成员</h6>
        <div class="d-flex gap-2">
          ${['father','mother','step_father','step_mother','sibling','spouse'].map(t =>
            `<button class="btn btn-sm btn-outline-primary" onclick="_admAddFamily('${t}')">+ ${t}</button>`
          ).join('')}
        </div>
      </div>
      <div id="adm-family-list">${_admRenderFamilyList()}</div>`;

    case 6: return `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="fw-semibold mb-0">近五年居住史（每个超过1年的居住地均需填写）</h6>
        <button class="btn btn-sm btn-outline-primary" onclick="_admAddRow('residence')">+ 添加</button>
      </div>
      <div id="adm-residence-list">${_admRenderArrayList('residence',
        ['country','city','address','date_from','date_to','purpose'],
        ['国家','城市','地址','开始年月','结束年月','目的']
      )}</div>`;

    case 7: return `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="fw-semibold mb-0">教育经历</h6>
        <button class="btn btn-sm btn-outline-primary" onclick="_admAddRow('education')">+ 添加</button>
      </div>
      <div id="adm-education-list">${_admRenderArrayList('education',
        ['institution_name','country','state_province','qualification','major','date_from','date_to','gpa','language_of_instruction','educational_cert_no'],
        ['学校名称','国家','省/州','学历','专业','开始','结束','GPA','教学语言','教育证书号']
      )}</div>
      <hr>
      <h6 class="fw-semibold text-primary mt-3">语言能力</h6>
      <div class="row">
        ${tf('native_language','母语',d.native_language)}
        ${sel('english_proficiency','英语水平证明',[['Native','母语'],['IELTS','雅思'],['TOEFL','托福'],['Others','其他']],d.english_proficiency)}
        ${tf('ielts_score','雅思成绩',d.ielts_score)}
        ${tf('toefl_score','托福成绩',d.toefl_score)}
        ${tf('other_lang_test','其他语言考试',d.other_lang_test)}
        ${tf('other_lang_score','其他考试成绩',d.other_lang_score)}
        ${tf('highest_lang_proficiency','最高语言能力等级',d.highest_lang_proficiency)}
        ${chk('need_english_placement_test','需要英语分级测试',d.need_english_placement_test)}
      </div>`;

    case 8: return `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="fw-semibold mb-0">工作经历（如无请留空）</h6>
        <button class="btn btn-sm btn-outline-primary" onclick="_admAddRow('employment')">+ 添加</button>
      </div>
      <div id="adm-employment-list">${_admRenderArrayList('employment',
        ['employer','country','position','date_from','date_to','reason_left','nature_of_duties'],
        ['雇主','国家','职位','开始时间','结束时间（留空=至今）','离职原因','工作职责']
      )}</div>`;

    case 9: return `<div class="row">
      ${sel('financial_source','财务来源 *',[['Self','个人自费'],['Parents','父母资助'],['Sponsor','赞助商'],['Scholarship','奖学金'],['Loan','贷款']],d.financial_source,true)}
      ${tf('annual_income','年收入/可支配资金 (SAF)',d.annual_income)}
      ${tf('sponsor_name','赞助人姓名',d.sponsor_name)}
      ${tf('sponsor_relation','赞助人关系',d.sponsor_relation)}
      ${chk('bank_statement_available','已准备银行存款证明',d.bank_statement_available)}
      <div class="col-12"><hr><h6 class="fw-semibold text-primary">详细财务信息（V36 Part F）</h6></div>
      ${tf('applicant_monthly_income','申请人月均收入 (过去6个月)',d.applicant_monthly_income)}
      ${tf('applicant_current_saving','申请人当前存款',d.applicant_current_saving)}
      ${tf('father_monthly_income','父亲月均收入',d.father_monthly_income)}
      ${tf('father_current_saving','父亲当前存款',d.father_current_saving)}
      ${tf('mother_monthly_income','母亲月均收入',d.mother_monthly_income)}
      ${tf('mother_current_saving','母亲当前存款',d.mother_current_saving)}
      ${d.marital_status==='Married' ? `
        ${tf('spouse_monthly_income','配偶月均收入',d.spouse_monthly_income)}
        ${tf('spouse_current_saving','配偶当前存款',d.spouse_current_saving)}
      ` : ''}
      ${chk('other_financial_support','有其他经济来源',d.other_financial_support)}
      ${d.other_financial_support ? `
        ${tf('other_financial_details','其他来源详情',d.other_financial_details)}
        ${tf('other_financial_amount','其他来源金额',d.other_financial_amount)}
      ` : ''}
    </div>`;

    case 10: {
      const dob = d.dob ? new Date(d.dob) : null;
      const age = dob ? Math.floor((Date.now() - dob) / (365.25*24*3600*1000)) : 99;
      const isMinor = age < 18;
      const isMarried = d.marital_status === 'Married';
      const scPrParents = (AdmState.family||[]).filter(m =>
        ['father','mother','step_father','step_mother'].includes(m.member_type) &&
        ['SC','PR'].includes(m.sg_status)
      );
      const spouse = (AdmState.family||[]).find(m => m.member_type==='spouse');
      const scPrSpouse = spouse && ['SC','PR'].includes(spouse?.sg_status);
      const g = AdmState.guardian || {};

      return `
        ${isMinor ? `
          <div class="alert alert-warning py-2 small"><i class="bi bi-exclamation-triangle me-1"></i>
            申请人未满18岁，<strong>监护人信息为必填</strong></div>
          <h6 class="fw-semibold text-primary mb-2">监护人信息</h6>
          <div class="row">
            ${tf('g_surname','监护人英文姓 *',g.surname,true)} ${tf('g_given_name','监护人英文名 *',g.given_name,true)}
            ${sel('g_relation','与申请人关系 *',['Father','Mother','Uncle','Aunt','Grandparent','Legal Guardian'],g.relation,true)}
            ${tf('g_dob','监护人出生日期',g.dob,false,'date')} ${tf('g_nationality','监护人国籍',g.nationality)}
            ${tf('g_nric_fin','NRIC/FIN',g.nric_fin)} ${tf('g_phone','电话 *',g.phone,true)}
            ${tf('g_email','电子邮箱',g.email,false,'email')}
            ${tf('g_address','地址',g.address)} ${tf('g_occupation','职业',g.occupation)}
            ${tf('g_employer','雇主',g.employer)} ${tf('g_passport_no','监护人护照号',g.passport_no)}
            ${sel('g_marital_status','监护人婚姻状况',['Single','Married','Divorced','Widowed'],g.marital_status)}
            ${tf('g_marriage_certificate_no','结婚证号',g.marriage_certificate_no)}
            ${tf('g_marriage_date','结婚日期',g.marriage_date,false,'date')}
            ${tf('g_divorce_certificate_no','离婚证号',g.divorce_certificate_no)}
            ${tf('g_divorce_date','离婚日期',g.divorce_date,false,'date')}
            ${chk('g_custody_of_applicant','拥有申请人监护权',g.custody_of_applicant)}
          </div><hr>` : ''}

        ${scPrParents.length > 0 ? `
          <h6 class="fw-semibold text-primary mb-2">SC/PR 父母附加信息（V36 必填）</h6>
          ${scPrParents.map(parent => {
            const ppr = (AdmState.parentPrAdditional||[]).find(x=>x.family_member_id===parent.id) || {};
            return `
              <div class="border rounded p-3 mb-3">
                <div class="fw-semibold mb-2">${parent.member_type} — ${parent.surname||''} ${parent.given_name||''} (${parent.sg_status})</div>
                <div class="row">
                  ${tf(`ppr_arrival_${parent.id}`,'首次抵达新加坡日期',ppr.arrival_date,false,'date')}
                  ${tf(`ppr_pr_cert_${parent.id}`,'PR 证书号',ppr.pr_cert_no)}
                  ${tf(`ppr_sc_cert_${parent.id}`,'SC 证书号',ppr.sc_cert_no)}
                  ${tf(`ppr_last_dep_${parent.id}`,'最后出境新加坡日期',ppr.last_departure,false,'date')}
                  ${tf(`ppr_addr_sg_${parent.id}`,'新加坡地址',ppr.address_sg)}
                  ${chk(`ppr_is_residing_${parent.id}`,'目前居住在新加坡',ppr.is_residing_sg)}
                  <div class="col-12"><hr class="my-2"><small class="text-muted fw-semibold">婚姻信息</small></div>
                  ${sel(`ppr_marital_status_${parent.id}`,'婚姻状况',['Single','Married','Divorced','Widowed'],ppr.marital_status)}
                  ${tf(`ppr_marriage_cert_no_${parent.id}`,'结婚证号',ppr.marriage_certificate_no)}
                  ${tf(`ppr_marriage_date_${parent.id}`,'结婚日期',ppr.marriage_date,false,'date')}
                  ${tf(`ppr_divorce_cert_no_${parent.id}`,'离婚证号',ppr.divorce_certificate_no)}
                  ${tf(`ppr_divorce_date_${parent.id}`,'离婚日期',ppr.divorce_date,false,'date')}
                  ${chk(`ppr_custody_${parent.id}`,'拥有申请人监护权',ppr.custody_of_applicant)}
                  <div class="col-12"><hr class="my-2"><small class="text-muted fw-semibold">学历信息</small></div>
                  ${tf(`ppr_school_name_${parent.id}`,'学校名称',ppr.school_name)}
                  ${tf(`ppr_school_country_${parent.id}`,'学校所在国',ppr.school_country)}
                  ${tf(`ppr_highest_qual_${parent.id}`,'最高学历',ppr.highest_qualification)}
                  ${tf(`ppr_edu_cert_no_${parent.id}`,'教育证书号',ppr.educational_cert_no)}
                  <div class="col-12"><hr class="my-2"><small class="text-muted fw-semibold">工作与收入</small></div>
                  ${tf(`ppr_company_${parent.id}`,'公司/雇主',ppr.company_name)}
                  ${tf(`ppr_monthly_income_${parent.id}`,'月收入',ppr.monthly_income)}
                  ${tf(`ppr_annual_income_${parent.id}`,'年收入 (过去1年)',ppr.annual_income)}
                  ${tf(`ppr_cpf_${parent.id}`,'月均CPF (过去1年)',ppr.avg_monthly_cpf)}
                </div>
              </div>`;
          }).join('')}` : ''}

        ${isMarried && scPrSpouse ? `
          <h6 class="fw-semibold text-primary mb-2">SC/PR 配偶附加信息（V36 Part H）</h6>
          <div class="row">
            ${tf('spr_arrival','配偶首次抵达新加坡日期',(AdmState.spousePrAdditional||{}).arrival_date,false,'date')}
            ${tf('spr_pr_cert','PR 证书号',(AdmState.spousePrAdditional||{}).pr_cert_no)}
            ${tf('spr_sc_cert','SC 证书号',(AdmState.spousePrAdditional||{}).sc_cert_no)}
            ${tf('spr_last_dep','最后出境新加坡日期',(AdmState.spousePrAdditional||{}).last_departure,false,'date')}
            ${tf('spr_addr_sg','新加坡地址',(AdmState.spousePrAdditional||{}).address_sg)}
            <div class="col-12"><hr class="my-2"><small class="text-muted fw-semibold">婚姻信息</small></div>
            ${tf('spr_marriage_cert','结婚证号',(AdmState.spousePrAdditional||{}).marriage_certificate_no)}
            ${tf('spr_marriage_date','结婚日期',(AdmState.spousePrAdditional||{}).marriage_date,false,'date')}
            <div class="col-12"><hr class="my-2"><small class="text-muted fw-semibold">学历信息</small></div>
            ${tf('spr_school_name','学校名称',(AdmState.spousePrAdditional||{}).school_name)}
            ${tf('spr_school_country','学校所在国',(AdmState.spousePrAdditional||{}).school_country)}
            ${tf('spr_highest_qual','最高学历',(AdmState.spousePrAdditional||{}).highest_qualification)}
            ${tf('spr_edu_cert_no','教育证书号',(AdmState.spousePrAdditional||{}).educational_cert_no)}
            <div class="col-12"><hr class="my-2"><small class="text-muted fw-semibold">工作与收入</small></div>
            ${tf('spr_company','公司/雇主',(AdmState.spousePrAdditional||{}).company_name)}
            ${tf('spr_monthly_income','月收入',(AdmState.spousePrAdditional||{}).monthly_income)}
            ${tf('spr_annual_income','年收入 (过去1年)',(AdmState.spousePrAdditional||{}).annual_income)}
            ${tf('spr_cpf','月均CPF (过去1年)',(AdmState.spousePrAdditional||{}).avg_monthly_cpf)}
          </div>` : ''}

        ${!isMinor && scPrParents.length===0 && !(isMarried && scPrSpouse) ?
          `<div class="alert alert-info small">本步骤无需填写额外信息（申请人已满18岁，且无 SC/PR 亲属/配偶）。</div>` : ''}
      `;
    }

    case 11: {
      const antLabels = [
        '您是否曾被任何国家拒签、拒绝入境或被要求离境？',
        '您是否曾被任何国家驱逐出境？',
        '您是否在任何国家有犯罪记录？',
        '您目前是否患有任何传染病或传染性疾病？',
      ];
      const d = AdmState.draft;
      return `
        <h6 class="fw-semibold text-primary mb-3">Antecedent（背景申报）</h6>
        ${[1,2,3,4].map(i => `
          <div class="mb-3 p-3 border rounded bg-light">
            <div class="fw-semibold small mb-2">${i}. ${antLabels[i-1]}</div>
            <div class="d-flex gap-3">
              ${['是 (Yes)','否 (No)'].map((lbl, vi) => `
                <div class="form-check">
                  <input type="radio" class="form-check-input adm-field" name="antecedent_q${i}"
                    id="antQ${i}_${vi}" value="${vi===0?1:0}" ${(d[`antecedent_q${i}`]?1:0)===(vi===0?1:0)?'checked':''}>
                  <label class="form-check-label small" for="antQ${i}_${vi}">${lbl}</label>
                </div>`).join('')}
            </div>
          </div>`).join('')}
        <div id="antecedent-remarks-container" class="${(d.antecedent_q1||d.antecedent_q2||d.antecedent_q3||d.antecedent_q4)?'':'d-none'}">
          <label class="form-label fw-semibold small">Antecedent 详情（有任一"是"时必填）<span class="text-danger">*</span></label>
          <textarea class="form-control form-control-sm adm-field" name="antecedent_remarks" rows="3">${escapeHtml(d.antecedent_remarks||'')}</textarea>
        </div>
        <hr>
        <h6 class="fw-semibold text-primary mb-3">PDPA 同意书</h6>
        <div class="alert alert-light border small mb-3">
          本机构将收集、使用及披露您的个人数据，用于处理您的申请、管理您的学习及相关事宜。
        </div>
        ${chk('pdpa_consent','我已阅读并同意 PDPA 个人数据保护条款 *',d.pdpa_consent!==0)}
        ${chk('pdpa_marketing','我同意将我的数据用于营销和宣传目的',d.pdpa_marketing!==0)}
        ${chk('pdpa_photo_video','我同意将我的照片/视频用于营销和宣传目的',d.pdpa_photo_video!==0)}
        <hr>
        <h6 class="fw-semibold text-primary mb-3">签字</h6>
        <div class="row">
          <div class="col-md-6">
            <label class="form-label fw-semibold small">申请人签字 <span class="text-danger">*</span></label>
            <canvas id="sig-canvas-applicant" width="340" height="120"
              class="border rounded bg-white d-block" style="touch-action:none"></canvas>
            <div class="d-flex gap-2 mt-1">
              <button class="btn btn-sm btn-outline-secondary" onclick="_admClearSig('applicant')">清空重签</button>
              <button class="btn btn-sm btn-outline-primary" onclick="_admSaveSig('applicant')">保存签字</button>
            </div>
            <div class="mt-2">
              <label class="form-label small">签字日期 *</label>
              <input type="date" class="form-control form-control-sm" id="sig-date-applicant"
                value="${AdmState.signatures.applicant?.sig_date || new Date().toISOString().split('T')[0]}">
            </div>
            ${AdmState.signatures.applicant?.file_id
              ? `<div class="text-success small mt-1"><i class="bi bi-check-circle me-1"></i>申请人签字已保存</div>` : ''}
          </div>
          ${(() => {
            const dob = AdmState.draft.dob ? new Date(AdmState.draft.dob) : null;
            const age = dob ? Math.floor((Date.now()-dob)/(365.25*24*3600*1000)) : 99;
            if (age < 18) return `
              <div class="col-md-6">
                <label class="form-label fw-semibold small">监护人签字 <span class="text-danger">*</span></label>
                <canvas id="sig-canvas-guardian" width="340" height="120"
                  class="border rounded bg-white d-block" style="touch-action:none"></canvas>
                <div class="d-flex gap-2 mt-1">
                  <button class="btn btn-sm btn-outline-secondary" onclick="_admClearSig('guardian')">清空重签</button>
                  <button class="btn btn-sm btn-outline-primary" onclick="_admSaveSig('guardian')">保存签字</button>
                </div>
                <div class="mt-2">
                  <label class="form-label small">签字日期</label>
                  <input type="date" class="form-control form-control-sm" id="sig-date-guardian"
                    value="${AdmState.signatures.guardian?.sig_date || new Date().toISOString().split('T')[0]}">
                </div>
                ${AdmState.signatures.guardian?.file_id
                  ? `<div class="text-success small mt-1"><i class="bi bi-check-circle me-1"></i>监护人签字已保存</div>` : ''}
              </div>`;
            return '';
          })()}
        </div>`;
    }

    default: return '<div class="alert alert-warning">未知步骤</div>';
  }
}

// ─── Family list render ────────────────────────────────────────────────────
function _admRenderFamilyList() {
  if (AdmState.family.length === 0) return '<div class="text-muted small py-2">暂无家庭成员，请点击上方按钮添加</div>';
  return AdmState.family.map((m, i) => `
    <div class="border rounded p-3 mb-2 bg-light">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <strong class="small">${m.member_type || '成员'} ${i+1}</strong>
        <button class="btn btn-sm btn-outline-danger" onclick="_admDeleteFamily('${m.id||''}',${i})">
          <i class="bi bi-trash"></i></button>
      </div>
      <div class="row g-2">
        <div class="col-4"><input class="form-control form-control-sm" placeholder="英文姓" value="${escapeHtml(m.surname||'')}"
          oninput="AdmState.family[${i}].surname=this.value"></div>
        <div class="col-4"><input class="form-control form-control-sm" placeholder="英文名" value="${escapeHtml(m.given_name||'')}"
          oninput="AdmState.family[${i}].given_name=this.value"></div>
        <div class="col-4"><input class="form-control form-control-sm" type="date" placeholder="出生日期" value="${m.dob||''}"
          oninput="AdmState.family[${i}].dob=this.value"></div>
        <div class="col-3"><input class="form-control form-control-sm" placeholder="国籍" value="${escapeHtml(m.nationality||'')}"
          oninput="AdmState.family[${i}].nationality=this.value"></div>
        <div class="col-3">
          <select class="form-select form-select-sm" oninput="AdmState.family[${i}].sg_status=this.value">
            ${['—','SC','PR','EP','S Pass','DP','Student Pass','None'].map(opt =>
              `<option value="${opt==='—'?'':opt}" ${m.sg_status===opt?'selected':''}>${opt}</option>`).join('')}
          </select>
        </div>
        <div class="col-3"><input class="form-control form-control-sm" placeholder="NRIC/FIN" value="${escapeHtml(m.nric_fin||'')}"
          oninput="AdmState.family[${i}].nric_fin=this.value"></div>
        <div class="col-3"><input class="form-control form-control-sm" placeholder="职业" value="${escapeHtml(m.occupation||'')}"
          oninput="AdmState.family[${i}].occupation=this.value"></div>
        <div class="col-2">
          <select class="form-select form-select-sm" oninput="AdmState.family[${i}].sex=this.value">
            <option value="">性别</option>
            <option value="Male" ${m.sex==='Male'?'selected':''}>Male</option>
            <option value="Female" ${m.sex==='Female'?'selected':''}>Female</option>
          </select>
        </div>
        <div class="col-3"><input class="form-control form-control-sm" placeholder="SG手机" value="${escapeHtml(m.sg_mobile||'')}"
          oninput="AdmState.family[${i}].sg_mobile=this.value"></div>
        <div class="col-3"><input class="form-control form-control-sm" placeholder="邮箱" value="${escapeHtml(m.email||'')}"
          oninput="AdmState.family[${i}].email=this.value"></div>
        <div class="col-4"><input class="form-control form-control-sm" placeholder="护照号" value="${escapeHtml(m.passport_no||'')}"
          oninput="AdmState.family[${i}].passport_no=this.value"></div>
        ${m.member_type==='sibling'?`<div class="col-4"><input class="form-control form-control-sm" placeholder="关系(Brother/Sister)" value="${escapeHtml(m.relationship||'')}" oninput="AdmState.family[${i}].relationship=this.value"></div>`:''}
      </div>
    </div>`).join('');
}

async function _admAddFamily(memberType) {
  try {
    const res = await POST(`/api/adm-profiles/${AdmState.profileId}/family`, { member_type: memberType, sort_order: AdmState.family.length });
    AdmState.family.push({ id: res.id, member_type: memberType, sort_order: AdmState.family.length });
    document.getElementById('adm-family-list').innerHTML = _admRenderFamilyList();
  } catch(e) { showError('添加失败: ' + e.message); }
}

async function _admDeleteFamily(id, idx) {
  if (!id) { AdmState.family.splice(idx,1); document.getElementById('adm-family-list').innerHTML = _admRenderFamilyList(); return; }
  try {
    await DEL(`/api/adm-family/${id}`);
    AdmState.family.splice(idx,1);
    document.getElementById('adm-family-list').innerHTML = _admRenderFamilyList();
  } catch(e) { showError('删除失败'); }
}

function _admRenderArrayList(entity, fields, labels) {
  const items = AdmState[entity];
  if (!items.length) return `<div class="text-muted small py-2">暂无记录</div>`;
  return items.map((row, i) => `
    <div class="border rounded p-2 mb-2 bg-light">
      <div class="d-flex justify-content-end mb-1">
        <button class="btn btn-sm btn-outline-danger" onclick="_admDeleteArrayItem('${entity}','${row.id||''}',${i})">
          <i class="bi bi-trash"></i></button>
      </div>
      <div class="row g-2">
        ${fields.map((f, fi) => `
          <div class="col">
            <label class="form-label form-label-sm mb-0 text-muted" style="font-size:10px">${labels[fi]}</label>
            <input class="form-control form-control-sm" value="${escapeHtml(String(row[f]||''))}"
              oninput="AdmState['${entity}'][${i}]['${f}']=this.value">
          </div>`).join('')}
      </div>
    </div>`).join('');
}

async function _admAddRow(entity) {
  const tableMap = { residence:'adm_residence_history', education:'adm_education_history', employment:'adm_employment_history' };
  try {
    const res = await POST(`/api/adm-profiles/${AdmState.profileId}/${entity}`, { sort_order: AdmState[entity].length });
    AdmState[entity].push({ id: res.id, sort_order: AdmState[entity].length });
    const fieldsMap = {
      residence: ['country','city','address','date_from','date_to','purpose'],
      education: ['institution_name','country','qualification','major','date_from','date_to','gpa'],
      employment: ['employer','country','position','date_from','date_to','reason_left'],
    };
    const labelsMap = {
      residence: ['国家','城市','地址','开始年月','结束年月','目的'],
      education: ['学校名称','国家','学历','专业','开始时间','结束时间','GPA'],
      employment: ['雇主','国家','职位','开始时间','结束时间','离职原因'],
    };
    document.getElementById(`adm-${entity}-list`).innerHTML = _admRenderArrayList(entity, fieldsMap[entity], labelsMap[entity]);
  } catch(e) { showError('添加失败: ' + e.message); }
}

async function _admDeleteArrayItem(entity, id, idx) {
  if (id) {
    try { await DEL(`/api/adm-${entity}/${id}`); } catch(e) { showError('删除失败'); return; }
  }
  AdmState[entity].splice(idx, 1);
  const fieldsMap = {
    residence: ['country','city','address','date_from','date_to','purpose'],
    education: ['institution_name','country','qualification','major','date_from','date_to','gpa'],
    employment: ['employer','country','position','date_from','date_to','reason_left'],
  };
  const labelsMap = {
    residence: ['国家','城市','地址','开始年月','结束年月','目的'],
    education: ['学校名称','国家','学历','专业','开始时间','结束时间','GPA'],
    employment: ['雇主','国家','职位','开始时间','结束时间','离职原因'],
  };
  document.getElementById(`adm-${entity}-list`).innerHTML = _admRenderArrayList(entity, fieldsMap[entity], labelsMap[entity]);
}

// ─── Collect fields from DOM into AdmState.draft ───────────────────────────
function _admCollectFields() {
  document.querySelectorAll('.adm-field').forEach(el => {
    const name = el.name;
    if (!name) return;
    if (el.type === 'checkbox') {
      AdmState.draft[name] = el.checked ? 1 : 0;
    } else if (el.type === 'radio') {
      if (el.checked) AdmState.draft[name] = Number(el.value);
    } else {
      AdmState.draft[name] = el.value;
    }
  });

  // Show/hide antecedent remarks
  const anyAnt = [1,2,3,4].some(i => AdmState.draft[`antecedent_q${i}`]);
  const rc = document.getElementById('antecedent-remarks-container');
  if (rc) rc.classList.toggle('d-none', !anyAnt);
}

// ─── Save draft (main profile fields only) ────────────────────────────────
async function _admSaveDraft(showToast = false) {
  _admCollectFields();
  const body = { ...AdmState.draft };
  // Remove sub-arrays/objects (handled separately)
  ['family','residence','education','employment','guardian','parentPrAdditional','spousePrAdditional','signatures','documents'].forEach(k => delete body[k]);

  try {
    await PUT(`/api/adm-profiles/${AdmState.profileId}`, body);
    if (showToast) showSuccess('草稿已保存');

    // Save guardian if on step 10 and is minor
    await _admSaveStep10Conditional();

  } catch(e) { if (showToast) showError('保存失败: ' + e.message); }
}

async function _admSaveStep10Conditional() {
  const dob = AdmState.draft.dob ? new Date(AdmState.draft.dob) : null;
  const age = dob ? Math.floor((Date.now()-dob)/(365.25*24*3600*1000)) : 99;

  // Save guardian
  if (age < 18) {
    const guardianFields = ['surname','given_name','relation','dob','nationality','sg_status','nric_fin','phone','email','address','occupation','employer',
      'passport_no','marital_status','marriage_certificate_no','marriage_date','divorce_certificate_no','divorce_date'];
    const gBody = {};
    guardianFields.forEach(f => {
      const el = document.querySelector(`[name="g_${f}"]`);
      if (el) gBody[f] = el.value;
    });
    const gCustEl = document.querySelector('[name="g_custody_of_applicant"]');
    if (gCustEl) gBody.custody_of_applicant = gCustEl.checked ? 1 : 0;
    if (Object.keys(gBody).length > 0) {
      try { await PUT(`/api/adm-profiles/${AdmState.profileId}/guardian`, gBody); } catch(e) {}
    }
  }

  // Save parent PR additional
  const scPrParents = (AdmState.family||[]).filter(m =>
    ['father','mother','step_father','step_mother'].includes(m.member_type) && ['SC','PR'].includes(m.sg_status)
  );
  for (const parent of scPrParents) {
    const body = { family_member_id: parent.id };
    // 基础字段
    const baseMap = {
      'arrival': 'arrival_date', 'pr_cert': 'pr_cert_no', 'sc_cert': 'sc_cert_no',
      'last_dep': 'last_departure', 'addr_sg': 'address_sg',
    };
    Object.entries(baseMap).forEach(([prefix, dbKey]) => {
      const el = document.querySelector(`[name="ppr_${prefix}_${parent.id}"]`);
      if (el) body[dbKey] = el.value;
    });
    const isResEl = document.querySelector(`[name="ppr_is_residing_${parent.id}"]`);
    if (isResEl) body.is_residing_sg = isResEl.checked ? 1 : 0;
    // 审计补全：婚姻/学历/工作 14 个字段
    const extMap = {
      'marital_status': 'marital_status', 'marriage_cert_no': 'marriage_certificate_no',
      'marriage_date': 'marriage_date', 'divorce_cert_no': 'divorce_certificate_no',
      'divorce_date': 'divorce_date', 'school_name': 'school_name',
      'school_country': 'school_country', 'highest_qual': 'highest_qualification',
      'edu_cert_no': 'educational_cert_no', 'company': 'company_name',
      'monthly_income': 'monthly_income', 'annual_income': 'annual_income', 'cpf': 'avg_monthly_cpf',
    };
    Object.entries(extMap).forEach(([prefix, dbKey]) => {
      const el = document.querySelector(`[name="ppr_${prefix}_${parent.id}"]`);
      if (el) body[dbKey] = el.value;
    });
    const custEl = document.querySelector(`[name="ppr_custody_${parent.id}"]`);
    if (custEl) body.custody_of_applicant = custEl.checked ? 1 : 0;
    const existing = (AdmState.parentPrAdditional||[]).find(x=>x.family_member_id===parent.id);
    try {
      if (existing) { await PUT(`/api/adm-parent-pr/${existing.id}`, body); }
      else { const r = await POST(`/api/adm-profiles/${AdmState.profileId}/parent-pr`, body); if (r.id) AdmState.parentPrAdditional.push({...body, id: r.id}); }
    } catch(e) {}
  }

  // Save spouse PR additional
  const spouse = (AdmState.family||[]).find(m => m.member_type==='spouse');
  const isMarried = AdmState.draft.marital_status === 'Married';
  if (isMarried && spouse && ['SC','PR'].includes(spouse.sg_status)) {
    const sprBody = {};
    const sprMap = {
      'spr_arrival': 'arrival_date', 'spr_pr_cert': 'pr_cert_no', 'spr_sc_cert': 'sc_cert_no',
      'spr_last_dep': 'last_departure', 'spr_addr_sg': 'address_sg',
      'spr_marriage_cert': 'marriage_certificate_no', 'spr_marriage_date': 'marriage_date',
      'spr_school_name': 'school_name', 'spr_school_country': 'school_country',
      'spr_highest_qual': 'highest_qualification', 'spr_edu_cert_no': 'educational_cert_no',
      'spr_company': 'company_name', 'spr_monthly_income': 'monthly_income',
      'spr_annual_income': 'annual_income', 'spr_cpf': 'avg_monthly_cpf',
    };
    Object.entries(sprMap).forEach(([formName, dbKey]) => {
      const el = document.querySelector(`[name="${formName}"]`);
      if (el) sprBody[dbKey] = el.value;
    });
    if (spouse.id) sprBody.family_member_id = spouse.id;
    try { await PUT(`/api/adm-profiles/${AdmState.profileId}/spouse-pr`, sprBody); } catch(e) {}
  }
}

// ─── Save sub-array rows to API ────────────────────────────────────────────
async function _admSaveArrayRows(entity) {
  const tableEntityMap = { family:'family', residence:'residence', education:'education', employment:'employment' };
  for (const row of AdmState[entity]) {
    if (!row.id) continue;
    try { await PUT(`/api/adm-${entity}/${row.id}`, row); } catch(e) {}
  }
}

// ─── Navigation ────────────────────────────────────────────────────────────
async function _admNextStep() {
  // Validate current step required fields
  const errors = _admValidateStep(AdmState.step);
  if (errors.length) { showError(errors.join('\n')); return; }

  await _admSaveDraft();
  // Save array sub-data for relevant steps
  const arraySteps = { 5:'family', 6:'residence', 7:'education', 8:'employment' };
  if (arraySteps[AdmState.step]) {
    await _admSaveArrayRows(arraySteps[AdmState.step]);
  }

  AdmState.step++;
  AdmState.draft.step_completed = Math.max(AdmState.draft.step_completed || 0, AdmState.step - 1);
  _admRenderStep();
}

function _admPrevStep() { AdmState.step--; _admRenderStep(); }
function _admGoToStep(n) { if (n <= (AdmState.draft.step_completed||0)+1) { AdmState.step=n; _admRenderStep(); } }
function _admConfirmLeave() {
  if (confirm('离开向导？草稿已自动保存，下次可继续填写。')) renderAdmProfiles();
}

// ─── Validation ────────────────────────────────────────────────────────────
function _admValidateStep(step) {
  _admCollectFields();
  const d = AdmState.draft;
  const errs = [];
  if (step===1) { if (!d.course_name) errs.push('请填写课程名称'); if (!d.intake_year) errs.push('请填写入学年'); }
  if (step===2) { ['surname','given_name','gender','dob','nationality','marital_status'].forEach(f => { if (!d[f]) errs.push(`请填写 ${f}`); }); }
  if (step===3) { if (!d.passport_no) errs.push('请填写护照号码'); if (!d.passport_expiry) errs.push('请填写护照到期日期'); if (!d.sg_pass_type) errs.push('请选择新加坡 Pass 类型'); }
  if (step===4) { if (!d.phone_mobile) errs.push('请填写手机号码'); if (!d.email) errs.push('请填写邮箱'); if (!d.address_line1) errs.push('请填写地址'); }
  if (step===11) {
    if (!d.pdpa_consent) errs.push('请同意 PDPA 条款');
    const dob = d.dob ? new Date(d.dob) : null;
    const age = dob ? Math.floor((Date.now()-dob)/(365.25*24*3600*1000)) : 99;
    if (age < 18 && !AdmState.signatures.guardian?.file_id) errs.push('申请人未满18岁，需要监护人签字');
  }
  return errs;
}

// ─── Signature canvas ──────────────────────────────────────────────────────
const _sigData = {};

function _admInitSignatureCanvases() {
  ['applicant','guardian'].forEach(type => {
    const canvas = document.getElementById(`sig-canvas-${type}`);
    if (!canvas) return;
    _sigData[type] = { paths: [], drawing: false, ctx: canvas.getContext('2d') };
    const ctx = _sigData[type].ctx;
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches ? e.touches[0] : e;
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };

    canvas.addEventListener('mousedown',  e => { _sigData[type].drawing = true; const p=getPos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); _sigData[type].paths.push([p]); });
    canvas.addEventListener('mousemove',  e => { if (!_sigData[type].drawing) return; const p=getPos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); _sigData[type].paths[_sigData[type].paths.length-1].push(p); });
    canvas.addEventListener('mouseup',    () => { _sigData[type].drawing = false; });
    canvas.addEventListener('mouseleave', () => { _sigData[type].drawing = false; });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); _sigData[type].drawing=true; const p=getPos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); _sigData[type].paths.push([p]); });
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); if (!_sigData[type].drawing) return; const p=getPos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); _sigData[type].paths[_sigData[type].paths.length-1].push(p); });
    canvas.addEventListener('touchend',   () => { _sigData[type].drawing = false; });
  });
}

function _admClearSig(type) {
  const canvas = document.getElementById(`sig-canvas-${type}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (_sigData[type]) _sigData[type].paths = [];
}

async function _admSaveSig(type) {
  const canvas = document.getElementById(`sig-canvas-${type}`);
  if (!canvas) return;
  if (!_sigData[type]?.paths?.length) { showError('请先在画布上签字'); return; }

  const dateEl = document.getElementById(`sig-date-${type}`);
  const sigDate = dateEl ? dateEl.value : new Date().toISOString().split('T')[0];
  const strokeJson = JSON.stringify(_sigData[type].paths);

  canvas.toBlob(async (blob) => {
    const signerName = type === 'applicant'
      ? `${AdmState.draft.surname||''} ${AdmState.draft.given_name||''}`.trim()
      : `${AdmState.guardian?.surname||''} ${AdmState.guardian?.given_name||''}`.trim();

    const form = new FormData();
    form.append('file', blob, `signature_${type}.png`);
    form.append('sig_type', type);
    form.append('signer_name', signerName);
    form.append('sig_date', sigDate);
    form.append('stroke_json', strokeJson);

    try {
      const res = await fetch(`/api/adm-profiles/${AdmState.profileId}/signature`, {
        method: 'POST', body: form,
      });
      if (!res.ok) throw new Error('上传失败');
      const data = await res.json();
      AdmState.signatures[type] = { file_id: data.file_id, sig_date: sigDate };
      showSuccess(`${type === 'applicant' ? '申请人' : '监护人'}签字已保存`);
      // Refresh the step to show saved indicator
      _admRenderStep();
    } catch(e) { showError('签字保存失败: ' + e.message); }
  }, 'image/png');
}

// ─── Final submit ───────────────────────────────────────────────────────────
async function _admFinalSubmit() {
  const errors = _admValidateStep(11);
  if (errors.length) { showError(errors.join('\n')); return; }

  if (!AdmState.signatures.applicant?.file_id) {
    showError('请保存申请人签字后再提交');
    return;
  }

  if (!confirm('确认正式提交申请表？提交后将自动生成三份正式文件（SAF / Form 16 / V36），无法再修改。')) return;

  const lockKey = `adm-submit-${AdmState.profileId}`;
  if (!acquireSubmit(lockKey)) return;
  try {
    await _admSaveDraft();
    const res = await POST(`/api/adm-profiles/${AdmState.profileId}/submit`, {
      submit_mode: 'manual',
    });
    showSuccess('提交成功！文件生成中，请稍后在案例页面查看。');
    navigate('adm-profiles');
  } catch(e) {
    showError('提交失败: ' + e.message);
  } finally {
    releaseSubmit(lockKey);
  }
}

document.addEventListener('DOMContentLoaded', start);
