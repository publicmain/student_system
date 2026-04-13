/**
 * routes/command-center.js — 申请指挥中心 API
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, aiCallAttempts, AI_CALL_MAX, AI_CALL_WINDOW_MS, xlsx }) {
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
  router.get('/command-center/stats', requireRole('principal', 'counselor', 'mentor'), (req, res) => {
    const u = req.session.user;
    const { where, params } = _roleFilter(u);
    const wStr = where.length ? `AND ${where.join(' AND ')}` : '';

    const notDel = "AND a.status != 'deleted'";
    const offerStatuses = "('offer','conditional_offer','conditional','unconditional','unconditional_offer','firm','enrolled')";
    const total = db.get(`SELECT COUNT(*) as cnt FROM applications a JOIN students s ON s.id=a.student_id WHERE 1=1 ${notDel} ${wStr}`, params).cnt;
    const submitted = db.get(`SELECT COUNT(*) as cnt FROM applications a JOIN students s ON s.id=a.student_id WHERE a.status IN ('applied','submitted') ${wStr}`, params).cnt;
    const offers = db.get(`SELECT COUNT(*) as cnt FROM applications a JOIN students s ON s.id=a.student_id WHERE a.status IN ${offerStatuses} ${notDel} ${wStr}`, params).cnt;

    // 风险：截止日在 21 天内但状态仍为 pending
    const atRisk = db.get(`SELECT COUNT(*) as cnt FROM applications a
      WHERE a.status='pending' AND a.submit_deadline IS NOT NULL
      AND a.submit_deadline <= date('now', '+21 days') AND a.submit_deadline >= date('now')
      ${wStr}`, params).cnt;

    // 7天趋势：统计最近7天新增的数量
    const weekAgo = "AND a.created_at >= datetime('now', '-7 days')";
    const totalNew = db.get(`SELECT COUNT(*) as cnt FROM applications a WHERE 1=1 ${notDel} ${weekAgo} ${wStr}`, params).cnt;
    const submittedNew = db.get(`SELECT COUNT(*) as cnt FROM applications a WHERE a.status IN ('applied','submitted') ${weekAgo} ${wStr}`, params).cnt;
    const offersNew = db.get(`SELECT COUNT(*) as cnt FROM applications a WHERE (a.status IN ('offer','conditional_offer','unconditional_offer') OR a.offer_type IN ('Conditional','Unconditional')) ${notDel} ${weekAgo} ${wStr}`, params).cnt;

    // 分组统计
    const byCycleYear = db.all(`SELECT a.cycle_year, COUNT(*) as cnt FROM applications a WHERE a.cycle_year IS NOT NULL ${notDel} ${wStr} GROUP BY a.cycle_year ORDER BY a.cycle_year DESC`, params);
    const byRoute = db.all(`SELECT a.route, COUNT(*) as cnt FROM applications a WHERE a.route IS NOT NULL ${notDel} ${wStr} GROUP BY a.route ORDER BY cnt DESC`, params);
    const byTier = db.all(`SELECT a.tier, COUNT(*) as cnt FROM applications a WHERE a.tier IS NOT NULL ${notDel} ${wStr} GROUP BY a.tier ORDER BY cnt DESC`, params);
    const byStatus = db.all(`SELECT a.status, COUNT(*) as cnt FROM applications a WHERE 1=1 ${notDel} ${wStr} GROUP BY a.status`, params);

    res.json({ total, submitted, offers, atRisk, totalNew, submittedNew, offersNew, byCycleYear, byRoute, byTier, byStatus });
  });

  // ═════════════════════════════════════════════════════════
  //  GET /command-center/risk-alerts — 纯SQL风险分析
  // ═════════════════════════════════════════════════════════
  router.get('/command-center/risk-alerts', requireRole('principal', 'counselor', 'mentor'), (req, res) => {
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
  //  GET /command-center/app-health — 每个申请的健康度数据
  // ═════════════════════════════════════════════════════════
  router.get('/command-center/app-health', requireRole('principal', 'counselor', 'mentor'), (req, res) => {
    const u = req.session.user;
    const { where, params } = _roleFilter(u);
    const wStr = where.length ? `AND ${where.join(' AND ')}` : '';

    // 获取所有活跃申请
    const apps = db.all(`SELECT a.id, a.student_id, a.status FROM applications a
      WHERE a.status != 'deleted' ${wStr}`, params);
    if (!apps.length) return res.json({ health: {} });

    const appIds = apps.map(a => a.id);
    const studentIds = [...new Set(apps.map(a => a.student_id))];

    // 批量查询 PS 状态
    const psRows = db.all(`SELECT application_id, status FROM personal_statements
      WHERE application_id IN (${appIds.map(() => '?').join(',')})`, appIds);
    const psMap = new Map();
    psRows.forEach(r => psMap.set(r.application_id, r.status));

    // 批量查询材料完成率（按 application_id 分组）
    const matRows = db.all(`SELECT application_id, status FROM material_items
      WHERE application_id IN (${appIds.map(() => '?').join(',')})`, appIds);
    const matByApp = new Map();
    matRows.forEach(r => {
      if (!matByApp.has(r.application_id)) matByApp.set(r.application_id, []);
      matByApp.get(r.application_id).push(r.status);
    });

    // 批量查询任务完成率（按 application_id 分组）
    const taskRows = db.all(`SELECT application_id, status FROM milestone_tasks
      WHERE application_id IN (${appIds.map(() => '?').join(',')})`, appIds);
    const taskByApp = new Map();
    taskRows.forEach(r => {
      if (!taskByApp.has(r.application_id)) taskByApp.set(r.application_id, []);
      taskByApp.get(r.application_id).push(r.status);
    });

    // 批量查询录取评估（最新的 prob_mid）
    const evalRows = db.all(`SELECT ae.student_id, a.id as app_id, ae.prob_mid, ae.confidence, ae.score_total
      FROM admission_evaluations ae
      JOIN applications a ON a.student_id = ae.student_id
      WHERE a.id IN (${appIds.map(() => '?').join(',')})
      ORDER BY ae.eval_date DESC`, appIds);
    const evalMap = new Map();
    evalRows.forEach(r => {
      if (!evalMap.has(r.app_id)) evalMap.set(r.app_id, r);
    });

    // 批量查询文书状态（essay 按 application_id）
    const essayRows = db.all(`SELECT e.application_id, e.status, e.current_version, e.review_deadline,
      (SELECT MAX(ev.created_at) FROM essay_versions ev WHERE ev.essay_id = e.id) as last_version_at
      FROM essays e
      WHERE e.application_id IN (${appIds.map(() => '?').join(',')})`, appIds);
    const essayByApp = new Map();
    essayRows.forEach(r => {
      if (!essayByApp.has(r.application_id)) essayByApp.set(r.application_id, []);
      essayByApp.get(r.application_id).push(r);
    });

    // 计算每个申请的健康度
    const PS_DONE = ['定稿', '已提交'];
    const PS_PROGRESS = ['一审中', '二审中', '需修改'];
    const MAT_DONE = ['已审核', '已提交'];
    const TASK_DONE = ['done'];

    const health = {};
    for (const app of apps) {
      // PS 分数 (0-25)
      const psStatus = psMap.get(app.id);
      let psScore = 0;
      if (PS_DONE.includes(psStatus)) psScore = 25;
      else if (psStatus === '草稿') psScore = 10;
      else if (PS_PROGRESS.includes(psStatus)) psScore = 18;

      // 材料完成率 (0-25)
      const mats = matByApp.get(app.id) || [];
      const matDone = mats.filter(s => MAT_DONE.includes(s)).length;
      const matScore = mats.length > 0 ? Math.round((matDone / mats.length) * 25) : 0;

      // 任务完成率 (0-25)
      const tasks = taskByApp.get(app.id) || [];
      const taskDone = tasks.filter(s => TASK_DONE.includes(s)).length;
      const taskScore = tasks.length > 0 ? Math.round((taskDone / tasks.length) * 25) : 0;

      // 评估分数 (0-25)
      const evalData = evalMap.get(app.id);
      // prob_mid is stored as integer 0-99 (e.g. 28 means 28%), normalize to 0-1 for scoring
      const evalScore = evalData ? Math.round(((evalData.prob_mid || 0) / 100) * 25) : 0;

      // 文书风险
      const essays = essayByApp.get(app.id) || [];
      let essayRisk = 'none'; // none, yellow, orange, red
      const now = Date.now();
      for (const e of essays) {
        if (e.status === 'collecting_material' || e.current_version === 0) {
          // 草稿阶段 — 如果创建超30天无版本则红
          essayRisk = 'red'; break;
        }
        if (e.last_version_at) {
          const daysSince = (now - new Date(e.last_version_at).getTime()) / 86400000;
          if (daysSince > 30 && e.status !== 'finalized') { essayRisk = 'red'; break; }
          if (daysSince > 14 && e.status !== 'finalized') { essayRisk = essayRisk === 'red' ? 'red' : 'orange'; }
        }
        if (e.review_deadline && new Date(e.review_deadline) < new Date()) {
          essayRisk = essayRisk === 'red' ? 'red' : 'orange';
        }
      }

      const total = psScore + matScore + taskScore + evalScore;
      health[app.id] = {
        total,
        ps: { score: psScore, status: psStatus || '未开始' },
        materials: { score: matScore, done: matDone, total: mats.length },
        tasks: { score: taskScore, done: taskDone, total: tasks.length },
        eval: { score: evalScore, prob_mid: evalData?.prob_mid || null, confidence: evalData?.confidence || null },
        essayRisk,
      };
    }

    res.json({ health });
  });

  // ═════════════════════════════════════════════════════════
  //  GET /command-center/lifecycle — 全生命周期管线数据
  // ═════════════════════════════════════════════════════════
  router.get('/command-center/lifecycle', requireRole('principal', 'counselor', 'mentor'), (req, res) => {
    const u = req.session.user;
    const { where, params } = _roleFilter(u);
    const wStr = where.length ? `AND ${where.join(' AND ')}` : '';

    // 只查 accepted/firm/insurance/enrolled 状态的申请（进入后续流程的）
    const apps = db.all(`
      SELECT a.id, a.student_id, a.uni_name, a.department, a.status, a.route, a.cycle_year,
             s.name as student_name
      FROM applications a
      JOIN students s ON s.id = a.student_id
      WHERE a.status IN ('accepted', 'firm', 'insurance', 'enrolled')
        ${wStr}
      ORDER BY a.updated_at DESC`, params);

    if (!apps.length) return res.json({ pipelines: [] });

    const studentIds = [...new Set(apps.map(a => a.student_id))];

    // 批量查询 intake_cases（中间表，visa/arrival 都通过 case_id 关联）
    const intakeRows = db.all(`SELECT id, student_id, status as intake_status, program_name
      FROM intake_cases WHERE student_id IN (${studentIds.map(() => '?').join(',')})
      ORDER BY created_at DESC`, studentIds);
    const intakeMap = new Map();
    const caseIds = [];
    intakeRows.forEach(r => {
      if (!intakeMap.has(r.student_id)) intakeMap.set(r.student_id, r);
      caseIds.push(r.id);
    });

    // 批量查询 visa_cases（通过 case_id 关联 intake_cases）
    const visaMap = new Map();
    if (caseIds.length) {
      const visaRows = db.all(`SELECT case_id, status, submission_date, approved_date
        FROM visa_cases WHERE case_id IN (${caseIds.map(() => '?').join(',')})
        ORDER BY created_at DESC`, caseIds);
      // Map case_id → student_id via intakeRows
      const caseToStudent = new Map();
      intakeRows.forEach(r => caseToStudent.set(r.id, r.student_id));
      visaRows.forEach(r => {
        const sid = caseToStudent.get(r.case_id);
        if (sid && !visaMap.has(sid)) visaMap.set(sid, r);
      });
    }

    // 批量查询 arrival_records（通过 case_id 关联 intake_cases）
    const arrMap = new Map();
    if (caseIds.length) {
      const arrRows = db.all(`SELECT case_id, actual_arrival, accommodation, orientation_date, student_pass_issued
        FROM arrival_records WHERE case_id IN (${caseIds.map(() => '?').join(',')})
        ORDER BY created_at DESC`, caseIds);
      const caseToStudent = new Map();
      intakeRows.forEach(r => caseToStudent.set(r.id, r.student_id));
      arrRows.forEach(r => {
        const sid = caseToStudent.get(r.case_id);
        if (sid && !arrMap.has(sid)) arrMap.set(sid, r);
      });
    }

    const pipelines = apps.map(app => {
      const visa = visaMap.get(app.student_id);
      const arrival = arrMap.get(app.student_id);
      const intake = intakeMap.get(app.student_id);

      // 计算管线阶段 (0-5)
      const stages = [
        { id: 'offer', label: '录取', done: true },
        { id: 'confirm', label: '确认', done: ['firm', 'insurance', 'enrolled'].includes(app.status) },
        { id: 'visa', label: '签证', done: visa?.status === 'approved', active: !!visa && visa.status !== 'approved' },
        { id: 'arrival', label: '到达', done: !!arrival?.actual_arrival, active: !!arrival && !arrival.actual_arrival },
        { id: 'enrolled', label: '入学', done: app.status === 'enrolled' || intake?.intake_status === 'completed' },
      ];

      return {
        app_id: app.id,
        student_id: app.student_id,
        student_name: app.student_name,
        uni_name: app.uni_name,
        department: app.department,
        route: app.route,
        status: app.status,
        stages,
        visa: visa ? { status: visa.status, submission: visa.submission_date, approved: visa.approved_date } : null,
        arrival: arrival ? { date: arrival.actual_arrival, accommodation: arrival.accommodation } : null,
      };
    });

    res.json({ pipelines });
  });

  // ═════════════════════════════════════════════════════════
  //  GET /command-center/my-workspace — 个人工作台
  // ═════════════════════════════════════════════════════════
  router.get('/command-center/my-workspace', requireRole('principal', 'counselor', 'mentor'), (req, res) => {
    const u = req.session.user;
    const staffId = u.linked_id;

    // 今日到期任务（分配给我的）
    const todayTasks = db.all(`
      SELECT mt.id, mt.title, mt.due_date, mt.status, mt.category, mt.priority,
             s.name as student_name, a.uni_name
      FROM milestone_tasks mt
      LEFT JOIN students s ON s.id = mt.student_id
      LEFT JOIN applications a ON a.id = mt.application_id
      WHERE mt.assigned_to = ?
        AND mt.status NOT IN ('done', 'cancelled')
        AND mt.due_date <= date('now', '+1 day')
      ORDER BY mt.due_date ASC, mt.priority DESC
      LIMIT 20`, [staffId]);

    // 待审文书（分配给我审阅的）
    const pendingReviews = db.all(`
      SELECT e.id, e.title, e.essay_type, e.status, e.review_deadline, e.current_version,
             s.name as student_name, a.uni_name
      FROM essays e
      LEFT JOIN students s ON s.id = e.student_id
      LEFT JOIN applications a ON a.id = e.application_id
      WHERE e.assigned_reviewer_id = ?
        AND e.status IN ('submitted_for_review', 'revision_submitted', 'collecting_material', 'drafting', 'reviewing')
      ORDER BY e.review_deadline ASC
      LIMIT 20`, [staffId]);

    // 待审 PS
    const pendingPS = db.all(`
      SELECT ps.id, ps.status, ps.student_id, ps.application_id, ps.word_count,
             s.name as student_name, a.uni_name
      FROM personal_statements ps
      LEFT JOIN students s ON s.id = ps.student_id
      LEFT JOIN applications a ON a.id = ps.application_id
      WHERE ps.reviewer_id = ?
        AND ps.status IN ('一审中', '二审中')
      ORDER BY ps.updated_at DESC
      LIMIT 20`, [staffId]);

    // 高风险申请（我负责的学生中截止日 ≤7天的）
    const riskApps = db.all(`
      SELECT a.id, a.uni_name, a.submit_deadline, a.status,
             s.name as student_name,
             CAST(julianday(a.submit_deadline) - julianday('now') AS INTEGER) as days_left
      FROM applications a
      JOIN students s ON s.id = a.student_id
      WHERE a.student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id = ?)
        AND a.status = 'pending'
        AND a.submit_deadline IS NOT NULL
        AND a.submit_deadline <= date('now', '+7 days')
      ORDER BY a.submit_deadline ASC
      LIMIT 20`, [staffId]);

    // 待回复反馈（feedback 表：responded_by 为空表示未回复）
    const pendingFeedback = db.all(`
      SELECT f.id, f.content, f.feedback_type, f.status, f.created_at, f.rating,
             s.name as student_name
      FROM feedback f
      LEFT JOIN students s ON s.id = f.student_id
      WHERE f.status = 'pending'
        AND f.responded_by IS NULL
        AND f.student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id = ?)
      ORDER BY f.created_at DESC
      LIMIT 10`, [staffId]);

    res.json({
      todayTasks,
      pendingReviews: [...pendingReviews, ...pendingPS.map(ps => ({
        id: ps.id, title: `PS - ${ps.student_name}`, essay_type: 'PS',
        status: ps.status, student_name: ps.student_name, uni_name: ps.uni_name,
        current_version: null, review_deadline: null,
      }))],
      riskApps,
      pendingFeedback,
      summary: {
        tasks: todayTasks.length,
        reviews: pendingReviews.length + pendingPS.length,
        risks: riskApps.length,
        feedback: pendingFeedback.length,
      },
    });
  });

  // ═════════════════════════════════════════════════════════
  //  AI 端点（需要 ai-command.js + OpenAI）
  // ═════════════════════════════════════════════════════════

  function _checkAiRateLimit(req, res) {
    if (!aiCallAttempts) return false;
    const uid = req.session.user.id;
    const now = Date.now();
    const windowMs = AI_CALL_WINDOW_MS || 60000;
    const attempts = aiCallAttempts.get(uid) || [];
    const recent = attempts.filter(t => now - t < windowMs);
    if (recent.length >= (AI_CALL_MAX || 10)) {
      res.status(429).json({ error: 'AI 调用频率超限，请稍后再试' });
      aiCallAttempts.set(uid, recent); // 更新为已清理的数组
      return true;
    }
    recent.push(now);
    aiCallAttempts.set(uid, recent);
    // 定期清理：当 Map 条目过多时移除过期用户
    if (aiCallAttempts.size > 100) {
      for (const [key, arr] of aiCallAttempts) {
        const valid = arr.filter(t => now - t < windowMs);
        if (valid.length === 0) aiCallAttempts.delete(key);
        else aiCallAttempts.set(key, valid);
      }
    }
    return false;
  }

  // POST /command-center/ai-risk-alerts — AI 增强风险分析
  router.post('/command-center/ai-risk-alerts', requireRole('principal', 'counselor', 'mentor'), async (req, res) => {
    if (!aiCommand) return res.status(501).json({ error: 'AI 模块未加载' });
    if (_checkAiRateLimit(req, res)) return;
    try {
      const result = await aiCommand.analyzeRisks(db, req.session.user);
      res.json(result);
    } catch(e) {
      console.error('[AI Command] Risk analysis error:', e.message);
      const msg = e.message?.includes('OPENAI_API_KEY') ? e.message : 'AI 分析失败，请稍后重试';
      res.status(500).json({ error: msg });
    }
  });

  // POST /command-center/ai-next-action — AI 行动建议
  router.post('/command-center/ai-next-action', requireRole('principal', 'counselor', 'mentor'), async (req, res) => {
    if (!aiCommand) return res.status(501).json({ error: 'AI 模块未加载' });
    if (_checkAiRateLimit(req, res)) return;
    try {
      const result = await aiCommand.suggestNextActions(db, req.session.user);
      res.json(result);
    } catch(e) {
      console.error('[AI Command] Next action error:', e.message);
      const msg = e.message?.includes('OPENAI_API_KEY') ? e.message : 'AI 分析失败，请稍后重试';
      res.status(500).json({ error: msg });
    }
  });

  // POST /command-center/ai-nlq — 自然语言查询
  router.post('/command-center/ai-nlq', requireRole('principal', 'counselor', 'mentor'), async (req, res) => {
    if (!aiCommand) return res.status(501).json({ error: 'AI 模块未加载' });
    if (_checkAiRateLimit(req, res)) return;
    const { query } = req.body;
    if (!query || typeof query !== 'string') return res.status(400).json({ error: '请输入查询内容' });
    try {
      const parsed = await aiCommand.parseNLQuery(query);
      // 使用解析出的过滤条件查询数据
      const u = req.session.user;
      const { where, params } = _roleFilter(u);

      // 安全：status 白名单校验（防止 AI 返回 "deleted" 等绕过过滤）
      const SAFE_STATUSES = ['pending','applied','submitted','offer','conditional_offer','unconditional_offer','firm','insurance','enrolled','accepted','declined','rejected','withdrawn','waitlisted','draft'];
      if (parsed.filters.status) {
        if (SAFE_STATUSES.includes(parsed.filters.status)) {
          where.push('a.status=?'); params.push(parsed.filters.status);
        }
      }
      if (parsed.filters.cycle_year) { where.push('a.cycle_year=?'); params.push(parsed.filters.cycle_year); }
      if (parsed.filters.tier) { where.push('a.tier=?'); params.push(parsed.filters.tier); }
      if (parsed.filters.route) { where.push('a.route=?'); params.push(parsed.filters.route); }
      if (parsed.filters.search) { where.push('(a.uni_name LIKE ? OR a.department LIKE ?)'); params.push(`%${parsed.filters.search}%`, `%${parsed.filters.search}%`); }
      // 安全：限制 uni_names 最多 50 个（防止 AI 返回过多条目拖垮查询）
      if (parsed.filters.uni_names && parsed.filters.uni_names.length) {
        const safeNames = parsed.filters.uni_names.slice(0, 50);
        where.push(`a.uni_name IN (${safeNames.map(() => '?').join(',')})`);
        params.push(...safeNames);
      }
      // 排除已删除的数据
      where.push("a.status != 'deleted'");
      const wStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const results = db.all(`SELECT a.*, s.name as student_name FROM applications a
        LEFT JOIN students s ON s.id=a.student_id ${wStr} ORDER BY a.updated_at DESC LIMIT 200`, params);
      res.json({ filters: parsed.filters, explanation: parsed.explanation, results });
    } catch(e) {
      console.error('[AI Command] NLQ error:', e.message);
      const msg = e.message?.includes('OPENAI_API_KEY') ? e.message : 'AI 查询失败，请稍后重试';
      res.status(500).json({ error: msg });
    }
  });

  // POST /command-center/ai-list-score — 选校方案评分
  router.post('/command-center/ai-list-score', requireRole('principal', 'counselor', 'mentor'), async (req, res) => {
    if (!aiCommand) return res.status(501).json({ error: 'AI 模块未加载' });
    if (_checkAiRateLimit(req, res)) return;
    const { student_id } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id 必填' });
    try {
      const result = await aiCommand.evaluateListScore(db, student_id);
      res.json(result);
    } catch(e) {
      console.error('[AI Command] List score error:', e.message);
      const msg = e.message?.includes('OPENAI_API_KEY') ? e.message : 'AI 评分失败，请稍后重试';
      res.status(500).json({ error: msg });
    }
  });

  // ═════════════════════════════════════════════════════════
  //  POST /command-center/notify-risks — 将风险预警推送为通知
  // ═════════════════════════════════════════════════════════
  router.post('/command-center/notify-risks', requireRole('principal', 'counselor'), (req, res) => {
    const u = req.session.user;
    const { where, params } = _roleFilter(u);
    const wStr = where.length ? `AND ${where.join(' AND ')}` : '';

    // 查找 critical + high 风险（截止日临近 ≤7天 或已逾期）
    const criticalApps = db.all(`
      SELECT a.id, a.uni_name, a.submit_deadline, a.status,
             s.name as student_name, s.id as student_id,
             CAST(julianday(a.submit_deadline) - julianday('now') AS INTEGER) as days_left
      FROM applications a
      JOIN students s ON s.id = a.student_id
      WHERE a.status = 'pending'
        AND a.submit_deadline IS NOT NULL
        AND a.submit_deadline <= date('now', '+7 days')
        ${wStr}
      ORDER BY a.submit_deadline ASC`, params);

    let created = 0;
    const now = new Date().toISOString();
    for (const app of criticalApps) {
      const isOverdue = app.days_left < 0;
      const type = isOverdue ? 'overdue' : 'deadline_reminder';
      const title = isOverdue
        ? `${app.student_name} · ${app.uni_name} 已逾期 ${Math.abs(app.days_left)} 天`
        : `${app.student_name} · ${app.uni_name} 距截止还剩 ${app.days_left} 天`;

      // 避免重复：检查近24h内是否已有同申请的风险通知
      const existing = db.get(
        `SELECT id FROM notification_logs WHERE student_id=? AND type=? AND message LIKE ? AND created_at > datetime('now', '-1 day')`,
        [app.student_id, type, `%${app.uni_name}%`]
      );
      if (existing) continue;

      db.run(`INSERT INTO notification_logs (id, student_id, type, title, message, target_role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), app.student_id, type, title,
         `申请「${app.uni_name}」截止日：${app.submit_deadline}，当前状态：${app.status}`,
         'counselor', now]);
      created++;
    }

    res.json({ created, total_risks: criticalApps.length });
  });

  // ── 批量更新状态 ────────────────────────────────────
  router.put('/command-center/batch-status', requireAuth, requireRole('principal','counselor'), (req, res) => {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || !ids.length || !status) {
      return res.status(400).json({ error: '需要 ids 数组和 status' });
    }
    const validStatuses = ['pending','draft','applied','submitted','offer','conditional_offer',
      'unconditional_offer','offer_received','accepted','firm','insurance','enrolled',
      'declined','rejected','withdrawn','waitlisted'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '无效状态: ' + status });
    }

    const u = req.session.user;
    const { where, params: roleParams } = _roleFilter(u);

    const placeholders = ids.map(() => '?').join(',');
    const wStr = where.length ? `AND ${where.join(' AND ')}` : '';
    // Verify all ids belong to user's scope
    const accessible = db.all(
      `SELECT a.id FROM applications a WHERE a.id IN (${placeholders}) ${wStr}`,
      [...ids, ...roleParams]
    );
    const accessibleIds = accessible.map(r => r.id);

    if (accessibleIds.length === 0) {
      return res.status(403).json({ error: '无权限操作这些申请' });
    }

    const updatePlaceholders = accessibleIds.map(() => '?').join(',');
    db.run(
      `UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id IN (${updatePlaceholders})`,
      [status, ...accessibleIds]
    );

    res.json({ updated: accessibleIds.length, total: ids.length });
  });

  // ── 导出 Excel ──────────────────────────────────────
  router.get('/command-center/export-excel', requireAuth, requireRole('principal','counselor'), (req, res) => {
    try {
      const u = req.session.user;
      const { where, params } = _roleFilter(u);
      where.push("a.status != 'deleted'");
      const wClause = 'WHERE ' + where.join(' AND ');
      const rows = db.all(`
        SELECT a.id, s.name AS student_name, a.uni_name, a.department,
               a.tier, a.route, a.status, a.submit_deadline, a.cycle_year
        FROM applications a
        LEFT JOIN students s ON s.id = a.student_id
        ${wClause}
        ORDER BY a.submit_deadline ASC
      `, params);

      const statusLabels = {
        pending:'准备中', draft:'草稿', applied:'已提交', submitted:'已提交',
        offer:'Offer', conditional_offer:'有条件录取', unconditional_offer:'无条件录取',
        offer_received:'收到录取', accepted:'已接受', firm:'Firm', insurance:'Insurance',
        enrolled:'已入学', declined:'已拒绝', rejected:'被拒绝', withdrawn:'已撤回', waitlisted:'等候名单',
      };
      const tierLabels = { reach:'冲刺', target:'匹配', safety:'保底', '冲刺':'冲刺', '意向':'意向', '保底':'保底' };

      const header = ['学生', '院校', '专业', '梯度', '路线', '状态', '截止日', '周期'];
      const data = rows.map(r => [
        r.student_name || '',
        r.uni_name || '',
        r.department || '',
        tierLabels[r.tier] || r.tier || '',
        r.route || '',
        statusLabels[r.status] || r.status || '',
        r.submit_deadline ? r.submit_deadline.slice(0, 10) : '',
        r.cycle_year || '',
      ]);

      const ws = xlsx.utils.aoa_to_sheet([header, ...data]);
      ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 8 }];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, '申请列表');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', `attachment; filename="applications_export.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buf);
    } catch (err) {
      console.error('[export-excel] Error:', err);
      res.status(500).json({ error: '导出失败，请重试' });
    }
  });

  return router;
};
