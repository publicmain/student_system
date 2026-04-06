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
    const totalApplications = db.get('SELECT COUNT(*) as cnt FROM applications').cnt;
    const pendingTasks = db.get('SELECT COUNT(*) as cnt FROM milestone_tasks WHERE status IN ("pending","in_progress")').cnt;
    const overdueTasks = db.get(`SELECT COUNT(*) as cnt FROM milestone_tasks WHERE status NOT IN ('done') AND due_date < date('now')`).cnt;
    const totalStaff = db.get('SELECT COUNT(*) as cnt FROM staff').cnt;
    const pendingMaterials = db.get(`SELECT COUNT(*) as cnt FROM material_items WHERE status IN ('未开始','收集中','草稿')`).cnt;

    // 按梯度统计
    const tierStats = db.all(`SELECT tier, COUNT(*) as cnt FROM target_uni_lists GROUP BY tier`);

    // ── 新增统计维度 ──
    const offerStatuses = "('offer','conditional_offer','conditional','unconditional','firm','enrolled')";

    // Offer 数 & 录取率
    const totalOffers = db.get(`SELECT COUNT(*) as cnt FROM applications WHERE status IN ${offerStatuses}`).cnt;
    const appliedCount = db.get(`SELECT COUNT(*) as cnt FROM applications WHERE status NOT IN ('pending','draft')`).cnt;
    const acceptanceRate = appliedCount > 0 ? Math.round(totalOffers / appliedCount * 1000) / 10 : 0;

    // 文书完成率
    const essayTotal = db.get('SELECT COUNT(*) as cnt FROM essays').cnt;
    const essayDone = db.get(`SELECT COUNT(*) as cnt FROM essays WHERE status IN ('final','submitted')`).cnt;
    const essayRate = essayTotal > 0 ? Math.round(essayDone / essayTotal * 100) : 0;

    // 年级分布
    const gradeDistribution = db.all(`SELECT grade_level, COUNT(*) as cnt FROM students WHERE status='active' GROUP BY grade_level ORDER BY grade_level DESC`);

    // 最新 Offer 动态 (最近10条)
    const recentOffers = db.all(`
      SELECT a.id, a.uni_name, a.department, a.status, a.updated_at,
        s.name as student_name, s.grade_level
      FROM applications a
      JOIN students s ON s.id = a.student_id
      WHERE a.status IN ${offerStatuses}
      ORDER BY a.updated_at DESC
      LIMIT 10
    `);

    // 按梯度的申请结果分析 (申请数 vs 录取数)
    const tierResults = db.all(`
      SELECT
        COALESCE(tul.tier, '未分类') as tier,
        COUNT(*) as applied,
        COUNT(CASE WHEN a.status IN ${offerStatuses} THEN 1 END) as offered
      FROM applications a
      LEFT JOIN target_uni_lists tul ON tul.student_id = a.student_id AND tul.uni_name = a.uni_name
      GROUP BY tier
      ORDER BY applied DESC
    `);

    // 文书进度（按学生）
    const essayProgress = db.all(`
      SELECT s.id, s.name, s.grade_level,
        COUNT(e.id) as total,
        COUNT(CASE WHEN e.status IN ('final','submitted') THEN 1 END) as completed
      FROM students s
      LEFT JOIN essays e ON e.student_id = s.id
      WHERE s.status='active'
      GROUP BY s.id
      HAVING total > 0
      ORDER BY (CAST(completed AS REAL) / total) ASC
    `);

    res.json({
      totalStudents, totalApplications, pendingTasks, overdueTasks, totalStaff, pendingMaterials, tierStats,
      totalOffers, acceptanceRate, essayRate, essayTotal, essayDone,
      gradeDistribution, recentOffers, tierResults, essayProgress
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

  return router;
};
