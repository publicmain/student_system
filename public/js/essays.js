// ══════════════════════════════════════════════════════
//  文书管理与协作系统 — 前端 UI
// ══════════════════════════════════════════════════════

const ESSAY_TYPE_LABELS = {
  main: '主文书', supplement: '补充文书', personal_statement: 'Personal Statement',
  why_school: 'Why School', diversity: '多元化', activity: '活动文书',
};
const ESSAY_STATUS_LABELS = {
  collecting_material: '素材收集', draft: '初稿', review: '审阅中',
  revision: '修改中', final: '终稿', submitted: '已提交',
};
const ESSAY_STATUS_COLORS = {
  collecting_material: 'bg-secondary', draft: 'bg-info', review: 'bg-warning text-dark',
  revision: 'bg-primary', final: 'bg-success', submitted: 'bg-dark',
};

// ── 主加载函数 ──
async function loadEssaysTab(studentId) {
  const container = document.getElementById('essays-container');
  if (!container) return;
  container.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

  try {
    const [essays, materials, stats] = await Promise.all([
      GET(`/api/students/${studentId}/essays`),
      GET(`/api/students/${studentId}/essay-materials`),
      GET(`/api/students/${studentId}/essay-stats`),
    ]);

    const canEdit = hasRole('principal','counselor','mentor');
    const canWrite = hasRole('principal','counselor','mentor','student');
    let html = '';

    // ── 进度概览 ──
    html += `<div class="row g-2 mb-3">
      <div class="col-md-2"><div class="card card-body text-center py-2"><div class="fs-4 fw-bold text-primary">${stats.total}</div><small class="text-muted">文书总数</small></div></div>
      <div class="col-md-2"><div class="card card-body text-center py-2"><div class="fs-4 fw-bold text-success">${stats.completed}</div><small class="text-muted">已完成</small></div></div>
      <div class="col-md-2"><div class="card card-body text-center py-2"><div class="fs-4 fw-bold text-warning">${stats.in_review}</div><small class="text-muted">审阅中</small></div></div>
      <div class="col-md-3"><div class="card card-body text-center py-2">
        <div class="progress" style="height:20px"><div class="progress-bar bg-success" style="width:${stats.completion_rate}%">${stats.completion_rate}%</div></div>
        <small class="text-muted">完成率</small>
      </div></div>
      <div class="col-md-3"><div class="card card-body text-center py-2"><div class="fs-4 fw-bold text-info">${stats.material_count}</div><small class="text-muted">素材数</small></div></div>
    </div>`;

    // ── 文书列表 ──
    html += `<div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="fw-semibold mb-0">文书列表</h6>
      <div class="d-flex gap-2">
        ${canWrite ? `<button class="btn btn-sm btn-outline-info" onclick="openEssayMaterialModal('${safeId(studentId)}')"><i class="bi bi-lightbulb me-1"></i>添加素材</button>` : ''}
        ${canEdit ? `<button class="btn btn-sm btn-primary" onclick="openEssayModal('${safeId(studentId)}')"><i class="bi bi-plus-lg me-1"></i>创建文书</button>` : ''}
      </div>
    </div>`;

    if (essays.length === 0) {
      html += emptyStateSm('暂无文书，点击"创建文书"开始', 'file-text');
    } else {
      // 按状态分组显示
      const statusOrder = ['review','draft','revision','collecting_material','final','submitted'];
      const sorted = [...essays].sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));

      sorted.forEach(e => {
        const wordInfo = e.latest_word_count ? `${e.latest_word_count} 词` : '未开始';
        const overLimit = e.word_limit && e.latest_word_count > e.word_limit;
        html += `<div class="card mb-2">
          <div class="card-body py-2 px-3">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <span class="badge ${ESSAY_STATUS_COLORS[e.status]||'bg-secondary'} me-1">${ESSAY_STATUS_LABELS[e.status]||e.status}</span>
                <span class="badge bg-light text-dark border me-1">${ESSAY_TYPE_LABELS[e.essay_type]||e.essay_type}</span>
                <strong>${escapeHtml(e.title || '未命名')}</strong>
                ${e.app_uni_name ? `<span class="text-muted ms-1">— ${escapeHtml(e.app_uni_name)}</span>` : ''}
              </div>
              <div class="d-flex gap-1">
                <button class="btn btn-sm btn-outline-primary py-0 px-1" onclick="openEssayDetail('${safeId(studentId)}','${safeId(e.id)}')"><i class="bi bi-eye"></i></button>
                ${canEdit ? `<button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="openEssayModal('${safeId(studentId)}','${safeId(e.id)}')"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="deleteEssay('${safeId(e.id)}','${safeId(studentId)}')"><i class="bi bi-trash"></i></button>` : ''}
              </div>
            </div>
            <div class="d-flex flex-wrap gap-3 mt-1 small text-muted">
              <span><i class="bi bi-hash me-1"></i>v${e.current_version || 0}</span>
              <span class="${overLimit?'text-danger fw-bold':''}"><i class="bi bi-type me-1"></i>${wordInfo}${e.word_limit ? ` / ${e.word_limit}` : ''}</span>
              ${e.reviewer_name ? `<span><i class="bi bi-person me-1"></i>${escapeHtml(e.reviewer_name)}</span>` : ''}
              ${e.review_deadline ? `<span><i class="bi bi-calendar me-1"></i>审阅截止: ${fmtDate(e.review_deadline)}</span>` : ''}
            </div>
            ${e.prompt ? `<div class="small text-muted mt-1 fst-italic">${escapeHtml(e.prompt.substring(0, 120))}${e.prompt.length > 120 ? '...' : ''}</div>` : ''}
          </div>
        </div>`;
      });
    }

    // ── 素材库 ──
    html += `<div class="mt-4"><h6 class="fw-semibold"><i class="bi bi-lightbulb me-1"></i>素材库 / 头脑风暴 (${materials.length})</h6>`;
    if (materials.length === 0) {
      html += emptyStateSm('暂无素材，开始记录灵感和经历', 'lightbulb');
    } else {
      const matCategories = { growth: '成长经历', academic_interest: '学术兴趣', activity: '活动经历', challenge: '挫折与成长', other: '其他' };
      materials.forEach(m => {
        html += `<div class="card mb-2">
          <div class="card-body py-2 px-3">
            <div class="d-flex justify-content-between">
              <div>
                ${m.category ? `<span class="badge bg-light text-dark border me-1">${matCategories[m.category]||m.category}</span>` : ''}
                <strong>${escapeHtml(m.title)}</strong>
                ${m.activity_name ? `<span class="text-muted ms-1">← ${escapeHtml(m.activity_name)}</span>` : ''}
              </div>
              <div class="d-flex gap-1">
                ${canWrite ? `<button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="openEssayMaterialModal('${safeId(studentId)}','${safeId(m.id)}')"><i class="bi bi-pencil"></i></button>` : ''}
                ${canWrite ? `<button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="deleteEssayMaterial('${safeId(m.id)}','${safeId(studentId)}')"><i class="bi bi-trash"></i></button>` : ''}
              </div>
            </div>
            ${m.content ? `<div class="small text-muted mt-1">${escapeHtml(m.content.substring(0, 200))}${m.content.length > 200 ? '...' : ''}</div>` : ''}
          </div>
        </div>`;
      });
    }
    html += `</div>`;

    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

