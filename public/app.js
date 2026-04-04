// ════════════════════════════════════════════════════════
//  路由表 & 页面权限（依赖 core.js 中的 State / navigate）
//  NOTE: Arrow wrappers ensure late binding — render functions from
//  intake.js / mat-collection.js / adm-profiles.js are resolved at
//  call time, not parse time.
// ════════════════════════════════════════════════════════
const PAGES = {
  dashboard:            (p) => renderDashboard(p),
  counselor:            (p) => renderCounselorWorkbench(p),
  mentor:               (p) => renderMentorWorkbench(p),
  'student-portal':     (p) => renderStudentPortal(p),
  'parent-portal':      (p) => renderParentPortal(p),
  'agent-portal':       (p) => renderAgentPortal(p),
  students:             (p) => renderStudentList(p),
  'student-detail':     (p) => renderStudentDetail(p),
  staff:                (p) => renderStaffList(p),
  materials:            (p) => renderMaterialsBoard(p),
  'feedback-list':      (p) => renderFeedbackList(p),
  'templates':          (p) => renderTemplates(p),
  'settings':           (p) => renderSettings(p),
  'analytics':          (p) => renderAnalytics(p),
  'audit':              (p) => renderAuditLog(p),
  'command-center':     () => renderCommandCenter(),
  'admission-programs': (p) => renderAdmissionPrograms(p),
  'intake-dashboard':   (p) => renderIntakeDashboard(p),
  'intake-cases':       (p) => renderIntakeCases(p),
  'intake-case-detail': (params) => {
    const caseId = params?.caseId || State.currentCaseId;
    if (caseId) State.currentCaseId = caseId;
    renderIntakeCases().then(() => {
      if (caseId) showCaseDetail(caseId);
    });
  },
  'agents-management':  () => { navigate('mat-companies'); },
  'task-detail':        (p) => renderTaskDetail(p),
  'mat-requests':       () => { showToast('材料收集已整合到入学案例详情页','info'); navigate('intake-cases'); },
  'mat-request-detail': () => { navigate('intake-cases'); },
  'mat-companies':      (p) => renderMatCompanies(p),
  'adm-profiles':       () => { showToast('申请表管理已整合到入学案例详情页','info'); navigate('intake-cases'); },
  'adm-form':           () => { navigate('intake-cases'); },
  'adm-case-detail':    () => { navigate('intake-cases'); },
};

const PAGE_ROLES = {
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
  'command-center':     ['principal', 'counselor', 'mentor'],
  'admission-programs': ['principal', 'counselor'],
  'task-detail':        ['principal', 'counselor', 'mentor', 'intake_staff', 'student_admin'],
  'student-portal':     ['student'],
  'parent-portal':      ['parent'],
  'agent-portal':       ['agent'],
  'intake-dashboard':   ['principal', 'intake_staff', 'student_admin'],
  'intake-cases':       ['principal', 'intake_staff', 'student_admin'],
  'intake-case-detail': ['principal', 'intake_staff', 'student_admin'],
  'agents-management':  ['principal'],
  'mat-requests':       ['principal', 'counselor', 'intake_staff'],
  'mat-request-detail': ['principal', 'counselor', 'intake_staff'],
  'mat-companies':      ['principal', 'counselor', 'intake_staff'],
  'adm-profiles':       ['principal', 'counselor', 'intake_staff'],
  'adm-form':           ['principal', 'counselor', 'intake_staff'],
  'adm-case-detail':    ['principal', 'counselor', 'intake_staff'],
};

function canAccessPage(page) {
  const allowed = PAGE_ROLES[page];
  if (!allowed) return false;
  return allowed.includes(State.user?.role);
}

