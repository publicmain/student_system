/**
 * routes/command-center.js — 申请指挥中心 API
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, aiCallAttempts, AI_CALL_MAX, AI_CALL_WINDOW_MS }) {
  const router = express.Router();

  let aiCommand;
  try { aiCommand = require('../ai-command'); } catch(e) { aiCommand = null; }

  // ── 角色数据隔离 helper ────────────────────────────────
  function _roleFilter(u) {
    const where = [], params = [];
    if (u.role === 'student') {
      where.push('a.student_id=?'); params.push(u.linked_id);
    } else if (u.role === 'parent') {
      where.push('a.student_id IN (SELECT student_id FROM student_parents WHERE parent_id=?)');
      params.push(u.linked_id);
    } else if (u.role === 'mentor' || u.role === 'counselor') {
      where.push('a.student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)');
      params.push(u.linked_id);
    } else if (u.role === 'intake_staff') {
      where.push('a.student_id IN (SELECT student_id FROM intake_cases WHERE case_owner_staff_id=? AND student_id IS NOT NULL)');
      params.push(u.linked_id);
    }
    // principal: no filter
    return { where, params };
  }

  // ═════════════════════════════════════════════════════════
  //  GET /command-center/stats — 汇总统计
  // ═════════════════════════════════════════════════════════
  router.get('/command-center/stats', requireRole('principal', 'counselor'), (req, res) => {
    const u = req.session.user;
    const { where, params } = _roleFilter(u);
    const wStr = where.length ? `AND ${where.join(' AND ')}` : '';

    const total = db.get(`SELECT COUNT(*) as cnt FROM applications a WHERE 1=1 ${wStr}`, params).cnt;
    const submitted = db.get(`SELECT COUNT(*) as cnt FROM applications a WHERE a.status IN ('applied','submitted') ${wStr}`, params).cnt;
    const offers = db.get(`SELECT COUNT(*) as cnt FROM applications a WHERE a.status IN ('offer','conditional_offer','unconditional_offer') OR a.offer_type IN ('Conditional','Unconditional') ${wStr}`, params).cnt;

    // 风险：截止日在 21 天内但状态仍为 pending
    const atRisk = db.get(`SELECT COUNT(*) as cnt FROM applications a
      WHERE a.status='pending' AND a.submit_deadline IS NOT NULL
      AND a.submit_deadline <= date('now', '+21 days') AND a.submit_deadline >= date('now')
      ${wStr}`, params).cnt;

    // 分组统计
    const byCycleYear = db.all(`SELECT a.cycle_year, COUNT(*) as cnt FROM applications a WHERE a.cycle_year IS NOT NULL ${wStr} GROUP BY a.cycle_year ORDER BY a.cycle_year DESC`, params);
    const byRoute = db.all(`SELECT a.route, COUNT(*) as cnt FROM applications a WHERE a.route IS NOT NULL ${wStr} GROUP BY a.route ORDER BY cnt DESC`, params);
    const byTier = db.all(`SELECT a.tier, COUNT(*) as cnt FROM applications a WHERE a.tier IS NOT NULL ${wStr} GROUP BY a.tier ORDER BY cnt DESC`, params);
    const byStatus = db.all(`SELECT a.status, COUNT(*) as cnt FROM applications a WHERE 1=1 ${wStr} GROUP BY a.status`, params);

    res.json({ total, submitted, offers, atRisk, byCycleYear, byRoute, byTier, byStatus });
  });

  // ═════════════════════════════════════════════════════════
  //  GET /command-center/risk-alerts — 纯SQL风险分析
  // ═════════════════════════════════════════════════════════
  router.get('/command-center/risk-alerts', requireRole('principal', 'counselor'), (req, res) => {
    const u = req.session.user;
    const { where, params } = _roleFilter(u);
    const wStr = where.length ? `AND ${where.join(' AND ')}` : '';

    // 1. 截止日 ≤ 21天 且 status=pending 的申请
    const deadlineRisks = db.all(`
      SELECT a.id, a.uni_name, a.department, a.submit_deadline, a.status, a.tier,
             s.name as student_name, s.id as student_id,
             CAST(julianday(a.submit_deadline) - julianday('now') AS INTEGER) as days_left
      FROM applications a
      JOIN students s ON s.id = a.student_id
      WHERE a.status = 'pending'
        AND a.submit_deadline IS NOT NULL
        AND a.submit_deadline >= date('now')
        AND a.submit_deadline <= date('now', '+21 days')
        ${wStr}
      ORDER BY a.submit_deadline ASC`, params);

    // 2. 已过截止日但未提交
    const overdueApps = db.all(`
      SELECT a.id, a.uni_name, a.department, a.submit_deadline, a.status, a.tier,
             s.name as student_name, s.id as student_id,
             CAST(julianday('now') - julianday(a.submit_deadline) AS INTEGER) as days_overdue
      FROM applications a
      JOIN students s ON s.id = a.student_id
      WHERE a.status = 'pending'
        AND a.submit_deadline IS NOT NULL
        AND a.submit_deadline < date('now')
        ${wStr}
      ORDER BY a.submit_deadline ASC`, params);

    // 3. 有申请但缺少关键材料（PS 未定稿）
    const missingPS = db.all(`
      SELECT a.id, a.uni_name, a.department, a.submit_deadline, a.tier,
             s.name as student_name, s.id as student_id,
             COALESCE(ps.status, '未开始') as ps_status
      FROM applications a
      JOIN students s ON s.id = a.student_id
      LEFT JOIN personal_statements ps ON ps.application_id = a.id
      WHERE a.status IN ('pending', 'applied')
        AND (ps.id IS NULL OR ps.status NOT IN ('定稿', '已提交'))
        ${wStr}
      ORDER BY a.submit_deadline ASC`, params);

    // 4. 逾期任务
    const overdueTasks = db.all(`
      SELECT mt.id, mt.title, mt.due_date, mt.status, mt.category,
             a.uni_name, s.name as student_name, s.id as student_id,
             CAST(julianday('now') - julianday(mt.due_date) AS INTEGER) as days_overdue
      FROM milestone_tasks mt
      JOIN applications a ON a.id = mt.application_id
      JOIN students s ON s.id = mt.student_id
      WHERE mt.status NOT IN ('done', 'cancelled')
        AND mt.due_date < date('now')
        ${wStr}
      ORDER BY mt.due_date ASC
      LIMIT 50`, params);

    const alerts = [];

    overdueApps.forEach(a => alerts.push({
      type: 'overdue_deadline', severity: 'critical',
      message: `${a.student_name} 的 ${a.uni_name} 申请已过截止日 ${a.days_overdue} 天`,
      application_id: a.id, student_id: a.student_id, student_name: a.student_name,
      uni_name: a.uni_name, deadline: a.submit_deadline
    }));

    deadlineRisks.forEach(a => alerts.push({
      type: 'approaching_deadline', severity: a.days_left <= 7 ? 'high' : 'medium',
      message: `${a.student_name} 的 ${a.uni_name} 申请距截止还剩 ${a.days_left} 天`,
      application_id: a.id, student_id: a.student_id, student_name: a.student_name,
      uni_name: a.uni_name, deadline: a.submit_deadline, days_left: a.days_left
    }));

    missingPS.forEach(a => alerts.push({
      type: 'missing_ps', severity: 'medium',
      message: `${a.student_name} 的 ${a.uni_name} 个人陈述状态：${a.ps_status}`,
      application_id: a.id, student_id: a.student_id, student_name: a.student_name,
      uni_name: a.uni_name
    }));

    overdueTasks.forEach(t => alerts.push({
      type: 'overdue_task', severity: t.days_overdue > 7 ? 'high' : 'medium',
      message: `${t.student_name} 的任务「${t.title}」已逾期 ${t.days_overdue} 天`,
      task_id: t.id, student_id: t.student_id, student_name: t.student_name,
      uni_name: t.uni_name
    }));

    // 按严重度排序
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9));

    res.json({ alerts, summary: { critical: alerts.filter(a => a.severity === 'critical').length, high: alerts.filter(a => a.severity === 'high').length, medium: alerts.filter(a => a.severity === 'medium').length } });
  });

  // ═════════════════════════════════════════════════════════
  //  AI 端点（需要 ai-command.js + OpenAI）
  // ═════════════════════════════════════════════════════════

  function _checkAiRateLimit(req, res) {
    if (!aiCallAttempts) return false;
    const uid = req.session.user.id;
    const now = Date.now();
    const attempts = aiCallAttempts.get(uid) || [];
    const recent = attempts.filter(t => now - t < (AI_CALL_WINDOW_MS || 60000));
    if (recent.length >= (AI_CALL_MAX || 10)) {
      res.status(429).json({ error: 'AI 调用频率超限，请稍后再试' });
      return true;
    }
    recent.push(now);
    aiCallAttempts.set(uid, recent);
    return false;
  }

  // POST /command-center/ai-risk-alerts — AI 增强风险分析
  router.post('/command-center/ai-risk-alerts', requireRole('principal', 'counselor'), async (req, res) => {
    if (!aiCommand) return res.status(501).json({ error: 'AI 模块未加载' });
    if (_checkAiRateLimit(req, res)) return;
    try {
      const result = await aiCommand.analyzeRisks(db, req.session.user);
      res.json(result);
    } catch(e) {
      console.error('[AI Command] Risk analysis error:', e.message);
      res.status(500).json({ error: 'AI 分析失败: ' + e.message });
    }
  });

  // POST /command-center/ai-next-action — AI 行动建议
  router.post('/command-center/ai-next-action', requireRole('principal', 'counselor'), async (req, res) => {
    if (!aiCommand) return res.status(501).json({ error: 'AI 模块未加载' });
    if (_checkAiRateLimit(req, res)) return;
    try {
      const result = await aiCommand.suggestNextActions(db, req.session.user);
      res.json(result);
    } catch(e) {
      console.error('[AI Command] Next action error:', e.message);
      res.status(500).json({ error: 'AI 分析失败: ' + e.message });
    }
  });

  // POST /command-center/ai-nlq — 自然语言查询
  router.post('/command-center/ai-nlq', requireRole('principal', 'counselor'), async (req, res) => {
    if (!aiCommand) return res.status(501).json({ error: 'AI 模块未加载' });
    if (_checkAiRateLimit(req, res)) return;
    const { query } = req.body;
    if (!query || typeof query !== 'string') return res.status(400).json({ error: '请输入查询内容' });
    try {
      const parsed = await aiCommand.parseNLQuery(query);
      // 使用解析出的过滤条件查询数据
      const u = req.session.user;
      const { where, params } = _roleFilter(u);
      if (parsed.filters.status) { where.push('a.status=?'); params.push(parsed.filters.status); }
      if (parsed.filters.cycle_year) { where.push('a.cycle_year=?'); params.push(parsed.filters.cycle_year); }
      if (parsed.filters.tier) { where.push('a.tier=?'); params.push(parsed.filters.tier); }
      if (parsed.filters.route) { where.push('a.route=?'); params.push(parsed.filters.route); }
      if (parsed.filters.search) { where.push('(a.uni_name LIKE ? OR a.department LIKE ?)'); params.push(`%${parsed.filters.search}%`, `%${parsed.filters.search}%`); }
      if (parsed.filters.uni_names && parsed.filters.uni_names.length) {
        where.push(`a.uni_name IN (${parsed.filters.uni_names.map(() => '?').join(',')})`);
        params.push(...parsed.filters.uni_names);
      }
      const wStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const results = db.all(`SELECT a.*, s.name as student_name FROM applications a
        LEFT JOIN students s ON s.id=a.student_id ${wStr} ORDER BY a.updated_at DESC`, params);
      res.json({ filters: parsed.filters, explanation: parsed.explanation, results });
    } catch(e) {
      console.error('[AI Command] NLQ error:', e.message);
      res.status(500).json({ error: 'AI 查询失败: ' + e.message });
    }
  });

  // POST /command-center/ai-list-score — 选校方案评分
  router.post('/command-center/ai-list-score', requireRole('principal', 'counselor'), async (req, res) => {
    if (!aiCommand) return res.status(501).json({ error: 'AI 模块未加载' });
    if (_checkAiRateLimit(req, res)) return;
    const { student_id } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id 必填' });
    try {
      const result = await aiCommand.evaluateListScore(db, student_id);
      res.json(result);
    } catch(e) {
      console.error('[AI Command] List score error:', e.message);
      res.status(500).json({ error: 'AI 评分失败: ' + e.message });
    }
  });

  return router;
};
