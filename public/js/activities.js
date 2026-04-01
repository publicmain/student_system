// ══════════════════════════════════════════════════════
//  课外活动与竞赛荣誉 — 前端 UI
// ══════════════════════════════════════════════════════

const ACTIVITY_CATEGORY_LABELS = {
  academic_competition: '学术竞赛',
  club_leadership: '社团/领导力',
  volunteer: '志愿服务',
  internship: '实习/工作',
  sports: '体育',
  arts: '艺术',
  personal_project: '个人项目',
  research: '学术研究',
  other: '其他',
};

const IMPACT_LEVEL_LABELS = {
  school: '校级', city: '市级', province: '省级', national: '国家级', international: '国际级',
};
const IMPACT_BADGES = {
  school: 'bg-secondary', city: 'bg-info', province: 'bg-primary', national: 'bg-warning text-dark', international: 'bg-danger',
};

// ── 主加载函数 ──
async function loadActivitiesTab(studentId) {
  const container = document.getElementById('activities-container');
  if (!container) return;
  container.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

  try {
    const [activities, honors, stats] = await Promise.all([
      GET(`/api/students/${studentId}/activities`),
      GET(`/api/students/${studentId}/honors`),
      GET(`/api/students/${studentId}/activity-stats`),
    ]);

    const canEdit = hasRole('principal','counselor','mentor');
    let html = '';

    // ── 统计概览 ──
    html += `<div class="row g-2 mb-3">
      <div class="col-md-3"><div class="card card-body text-center py-2"><div class="fs-4 fw-bold text-primary">${stats.total_activities}</div><small class="text-muted">课外活动</small></div></div>
      <div class="col-md-3"><div class="card card-body text-center py-2"><div class="fs-4 fw-bold text-warning">${stats.total_honors}</div><small class="text-muted">荣誉奖项</small></div></div>
      <div class="col-md-3"><div class="card card-body text-center py-2"><div class="fs-4 fw-bold text-info">${stats.total_hours_per_year}</div><small class="text-muted">年投入小时</small></div></div>
      <div class="col-md-3"><div class="card card-body text-center py-2"><div class="fs-4 fw-bold ${stats.balance==='balanced'?'text-success':stats.balance==='moderate'?'text-warning':'text-danger'}">${stats.balance==='balanced'?'均衡':stats.balance==='moderate'?'适中':'偏窄'}</div><small class="text-muted">活动平衡度</small></div></div>
    </div>`;

    // ── 类别分布 ──
    if (stats.total_activities > 0) {
      html += `<div class="card mb-3"><div class="card-body py-2">
        <h6 class="card-title mb-2 small fw-semibold">类别分布</h6>
        ${Object.entries(stats.by_category).map(([cat, count]) => {
          const pct = Math.round((count / stats.total_activities) * 100);
          return `<div class="d-flex align-items-center mb-1">
            <small class="text-muted" style="width:80px">${ACTIVITY_CATEGORY_LABELS[cat]||cat}</small>
            <div class="progress flex-grow-1 me-2" style="height:14px"><div class="progress-bar" style="width:${pct}%">${count}</div></div>
          </div>`;
        }).join('')}
      </div></div>`;
    }

    // ── 活动列表 ──
    html += `<div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="fw-semibold mb-0">课外活动 (${activities.length}/10)</h6>
      ${canEdit ? `<button class="btn btn-sm btn-primary" onclick="openActivityModal('${safeId(studentId)}')"><i class="bi bi-plus-lg me-1"></i>添加活动</button>` : ''}
    </div>`;

    if (activities.length === 0) {
      html += emptyStateSm('暂无课外活动记录', 'trophy');
    } else {
      // 按类别分组
      const grouped = {};
      activities.forEach(a => {
        const cat = a.category || 'other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(a);
      });

      for (const [cat, items] of Object.entries(grouped)) {
        html += `<div class="mb-3">
          <div class="small fw-semibold text-muted mb-1"><i class="bi bi-tag me-1"></i>${ACTIVITY_CATEGORY_LABELS[cat]||cat}</div>`;
        items.forEach(a => {
          let tags = []; try { tags = JSON.parse(a.related_major_tags || '[]'); } catch(_) {}
          html += `<div class="card mb-2">
            <div class="card-body py-2 px-3">
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <strong>${escapeHtml(a.name)}</strong>
                  ${a.organization ? `<span class="text-muted ms-1">@ ${escapeHtml(a.organization)}</span>` : ''}
                  ${a.impact_level ? `<span class="badge ${IMPACT_BADGES[a.impact_level]||'bg-secondary'} ms-1">${IMPACT_LEVEL_LABELS[a.impact_level]||a.impact_level}</span>` : ''}
                </div>
                ${canEdit ? `<div class="d-flex gap-1">
                  <button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="openActivityModal('${safeId(studentId)}','${safeId(a.id)}')"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="deleteActivity('${safeId(a.id)}','${safeId(studentId)}')"><i class="bi bi-trash"></i></button>
                </div>` : ''}
              </div>
              ${a.role ? `<div class="small"><strong>角色：</strong>${escapeHtml(a.role)}</div>` : ''}
              ${a.description ? `<div class="small text-muted mt-1">${escapeHtml(a.description.substring(0,150))}</div>` : ''}
              <div class="d-flex flex-wrap gap-2 mt-1 small text-muted">
                ${a.start_date ? `<span><i class="bi bi-calendar me-1"></i>${fmtDate(a.start_date)} ~ ${a.end_date ? fmtDate(a.end_date) : '至今'}</span>` : ''}
                ${a.hours_per_week ? `<span><i class="bi bi-clock me-1"></i>${a.hours_per_week}时/周</span>` : ''}
                ${a.weeks_per_year ? `<span>${a.weeks_per_year}周/年</span>` : ''}
              </div>
              ${a.achievements ? `<div class="small mt-1"><i class="bi bi-star text-warning me-1"></i>${escapeHtml(a.achievements)}</div>` : ''}
              ${tags.length ? `<div class="mt-1">${tags.map(t => `<span class="badge bg-light text-dark border me-1">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            </div>
          </div>`;
        });
        html += `</div>`;
      }
    }

    // ── 荣誉列表 ──
    html += `<div class="d-flex justify-content-between align-items-center mb-2 mt-4">
      <h6 class="fw-semibold mb-0">竞赛与荣誉 (${honors.length})</h6>
      ${canEdit ? `<button class="btn btn-sm btn-warning" onclick="openHonorModal('${safeId(studentId)}')"><i class="bi bi-plus-lg me-1"></i>添加荣誉</button>` : ''}
    </div>`;

    if (honors.length === 0) {
      html += emptyStateSm('暂无荣誉记录', 'award');
    } else {
      html += `<div class="table-responsive"><table class="table table-sm table-hover">
        <thead><tr><th>荣誉</th><th>级别</th><th>等级</th><th>日期</th><th>关联活动</th>${canEdit?'<th></th>':''}</tr></thead>
        <tbody>`;
      honors.forEach(h => {
        html += `<tr>
          <td><strong>${escapeHtml(h.name)}</strong>${h.description ? `<br><small class="text-muted">${escapeHtml(h.description)}</small>` : ''}</td>
          <td>${h.level ? `<span class="badge ${IMPACT_BADGES[h.level]||'bg-secondary'}">${IMPACT_LEVEL_LABELS[h.level]||h.level}</span>` : '—'}</td>
          <td>${escapeHtml(h.award_rank||'—')}</td>
          <td>${fmtDate(h.award_date)}</td>
          <td>${h.activity_name ? escapeHtml(h.activity_name) : '—'}</td>
          ${canEdit ? `<td class="text-end">
            <button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="openHonorModal('${safeId(studentId)}','${safeId(h.id)}')"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="deleteHonor('${safeId(h.id)}','${safeId(studentId)}')"><i class="bi bi-trash"></i></button>
          </td>` : ''}
        </tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── CommonApp 预览 ──
    if (activities.length > 0) {
      html += `<div class="mt-4"><h6 class="fw-semibold"><i class="bi bi-eye me-1"></i>CommonApp 预览</h6>
        <div class="card"><div class="card-body py-2" style="font-family:monospace;font-size:13px;">`;
      activities.slice(0, 10).forEach((a, i) => {
        html += `<div class="${i > 0 ? 'border-top pt-2 mt-2' : ''}">
          <strong>${i + 1}. ${escapeHtml(a.name)}</strong> — ${ACTIVITY_CATEGORY_LABELS[a.category]||a.category}<br>
          ${a.role ? `Position: ${escapeHtml(a.role)}<br>` : ''}
          ${a.organization ? `Organization: ${escapeHtml(a.organization)}<br>` : ''}
          ${a.description ? `Description: ${escapeHtml(a.description.substring(0, 150))}<br>` : ''}
          Participation: ${a.start_date ? fmtDate(a.start_date) : '?'} ~ ${a.end_date ? fmtDate(a.end_date) : 'Present'}${a.hours_per_week ? `, ${a.hours_per_week} hr/wk` : ''}${a.weeks_per_year ? `, ${a.weeks_per_year} wk/yr` : ''}
        </div>`;
      });
      html += `</div></div></div>`;
    }

    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

// ── 活动 CRUD 弹窗 ──
async function openActivityModal(studentId, activityId) {
  let activity = null;
  if (activityId) {
    try {
      const all = await GET(`/api/students/${studentId}/activities`);
      activity = all.find(a => a.id === activityId);
    } catch(e) { showError(e.message); return; }
  }
  const tags = activity ? JSON.parse(activity.related_major_tags || '[]') : [];
  const title = activity ? '编辑活动' : '添加活动';

  const html = `<div class="modal fade" id="activity-modal" data-rendered-modal="1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">${title}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-2"><label class="form-label">活动名称 <span class="text-danger">*</span></label><input class="form-control" id="act-name" value="${escapeHtml(activity?.name||'')}"></div>
      <div class="row mb-2">
        <div class="col-6"><label class="form-label">类别 <span class="text-danger">*</span></label><select class="form-select" id="act-category">
          ${Object.entries(ACTIVITY_CATEGORY_LABELS).map(([k,v]) => `<option value="${k}" ${activity?.category===k?'selected':''}>${v}</option>`).join('')}
        </select></div>
        <div class="col-6"><label class="form-label">影响力级别</label><select class="form-select" id="act-impact">
          <option value="">未选择</option>
          ${Object.entries(IMPACT_LEVEL_LABELS).map(([k,v]) => `<option value="${k}" ${activity?.impact_level===k?'selected':''}>${v}</option>`).join('')}
        </select></div>
      </div>
      <div class="row mb-2">
        <div class="col-6"><label class="form-label">组织/机构</label><input class="form-control" id="act-org" value="${escapeHtml(activity?.organization||'')}"></div>
        <div class="col-6"><label class="form-label">角色/职位</label><input class="form-control" id="act-role" value="${escapeHtml(activity?.role||'')}"></div>
      </div>
      <div class="row mb-2">
        <div class="col-6"><label class="form-label">开始日期</label><input type="date" class="form-control" id="act-start" value="${activity?.start_date||''}"></div>
        <div class="col-6"><label class="form-label">结束日期</label><input type="date" class="form-control" id="act-end" value="${activity?.end_date||''}"></div>
      </div>
      <div class="row mb-2">
        <div class="col-6"><label class="form-label">每周小时数</label><input type="number" step="0.5" class="form-control" id="act-hours" value="${activity?.hours_per_week||''}"></div>
        <div class="col-6"><label class="form-label">每年参与周数</label><input type="number" class="form-control" id="act-weeks" value="${activity?.weeks_per_year||''}"></div>
      </div>
      <div class="mb-2"><label class="form-label">活动描述 <small class="text-muted">(≤150字符, CommonApp格式)</small></label><textarea class="form-control" id="act-desc" rows="2" maxlength="150">${escapeHtml(activity?.description||'')}</textarea><div class="form-text text-end"><span id="act-desc-count">${(activity?.description||'').length}</span>/150</div></div>
      <div class="mb-2"><label class="form-label">成果/成就</label><textarea class="form-control" id="act-achievements" rows="2">${escapeHtml(activity?.achievements||'')}</textarea></div>
      <div class="mb-2"><label class="form-label">关联专业标签 <small class="text-muted">(逗号分隔)</small></label><input class="form-control" id="act-tags" value="${escapeHtml(tags.join(', '))}"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
      <button class="btn btn-primary" onclick="saveActivity('${safeId(studentId)}','${safeId(activityId||'')}')">保存</button>
    </div>
  </div></div></div>`;

  document.querySelectorAll('#activity-modal').forEach(el => el.remove());
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = new bootstrap.Modal(document.getElementById('activity-modal'));
  modal.show();

  // 字数计数
  const descEl = document.getElementById('act-desc');
  if (descEl) descEl.addEventListener('input', () => {
    document.getElementById('act-desc-count').textContent = descEl.value.length;
  });
}

async function saveActivity(studentId, activityId) {
  const data = {
    name: document.getElementById('act-name').value.trim(),
    category: document.getElementById('act-category').value,
    impact_level: document.getElementById('act-impact').value || null,
    organization: document.getElementById('act-org').value.trim() || null,
    role: document.getElementById('act-role').value.trim() || null,
    start_date: document.getElementById('act-start').value || null,
    end_date: document.getElementById('act-end').value || null,
    hours_per_week: parseFloat(document.getElementById('act-hours').value) || null,
    weeks_per_year: parseInt(document.getElementById('act-weeks').value) || null,
    description: document.getElementById('act-desc').value.trim() || null,
    achievements: document.getElementById('act-achievements').value.trim() || null,
    related_major_tags: document.getElementById('act-tags').value.split(',').map(s => s.trim()).filter(Boolean),
  };
  if (!data.name) { showError('活动名称必填'); return; }

  try {
    if (activityId) {
      await api('PUT', `/api/activities/${activityId}`, data);
      showSuccess('活动已更新');
    } else {
      await api('POST', `/api/students/${studentId}/activities`, data);
      showSuccess('活动已创建');
    }
    bootstrap.Modal.getInstance(document.getElementById('activity-modal'))?.hide();
    loadActivitiesTab(studentId);
  } catch(e) { showError(e.message); }
}

async function deleteActivity(activityId, studentId) {
  if (!confirm('确认删除此活动？')) return;
  try {
    await api('DELETE', `/api/activities/${activityId}`);
    showSuccess('活动已删除');
    loadActivitiesTab(studentId);
  } catch(e) { showError(e.message); }
}

// ── 荣誉 CRUD 弹窗 ──
async function openHonorModal(studentId, honorId) {
  let honor = null;
  let activities = [];
  try {
    activities = await GET(`/api/students/${studentId}/activities`);
    if (honorId) {
      const all = await GET(`/api/students/${studentId}/honors`);
      honor = all.find(h => h.id === honorId);
    }
  } catch(e) { showError(e.message); return; }

  const title = honor ? '编辑荣誉' : '添加荣誉';
  const html = `<div class="modal fade" id="honor-modal" data-rendered-modal="1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">${title}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-2"><label class="form-label">荣誉名称 <span class="text-danger">*</span></label><input class="form-control" id="honor-name" value="${escapeHtml(honor?.name||'')}"></div>
      <div class="row mb-2">
        <div class="col-6"><label class="form-label">级别</label><select class="form-select" id="honor-level">
          <option value="">未选择</option>
          ${Object.entries(IMPACT_LEVEL_LABELS).map(([k,v]) => `<option value="${k}" ${honor?.level===k?'selected':''}>${v}</option>`).join('')}
        </select></div>
        <div class="col-6"><label class="form-label">获奖等级</label><input class="form-control" id="honor-rank" value="${escapeHtml(honor?.award_rank||'')}" placeholder="如：金奖、一等奖"></div>
      </div>
      <div class="row mb-2">
        <div class="col-6"><label class="form-label">获奖日期</label><input type="date" class="form-control" id="honor-date" value="${honor?.award_date||''}"></div>
        <div class="col-6"><label class="form-label">关联活动</label><select class="form-select" id="honor-activity">
          <option value="">无</option>
          ${activities.map(a => `<option value="${safeId(a.id)}" ${honor?.activity_id===a.id?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}
        </select></div>
      </div>
      <div class="mb-2"><label class="form-label">描述</label><textarea class="form-control" id="honor-desc" rows="2">${escapeHtml(honor?.description||'')}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
      <button class="btn btn-primary" onclick="saveHonor('${safeId(studentId)}','${safeId(honorId||'')}')">保存</button>
    </div>
  </div></div></div>`;

  document.querySelectorAll('#honor-modal').forEach(el => el.remove());
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('honor-modal')).show();
}

async function saveHonor(studentId, honorId) {
  const data = {
    name: document.getElementById('honor-name').value.trim(),
    level: document.getElementById('honor-level').value || null,
    award_rank: document.getElementById('honor-rank').value.trim() || null,
    award_date: document.getElementById('honor-date').value || null,
    activity_id: document.getElementById('honor-activity').value || null,
    description: document.getElementById('honor-desc').value.trim() || null,
  };
  if (!data.name) { showError('荣誉名称必填'); return; }

  try {
    if (honorId) {
      await api('PUT', `/api/honors/${honorId}`, data);
      showSuccess('荣誉已更新');
    } else {
      await api('POST', `/api/students/${studentId}/honors`, data);
      showSuccess('荣誉已创建');
    }
    bootstrap.Modal.getInstance(document.getElementById('honor-modal'))?.hide();
    loadActivitiesTab(studentId);
  } catch(e) { showError(e.message); }
}

async function deleteHonor(honorId, studentId) {
  if (!confirm('确认删除此荣誉？')) return;
  try {
    await api('DELETE', `/api/honors/${honorId}`);
    showSuccess('荣誉已删除');
    loadActivitiesTab(studentId);
  } catch(e) { showError(e.message); }
}