// ── 文书详情（版本 + 批注）──
async function openEssayDetail(studentId, essayId) {
  try {
    const [versions, annotations] = await Promise.all([
      GET(`/api/essays/${essayId}/versions`),
      GET(`/api/essays/${essayId}/annotations`),
    ]);

    const canWrite = hasRole('principal','counselor','mentor','student');
    const latest = versions[0];
    let html = `<div class="modal fade" id="essay-detail-modal" data-rendered-modal="1"><div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">文书详情</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">`;

    // 版本列表
    html += `<div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0">版本历史 (${versions.length})</h6>
      ${canWrite ? `<button class="btn btn-sm btn-primary" onclick="openEssayVersionModal('${safeId(essayId)}','${safeId(studentId)}')"><i class="bi bi-plus-lg me-1"></i>提交新版本</button>` : ''}
    </div>`;

    if (versions.length === 0) {
      html += emptyStateSm('暂无版本，点击"提交新版本"开始写作');
    } else {
      versions.forEach((v, i) => {
        html += `<div class="card mb-2 ${i === 0 ? 'border-primary' : ''}">
          <div class="card-body py-2 px-3">
            <div class="d-flex justify-content-between">
              <div>
                <strong>v${v.version_no}</strong>
                ${i === 0 ? '<span class="badge bg-primary ms-1">最新</span>' : ''}
                <span class="text-muted ms-2">${v.word_count} 词 / ${v.char_count} 字符</span>
                ${v.creator_name ? `<span class="text-muted ms-2">by ${escapeHtml(v.creator_name)}</span>` : ''}
              </div>
              <small class="text-muted">${fmtDatetime(v.created_at)}</small>
            </div>
            ${v.change_summary ? `<div class="small text-muted mt-1"><i class="bi bi-chat-left-text me-1"></i>${escapeHtml(v.change_summary)}</div>` : ''}
            <div class="mt-1">
              <button class="btn btn-sm btn-outline-secondary py-0" onclick="toggleVersionContent('vc-${safeId(v.id)}')">查看内容</button>
              ${i < versions.length - 1 ? `<button class="btn btn-sm btn-outline-info py-0 ms-1" onclick="showVersionDiff('${safeId(essayId)}',${versions[i+1].version_no},${v.version_no})">与上版对比</button>` : ''}
            </div>
            <div id="vc-${safeId(v.id)}" class="d-none mt-2 p-2 bg-light rounded" style="white-space:pre-wrap;font-size:13px;">${escapeHtml(v.content || '')}</div>
          </div>
        </div>`;
      });
    }

    // Diff 容器
    html += `<div id="essay-diff-container" class="d-none mt-3"></div>`;

    // 批注
    html += `<hr><div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0">批注 (${annotations.length})</h6>
      ${canWrite ? `<button class="btn btn-sm btn-outline-warning" onclick="openAnnotationModal('${safeId(essayId)}','${safeId(studentId)}')"><i class="bi bi-chat-dots me-1"></i>添加批注</button>` : ''}
    </div>`;

    if (annotations.length === 0) {
      html += emptyStateSm('暂无批注');
    } else {
      annotations.forEach(a => {
        const statusBg = a.status === 'accepted' ? 'border-success' : a.status === 'rejected' ? 'border-danger' : '';
        html += `<div class="card mb-2 ${statusBg}">
          <div class="card-body py-2 px-3">
            <div class="d-flex justify-content-between">
              <div>
                <strong>${escapeHtml(a.annotator_name||'')}</strong>
                <span class="badge ${a.type==='inline'?'bg-info':'bg-secondary'} ms-1">${a.type==='inline'?'行内批注':'总评'}</span>
                <span class="badge ${a.status==='open'?'bg-warning text-dark':a.status==='accepted'?'bg-success':'bg-danger'} ms-1">${a.status==='open'?'待处理':a.status==='accepted'?'已采纳':'已拒绝'}</span>
              </div>
              <small class="text-muted">${fmtDatetime(a.created_at)}</small>
            </div>
            <div class="mt-1">${escapeHtml(a.content)}</div>
            ${a.status === 'open' && canWrite ? `<div class="mt-1">
              <button class="btn btn-sm btn-outline-success py-0" onclick="updateAnnotation('${safeId(a.id)}','accepted','${safeId(essayId)}','${safeId(studentId)}')">采纳</button>
              <button class="btn btn-sm btn-outline-danger py-0 ms-1" onclick="updateAnnotation('${safeId(a.id)}','rejected','${safeId(essayId)}','${safeId(studentId)}')">拒绝</button>
            </div>` : ''}
          </div>
        </div>`;
      });
    }

    html += `</div><div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">关闭</button></div></div></div></div>`;

    document.querySelectorAll('#essay-detail-modal').forEach(el => el.remove());
    document.body.insertAdjacentHTML('beforeend', html);
    new bootstrap.Modal(document.getElementById('essay-detail-modal')).show();
  } catch(e) { showError(e.message); }
}

