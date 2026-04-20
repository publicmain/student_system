/**
 * routes/courses.js — 课程 / 教室 / 课程-教师 / 选课 管理
 * 提供基础 CRUD + 报表查询
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole }) {
  const router = express.Router();

  // ═══════════════════════ 教室 ═══════════════════════
  router.get('/classrooms', requireAuth, (req, res) => {
    const rows = db.all(`
      SELECT c.*,
        (SELECT COUNT(*) FROM courses WHERE classroom_id=c.id AND status='active') as course_count
      FROM classrooms c
      ORDER BY c.name
    `);
    res.json(rows);
  });

  router.post('/classrooms', requireRole('principal','intake_staff'), (req, res) => {
    const { name, capacity, location, notes } = req.body;
    if (!name) return res.status(400).json({ error: '教室名称不能为空' });
    const existing = db.get('SELECT id FROM classrooms WHERE name=?', [name]);
    if (existing) return res.status(409).json({ error: '教室名称已存在', id: existing.id });
    const id = uuidv4();
    db.run(`INSERT INTO classrooms (id, name, capacity, location, notes) VALUES (?,?,?,?,?)`,
      [id, name, capacity || 20, location || '', notes || '']);
    audit(req, 'CREATE', 'classroom', id, { name });
    res.json({ id, name });
  });

  router.put('/classrooms/:id', requireRole('principal'), (req, res) => {
    const { name, capacity, location, notes } = req.body;
    db.run(`UPDATE classrooms SET name=?, capacity=?, location=?, notes=? WHERE id=?`,
      [name, capacity, location || '', notes || '', req.params.id]);
    audit(req, 'UPDATE', 'classroom', req.params.id, { name });
    res.json({ ok: true });
  });

  router.delete('/classrooms/:id', requireRole('principal'), (req, res) => {
    const used = db.get('SELECT COUNT(*) as c FROM courses WHERE classroom_id=?', [req.params.id]).c;
    if (used > 0) return res.status(400).json({ error: `该教室下还有 ${used} 门课程，请先迁移` });
    db.run('DELETE FROM classrooms WHERE id=?', [req.params.id]);
    audit(req, 'DELETE', 'classroom', req.params.id, {});
    res.json({ ok: true });
  });

  // ═══════════════════════ 课程 ═══════════════════════
  router.get('/courses', requireAuth, (req, res) => {
    const rows = db.all(`
      SELECT c.*,
        s.name as subject_name,
        cr.name as classroom_name,
        (SELECT COUNT(*) FROM course_enrollments WHERE course_id=c.id AND status='active') as enrolled_count,
        (SELECT GROUP_CONCAT(st.name, ', ') FROM course_staff cs JOIN staff st ON st.id=cs.staff_id WHERE cs.course_id=c.id) as teacher_names
      FROM courses c
      LEFT JOIN subjects s ON s.id = c.subject_id
      LEFT JOIN classrooms cr ON cr.id = c.classroom_id
      ORDER BY c.session_label, c.name
    `);
    res.json(rows);
  });

  router.get('/courses/:id', requireAuth, (req, res) => {
    const course = db.get(`
      SELECT c.*, s.name as subject_name, s.code as subject_code, cr.name as classroom_name
      FROM courses c
      LEFT JOIN subjects s ON s.id = c.subject_id
      LEFT JOIN classrooms cr ON cr.id = c.classroom_id
      WHERE c.id=?
    `, [req.params.id]);
    if (!course) return res.status(404).json({ error: '课程不存在' });
    const teachers = db.all(`
      SELECT cs.*, st.name as staff_name, st.role as staff_role
      FROM course_staff cs JOIN staff st ON st.id = cs.staff_id
      WHERE cs.course_id=?
    `, [req.params.id]);
    const students = db.all(`
      SELECT ce.*, s.name as student_name, s.grade_level, s.exam_board
      FROM course_enrollments ce JOIN students s ON s.id = ce.student_id
      WHERE ce.course_id=? AND ce.status='active'
      ORDER BY s.name
    `, [req.params.id]);
    res.json({ ...course, teachers, students });
  });

  router.post('/courses', requireRole('principal','intake_staff'), (req, res) => {
    const { code, name, subject_id, classroom_id, exam_board, level, session_label, notes } = req.body;
    if (!code || !name) return res.status(400).json({ error: '课号和名称不能为空' });
    const existing = db.get('SELECT id FROM courses WHERE code=?', [code]);
    if (existing) return res.status(409).json({ error: '课号已存在', id: existing.id });
    const id = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO courses (id, code, name, subject_id, classroom_id, exam_board, level, session_label, num_students, notes, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,0,?,'active',?,?)`,
      [id, code, name, subject_id || null, classroom_id || null, exam_board || '', level || '', session_label || '', notes || '', now, now]);
    audit(req, 'CREATE', 'course', id, { code, name });
    res.json({ id, code, name });
  });

  router.put('/courses/:id', requireRole('principal','intake_staff'), (req, res) => {
    const { name, subject_id, classroom_id, exam_board, level, session_label, notes, status } = req.body;
    db.run(`UPDATE courses SET name=?, subject_id=?, classroom_id=?, exam_board=?, level=?, session_label=?, notes=?, status=?, updated_at=? WHERE id=?`,
      [name, subject_id || null, classroom_id || null, exam_board || '', level || '', session_label || '', notes || '', status || 'active', new Date().toISOString(), req.params.id]);
    audit(req, 'UPDATE', 'course', req.params.id, { name });
    res.json({ ok: true });
  });

  router.delete('/courses/:id', requireRole('principal'), (req, res) => {
    db.transaction((run) => {
      run('DELETE FROM course_staff WHERE course_id=?', [req.params.id]);
      run('DELETE FROM course_enrollments WHERE course_id=?', [req.params.id]);
      run('DELETE FROM courses WHERE id=?', [req.params.id]);
    });
    audit(req, 'DELETE', 'course', req.params.id, {});
    res.json({ ok: true });
  });

  // ═════════════════ 课程-教师 ═════════════════
  router.post('/courses/:id/teachers', requireRole('principal','intake_staff'), (req, res) => {
    const { staff_id, role } = req.body;
    if (!staff_id) return res.status(400).json({ error: 'staff_id 必填' });
    const existing = db.get('SELECT id FROM course_staff WHERE course_id=? AND staff_id=?', [req.params.id, staff_id]);
    if (existing) return res.status(409).json({ error: '该教师已分配', id: existing.id });
    const id = uuidv4();
    db.run(`INSERT INTO course_staff (id, course_id, staff_id, role) VALUES (?,?,?,?)`,
      [id, req.params.id, staff_id, role || 'teacher']);
    audit(req, 'CREATE', 'course_staff', id, { course_id: req.params.id, staff_id });
    res.json({ id });
  });

  router.delete('/course-staff/:id', requireRole('principal','intake_staff'), (req, res) => {
    db.run('DELETE FROM course_staff WHERE id=?', [req.params.id]);
    audit(req, 'DELETE', 'course_staff', req.params.id, {});
    res.json({ ok: true });
  });

  // ═════════════════ 课程-学生 ═════════════════
  router.post('/courses/:id/enrollments', requireRole('principal','intake_staff'), (req, res) => {
    const { student_id } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id 必填' });
    const existing = db.get('SELECT id FROM course_enrollments WHERE course_id=? AND student_id=?', [req.params.id, student_id]);
    if (existing) {
      db.run(`UPDATE course_enrollments SET status='active', dropped_at=NULL WHERE id=?`, [existing.id]);
      return res.json({ id: existing.id, reactivated: true });
    }
    const id = uuidv4();
    db.run(`INSERT INTO course_enrollments (id, course_id, student_id, status) VALUES (?,?,?,'active')`,
      [id, req.params.id, student_id]);
    db.run(`UPDATE courses SET num_students = (SELECT COUNT(*) FROM course_enrollments WHERE course_id=? AND status='active') WHERE id=?`,
      [req.params.id, req.params.id]);
    audit(req, 'CREATE', 'course_enrollment', id, { course_id: req.params.id, student_id });
    res.json({ id });
  });

  router.delete('/course-enrollments/:id', requireRole('principal','intake_staff'), (req, res) => {
    const row = db.get('SELECT * FROM course_enrollments WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '选课记录不存在' });
    db.run(`UPDATE course_enrollments SET status='dropped', dropped_at=? WHERE id=?`,
      [new Date().toISOString(), req.params.id]);
    db.run(`UPDATE courses SET num_students = (SELECT COUNT(*) FROM course_enrollments WHERE course_id=? AND status='active') WHERE id=?`,
      [row.course_id, row.course_id]);
    audit(req, 'DELETE', 'course_enrollment', req.params.id, {});
    res.json({ ok: true });
  });

  // 某学生所有选课
  router.get('/students/:id/courses', requireAuth, (req, res) => {
    const rows = db.all(`
      SELECT ce.*, c.code, c.name as course_name, c.exam_board, c.level, c.session_label, c.periods_per_week,
        cr.name as classroom_name, s.name as subject_name,
        (SELECT GROUP_CONCAT(st.name, ', ') FROM course_staff cs JOIN staff st ON st.id=cs.staff_id WHERE cs.course_id=c.id) as teacher_names
      FROM course_enrollments ce
      JOIN courses c ON c.id = ce.course_id
      LEFT JOIN classrooms cr ON cr.id = c.classroom_id
      LEFT JOIN subjects s ON s.id = c.subject_id
      WHERE ce.student_id=? AND ce.status='active'
      ORDER BY s.name, c.code
    `, [req.params.id]);
    res.json(rows);
  });

  // 某教师任课
  router.get('/staff/:id/courses', requireAuth, (req, res) => {
    const rows = db.all(`
      SELECT cs.*, c.code, c.name as course_name, c.exam_board, c.level, c.session_label,
        cr.name as classroom_name,
        (SELECT COUNT(*) FROM course_enrollments WHERE course_id=c.id AND status='active') as enrolled_count
      FROM course_staff cs
      JOIN courses c ON c.id = cs.course_id
      LEFT JOIN classrooms cr ON cr.id = c.classroom_id
      WHERE cs.staff_id=?
      ORDER BY c.session_label, c.code
    `, [req.params.id]);
    res.json(rows);
  });

  // 课程概览 (按 session 分组)
  router.get('/courses-overview', requireAuth, (req, res) => {
    const sessions = db.all(`
      SELECT
        COALESCE(c.session_label, '未分组') as session_label,
        COUNT(*) as course_count,
        SUM(num_students) as total_enrollments
      FROM courses c WHERE c.status='active'
      GROUP BY session_label
      ORDER BY session_label
    `);
    const byClassroom = db.all(`
      SELECT cr.id, cr.name, cr.capacity,
        COUNT(c.id) as course_count,
        COALESCE(SUM(c.num_students), 0) as total_enrollments
      FROM classrooms cr
      LEFT JOIN courses c ON c.classroom_id=cr.id AND c.status='active'
      GROUP BY cr.id
      ORDER BY cr.name
    `);
    res.json({ sessions, byClassroom });
  });

  return router;
};