// ════════════════════════════════════════════════════════
//  仪表盘 (校长)
// ════════════════════════════════════════════════════════
async function renderDashboard() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;

  try {
    const [stats, risks, workload, ccStats] = await Promise.all([
      GET('/api/dashboard/stats'),
      GET('/api/dashboard/risks'),
      GET('/api/dashboard/workload'),
      GET('/api/command-center/stats').catch(() => null),
    ]);

    const tierMap = {};
    (stats.tierStats || []).forEach(t => tierMap[t.tier] = t.cnt);

    // ── 计算需要关注的师资（>70%负载）
    const warnStaff = workload.filter(w => {
      const pct = w.capacity_students > 0 ? Math.round(w.current_students/w.capacity_students*100) : 0;
      return pct >= 70;
    });

    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-speedometer2 me-2"></i>总览仪表盘</h4>
      <div class="page-header-actions">
        <small class="text-muted me-2">更新时间：${new Date().toLocaleString('zh-CN')}</small>
        <button class="btn btn-outline-muted btn-sm" onclick="exportDashboardPDF()"><i class="bi bi-printer me-1"></i>导出PDF</button>
      </div>
    </div>

    <!-- KPI 指标条 -->
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-3">
        <div class="stat-card accent-primary" onclick="navigate('students')" style="cursor:pointer">
          <div class="stat-icon"><i class="bi bi-people-fill"></i></div>
          <div class="stat-value">${stats.totalStudents}</div>
          <div class="stat-label">在读学生</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card accent-success">
          <div class="stat-icon"><i class="bi bi-file-earmark-check-fill"></i></div>
          <div class="stat-value">${stats.totalApplications}</div>
          <div class="stat-label">总申请数</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card ${stats.overdueTasks>0?'accent-danger':'accent-success'}">
          <div class="stat-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
          <div class="stat-value" style="${stats.overdueTasks>0?'color:var(--danger)':''}">${stats.overdueTasks}</div>
          <div class="stat-label">逾期任务</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card accent-info">
          <div class="stat-icon"><i class="bi bi-folder-check"></i></div>
          <div class="stat-value">${stats.pendingMaterials}</div>
          <div class="stat-label">待处理材料</div>
        </div>
      </div>
    </div>

    ${ccStats ? `
    <!-- 申请指挥中心概览 -->
    <div class="row g-3 mb-4">
      <div class="col-12">
        <div class="card">
          <div class="card-header fw-semibold d-flex justify-content-between align-items-center">
            <span><i class="bi bi-rocket-takeoff-fill me-1 text-primary"></i> 申请指挥中心</span>
            <a href="#" onclick="event.preventDefault();navigate('command-center')" class="small text-primary text-decoration-none">进入指挥中心 →</a>
          </div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-6 col-md-3 text-center">
                <div class="fs-3 fw-bold text-primary">${ccStats.total || 0}</div>
                <div class="small text-muted">总申请</div>
              </div>
              <div class="col-6 col-md-3 text-center">
                <div class="fs-3 fw-bold text-info">${ccStats.submitted || 0}</div>
                <div class="small text-muted">已提交</div>
              </div>
              <div class="col-6 col-md-3 text-center">
                <div class="fs-3 fw-bold text-success">${ccStats.offers || 0}</div>
                <div class="small text-muted">已获Offer</div>
              </div>
              <div class="col-6 col-md-3 text-center">
                <div class="fs-3 fw-bold ${ccStats.atRisk > 0 ? 'text-danger' : 'text-muted'}">${ccStats.atRisk || 0}</div>
                <div class="small text-muted">风险申请</div>
              </div>
            </div>
            ${ccStats.byStatus && ccStats.byStatus.length > 0 ? `
            <div class="mt-3 pt-3 border-top">
              <div class="d-flex flex-wrap gap-2">
                ${ccStats.byStatus.map(s => `<span class="badge bg-light text-dark border">${escapeHtml(s.status || '未知')}: ${s.cnt}</span>`).join('')}
              </div>
            </div>` : ''}
          </div>
        </div>
      </div>
    </div>` : ''}

    <div class="row g-3 mb-4">
      <!-- 梯度分布 -->
      <div class="col-md-4">
        <div class="card h-100">
          <div class="card-header fw-semibold"><i class="bi bi-bar-chart-fill me-1 text-primary"></i> 院校梯度分布</div>
          <div class="card-body">
            ${(() => {
              const gradients = {'冲刺':'progress-bar-gradient-red','意向':'progress-bar-gradient-blue','保底':'progress-bar-gradient-green'};
              const maxCnt = Math.max(...['冲刺','意向','保底'].map(t => tierMap[t]||0), 1);
              return ['冲刺','意向','保底'].map(tier => {
                const cnt = tierMap[tier] || 0;
                const pct = Math.round(cnt / maxCnt * 100);
                return `<div class="mb-3">
                  <div class="d-flex justify-content-between mb-1">
                    <span class="small fw-semibold">${tier}</span><span class="fw-bold">${cnt}</span>
                  </div>
                  <div class="progress" style="height:8px;border-radius:999px">
                    <div class="progress-bar ${gradients[tier]}" style="width:${pct}%;border-radius:999px"></div>
                  </div>
                </div>`;
              }).join('');
            })()}
          </div>
        </div>
      </div>
      <!-- 需要关注 -->
      <div class="col-md-8">
        <div class="card h-100">
          <div class="card-header fw-semibold d-flex justify-content-between align-items-center">
            <span><i class="bi bi-exclamation-triangle me-1 text-warning"></i> 需要关注</span>
            <a href="#" onclick="event.preventDefault();navigate('students')" class="small text-primary text-decoration-none">查看全部学生 →</a>
          </div>
          <div class="card-body p-0">
            ${risks.length === 0
              ? '<div class="empty-state-block" style="padding:2rem"><i class="bi bi-check-circle" style="color:var(--success)"></i><p>所有学生任务均按时推进</p></div>'
              : `<ul class="attention-list">
                ${risks.slice(0,5).map(r => `<li>
                  <div>
                    <div class="att-name">${escapeHtml(r.name)} <span class="badge badge-soft-secondary ms-1">${escapeHtml(r.grade_level)}</span></div>
                    <div class="att-desc"><span class="badge badge-soft-danger">${r.overdue_count} 项逾期</span></div>
                  </div>
                  <div class="att-action">
                    <button class="action-icon-btn" title="查看" onclick="navigate('student-detail',{studentId:'${r.id}'})"><i class="bi bi-chevron-right"></i></button>
                  </div>
                </li>`).join('')}
              </ul>`}
          </div>
        </div>
      </div>
    </div>

    <!-- 师资负载（仅显示需关注的） -->
    <div class="card">
      <div class="card-header fw-semibold d-flex justify-content-between align-items-center">
        <span><i class="bi bi-person-fill-gear me-1 text-muted"></i> 师资负载</span>
        <a href="#" onclick="event.preventDefault();navigate('staff')" class="small text-primary text-decoration-none">查看全部师资 →</a>
      </div>
      <div class="card-body p-0">
        ${warnStaff.length === 0
          ? `<div class="d-flex align-items-center justify-content-center py-3 gap-2 text-muted" style="font-size:.85rem">
              <i class="bi bi-check-circle text-success"></i> 暂无过载教师
            </div>`
          : `<div class="table-responsive">
            <table class="table table-sm table-hover mb-0">
              <thead class="table-light"><tr><th>姓名</th><th>角色</th><th>学生数</th><th>容量</th><th>负载</th></tr></thead>
              <tbody>
                ${warnStaff.map(w => {
                  const pct = w.capacity_students > 0 ? Math.round(w.current_students/w.capacity_students*100) : 0;
                  const cls = pct >= 90 ? 'danger' : 'warning';
                  const barGrad = cls === 'danger' ? 'progress-bar-gradient-red' : 'progress-bar-gradient-yellow';
                  return `<tr>
                    <td class="fw-semibold">${escapeHtml(w.name)}</td>
                    <td><span class="badge badge-soft-${w.role==='counselor'?'success':w.role==='mentor'?'info':'primary'}">${escapeHtml(w.role)}</span></td>
                    <td>${w.current_students}</td>
                    <td>${w.capacity_students||'—'}</td>
                    <td>
                      <div class="progress" style="height:6px;min-width:80px;border-radius:999px">
                        <div class="progress-bar ${barGrad}" style="width:${pct}%;border-radius:999px"></div>
                      </div>
                      <small class="text-${cls} fw-semibold">${pct}%</small>
                    </td>
                  </tr>`;
                }).join('')}
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

    <div class="md-layout" style="height:calc(100vh - 140px)">
      <!-- 左侧学生列表 -->
      <div class="md-list">
        <div class="md-list-header">
          <input class="form-control form-control-sm" id="student-search" placeholder="搜索姓名...">
          <select class="form-select form-select-sm mt-2" id="grade-filter">
            <option value="">全部年级</option>
            <option value="G9">G9</option><option value="G10">G10</option>
            <option value="G11">G11</option><option value="G12">G12</option><option value="G13">G13</option>
            <option value="Year 9">Year 9</option><option value="Year 10">Year 10</option>
            <option value="Year 11">Year 11</option><option value="Year 12">Year 12</option><option value="Year 13">Year 13</option>
            <option value="其他">其他</option>
          </select>
        </div>
        <div class="md-list-body" id="counselor-student-list">
          ${renderCounselorStudentItems(students)}
        </div>
      </div>

      <!-- 右侧详情面板 -->
      <div class="md-detail" id="counselor-detail">
        <div class="md-empty-detail">
          <i class="bi bi-person-vcard" style="font-size:2.5rem;opacity:.3"></i>
          <p class="text-muted mt-2">选择左侧学生查看详情</p>
          <div class="row g-3 w-100 mt-3" style="max-width:700px">
            <div class="col-md-6 col-12">
              <div class="card h-100">
                <div class="card-header fw-semibold small py-2 d-flex justify-content-between align-items-center">
                  <span><i class="bi bi-chat-dots me-1 text-warning"></i>待处理反馈 <span class="badge badge-soft-warning ms-1">${feedback.length}</span></span>
                  ${feedback.length > 0 ? '<a href="#" onclick="event.preventDefault();navigate(\'feedback-list\')" class="small text-primary text-decoration-none">全部 <i class="bi bi-chevron-right"></i></a>' : ''}
                </div>
                <div class="card-body p-0" style="max-height:320px;overflow-y:auto">
                  ${feedback.length === 0 ? '<div class="text-center text-muted small py-4"><i class="bi bi-check-circle d-block mb-1" style="font-size:1.5rem;opacity:.4"></i>暂无待处理反馈</div>' :
                  feedback.slice(0,6).map(f => '<div class="workbench-item border-bottom px-3 py-2" onclick="navigate(\'feedback-list\')"><div class="d-flex justify-content-between align-items-start"><span class="small fw-semibold">'+escapeHtml(f.student_name)+'</span><small class="text-muted" style="font-size:10px;white-space:nowrap">'+escapeHtml(f.created_at ? f.created_at.substring(0,10) : '')+'</small></div><p class="small text-muted mb-0 text-truncate" style="font-size:12px">'+escapeHtml(f.content.substring(0,60))+'</p></div>').join('')}
                </div>
              </div>
            </div>
            <div class="col-md-6 col-12">
              <div class="card h-100">
                <div class="card-header fw-semibold small py-2 d-flex justify-content-between align-items-center">
                  <span><i class="bi bi-clock-history me-1 text-danger"></i>近期截止</span>
                  <span class="badge badge-soft-danger ms-1" id="upcoming-count"></span>
                </div>
                <div class="card-body p-0" id="upcoming-tasks" style="max-height:320px;overflow-y:auto">
                  <div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

    loadUpcomingTasks();
    // 搜索过滤
    document.getElementById('student-search').oninput = (e) => filterCounselorStudents(students, e.target.value, document.getElementById('grade-filter').value);
    document.getElementById('grade-filter').onchange = (e) => filterCounselorStudents(students, document.getElementById('student-search').value, e.target.value);

  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

function renderCounselorStudentItems(students) {
  if (!students || students.length === 0) return '<div class="md-empty-detail" style="padding:2rem"><i class="bi bi-person-vcard" style="font-size:1.5rem;opacity:.3"></i><p class="text-muted small mt-1">暂无学生</p></div>';
  return students.map(s => `
    <div class="md-item" onclick="selectCounselorStudent('${s.id}',this)" data-sid="${s.id}">
      <div class="d-flex justify-content-between align-items-center">
        <span class="md-item-name">${escapeHtml(s.name)}</span>
        ${s.overdue_count > 0 ? `<span class="badge badge-soft-danger" style="font-size:10px">${s.overdue_count}逾期</span>` : ''}
      </div>
      <div class="md-item-sub">${escapeHtml(s.grade_level)} · ${escapeHtml(s.exam_board||'—')}</div>
    </div>`).join('');
}

async function selectCounselorStudent(id, el) {
  document.querySelectorAll('#counselor-student-list .md-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  const panel = document.getElementById('counselor-detail');
  panel.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  try {
    const [detail, tasks] = await Promise.all([
      GET(`/api/students/${id}`),
      GET(`/api/students/${id}/tasks`),
    ]);
    const s = detail.student;
    const canEdit = hasRole('principal','counselor');
    const pending = tasks.filter(t => t.status !== 'done');
    const overdue = pending.filter(t => isOverdue(t.due_date, t.status));
    panel.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h5 class="mb-0 fw-bold">${escapeHtml(s.name)} <span class="badge badge-soft-secondary ms-1">${escapeHtml(s.grade_level)}</span></h5>
          <small class="text-muted">${escapeHtml(s.exam_board||'—')} · 入学 ${fmtDate(s.enrol_date)}</small>
        </div>
        <div class="d-flex gap-2">
          ${canEdit ? `<button class="btn btn-outline-muted btn-sm" onclick="openStudentModal('${id}')"><i class="bi bi-pencil me-1"></i>编辑</button>` : ''}
          <button class="btn btn-primary btn-sm" onclick="navigate('student-detail',{studentId:'${id}'})"><i class="bi bi-box-arrow-up-right me-1"></i>完整档案</button>
        </div>
      </div>
      <!-- KPI -->
      <div class="row g-2 mb-3">
        <div class="col-4"><div class="stat-card accent-primary" style="padding:.75rem 1rem .75rem 1.25rem"><div class="stat-value" style="font-size:1.5rem">${pending.length}</div><div class="stat-label">待办任务</div></div></div>
        <div class="col-4"><div class="stat-card ${overdue.length>0?'accent-danger':'accent-success'}" style="padding:.75rem 1rem .75rem 1.25rem"><div class="stat-value" style="font-size:1.5rem;${overdue.length>0?'color:var(--danger)':''}">${overdue.length}</div><div class="stat-label">逾期任务</div></div></div>
        <div class="col-4"><div class="stat-card accent-info" style="padding:.75rem 1rem .75rem 1.25rem"><div class="stat-value" style="font-size:1.5rem">${detail.applications.length}</div><div class="stat-label">申请院校</div></div></div>
      </div>
      <!-- 目标院校 -->
      ${detail.targets.length > 0 ? `<div class="card mb-3"><div class="card-header fw-semibold small py-2"><i class="bi bi-mortarboard me-1 text-primary"></i>目标院校</div><div class="card-body p-0"><table class="table table-sm mb-0"><tbody>${detail.targets.map(t=>`<tr><td class="small fw-semibold">${escapeHtml(t.uni_name)}</td><td class="small text-muted">${escapeHtml(t.department||'—')}</td><td>${tierBadge(t.tier)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      <!-- 待办任务 -->
      <div class="card mb-3">
        <div class="card-header fw-semibold small py-2 d-flex justify-content-between align-items-center">
          <span><i class="bi bi-list-check me-1 text-warning"></i>待办任务</span>
          ${canEdit || hasRole('mentor') ? `<button class="btn btn-outline-primary btn-sm py-0 px-2" style="font-size:11px" onclick="openTaskModal('${id}')"><i class="bi bi-plus"></i></button>` : ''}
        </div>
        <div class="card-body p-0" style="max-height:300px;overflow-y:auto">
          ${pending.length === 0 ? '<div class="text-center text-muted small py-3"><i class="bi bi-check-circle text-success me-1"></i>所有任务已完成</div>' :
          pending.slice(0,10).map(t => {
            const od = isOverdue(t.due_date, t.status);
            return `<div class="border-bottom px-3 py-2 d-flex justify-content-between align-items-center">
              <div style="min-width:0"><div class="small ${od?'text-danger fw-bold':''} text-truncate">${escapeHtml(t.title)}</div><small class="text-muted">${fmtDate(t.due_date)||'无期限'}</small></div>
              ${od ? '<span class="badge badge-soft-danger" style="font-size:10px">逾期</span>' : `<span class="badge badge-soft-secondary" style="font-size:10px">${escapeHtml(t.status)}</span>`}
            </div>`;
          }).join('')}
        </div>
      </div>
      <!-- 导师信息 -->
      ${detail.mentors.length > 0 ? `<div class="card"><div class="card-header fw-semibold small py-2"><i class="bi bi-person-check me-1 text-success"></i>导师</div><div class="card-body p-0">${detail.mentors.map(m=>`<div class="px-3 py-2 border-bottom d-flex align-items-center gap-2"><div class="avatar-sm">${escapeHtml(m.staff_name.charAt(0))}</div><div><div class="small fw-semibold">${escapeHtml(m.staff_name)}</div><div class="text-muted" style="font-size:11px">${escapeHtml(m.role)}</div></div></div>`).join('')}</div></div>` : ''}
    `;
  } catch(e) {
    panel.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

async function loadUpcomingTasks() {
  try {
    const navGen = State._navGeneration;
    const students = await GET('/api/students');
    if (isNavStale(navGen)) return;
    const el = document.getElementById('upcoming-tasks');
    if (!el) return;
    const taskArrays = await Promise.all(
      students.map(s => GET(`/api/students/${s.id}/tasks`)
        .then(t => t.filter(x => x.status !== 'done').map(x => ({...x, student_name: s.name})))
        .catch(() => [])
      )
    );
    if (isNavStale(navGen)) return;
    const tasks = taskArrays.flat();
    tasks.sort((a,b) => new Date(a.due_date) - new Date(b.due_date));
    const upcoming = tasks.slice(0,8);
    const countEl = document.getElementById('upcoming-count');
    if (countEl) countEl.textContent = tasks.length > 0 ? tasks.length : '';
    if (upcoming.length === 0) {
      el.innerHTML = '<div class="text-center text-muted small py-4"><i class="bi bi-check-circle d-block mb-1" style="font-size:1.5rem;opacity:.4"></i>暂无近期任务</div>';
    } else {
      el.innerHTML = upcoming.map(t => {
        const overdue = isOverdue(t.due_date, t.status);
        const sid = t.student_id || '';
        return '<div class="workbench-item border-bottom px-3 py-2" onclick="selectCounselorStudent(\''+sid+'\',null)">'
          +'<div class="d-flex justify-content-between align-items-start">'
          +'<span class="small fw-semibold text-truncate '+(overdue?'text-danger':'')+'">'+escapeHtml(t.title.substring(0,30))+'</span>'
          +'<small class="'+(overdue?'text-danger fw-bold':'text-muted')+'" style="font-size:10px;white-space:nowrap">'+fmtDate(t.due_date)+'</small>'
          +'</div>'
          +'<small class="text-muted" style="font-size:11px">'+escapeHtml(t.student_name)+'</small>'
          +'</div>';
      }).join('');
    }
  } catch(e) {}
}

function filterCounselorStudents(students, search, grade) {
  const filtered = students.filter(s => {
    const matchSearch = !search || s.name.includes(search);
    const matchGrade = !grade || s.grade_level === grade;
    return matchSearch && matchGrade;
  });
  const el = document.getElementById('counselor-student-list');
  if (el) el.innerHTML = renderCounselorStudentItems(filtered);
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
    ${students.length === 0 ? '<div class="empty-state-block"><i class="bi bi-person-check"></i><p>暂无分配的学生</p></div>' : `
    <div class="md-layout" style="height:calc(100vh - 140px)">
      <div class="md-list">
        <div class="md-list-header">
          <input class="form-control form-control-sm" id="mentor-search" placeholder="搜索学生..." oninput="window._mentorFilter(this.value)">
        </div>
        <div class="md-list-body" id="mentor-student-list">
          ${students.map(s => `
          <div class="md-item" onclick="selectMentorStudent('${s.id}',this)" data-sid="${s.id}">
            <div class="d-flex justify-content-between align-items-center">
              <span class="md-item-name">${escapeHtml(s.name)}</span>
              ${s.overdue_count > 0 ? `<span class="badge badge-soft-danger" style="font-size:10px">${s.overdue_count}逾期</span>` : '<span class="badge badge-soft-success" style="font-size:10px">正常</span>'}
            </div>
            <div class="md-item-sub">${escapeHtml(s.grade_level)} · ${escapeHtml(s.exam_board||'—')}${s.targets ? ` · ${escapeHtml(s.targets.substring(0,20))}` : ''}</div>
          </div>`).join('')}
        </div>
      </div>
      <div class="md-detail" id="mentor-detail">
        <div class="md-empty-detail">
          <i class="bi bi-person-check" style="font-size:2.5rem;opacity:.3"></i>
          <p class="text-muted mt-2">选择左侧学生查看学业计划</p>
        </div>
      </div>
    </div>`}`;

    window._mentorFilter = (search) => {
      const items = document.querySelectorAll('#mentor-student-list .md-item');
      items.forEach(el => {
        const name = el.querySelector('.md-item-name')?.textContent || '';
        el.style.display = !search || name.includes(search) ? '' : 'none';
      });
    };
  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

async function selectMentorStudent(id, el) {
  document.querySelectorAll('#mentor-student-list .md-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  const panel = document.getElementById('mentor-detail');
  panel.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  try {
    const [detail, tasks] = await Promise.all([
      GET(`/api/students/${id}`),
      GET(`/api/students/${id}/tasks`),
    ]);
    const s = detail.student;
    const pending = tasks.filter(t => t.status !== 'done');
    const overdue = pending.filter(t => isOverdue(t.due_date, t.status));
    panel.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h5 class="mb-0 fw-bold">${escapeHtml(s.name)} <span class="badge badge-soft-secondary ms-1">${escapeHtml(s.grade_level)}</span></h5>
          <small class="text-muted">${escapeHtml(s.exam_board||'—')}${s.targets ? ` · 目标: ${escapeHtml((s.targets||'').substring(0,40))}` : ''}</small>
        </div>
        <button class="btn btn-primary btn-sm" onclick="navigate('student-detail',{studentId:'${id}'})"><i class="bi bi-box-arrow-up-right me-1"></i>完整档案</button>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-4"><div class="stat-card accent-primary" style="padding:.75rem 1rem .75rem 1.25rem"><div class="stat-value" style="font-size:1.5rem">${pending.length}</div><div class="stat-label">待办</div></div></div>
        <div class="col-4"><div class="stat-card ${overdue.length>0?'accent-danger':'accent-success'}" style="padding:.75rem 1rem .75rem 1.25rem"><div class="stat-value" style="font-size:1.5rem;${overdue.length>0?'color:var(--danger)':''}">${overdue.length}</div><div class="stat-label">逾期</div></div></div>
        <div class="col-4"><div class="stat-card accent-info" style="padding:.75rem 1rem .75rem 1.25rem"><div class="stat-value" style="font-size:1.5rem">${detail.applications.length}</div><div class="stat-label">申请</div></div></div>
      </div>
      <!-- 选科 -->
      ${detail.subjects.length > 0 ? `<div class="card mb-3"><div class="card-header fw-semibold small py-2"><i class="bi bi-book me-1 text-info"></i>选修科目</div><div class="card-body py-2"><div class="d-flex flex-wrap gap-1">${detail.subjects.map(sub=>`<span class="badge bg-light text-dark border">${escapeHtml(sub.code||sub.subject_name||'—')}${sub.predicted_grade?` <span class="text-info">${escapeHtml(sub.predicted_grade)}</span>`:''}</span>`).join('')}</div></div></div>` : ''}
      <!-- 待办任务 -->
      <div class="card mb-3">
        <div class="card-header fw-semibold small py-2 d-flex justify-content-between align-items-center">
          <span><i class="bi bi-list-check me-1 text-warning"></i>待办任务</span>
          <button class="btn btn-outline-primary btn-sm py-0 px-2" style="font-size:11px" onclick="openTaskModal('${id}')"><i class="bi bi-plus"></i></button>
        </div>
        <div class="card-body p-0" style="max-height:300px;overflow-y:auto">
          ${pending.length === 0 ? '<div class="text-center text-muted small py-3"><i class="bi bi-check-circle text-success me-1"></i>所有任务已完成</div>' :
          pending.slice(0,10).map(t => {
            const od = isOverdue(t.due_date, t.status);
            return `<div class="border-bottom px-3 py-2 d-flex justify-content-between align-items-center">
              <div style="min-width:0"><div class="small ${od?'text-danger fw-bold':''} text-truncate">${escapeHtml(t.title)}</div><small class="text-muted">${fmtDate(t.due_date)||'无期限'}</small></div>
              ${od ? '<span class="badge badge-soft-danger" style="font-size:10px">逾期</span>' : `<span class="badge badge-soft-secondary" style="font-size:10px">${escapeHtml(t.status)}</span>`}
            </div>`;
          }).join('')}
        </div>
      </div>
      <!-- 目标院校 -->
      ${detail.targets.length > 0 ? `<div class="card"><div class="card-header fw-semibold small py-2"><i class="bi bi-mortarboard me-1 text-primary"></i>目标院校</div><div class="card-body p-0"><table class="table table-sm mb-0"><tbody>${detail.targets.map(t=>`<tr><td class="small fw-semibold">${escapeHtml(t.uni_name)}</td><td class="small text-muted">${escapeHtml(t.department||'—')}</td><td>${tierBadge(t.tier)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    `;
  } catch(e) {
    panel.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
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
                      return `<tr>
                        <td class="small">${escapeHtml(app.uni_name||'—')}</td>
                        <td class="small text-muted">${escapeHtml(app.department||'—')}</td>
                        <td>${statusBadge(app.status)}</td>
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
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;
  try {
    const students = await GET('/api/students');
    const isIntakeStaff = State.user.role === 'intake_staff';
    const canEdit = hasRole('principal','counselor');

    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-person-vcard me-2"></i>${isIntakeStaff ? '学生查询' : '学生管理'}</h4>
      ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="openStudentModal()"><i class="bi bi-plus-lg me-1"></i>新增学生</button>` : ''}
    </div>
    ${isIntakeStaff ? '<div class="alert alert-info py-2 small mb-3"><i class="bi bi-info-circle me-1"></i>此页面为只读查询，点击"查看案例"可进入入学管理详情</div>' : ''}

    <div class="md-layout" style="height:calc(100vh - ${isIntakeStaff?'180':'140'}px)">
      <!-- 左侧学生列表 -->
      <div class="md-list">
        <div class="md-list-header">
          <input class="form-control form-control-sm" id="studentListSearch" placeholder="搜索姓名..." oninput="window._stuListFilter()">
          <select class="form-select form-select-sm mt-2" id="studentListGrade" onchange="window._stuListFilter()">
            <option value="">全部年级</option>
            <option value="G9">G9</option><option value="G10">G10</option>
            <option value="G11">G11</option><option value="G12">G12</option><option value="G13">G13</option>
            <option value="Year 9">Year 9</option><option value="Year 10">Year 10</option>
            <option value="Year 11">Year 11</option><option value="Year 12">Year 12</option><option value="Year 13">Year 13</option>
            <option value="其他">其他</option>
          </select>
          <div class="text-muted mt-1" style="font-size:11px" id="stuListCount">${students.length} 名学生</div>
        </div>
        <div class="md-list-body" id="studentListBody">
          ${_renderStudentListItems(students, isIntakeStaff)}
        </div>
      </div>

      <!-- 右侧详情面板 -->
      <div class="md-detail" id="studentListDetail">
        <div class="md-empty-detail">
          <i class="bi bi-person-vcard" style="font-size:2.5rem;opacity:.3"></i>
          <p class="text-muted mt-2">选择左侧学生查看详情</p>
        </div>
      </div>
    </div>`;

    window._allStudents = students;
    window._stuListFilter = () => {
      const search = (document.getElementById('studentListSearch')?.value||'').toLowerCase();
      const grade = document.getElementById('studentListGrade')?.value || '';
      const filtered = students.filter(s =>
        (!search || s.name.toLowerCase().includes(search)) &&
        (!grade || s.grade_level === grade)
      );
      const body = document.getElementById('studentListBody');
      if (body) body.innerHTML = _renderStudentListItems(filtered, isIntakeStaff);
      const cnt = document.getElementById('stuListCount');
      if (cnt) cnt.textContent = `${filtered.length} 名学生`;
    };
  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

function _renderStudentListItems(students, isIntakeStaff) {
  if (!students || students.length === 0) return '<div class="md-empty-detail" style="padding:2rem"><i class="bi bi-person-vcard" style="font-size:1.5rem;opacity:.3"></i><p class="text-muted small mt-1">暂无学生</p></div>';
  return students.map(s => `
    <div class="md-item" onclick="${isIntakeStaff ? `navigate('intake-cases',{student_id:'${s.id}'})` : `_selectStudent('${s.id}',this)`}" data-sid="${s.id}">
      <div class="d-flex justify-content-between align-items-center">
        <span class="md-item-name">${escapeHtml(s.name)}</span>
        ${s.overdue_count > 0 ? `<span class="badge badge-soft-danger" style="font-size:10px">${s.overdue_count}逾期</span>` : ''}
      </div>
      <div class="md-item-sub">${escapeHtml(s.grade_level)} · ${escapeHtml(s.exam_board||'—')}${s.mentors ? ` · ${escapeHtml(s.mentors.substring(0,15))}` : ''}</div>
    </div>`).join('');
}

async function _selectStudent(id, el) {
  document.querySelectorAll('#studentListBody .md-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  const panel = document.getElementById('studentListDetail');
  panel.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  try {
    const [detail, tasks] = await Promise.all([
      GET(`/api/students/${id}`),
      GET(`/api/students/${id}/tasks`),
    ]);
    const s = detail.student;
    const canEdit = hasRole('principal','counselor');
    const pending = tasks.filter(t => t.status !== 'done');
    const overdue = pending.filter(t => isOverdue(t.due_date, t.status));
    panel.innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h5 class="mb-1 fw-bold">${escapeHtml(s.name)}</h5>
          <div class="d-flex gap-1 flex-wrap">
            <span class="badge badge-soft-secondary">${escapeHtml(s.grade_level)}</span>
            <span class="badge badge-soft-info">${escapeHtml(s.exam_board||'—')}</span>
            ${s.enrol_date ? `<span class="badge bg-light text-dark border">入学 ${fmtDate(s.enrol_date)}</span>` : ''}
          </div>
        </div>
        <div class="d-flex gap-1">
          ${canEdit ? `<button class="action-icon-btn" title="编辑" onclick="openStudentModal('${id}')"><i class="bi bi-pencil"></i></button>` : ''}
          ${hasRole('principal') ? `<button class="action-icon-btn danger" title="删除" onclick="deleteStudent('${id}','${escapeHtml(s.name)}')"><i class="bi bi-trash"></i></button>` : ''}
          <button class="btn btn-primary btn-sm" onclick="navigate('student-detail',{studentId:'${id}'})"><i class="bi bi-box-arrow-up-right me-1"></i>完整档案</button>
        </div>
      </div>

      <!-- KPI -->
      <div class="row g-2 mb-3">
        <div class="col-3"><div class="stat-card accent-primary" style="padding:.75rem 1rem .75rem 1.25rem"><div class="stat-value" style="font-size:1.5rem">${pending.length}</div><div class="stat-label">待办</div></div></div>
        <div class="col-3"><div class="stat-card ${overdue.length>0?'accent-danger':'accent-success'}" style="padding:.75rem 1rem .75rem 1.25rem"><div class="stat-value" style="font-size:1.5rem;${overdue.length>0?'color:var(--danger)':''}">${overdue.length}</div><div class="stat-label">逾期</div></div></div>
        <div class="col-3"><div class="stat-card accent-info" style="padding:.75rem 1rem .75rem 1.25rem"><div class="stat-value" style="font-size:1.5rem">${detail.applications.length}</div><div class="stat-label">申请</div></div></div>
        <div class="col-3"><div class="stat-card accent-warning" style="padding:.75rem 1rem .75rem 1.25rem"><div class="stat-value" style="font-size:1.5rem">${detail.subjects.length}</div><div class="stat-label">选科</div></div></div>
      </div>

      ${s.notes ? `<div class="alert alert-light small py-2 mb-3"><i class="bi bi-sticky me-1"></i>${escapeHtml(s.notes)}</div>` : ''}

      <!-- 导师 -->
      ${detail.mentors.length > 0 ? `<div class="card mb-3"><div class="card-header fw-semibold small py-2"><i class="bi bi-person-check me-1 text-warning"></i>导师/规划师</div><div class="card-body p-0">${detail.mentors.map(m=>`<div class="px-3 py-2 border-bottom d-flex align-items-center gap-2"><div class="avatar-sm">${escapeHtml(m.staff_name.charAt(0))}</div><div><div class="small fw-semibold">${escapeHtml(m.staff_name)}</div><div class="text-muted" style="font-size:11px">${escapeHtml(m.role)}</div></div></div>`).join('')}</div></div>` : ''}

      <!-- 目标院校 -->
      ${detail.targets.length > 0 ? `<div class="card mb-3"><div class="card-header fw-semibold small py-2"><i class="bi bi-mortarboard me-1 text-primary"></i>目标院校 <span class="badge badge-soft-secondary ms-1">${detail.targets.length}</span></div><div class="card-body p-0"><table class="table table-sm mb-0"><tbody>${detail.targets.map(t=>`<tr><td class="small fw-semibold">${escapeHtml(t.uni_name)}</td><td class="small text-muted">${escapeHtml(t.department||'—')}</td><td>${tierBadge(t.tier)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}

      <!-- 待办任务 -->
      <div class="card mb-3">
        <div class="card-header fw-semibold small py-2 d-flex justify-content-between align-items-center">
          <span><i class="bi bi-list-check me-1 text-warning"></i>待办任务 <span class="badge badge-soft-warning ms-1">${pending.length}</span></span>
          ${canEdit || hasRole('mentor') ? `<button class="btn btn-outline-primary btn-sm py-0 px-2" style="font-size:11px" onclick="openTaskModal('${id}')"><i class="bi bi-plus"></i></button>` : ''}
        </div>
        <div class="card-body p-0" style="max-height:250px;overflow-y:auto">
          ${pending.length === 0 ? '<div class="text-center text-muted small py-3"><i class="bi bi-check-circle text-success me-1"></i>所有任务已完成</div>' :
          pending.slice(0,8).map(t => {
            const od = isOverdue(t.due_date, t.status);
            return `<div class="border-bottom px-3 py-2 d-flex justify-content-between align-items-center">
              <div style="min-width:0"><div class="small ${od?'text-danger fw-bold':''} text-truncate">${escapeHtml(t.title)}</div><small class="text-muted">${fmtDate(t.due_date)||'无期限'} · ${escapeHtml(t.category||'其他')}</small></div>
              ${od ? '<span class="badge badge-soft-danger" style="font-size:10px">逾期</span>' : `<span class="badge badge-soft-secondary" style="font-size:10px">${escapeHtml(t.status)}</span>`}
            </div>`;
          }).join('')}
          ${pending.length > 8 ? `<div class="text-center py-2"><a href="#" onclick="event.preventDefault();navigate('student-detail',{studentId:'${id}',activeTab:'tab-timeline'})" class="small text-primary">查看全部 ${pending.length} 项 →</a></div>` : ''}
        </div>
      </div>

      <!-- 申请概览 -->
      ${detail.applications.length > 0 ? `<div class="card"><div class="card-header fw-semibold small py-2"><i class="bi bi-send me-1 text-primary"></i>申请院校 <span class="badge badge-soft-primary ms-1">${detail.applications.length}</span></div><div class="card-body p-0"><table class="table table-sm mb-0"><tbody>${detail.applications.slice(0,5).map(a=>`<tr><td class="small fw-semibold">${escapeHtml(a.uni_name||'—')}</td><td class="small text-muted">${escapeHtml(a.department||'—')}</td><td>${statusBadge(a.status)}</td></tr>`).join('')}</tbody></table>${detail.applications.length>5?`<div class="text-center py-2"><a href="#" onclick="event.preventDefault();navigate('student-detail',{studentId:'${id}',activeTab:'tab-apps'})" class="small text-primary">查看全部 →</a></div>`:''}</div></div>` : ''}
    `;
  } catch(e) {
    panel.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
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

    // ── Computed data ──
    const pending = tasks.filter(t => t.status !== 'done');
    const overdue = pending.filter(t => isOverdue(t.due_date, t.status));
    const upcoming = pending.filter(t => !isOverdue(t.due_date, t.status)).sort((a,b)=>(a.due_date||'').localeCompare(b.due_date||'')).slice(0,5);
    const urgentTasks = [...overdue.slice(0,5), ...upcoming].slice(0,6);

    // Stage detection: which stages have data
    const hasSubjects = subjects.length > 0;
    const hasAssessments = assessments.length > 0;
    const hasApps = applications.length > 0;
    const hasOffer = applications.some(a => ['offer','conditional_offer','conditional','unconditional','firm','enrolled'].includes(a.status));
    const stages = [
      { key: 'subjects', label: '选科', done: hasSubjects },
      { key: 'tests', label: '标化', done: hasAssessments },
      { key: 'activities', label: '活动', done: false },
      { key: 'essays', label: '文书', done: false },
      { key: 'apps', label: '申请', done: hasApps },
      { key: 'offer', label: 'Offer', done: hasOffer },
    ];
    // Mark current = first non-done
    let currentFound = false;
    stages.forEach(s => { if (!s.done && !currentFound) { s.current = true; currentFound = true; } });

    // Collect empty sections for sidebar pending area
    const emptyItems = [];
    if (mentors.length === 0) emptyItems.push({ label: '导师', action: canEdit ? `openAssignMentorModal('${id}')` : null });
    if (subjects.length === 0) emptyItems.push({ label: '选科', action: canEdit ? `openSubjectModal('${id}')` : null });
    if (parents.length === 0) emptyItems.push({ label: '家长', action: canEdit ? `openParentModal('${id}')` : null });

    mc.innerHTML = `
    <!-- ═══ Hero Header ═══ -->
    <div class="stu-hero">
      <div class="stu-hero-top">
        <div class="stu-hero-identity">
          <button class="btn btn-outline-secondary btn-sm" style="padding:4px 8px" onclick="navigate(State.previousPage||(hasRole('student')?'student-portal':hasRole('parent')?'parent-portal':'students'))"><i class="bi bi-arrow-left"></i></button>
          <h4>${escapeHtml(student.name)}</h4>
          <span class="badge badge-soft-secondary">${escapeHtml(student.grade_level)}</span>
          <span class="badge badge-soft-info">${escapeHtml(student.exam_board||'—')}</span>
          ${isUnder14(student.date_of_birth) ? `<span class="badge badge-soft-warning" title="未满14周岁"><i class="bi bi-shield-exclamation me-1"></i>未满14岁</span>` : ''}
        </div>
        <div class="stu-hero-actions">
          ${canEdit ? `
            <button class="btn btn-outline-secondary btn-sm" onclick="openStudentModal('${id}')"><i class="bi bi-pencil me-1"></i>编辑</button>
            <div class="dropdown">
              <button class="btn btn-outline-secondary btn-sm dropdown-toggle" data-bs-toggle="dropdown"><i class="bi bi-three-dots me-1"></i>更多</button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><a class="dropdown-item" href="#" onclick="event.preventDefault();openAssignMentorModal('${id}')"><i class="bi bi-person-plus me-1"></i>分配导师</a></li>
                <li><a class="dropdown-item" href="#" onclick="event.preventDefault();openTimelineModal('${id}')"><i class="bi bi-magic me-1"></i>生成时间线</a></li>
                <li><a class="dropdown-item" href="#" onclick="event.preventDefault();openConsentModal('${id}')"><i class="bi bi-shield-check me-1"></i>监护人同意</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item" href="#" onclick="event.preventDefault();exportStudentPDF('${id}')"><i class="bi bi-file-pdf me-1"></i>导出PDF</a></li>
              </ul>
            </div>
          ` : ''}
          ${hasRole('parent','student') ? `<button class="btn btn-outline-primary btn-sm" onclick="openFeedbackModal('${id}')"><i class="bi bi-chat me-1"></i>反馈</button>` : ''}
        </div>
      </div>

      <!-- Stage Progress -->
      <div class="stu-stage-bar">
        ${stages.map((s, i) => `
          <div class="stu-stage-step">
            <div style="display:flex;flex-direction:column;align-items:center">
              <div class="stu-stage-dot ${s.done ? 'done' : s.current ? 'current' : ''}">${s.done ? '<i class="bi bi-check2"></i>' : (i+1)}</div>
              <div class="stu-stage-label ${s.done ? 'done' : s.current ? 'current' : ''}">${s.label}</div>
            </div>
            ${i < stages.length - 1 ? `<div class="stu-stage-line ${s.done ? 'done' : ''}" style="margin:0 4px;margin-bottom:14px"></div>` : ''}
          </div>
        `).join('')}
      </div>

      <!-- Alert Strip -->
      <div class="stu-alert-strip">
        ${overdue.length > 0 ? `<span class="stu-alert-chip danger"><i class="bi bi-exclamation-circle-fill"></i>${overdue.length} 项逾期</span>` : ''}
        ${pending.length > 0 ? `<span class="stu-alert-chip warning"><i class="bi bi-list-check"></i>${pending.length} 项待办</span>` : `<span class="stu-alert-chip success"><i class="bi bi-check-circle-fill"></i>任务已清</span>`}
        ${applications.length > 0 ? `<span class="stu-alert-chip info"><i class="bi bi-send-fill"></i>${applications.length} 所申请中</span>` : ''}
        ${student.notes ? `<span class="stu-alert-chip info" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(student.notes)}"><i class="bi bi-sticky-fill"></i>${escapeHtml(student.notes)}</span>` : ''}
      </div>
    </div>

    <!-- ═══ Tabs ═══ -->
    <ul class="nav nav-tabs mt-3 mb-0" id="student-tabs" style="padding:0 .5rem">
      <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#tab-overview">概览</a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-timeline">任务 ${pending.length?`<span class="badge badge-soft-primary ms-1">${pending.length}</span>`:''}</a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-apps">申请 ${applications.length?`<span class="badge badge-soft-primary ms-1">${applications.length}</span>`:''}</a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-materials">材料 ${materials.length?`<span class="badge badge-soft-primary ms-1">${materials.length}</span>`:''}</a></li>
      <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-activities"><i class="bi bi-trophy me-1"></i>活动</a></li>
      <li class="nav-item dropdown">
        <a class="nav-link dropdown-toggle" data-bs-toggle="dropdown" href="#" role="button">更多</a>
        <ul class="dropdown-menu">
          <li><a class="dropdown-item" data-bs-toggle="tab" href="#tab-essays"><i class="bi bi-journal-text me-1"></i>文书</a></li>
          <li><a class="dropdown-item" data-bs-toggle="tab" href="#tab-ps">个人陈述</a></li>
          <li><a class="dropdown-item" data-bs-toggle="tab" href="#tab-comms">沟通记录 ${comms.length?`(${comms.length})`:''}</a></li>
          <li><a class="dropdown-item" data-bs-toggle="tab" href="#tab-feedback">反馈 ${feedback.length?`(${feedback.length})`:''}</a></li>
          <li><a class="dropdown-item" data-bs-toggle="tab" href="#tab-exams">考试记录</a></li>
          <li><hr class="dropdown-divider"></li>
          <li><a class="dropdown-item" data-bs-toggle="tab" href="#tab-admission-eval">录取评估</a></li>
          <li><a class="dropdown-item" data-bs-toggle="tab" href="#tab-ai-plan">AI 规划</a></li>
        </ul>
      </li>
    </ul>

    <div class="tab-content" id="student-tab-content">
      <!-- ═══ Overview — Cockpit Layout ═══ -->
      <div class="tab-pane fade show active" id="tab-overview">
        <div class="stu-cockpit">

          <!-- ── LEFT: Main Zone ── -->
          <div class="stu-main">

            <!-- Urgent Tasks -->
            <div class="stu-main-section">
              <div class="stu-section-title">紧急关注</div>
              ${urgentTasks.length === 0
                ? `<div style="color:var(--text-tertiary);font-size:.82rem;padding:.5rem 0"><i class="bi bi-check-circle text-success me-1"></i>暂无紧急任务</div>`
                : urgentTasks.map(t => {
                    const od = isOverdue(t.due_date, t.status);
                    return `<div class="stu-task-row">
                      <div class="stu-task-title ${od?'overdue':''}">${escapeHtml(t.title)}</div>
                      <div class="stu-task-meta">${fmtDate(t.due_date)||'无期限'}</div>
                      ${od ? '<span class="badge badge-soft-danger" style="font-size:.65rem">逾期</span>' : '<span class="badge badge-soft-secondary" style="font-size:.65rem">待办</span>'}
                    </div>`;
                  }).join('')}
              ${pending.length > 6 ? `<div style="padding:.4rem .75rem"><a href="#" onclick="event.preventDefault();document.querySelector('a[href=\\'#tab-timeline\\']').click()" class="small text-primary">查看全部 ${pending.length} 项任务 →</a></div>` : ''}
            </div>

            <!-- Applications -->
            ${applications.length > 0 ? `
            <div class="stu-main-section">
              <div class="stu-section-title">申请进度</div>
              ${applications.map(a => `<div class="stu-app-row">
                <div class="stu-app-uni">${escapeHtml(a.uni_name||'—')}</div>
                <div class="stu-app-dept">${escapeHtml(a.department||'—')}</div>
                ${statusBadge(a.status)}
              </div>`).join('')}
            </div>` : ''}

            <!-- Target Universities (in main when has data) -->
            ${targets.length > 0 ? `
            <div class="stu-main-section">
              <div class="stu-section-title">目标院校 <span class="badge badge-soft-secondary ms-1" style="font-size:.6rem;text-transform:none;letter-spacing:0">${targets.length}</span></div>
              ${targets.map(t => `<div class="stu-app-row">
                <div class="stu-app-uni">${escapeHtml(t.uni_name)}</div>
                <div class="stu-app-dept">${escapeHtml(t.department||'—')}</div>
                ${tierBadge(t.tier)}
                ${canEdit ? `<button class="stu-sb-btn" style="color:#dc2626" onclick="deleteTarget('${t.id}','${id}')"><i class="bi bi-trash"></i></button>` : ''}
              </div>`).join('')}
              ${canEdit ? `<div style="padding:.4rem .75rem"><button class="btn btn-outline-primary btn-sm py-0 px-2" style="font-size:.75rem" onclick="openTargetModal('${id}')"><i class="bi bi-plus me-1"></i>添加院校</button></div>` : ''}
            </div>` : ''}

            <!-- Competitiveness -->
            <div class="stu-main-section">
              <div class="stu-section-title">竞争力分析</div>
              <div id="competitiveness-card"><div class="text-center text-muted py-2 small"><div class="spinner-border spinner-border-sm"></div></div></div>
            </div>

          </div>

          <!-- ── RIGHT: Sidebar ── -->
          <div class="stu-sidebar">

            <!-- Basic Info -->
            <div class="stu-sb-module">
              <div class="stu-sb-title"><span><i class="bi bi-person"></i>基本档案</span></div>
              <table class="stu-sb-table">
                <tr><th>年级</th><td>${escapeHtml(student.grade_level)}</td></tr>
                <tr><th>考试局</th><td>${escapeHtml(student.exam_board||'—')}</td></tr>
                <tr><th>入学</th><td>${fmtDate(student.enrol_date)||'—'}</td></tr>
                ${student.date_of_birth ? `<tr><th>出生</th><td>${fmtDate(student.date_of_birth)}${isUnder14(student.date_of_birth) ? ' <span class="badge badge-soft-warning" style="font-size:.6rem">未满14岁</span>' : ''}</td></tr>` : ''}
                ${student.notes ? `<tr><th>备注</th><td style="font-size:.78rem;color:var(--text-secondary)">${escapeHtml(student.notes)}</td></tr>` : ''}
              </table>
            </div>

            <!-- Team -->
            <div class="stu-sb-module">
              <div class="stu-sb-title">
                <span><i class="bi bi-people"></i>团队</span>
                ${canEdit ? `<button class="stu-sb-btn" onclick="openAssignMentorModal('${id}')" title="分配"><i class="bi bi-plus-lg"></i></button>` : ''}
              </div>
              ${mentors.length === 0
                ? `<div style="font-size:.78rem;color:var(--text-tertiary)">暂未分配导师</div>`
                : mentors.map(m => `<div class="stu-sb-team-row">
                    <div class="stu-sb-team-avatar">${escapeHtml(m.staff_name.charAt(0))}</div>
                    <div style="min-width:0">
                      <div style="font-size:.8rem;font-weight:600">${escapeHtml(m.staff_name)}</div>
                      <div style="font-size:.7rem;color:var(--text-tertiary)">${escapeHtml(m.role)}</div>
                    </div>
                    ${canEdit ? `<button class="stu-sb-btn" style="color:#dc2626;margin-left:auto" onclick="removeMentor('${m.id}','${id}')"><i class="bi bi-x"></i></button>` : ''}
                  </div>`).join('')}
            </div>

            <!-- Assessments -->
            ${assessments.length > 0 ? `
            <div class="stu-sb-module">
              <div class="stu-sb-title">
                <span><i class="bi bi-graph-up"></i>入学评估</span>
                ${canEdit ? `<button class="stu-sb-btn" onclick="openAssessmentModal('${id}')"><i class="bi bi-plus-lg"></i></button>` : ''}
              </div>
              ${assessments.map(a => `<div class="stu-sb-assess">
                <div>
                  <div style="font-size:.8rem;font-weight:600">${escapeHtml(a.assess_type)}</div>
                  <div style="font-size:.7rem;color:var(--text-tertiary)">${escapeHtml(a.subject||'')} · ${fmtDate(a.assess_date)}</div>
                </div>
                <div style="text-align:right">
                  <span class="stu-sb-assess-score">${a.score}</span><span style="font-size:.72rem;color:var(--text-tertiary)">/${a.max_score}</span>
                  ${a.percentile ? `<div style="font-size:.68rem;color:var(--text-tertiary)">${a.percentile}%ile</div>` : ''}
                </div>
              </div>`).join('')}
            </div>` : ''}

            <!-- Subjects -->
            ${subjects.length > 0 ? `
            <div class="stu-sb-module">
              <div class="stu-sb-title">
                <span><i class="bi bi-book"></i>选科</span>
                ${canEdit ? `<button class="stu-sb-btn" onclick="openSubjectModal('${id}')"><i class="bi bi-plus-lg"></i></button>` : ''}
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:.35rem">
                ${subjects.map(s => `<span class="ov-subject-tag" style="font-size:.72rem;padding:.2rem .5rem">
                  <strong>${escapeHtml(s.code)}</strong>
                  ${s.level ? `<span style="color:var(--text-secondary)">${escapeHtml(s.level)}</span>` : ''}
                  ${canEdit ? `<button class="tag-remove" onclick="removeSubject('${s.id}','${id}')"><i class="bi bi-x"></i></button>` : ''}
                </span>`).join('')}
              </div>
            </div>` : ''}

            <!-- Profile Tags -->
            <div class="stu-sb-module">
              <div class="stu-sb-title">
                <span><i class="bi bi-tags"></i>画像</span>
                ${canEdit ? `<button class="stu-sb-btn" onclick="openProfileExtModal('${id}')"><i class="bi bi-pencil"></i></button>` : ''}
              </div>
              <div id="profile-tags-card"><div class="text-center text-muted py-1 small"><div class="spinner-border spinner-border-sm"></div></div></div>
            </div>

            <!-- Awards -->
            <div class="stu-sb-module">
              <div class="stu-sb-title"><span><i class="bi bi-award"></i>荣誉</span></div>
              <div id="awards-card"><div class="text-center text-muted py-1 small"><div class="spinner-border spinner-border-sm"></div></div></div>
            </div>

            <!-- Parents -->
            ${parents.length > 0 ? `
            <div class="stu-sb-module">
              <div class="stu-sb-title">
                <span><i class="bi bi-people"></i>家长</span>
                ${canEdit ? `<button class="stu-sb-btn" onclick="openParentModal('${id}')"><i class="bi bi-plus-lg"></i></button>` : ''}
              </div>
              ${parents.map(p => `<div style="font-size:.78rem;padding:.3rem 0;${parents.indexOf(p)>0?'border-top:1px solid color-mix(in srgb, var(--border) 50%, transparent)':''}">
                <div style="font-weight:600">${escapeHtml(p.name)} <span style="font-weight:400;color:var(--text-tertiary);font-size:.72rem">${escapeHtml(p.relation||'')}</span></div>
                ${p.phone ? `<div style="color:var(--text-secondary);font-size:.72rem"><i class="bi bi-telephone me-1"></i>${escapeHtml(p.phone)}</div>` : ''}
                ${p.email ? `<div style="color:var(--text-secondary);font-size:.72rem"><i class="bi bi-envelope me-1"></i>${escapeHtml(p.email)}</div>` : ''}
              </div>`).join('')}
            </div>` : ''}

            <!-- Pending Items — consolidated empty states -->
            ${emptyItems.length > 0 ? `
            <div class="stu-sb-module">
              <div class="stu-sb-title"><span>待补充信息</span></div>
              <div class="stu-pending-items">
                ${emptyItems.map(item => item.action
                  ? `<span class="stu-pending-chip" style="cursor:pointer" onclick="${item.action}"><i class="bi bi-plus-circle"></i>${item.label}</span>`
                  : `<span class="stu-pending-chip"><i class="bi bi-dash-circle"></i>${item.label}</span>`
                ).join('')}
              </div>
            </div>` : ''}

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

      <!-- 课外活动 Tab -->
      <div class="tab-pane fade" id="tab-activities">
        <div id="activities-container"><div class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> 加载中...</div></div>
      </div>

      <!-- 文书管理 Tab -->
      <div class="tab-pane fade" id="tab-essays">
        <div id="essays-container"><div class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> 加载中...</div></div>
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

    // 活动 tab：切换时加载
    const actTabEl = document.querySelector('a[href="#tab-activities"]');
    if (actTabEl) {
      actTabEl.addEventListener('shown.bs.tab', () => loadActivitiesTab(id));
      if (activeTab === 'tab-activities') loadActivitiesTab(id);
    }

    // 文书 tab：切换时加载
    const essayTabEl = document.querySelector('a[href="#tab-essays"]');
    if (essayTabEl) {
      essayTabEl.addEventListener('shown.bs.tab', () => loadEssaysTab(id));
      if (activeTab === 'tab-essays') loadEssaysTab(id);
    }

    // 概览新卡片异步加载
    loadOverviewProfileTags(id);
    loadOverviewCompetitiveness(id);
    loadOverviewAwards(id);

  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════
//  概览模块异步加载
// ════════════════════════════════════════════════════════
async function loadOverviewProfileTags(studentId) {
  const el = document.getElementById('profile-tags-card');
  if (!el) return;
  try {
    const p = await GET(`/api/students/${studentId}/profile-ext`);
    if (!p || (!p.mbti && !p.holland_code && !p.academic_interests && !p.strengths)) {
      el.innerHTML = `<div style="font-size:.78rem;color:var(--text-tertiary)">暂无画像数据</div>`;
      return;
    }
    let html = '';
    if (p.mbti) html += `<span class="badge bg-primary me-1 mb-1">MBTI: ${escapeHtml(p.mbti)}</span>`;
    if (p.holland_code) html += `<span class="badge bg-success me-1 mb-1">Holland: ${escapeHtml(p.holland_code)}</span>`;
    if (p.academic_interests) {
      try {
        const tags = JSON.parse(p.academic_interests);
        tags.forEach(t => { html += `<span class="badge bg-info me-1 mb-1">${escapeHtml(t)}</span>`; });
      } catch(_) { html += `<span class="badge bg-info me-1 mb-1">${escapeHtml(p.academic_interests)}</span>`; }
    }
    if (p.strengths) {
      try {
        const tags = JSON.parse(p.strengths);
        tags.forEach(t => { html += `<span class="badge bg-warning text-dark me-1 mb-1">${escapeHtml(t)}</span>`; });
      } catch(_) { html += `<span class="badge bg-warning text-dark me-1 mb-1">${escapeHtml(p.strengths)}</span>`; }
    }
    if (p.career_goals) html += `<div class="mt-1 small text-muted"><i class="bi bi-bullseye me-1"></i>${escapeHtml(p.career_goals)}</div>`;
    el.innerHTML = `<div style="padding:.5rem">${html}</div>`;
  } catch(e) {
    el.innerHTML = `<div style="font-size:.78rem;color:var(--text-tertiary)">暂无画像数据</div>`;
  }
}

async function loadOverviewCompetitiveness(studentId) {
  const el = document.getElementById('competitiveness-card');
  if (!el) return;
  try {
    const c = await GET(`/api/students/${studentId}/competitiveness`);
    if (!c || (c.academics === 0 && c.tests === 0 && c.activities === 0 && c.leadership === 0 && c.essays === 0)) {
      el.innerHTML = `<div style="font-size:.78rem;color:var(--text-tertiary);padding:.25rem 0"><i class="bi bi-graph-up me-1"></i>暂无竞争力数据</div>`;
      return;
    }
    const dims = [
      ['academics', '学术', c.academics], ['tests', '标化', c.tests],
      ['activities', '活动', c.activities], ['leadership', '领导力', c.leadership],
      ['essays', '文书', c.essays]
    ];
    const overall = c.overall;
    const overallClass = overall >= 70 ? 'success' : overall >= 40 ? 'warning' : 'danger';
    let bars = dims.map(([k, label, v]) => {
      const pct = Math.round(v);
      const cls = pct >= 70 ? 'high' : pct >= 30 ? 'medium' : 'low';
      return `<div class="stu-comp-row"><div class="stu-comp-label">${label}</div><div class="stu-comp-bar"><div class="stu-comp-fill ${cls}" style="width:${pct}%"></div></div><div class="stu-comp-pct">${pct}%</div></div>`;
    }).join('');
    el.innerHTML = `<div style="display:flex;align-items:center;gap:1rem;margin-bottom:.75rem">
      <div style="font-size:2rem;font-weight:800;color:var(--text-primary);line-height:1">${overall}<span style="font-size:.875rem;font-weight:500;color:var(--text-tertiary)">%</span></div>
      <div style="font-size:.75rem;color:var(--text-tertiary)">综合竞争力<br><span class="badge badge-soft-${overallClass}" style="font-size:.65rem">${overall >= 70 ? '优秀' : overall >= 40 ? '中等' : '待提升'}</span></div>
    </div>${bars}`;
  } catch(e) {
    el.innerHTML = `<div style="font-size:.78rem;color:var(--text-tertiary);padding:.25rem 0"><i class="bi bi-graph-up me-1"></i>暂无竞争力数据</div>`;
  }
}

async function loadOverviewAwards(studentId) {
  const el = document.getElementById('awards-card');
  if (!el) return;
  try {
    const awards = await GET(`/api/students/${studentId}/awards`);
    if (!awards || awards.length === 0) {
      el.innerHTML = `<div style="font-size:.78rem;color:var(--text-tertiary)">暂无荣誉记录</div>`;
      return;
    }
    const top3 = awards.slice(0, 3);
    const levelBadge = { international: 'danger', national: 'warning', province: 'info', city: 'secondary', school: 'light text-dark' };
    let html = top3.map(a => `<div class="d-flex align-items-center mb-1"><i class="bi bi-award-fill text-warning me-1"></i><span class="small">${escapeHtml(a.name)}</span>${a.level ? `<span class="badge bg-${levelBadge[a.level]||'secondary'} ms-1" style="font-size:.65rem">${escapeHtml(a.level)}</span>` : ''}</div>`).join('');
    if (awards.length > 3) html += `<div class="text-muted small mt-1">还有 ${awards.length - 3} 项...</div>`;
    el.innerHTML = `<div style="padding:.5rem">${html}</div>`;
  } catch(e) {
    el.innerHTML = `<div class="ov-empty" style="padding:.75rem"><i class="bi bi-award"></i><span>暂无荣誉记录</span></div>`;
  }
}

// 编辑扩展画像弹窗
async function openProfileExtModal(studentId) {
  let p = {};
  try { p = await GET(`/api/students/${studentId}/profile-ext`) || {}; } catch(_) {}
  const interests = p.academic_interests ? (typeof p.academic_interests === 'string' ? p.academic_interests : JSON.stringify(p.academic_interests)) : '';
  const strengths = p.strengths ? (typeof p.strengths === 'string' ? p.strengths : JSON.stringify(p.strengths)) : '';

  const html = `<div class="modal fade" id="profileExtModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">编辑画像标签</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body">
    <div class="mb-3"><label class="form-label">MBTI 类型</label><input class="form-control" id="pext-mbti" value="${escapeHtml(p.mbti||'')}" placeholder="如 INTJ"></div>
    <div class="mb-3"><label class="form-label">Holland 代码</label><input class="form-control" id="pext-holland" value="${escapeHtml(p.holland_code||'')}" placeholder="如 RIA"></div>
    <div class="mb-3"><label class="form-label">兴趣标签（逗号分隔）</label><input class="form-control" id="pext-interests" value="${escapeHtml(interests.replace(/[\[\]"]/g,''))}" placeholder="如 编程,音乐,数学"></div>
    <div class="mb-3"><label class="form-label">个人优势（逗号分隔）</label><input class="form-control" id="pext-strengths" value="${escapeHtml(strengths.replace(/[\[\]"]/g,''))}" placeholder="如 批判性思维,团队协作"></div>
    <div class="mb-3"><label class="form-label">职业目标</label><input class="form-control" id="pext-career" value="${escapeHtml(p.career_goals||'')}"></div>
  </div><div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button class="btn btn-primary" onclick="saveProfileExt('${studentId}')">保存</button></div></div></div></div>`;
  document.getElementById('profileExtModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('profileExtModal')).show();
}

async function saveProfileExt(studentId) {
  const academic_interests = document.getElementById('pext-interests').value.split(',').map(s=>s.trim()).filter(Boolean);
  const strengths = document.getElementById('pext-strengths').value.split(',').map(s=>s.trim()).filter(Boolean);
  await api('PUT', `/api/students/${studentId}/profile-ext`, {
    mbti: document.getElementById('pext-mbti').value.trim() || null,
    holland_code: document.getElementById('pext-holland').value.trim() || null,
    academic_interests,
    strengths,
    career_goals: document.getElementById('pext-career').value.trim() || null,
  });
  bootstrap.Modal.getInstance(document.getElementById('profileExtModal'))?.hide();
  loadOverviewProfileTags(studentId);
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

    el.innerHTML = `<table class="table table-sm table-hover mb-0">
      <thead class="table-light"><tr>
        <th class="ps-3">文件名</th><th>类型</th><th>状态</th><th>版本</th><th>操作</th>
      </tr></thead>
      <tbody>
        ${filtered.map(m => `<tr>
          <td class="ps-3 fw-semibold">${escapeHtml(m.title || m.material_type)}</td>
          <td><span class="badge bg-light text-dark border">${escapeHtml(m.material_type)}</span></td>
          <td>${statusBadge(m.status)}</td>
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
    const resp = await fetch(`/api/materials/${created.id}/upload`, { method: 'POST', body: fd, credentials: 'include' });
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
            <button class="btn btn-sm btn-outline-secondary" onclick="openApplicationModal('${safeId(studentId)}','${safeId(a.id)}')"><i class="bi bi-pencil"></i> 编辑</button>
            ${hasRole('principal','counselor') ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteApplication('${safeId(a.id)}','${safeId(studentId)}','${escapeHtml(a.uni_name)}')"><i class="bi bi-trash"></i></button>` : ''}
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
    const roles = [...new Set(staff.map(s => s.role).filter(Boolean))];
    const roleLabel = { counselor:'规划师', mentor:'导师', principal:'校长', student_admin:'学管' };
    const roleBadge = r => r==='counselor'?'badge-soft-success':r==='mentor'?'badge-soft-info':r==='principal'?'badge-soft-primary':'badge-soft-secondary';

    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-people me-2"></i>师资管理</h4>
      <div class="page-header-actions">
        ${hasRole('principal') ? `<button class="btn btn-primary btn-sm" onclick="openStaffModal()"><i class="bi bi-plus-lg me-1"></i>新增教职工</button>` : ''}
      </div>
    </div>
    <!-- FilterBar -->
    <div class="d-flex align-items-center gap-2 mb-3 flex-wrap">
      <div class="filter-chip-group">
        <button class="filter-chip active" onclick="window._staffFilter='';window._renderStaffTable()">全部 <span class="text-muted">${staff.length}</span></button>
        ${roles.map(r => `<button class="filter-chip" onclick="window._staffFilter='${r}';window._renderStaffTable()">${roleLabel[r]||r} <span class="text-muted">${staff.filter(s=>s.role===r).length}</span></button>`).join('')}
      </div>
      <div class="ms-auto">
        <input class="form-control form-control-sm" id="staffSearch" placeholder="搜索姓名..." style="width:160px" oninput="window._renderStaffTable()">
      </div>
    </div>
    <!-- Table -->
    <div class="card">
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead class="table-light"><tr><th>姓名</th><th>角色</th><th>邮箱</th><th>电话</th><th>学生负载</th>${hasRole('principal')?'<th class="text-center">操作</th>':''}</tr></thead>
            <tbody id="staffTbody"></tbody>
          </table>
        </div>
      </div>
    </div>`;

    window._staffFilter = '';
    window._renderStaffTable = function() {
      const kw = (document.getElementById('staffSearch')?.value||'').trim().toLowerCase();
      const filtered = staff.filter(s => {
        if (window._staffFilter && s.role !== window._staffFilter) return false;
        if (kw && !s.name.toLowerCase().includes(kw)) return false;
        return true;
      });
      // Update active chip
      document.querySelectorAll('.filter-chip').forEach(c => {
        const isAll = !c.onclick.toString().includes("_staffFilter='") || c.onclick.toString().includes("_staffFilter=''");
        const chipRole = c.textContent.trim().split(' ')[0];
        c.classList.toggle('active', window._staffFilter === '' ? isAll : (roleLabel[window._staffFilter]||window._staffFilter) === chipRole);
      });
      const tbody = document.getElementById('staffTbody');
      if (!tbody) return;
      tbody.innerHTML = filtered.length ? filtered.map(s => {
        const pct = s.capacity_students > 0 ? Math.round(s.current_students/s.capacity_students*100) : 0;
        const cls = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success';
        const barGrad = cls==='danger'?'progress-bar-gradient-red':cls==='warning'?'progress-bar-gradient-yellow':'progress-bar-gradient-green';
        return `<tr>
          <td>
            <div class="d-flex align-items-center gap-2">
              <div class="avatar-sm">${escapeHtml(s.name.charAt(0))}</div>
              <span class="fw-semibold">${escapeHtml(s.name)}</span>
            </div>
          </td>
          <td><span class="badge badge-soft-${s.role==='counselor'?'success':s.role==='mentor'?'info':s.role==='principal'?'primary':'secondary'}">${escapeHtml(roleLabel[s.role]||s.role)}</span></td>
          <td class="text-muted small">${escapeHtml(s.email||'—')}</td>
          <td class="text-muted small">${escapeHtml(s.phone||'—')}</td>
          <td style="min-width:140px">
            <div class="d-flex align-items-center gap-2">
              <div class="progress flex-grow-1" style="height:6px;border-radius:999px">
                <div class="progress-bar ${barGrad}" style="width:${pct}%;border-radius:999px"></div>
              </div>
              <span class="small text-${cls} fw-semibold" style="min-width:40px">${s.current_students}/${s.capacity_students||'—'}</span>
            </div>
          </td>
          ${hasRole('principal')?`<td class="text-center">
            <button class="action-icon-btn" title="编辑" onclick="openStaffModal('${escapeHtml(s.id)}')"><i class="bi bi-pencil"></i></button>
            <button class="action-icon-btn danger" title="重置密码" onclick="resetStaffPassword('${escapeHtml(s.id)}','${escapeHtml(s.name)}')"><i class="bi bi-key"></i></button>
          </td>`:''}
        </tr>`;
      }).join('') : '<tr><td colspan="6"><div class="empty-state-block"><i class="bi bi-people"></i><p>暂无匹配的教职工</p></div></td></tr>';
    };
    window._renderStaffTable();
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
    const types = [...new Set(feedback.map(f => f.feedback_type).filter(Boolean))];
    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-chat-dots me-2"></i>反馈管理</h4>
    </div>

    <div class="md-layout" style="height:calc(100vh - 140px)">
      <div class="md-list">
        <div class="md-list-header">
          <input class="form-control form-control-sm" id="fb-search" placeholder="搜索内容..." oninput="window._fbFilter()">
          <div class="filter-chip-group mt-2" style="flex-wrap:wrap">
            <button class="filter-chip active" data-fb-type="" onclick="window._fbFilterType(this)" style="font-size:11px;padding:2px 8px">全部 <span style="opacity:.5">${feedback.length}</span></button>
            ${types.map(t => `<button class="filter-chip" data-fb-type="${escapeHtml(t)}" onclick="window._fbFilterType(this)" style="font-size:11px;padding:2px 8px">${escapeHtml(t)} <span style="opacity:.5">${feedback.filter(f=>f.feedback_type===t).length}</span></button>`).join('')}
          </div>
        </div>
        <div class="md-list-body" id="fb-list-body">
          ${feedback.length === 0 ? '<div class="text-center text-muted small py-4">暂无反馈</div>' :
          feedback.map(f => `
          <div class="md-item fb-item" data-fb-type="${escapeHtml(f.feedback_type||'')}" data-fbid="${escapeHtml(f.id)}" onclick="selectFeedbackItem(${JSON.stringify(f).replace(/"/g,'&quot;')},this)">
            <div class="d-flex justify-content-between align-items-center">
              <span class="md-item-name">${escapeHtml(f.student_name)}</span>
              ${f.rating ? `<span class="small text-warning" style="font-size:10px">${'★'.repeat(parseInt(f.rating))}</span>` : ''}
            </div>
            <div class="md-item-sub">${escapeHtml(f.feedback_type||'—')} · ${escapeHtml(f.content.substring(0,30))}...</div>
          </div>`).join('')}
        </div>
      </div>

      <div class="md-detail" id="fb-detail">
        <div class="md-empty-detail">
          <i class="bi bi-chat-dots" style="font-size:2.5rem;opacity:.3"></i>
          <p class="text-muted mt-2">选择左侧反馈查看详情</p>
        </div>
      </div>
    </div>`;

    window._fbFilterType = (btn) => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      window._fbFilter();
    };
    window._fbFilter = () => {
      const type = document.querySelector('.filter-chip.active')?.dataset.fbType || '';
      const search = (document.getElementById('fb-search')?.value||'').toLowerCase();
      document.querySelectorAll('#fb-list-body .fb-item').forEach(el => {
        const matchType = !type || el.dataset.fbType === type;
        const matchSearch = !search || el.textContent.toLowerCase().includes(search);
        el.style.display = matchType && matchSearch ? '' : 'none';
      });
    };
  } catch(e) {
    mc.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

function selectFeedbackItem(f, el) {
  document.querySelectorAll('#fb-list-body .md-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  const panel = document.getElementById('fb-detail');
  panel.innerHTML = `
    <div class="mb-4">
      <div class="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h5 class="fw-bold mb-1">${escapeHtml(f.student_name)}</h5>
          <div class="d-flex gap-2 align-items-center">
            <span class="badge badge-soft-info">${escapeHtml(f.feedback_type)}</span>
            <span class="badge badge-soft-secondary">${escapeHtml(f.from_role)}</span>
            ${f.rating ? `<span class="text-warning">${'★'.repeat(parseInt(f.rating))}${'☆'.repeat(5-parseInt(f.rating))}</span>` : ''}
          </div>
        </div>
        <small class="text-muted">${fmtDatetime(f.created_at)}</small>
      </div>
      <div class="card mb-3">
        <div class="card-body">
          <p class="mb-0">${escapeHtml(f.content)}</p>
        </div>
      </div>
      ${f.response ? `<div class="card border-success mb-3"><div class="card-header small fw-semibold text-success py-2"><i class="bi bi-check-circle me-1"></i>已回复</div><div class="card-body"><p class="mb-0 small">${escapeHtml(f.response)}</p></div></div>` : ''}
      <div class="d-flex gap-2">
        ${!f.response ? `<button class="btn btn-success" data-fbid="${escapeHtml(f.id)}" data-fbcontent="${escapeHtml(f.content)}" onclick="openFeedbackResponse(this.dataset.fbid, this.dataset.fbcontent)">
          <i class="bi bi-reply me-1"></i>回复并标记解决
        </button>` : ''}
        <button class="btn btn-outline-primary" onclick="navigate('student-detail',{studentId:'${f.student_id}'})">
          <i class="bi bi-person me-1"></i>查看学生档案
        </button>
      </div>
    </div>`;
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

async function openStaffModal(editId) {
  document.getElementById('st-id').value = '';
  document.getElementById('st-name').value = '';
  document.getElementById('st-email').value = '';
  document.getElementById('st-phone').value = '';
  document.getElementById('st-subjects').value = '';
  document.getElementById('st-capacity').value = '20';
  ['eb-edexcel','eb-cie','eb-alevel'].forEach(id => document.getElementById(id).checked = false);

  if (editId) {
    try {
      const data = await GET(`/api/staff/${editId}`);
      const s = data.staff;
      document.getElementById('st-id').value = s.id;
      document.getElementById('st-name').value = s.name || '';
      document.getElementById('st-role').value = s.role || 'counselor';
      document.getElementById('st-email').value = s.email || '';
      document.getElementById('st-phone').value = s.phone || '';
      let subjects = [];
      try { subjects = JSON.parse(s.subjects || '[]'); } catch(e) {}
      document.getElementById('st-subjects').value = subjects.join(', ');
      document.getElementById('st-capacity').value = s.capacity_students || 20;
      let boards = [];
      try { boards = JSON.parse(s.exam_board_exp || '[]'); } catch(e) {}
      document.getElementById('eb-edexcel').checked = boards.includes('Edexcel');
      document.getElementById('eb-cie').checked = boards.includes('CIE');
      document.getElementById('eb-alevel').checked = boards.includes('A-Level');
      document.getElementById('staff-modal-title').textContent = '编辑教职工';
      document.getElementById('save-staff-btn').textContent = '保存修改';
    } catch(e) {
      showError('加载教职工信息失败：' + e.message);
      return;
    }
  } else {
    document.getElementById('staff-modal-title').textContent = '新增教职工';
    document.getElementById('save-staff-btn').textContent = '保存（自动创建账号）';
  }
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
  const name = document.getElementById('s-name').value.trim();
  const grade_level = document.getElementById('s-grade').value;
  if (!name) { releaseSubmit('saveStudent'); showError('请填写学生姓名'); return; }
  if (!id && !grade_level) { releaseSubmit('saveStudent'); showError('请选择年级'); return; }
  const body = {
    name,
    grade_level,
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
  const stName = document.getElementById('st-name').value.trim();
  const stRole = document.getElementById('st-role').value;
  const stEmail = document.getElementById('st-email').value.trim();
  if (!stName) { releaseSubmit('saveStaff'); showError('请填写教职工姓名'); return; }
  if (!stRole) { releaseSubmit('saveStaff'); showError('请选择角色'); return; }
  if (!stEmail) { releaseSubmit('saveStaff'); showError('请填写邮箱'); return; }
  const boards = [];
  if (document.getElementById('eb-edexcel').checked) boards.push('Edexcel');
  if (document.getElementById('eb-cie').checked) boards.push('CIE');
  if (document.getElementById('eb-alevel').checked) boards.push('A-Level');
  const subjStr = document.getElementById('st-subjects').value;
  const subjects = subjStr ? subjStr.split(',').map(s=>s.trim()).filter(Boolean) : [];
  const body = {
    name: stName,
    role: stRole,
    email: stEmail,
    phone: document.getElementById('st-phone').value,
    exam_board_exp: boards,
    subjects,
    capacity_students: parseInt(document.getElementById('st-capacity').value) || 20,
  };
  const editId = document.getElementById('st-id').value;
  try {
    if (editId) {
      await PUT(`/api/staff/${editId}`, body);
      bootstrap.Modal.getInstance(document.getElementById('staff-modal')).hide();
      State.staffList = [];
      navigate('staff');
      showToast('教职工信息已更新', 'success');
    } else {
      const res = await POST('/api/staff', body);
      bootstrap.Modal.getInstance(document.getElementById('staff-modal')).hide();
      State.staffList = [];
      navigate('staff');
      // Show credentials in a dedicated modal rather than a fleeting toast
      setTimeout(() => showStaffCredentials(res.username, res.default_password), 300);
    }
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

function resetStaffPassword(staffId, staffName) {
  confirmAction(`确定要重置 "${staffName}" 的登录密码？重置后密码将变为初始密码，该员工下次登录时需重新设置。`, async () => {
    try {
      const res = await POST(`/api/staff/${staffId}/reset-password`, {});
      showStaffCredentials(res.username, res.new_password);
    } catch(e) {
      showError('重置密码失败：' + e.message);
    }
  });
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
  confirmAction('确定删除此任务？删除后不可恢复。', async () => {
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
  confirmAction('确定解除此导师分配？解除后该导师将不再负责此学生。', async () => {
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
    window.location.hash = '';
    document.getElementById('app').classList.add('d-none');
    document.getElementById('login-page').classList.remove('d-none');
    document.getElementById('login-password').value = '';
  });


  // 侧边栏切换（桌面折叠 + 手机滑出）
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    const sb = document.getElementById('sidebar');
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      sb.classList.toggle('mobile-open');
      let overlay = document.querySelector('.mobile-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'mobile-overlay';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', () => {
          sb.classList.remove('mobile-open');
          overlay.classList.remove('show');
        });
      }
      overlay.classList.toggle('show', sb.classList.contains('mobile-open'));
    } else {
      sb.classList.toggle('collapsed');
      document.getElementById('main-content').classList.toggle('sidebar-collapsed');
    }
  });
  // 点击导航项时自动关闭手机侧边栏
  document.querySelectorAll('.sidebar .nav-item').forEach(el => {
    el.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('mobile-open');
        const ov = document.querySelector('.mobile-overlay');
        if (ov) ov.classList.remove('show');
      }
    });
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
    const roles = (el.dataset.sectionRoles || '').split(',').map(r => r.trim());
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
    if (window._notifBadgeTimer) clearInterval(window._notifBadgeTimer);
    window._notifBadgeTimer = setInterval(loadNotificationBadge, 15 * 1000); // 每15秒刷新
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
      if (hashPage && PAGES[hashPage] && canAccessPage(hashPage)) {
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
  showToast('正在打开打印预览...', 'info');
  setTimeout(() => window.print(), 200);
}

// 在 page-header 右侧注入 PDF 按钮（通用）
function injectPrintBtn() {
  const header = document.querySelector('.page-header');
  if (!header || header.querySelector('.print-btn')) return;
  // 如果页面已有自定义导出按钮，不重复注入
  const existing = header.querySelectorAll('button');
  for (const b of existing) { if (b.textContent.includes('导出') || b.textContent.includes('PDF')) return; }
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
    const { template, items } = await GET('/api/templates/'+templateId);
    const html = '<div class="fw-bold mb-2" style="font-size:1.05rem">'+escapeHtml(template.name)+'</div>'
      +(template.description ? '<p class="small text-muted">'+escapeHtml(template.description)+'</p>' : '')
      +'<div class="table-responsive"><table class="table table-sm table-hover mb-0">'
      +'<thead class="table-light"><tr><th style="width:40px">#</th><th>任务</th><th>分类</th><th>提前天数</th><th>优先级</th></tr></thead>'
      +'<tbody>'
      +items.map(function(item,i){
        var daysText = item.days_before_deadline >= 0 ? '提前 '+item.days_before_deadline+' 天' : '截止后 '+Math.abs(item.days_before_deadline)+' 天';
        var priBadge = item.priority==='high'?'<span class="badge bg-danger">高</span>':item.priority==='low'?'<span class="badge bg-secondary">低</span>':'<span class="badge bg-light text-dark">普通</span>';
        return '<tr><td>'+( i+1)+'</td><td>'+escapeHtml(item.title)+'</td><td><span class="badge bg-secondary">'+escapeHtml(item.category)+'</span></td><td>'+daysText+'</td><td>'+priBadge+'</td></tr>';
      }).join('')
      +'</tbody></table></div>';
    // 使用 showModal 代替 confirm-modal，支持更大区域和滚动
    showModal('模板预览: '+escapeHtml(template.name), html, function(){ return true; }, '关闭', 'lg');
    // 隐藏不需要的取消按钮
    var okBtn = document.getElementById('generic-form-ok');
    if (okBtn) { okBtn.className = 'btn btn-secondary'; }
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
      // ── 新增设置 draft ──
      intake_case_statuses: [...(JSON.parse(settings.intake_case_statuses || '[]'))],
      visa_document_types: [...(JSON.parse(settings.visa_document_types || '[]'))],
      arrival_checklist: [...(JSON.parse(settings.arrival_checklist || '[]'))],
      commission_rule_types: [...(JSON.parse(settings.commission_rule_types || '[]'))],
      essay_types: [...(JSON.parse(settings.essay_types || '[]'))],
      essay_statuses: [...(JSON.parse(settings.essay_statuses || '[]'))],
      essay_annotation_statuses: [...(JSON.parse(settings.essay_annotation_statuses || '[]'))],
      activity_categories: [...(JSON.parse(settings.activity_categories || '[]'))],
      activity_impact_levels: [...(JSON.parse(settings.activity_impact_levels || '[]'))],
      material_statuses: [...(JSON.parse(settings.material_statuses || '[]'))],
      valid_grade_levels: [...(JSON.parse(settings.valid_grade_levels || '[]'))],
      valid_student_statuses: [...(JSON.parse(settings.valid_student_statuses || '[]'))],
      reference_task_keywords: [...(JSON.parse(settings.reference_task_keywords || '[]'))],
      application_statuses: [...(JSON.parse(settings.application_statuses || '[]'))],
    };

    const tierColors = { '冲刺':'danger','意向':'primary','保底':'success','通用':'secondary' };
    const routeIcons = { 'UK-UG':'🇬🇧','US':'🇺🇸','CA':'🇨🇦','AU':'🇦🇺','SG':'🇸🇬','通用':'🌐' };

    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-gear me-2"></i>系统设置</h4>
    </div>
    <div class="settings-layout">
      <div class="settings-nav">
        <div class="nav flex-column nav-pills" id="settings-tabs" role="tablist">
          <small class="text-muted px-2 py-1 d-block fw-bold" style="font-size:10px;letter-spacing:1px">基础设置</small>
          <a class="nav-link active" href="#stab-appearance" data-bs-toggle="tab"><i class="bi bi-palette me-1"></i>外观与显示</a>
          <a class="nav-link" href="#stab-system" data-bs-toggle="tab"><i class="bi bi-building me-1"></i>系统信息</a>
          <hr class="my-1">
          <small class="text-muted px-2 py-1 d-block fw-bold" style="font-size:10px;letter-spacing:1px">教学配置</small>
          <a class="nav-link" href="#stab-subject" data-bs-toggle="tab"><i class="bi bi-book me-1"></i>选科配置</a>
          <a class="nav-link" href="#stab-assess" data-bs-toggle="tab"><i class="bi bi-clipboard-data me-1"></i>评估类型</a>
          <a class="nav-link" href="#stab-ps" data-bs-toggle="tab"><i class="bi bi-file-earmark-text me-1"></i>个人陈述</a>
          <hr class="my-1">
          <small class="text-muted px-2 py-1 d-block fw-bold" style="font-size:10px;letter-spacing:1px">申请流程</small>
          <a class="nav-link" href="#stab-appconfig" data-bs-toggle="tab"><i class="bi bi-sliders me-1"></i>申请与任务</a>
          <a class="nav-link" href="#stab-tpl" data-bs-toggle="tab"><i class="bi bi-layout-text-sidebar-reverse me-1"></i>时间线模板</a>
          <a class="nav-link" href="#stab-anchors" data-bs-toggle="tab"><i class="bi bi-calendar-event me-1"></i>锚点事件</a>
          <hr class="my-1">
          <small class="text-muted px-2 py-1 d-block fw-bold" style="font-size:10px;letter-spacing:1px">业务模块</small>
          <a class="nav-link" href="#stab-intake" data-bs-toggle="tab"><i class="bi bi-person-plus me-1"></i>入学管理</a>
          <a class="nav-link" href="#stab-visa" data-bs-toggle="tab"><i class="bi bi-airplane me-1"></i>签证与到校</a>
          <a class="nav-link" href="#stab-finance" data-bs-toggle="tab"><i class="bi bi-currency-dollar me-1"></i>财务配置</a>
          <a class="nav-link" href="#stab-admeval" data-bs-toggle="tab"><i class="bi bi-graph-up me-1"></i>录取评估</a>
          <a class="nav-link" href="#stab-essays" data-bs-toggle="tab"><i class="bi bi-pencil-square me-1"></i>文书管理</a>
          <a class="nav-link" href="#stab-activities" data-bs-toggle="tab"><i class="bi bi-trophy me-1"></i>课外活动</a>
          <a class="nav-link" href="#stab-agents" data-bs-toggle="tab"><i class="bi bi-people me-1"></i>代理与佣金</a>
          <a class="nav-link" href="#stab-materials" data-bs-toggle="tab"><i class="bi bi-folder me-1"></i>材料管理</a>
          <hr class="my-1">
          <small class="text-muted px-2 py-1 d-block fw-bold" style="font-size:10px;letter-spacing:1px">数据管理</small>
          <a class="nav-link" href="#stab-students" data-bs-toggle="tab"><i class="bi bi-mortarboard me-1"></i>学生管理</a>
          <a class="nav-link" href="#stab-notifications" data-bs-toggle="tab"><i class="bi bi-megaphone me-1"></i>通知与审计</a>
          <a class="nav-link" href="#stab-escalation" data-bs-toggle="tab"><i class="bi bi-bell me-1"></i>升级政策</a>
          <hr class="my-1">
          <small class="text-muted px-2 py-1 d-block fw-bold" style="font-size:10px;letter-spacing:1px">安全与高级</small>
          <a class="nav-link" href="#stab-security" data-bs-toggle="tab"><i class="bi bi-shield-lock me-1"></i>安全设置</a>
        </div>
      </div>
      <div class="settings-content">
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

      <!-- ── 入学管理 ── -->
      <div class="tab-pane fade" id="stab-intake">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-person-plus me-1 text-primary"></i>入学案例状态</div>
          <div class="card-body">
            <p class="small text-muted">配置入学案例的可用状态列表。状态机流转规则在下方配置。</p>
            <div id="cfg-intake-statuses-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-intake-statuses-input" placeholder="新增状态...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('intake_case_statuses','cfg-intake-statuses-input','cfg-intake-statuses-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-diagram-3 me-1 text-info"></i>自动任务天数配置</div>
          <div class="card-body">
            <p class="small text-muted">入学案例状态变更时自动创建任务的截止天数。</p>
            <div class="row g-2" id="cfg-intake-auto-tasks">
              ${(() => {
                const at = JSON.parse(settings.intake_auto_tasks || '{}');
                const labels = { collect_docs_days:'收集材料', visa_submit_days:'签证提交', fee_followup_days:'费用跟进', fee_receipt_days:'收据确认', arrival_confirm_days:'到校确认', accommodation_days:'住宿安排', orientation_days:'入学登记', student_pass_days:'学生准证', survey_days:'满意度问卷' };
                return Object.entries(labels).map(([k,l]) =>
                  '<div class="col-md-4"><label class="form-label small">'+escapeHtml(l)+'</label>' +
                  '<input type="number" class="form-control form-control-sm" id="cfg-at-'+k+'" value="'+(at[k]||'')+'" min="1" max="365"></div>').join('');
              })()}
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-clock me-1 text-warning"></i>IPA 提醒天数 & Token 过期</div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-6">
                <label class="form-label small">IPA 到期提醒天数（逗号分隔）</label>
                <input type="text" class="form-control form-control-sm" id="cfg-ipa-reminder" value="${(JSON.parse(settings.intake_ipa_reminder_days||'[]')).join(',')}">
              </div>
              <div class="col-md-3">
                <label class="form-label small">材料 Token 有效期（小时）</label>
                <input type="number" class="form-control form-control-sm" id="cfg-mat-token-hours" value="${settings.mat_token_expiry_hours||72}" min="1">
              </div>
              <div class="col-md-3">
                <label class="form-label small">入学年份范围</label>
                <div class="d-flex gap-1">
                  <input type="number" class="form-control form-control-sm" id="cfg-year-min" value="${JSON.parse(settings.intake_year_range||'{}').min||2000}">
                  <span class="align-self-center">-</span>
                  <input type="number" class="form-control form-control-sm" id="cfg-year-max" value="${JSON.parse(settings.intake_year_range||'{}').max||2100}">
                </div>
              </div>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveIntakeSettings()"><i class="bi bi-check-lg me-1"></i>保存入学管理设置</button>
      </div>

      <!-- ── 签证与到校 ── -->
      <div class="tab-pane fade" id="stab-visa">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-file-earmark me-1 text-primary"></i>签证材料类型</div>
          <div class="card-body">
            <div id="cfg-visa-docs-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-visa-docs-input" placeholder="新增材料类型...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('visa_document_types','cfg-visa-docs-input','cfg-visa-docs-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-check2-square me-1 text-success"></i>到校清单</div>
          <div class="card-body">
            <div id="cfg-arrival-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-arrival-input" placeholder="新增清单项...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('arrival_checklist','cfg-arrival-input','cfg-arrival-list')">添加</button>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveVisaSettings()"><i class="bi bi-check-lg me-1"></i>保存签证设置</button>
      </div>

      <!-- ── 财务配置 ── -->
      <div class="tab-pane fade" id="stab-finance">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-currency-dollar me-1 text-success"></i>财务参数</div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-4">
                <label class="form-label small">默认货币</label>
                <input type="text" class="form-control form-control-sm" id="cfg-currency" value="${escapeHtml(settings.default_currency||'SGD')}">
              </div>
              <div class="col-md-4">
                <label class="form-label small">佣金百分比上限</label>
                <input type="number" class="form-control form-control-sm" id="cfg-comm-max" value="${settings.commission_percent_max||1.0}" step="0.01" min="0" max="1">
              </div>
              <div class="col-md-4">
                <label class="form-label small">代理 Token 有效期（小时）</label>
                <input type="number" class="form-control form-control-sm" id="cfg-agent-token-hours" value="${settings.agent_token_expiry_hours||72}" min="1">
              </div>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-tags me-1 text-info"></i>佣金规则类型</div>
          <div class="card-body">
            <div id="cfg-comm-types-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-comm-types-input" placeholder="新增类型...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('commission_rule_types','cfg-comm-types-input','cfg-comm-types-list')">添加</button>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveFinanceSettings()"><i class="bi bi-check-lg me-1"></i>保存财务设置</button>
      </div>

      <!-- ── 录取评估 ── -->
      <div class="tab-pane fade" id="stab-admeval">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-bar-chart me-1 text-primary"></i>成绩等级转换 (A-Level)</div>
          <div class="card-body">
            <p class="small text-muted">配置 A-Level 等级与数值分数的映射关系。</p>
            <div class="row g-2" id="cfg-grade-alevel">
              ${(() => { const m = JSON.parse(settings.grade_conversion_alevel||'{}'); return Object.entries(m).map(([g,s]) => '<div class="col-auto"><div class="input-group input-group-sm"><span class="input-group-text" style="min-width:36px">'+escapeHtml(g)+'</span><input type="number" class="form-control" style="width:65px" value="'+s+'" data-grade="'+escapeHtml(g)+'"></div></div>').join(''); })()}
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-bar-chart me-1 text-info"></i>成绩等级转换 (IB)</div>
          <div class="card-body">
            <div class="row g-2" id="cfg-grade-ib">
              ${(() => { const m = JSON.parse(settings.grade_conversion_ib||'{}'); return Object.entries(m).map(([g,s]) => '<div class="col-auto"><div class="input-group input-group-sm"><span class="input-group-text" style="min-width:36px">'+escapeHtml(g)+'</span><input type="number" class="form-control" style="width:65px" value="'+s+'" data-grade="'+escapeHtml(g)+'"></div></div>').join(''); })()}
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-sliders2 me-1 text-warning"></i>竞争力权重</div>
          <div class="card-body">
            <p class="small text-muted">各维度权重之和建议为 1.0。</p>
            <div class="row g-2">
              ${(() => { const w = JSON.parse(settings.competitiveness_weights||'{}'); const labels = { academic:'学术', language:'语言', activities:'活动', awards:'奖项', leadership:'领导力' }; return Object.entries(labels).map(([k,l]) => '<div class="col-md-2"><label class="form-label small">'+escapeHtml(l)+'</label><input type="number" class="form-control form-control-sm" id="cfg-cw-'+k+'" value="'+(w[k]||0)+'" step="0.05" min="0" max="1"></div>').join(''); })()}
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-calculator me-1 text-danger"></i>录取评分参数</div>
          <div class="card-body">
            <div class="row g-2">
              ${(() => { const s2 = JSON.parse(settings.admission_scoring||'{}'); return '' +
              '<div class="col-md-3"><label class="form-label small">先验概率</label><input type="number" class="form-control form-control-sm" id="cfg-as-prior" value="'+(s2.prior_rate||0.3)+'" step="0.01" min="0" max="1"></div>' +
              '<div class="col-md-3"><label class="form-label small">样本阈值</label><input type="number" class="form-control form-control-sm" id="cfg-as-sample" value="'+(s2.sample_size||30)+'" min="1"></div>' +
              '<div class="col-md-3"><label class="form-label small">低分系数</label><input type="number" class="form-control form-control-sm" id="cfg-as-lowmult" value="'+(s2.low_pass_multiplier||0.6)+'" step="0.1" min="0" max="1"></div>' +
              '<div class="col-md-3"><label class="form-label small">分数因子（逗号）</label><input type="text" class="form-control form-control-sm" id="cfg-as-factors" value="'+(s2.score_factors||[1.8,1.4,1.0,0.7,0.4]).join(',')+'"></div>'; })()}
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-speedometer me-1 text-secondary"></i>默认权重</div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-4"><label class="form-label small">学术权重</label><input type="number" class="form-control form-control-sm" id="cfg-dw-academic" value="${settings.default_weight_academic||0.6}" step="0.05" min="0" max="1"></div>
              <div class="col-md-4"><label class="form-label small">语言权重</label><input type="number" class="form-control form-control-sm" id="cfg-dw-language" value="${settings.default_weight_language||0.25}" step="0.05" min="0" max="1"></div>
              <div class="col-md-4"><label class="form-label small">综合权重</label><input type="number" class="form-control form-control-sm" id="cfg-dw-extra" value="${settings.default_weight_extra||0.15}" step="0.05" min="0" max="1"></div>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveAdmEvalSettings()"><i class="bi bi-check-lg me-1"></i>保存录取评估设置</button>
      </div>

      <!-- ── 文书管理 ── -->
      <div class="tab-pane fade" id="stab-essays">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-pencil me-1 text-primary"></i>文书类型</div>
          <div class="card-body">
            <div id="cfg-essay-types-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-essay-types-input" placeholder="新增类型...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('essay_types','cfg-essay-types-input','cfg-essay-types-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-list-check me-1 text-info"></i>文书状态</div>
          <div class="card-body">
            <div id="cfg-essay-statuses-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-essay-statuses-input" placeholder="新增状态...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('essay_statuses','cfg-essay-statuses-input','cfg-essay-statuses-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-chat-dots me-1 text-warning"></i>批注状态</div>
          <div class="card-body">
            <div id="cfg-annotation-statuses-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-annotation-statuses-input" placeholder="新增状态...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('essay_annotation_statuses','cfg-annotation-statuses-input','cfg-annotation-statuses-list')">添加</button>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveEssaySettings()"><i class="bi bi-check-lg me-1"></i>保存文书设置</button>
      </div>

      <!-- ── 课外活动 ── -->
      <div class="tab-pane fade" id="stab-activities">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-trophy me-1 text-warning"></i>活动类别</div>
          <div class="card-body">
            <div id="cfg-act-categories-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-act-categories-input" placeholder="新增类别...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('activity_categories','cfg-act-categories-input','cfg-act-categories-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-star me-1 text-info"></i>影响力级别</div>
          <div class="card-body">
            <div id="cfg-impact-levels-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-impact-levels-input" placeholder="新增级别...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('activity_impact_levels','cfg-impact-levels-input','cfg-impact-levels-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-sliders2 me-1 text-secondary"></i>影响力权重 & 领导力分值</div>
          <div class="card-body">
            <div class="row g-2">
              ${(() => { const iw = JSON.parse(settings.impact_weight_map||'{}'); const labels = { international:'国际', national:'国家', province:'省级', city:'市级', school:'校级' }; return Object.entries(labels).map(([k,l]) => '<div class="col-md-2"><label class="form-label small">'+escapeHtml(l)+'</label><input type="number" class="form-control form-control-sm" id="cfg-iw-'+k+'" value="'+(iw[k]||0)+'" min="0" max="200"></div>').join(''); })()}
              <div class="col-md-2"><label class="form-label small">领导力/项</label><input type="number" class="form-control form-control-sm" id="cfg-leadership-per" value="${settings.leadership_score_per_item||25}" min="1" max="100"></div>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveActivitySettings()"><i class="bi bi-check-lg me-1"></i>保存活动设置</button>
      </div>

      <!-- ── 代理与佣金 ── -->
      <div class="tab-pane fade" id="stab-agents">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-people me-1 text-primary"></i>代理请求默认值</div>
          <div class="card-body">
            <div class="row g-2">
              ${(() => { const ad = JSON.parse(settings.agent_request_defaults||'{}'); return '' +
              '<div class="col-md-4"><label class="form-label small">提前提醒天数</label><input type="number" class="form-control form-control-sm" id="cfg-ard-remind" value="'+(ad.remind_days_before||3)+'" min="1"></div>' +
              '<div class="col-md-4"><label class="form-label small">逾期提醒间隔天数</label><input type="number" class="form-control form-control-sm" id="cfg-ard-interval" value="'+(ad.overdue_interval_days||2)+'" min="1"></div>' +
              '<div class="col-md-4"><label class="form-label small">最大逾期提醒次数</label><input type="number" class="form-control form-control-sm" id="cfg-ard-max" value="'+(ad.max_overdue_reminders||5)+'" min="1"></div>'; })()}
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveAgentSettings()"><i class="bi bi-check-lg me-1"></i>保存代理设置</button>
      </div>

      <!-- ── 材料管理 ── -->
      <div class="tab-pane fade" id="stab-materials">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-folder me-1 text-primary"></i>材料状态列表</div>
          <div class="card-body">
            <p class="small text-muted">配置材料的可选状态。第二项（默认"已提交"）用于自动标记提交时间。</p>
            <div id="cfg-mat-statuses-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-mat-statuses-input" placeholder="新增状态...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('material_statuses','cfg-mat-statuses-input','cfg-mat-statuses-list')">添加</button>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveMaterialSettings()"><i class="bi bi-check-lg me-1"></i>保存材料设置</button>
      </div>

      <!-- ── 学生管理 ── -->
      <div class="tab-pane fade" id="stab-students">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-mortarboard me-1 text-primary"></i>年级列表</div>
          <div class="card-body">
            <div id="cfg-grade-levels-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-grade-levels-input" placeholder="新增年级...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('valid_grade_levels','cfg-grade-levels-input','cfg-grade-levels-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-toggle-on me-1 text-info"></i>学生状态</div>
          <div class="card-body">
            <div id="cfg-student-statuses-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-student-statuses-input" placeholder="新增状态...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('valid_student_statuses','cfg-student-statuses-input','cfg-student-statuses-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-sliders me-1 text-secondary"></i>其他学生参数</div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-4"><label class="form-label small">姓名最大长度</label><input type="number" class="form-control form-control-sm" id="cfg-name-maxlen" value="${settings.student_name_max_length||200}" min="10" max="500"></div>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-bar-chart me-1 text-warning"></i>成绩排名映射</div>
          <div class="card-body">
            <p class="small text-muted">用于竞争力评估中的成绩排名计算。</p>
            <div class="row g-2" id="cfg-grade-rank">
              ${(() => { const m = JSON.parse(settings.grade_rank_map||'{}'); return Object.entries(m).map(([g,s]) => '<div class="col-auto"><div class="input-group input-group-sm"><span class="input-group-text" style="min-width:36px">'+escapeHtml(g)+'</span><input type="number" class="form-control" style="width:65px" value="'+s+'" data-grade="'+escapeHtml(g)+'"></div></div>').join(''); })()}
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveStudentSettings()"><i class="bi bi-check-lg me-1"></i>保存学生设置</button>
      </div>

      <!-- ── 通知与审计 ── -->
      <div class="tab-pane fade" id="stab-notifications">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-megaphone me-1 text-warning"></i>通知与审计参数</div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-3"><label class="form-label small">自动升级超时（小时）</label><input type="number" class="form-control form-control-sm" id="cfg-esc-hours" value="${settings.auto_escalate_overdue_hours||24}" min="1"></div>
              <div class="col-md-3"><label class="form-label small">审计默认查询量</label><input type="number" class="form-control form-control-sm" id="cfg-audit-default" value="${settings.audit_query_default_limit||200}" min="10"></div>
              <div class="col-md-3"><label class="form-label small">审计最大查询量</label><input type="number" class="form-control form-control-sm" id="cfg-audit-max" value="${settings.audit_query_max_limit||1000}" min="100"></div>
              <div class="col-md-3"><label class="form-label small">审计导出上限</label><input type="number" class="form-control form-control-sm" id="cfg-audit-export" value="${settings.audit_export_max_records||5000}" min="100"></div>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveNotificationSettings()"><i class="bi bi-check-lg me-1"></i>保存通知设置</button>
      </div>

      <!-- ── 安全设置 ── -->
      <div class="tab-pane fade" id="stab-security">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-shield-lock me-1 text-danger"></i>安全与系统参数</div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-3"><label class="form-label small">密码最小长度</label><input type="number" class="form-control form-control-sm" id="cfg-pwd-min" value="${settings.password_min_length||6}" min="4" max="32"></div>
              <div class="col-md-3"><label class="form-label small">密码最大长度</label><input type="number" class="form-control form-control-sm" id="cfg-pwd-max" value="${settings.password_max_length||128}" min="32" max="256"></div>
              <div class="col-md-3"><label class="form-label small">Toast 延迟 (ms)</label><input type="number" class="form-control form-control-sm" id="cfg-toast-delay" value="${settings.toast_delay_ms||3000}" min="500" max="10000"></div>
              <div class="col-md-3"><label class="form-label small">批量评估上限</label><input type="number" class="form-control form-control-sm" id="cfg-batch-max" value="${settings.max_batch_programs||50}" min="5" max="200"></div>
            </div>
            <div class="row g-2 mt-2">
              <div class="col-md-4"><label class="form-label small">默认时区</label><input type="text" class="form-control form-control-sm" id="cfg-default-tz" value="${escapeHtml(settings.default_timezone||'Europe/London')}"></div>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-signpost-2 me-1 text-info"></i>申请管理默认值</div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-3"><label class="form-label small">默认申请路线</label><input type="text" class="form-control form-control-sm" id="cfg-def-route" value="${escapeHtml(settings.default_application_route||'UK-UG')}"></div>
              <div class="col-md-3"><label class="form-label small">默认成绩类型</label><input type="text" class="form-control form-control-sm" id="cfg-def-grade-type" value="${escapeHtml(settings.default_grade_type_used||'Predicted')}"></div>
              <div class="col-md-3"><label class="form-label small">默认申请状态</label><input type="text" class="form-control form-control-sm" id="cfg-def-app-status" value="${escapeHtml(settings.default_application_status||'Pending')}"></div>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-tags me-1 text-secondary"></i>申请状态列表 & 推荐信关键词</div>
          <div class="card-body">
            <p class="small text-muted mb-2">申请状态</p>
            <div id="cfg-app-statuses-list" class="mb-2"></div>
            <div class="input-group input-group-sm mb-3" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-app-statuses-input" placeholder="新增状态...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('application_statuses','cfg-app-statuses-input','cfg-app-statuses-list')">添加</button>
            </div>
            <p class="small text-muted mb-2">推荐信关键词（用于 UCAS 提交检查）</p>
            <div id="cfg-ref-keywords-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-ref-keywords-input" placeholder="新增关键词...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('reference_task_keywords','cfg-ref-keywords-input','cfg-ref-keywords-list')">添加</button>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveSecuritySettings()"><i class="bi bi-check-lg me-1"></i>保存安全与高级设置</button>
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

    // ── 新增 tab 的列表 draft 渲染 ──
    renderListDraft('intake_case_statuses', 'cfg-intake-statuses-list');
    renderListDraft('visa_document_types', 'cfg-visa-docs-list');
    renderListDraft('arrival_checklist', 'cfg-arrival-list');
    renderListDraft('commission_rule_types', 'cfg-comm-types-list');
    renderListDraft('essay_types', 'cfg-essay-types-list');
    renderListDraft('essay_statuses', 'cfg-essay-statuses-list');
    renderListDraft('essay_annotation_statuses', 'cfg-annotation-statuses-list');
    renderListDraft('activity_categories', 'cfg-act-categories-list');
    renderListDraft('activity_impact_levels', 'cfg-impact-levels-list');
    renderListDraft('material_statuses', 'cfg-mat-statuses-list');
    renderListDraft('valid_grade_levels', 'cfg-grade-levels-list');
    renderListDraft('valid_student_statuses', 'cfg-student-statuses-list');
    renderListDraft('application_statuses', 'cfg-app-statuses-list');
    renderListDraft('reference_task_keywords', 'cfg-ref-keywords-list');

    // Load anchor events and escalation policy on tab activation
    const anchorsTab = document.querySelector('a[href="#stab-anchors"]');
    if (anchorsTab) anchorsTab.addEventListener('shown.bs.tab', renderAnchorEventsList, { once: false });
    const escalTab = document.querySelector('a[href="#stab-escalation"]');
    if (escalTab) escalTab.addEventListener('shown.bs.tab', loadEscalationPolicy, { once: false });

    // ── BUG-M04: Counselor 只读模式 ──
    if (State.user && State.user.role === 'counselor') {
      const settingsArea = mc.querySelector('.settings-layout');
      if (settingsArea) {
        function _applyReadOnly(root) {
          root.querySelectorAll('button[onclick*="save"], button[onclick*="Save"]').forEach(btn => btn.style.display = 'none');
          root.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; });
          root.querySelectorAll('button[onclick*="add"], button[onclick*="remove"], button[onclick*="Add"], button[onclick*="Remove"], button[onclick*="delete"], button[onclick*="Delete"]').forEach(btn => btn.style.display = 'none');
        }
        _applyReadOnly(settingsArea);
        // 监听动态加载的内容（如升级策略 tab）
        new MutationObserver(() => _applyReadOnly(settingsArea)).observe(settingsArea, { childList: true, subtree: true });
        // 添加只读提示
        const header = mc.querySelector('.page-header');
        if (header) header.insertAdjacentHTML('afterend', '<div class="alert alert-info py-2 mb-3"><i class="bi bi-eye me-1"></i>当前为只读模式，仅校长可修改系统设置</div>');
      }
    }

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

// ── 新增设置 Tab 保存函数 ──

async function saveIntakeSettings() {
  if (!acquireSubmit('saveIntakeSettings')) return;
  try {
    await PUT('/api/settings/intake_case_statuses', { value: JSON.stringify(State.settingsDraft.intake_case_statuses || []) });
    // auto tasks
    const atKeys = ['collect_docs_days','visa_submit_days','fee_followup_days','fee_receipt_days','arrival_confirm_days','accommodation_days','orientation_days','student_pass_days','survey_days'];
    const at = {}; atKeys.forEach(k => { at[k] = parseInt(document.getElementById('cfg-at-'+k)?.value) || 0; });
    await PUT('/api/settings/intake_auto_tasks', { value: JSON.stringify(at) });
    // IPA reminder
    const ipaStr = document.getElementById('cfg-ipa-reminder')?.value || '';
    await PUT('/api/settings/intake_ipa_reminder_days', { value: JSON.stringify(ipaStr.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n))) });
    await PUT('/api/settings/mat_token_expiry_hours', { value: document.getElementById('cfg-mat-token-hours')?.value || '72' });
    await PUT('/api/settings/intake_year_range', { value: JSON.stringify({ min: parseInt(document.getElementById('cfg-year-min')?.value)||2000, max: parseInt(document.getElementById('cfg-year-max')?.value)||2100 }) });
    State.settings = await GET('/api/settings');
    showSuccess('入学管理设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveIntakeSettings'); }
}

async function saveVisaSettings() {
  if (!acquireSubmit('saveVisaSettings')) return;
  try {
    await PUT('/api/settings/visa_document_types', { value: JSON.stringify(State.settingsDraft.visa_document_types || []) });
    await PUT('/api/settings/arrival_checklist', { value: JSON.stringify(State.settingsDraft.arrival_checklist || []) });
    State.settings = await GET('/api/settings');
    showSuccess('签证设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveVisaSettings'); }
}

async function saveFinanceSettings() {
  if (!acquireSubmit('saveFinanceSettings')) return;
  try {
    await PUT('/api/settings/default_currency', { value: document.getElementById('cfg-currency')?.value || 'SGD' });
    await PUT('/api/settings/commission_percent_max', { value: document.getElementById('cfg-comm-max')?.value || '1.0' });
    await PUT('/api/settings/agent_token_expiry_hours', { value: document.getElementById('cfg-agent-token-hours')?.value || '72' });
    await PUT('/api/settings/commission_rule_types', { value: JSON.stringify(State.settingsDraft.commission_rule_types || []) });
    State.settings = await GET('/api/settings');
    showSuccess('财务设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveFinanceSettings'); }
}

async function saveAdmEvalSettings() {
  if (!acquireSubmit('saveAdmEvalSettings')) return;
  try {
    // A-Level grade conversion
    const alevel = {}; document.querySelectorAll('#cfg-grade-alevel input[data-grade]').forEach(el => { alevel[el.dataset.grade] = parseInt(el.value)||0; });
    await PUT('/api/settings/grade_conversion_alevel', { value: JSON.stringify(alevel) });
    // IB grade conversion
    const ib = {}; document.querySelectorAll('#cfg-grade-ib input[data-grade]').forEach(el => { ib[el.dataset.grade] = parseInt(el.value)||0; });
    await PUT('/api/settings/grade_conversion_ib', { value: JSON.stringify(ib) });
    // Competitiveness weights
    const cw = {}; ['academic','language','activities','awards','leadership'].forEach(k => { cw[k] = parseFloat(document.getElementById('cfg-cw-'+k)?.value)||0; });
    await PUT('/api/settings/competitiveness_weights', { value: JSON.stringify(cw) });
    // Admission scoring
    const factorsStr = document.getElementById('cfg-as-factors')?.value || '';
    await PUT('/api/settings/admission_scoring', { value: JSON.stringify({
      prior_rate: parseFloat(document.getElementById('cfg-as-prior')?.value)||0.3,
      sample_size: parseInt(document.getElementById('cfg-as-sample')?.value)||30,
      low_pass_multiplier: parseFloat(document.getElementById('cfg-as-lowmult')?.value)||0.6,
      score_factors: factorsStr.split(',').map(s=>parseFloat(s.trim())).filter(n=>!isNaN(n))
    }) });
    // Default weights
    await PUT('/api/settings/default_weight_academic', { value: document.getElementById('cfg-dw-academic')?.value || '0.6' });
    await PUT('/api/settings/default_weight_language', { value: document.getElementById('cfg-dw-language')?.value || '0.25' });
    await PUT('/api/settings/default_weight_extra', { value: document.getElementById('cfg-dw-extra')?.value || '0.15' });
    State.settings = await GET('/api/settings');
    showSuccess('录取评估设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveAdmEvalSettings'); }
}

async function saveEssaySettings() {
  if (!acquireSubmit('saveEssaySettings')) return;
  try {
    await PUT('/api/settings/essay_types', { value: JSON.stringify(State.settingsDraft.essay_types || []) });
    await PUT('/api/settings/essay_statuses', { value: JSON.stringify(State.settingsDraft.essay_statuses || []) });
    await PUT('/api/settings/essay_annotation_statuses', { value: JSON.stringify(State.settingsDraft.essay_annotation_statuses || []) });
    State.settings = await GET('/api/settings');
    showSuccess('文书设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveEssaySettings'); }
}

async function saveActivitySettings() {
  if (!acquireSubmit('saveActivitySettings')) return;
  try {
    await PUT('/api/settings/activity_categories', { value: JSON.stringify(State.settingsDraft.activity_categories || []) });
    await PUT('/api/settings/activity_impact_levels', { value: JSON.stringify(State.settingsDraft.activity_impact_levels || []) });
    // Impact weight map
    const iw = {}; ['international','national','province','city','school'].forEach(k => { iw[k] = parseInt(document.getElementById('cfg-iw-'+k)?.value)||0; });
    await PUT('/api/settings/impact_weight_map', { value: JSON.stringify(iw) });
    await PUT('/api/settings/leadership_score_per_item', { value: document.getElementById('cfg-leadership-per')?.value || '25' });
    State.settings = await GET('/api/settings');
    showSuccess('活动设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveActivitySettings'); }
}

async function saveAgentSettings() {
  if (!acquireSubmit('saveAgentSettings')) return;
  try {
    await PUT('/api/settings/agent_request_defaults', { value: JSON.stringify({
      remind_days_before: parseInt(document.getElementById('cfg-ard-remind')?.value)||3,
      overdue_interval_days: parseInt(document.getElementById('cfg-ard-interval')?.value)||2,
      max_overdue_reminders: parseInt(document.getElementById('cfg-ard-max')?.value)||5
    }) });
    State.settings = await GET('/api/settings');
    showSuccess('代理设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveAgentSettings'); }
}

async function saveMaterialSettings() {
  if (!acquireSubmit('saveMaterialSettings')) return;
  try {
    await PUT('/api/settings/material_statuses', { value: JSON.stringify(State.settingsDraft.material_statuses || []) });
    State.settings = await GET('/api/settings');
    showSuccess('材料设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveMaterialSettings'); }
}

async function saveStudentSettings() {
  if (!acquireSubmit('saveStudentSettings')) return;
  try {
    await PUT('/api/settings/valid_grade_levels', { value: JSON.stringify(State.settingsDraft.valid_grade_levels || []) });
    await PUT('/api/settings/valid_student_statuses', { value: JSON.stringify(State.settingsDraft.valid_student_statuses || []) });
    await PUT('/api/settings/student_name_max_length', { value: document.getElementById('cfg-name-maxlen')?.value || '200' });
    // Grade rank map
    const grm = {}; document.querySelectorAll('#cfg-grade-rank input[data-grade]').forEach(el => { grm[el.dataset.grade] = parseInt(el.value)||0; });
    await PUT('/api/settings/grade_rank_map', { value: JSON.stringify(grm) });
    State.settings = await GET('/api/settings');
    showSuccess('学生设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveStudentSettings'); }
}

async function saveNotificationSettings() {
  if (!acquireSubmit('saveNotificationSettings')) return;
  try {
    await PUT('/api/settings/auto_escalate_overdue_hours', { value: document.getElementById('cfg-esc-hours')?.value || '24' });
    await PUT('/api/settings/audit_query_default_limit', { value: document.getElementById('cfg-audit-default')?.value || '200' });
    await PUT('/api/settings/audit_query_max_limit', { value: document.getElementById('cfg-audit-max')?.value || '1000' });
    await PUT('/api/settings/audit_export_max_records', { value: document.getElementById('cfg-audit-export')?.value || '5000' });
    State.settings = await GET('/api/settings');
    showSuccess('通知设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveNotificationSettings'); }
}

async function saveSecuritySettings() {
  if (!acquireSubmit('saveSecuritySettings')) return;
  try {
    await PUT('/api/settings/password_min_length', { value: document.getElementById('cfg-pwd-min')?.value || '6' });
    await PUT('/api/settings/password_max_length', { value: document.getElementById('cfg-pwd-max')?.value || '128' });
    await PUT('/api/settings/toast_delay_ms', { value: document.getElementById('cfg-toast-delay')?.value || '3000' });
    await PUT('/api/settings/max_batch_programs', { value: document.getElementById('cfg-batch-max')?.value || '50' });
    await PUT('/api/settings/default_timezone', { value: document.getElementById('cfg-default-tz')?.value || 'Europe/London' });
    await PUT('/api/settings/default_application_route', { value: document.getElementById('cfg-def-route')?.value || 'UK-UG' });
    await PUT('/api/settings/default_grade_type_used', { value: document.getElementById('cfg-def-grade-type')?.value || 'Predicted' });
    await PUT('/api/settings/default_application_status', { value: document.getElementById('cfg-def-app-status')?.value || 'Pending' });
    await PUT('/api/settings/application_statuses', { value: JSON.stringify(State.settingsDraft.application_statuses || []) });
    await PUT('/api/settings/reference_task_keywords', { value: JSON.stringify(State.settingsDraft.reference_task_keywords || []) });
    State.settings = await GET('/api/settings');
    showSuccess('安全与高级设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveSecuritySettings'); }
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

    // 检查是否有数据
    const taskStats = d.taskStats || [];
    const hasAnyData = taskStats.length > 0 || (d.routeStats||[]).length > 0 || (d.counselorKPI||[]).length > 0;
    if (!hasAnyData) {
      mc.innerHTML = `
        <div class="page-header mb-3"><h4><i class="bi bi-bar-chart-line-fill me-2"></i>数据分析</h4></div>
        <div class="text-center py-5">
          <i class="bi bi-bar-chart" style="font-size:3rem;color:#cbd5e1"></i>
          <h5 class="mt-3 text-muted">暂无足够数据</h5>
          <p class="text-muted">系统需要更多学生、任务和申请数据才能生成分析报告。<br>请先在「学生管理」中添加学生并创建任务和申请。</p>
        </div>`;
      return;
    }
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
  const today = new Date().toISOString().slice(0,10);
  const d7 = new Date(Date.now()-7*86400000).toISOString().slice(0,10);
  const d30 = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  mc.innerHTML = `
  <div class="page-header">
    <h4 class="mb-0"><i class="bi bi-clock-history me-2 text-secondary"></i>操作审计日志</h4>
    <div class="d-flex gap-2">
      <button class="btn btn-outline-secondary btn-sm" onclick="exportAuditCSV()"><i class="bi bi-download me-1"></i>导出CSV</button>
    </div>
  </div>
  <!-- 时间快捷筛选 -->
  <div class="filter-chip-group mb-3">
    <button class="filter-chip active" onclick="setAuditDateRange('','',this)">全部时间</button>
    <button class="filter-chip" onclick="setAuditDateRange('${today}','${today}',this)">今天</button>
    <button class="filter-chip" onclick="setAuditDateRange('${d7}','${today}',this)">近7天</button>
    <button class="filter-chip" onclick="setAuditDateRange('${d30}','${today}',this)">近30天</button>
  </div>
  <div class="card mb-3">
    <div class="card-body py-2">
      <div class="row g-2 align-items-end">
        <div class="col-md-3">
          <label class="form-label small mb-1">操作类型</label>
          <select class="form-select form-select-sm" id="audit-filter-action" onchange="loadAuditLogs()">
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
          <select class="form-select form-select-sm" id="audit-filter-entity" onchange="loadAuditLogs()">
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

function setAuditDateRange(from, to, btn) {
  document.querySelectorAll('.filter-chip-group .filter-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const fromEl = document.getElementById('audit-filter-from');
  const toEl = document.getElementById('audit-filter-to');
  if (fromEl) fromEl.value = from;
  if (toEl) toEl.value = to;
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
    const entityLabels = {students:'学生',applications:'申请',milestone_tasks:'任务',material_items:'材料',personal_statements:'个人陈述',staff:'教职工',finance_invoices:'账单',admission_evaluations:'录取评估',benchmark_evaluations:'基准评估',ai_student_plans:'AI规划',settings:'设置',exam_sittings:'考试记录'};
    tableEl.innerHTML = `<div class="small text-muted mb-2">${logs.length} 条记录</div><div class="table-responsive">
      <table class="table table-sm table-hover">
        <thead class="table-light">
          <tr><th>时间</th><th>操作者</th><th>操作</th><th>目标类型</th><th>目标ID</th><th>变更前</th><th>变更后</th></tr>
        </thead>
        <tbody>
          ${logs.map(l => `<tr>
            <td class="small text-muted text-nowrap">${fmtDatetime(l.created_at)||''}</td>
            <td class="small fw-semibold">${escapeHtml(l.user_name||l.username||'—')}</td>
            <td>${statusBadge(l.action)}</td>
            <td class="small">${escapeHtml(entityLabels[l.entity]||l.entity||'—')}</td>
            <td class="small text-muted" style="max-width:120px;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(l.entity_id||'')}">${escapeHtml((l.entity_id||'—').substring(0,8))}</td>
            <td class="small text-muted" style="max-width:150px;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(l.before_value||'')}">${escapeHtml((l.before_value||'—').substring(0,40))}</td>
            <td class="small text-muted" style="max-width:150px;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(l.after_value||'')}">${escapeHtml((l.after_value||'—').substring(0,40))}</td>
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
  showToast('正在导出 CSV...', 'info');
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
  confirmAction('确定删除此锚点事件？相关联的任务不会被删除。', async () => {
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
//  申请指挥中心（React 嵌入）
// ════════════════════════════════════════════════════════
function renderCommandCenter() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = '<div id="command-center-root" style="height:calc(100vh - 60px);width:100%;overflow:hidden"></div>';
  window.__PAGE__ = 'command-center';
  window.__USER__ = State.user;
  window.__ROLE__ = State.user?.role;
  // 同步暗色模式
  const theme = localStorage.getItem('pref_theme') || 'light';
  localStorage.setItem('theme', theme);
  if (theme === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  // 动态加载 React bundle
  const existing = document.getElementById('react-cc-script');
  if (existing) {
    // 已加载过，触发重新挂载
    if (window.__mountReactApp) window.__mountReactApp('command-center-root');
    return;
  }
  const script = document.createElement('script');
  script.id = 'react-cc-script';
  script.type = 'module';
  // 读取 React 构建清单获取实际文件名
  fetch('/react/index.html').then(r => r.text()).then(html => {
    // 注入 CSS
    const cssMatch = html.match(/href="\.?\/?assets\/(index-[^"]+\.css)"/);
    if (cssMatch && !document.getElementById('react-cc-css')) {
      const link = document.createElement('link');
      link.id = 'react-cc-css';
      link.rel = 'stylesheet';
      link.href = '/react/assets/' + cssMatch[1];
      document.head.appendChild(link);
    }
    // 注入 JS
    const match = html.match(/src="\.?\/?assets\/(index-[^"]+\.js)"/);
    if (match) {
      script.src = '/react/assets/' + match[1];
      document.head.appendChild(script);
    } else {
      mc.innerHTML = '<p style="padding:2rem;color:red">React 构建文件未找到，请运行 cd frontend && npm run build</p>';
    }
  }).catch(() => {
    mc.innerHTML = '<p style="padding:2rem;color:red">无法加载 React 模块</p>';
  });
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
          <div class="col-6 col-md-3">
            <div class="stat-card accent-primary">
              <div class="stat-icon"><i class="bi bi-building"></i></div>
              <div class="stat-value">${programs.length}</div>
              <div class="stat-label">专业条目</div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="stat-card accent-info">
              <div class="stat-icon"><i class="bi bi-flag"></i></div>
              <div class="stat-value">${Object.keys(byCountry).length}</div>
              <div class="stat-label">覆盖国家/地区</div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="stat-card accent-success">
              <div class="stat-icon"><i class="bi bi-graph-up"></i></div>
              <div class="stat-value">${programs.filter(p => p.hist_applicants).length}</div>
              <div class="stat-label">有历史数据</div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="stat-card accent-warning">
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
  if (!programs.length) return '<div class="empty-state-block"><i class="bi bi-inbox"></i><p>暂无专业条目，点击"新增专业"开始录入</p></div>';

  const byCountry = {};
  programs.forEach(p => {
    const c = p.country || '其他';
    if (!byCountry[c]) byCountry[c] = [];
    byCountry[c].push(p);
  });

  const countryIcon = { 'UK': '🇬🇧', 'US': '🇺🇸', 'SG': '🇸🇬', 'CA': '🇨🇦', 'AU': '🇦🇺' };
  const countryName = { 'UK': '英国', 'US': '美国', 'SG': '新加坡', 'CA': '加拿大', 'AU': '澳大利亚' };

  return Object.entries(byCountry).map(([country, progs]) => `
    <div class="card mb-3">
      <div class="content-section-header">
        <span>${countryIcon[country]||'🌍'}</span>
        <span>${countryName[country]||escapeHtml(country)}</span>
        <span class="badge badge-soft-primary ms-1">${progs.length}</span>
      </div>
      <div class="card-body p-0">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
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
                  <button class="action-icon-btn" title="编辑" onclick="openUniProgramModal('${p.id}')"><i class="bi bi-pencil"></i></button>
                  <button class="action-icon-btn danger" title="删除" data-pid="${escapeHtml(p.id)}" data-pname="${escapeHtml(p.uni_name+' '+p.program_name)}" onclick="deleteUniProgram(this.dataset.pid,this.dataset.pname)"><i class="bi bi-trash"></i></button>
                </td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
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
  const upWSum = body.weight_academic + body.weight_language + body.weight_extra;
  if (upWSum < 0.95 || upWSum > 1.05) {
    releaseSubmit('saveUniProgram');
    showError(`权重之和为 ${upWSum.toFixed(2)}，须在 0.95-1.05 之间`);
    return;
  }
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
  document.getElementById('bm-grade-req-rows').innerHTML = '';
  document.getElementById('bm-extra-test-rows').innerHTML = '';
  try { const gradeReqs = JSON.parse(bm?.grade_requirements || '[]'); gradeReqs.forEach(r => addBmGradeRow(r)); } catch(e) {}
  try { const extraTests = JSON.parse(bm?.extra_tests || '[]'); extraTests.forEach(r => addBmExtraTestRow(r)); } catch(e) {}
  document.getElementById('bm-notes').value = bm?.notes || '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('benchmark-modal')).show();
}

function addBmGradeRow(data) {
  const container = document.getElementById('bm-grade-req-rows');
  const d = data || {};
  const row = document.createElement('div');
  row.className = 'row g-2 mb-2 align-items-end';
  row.innerHTML = `
    <div class="col-4"><input class="form-control form-control-sm" placeholder="科目" value="${escapeHtml(d.subject||'')}"></div>
    <div class="col-2"><input class="form-control form-control-sm" placeholder="最低成绩" value="${escapeHtml(d.min_grade||'')}"></div>
    <div class="col-2"><select class="form-select form-select-sm"><option value="true" ${d.required!==false?'selected':''}>必修</option><option value="false" ${d.required===false?'selected':''}>选修</option></select></div>
    <div class="col-3"><input class="form-control form-control-sm" placeholder="备注" value="${escapeHtml(d.notes||'')}"></div>
    <div class="col-1"><button class="btn btn-sm btn-outline-danger py-0" onclick="this.closest('.row').remove()"><i class="bi bi-x"></i></button></div>`;
  container.appendChild(row);
}
function addBmExtraTestRow(data) {
  const container = document.getElementById('bm-extra-test-rows');
  const d = data || {};
  const row = document.createElement('div');
  row.className = 'row g-2 mb-2 align-items-end';
  row.innerHTML = `
    <div class="col-3"><input class="form-control form-control-sm" placeholder="考试名称" value="${escapeHtml(d.test||'')}"></div>
    <div class="col-2"><select class="form-select form-select-sm"><option value="true" ${d.required!==false?'selected':''}>必须</option><option value="false" ${d.required===false?'selected':''}>可选</option></select></div>
    <div class="col-3"><input class="form-control form-control-sm" type="number" placeholder="最低分数" value="${d.min_score||''}"></div>
    <div class="col-3"><input class="form-control form-control-sm" placeholder="备注" value="${escapeHtml(d.notes||'')}"></div>
    <div class="col-1"><button class="btn btn-sm btn-outline-danger py-0" onclick="this.closest('.row').remove()"><i class="bi bi-x"></i></button></div>`;
  container.appendChild(row);
}
function collectBmGradeRows() {
  const rows = document.querySelectorAll('#bm-grade-req-rows .row');
  return Array.from(rows).map(r => {
    const inputs = r.querySelectorAll('input, select');
    return { subject: inputs[0].value.trim(), min_grade: inputs[1].value.trim(), required: inputs[2].value === 'true', notes: inputs[3].value.trim() };
  }).filter(r => r.subject);
}
function collectBmExtraTestRows() {
  const rows = document.querySelectorAll('#bm-extra-test-rows .row');
  return Array.from(rows).map(r => {
    const inputs = r.querySelectorAll('input, select');
    return { test: inputs[0].value.trim(), required: inputs[1].value === 'true', min_score: parseInt(inputs[2].value) || null, notes: inputs[3].value.trim() };
  }).filter(r => r.test);
}

async function saveBenchmark() {
  if (!acquireSubmit('saveBenchmark')) return;
  const id = document.getElementById('bm-edit-id').value;
  const country = document.getElementById('bm-country').value;
  const tier = document.getElementById('bm-tier').value;
  const subject_area = document.getElementById('bm-subject-area').value;
  if (!country || !tier || !subject_area) { releaseSubmit('saveBenchmark'); showError('请选择地区、梯度和专业领域'); return; }

  // Weight sum validation
  const wAcademic = parseFloat(document.getElementById('bm-w-academic').value) || 0;
  const wLanguage = parseFloat(document.getElementById('bm-w-language').value) || 0;
  const wExtra = parseFloat(document.getElementById('bm-w-extra').value) || 0;
  const wSum = wAcademic + wLanguage + wExtra;
  if (wSum < 0.95 || wSum > 1.05) {
    releaseSubmit('saveBenchmark');
    showError(`权重之和为 ${wSum.toFixed(2)}，须在 0.95-1.05 之间`);
    return;
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
    grade_requirements: JSON.stringify(collectBmGradeRows()),
    extra_tests: JSON.stringify(collectBmExtraTestRows()),
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
    document.querySelectorAll('#bm-subject-btns button').forEach(b => b.disabled = false);
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


document.addEventListener('DOMContentLoaded', start);