function toggleVersionContent(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('d-none');
}

async function showVersionDiff(essayId, v1, v2) {
  const container = document.getElementById('essay-diff-container');
  if (!container) return;
  container.classList.remove('d-none');
  container.innerHTML = '<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div>';
  try {
    const data = await GET(`/api/essays/${essayId}/diff/${v1}/${v2}`);
    let html = `<h6 class="mb-2">版本对比: v${v1} → v${v2}</h6><div class="p-2 bg-light rounded" style="font-size:13px;line-height:1.8;">`;
    data.diff.forEach(d => {
      if (d.type === 'equal') html += `<div>${escapeHtml(d.content || '')}</div>`;
      else if (d.type === 'removed') html += `<div style="background:#fecdd3;text-decoration:line-through;">${escapeHtml(d.content || '')}</div>`;
      else if (d.type === 'added') html += `<div style="background:#bbf7d0;">${escapeHtml(d.content || '')}</div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  } catch(e) { container.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`; }
}

// ── 文书 CRUD 弹窗 ──
async function openEssayModal(studentId, essayId) {
  let essay = null;
  if (essayId) {
    try {
      const all = await GET(`/api/students/${studentId}/essays`);
      essay = all.find(e => e.id === essayId);
    } catch(e) { showError(e.message); return; }
  }

  // 获取申请列表和 staff 列表
  let applications = [], staffList = [];
  try {
    const detail = await GET(`/api/students/${studentId}`);
    applications = detail.applications || [];
    staffList = State.staffList?.length ? State.staffList : [];
  } catch(e) {}

  const title = essay ? '编辑文书' : '创建文书';
  const html = `<div class="modal fade" id="essay-modal" data-rendered-modal="1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">${title}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="row mb-2">
        <div class="col-6"><label class="form-label">文书类型 <span class="text-danger">*</span></label><select class="form-select" id="essay-type">
          ${Object.entries(ESSAY_TYPE_LABELS).map(([k,v]) => `<option value="${k}" ${essay?.essay_type===k?'selected':''}>${v}</option>`).join('')}
        </select></div>
        <div class="col-6"><label class="form-label">状态</label><select class="form-select" id="essay-status">
          ${Object.entries(ESSAY_STATUS_LABELS).map(([k,v]) => `<option value="${k}" ${essay?.status===k?'selected':''}>${v}</option>`).join('')}
        </select></div>
      </div>
      <div class="mb-2"><label class="form-label">标题</label><input class="form-control" id="essay-title" value="${escapeHtml(essay?.title||'')}"></div>
      <div class="mb-2"><label class="form-label">题目 / Prompt</label><textarea class="form-control" id="essay-prompt" rows="2">${escapeHtml(essay?.prompt||'')}</textarea></div>
      <div class="row mb-2">
        <div class="col-4"><label class="form-label">字数限制</label><input type="number" class="form-control" id="essay-limit" value="${essay?.word_limit||''}"></div>
        <div class="col-4"><label class="form-label">审阅截止</label><input type="date" class="form-control" id="essay-deadline" value="${essay?.review_deadline||''}"></div>
        <div class="col-4"><label class="form-label">关联申请</label><select class="form-select" id="essay-app">
          <option value="">无</option>
          ${applications.map(a => `<option value="${safeId(a.id)}" ${essay?.application_id===a.id?'selected':''}>${escapeHtml(a.uni_name)} — ${escapeHtml(a.department||'')}</option>`).join('')}
        </select></div>
      </div>
      <div class="mb-2"><label class="form-label">策略备注</label><textarea class="form-control" id="essay-strategy" rows="2">${escapeHtml(essay?.strategy_notes||'')}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
      <button class="btn btn-primary" onclick="saveEssay('${safeId(studentId)}','${safeId(essayId||'')}')">保存</button>
    </div>
  </div></div></div>`;

  document.querySelectorAll('#essay-modal').forEach(el => el.remove());
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('essay-modal')).show();
}

async function saveEssay(studentId, essayId) {
  const data = {
    essay_type: document.getElementById('essay-type').value,
    status: document.getElementById('essay-status').value,
    title: document.getElementById('essay-title').value.trim() || null,
    prompt: document.getElementById('essay-prompt').value.trim() || null,
    word_limit: parseInt(document.getElementById('essay-limit').value) || null,
    review_deadline: document.getElementById('essay-deadline').value || null,
    application_id: document.getElementById('essay-app').value || null,
    strategy_notes: document.getElementById('essay-strategy').value.trim() || null,
  };

  try {
    if (essayId) {
      await api('PUT', `/api/essays/${essayId}`, data);
      showSuccess('文书已更新');
    } else {
      await api('POST', `/api/students/${studentId}/essays`, data);
      showSuccess('文书已创建');
    }
    bootstrap.Modal.getInstance(document.getElementById('essay-modal'))?.hide();
    loadEssaysTab(studentId);
  } catch(e) { showError(e.message); }
}

async function deleteEssay(essayId, studentId) {
  if (!confirm('确认删除此文书？所有版本和批注将一并删除。')) return;
  try {
    await api('DELETE', `/api/essays/${essayId}`);
    showSuccess('文书已删除');
    loadEssaysTab(studentId);
  } catch(e) { showError(e.message); }
}

// ── 新版本提交 ──
function openEssayVersionModal(essayId, studentId) {
  const html = `<div class="modal fade" id="essay-version-modal" data-rendered-modal="1"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">提交新版本</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-2"><label class="form-label">文书内容 <span class="text-danger">*</span></label>
        <textarea class="form-control" id="ev-content" rows="12" style="font-size:14px;line-height:1.8;"></textarea>
        <div class="form-text text-end">字数: <span id="ev-word-count">0</span></div>
      </div>
      <div class="mb-2"><label class="form-label">修改说明</label><input class="form-control" id="ev-summary" placeholder="简述本次修改内容"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
      <button class="btn btn-primary" onclick="saveEssayVersion('${safeId(essayId)}','${safeId(studentId)}')">提交</button>
    </div>
  </div></div></div>`;

  document.querySelectorAll('#essay-version-modal').forEach(el => el.remove());
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('essay-version-modal')).show();

  const contentEl = document.getElementById('ev-content');
  contentEl.addEventListener('input', () => {
    const words = contentEl.value.trim().split(/\s+/).filter(Boolean).length;
    document.getElementById('ev-word-count').textContent = words;
  });
}

