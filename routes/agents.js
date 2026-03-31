/**
 * routes/agents.js — 代理 CRUD、转介、佣金规则与发放
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, requireAgentModule }) {
  const router = express.Router();

  // ═══════════════════════════════════════════════════════
  //  AGENTS & REFERRALS
  // ═══════════════════════════════════════════════════════

  router.get('/agents', requireRole('principal'), (req, res) => {
    const agents = db.all(`
      SELECT a.*, cr.name as rule_name, cr.rate, cr.type as rule_type,
        COUNT(DISTINCT r.id) as referral_count,
        (SELECT COUNT(*) FROM students s2 WHERE s2.agent_id=a.id AND s2.status!='deleted') as student_count,
        SUM(CASE WHEN ic.status IN ('contract_signed','paid','visa_in_progress','ipa_received','arrived','oriented') THEN 1 ELSE 0 END) as signed_count,
        COALESCE(SUM(CASE WHEN cp.status='pending' THEN cp.commission_amount ELSE 0 END),0) as pending_commission,
        COALESCE(SUM(CASE WHEN cp.status='paid' THEN cp.commission_amount ELSE 0 END),0) as paid_commission
      FROM agents a
      LEFT JOIN commission_rules cr ON cr.id=a.commission_rule_id
      LEFT JOIN referrals r ON r.agent_id=a.id
      LEFT JOIN intake_cases ic ON ic.referral_id=r.id
      LEFT JOIN commission_payouts cp ON cp.referral_id=r.id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `);
    res.json(agents);
  });

  router.get('/agents/:id/students', requireRole('principal'), (req, res) => {
    // 双路径查询：直接 agent_id 字段 + referral 链路（UNION 合并去重）
    const students = db.all(`
      SELECT s.id, s.name, s.grade_level, s.status as student_status, s.exam_board,
        (SELECT ic2.id FROM intake_cases ic2 WHERE ic2.student_id=s.id ORDER BY ic2.created_at DESC LIMIT 1) as case_id,
        (SELECT ic2.program_name FROM intake_cases ic2 WHERE ic2.student_id=s.id ORDER BY ic2.created_at DESC LIMIT 1) as program_name,
        (SELECT ic2.intake_year FROM intake_cases ic2 WHERE ic2.student_id=s.id ORDER BY ic2.created_at DESC LIMIT 1) as intake_year,
        (SELECT ic2.status FROM intake_cases ic2 WHERE ic2.student_id=s.id ORDER BY ic2.created_at DESC LIMIT 1) as case_status,
        s.created_at as enrolled_at
      FROM students s WHERE s.agent_id=? AND s.status != 'deleted'
      UNION
      SELECT DISTINCT s.id, s.name, s.grade_level, s.status as student_status, s.exam_board,
        ic.id as case_id, ic.program_name, ic.intake_year, ic.status as case_status,
        ic.created_at as enrolled_at
      FROM agents a
      JOIN referrals r ON r.agent_id=a.id
      JOIN intake_cases ic ON ic.referral_id=r.id
      JOIN students s ON s.id=ic.student_id
      WHERE a.id=? AND s.status != 'deleted'
      ORDER BY enrolled_at DESC
    `, [req.params.id, req.params.id]);
    res.json(students);
  });

  router.post('/agents', requireRole('principal'), (req, res) => {
    const { name, type, contact, email, phone, commission_rule_id, notes } = req.body;
    if (!name || !type) return res.status(400).json({ error: '缺少 name 或 type' });
    const id = uuidv4();
    db.run(`INSERT INTO agents (id,name,type,contact,email,phone,commission_rule_id,notes) VALUES (?,?,?,?,?,?,?,?)`,
      [id, name, type, contact||null, email||null, phone||null, commission_rule_id||null, notes||null]);
    audit(req, 'CREATE', 'agents', id, { name, type });
    res.json({ id, name, type });
  });

  router.put('/agents/:id', requireRole('principal'), (req, res) => {
    const { name, status, contact, email, phone, commission_rule_id, notes } = req.body;
    db.run(`UPDATE agents SET name=COALESCE(?,name),status=COALESCE(?,status),contact=COALESCE(?,contact),email=COALESCE(?,email),phone=COALESCE(?,phone),commission_rule_id=COALESCE(?,commission_rule_id),notes=COALESCE(?,notes),updated_at=datetime('now') WHERE id=?`,
      [name||null, status||null, contact||null, email||null, phone||null, commission_rule_id||null, notes||null, req.params.id]);
    audit(req, 'UPDATE', 'agents', req.params.id, req.body);
    res.json({ ok: true });
  });

  router.post('/referrals', requireRole('principal'), (req, res) => {
    const { source_type, agent_id, anonymous_label, referrer_name, notes } = req.body;
    if (!source_type) return res.status(400).json({ error: '缺少 source_type' });
    const id = uuidv4();
    db.run(`INSERT INTO referrals (id,source_type,agent_id,anonymous_label,referrer_name,notes) VALUES (?,?,?,?,?,?)`,
      [id, source_type, agent_id||null, anonymous_label||null, referrer_name||null, notes||null]);
    audit(req, 'CREATE', 'referrals', id, { source_type });
    res.json({ id, source_type, agent_id, anonymous_label });
  });

  router.get('/referrals', requireRole('principal'), (req, res) => {
    const referrals = db.all(`
      SELECT r.*, a.name as agent_name,
        COUNT(DISTINCT ic.id) as case_count
      FROM referrals r
      LEFT JOIN agents a ON a.id=r.agent_id
      LEFT JOIN intake_cases ic ON ic.referral_id=r.id
      GROUP BY r.id ORDER BY r.created_at DESC
    `);
    res.json(referrals);
  });

  // ═══════════════════════════════════════════════════════
  //  COMMISSION RULES & PAYOUTS
  // ═══════════════════════════════════════════════════════

  router.get('/commission-rules', requireRole('principal'), (req, res) => {
    res.json(db.all('SELECT * FROM commission_rules ORDER BY created_at DESC'));
  });

  router.post('/commission-rules', requireRole('principal'), (req, res) => {
    const { name, type, rate, fixed_amount, currency, applies_to, notes } = req.body;
    if (!name || !type) return res.status(400).json({ error: '缺少 name 或 type' });
    if (!['percent','fixed'].includes(type)) return res.status(400).json({ error: 'type 必须为 percent 或 fixed' });
    if (type === 'percent') {
      const r = parseFloat(rate);
      if (isNaN(r) || r <= 0 || r > 1) return res.status(400).json({ error: 'percent 类型的 rate 必须在 (0, 1] 之间（例如 0.10 表示10%）' });
    }
    if (type === 'fixed') {
      const fa = parseFloat(fixed_amount);
      if (isNaN(fa) || fa <= 0) return res.status(400).json({ error: 'fixed 类型的 fixed_amount 必须 > 0' });
    }
    const id = uuidv4();
    db.run(`INSERT INTO commission_rules (id,name,type,rate,fixed_amount,currency,applies_to,notes) VALUES (?,?,?,?,?,?,?,?)`,
      [id, name, type, rate||null, fixed_amount||null, currency||'SGD', applies_to||'all', notes||null]);
    audit(req, 'CREATE', 'commission_rules', id, { name, type });
    res.json({ id, name, type });
  });

  router.post('/commissions/apply', requireRole('principal'), (req, res) => {
    const { referral_id, invoice_id, rule_id } = req.body;
    if (!referral_id || !invoice_id || !rule_id) return res.status(400).json({ error: '缺少必填字段' });
    // Prevent duplicate commission for same referral + invoice
    const duplicate = db.get('SELECT id FROM commission_payouts WHERE referral_id=? AND invoice_id=? AND status != "void"', [referral_id, invoice_id]);
    if (duplicate) return res.status(409).json({ error: '该推荐人和账单已存在有效佣金记录，不能重复创建' });
    const rule = db.get('SELECT * FROM commission_rules WHERE id=?', [rule_id]);
    if (!rule) return res.status(404).json({ error: '规则不存在' });
    const reconResult = db.get('SELECT COALESCE(SUM(paid_amount),0) as total FROM finance_payments WHERE invoice_id=? AND reconciled=1', [invoice_id]);
    const base_amount = reconResult.total;
    if (base_amount <= 0) return res.status(400).json({ error: '无已对账收款，无法计算佣金' });
    if (rule.type === 'percent' && (rule.rate == null)) return res.status(400).json({ error: '佣金规则缺少 rate 字段' });
    if (rule.type !== 'percent' && (rule.fixed_amount == null)) return res.status(400).json({ error: '佣金规则缺少 fixed_amount 字段' });
    const commission_amount = rule.type === 'percent' ? base_amount * rule.rate : rule.fixed_amount;
    const id = uuidv4();
    db.run(`INSERT INTO commission_payouts (id,referral_id,invoice_id,rule_id,base_amount,commission_amount,currency) VALUES (?,?,?,?,?,?,?)`,
      [id, referral_id, invoice_id, rule_id, base_amount, commission_amount, rule.currency||'SGD']);
    audit(req, 'CREATE', 'commission_payouts', id, { referral_id, base_amount, commission_amount });
    res.json({ id, base_amount, commission_amount, status: 'pending' });
  });

  router.get('/commissions', requireRole('principal'), (req, res) => {
    const { status } = req.query;
    let where = status ? 'WHERE cp.status=?' : '';
    const payouts = db.all(`
      SELECT cp.*, r.source_type, r.anonymous_label, a.name as agent_name,
        cr.name as rule_name, fi.invoice_no
      FROM commission_payouts cp
      LEFT JOIN referrals r ON r.id=cp.referral_id
      LEFT JOIN agents a ON a.id=r.agent_id
      LEFT JOIN commission_rules cr ON cr.id=cp.rule_id
      LEFT JOIN finance_invoices fi ON fi.id=cp.invoice_id
      ${where} ORDER BY cp.created_at DESC
    `, status ? [status] : []);
    res.json(payouts);
  });

  router.put('/commissions/:id/approve', requireRole('principal'), (req, res) => {
    const cp = db.get('SELECT status FROM commission_payouts WHERE id=?', [req.params.id]);
    if (!cp) return res.status(404).json({ error: '佣金记录不存在' });
    if (cp.status === 'void') return res.status(400).json({ error: '已作废的佣金记录无法审批' });
    if (cp.status !== 'pending') return res.status(400).json({ error: `当前状态 "${cp.status}" 不可审批` });
    db.run(`UPDATE commission_payouts SET status='approved',approved_by=?,approved_at=datetime('now'),updated_at=datetime('now') WHERE id=?`,
      [req.session.user.id, req.params.id]);
    audit(req, 'APPROVE', 'commission_payouts', req.params.id, null);
    res.json({ ok: true });
  });

  router.put('/commissions/:id/pay', requireRole('principal'), (req, res) => {
    const cp = db.get('SELECT status FROM commission_payouts WHERE id=?', [req.params.id]);
    if (!cp) return res.status(404).json({ error: '佣金记录不存在' });
    if (cp.status === 'void') return res.status(400).json({ error: '已作废的佣金记录无法标记已付' });
    if (cp.status !== 'approved') return res.status(400).json({ error: `请先审批再付款（当前状态: "${cp.status}"）` });
    db.run(`UPDATE commission_payouts SET status='paid',paid_at=datetime('now'),updated_at=datetime('now') WHERE id=?`, [req.params.id]);
    audit(req, 'PAY', 'commission_payouts', req.params.id, null);
    res.json({ ok: true });
  });

  router.put('/commissions/:id/void', requireRole('principal'), (req, res) => {
    // R8: 404 check
    const cp = db.get('SELECT id FROM commission_payouts WHERE id=?', [req.params.id]);
    if (!cp) return res.status(404).json({ error: '佣金记录不存在' });
    const { void_reason } = req.body;
    db.run(`UPDATE commission_payouts SET status='void',void_reason=?,updated_at=datetime('now') WHERE id=?`, [void_reason||null, req.params.id]);
    audit(req, 'VOID', 'commission_payouts', req.params.id, { void_reason });
    res.json({ ok: true });
  });

  return router;
};
