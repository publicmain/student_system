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

    res.json({ totalStudents, totalApplications, pendingTasks, overdueTasks, totalStaff, pendingMaterials, tierStats });
  });

  router.get('/risks', requireRole('principal','counselor'), (req, res) => {
    const risks = db.all(`
      SELECT s.id, s.name, s.grade_level, s.exam_board,
        COUNT(CASE WHEN mt.status NOT IN ('done') AND mt.due_date < date('now') THEN 1 END) as overdue_count
      FROM students s
      LEFT JOIN milestone_tasks mt ON mt.student_id = s.id
      WHERE s.status='active'
      GROUP BY s.id
      HAVING overdue_count > 0
      ORDER BY overdue_count DESC
      LIMIT 10
    `);
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

  return router;
};
