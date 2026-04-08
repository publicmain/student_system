// ══════════════════════════════════════════════════════
//  财务管理模块 — 前端 UI
// ══════════════════════════════════════════════════════

const FREQ_LABELS = { monthly:'月缴', quarterly:'季缴', semi_annual:'半年缴', annual:'年缴', one_time:'一次性' };
const PLAN_STATUS_LABELS = { active:'进行中', completed:'已完成', suspended:'已暂停', cancelled:'已取消' };
const PLAN_STATUS_COLORS = { active:'success', completed:'secondary', suspended:'warning', cancelled:'danger' };
const PAY_STATUS_LABELS = { unpaid:'未缴', paid:'已缴', overdue:'逾期', waived:'已免除' };
const PAY_STATUS_COLORS = { unpaid:'secondary', paid:'success', overdue:'danger', waived:'info' };
const METHOD_LABELS = { bank_transfer:'银行转账', cash:'现金', cheque:'支票', paynow:'PayNow', card:'刷卡' };

function fmtMoney(v, currency) { return `${currency||'SGD'} ${Number(v||0).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }

// ═══════════════════════════════════════════════════════
//  入口：财务中心（Tab 结构）
// ═══════════════════════════════════════════════════════

async function renderFinanceCenter(params = {}) {
  const activeTab = params.tab || 'dashboard';
  const mc = document.getElementById('main-content');
  mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-currency-dollar me-2"></i>财务中心</h4>
    </div>
    <ul class="nav nav-tabs mb-3" id="finance-tabs">
      <li class="nav-item"><a class="nav-link${activeTab==='dashboard'?' active':''}" href="#" onclick="event.preventDefault();renderFinanceCenter({tab:'dashboard'})"><i class="bi bi-speedometer2 me-1"></i>财务总览</a></li>
      <li class="nav-item"><a class="nav-link${activeTab==='tuition'?' active':''}" href="#" onclick="event.preventDefault();renderFinanceCenter({tab:'tuition'})"><i class="bi bi-mortarboard me-1"></i>学费管理</a></li>
      <li class="nav-item"><a class="nav-link${activeTab==='reports'?' active':''}" href="#" onclick="event.preventDefault();renderFinanceCenter({tab:'reports'})"><i class="bi bi-file-earmark-bar-graph me-1"></i>财务报表</a></li>
    </ul>
    <div id="finance-tab-content"><div class="text-center py-5"><div class="spinner-border text-primary"></div></div></div>
  `;
  const tabContainer = document.getElementById('finance-tab-content');
  if (activeTab === 'dashboard') await renderFinanceDashboardTab(tabContainer);
  else if (activeTab === 'tuition') await renderTuitionTab(tabContainer);
  else if (activeTab === 'reports') await renderFinanceReportsTab(tabContainer);
}

// ═══════════════════════════════════════════════════════
//  Tab 1: 财务总览
// ═══════════════════════════════════════════════════════

