/**
 * routes/dashboard.js — 仪表盘路由（统计/风险/工作量）
 */
const express = require('express');

module.exports = function({ db, requireAuth, requireRole }) {
  const router = express.Router();

  router.get('/stats', requireAuth, (req, res) => {
    const u = req.session.user;
    // agent 和 student_admin 不应看到全局统计
    if (['agent', 'student_admin'].includes(u.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    const totalStudents = db.get('SELECT COUNT(*) as cnt FROM students WHERE status="active"').cnt;
    const totalApplications = (db.get('SELECT COUNT(*) as cnt FROM applications a JOIN students s ON s.id=a.student_id') || {}).cnt || 0;
    const pendingTasks = db.get('SELECT COUNT(*) as cnt FROM milestone_tasks WHERE status IN ("pending","in_progress")').cnt;
    const overdueTasks = db.get(`SELECT COUNT(*) as cnt FROM milestone_tasks WHERE status NOT IN ('done') AND due_date < date('now')`).cnt;
    const totalStaff = db.get('SELECT COUNT(*) as cnt FROM staff').cnt;
    const pendingMaterials = db.get(`SELECT COUNT(*) as cnt FROM material_items WHERE status IN ('未开始','收集中','草稿')`).cnt;

    // 按梯度统计
    const tierStats = db.all(`SELECT tier, COUNT(*) as cnt FROM target_uni_lists GROUP BY tier`);

    // ── 新增统计维度（安全包裹，避免单条查询失败导致整个接口 500）──
    let totalOffers = 0, acceptanceRate = 0, essayRate = 0, essayTotal = 0, essayDone = 0;
    let gradeDistribution = [], recentOffers = [], tierResults = [], essayProgress = [];

    try {
      const offerStatuses = "('offer','conditional_offer','conditional','unconditional','unconditional_offer','firm','enrolled')";

      totalOffers = (db.get(`SELECT COUNT(*) as cnt FROM applications a JOIN students s ON s.id=a.student_id WHERE a.status IN ${offerStatuses}`) || {}).cnt || 0;
      acceptanceRate = totalApplications > 0 ? Math.round(totalOffers / totalApplications * 1000) / 10 : 0;

      essayTotal = (db.get('SELECT COUNT(*) as cnt FROM essays') || {}).cnt || 0;
      essayDone = (db.get(`SELECT COUNT(*) as cnt FROM essays WHERE status IN ('final','submitted')`) || {}).cnt || 0;
      essayRate = essayTotal > 0 ? Math.round(essayDone / essayTotal * 100) : 0;

      gradeDistribution = db.all(`SELECT COALESCE(NULLIF(exam_board,''),'未指定') as exam_board, COUNT(*) as cnt FROM students WHERE status='active' GROUP BY exam_board ORDER BY cnt DESC`) || [];

      recentOffers = db.all(`
        SELECT a.id, a.uni_name, a.department, a.status, a.updated_at,
          s.name as student_name, s.grade_level
        FROM applications a
        JOIN students s ON s.id = a.student_id
        WHERE a.status IN ${offerStatuses}
        ORDER BY a.updated_at DESC
        LIMIT 10
      `) || [];

      tierResults = db.all(`
        SELECT
          COALESCE(tul.tier, '未分类') as tier,
          COUNT(*) as applied,
          COUNT(CASE WHEN a.status IN ${offerStatuses} THEN 1 END) as offered
        FROM applications a
        LEFT JOIN target_uni_lists tul ON tul.student_id = a.student_id AND tul.uni_name = a.uni_name
        GROUP BY tier
        ORDER BY applied DESC
      `) || [];

      essayProgress = db.all(`
        SELECT s.id, s.name, s.grade_level,
          COUNT(e.id) as total,
          COUNT(CASE WHEN e.status IN ('final','submitted') THEN 1 END) as completed
        FROM students s
        LEFT JOIN essays e ON e.student_id = s.id
        WHERE s.status='active'
        GROUP BY s.id
        HAVING total > 0
        ORDER BY (CAST(completed AS REAL) / total) ASC
      `) || [];
    } catch(e) {
      console.error('[dashboard] extended stats error:', e.message);
    }

    // ── 周度 Δ 趋势 (UX-05) ──────────────────────────────
    // 计算最近 7 天的净增量：新建学生/申请/offer 数量以及新增逾期任务
    let weekDelta = { students: 0, applications: 0, offers: 0, overdue: 0 };
    try {
      const offerStatuses = "('offer','conditional_offer','conditional','unconditional','unconditional_offer','firm','enrolled')";
      weekDelta.students = (db.get(
        `SELECT COUNT(*) as cnt FROM students WHERE status='active' AND created_at >= datetime('now','-7 days')`
      ) || {}).cnt || 0;
      weekDelta.applications = (db.get(
        `SELECT COUNT(*) as cnt FROM applications WHERE created_at >= datetime('now','-7 days')`
      ) || {}).cnt || 0;
      weekDelta.offers = (db.get(
        `SELECT COUNT(*) as cnt FROM applications
         WHERE status IN ${offerStatuses}
           AND updated_at >= datetime('now','-7 days')`
      ) || {}).cnt || 0;
      // 新增逾期：本周内刚刚 due_date 过期的任务（状态仍未完成）
      weekDelta.overdue = (db.get(
        `SELECT COUNT(*) as cnt FROM milestone_tasks
         WHERE status NOT IN ('done')
           AND due_date < date('now')
           AND due_date >= date('now','-7 days')`
      ) || {}).cnt || 0;
    } catch(e) {
      console.error('[dashboard] weekDelta error:', e.message);
    }

    res.json({
      totalStudents, totalApplications, pendingTasks, overdueTasks, totalStaff, pendingMaterials, tierStats,
      totalOffers, acceptanceRate, essayRate, essayTotal, essayDone,
      gradeDistribution, recentOffers, tierResults, essayProgress,
      weekDelta
    });
  });

  router.get('/risks', requireRole('principal','counselor'), (req, res) => {
    const u = req.session.user;
    const scopeMy = u.role === 'counselor';
    const risks = db.all(`
      SELECT s.id, s.name, s.grade_level, s.exam_board,
        COUNT(CASE WHEN mt.status NOT IN ('done') AND mt.due_date < date('now') THEN 1 END) as overdue_count,
        (SELECT COUNT(*) FROM essays e2 WHERE e2.student_id=s.id) as essay_total,
        (SELECT COUNT(*) FROM essays e3 WHERE e3.student_id=s.id AND e3.status IN ('final','submitted')) as essay_done,
        (SELECT MAX(c.created_at) FROM communication_logs c WHERE c.student_id=s.id) as last_comm_date,
        (SELECT COUNT(*) FROM feedback f WHERE f.student_id=s.id AND f.status='pending') as pending_feedback
      FROM students s
      LEFT JOIN milestone_tasks mt ON mt.student_id = s.id
      WHERE s.status='active'
        ${scopeMy ? 'AND s.id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=? AND end_date IS NULL)' : ''}
      GROUP BY s.id
      HAVING overdue_count > 0
        OR last_comm_date IS NULL OR last_comm_date < datetime('now','-14 days')
        OR pending_feedback > 0
      ORDER BY overdue_count DESC, pending_feedback DESC
      LIMIT 10
    `, scopeMy ? [u.linked_id] : []);
    res.json(risks);
  });

  router.get('/workload', requireRole('principal','counselor'), (req, res) => {
    const workload = db.all(`
      SELECT st.id, st.name, st.role, st.capacity_students,
        COUNT(DISTINCT ma.student_id) as current_students
      FROM staff st
      LEFT JOIN mentor_assignments ma ON ma.staff_id = st.id AND ma.end_date IS NULL
        AND ma.student_id IN (SELECT id FROM students WHERE status='active')
      GROUP BY st.id
      ORDER BY current_students DESC
    `);
    res.json(workload);
  });

  // ── 规划师专属：我的工作概览 ──────────────────────────────
  router.get('/my-overview', requireRole('counselor'), (req, res) => {
    const staffId = req.session.user.linked_id;
    if (!staffId) return res.status(400).json({ error: '未关联员工账号' });

    // 我的学生 IDs
    const myStudentIds = db.all(
      'SELECT student_id FROM mentor_assignments WHERE staff_id=? AND end_date IS NULL', [staffId]
    ).map(r => r.student_id);

    if (myStudentIds.length === 0) {
      return res.json({
        myStudents: 0, myOverdue: 0, myUpcomingTasks: 0, pendingFeedback: 0,
        upcomingTasks: [], materialProgress: [], attentionStudents: []
      });
    }

    const placeholders = myStudentIds.map(() => '?').join(',');

    // KPI: 我的学生数
    const myStudents = myStudentIds.length;

    // KPI: 我的逾期任务
    const myOverdue = db.get(
      `SELECT COUNT(*) as cnt FROM milestone_tasks
       WHERE student_id IN (${placeholders}) AND status NOT IN ('done') AND due_date < date('now')`,
      myStudentIds
    ).cnt;

    // KPI: 本周截止任务（未来7天）
    const myUpcomingTasks = db.get(
      `SELECT COUNT(*) as cnt FROM milestone_tasks
       WHERE student_id IN (${placeholders}) AND status NOT IN ('done')
         AND due_date >= date('now') AND due_date <= date('now','+7 days')`,
      myStudentIds
    ).cnt;

    // KPI: 待回复反馈
    const pendingFeedback = db.get(
      `SELECT COUNT(*) as cnt FROM feedback
       WHERE student_id IN (${placeholders}) AND status='pending'`,
      myStudentIds
    ).cnt;

    // 未来7天任务列表（按日期排序）
    const upcomingTasks = db.all(
      `SELECT mt.id, mt.title, mt.due_date, mt.status, mt.student_id, s.name as student_name
       FROM milestone_tasks mt
       JOIN students s ON s.id = mt.student_id
       WHERE mt.student_id IN (${placeholders}) AND mt.status NOT IN ('done')
         AND mt.due_date >= date('now') AND mt.due_date <= date('now','+7 days')
       ORDER BY mt.due_date ASC
       LIMIT 20`,
      myStudentIds
    );

    // 材料收集进度（每个学生的完成率）
    const materialProgress = db.all(
      `SELECT s.id, s.name,
        COUNT(mi.id) as total,
        COUNT(CASE WHEN mi.status IN ('已完成','已确认') THEN 1 END) as completed
       FROM students s
       LEFT JOIN material_items mi ON mi.student_id = s.id
       WHERE s.id IN (${placeholders}) AND s.status='active'
       GROUP BY s.id
       HAVING total > 0
       ORDER BY (CAST(completed AS REAL) / total) ASC`,
      myStudentIds
    );

    // 需要关注的学生（多维度）
    const attentionStudents = db.all(
      `SELECT s.id, s.name, s.grade_level,
        COUNT(CASE WHEN mt.status NOT IN ('done') AND mt.due_date < date('now') THEN 1 END) as overdue_count,
        (SELECT COUNT(*) FROM feedback f WHERE f.student_id=s.id AND f.status='pending') as pending_feedback,
        (SELECT MAX(c.created_at) FROM communication_logs c WHERE c.student_id=s.id) as last_comm_date
       FROM students s
       LEFT JOIN milestone_tasks mt ON mt.student_id = s.id
       WHERE s.id IN (${placeholders}) AND s.status='active'
       GROUP BY s.id
       HAVING overdue_count > 0 OR pending_feedback > 0
         OR last_comm_date IS NULL OR last_comm_date < datetime('now','-14 days')
       ORDER BY overdue_count DESC, pending_feedback DESC
       LIMIT 8`,
      myStudentIds
    );

    res.json({
      myStudents, myOverdue, myUpcomingTasks, pendingFeedback,
      upcomingTasks, materialProgress, attentionStudents
    });
  });

  // ── 导师专属：我的工作台概览 ──────────────────────────────
  router.get('/mentor-overview', requireRole('principal', 'counselor', 'mentor'), (req, res) => {
    const staffId = req.session.user.linked_id;
    if (!staffId) return res.status(400).json({ error: '未关联员工账号' });

    const myStudentIds = db.all(
      `SELECT student_id FROM mentor_assignments WHERE staff_id=? AND (end_date IS NULL OR end_date='')`,
      [staffId]
    ).map(r => r.student_id);

    const empty = {
      myStudents: 0, todayTasks: 0, overdueTasks: 0,
      pendingEssays: 0, pendingFeedback: 0, noCommStudents: 0,
      overdueTaskList: [], todayTaskList: [], weekTaskList: [],
      studentCards: [], essayTracker: [], recentComms: [],
    };
    if (myStudentIds.length === 0) return res.json(empty);

    const phs = myStudentIds.map(() => '?').join(',');

    // ── KPI 计数 ──
    const overdueTasks = (db.get(
      `SELECT COUNT(*) as cnt FROM milestone_tasks WHERE student_id IN (${phs}) AND status NOT IN ('done') AND due_date < date('now')`,
      myStudentIds
    ) || {}).cnt || 0;

    const todayTasks = (db.get(
      `SELECT COUNT(*) as cnt FROM milestone_tasks WHERE student_id IN (${phs}) AND status NOT IN ('done') AND due_date = date('now')`,
      myStudentIds
    ) || {}).cnt || 0;

    const pendingFeedback = (db.get(
      `SELECT COUNT(*) as cnt FROM feedback WHERE student_id IN (${phs}) AND status='pending'`,
      myStudentIds
    ) || {}).cnt || 0;

    const noCommStudents = (db.get(
      `SELECT COUNT(*) as cnt FROM students
       WHERE id IN (${phs}) AND status='active'
         AND id NOT IN (
           SELECT DISTINCT student_id FROM communication_logs
           WHERE created_at >= datetime('now','-7 days')
         )`,
      myStudentIds
    ) || {}).cnt || 0;

    let pendingEssays = 0;
    try {
      pendingEssays = (db.get(
        `SELECT COUNT(*) as cnt FROM essays WHERE student_id IN (${phs}) AND status='review'`,
        myStudentIds
      ) || {}).cnt || 0;
    } catch(e) {}

    // ── 任务列表（逾期 / 今日 / 本周后续7天）──
    const overdueTaskList = db.all(
      `SELECT mt.id, mt.title, mt.due_date, mt.status, mt.student_id, s.name as student_name
       FROM milestone_tasks mt JOIN students s ON s.id=mt.student_id
       WHERE mt.student_id IN (${phs}) AND mt.status NOT IN ('done') AND mt.due_date < date('now')
       ORDER BY mt.due_date ASC LIMIT 20`,
      myStudentIds
    );

    const todayTaskList = db.all(
      `SELECT mt.id, mt.title, mt.due_date, mt.status, mt.student_id, s.name as student_name
       FROM milestone_tasks mt JOIN students s ON s.id=mt.student_id
       WHERE mt.student_id IN (${phs}) AND mt.status NOT IN ('done') AND mt.due_date = date('now')
       ORDER BY mt.title ASC`,
      myStudentIds
    );

    const weekTaskList = db.all(
      `SELECT mt.id, mt.title, mt.due_date, mt.status, mt.student_id, s.name as student_name
       FROM milestone_tasks mt JOIN students s ON s.id=mt.student_id
       WHERE mt.student_id IN (${phs}) AND mt.status NOT IN ('done')
         AND mt.due_date > date('now') AND mt.due_date <= date('now','+7 days')
       ORDER BY mt.due_date ASC LIMIT 30`,
      myStudentIds
    );

    // ── 学生卡片（含文书进度、逾期数、最近沟通、选科摘要）──
    const studentCards = db.all(
      `SELECT s.id, s.name, s.exam_board, s.grade_level,
         COUNT(CASE WHEN mt.status NOT IN ('done') AND mt.due_date < date('now') THEN 1 END) as overdue_count,
         COUNT(CASE WHEN mt.status NOT IN ('done') AND mt.due_date = date('now') THEN 1 END) as today_count,
         (SELECT COUNT(*) FROM feedback f WHERE f.student_id=s.id AND f.status='pending') as pending_fb,
         (SELECT MAX(COALESCE(cl.comm_date, cl.created_at)) FROM communication_logs cl WHERE cl.student_id=s.id) as last_comm_date,
         (SELECT COUNT(*) FROM essays e WHERE e.student_id=s.id) as essay_total,
         (SELECT COUNT(*) FROM essays e WHERE e.student_id=s.id AND e.status IN ('final','submitted')) as essay_done,
         (SELECT GROUP_CONCAT(c.name, '｜')
          FROM (SELECT DISTINCT c2.name FROM course_enrollments ce2
                JOIN courses c2 ON c2.id=ce2.course_id
                WHERE ce2.student_id=s.id AND ce2.status='active' LIMIT 4) c) as subjects_summary
       FROM students s
       LEFT JOIN milestone_tasks mt ON mt.student_id=s.id
       WHERE s.id IN (${phs}) AND s.status='active'
       GROUP BY s.id
       ORDER BY overdue_count DESC, s.name ASC`,
      myStudentIds
    );

    // ── 文书跟踪（非终稿/已提交的文书）──
    let essayTracker = [];
    try {
      essayTracker = db.all(
        `SELECT e.id, e.student_id, e.title, e.status, e.updated_at, s.name as student_name
         FROM essays e JOIN students s ON s.id=e.student_id
         WHERE e.student_id IN (${phs}) AND e.status NOT IN ('final','submitted')
         ORDER BY CASE e.status WHEN 'review' THEN 0 WHEN 'revision' THEN 1 ELSE 2 END, e.updated_at DESC
         LIMIT 20`,
        myStudentIds
      );
    } catch(e) {}

    // ── 最近沟通记录 ──
    const recentComms = db.all(
      `SELECT cl.student_id, s.name as student_name, cl.channel as type, cl.summary, COALESCE(cl.comm_date, cl.created_at) as created_at
       FROM communication_logs cl JOIN students s ON s.id=cl.student_id
       WHERE cl.student_id IN (${phs})
       ORDER BY COALESCE(cl.comm_date, cl.created_at) DESC LIMIT 15`,
      myStudentIds
    );

    res.json({
      myStudents: myStudentIds.length,
      todayTasks, overdueTasks, pendingEssays, pendingFeedback, noCommStudents,
      overdueTaskList, todayTaskList, weekTaskList,
      studentCards, essayTracker, recentComms,
    });
  });

  return router;
};
