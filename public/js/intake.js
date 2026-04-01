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