async function renderFinanceDashboardTab(container) {
  try {
    const data = await GET('/api/finance/dashboard');
    const t = data.tuition;
    const inv = data.invoice || { total: 0, paid: 0, unpaid: 0, overdue_count: 0 };
    const c = data.commission;
    container.innerHTML = `
      <div class="d-flex justify-content-end mb-3">
        <button class="btn btn-sm btn-outline-primary me-2" onclick="generateReminders()"><i class="bi bi-bell"></i> 生成提醒</button>
        <button class="btn btn-sm btn-primary" onclick="showCreatePlanModal()"><i class="bi bi-plus"></i> 新建学费计划</button>
      </div>

      <h6 class="text-muted mb-2">学费收支</h6>
      <div class="row g-3 mb-4">
        <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body text-center">
          <div class="text-muted small">总应收</div><div class="fs-5 fw-bold text-primary">${fmtMoney(t.total)}</div>
        </div></div></div>
        <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body text-center">
          <div class="text-muted small">已收</div><div class="fs-5 fw-bold text-success">${fmtMoney(t.paid)}</div>
        </div></div></div>
        <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body text-center">
          <div class="text-muted small">未收</div><div class="fs-5 fw-bold text-warning">${fmtMoney(t.unpaid)}</div>
        </div></div></div>
        <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body text-center">
          <div class="text-muted small">逾期笔数</div><div class="fs-5 fw-bold text-danger">${t.overdue_count}</div>
        </div></div></div>
      </div>

      <h6 class="text-muted mb-2">入学账单</h6>
      <div class="row g-3 mb-4">
        <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body text-center">
          <div class="text-muted small">总应收</div><div class="fs-5 fw-bold text-primary">${fmtMoney(inv.total)}</div>
        </div></div></div>
        <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body text-center">
          <div class="text-muted small">已收</div><div class="fs-5 fw-bold text-success">${fmtMoney(inv.paid)}</div>
        </div></div></div>
        <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body text-center">
          <div class="text-muted small">未收</div><div class="fs-5 fw-bold text-warning">${fmtMoney(inv.unpaid)}</div>
        </div></div></div>
        <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body text-center">
          <div class="text-muted small">逾期笔数</div><div class="fs-5 fw-bold text-danger">${inv.overdue_count}</div>
        </div></div></div>
      </div>

      <h6 class="text-muted mb-2">佣金支出</h6>
      <div class="row g-3 mb-4">
        <div class="col-md-4"><div class="card border-0 shadow-sm"><div class="card-body text-center">
          <div class="text-muted small">总应付</div><div class="fs-5 fw-bold text-primary">${fmtMoney(c.total)}</div>
        </div></div></div>
        <div class="col-md-4"><div class="card border-0 shadow-sm"><div class="card-body text-center">
          <div class="text-muted small">已付</div><div class="fs-5 fw-bold text-success">${fmtMoney(c.paid)}</div>
        </div></div></div>
        <div class="col-md-4"><div class="card border-0 shadow-sm"><div class="card-body text-center">
          <div class="text-muted small">待付</div><div class="fs-5 fw-bold text-warning">${fmtMoney(c.pending)}</div>
        </div></div></div>
      </div>

      <div class="row g-3">
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm">
            <div class="card-header bg-white"><h6 class="mb-0">即将到期（30天内）</h6></div>
            <div class="card-body p-0">
              ${data.upcoming.length ? `<table class="table table-sm table-hover mb-0">
                <thead><tr><th>学生</th><th>类型</th><th>计划/账单</th><th>金额</th><th>到期日</th></tr></thead>
                <tbody>${data.upcoming.map(u => `<tr>
                  <td>${u.student_name||'-'}</td>
                  <td><span class="badge bg-${u.source==='invoice'?'info':'primary'} bg-opacity-75">${u.source==='invoice'?'账单':'学费'}</span></td>
                  <td>${u.plan_name||'-'}</td>
                  <td>${fmtMoney(u.amount_due)}</td><td>${u.due_date}</td>
                </tr>`).join('')}</tbody>
              </table>` : '<div class="text-center text-muted py-3">暂无</div>'}
            </div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm">
            <div class="card-header bg-white"><h6 class="mb-0 text-danger">逾期列表</h6></div>
            <div class="card-body p-0">
              ${data.overdue.length ? `<table class="table table-sm table-hover mb-0">
                <thead><tr><th>学生</th><th>类型</th><th>计划/账单</th><th>金额</th><th>逾期天数</th></tr></thead>
                <tbody>${data.overdue.map(o => `<tr class="table-danger">
                  <td>${o.student_name||'-'}</td>
                  <td><span class="badge bg-${o.source==='invoice'?'info':'primary'} bg-opacity-75">${o.source==='invoice'?'账单':'学费'}</span></td>
                  <td>${o.plan_name||'-'}</td>
                  <td>${fmtMoney(o.amount_due)}</td><td>${o.overdue_days} 天</td>
                </tr>`).join('')}</tbody>
              </table>` : '<div class="text-center text-muted py-3">暂无逾期</div>'}
            </div>
          </div>
        </div>
      </div>`;
  } catch(e) { container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
}

async function generateReminders() {
  try {
    const r = await POST('/api/finance/generate-reminders');
    showToast(`已生成 ${r.created} 条提醒`);
  } catch(e) { showToast(e.message, 'danger'); }
}

// ═══════════════════════════════════════════════════════
//  Tab 2: 学费管理
// ═══════════════════════════════════════════════════════

async function renderTuitionTab(container) {
  try {
    const plans = await GET('/api/tuition-plans');
    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div class="d-flex gap-2">
          <select id="tp-status-filter" class="form-select form-select-sm" style="width:auto" onchange="filterTuitionPlans()">
            <option value="">全部状态</option>
            <option value="active">进行中</option><option value="completed">已完成</option>
            <option value="suspended">已暂停</option><option value="cancelled">已取消</option>
          </select>
          <input id="tp-search" class="form-control form-control-sm" style="width:200px" placeholder="搜索学生名..." oninput="filterTuitionPlans()">
        </div>
        ${hasRole('principal','finance') ? '<button class="btn btn-sm btn-primary" onclick="showCreatePlanModal()"><i class="bi bi-plus"></i> 新建计划</button>' : ''}
      </div>
      <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
          <table class="table table-sm table-hover mb-0">
            <thead class="table-light"><tr>
              <th>学生</th><th>计划名称</th><th>频率</th><th>总额</th><th>已缴</th><th>未缴</th><th>状态</th><th>下期到期</th>
            </tr></thead>
            <tbody id="tp-tbody">
              ${plans.map(p => tuitionPlanRow(p)).join('')}
            </tbody>
          </table>
          ${plans.length === 0 ? '<div class="text-center text-muted py-4">暂无学费计划</div>' : ''}
        </div>
      </div>`;
    window._tuitionPlans = plans;
  } catch(e) { container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
}

function tuitionPlanRow(p) {
  const paid = p.total_paid || 0;
  const unpaid = p.total_amount - paid;
  return `<tr style="cursor:pointer" onclick="navigate('tuition-plan-detail',{planId:'${p.id}'})">
    <td>${p.student_name||'-'}</td>
    <td>${p.plan_name}</td>
    <td>${FREQ_LABELS[p.frequency]||p.frequency}</td>
    <td>${fmtMoney(p.total_amount, p.currency)}</td>
    <td class="text-success">${fmtMoney(paid, p.currency)}</td>
    <td class="text-warning">${fmtMoney(unpaid, p.currency)}</td>
    <td><span class="badge bg-${PLAN_STATUS_COLORS[p.status]||'secondary'}">${PLAN_STATUS_LABELS[p.status]||p.status}</span></td>
    <td>${p.next_due_date || '-'}</td>
  </tr>`;
}

function filterTuitionPlans() {
  const status = document.getElementById('tp-status-filter')?.value || '';
  const q = (document.getElementById('tp-search')?.value || '').toLowerCase();
  const filtered = (window._tuitionPlans || []).filter(p => {
    if (status && p.status !== status) return false;
    if (q && !(p.student_name||'').toLowerCase().includes(q)) return false;
    return true;
  });
  const tbody = document.getElementById('tp-tbody');
  if (tbody) tbody.innerHTML = filtered.map(p => tuitionPlanRow(p)).join('') || '<tr><td colspan="8" class="text-center text-muted py-3">无匹配结果</td></tr>';
}

// ═══════════════════════════════════════════════════════
//  计划详情（独立页面，非 tab）
// ═══════════════════════════════════════════════════════

async function renderTuitionPlanDetail(params) {
  const el = document.getElementById('main-content');
  const planId = params?.planId || new URLSearchParams(location.hash.split('?')[1]).get('planId');
  if (!planId) { el.innerHTML = '<div class="alert alert-warning m-4">缺少计划 ID</div>'; return; }
  el.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  try {
    const plan = await GET(`/api/tuition-plans/${planId}`);
    const paidCount = plan.installments.filter(i => i.status === 'paid' || i.status === 'waived').length;
    const total = plan.installments.length;
    const pct = total ? Math.round(paidCount / total * 100) : 0;
    const canPay = hasRole('principal','finance');
    const canWaive = hasRole('principal');

    el.innerHTML = `
      <div class="container-fluid p-4">
        <button class="btn btn-sm btn-outline-secondary mb-3" onclick="navigate('finance',{tab:'tuition'})"><i class="bi bi-arrow-left"></i> 返回列表</button>
        <div class="d-flex justify-content-between align-items-start mb-3">
          <div>
            <h4 class="mb-1">${plan.student_name||'-'} — ${plan.plan_name}</h4>
            <div class="text-muted">
              <span class="badge bg-${PLAN_STATUS_COLORS[plan.status]||'secondary'} me-2">${PLAN_STATUS_LABELS[plan.status]||plan.status}</span>
              ${FREQ_LABELS[plan.frequency]||plan.frequency} · ${fmtMoney(plan.total_amount, plan.currency)} · ${total} 期
            </div>
          </div>
          <div>
            ${canPay && plan.status === 'active' ? `
              <button class="btn btn-sm btn-outline-warning me-1" onclick="updatePlanStatus('${planId}','suspended')">暂停</button>
              <button class="btn btn-sm btn-outline-danger" onclick="updatePlanStatus('${planId}','cancelled')">取消</button>
            ` : ''}
            ${canPay && plan.status === 'suspended' ? `<button class="btn btn-sm btn-outline-success" onclick="updatePlanStatus('${planId}','active')">恢复</button>` : ''}
          </div>
        </div>

        <div class="mb-3">
          <div class="d-flex justify-content-between small mb-1">
            <span>缴费进度</span><span>${paidCount}/${total} (${pct}%)</span>
          </div>
          <div class="progress" style="height:8px">
            <div class="progress-bar bg-success" style="width:${pct}%"></div>
          </div>
        </div>

        ${plan.notes ? `<div class="alert alert-info py-2 small mb-3">${plan.notes}</div>` : ''}

        <div class="card border-0 shadow-sm">
          <div class="card-body p-0">
            <table class="table table-sm table-hover mb-0">
              <thead class="table-light"><tr>
                <th>期数</th><th>到期日</th><th>应缴</th><th>已缴</th><th>方式</th><th>状态</th><th>操作</th>
              </tr></thead>
              <tbody>
                ${plan.installments.map((inst, idx) => `<tr>
                  <td>${idx + 1}</td>
                  <td>${inst.due_date}</td>
                  <td>${fmtMoney(inst.amount_due, plan.currency)}</td>
                  <td>${inst.status === 'paid' ? fmtMoney(inst.amount_paid, plan.currency) : '-'}</td>
                  <td>${inst.method ? (METHOD_LABELS[inst.method]||inst.method) : '-'}</td>
                  <td><span class="badge bg-${PAY_STATUS_COLORS[inst.status]||'secondary'}">${PAY_STATUS_LABELS[inst.status]||inst.status}</span></td>
                  <td>
                    ${(inst.status === 'unpaid' || inst.status === 'overdue') && canPay ? `<button class="btn btn-xs btn-success" onclick="showPayModal('${inst.id}',${inst.amount_due},'${plan.currency}','${planId}')">登记缴费</button>` : ''}
                    ${(inst.status === 'unpaid' || inst.status === 'overdue') && canWaive ? `<button class="btn btn-xs btn-outline-info ms-1" onclick="waiveInstallment('${inst.id}','${planId}')">免除</button>` : ''}
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  } catch(e) { el.innerHTML = `<div class="alert alert-danger m-4">${e.message}</div>`; }
}

function showPayModal(instId, amountDue, currency, planId) {
  const today = new Date().toISOString().split('T')[0];
  showModal('登记缴费', `
    <div class="mb-3"><label class="form-label">金额</label>
      <input type="number" class="form-control" id="pay-amount" value="${amountDue}" step="0.01"></div>
    <div class="mb-3"><label class="form-label">方式</label>
      <select class="form-select" id="pay-method">
        <option value="bank_transfer">银行转账</option><option value="paynow">PayNow</option>
        <option value="cash">现金</option><option value="cheque">支票</option><option value="card">刷卡</option>
      </select></div>
    <div class="mb-3"><label class="form-label">流水号</label>
      <input type="text" class="form-control" id="pay-ref" placeholder="可选"></div>
    <div class="mb-3"><label class="form-label">缴费日期</label>
      <input type="date" class="form-control" id="pay-date" value="${today}"></div>
    <div class="mb-3"><label class="form-label">备注</label>
      <input type="text" class="form-control" id="pay-notes" placeholder="可选"></div>
  `, async () => {
    try {
      await POST(`/api/tuition-payments/${instId}/pay`, {
        amount: parseFloat(document.getElementById('pay-amount').value),
        method: document.getElementById('pay-method').value,
        reference_no: document.getElementById('pay-ref').value,
        paid_at: document.getElementById('pay-date').value,
        notes: document.getElementById('pay-notes').value,
      });
      showToast('缴费登记成功');
      renderTuitionPlanDetail({ planId });
    } catch(e) { showToast(e.message, 'danger'); }
  }, '确认缴费');
}

async function waiveInstallment(instId, planId) {
  if (!confirm('确定免除该期学费？')) return;
  try {
    await PUT(`/api/tuition-payments/${instId}/waive`, { reason: '管理员免除' });
    showToast('已免除');
    renderTuitionPlanDetail({ planId });
  } catch(e) { showToast(e.message, 'danger'); }
}

async function updatePlanStatus(planId, status) {
  const label = { suspended:'暂停', cancelled:'取消', active:'恢复' }[status];
  if (!confirm(`确定${label}该学费计划？`)) return;
  try {
    await PUT(`/api/tuition-plans/${planId}`, { status });
    showToast(`已${label}`);
    renderTuitionPlanDetail({ planId });
  } catch(e) { showToast(e.message, 'danger'); }
}

// ═══════════════════════════════════════════════════════
//  创建学费计划 Modal
// ═══════════════════════════════════════════════════════

async function showCreatePlanModal() {
  let students = [];
  try { students = await GET('/api/students'); } catch(e) {}
  const opts = students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  const today = new Date().toISOString().split('T')[0];
  showModal('新建学费计划', `
    <div class="mb-3"><label class="form-label">学生</label>
      <select class="form-select" id="cp-student">${opts}</select></div>
    <div class="mb-3"><label class="form-label">计划名称</label>
      <input type="text" class="form-control" id="cp-name" placeholder="如：2026年度学费"></div>
    <div class="row">
      <div class="col-6 mb-3"><label class="form-label">总金额</label>
        <input type="number" class="form-control" id="cp-amount" step="0.01"></div>
      <div class="col-6 mb-3"><label class="form-label">币种</label>
        <select class="form-select" id="cp-currency"><option value="SGD">SGD</option><option value="CNY">CNY</option><option value="USD">USD</option><option value="GBP">GBP</option></select></div>
    </div>
    <div class="row">
      <div class="col-6 mb-3"><label class="form-label">缴费频率</label>
        <select class="form-select" id="cp-freq">
          <option value="monthly">月缴（12期）</option><option value="quarterly">季缴（4期）</option>
          <option value="semi_annual">半年缴（2期）</option><option value="annual">年缴（1期）</option>
          <option value="one_time">一次性</option>
        </select></div>
      <div class="col-6 mb-3"><label class="form-label">起始日期</label>
        <input type="date" class="form-control" id="cp-start" value="${today}"></div>
    </div>
    <div class="mb-3"><label class="form-label">备注</label>
      <input type="text" class="form-control" id="cp-notes" placeholder="可选"></div>
  `, async () => {
    try {
      const r = await POST('/api/tuition-plans', {
        student_id: document.getElementById('cp-student').value,
        plan_name: document.getElementById('cp-name').value,
        total_amount: parseFloat(document.getElementById('cp-amount').value),
        currency: document.getElementById('cp-currency').value,
        frequency: document.getElementById('cp-freq').value,
        start_date: document.getElementById('cp-start').value,
        notes: document.getElementById('cp-notes').value,
      });
      showToast(`学费计划已创建，共 ${r.installments} 期`);
      navigate('tuition-plan-detail', { planId: r.id });
    } catch(e) { showToast(e.message, 'danger'); }
  }, '创建', 'lg');
}

// ═══════════════════════════════════════════════════════
//  Tab 3: 财务报表
// ═══════════════════════════════════════════════════════

async function renderFinanceReportsTab(container) {
  try {
    const [tuition, commissions, cashflow] = await Promise.all([
      GET('/api/finance/report/tuition'),
      GET('/api/finance/report/commissions'),
      GET('/api/finance/report/cashflow'),
    ]);
    container.innerHTML = `
      <ul class="nav nav-pills mb-3" id="report-tabs">
        <li class="nav-item"><a class="nav-link active" href="#" onclick="showReportTab('tuition',event)">学费报表</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="showReportTab('commission',event)">佣金报表</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="showReportTab('cashflow',event)">现金流</a></li>
      </ul>
      <div id="report-content"></div>`;
    window._reportData = { tuition, commissions, cashflow };
    showReportTab('tuition');
  } catch(e) { container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
}

function showReportTab(tab, evt) {
  if (evt) { evt.preventDefault(); document.querySelectorAll('#report-tabs .nav-link').forEach(a => a.classList.remove('active')); evt.target.classList.add('active'); }
  const rd = window._reportData || {};
  const el = document.getElementById('report-content');
  if (!el) return;

  if (tab === 'tuition') {
    const rows = (rd.tuition || []);
    el.innerHTML = `
      <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
          <table class="table table-sm table-hover mb-0">
            <thead class="table-light"><tr><th>月份</th><th>应收</th><th>实收</th><th>收缴率</th><th>总笔数</th><th>已缴笔数</th></tr></thead>
            <tbody>${rows.map(r => {
              const rate = r.total_due > 0 ? Math.round(r.total_paid / r.total_due * 100) : 0;
              return `<tr><td>${r.month}</td><td>${fmtMoney(r.total_due)}</td><td>${fmtMoney(r.total_paid)}</td>
                <td><div class="progress" style="height:18px;min-width:80px"><div class="progress-bar bg-success" style="width:${rate}%">${rate}%</div></div></td>
                <td>${r.total_count}</td><td>${r.paid_count}</td></tr>`;
            }).join('')}</tbody>
          </table>
          ${rows.length === 0 ? '<div class="text-center text-muted py-3">暂无数据</div>' : ''}
        </div>
      </div>`;
  } else if (tab === 'commission') {
    const rows = (rd.commissions || []);
    el.innerHTML = `
      <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
          <table class="table table-sm table-hover mb-0">
            <thead class="table-light"><tr><th>代理</th><th>总佣金</th><th>已付</th><th>待付</th><th>推荐数</th></tr></thead>
            <tbody>${rows.map(r => `<tr>
              <td>${r.agent_name}</td><td>${fmtMoney(r.total_commission)}</td>
              <td class="text-success">${fmtMoney(r.paid)}</td><td class="text-warning">${fmtMoney(r.pending)}</td>
              <td>${r.referral_count}</td>
            </tr>`).join('')}</tbody>
          </table>
          ${rows.length === 0 ? '<div class="text-center text-muted py-3">暂无数据</div>' : ''}
        </div>
      </div>`;
  } else if (tab === 'cashflow') {
    const rows = (rd.cashflow || []);
    let cumulative = 0;
    el.innerHTML = `
      <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
          <table class="table table-sm table-hover mb-0">
            <thead class="table-light"><tr><th>月份</th><th>学费收入</th><th>佣金支出</th><th>净额</th><th>累计</th></tr></thead>
            <tbody>${rows.map(r => {
              cumulative += r.net;
              return `<tr><td>${r.month}</td>
                <td class="text-success">${fmtMoney(r.income)}</td>
                <td class="text-danger">${fmtMoney(r.expense)}</td>
                <td class="${r.net >= 0 ? 'text-success' : 'text-danger'}">${fmtMoney(r.net)}</td>
                <td class="${cumulative >= 0 ? 'text-primary' : 'text-danger'} fw-bold">${fmtMoney(cumulative)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
          ${rows.length === 0 ? '<div class="text-center text-muted py-3">暂无数据</div>' : ''}
        </div>
      </div>`;
  }
}
