/**
 * routes/students.js — 学生CRUD及子资源（评估/选科/目标院校/导师/家长）
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole }) {
  const router = express.Router();

  const VALID_GRADE_LEVELS = ['G9','G10','G11','G12','G13','Year 9','Year 10','Year 11','Year 12','Year 13','9','10','11','12','13','其他'];

  router.get('/students', requireAuth, (req, res) => {
    const { grade, exam_board, search } = req.query;
    let where = ['s.status="active"'];
    let params = [];

    // 学生只能看自己
    if (req.session.user.role === 'student') {
      where.push('s.id=?'); params.push(req.session.user.linked_id);
    }
    // 导师只看自己负责的学生
    if (req.session.user.role === 'mentor') {
      where.push('s.id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)');
      params.push(req.session.user.linked_id);
    }
    // 家长只看自己关联的学生
    if (req.session.user.role === 'parent') {
      where.push('s.id IN (SELECT student_id FROM student_parents WHERE parent_id=?)');
      params.push(req.session.user.linked_id);
    }
    if (grade) { where.push('s.grade_level=?'); params.push(grade); }
    if (exam_board) { where.push('s.exam_board=?'); params.push(exam_board); }
    if (search) { where.push('s.name LIKE ?'); params.push(`%${search}%`); }

    const isPrincipal = req.session.user.role === 'principal';
    // principal 才关联代理表，其他角色不返回任何代理字段
    const students = isPrincipal
      ? db.all(`
          SELECT s.*,
            (SELECT COUNT(*) FROM milestone_tasks mt WHERE mt.student_id=s.id AND mt.status NOT IN ('done') AND mt.due_date < date('now')) as overdue_count,
            (SELECT GROUP_CONCAT(st.name,', ') FROM mentor_assignments ma JOIN staff st ON st.id=ma.staff_id WHERE ma.student_id=s.id AND ma.end_date IS NULL) as mentors,
            (SELECT GROUP_CONCAT(tul.tier||':'||tul.uni_name, ' | ') FROM target_uni_lists tul WHERE tul.student_id=s.id LIMIT 3) as targets,
            a.name as agent_name, a.id as agent_id_ref, a.type as agent_type
          FROM students s
          LEFT JOIN agents a ON a.id=s.agent_id
          WHERE ${where.join(' AND ')}
          ORDER BY s.grade_level DESC, s.name
        `, params)
      : db.all(`
          SELECT s.id, s.name, s.grade_level, s.enrol_date, s.exam_board, s.status, s.notes,
            s.date_of_birth, s.created_at, s.updated_at,
            (SELECT COUNT(*) FROM milestone_tasks mt WHERE mt.student_id=s.id AND mt.status NOT IN ('done') AND mt.due_date < date('now')) as overdue_count,
            (SELECT GROUP_CONCAT(st.name,', ') FROM mentor_assignments ma JOIN staff st ON st.id=ma.staff_id WHERE ma.student_id=s.id AND ma.end_date IS NULL) as mentors,
            (SELECT GROUP_CONCAT(tul.tier||':'||tul.uni_name, ' | ') FROM target_uni_lists tul WHERE tul.student_id=s.id LIMIT 3) as targets
          FROM students s
          WHERE ${where.join(' AND ')}
          ORDER BY s.grade_level DESC, s.name
        `, params);

    res.json(students);
  });

  router.post('/students', requireRole('principal','counselor'), (req, res) => {
    const { name, grade_level, enrol_date, exam_board, notes, date_of_birth, agent_id } = req.body;
    if (!name || !grade_level) return res.status(400).json({ error: '姓名和年级必填' });
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 200) return res.status(400).json({ error: '学生姓名格式不合法' });
    if (!VALID_GRADE_LEVELS.includes(grade_level)) return res.status(400).json({ error: `年级必须是以下之一: ${VALID_GRADE_LEVELS.join(', ')}` });
    const id = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO students (id,name,grade_level,enrol_date,exam_board,status,notes,created_at,updated_at,date_of_birth,agent_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, name, grade_level, enrol_date, exam_board, 'active', notes||'', now, now, date_of_birth||null, agent_id||null]);
    audit(req, 'CREATE', 'students', id, { name });
    res.json({ id });
  });

  router.get('/students/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const student = db.get('SELECT * FROM students WHERE id=?', [id]);
    if (!student || student.status === 'deleted') return res.status(404).json({ error: '学生不存在' });

    // 权限检查
    const _u = req.session.user;
    if (_u.role === 'student' && _u.linked_id !== id) return res.status(403).json({ error: '无权访问' });
    if (_u.role === 'parent') {
      const sp = db.get('SELECT * FROM student_parents WHERE student_id=? AND parent_id=?', [id, _u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    if (_u.role === 'counselor' || _u.role === 'mentor') {
      const assigned = db.get(
        'SELECT 1 FROM mentor_assignments WHERE student_id=? AND staff_id=? AND end_date IS NULL',
        [id, _u.linked_id || _u.id]);
      if (!assigned) return res.status(403).json({ error: '无权访问' });
    }

    const assessments = db.all('SELECT * FROM admission_assessments WHERE student_id=? ORDER BY assess_date DESC', [id]);
    const subjects = db.all(`
      SELECT se.*, s.code, s.name as subject_name FROM subject_enrollments se
      JOIN subjects s ON s.id=se.subject_id WHERE se.student_id=?`, [id]);
    const targets = db.all('SELECT * FROM target_uni_lists WHERE student_id=? ORDER BY tier, priority_rank', [id]);
    const mentors = db.all(`
      SELECT ma.*, st.name as staff_name, st.role as staff_role FROM mentor_assignments ma
      JOIN staff st ON st.id=ma.staff_id WHERE ma.student_id=? AND ma.end_date IS NULL`, [id]);
    const applications = db.all('SELECT * FROM applications WHERE student_id=? ORDER BY created_at DESC', [id]);
    const parents = db.all(`
      SELECT pg.* FROM parent_guardians pg
      JOIN student_parents sp ON sp.parent_id=pg.id WHERE sp.student_id=?`, [id]);
    // 关联代理：优先走 intake_cases → referrals → agents 链路，fallback 读 student.agent_id
    let agentInfo = db.get(`
      SELECT a.id as agent_id, a.name as agent_name, a.type as agent_type,
        a.email as agent_email, a.phone as agent_phone,
        r.source_type, ic.program_name, ic.intake_year
      FROM intake_cases ic
      JOIN referrals r ON r.id=ic.referral_id
      JOIN agents a ON a.id=r.agent_id
      WHERE ic.student_id=? AND r.source_type='agent'
      ORDER BY ic.created_at DESC, ic.rowid DESC LIMIT 1
    `, [id]);
    // fallback: 直接用 students.agent_id
    if (!agentInfo && student.agent_id) {
      agentInfo = db.get(`
        SELECT a.id as agent_id, a.name as agent_name, a.type as agent_type,
          a.email as agent_email, a.phone as agent_phone,
          NULL as source_type, NULL as program_name, NULL as intake_year
        FROM agents a WHERE a.id=?
      `, [student.agent_id]);
    }

    // 代理信息仅对 principal 可见（防止counselor/student/parent看到佣金来源）
    const canSeeAgent = req.session.user.role === 'principal';
    res.json({ student, assessments, subjects, targets, mentors, applications, parents, agentInfo: canSeeAgent ? (agentInfo||null) : undefined });
  });

  router.put('/students/:id', requireRole('principal','counselor'), (req, res) => {
    const { id } = req.params;
    const { name, grade_level, enrol_date, exam_board, notes, status, date_of_birth, agent_id, _partial } = req.body;
    if (_partial) {
      // 局部更新：仅更新传入的非 undefined 字段
      if (agent_id !== undefined) {
        db.run(`UPDATE students SET agent_id=?, updated_at=? WHERE id=?`, [agent_id||null, new Date().toISOString(), id]);
      }
      audit(req, 'UPDATE', 'students', id, { agent_id });
      return res.json({ ok: true });
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 200) {
      return res.status(400).json({ error: '学生姓名不能为空且不超过200字符' });
    }
    if (grade_level && !VALID_GRADE_LEVELS.includes(grade_level)) {
      return res.status(400).json({ error: `年级必须是以下之一: ${VALID_GRADE_LEVELS.join(', ')}` });
    }
    const VALID_STATUS = ['active','inactive','graduated','deleted'];
    if (status && !VALID_STATUS.includes(status)) {
      return res.status(400).json({ error: `状态必须是以下之一: ${VALID_STATUS.join(', ')}` });
    }
    db.run(`UPDATE students SET name=?,grade_level=?,enrol_date=?,exam_board=?,notes=?,status=?,updated_at=?,date_of_birth=?,agent_id=? WHERE id=?`,
      [name.trim(), grade_level, enrol_date, exam_board, notes, status||'active', new Date().toISOString(), date_of_birth||null, agent_id||null, id]);
    audit(req, 'UPDATE', 'students', id, { name });
    res.json({ ok: true });
  });

  router.delete('/students/:id', requireRole('principal'), (req, res) => {
    const { id } = req.params;
    db.run('UPDATE students SET status="deleted" WHERE id=?', [id]);
    audit(req, 'DELETE', 'students', id, null);
    res.json({ ok: true });
  });

  // ── 入学评估 ─────────────────────────────────────────
  router.get('/students/:id/assessments', requireAuth, (req, res) => {
    const u = req.session.user;
    const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    const rows = db.all('SELECT * FROM admission_assessments WHERE student_id=? ORDER BY assess_date DESC', [sid]);
    res.json(rows);
  });

  router.post('/students/:id/assessments', requireRole('principal','counselor'), (req, res) => {
    const { assess_date, assess_type, subject, score, max_score, percentile, notes } = req.body;
    const student = db.get('SELECT id FROM students WHERE id=?', [req.params.id]);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const aid = uuidv4();
    db.run(`INSERT INTO admission_assessments VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [aid, req.params.id, assess_date, assess_type, subject, score, max_score||100, percentile||null, notes||'', new Date().toISOString()]);
    res.json({ id: aid });
  });

  // ── 选科 ─────────────────────────────────────────────
  router.get('/students/:id/subjects', requireAuth, (req, res) => {
    const rows = db.all(`SELECT se.*, s.code, s.name as subject_name FROM subject_enrollments se JOIN subjects s ON s.id=se.subject_id WHERE se.student_id=?`, [req.params.id]);
    res.json(rows);
  });

  router.post('/students/:id/subjects', requireRole('principal','counselor'), (req, res) => {
    const { subject_id, level, exam_board } = req.body;
    const eid = uuidv4();
    db.run(`INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)`,
      [eid, req.params.id, subject_id, level, exam_board, new Date().toISOString()]);
    res.json({ id: eid });
  });

  router.delete('/students/:sid/subjects/:eid', requireRole('principal','counselor'), (req, res) => {
    db.run('DELETE FROM subject_enrollments WHERE id=?', [req.params.eid]);
    res.json({ ok: true });
  });

  // ── 目标院校 ─────────────────────────────────────────
  router.get('/students/:id/targets', requireAuth, (req, res) => {
    const rows = db.all('SELECT * FROM target_uni_lists WHERE student_id=? ORDER BY tier, priority_rank', [req.params.id]);
    res.json(rows);
  });

  router.post('/students/:id/targets', requireRole('principal','counselor'), (req, res) => {
    const { uni_name, tier, priority_rank, department, rationale } = req.body;
    const tid = uuidv4();
    db.run(`INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)`,
      [tid, req.params.id, uuidv4(), uni_name, tier, priority_rank||1, department||'', rationale||'', new Date().toISOString()]);
    res.json({ id: tid });
  });

  router.put('/students/:sid/targets/:tid', requireRole('principal','counselor'), (req, res) => {
    if (!db.get('SELECT id FROM target_uni_lists WHERE id=?', [req.params.tid])) {
      return res.status(404).json({ error: '目标院校记录不存在' });
    }
    const { uni_name, tier, priority_rank, department, rationale } = req.body;
    db.run('UPDATE target_uni_lists SET uni_name=?,tier=?,priority_rank=?,department=?,rationale=? WHERE id=?',
      [uni_name, tier, priority_rank, department, rationale, req.params.tid]);
    res.json({ ok: true });
  });

  router.delete('/students/:sid/targets/:tid', requireRole('principal','counselor'), (req, res) => {
    db.run('DELETE FROM target_uni_lists WHERE id=?', [req.params.tid]);
    res.json({ ok: true });
  });

  // ── 导师分配 ─────────────────────────────────────────
  router.get('/students/:id/mentors', requireAuth, (req, res) => {
    const u = req.session.user;
    const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    const rows = db.all(`
      SELECT ma.*, st.name as staff_name, st.role as staff_role, st.subjects, st.exam_board_exp
      FROM mentor_assignments ma JOIN staff st ON st.id=ma.staff_id WHERE ma.student_id=?`, [sid]);
    res.json(rows);
  });

  router.post('/students/:id/mentors', requireRole('principal','counselor'), (req, res) => {
    const { staff_id, role, start_date, notes } = req.body;
    if (!staff_id) return res.status(400).json({ error: 'staff_id 必填' });
    // Prevent duplicate active assignment for same student+staff
    const existing = db.get('SELECT id FROM mentor_assignments WHERE student_id=? AND staff_id=? AND end_date IS NULL', [req.params.id, staff_id]);
    if (existing) return res.status(409).json({ error: '该导师已分配且尚未结束，请先结束当前分配再重新指派' });
    const mid = uuidv4();
    db.run(`INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)`,
      [mid, req.params.id, staff_id, role, start_date||new Date().toISOString().split('T')[0], null, notes||'', new Date().toISOString()]);
    res.json({ id: mid });
  });

  router.delete('/students/:sid/mentors/:mid', requireRole('principal','counselor'), (req, res) => {
    db.run('UPDATE mentor_assignments SET end_date=? WHERE id=?', [new Date().toISOString().split('T')[0], req.params.mid]);
    res.json({ ok: true });
  });

  // ── 家长 ─────────────────────────────────────────────
  router.post('/students/:id/parents', requireRole('principal','counselor'), (req, res) => {
    const { name, relation, phone, email, wechat } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '家长姓名必填' });
    const student = db.get('SELECT id FROM students WHERE id=?', [req.params.id]);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const pid = uuidv4();
    try {
      db.transaction(runInTx => {
        runInTx(`INSERT INTO parent_guardians VALUES (?,?,?,?,?,?,?)`,
          [pid, name.trim(), relation||'', phone||'', email||'', wechat||'', new Date().toISOString()]);
        runInTx('INSERT INTO student_parents VALUES (?,?)', [req.params.id, pid]);
      });
      res.json({ id: pid });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
