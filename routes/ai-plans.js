/**
 * routes/ai-plans.js — AI 规划（AI Student Planning）
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, aiPlanner, aiEval, aiCallAttempts, AI_CALL_MAX, AI_CALL_WINDOW_MS }) {
  const router = express.Router();

  // ── AI 接口限流工具 ───────────────────────────────────
  function checkAiRateLimit(req, res) {
    const userId = req.session.user.id;
    const now = Date.now();
    const ar = aiCallAttempts.get(userId) || { count: 0, resetAt: now + AI_CALL_WINDOW_MS };
    if (now > ar.resetAt) { ar.count = 0; ar.resetAt = now + AI_CALL_WINDOW_MS; }
    if (ar.count >= AI_CALL_MAX) {
      res.status(429).json({ error: `AI 调用次数已达上限（每小时 ${AI_CALL_MAX} 次），请稍后重试` });
      return false;
    }
    ar.count++;
    aiCallAttempts.set(userId, ar);
    return true;
  }

  // POST /api/students/:id/ai-plan/generate  — 生成 AI 规划草稿
  router.post('/students/:id/ai-plan/generate', requireRole('principal','counselor'), async (req, res) => {
    if (!aiPlanner) return res.status(503).json({ error: 'AI 规划模块未加载，请检查服务器配置' });
    if (!checkAiRateLimit(req, res)) return;
    const student = db.get('SELECT * FROM students WHERE id=?', [req.params.id]);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const { route_focus, constraints } = req.body;
    try {
      const result = await aiPlanner.generatePlan(db, req.params.id, req.session.user.id, { route_focus, constraints });
      audit(req, 'GENERATE', 'ai_student_plans', result.plan_id, { student: student.name, model: result.plan?.meta?.schema_version });
      res.json({ plan_id: result.plan_id, status: result.status });
    } catch (e) {
      console.error('[ai-plans]', e);
      const msg = e.message || '服务器错误，请重试';
      const isClientError = /未配置|缺少|不足|未包含|同意/.test(msg);
      res.status(isClientError ? 400 : 500).json({ error: msg });
    }
  });

  // GET /api/students/:id/ai-plan  — 获取最新规划（根据角色过滤内容）
  router.get('/students/:id/ai-plan', requireAuth, (req, res) => {
    const u = req.session.user;
    const sid = req.params.id;
    if (['agent', 'student_admin', 'intake_staff'].includes(u.role)) return res.status(403).json({ error: '权限不足' });
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    if (u.role === 'mentor' || u.role === 'counselor') {
      const ma = db.get('SELECT 1 FROM mentor_assignments WHERE student_id=? AND staff_id=?', [sid, u.linked_id]);
      if (!ma) return res.status(403).json({ error: '无权访问' });
    }
    const role = u.role;
    const restrictToPublished = (role === 'parent' || role === 'student');
    const plan = restrictToPublished
      ? db.get(`SELECT * FROM ai_student_plans WHERE student_id=? AND status=? ORDER BY created_at DESC LIMIT 1`, [sid, 'published'])
      : db.get(`SELECT * FROM ai_student_plans WHERE student_id=? ORDER BY created_at DESC LIMIT 1`, [sid]);
    if (!plan) return res.json(null);
    if (restrictToPublished) {
      const p = JSON.parse(plan.plan_json || '{}');
      return res.json({ id: plan.id, status: plan.status, published_at: plan.published_at, parent_view: p.parent_view, risk: p.risk });
    }
    res.json(plan);
  });

  // GET /api/students/:id/ai-plans  — 所有规划版本列表
  router.get('/students/:id/ai-plans', requireRole('principal','counselor'), (req, res) => {
    const plans = db.all(
      `SELECT id, status, model, prompt_version, created_by, approved_by, approved_at, published_at, created_at, updated_at
       FROM ai_student_plans WHERE student_id=? ORDER BY created_at DESC`, [req.params.id]
    );
    res.json(plans);
  });

  // GET /api/ai-plans/:id  — 获取单条规划完整内容
  router.get('/ai-plans/:id', requireRole('principal','counselor'), (req, res) => {
    const plan = db.get('SELECT * FROM ai_student_plans WHERE id=?', [req.params.id]);
    if (!plan) return res.status(404).json({ error: '规划不存在' });
    res.json(plan);
  });

  // PUT /api/ai-plans/:id/approve  — 批准规划
  router.put('/ai-plans/:id/approve', requireRole('principal','counselor'), (req, res) => {
    const plan = db.get('SELECT * FROM ai_student_plans WHERE id=?', [req.params.id]);
    if (!plan) return res.status(404).json({ error: '规划不存在' });
    if (plan.status !== 'draft') return res.status(400).json({ error: '只能批准草稿状态的规划' });
    const now = new Date().toISOString();
    db.run(`UPDATE ai_student_plans SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?`,
      [req.session.user.id, now, now, req.params.id]);
    audit(req, 'APPROVE', 'ai_student_plans', req.params.id, {});
    res.json({ ok: true, status: 'approved' });
  });

  // POST /api/ai-plans/:id/apply  — 将 auto_fill 写入系统表
  router.post('/ai-plans/:id/apply', requireRole('principal','counselor'), (req, res) => {
    if (!aiPlanner) return res.status(503).json({ error: 'AI 规划模块未加载，请检查服务器配置' });
    const plan = db.get('SELECT * FROM ai_student_plans WHERE id=?', [req.params.id]);
    if (!plan) return res.status(404).json({ error: '规划不存在' });
    if (!['approved','published'].includes(plan.status)) return res.status(400).json({ error: '请先批准规划再应用' });
    const planData = JSON.parse(plan.plan_json || '{}');
    const selected = req.body.selected_sections;
    const autoFill = {};
    const ALL = ['targets','template_applications','custom_tasks','draft_applications'];
    for (const k of ALL) {
      autoFill[k] = (!selected || selected.includes(k)) ? (planData.auto_fill?.[k] || []) : [];
    }
    try {
      const counts = aiPlanner.applyPlanActions(db, req.params.id, plan.student_id, req.session.user.id, autoFill);
      audit(req, 'APPLY', 'ai_student_plans', req.params.id, { counts });
      res.json({ ok: true, counts });
    } catch (e) {
      console.error('[ai-plans]', e);
      res.status(500).json({ error: '服务器错误，请重试' });
    }
  });

  // PUT /api/ai-plans/:id/publish  — 发布给家长/学生
  router.put('/ai-plans/:id/publish', requireRole('principal','counselor'), (req, res) => {
    const plan = db.get('SELECT * FROM ai_student_plans WHERE id=?', [req.params.id]);
    if (!plan) return res.status(404).json({ error: '规划不存在' });
    if (plan.status === 'published') return res.status(400).json({ error: '已发布' });
    const now = new Date().toISOString();
    db.run(`UPDATE ai_student_plans SET status='published', published_at=?, updated_at=? WHERE id=?`, [now, now, req.params.id]);
    audit(req, 'PUBLISH', 'ai_student_plans', req.params.id, {});
    res.json({ ok: true, status: 'published', published_at: now });
  });

  // PUT /api/ai-plans/:id/archive  — 存档
  router.put('/ai-plans/:id/archive', requireRole('principal','counselor'), (req, res) => {
    const plan = db.get('SELECT * FROM ai_student_plans WHERE id=?', [req.params.id]);
    if (!plan) return res.status(404).json({ error: '规划不存在' });
    const now = new Date().toISOString();
    db.run(`UPDATE ai_student_plans SET status='archived', updated_at=? WHERE id=?`, [now, req.params.id]);
    audit(req, 'ARCHIVE', 'ai_student_plans', req.params.id, {});
    res.json({ ok: true, status: 'archived' });
  });

  return router;
};
