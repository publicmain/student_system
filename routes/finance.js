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
      return res.status(500).json({ error: '删除失败: ' + e.message });
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

  return router;
};
