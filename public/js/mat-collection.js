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
                  onclick="navigate('intake-cases',{requestId:'${r.id}'})">详情</button>
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
  if (!id) { navigate('intake-cases'); return; }
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
        <button class="btn btn-sm btn-outline-secondary me-2" onclick="navigate('intake-cases')">
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
    navigate('intake-cases');
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

// ── 中介公司管理（已合并代理管理）──────────────────────
async function renderMatCompanies() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';
  let companies = [];
  try { companies = await GET('/api/mat-companies'); }
  catch(e) { main.innerHTML = `<div class="alert alert-danger m-4">加载失败: ${escapeHtml(e.message)}</div>`; return; }

  const typeBadge = t => t === 'agency' ? '<span class="badge bg-primary">机构代理</span>'
    : t === 'personal_referral' ? '<span class="badge bg-info">个人推荐</span>'
    : `<span class="badge bg-secondary">${escapeHtml(t||'未分类')}</span>`;

  main.innerHTML = `
    <div class="page-header mb-4">
      <h4><i class="bi bi-building me-2"></i>中介 / 代理管理</h4>
      <div class="page-header-actions">
        <button class="btn btn-primary btn-sm" onclick="openAddMatCompanyModal()">
          <i class="bi bi-plus-lg me-1"></i>新增
        </button>
      </div>
    </div>
    <div class="table-responsive">
      <table class="table table-hover align-middle">
        <thead class="table-light">
          <tr><th>名称</th><th>类型</th><th>联系方式</th><th>城市</th><th>国家</th><th>合同日期</th><th>联系人</th><th>活跃请求</th><th>操作</th></tr>
        </thead>
        <tbody>
          ${companies.length ? companies.map(c => `<tr>
            <td class="fw-semibold">${escapeHtml(c.name)}</td>
            <td>${typeBadge(c.type)}</td>
            <td class="small">${escapeHtml(c.email || c.contact || '—')}</td>
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
          </tr>`).join('') : '<tr><td colspan="9" class="text-center text-muted py-4">暂无中介/代理</td></tr>'}
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

    <!-- 新增公司/代理弹窗 -->
    <div class="modal fade" id="addMatCompanyModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">新增中介 / 代理</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3"><label class="form-label fw-semibold">名称 *</label>
              <input type="text" class="form-control" id="mcName"></div>
            <div class="row g-2 mb-3">
              <div class="col"><label class="form-label">类型</label>
                <select class="form-select" id="mcType">
                  <option value="agency">机构代理</option>
                  <option value="personal_referral">个人推荐</option>
                </select></div>
              <div class="col"><label class="form-label">联系人</label>
                <input type="text" class="form-control" id="mcContact"></div>
            </div>
            <div class="row g-2 mb-3">
              <div class="col"><label class="form-label">邮箱</label>
                <input type="email" class="form-control" id="mcEmail"></div>
              <div class="col"><label class="form-label">电话</label>
                <input type="text" class="form-control" id="mcPhone"></div>
            </div>
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
  ['matCompanyDetailModal', 'addMatCompanyModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.dataset.renderedModal = '1'; document.body.appendChild(el); }
  });
}

function openAddMatCompanyModal() {
  ['mcName','mcCity','mcCountry','mcNotes','mcContact','mcEmail','mcPhone'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  const typeSel = document.getElementById('mcType'); if (typeSel) typeSel.value = 'agency';
  const dateSel = document.getElementById('mcAgreementDate'); if (dateSel) dateSel.value = '';
  const el = document.getElementById('addMatCompanyModal');
  if (el) bootstrap.Modal.getOrCreateInstance(el).show();
}

async function submitAddMatCompany() {
  const name = document.getElementById('mcName')?.value?.trim();
  if (!name) { showError('名称必填'); return; }
  try {
    await POST('/api/mat-companies', {
      name,
      type: document.getElementById('mcType')?.value || 'agency',
      contact: document.getElementById('mcContact')?.value?.trim() || null,
      email: document.getElementById('mcEmail')?.value?.trim() || null,
      phone: document.getElementById('mcPhone')?.value?.trim() || null,
      city: document.getElementById('mcCity')?.value?.trim() || null,
      country: document.getElementById('mcCountry')?.value?.trim() || null,
      agreement_date: document.getElementById('mcAgreementDate')?.value || null,
      notes: document.getElementById('mcNotes')?.value?.trim() || null,
    });
    bootstrap.Modal.getInstance(document.getElementById('addMatCompanyModal'))?.hide();
    showSuccess('已添加');
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