async function saveEssayVersion(essayId, studentId) {
  const content = document.getElementById('ev-content').value;
  const change_summary = document.getElementById('ev-summary').value.trim() || null;
  if (!content.trim()) { showError('文书内容不能为空'); return; }

  try {
    await api('POST', `/api/essays/${essayId}/versions`, { content, change_summary });
    showSuccess('新版本已提交');
    bootstrap.Modal.getInstance(document.getElementById('essay-version-modal'))?.hide();
    // 刷新详情
    openEssayDetail(studentId, essayId);
  } catch(e) { showError(e.message); }
}

// ── 批注 ──
function openAnnotationModal(essayId, studentId) {
  const html = `<div class="modal fade" id="annotation-modal" data-rendered-modal="1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">添加批注</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-2"><label class="form-label">批注类型</label><select class="form-select" id="ann-type">
        <option value="general">总评</option>
        <option value="inline">行内批注</option>
      </select></div>
      <div class="mb-2"><label class="form-label">内容 <span class="text-danger">*</span></label><textarea class="form-control" id="ann-content" rows="4"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
      <button class="btn btn-primary" onclick="saveAnnotation('${safeId(essayId)}','${safeId(studentId)}')">提交</button>
    </div>
  </div></div></div>`;

  document.querySelectorAll('#annotation-modal').forEach(el => el.remove());
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('annotation-modal')).show();
}

