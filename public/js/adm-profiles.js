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
    navigate('intake-cases');
  } catch(e) {
    showError('提交失败: ' + e.message);
  } finally {
    releaseSubmit(lockKey);
  }
}
