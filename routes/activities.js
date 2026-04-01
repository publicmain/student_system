/**
 * routes/activities.js — 课外活动与竞赛荣誉管理
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, upload, fileStorage, moveUploadedFile }) {
  const router = express.Router();

  // 权限检查
  function _checkAccess(req, sid) {
    const u = req.session.user;
    if (u.role === 'student' && u.linked_id !== sid) return '无权访问';
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return '无权访问';
    }
    return null;
  }

  const ACTIVITY_CATEGORIES = [
    'academic_competition','club_leadership','volunteer','internship',
    'sports','arts','personal_project','research','other'
  ];
  const IMPACT_LEVELS = ['school','city','province','national','international'];

  // ═══════════════════════════════════════════════════════════════════
  //  课外活动 CRUD
  // ═══════════════════════════════════════════════════════════════════

  router.get('/students/:id/activities', requireAuth, (req, res) => {
    const err = _checkAccess(req, req.params.id);
    if (err) return res.status(403).json({ error: err });
    res.json(db.all('SELECT * FROM student_activities WHERE student_id=? ORDER BY sort_order, created_at DESC', [req.params.id]));
  });

  router.post('/students/:id/activities', requireAuth, requireRole('principal','counselor','mentor'), (req, res) => {
    const sid = req.params.id;
    const s = db.get('SELECT id FROM students WHERE id=?', [sid]);
    if (!s) return res.status(404).json({ error: '学生不存在' });
    const { category, name, organization, role, start_date, end_date, hours_per_week, weeks_per_year, impact_level, description, achievements, related_major_tags, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '活动名称必填' });
    if (!category) return res.status(400).json({ error: '活动类别必填' });
    const id = uuidv4();
    db.run(`INSERT INTO student_activities (id, student_id, category, name, organization, role, start_date, end_date, hours_per_week, weeks_per_year, impact_level, description, achievements, related_major_tags, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, sid, category, name.trim(), organization||null, role||null, start_date||null, end_date||null, hours_per_week||null, weeks_per_year||null, impact_level||null, description||null, achievements||null, JSON.stringify(related_major_tags||[]), sort_order||0]);
    audit(req, 'CREATE', 'student_activities', id, { name, category, student_id: sid });
    res.json({ id });
  });

  // 批量排序（必须在 /activities/:id 之前注册，避免 :id 匹配 "reorder"）
  router.put('/activities/reorder', requireAuth, requireRole('principal','counselor','mentor'), (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items 数组必填' });
    db.transaction(runInTx => {
      items.forEach((item, i) => {
        runInTx('UPDATE student_activities SET sort_order=?, updated_at=datetime(\'now\') WHERE id=?', [i, item.id]);
      });
    });
    res.json({ ok: true });
  });

  router.put('/activities/:id', requireAuth, requireRole('principal','counselor','mentor'), (req, res) => {
    const act = db.get('SELECT * FROM student_activities WHERE id=?', [req.params.id]);
    if (!act) return res.status(404).json({ error: '活动不存在' });
    const { category, name, organization, role, start_date, end_date, hours_per_week, weeks_per_year, impact_level, description, achievements, related_major_tags, sort_order } = req.body;
    db.run(`UPDATE student_activities SET category=?, name=?, organization=?, role=?, start_date=?, end_date=?, hours_per_week=?, weeks_per_year=?, impact_level=?, description=?, achievements=?, related_major_tags=?, sort_order=?, updated_at=datetime('now') WHERE id=?`,
      [category||act.category, name||act.name, organization??act.organization, role??act.role, start_date??act.start_date, end_date??act.end_date, hours_per_week??act.hours_per_week, weeks_per_year??act.weeks_per_year, impact_level??act.impact_level, description??act.description, achievements??act.achievements, JSON.stringify(related_major_tags||(JSON.parse(act.related_major_tags||'[]'))), sort_order??act.sort_order, req.params.id]);
    audit(req, 'UPDATE', 'student_activities', req.params.id, { name: name||act.name });
    res.json({ ok: true });
  });

  router.delete('/activities/:id', requireAuth, requireRole('principal','counselor'), (req, res) => {
    const act = db.get('SELECT * FROM student_activities WHERE id=?', [req.params.id]);
    if (!act) return res.status(404).json({ error: '活动不存在' });
    db.run('DELETE FROM student_activities WHERE id=?', [req.params.id]);
    audit(req, 'DELETE', 'student_activities', req.params.id, { name: act.name });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  竞赛荣誉 CRUD
  // ═══════════════════════════════════════════════════════════════════

  router.get('/students/:id/honors', requireAuth, (req, res) => {
    const err = _checkAccess(req, req.params.id);
    if (err) return res.status(403).json({ error: err });
    res.json(db.all('SELECT h.*, a.name as activity_name FROM student_honors h LEFT JOIN student_activities a ON h.activity_id=a.id WHERE h.student_id=? ORDER BY h.sort_order, h.award_date DESC', [req.params.id]));
  });

  router.post('/students/:id/honors', requireAuth, requireRole('principal','counselor','mentor'), (req, res) => {
    const sid = req.params.id;
    const s = db.get('SELECT id FROM students WHERE id=?', [sid]);
    if (!s) return res.status(404).json({ error: '学生不存在' });
    const { activity_id, name, level, award_rank, award_date, description, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '荣誉名称必填' });
    const id = uuidv4();
    db.run(`INSERT INTO student_honors (id, student_id, activity_id, name, level, award_rank, award_date, description, sort_order) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, sid, activity_id||null, name.trim(), level||null, award_rank||null, award_date||null, description||null, sort_order||0]);
    audit(req, 'CREATE', 'student_honors', id, { name, student_id: sid });
    res.json({ id });
  });

  router.put('/honors/:id', requireAuth, requireRole('principal','counselor','mentor'), (req, res) => {
    const honor = db.get('SELECT * FROM student_honors WHERE id=?', [req.params.id]);
    if (!honor) return res.status(404).json({ error: '荣誉不存在' });
    const { activity_id, name, level, award_rank, award_date, description, sort_order } = req.body;
    db.run(`UPDATE student_honors SET activity_id=?, name=?, level=?, award_rank=?, award_date=?, description=?, sort_order=?, updated_at=datetime('now') WHERE id=?`,
      [activity_id??honor.activity_id, name||honor.name, level??honor.level, award_rank??honor.award_rank, award_date??honor.award_date, description??honor.description, sort_order??honor.sort_order, req.params.id]);
    audit(req, 'UPDATE', 'student_honors', req.params.id, { name: name||honor.name });
    res.json({ ok: true });
  });

  router.delete('/honors/:id', requireAuth, requireRole('principal','counselor'), (req, res) => {
    const honor = db.get('SELECT * FROM student_honors WHERE id=?', [req.params.id]);
    if (!honor) return res.status(404).json({ error: '荣誉不存在' });
    db.run('DELETE FROM student_honors WHERE id=?', [req.params.id]);
    audit(req, 'DELETE', 'student_honors', req.params.id, { name: honor.name });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  活动统计
  // ═══════════════════════════════════════════════════════════════════

  router.get('/students/:id/activity-stats', requireAuth, (req, res) => {
    const err = _checkAccess(req, req.params.id);
    if (err) return res.status(403).json({ error: err });
    const sid = req.params.id;
    const activities = db.all('SELECT category, impact_level, hours_per_week, weeks_per_year FROM student_activities WHERE student_id=?', [sid]);
    const honors = db.all('SELECT level FROM student_honors WHERE student_id=?', [sid]);

    // 按类别统计
    const byCategory = {};
    activities.forEach(a => { byCategory[a.category] = (byCategory[a.category]||0) + 1; });

    // 按影响力统计
    const byImpact = {};
    activities.forEach(a => { if (a.impact_level) byImpact[a.impact_level] = (byImpact[a.impact_level]||0) + 1; });

    // 总投入时间估算
    let totalHours = 0;
    activities.forEach(a => { totalHours += (a.hours_per_week||0) * (a.weeks_per_year||0); });

    // 荣誉按级别
    const honorsByLevel = {};
    honors.forEach(h => { if (h.level) honorsByLevel[h.level] = (honorsByLevel[h.level]||0) + 1; });

    // 平衡度分析
    const categoryCount = Object.keys(byCategory).length;
    const balance = categoryCount >= 4 ? 'balanced' : categoryCount >= 2 ? 'moderate' : 'narrow';

    res.json({
      total_activities: activities.length,
      total_honors: honors.length,
      total_hours_per_year: Math.round(totalHours),
      by_category: byCategory,
      by_impact: byImpact,
      honors_by_level: honorsByLevel,
      balance,
      categories: ACTIVITY_CATEGORIES,
      impact_levels: IMPACT_LEVELS,
    });
  });

  return router;
};