async function saveAnnotation(essayId, studentId) {
  const content = document.getElementById('ann-content').value.trim();
  const type = document.getElementById('ann-type').value;
  if (!content) { showError('批注内容必填'); return; }

  try {
    await api('POST', `/api/essays/${essayId}/annotations`, { content, type });
    showSuccess('批注已添加');
    bootstrap.Modal.getInstance(document.getElementById('annotation-modal'))?.hide();
    if (studentId) openEssayDetail(studentId, essayId);
  } catch(e) { showError(e.message); }
}

async function updateAnnotation(annId, status, essayId, studentId) {
  try {
    await api('PUT', `/api/essay-annotations/${annId}`, { status });
    showSuccess('批注已更新');
    openEssayDetail(studentId, essayId);
  } catch(e) { showError(e.message); }
}

// ── 素材库 ──
async function openEssayMaterialModal(studentId, materialId) {
  let mat = null;
  let activities = [];
  try {
    activities = await GET(`/api/students/${studentId}/activities`);
    if (materialId) {
      const all = await GET(`/api/students/${studentId}/essay-materials`);
      mat = all.find(m => m.id === materialId);
    }
  } catch(e) {}

  const title = mat ? '编辑素材' : '添加素材';
  const cats = { growth: '成长经历', academic_interest: '学术兴趣', activity: '活动经历', challenge: '挫折与成长', other: '其他' };

  const html = `<div class="modal fade" id="essay-mat-modal" data-rendered-modal="1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">${title}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="row mb-2">
        <div class="col-6"><label class="form-label">标题 <span class="text-danger">*</span></label><input class="form-control" id="em-title" value="${escapeHtml(mat?.title||'')}"></div>
        <div class="col-6"><label class="form-label">类别</label><select class="form-select" id="em-category">
          <option value="">未分类</option>
          ${Object.entries(cats).map(([k,v]) => `<option value="${k}" ${mat?.category===k?'selected':''}>${v}</option>`).join('')}
        </select></div>
      </div>
      <div class="mb-2"><label class="form-label">关联活动</label><select class="form-select" id="em-activity">
        <option value="">无</option>
        ${activities.map(a => `<option value="${safeId(a.id)}" ${mat?.related_activity_id===a.id?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}
      </select></div>
      <div class="mb-2"><label class="form-label">内容</label><textarea class="form-control" id="em-content" rows="5">${escapeHtml(mat?.content||'')}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
      <button class="btn btn-primary" onclick="saveEssayMaterial('${safeId(studentId)}','${safeId(materialId||'')}')">保存</button>
    </div>
  </div></div></div>`;

  document.querySelectorAll('#essay-mat-modal').forEach(el => el.remove());
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('essay-mat-modal')).show();
}

async function saveEssayMaterial(studentId, materialId) {
  const data = {
    title: document.getElementById('em-title').value.trim(),
    category: document.getElementById('em-category').value || null,
    content: document.getElementById('em-content').value.trim() || null,
    related_activity_id: document.getElementById('em-activity').value || null,
  };
  if (!data.title) { showError('素材标题必填'); return; }

  try {
    if (materialId) {
      await api('PUT', `/api/essay-materials/${materialId}`, data);
      showSuccess('素材已更新');
    } else {
      await api('POST', `/api/students/${studentId}/essay-materials`, data);
      showSuccess('素材已创建');
    }
    bootstrap.Modal.getInstance(document.getElementById('essay-mat-modal'))?.hide();
    loadEssaysTab(studentId);
  } catch(e) { showError(e.message); }
}

async function deleteEssayMaterial(materialId, studentId) {
  if (!confirm('确认删除此素材？')) return;
  try {
    await api('DELETE', `/api/essay-materials/${materialId}`);
    showSuccess('素材已删除');
    loadEssaysTab(studentId);
  } catch(e) { showError(e.message); }
}
