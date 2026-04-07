/**
 * routes/finance.js — 护照档案、账单 CRUD、收款与对账
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole }) {
  const router = express.Router();

  // ═══════════════════════════════════════════════════════
  //  PASSPORT PROFILES
  // ═══════════════════════════════════════════════════════

  router.get('/students/:id/passport', requireRole('principal','intake_staff'), (req, res) => {
    const profiles = db.all('SELECT * FROM passport_profiles WHERE student_id=? ORDER BY created_at DESC', [req.params.id]);
    res.json(profiles);
  });

  router.post('/students/:id/passport', requireRole('principal','intake_staff'), (req, res) => {
    const { passport_no, nationality, date_of_birth, expiry_date, issued_at } = req.body;
    if (!passport_no || !nationality || !expiry_date) return res.status(400).json({ error: '缺少必填字段' });
    // R12: 护照日期格式校验
    if (isNaN(Date.parse(expiry_date))) return res.status(400).json({ error: 'expiry_date 日期格式无效' });
    if (date_of_birth && isNaN(Date.parse(date_of_birth))) return res.status(400).json({ error: 'date_of_birth 日期格式无效' });
    if (issued_at && isNaN(Date.parse(issued_at))) return res.status(400).json({ error: 'issued_at 日期格式无效' });
    const id = uuidv4();
    db.run(`INSERT INTO passport_profiles (id,student_id,passport_no,nationality,date_of_birth,expiry_date,issued_at) VALUES (?,?,?,?,?,?,?)`,
      [id, req.params.id, passport_no, nationality, date_of_birth||null, expiry_date, issued_at||null]);
    audit(req, 'CREATE', 'passport_profiles', id, { student_id: req.params.id, nationality });
    res.json({ id, passport_no, nationality, expiry_date });
  });

  // ═══════════════════════════════════════════════════════
  //  FINANCE — INVOICES
  // ═══════════════════════════════════════════════════════

  router.post('/intake-cases/:id/invoices', requireRole('principal','intake_staff'), (req, res) => {
    // F-04: 验证 case 存在性
    const caseExists = db.get('SELECT id FROM intake_cases WHERE id=?', [req.params.id]);
    if (!caseExists) return res.status(404).json({ error: '案例不存在' });
    const { currency, items, due_at } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items 不能为空' });
    // R16: 校验每项金额必须 > 0
    for (const item of items) {
      if (!item.name || !item.name.trim()) return res.status(400).json({ error: '每个费用项目必须有名称' });
      if (!item.amount || item.amount <= 0) return res.status(400).json({ error: `费用项目 "${item.name}" 的金额必须大于 0` });
    }
    const amount_total = items.reduce((s, i) => s + (i.amount || 0), 0);
    const year = new Date().getFullYear();
    const maxRow = db.get(`SELECT MAX(CAST(SUBSTR(invoice_no,10) AS INTEGER)) as mx FROM finance_invoices WHERE invoice_no LIKE ?`, [`INV-${year}-%`]);
    const invoice_no = `INV-${year}-${String((maxRow?.mx || 0) + 1).padStart(4, '0')}`;
    const id = uuidv4();
    db.run(`INSERT INTO finance_invoices (id,case_id,invoice_no,currency,amount_total,items_json,due_at,created_by) VALUES (?,?,?,?,?,?,?,?)`,
      [id, req.params.id, invoice_no, currency||'SGD', amount_total, JSON.stringify(items), due_at||null, req.session.user.id]);
    audit(req, 'CREATE', 'finance_invoices', id, { case_id: req.params.id, amount_total, invoice_no });
    res.json({ id, invoice_no, amount_total, currency: currency||'SGD', status: 'unpaid' });
  });

  router.get('/invoices', requireRole('principal','intake_staff'), (req, res) => {
    const { status, case_id } = req.query;
    let where = ['1=1'];
    let params = [];
    if (status) { where.push('fi.status=?'); params.push(status); }
    if (case_id) { where.push('fi.case_id=?'); params.push(case_id); }
    const invoices = db.all(`
      SELECT fi.*, ic.program_name, s.name as student_name,
        COALESCE((SELECT SUM(fp.paid_amount) FROM finance_payments fp WHERE fp.invoice_id=fi.id), 0) as paid_amount
      FROM finance_invoices fi
      LEFT JOIN intake_cases ic ON ic.id=fi.case_id
      LEFT JOIN students s ON s.id=ic.student_id
      WHERE ${where.join(' AND ')}
      ORDER BY fi.created_at DESC
    `, params);
    res.json(invoices);
  });

  router.put('/invoices/:id/void', requireRole('principal'), (req, res) => {
    const invoice = db.get('SELECT * FROM finance_invoices WHERE id=?', [req.params.id]);
    if (!invoice) return res.status(404).json({ error: '账单不存在' });
    if (invoice.status === 'paid') return res.status(400).json({ error: '账单已付清，不可直接作废。如需作废请先退款并联系管理员处理佣金' });
    if (invoice.status === 'void') return res.status(400).json({ error: '账单已是作废状态' });
    const { void_reason } = req.body;
    db.run(`UPDATE finance_invoices SET status='void',void_reason=?,updated_at=datetime('now') WHERE id=?`, [void_reason||null, req.params.id]);
    // Void all pending/approved commission payouts linked to this invoice
    db.run(`UPDATE commission_payouts SET status='void',updated_at=datetime('now') WHERE invoice_id=? AND status IN ('pending','approved')`, [req.params.id]);
    audit(req, 'VOID', 'finance_invoices', req.params.id, { void_reason });
    res.json({ ok: true });
  });

  router.delete('/invoices/:id', requireRole('principal'), (req, res) => {
    const invoice = db.get('SELECT * FROM finance_invoices WHERE id=?', [req.params.id]);
    if (!invoice) return res.status(404).json({ error: '账单不存在' });
    try {
      db.transaction((run) => {
        run(`DELETE FROM commission_payouts WHERE invoice_id=?`, [req.params.id]);
        run(`DELETE FROM finance_payments WHERE invoice_id=?`, [req.params.id]);
        run(`DELETE FROM finance_invoices WHERE id=?`, [req.params.id]);
      });
    } catch(e) {
      console.error('[finance]', e);
      return res.status(500).json({ error: '删除失败，请重试' });
    }
    audit(req, 'DELETE', 'finance_invoices', req.params.id, { invoice_no: invoice.invoice_no, amount_total: invoice.amount_total });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  //  FINANCE — PAYMENTS
  // ═══════════════════════════════════════════════════════

  router.post('/invoices/:id/payments', requireRole('principal','intake_staff'), (req, res) => {
    const { paid_amount, method, paid_at, reference_no, notes } = req.body;
    if (!paid_amount || paid_amount <= 0) return res.status(400).json({ error: 'paid_amount 必须 > 0' });
    const invoice = db.get('SELECT * FROM finance_invoices WHERE id=?', [req.params.id]);
    if (!invoice) return res.status(404).json({ error: '账单不存在' });
    if (invoice.status === 'void') return res.status(400).json({ error: '账单已作废' });
    if (invoice.status === 'paid') return res.status(400).json({ error: '账单已付清，无需继续收款' });
    // 校验付款金额不超过账单未付余额（使用整数分运算避免浮点精度问题）
    const alreadyPaid = (db.get('SELECT COALESCE(SUM(paid_amount),0) as total FROM finance_payments WHERE invoice_id=?', [req.params.id]).total) || 0;
    const remainingCents = Math.round(invoice.amount_total * 100) - Math.round(alreadyPaid * 100);
    const paidCents = Math.round(paid_amount * 100);
    if (paidCents > remainingCents) {
      const remaining = remainingCents / 100;
      return res.status(400).json({ error: `付款金额（${paid_amount}）超过账单未付余额（${remaining.toFixed(2)}）` });
    }
    const payId = uuidv4();
    db.run(`INSERT INTO finance_payments (id,invoice_id,paid_amount,method,paid_at,reference_no,notes,created_by) VALUES (?,?,?,?,?,?,?,?)`,
      [payId, req.params.id, paid_amount, method||'bank_transfer', paid_at||new Date().toISOString(), reference_no||null, notes||null, req.session.user.id]);
    const totalPaid = db.get('SELECT SUM(paid_amount) as total FROM finance_payments WHERE invoice_id=?', [req.params.id]).total || 0;
    const newStatus = totalPaid >= invoice.amount_total ? 'paid' : 'partial';
    db.run(`UPDATE finance_invoices SET status=?,updated_at=datetime('now') WHERE id=?`, [newStatus, req.params.id]);
    audit(req, 'CREATE', 'finance_payments', payId, { invoice_id: req.params.id, paid_amount, method });
    res.json({ id: payId, paid_amount, status: newStatus });
  });

  router.put('/payments/:id/reconcile', requireRole('principal'), (req, res) => {
    const payment = db.get('SELECT id FROM finance_payments WHERE id=?', [req.params.id]);
    if (!payment) return res.status(404).json({ error: '收款记录不存在' });
    db.run(`UPDATE finance_payments SET reconciled=1, reconciled_by=?, reconciled_at=datetime('now') WHERE id=?`,
      [req.session.user.id, req.params.id]);
    audit(req, 'RECONCILE', 'finance_payments', req.params.id, null);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  //  TUITION FEE PLANS
  // ═══════════════════════════════════════════════════════

  // 生成分期日期和标签的工具函数
  function generateInstallments(frequency, totalAmount, startDate) {
    const map = { monthly: 12, quarterly: 4, semi_annual: 2, annual: 1, one_time: 1 };
    const num = map[frequency] || 1;
    const amt = Math.round(totalAmount / num * 100) / 100;
    const installments = [];
    const start = new Date(startDate);
    for (let i = 0; i < num; i++) {
      const d = new Date(start);
      if (frequency === 'monthly') d.setMonth(d.getMonth() + i);
      else if (frequency === 'quarterly') d.setMonth(d.getMonth() + i * 3);
      else if (frequency === 'semi_annual') d.setMonth(d.getMonth() + i * 6);
      else if (frequency === 'annual') d.setFullYear(d.getFullYear() + i);
      const dueDate = d.toISOString().split('T')[0];
      let label;
      if (frequency === 'monthly') label = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      else if (frequency === 'quarterly') label = `${d.getFullYear()}-Q${Math.floor(d.getMonth()/3)+1}`;
      else if (frequency === 'semi_annual') label = `${d.getFullYear()}-H${Math.floor(d.getMonth()/6)+1}`;
      else label = `${d.getFullYear()}`;
      // 最后一期承担余额差（避免浮点）
      const finalAmt = (i === num - 1) ? Math.round((totalAmount - amt * (num - 1)) * 100) / 100 : amt;
      installments.push({ period_label: label, due_date: dueDate, amount_due: finalAmt });
    }
    return installments;
  }

  // 重算 plan 的 paid_through / next_due_date / status
  function recalcPlan(planId) {
    const payments = db.all('SELECT * FROM tuition_fee_payments WHERE plan_id=? ORDER BY due_date', [planId]);
    let paidThrough = null;
    let nextDue = null;
    let allPaid = true;
    for (const p of payments) {
      if (p.status === 'paid' || p.status === 'waived') {
        paidThrough = p.due_date;
      } else {
        allPaid = false;
        if (!nextDue) nextDue = p.due_date;
      }
    }
    const newStatus = allPaid ? 'completed' : 'active';
    db.run(`UPDATE tuition_fee_plans SET paid_through=?, next_due_date=?, status=?, updated_at=datetime('now') WHERE id=?`,
      [paidThrough, nextDue, newStatus, planId]);
  }

  // GET /tuition-plans — 列表
  router.get('/tuition-plans', requireRole('principal','finance','intake_staff'), (req, res) => {
    const { status, student_id, q } = req.query;
    let where = ['1=1'], params = [];
    if (status) { where.push('tp.status=?'); params.push(status); }
    if (student_id) { where.push('tp.student_id=?'); params.push(student_id); }
    if (q) { where.push('s.name LIKE ?'); params.push(`%${q}%`); }
    const plans = db.all(`
      SELECT tp.*, s.name as student_name,
        COALESCE((SELECT SUM(amount_paid) FROM tuition_fee_payments WHERE plan_id=tp.id AND status='paid'), 0) as total_paid,
        COALESCE((SELECT COUNT(*) FROM tuition_fee_payments WHERE plan_id=tp.id AND status IN ('unpaid','overdue')), 0) as unpaid_count
      FROM tuition_fee_plans tp
      LEFT JOIN students s ON s.id=tp.student_id
      WHERE ${where.join(' AND ')}
      ORDER BY tp.created_at DESC
    `, params);
    res.json(plans);
  });

  // GET /tuition-plans/:id — 单个计划 + 分期
  router.get('/tuition-plans/:id', requireRole('principal','finance','intake_staff'), (req, res) => {
    const plan = db.get(`
      SELECT tp.*, s.name as student_name
      FROM tuition_fee_plans tp
      LEFT JOIN students s ON s.id=tp.student_id
      WHERE tp.id=?`, [req.params.id]);
    if (!plan) return res.status(404).json({ error: '计划不存在' });
    plan.installments = db.all('SELECT * FROM tuition_fee_payments WHERE plan_id=? ORDER BY due_date', [req.params.id]);
    res.json(plan);
  });

  // GET /students/:id/tuition-plans — 某学生的计划
  router.get('/students/:id/tuition-plans', requireRole('principal','finance','intake_staff'), (req, res) => {
    const plans = db.all(`
      SELECT tp.*, s.name as student_name,
        COALESCE((SELECT SUM(amount_paid) FROM tuition_fee_payments WHERE plan_id=tp.id AND status='paid'), 0) as total_paid
      FROM tuition_fee_plans tp
      LEFT JOIN students s ON s.id=tp.student_id
      WHERE tp.student_id=?
      ORDER BY tp.created_at DESC
    `, [req.params.id]);
    res.json(plans);
  });

  // POST /tuition-plans — 创建计划（自动生成分期）
  router.post('/tuition-plans', requireRole('principal','finance'), (req, res) => {
    const { student_id, plan_name, total_amount, frequency, start_date, currency, notes } = req.body;
    if (!student_id || !plan_name || !total_amount || !frequency || !start_date) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    const student = db.get('SELECT id FROM students WHERE id=?', [student_id]);
    if (!student) return res.status(404).json({ error: '学生不存在' });

    const installments = generateInstallments(frequency, total_amount, start_date);
    const planId = uuidv4();
    try {
      db.transaction((run) => {
        run(`INSERT INTO tuition_fee_plans (id,student_id,plan_name,currency,total_amount,frequency,installment_amount,num_installments,start_date,next_due_date,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [planId, student_id, plan_name, currency || 'SGD', total_amount, frequency,
           installments[0]?.amount_due || total_amount, installments.length, start_date,
           installments[0]?.due_date || start_date, req.session.user.id]);
        for (const inst of installments) {
          run(`INSERT INTO tuition_fee_payments (id,plan_id,period_label,due_date,amount_due,created_by) VALUES (?,?,?,?,?,?)`,
            [uuidv4(), planId, inst.period_label, inst.due_date, inst.amount_due, req.session.user.id]);
        }
      });
    } catch (e) {
      console.error('[finance]', e);
      return res.status(500).json({ error: '创建失败' });
    }
    audit(req, 'CREATE', 'tuition_fee_plans', planId, { student_id, plan_name, total_amount, frequency, installments: installments.length });
    res.json({ id: planId, installments: installments.length });
  });

  // PUT /tuition-plans/:id — 编辑计划（名称/备注/暂停/取消）
  router.put('/tuition-plans/:id', requireRole('principal','finance'), (req, res) => {
    const plan = db.get('SELECT * FROM tuition_fee_plans WHERE id=?', [req.params.id]);
    if (!plan) return res.status(404).json({ error: '计划不存在' });
    const { plan_name, notes, status } = req.body;
    const updates = [];
    const params = [];
    if (plan_name !== undefined) { updates.push('plan_name=?'); params.push(plan_name); }
    if (notes !== undefined) { updates.push('notes=?'); params.push(notes); }
    if (status && ['active','suspended','cancelled'].includes(status)) { updates.push('status=?'); params.push(status); }
    if (updates.length === 0) return res.status(400).json({ error: '无更新内容' });
    updates.push("updated_at=datetime('now')");
    params.push(req.params.id);
    db.run(`UPDATE tuition_fee_plans SET ${updates.join(',')} WHERE id=?`, params);
    audit(req, 'UPDATE', 'tuition_fee_plans', req.params.id, req.body);
    res.json({ ok: true });
  });

  // DELETE /tuition-plans/:id — 删除（仅无付款记录时）
  router.delete('/tuition-plans/:id', requireRole('principal'), (req, res) => {
    const plan = db.get('SELECT * FROM tuition_fee_plans WHERE id=?', [req.params.id]);
    if (!plan) return res.status(404).json({ error: '计划不存在' });
    const hasPaid = db.get('SELECT id FROM tuition_fee_payments WHERE plan_id=? AND status="paid"', [req.params.id]);
    if (hasPaid) return res.status(400).json({ error: '该计划已有缴费记录，不可删除' });
    try {
      db.transaction((run) => {
        run('DELETE FROM tuition_fee_payments WHERE plan_id=?', [req.params.id]);
        run('DELETE FROM tuition_fee_plans WHERE id=?', [req.params.id]);
      });
    } catch (e) {
      return res.status(500).json({ error: '删除失败' });
    }
    audit(req, 'DELETE', 'tuition_fee_plans', req.params.id, { plan_name: plan.plan_name });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  //  TUITION PAYMENTS
  // ═══════════════════════════════════════════════════════

  // POST /tuition-payments/:installmentId/pay — 登记缴费
  router.post('/tuition-payments/:installmentId/pay', requireRole('principal','finance'), (req, res) => {
    const inst = db.get('SELECT * FROM tuition_fee_payments WHERE id=?', [req.params.installmentId]);
    if (!inst) return res.status(404).json({ error: '分期不存在' });
    if (inst.status === 'paid') return res.status(400).json({ error: '该期已付清' });
    if (inst.status === 'waived') return res.status(400).json({ error: '该期已免除' });
    const { amount, method, reference_no, paid_at, notes } = req.body;
    const paidAmount = amount || inst.amount_due;
    const now = new Date().toISOString();
    db.run(`UPDATE tuition_fee_payments SET amount_paid=?, method=?, reference_no=?, paid_at=?, notes=?, status='paid', updated_at=? WHERE id=?`,
      [paidAmount, method || 'bank_transfer', reference_no || null, paid_at || now, notes || null, now, req.params.installmentId]);
    recalcPlan(inst.plan_id);
    audit(req, 'PAY', 'tuition_fee_payments', req.params.installmentId, { amount: paidAmount, method });
    const plan = db.get('SELECT * FROM tuition_fee_plans WHERE id=?', [inst.plan_id]);
    res.json({ ok: true, plan_status: plan?.status, paid_through: plan?.paid_through, next_due_date: plan?.next_due_date });
  });

  // PUT /tuition-payments/:id/waive — 免除某期
  router.put('/tuition-payments/:id/waive', requireRole('principal'), (req, res) => {
    const inst = db.get('SELECT * FROM tuition_fee_payments WHERE id=?', [req.params.id]);
    if (!inst) return res.status(404).json({ error: '分期不存在' });
    if (inst.status === 'paid') return res.status(400).json({ error: '该期已付清，无法免除' });
    db.run(`UPDATE tuition_fee_payments SET status='waived', notes=?, updated_at=datetime('now') WHERE id=?`,
      [req.body.reason || '免除', req.params.id]);
    recalcPlan(inst.plan_id);
    audit(req, 'WAIVE', 'tuition_fee_payments', req.params.id, { reason: req.body.reason });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  //  FINANCE DASHBOARD
  // ═══════════════════════════════════════════════════════

  router.get('/finance/dashboard', requireRole('principal','finance'), (req, res) => {
    // 学费 KPI
    const tuitionTotal = db.get('SELECT COALESCE(SUM(total_amount),0) as val FROM tuition_fee_plans WHERE status IN ("active","completed")') || {};
    const tuitionPaid = db.get('SELECT COALESCE(SUM(amount_paid),0) as val FROM tuition_fee_payments WHERE status="paid"') || {};
    const overdueCount = db.get('SELECT COUNT(*) as val FROM tuition_fee_payments WHERE status IN ("unpaid","overdue") AND due_date < date("now")') || {};
    // 佣金 KPI
    const commTotal = db.get('SELECT COALESCE(SUM(commission_amount),0) as val FROM commission_payouts WHERE status != "void"') || {};
    const commPaid = db.get('SELECT COALESCE(SUM(commission_amount),0) as val FROM commission_payouts WHERE status="paid"') || {};
    const commPending = db.get('SELECT COALESCE(SUM(commission_amount),0) as val FROM commission_payouts WHERE status IN ("pending","approved")') || {};
    // 即将到期（30天内）
    const upcoming = db.all(`
      SELECT tfp.*, tp.plan_name, tp.student_id, s.name as student_name
      FROM tuition_fee_payments tfp
      JOIN tuition_fee_plans tp ON tp.id=tfp.plan_id
      LEFT JOIN students s ON s.id=tp.student_id
      WHERE tfp.status IN ('unpaid','overdue') AND tfp.due_date <= date('now','+30 days')
      ORDER BY tfp.due_date
      LIMIT 50
    `);
    // 逾期列表
    const overdue = db.all(`
      SELECT tfp.*, tp.plan_name, tp.student_id, s.name as student_name,
        CAST(julianday('now') - julianday(tfp.due_date) AS INTEGER) as overdue_days
      FROM tuition_fee_payments tfp
      JOIN tuition_fee_plans tp ON tp.id=tfp.plan_id
      LEFT JOIN students s ON s.id=tp.student_id
      WHERE tfp.status IN ('unpaid','overdue') AND tfp.due_date < date('now')
      ORDER BY tfp.due_date
      LIMIT 50
    `);
    res.json({
      tuition: { total: tuitionTotal.val, paid: tuitionPaid.val, unpaid: tuitionTotal.val - tuitionPaid.val, overdue_count: overdueCount.val },
      commission: { total: commTotal.val, paid: commPaid.val, pending: commPending.val },
      upcoming, overdue
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FINANCE REPORTS
  // ═══════════════════════════════════════════════════════

  // 学费月度报表
  router.get('/finance/report/tuition', requireRole('principal','finance'), (req, res) => {
    const months = db.all(`
      SELECT strftime('%Y-%m', due_date) as month,
        SUM(amount_due) as total_due,
        SUM(CASE WHEN status='paid' THEN amount_paid ELSE 0 END) as total_paid,
        COUNT(*) as total_count,
        SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paid_count
      FROM tuition_fee_payments
      GROUP BY strftime('%Y-%m', due_date)
      ORDER BY month DESC
      LIMIT 24
    `);
    res.json(months);
  });

  // 佣金报表（按 agent 汇总）
  router.get('/finance/report/commissions', requireRole('principal','finance'), (req, res) => {
    const agents = db.all(`
      SELECT a.id, a.name as agent_name,
        COALESCE(SUM(cp.commission_amount),0) as total_commission,
        COALESCE(SUM(CASE WHEN cp.status='paid' THEN cp.commission_amount ELSE 0 END),0) as paid,
        COALESCE(SUM(CASE WHEN cp.status IN ('pending','approved') THEN cp.commission_amount ELSE 0 END),0) as pending,
        COUNT(DISTINCT r.id) as referral_count
      FROM agents a
      LEFT JOIN referrals r ON r.agent_id=a.id
      LEFT JOIN commission_payouts cp ON cp.referral_id=r.id AND cp.status != 'void'
      GROUP BY a.id
      ORDER BY total_commission DESC
    `);
    res.json(agents);
  });

  // 现金流报表
  router.get('/finance/report/cashflow', requireRole('principal','finance'), (req, res) => {
    // 学费收入按月
    const income = db.all(`
      SELECT strftime('%Y-%m', paid_at) as month, SUM(amount_paid) as amount
      FROM tuition_fee_payments WHERE status='paid' AND paid_at IS NOT NULL
      GROUP BY strftime('%Y-%m', paid_at) ORDER BY month
    `);
    // 佣金支出按月
    const expense = db.all(`
      SELECT strftime('%Y-%m', paid_at) as month, SUM(commission_amount) as amount
      FROM commission_payouts WHERE status='paid' AND paid_at IS NOT NULL
      GROUP BY strftime('%Y-%m', paid_at) ORDER BY month
    `);
    // 合并
    const monthSet = new Set([...income.map(r=>r.month), ...expense.map(r=>r.month)]);
    const incomeMap = Object.fromEntries(income.map(r=>[r.month, r.amount]));
    const expenseMap = Object.fromEntries(expense.map(r=>[r.month, r.amount]));
    const months = [...monthSet].sort().map(m => ({
      month: m, income: incomeMap[m] || 0, expense: expenseMap[m] || 0, net: (incomeMap[m]||0) - (expenseMap[m]||0)
    }));
    res.json(months);
  });

  // ═══════════════════════════════════════════════════════
  //  REMINDERS
  // ═══════════════════════════════════════════════════════

  router.post('/finance/generate-reminders', requireRole('principal','finance'), (req, res) => {
    let created = 0;
    // 更新逾期状态
    db.run(`UPDATE tuition_fee_payments SET status='overdue', updated_at=datetime('now') WHERE status='unpaid' AND due_date < date('now')`);

    // 即将到期（7天内）
    const dueSoon = db.all(`
      SELECT tfp.id, tfp.due_date, tfp.amount_due, tp.plan_name, tp.student_id, s.name as student_name
      FROM tuition_fee_payments tfp
      JOIN tuition_fee_plans tp ON tp.id=tfp.plan_id
      LEFT JOIN students s ON s.id=tp.student_id
      WHERE tfp.status='unpaid' AND tfp.due_date BETWEEN date('now') AND date('now','+7 days')
    `);
    for (const d of dueSoon) {
      const exists = db.get(`SELECT id FROM notification_logs WHERE task_id=? AND type='tuition_due_soon'`, [d.id]);
      if (!exists) {
        db.run(`INSERT INTO notification_logs (id,student_id,task_id,type,title,message,target_role,created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))`,
          [uuidv4(), d.student_id, d.id, 'tuition_due_soon', `学费即将到期：${d.student_name}`,
           `${d.student_name} 的学费计划「${d.plan_name}」有一期 ${d.amount_due} 元将于 ${d.due_date} 到期`, 'finance']);
        created++;
      }
    }
    // 逾期
    const overdue = db.all(`
      SELECT tfp.id, tfp.due_date, tfp.amount_due, tp.plan_name, tp.student_id, s.name as student_name
      FROM tuition_fee_payments tfp
      JOIN tuition_fee_plans tp ON tp.id=tfp.plan_id
      LEFT JOIN students s ON s.id=tp.student_id
      WHERE tfp.status='overdue'
    `);
    for (const d of overdue) {
      const exists = db.get(`SELECT id FROM notification_logs WHERE task_id=? AND type='tuition_overdue'`, [d.id]);
      if (!exists) {
        db.run(`INSERT INTO notification_logs (id,student_id,task_id,type,title,message,target_role,created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))`,
          [uuidv4(), d.student_id, d.id, 'tuition_overdue', `学费逾期：${d.student_name}`,
           `${d.student_name} 的学费计划「${d.plan_name}」有一期 ${d.amount_due} 元已于 ${d.due_date} 逾期`, 'finance']);
        created++;
      }
    }
    // 佣金待支付
    const pendingComm = db.all(`
      SELECT cp.id, cp.commission_amount, a.name as agent_name
      FROM commission_payouts cp
      JOIN referrals r ON r.id=cp.referral_id
      JOIN agents a ON a.id=r.agent_id
      WHERE cp.status='pending'
    `);
    for (const c of pendingComm) {
      const exists = db.get(`SELECT id FROM notification_logs WHERE task_id=? AND type='commission_pending'`, [c.id]);
      if (!exists) {
        db.run(`INSERT INTO notification_logs (id,task_id,type,title,message,target_role,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
          [uuidv4(), c.id, 'commission_pending', `佣金待支付：${c.agent_name}`,
           `代理 ${c.agent_name} 有一笔 ${c.commission_amount} 元佣金待支付`, 'finance']);
        created++;
      }
    }
    audit(req, 'GENERATE_REMINDERS', 'finance', null, { created });
    res.json({ ok: true, created });
  });

  return router;
};
