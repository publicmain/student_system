/**
 * routes/students.js — 学生CRUD及子资源（评估/选科/目标院校/导师/家长）
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole }) {
  const router = express.Router();

  function _getSetting(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? JSON.parse(r[0].values[0][0]) : fallback; } catch(e) { return fallback; }
  }
  function _getSettingRaw(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? r[0].values[0][0] : fallback; } catch(e) { return fallback; }
  }

  function _getValidGradeLevels() { return _getSetting('valid_grade_levels', ['G9','G10','G11','G12','G13','Year 9','Year 10','Year 11','Year 12','Year 13','9','10','11','12','13','其他']); }
  function _getValidStudentStatuses() { return _getSetting('valid_student_statuses', ['active','inactive','graduated','deleted']); }
  function _getStudentNameMaxLength() { return parseInt(_getSettingRaw('student_name_max_length', '200')); }
  function _getGradeRankMap() { return _getSetting('grade_rank_map', { 'A*': 100, 'A': 90, 'B': 75, 'C': 60, 'D': 45, 'E': 30, 'U': 10 }); }
  function _getImpactWeightMap() { return _getSetting('impact_weight_map', { international: 100, national: 80, province: 60, city: 40, school: 20 }); }
  function _getCompetitivenessWeights() { return _getSetting('competitiveness_weights', { academic: 0.3, language: 0.25, activities: 0.2, awards: 0.1, leadership: 0.15 }); }
  function _getLeadershipScorePerItem() { return parseInt(_getSettingRaw('leadership_score_per_item', '25')); }

  router.get('/students', requireAuth, (req, res) => {
    const { grade, exam_board, search } = req.query;
    let where = ['s.status="active"'];
    let params = [];

    // agent 和 student_admin 不应通过主 API 访问学生列表
    if (req.session.user.role === 'agent') return res.status(403).json({ error: '权限不足，请使用代理门户' });
    if (req.session.user.role === 'student_admin') return res.status(403).json({ error: '权限不足' });

    // 学生只能看自己
    if (req.session.user.role === 'student') {
      where.push('s.id=?'); params.push(req.session.user.linked_id);
    }
    // 导师只看自己负责的学生
    if (req.session.user.role === 'mentor') {
      where.push('s.id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)');
      params.push(req.session.user.linked_id);
    }
    // 规划师只看自己负责的学生
    if (req.session.user.role === 'counselor') {
      where.push('s.id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)');
      params.push(req.session.user.linked_id);
    }
    // 家长只看自己关联的学生
    if (req.session.user.role === 'parent') {
      where.push('s.id IN (SELECT student_id FROM student_parents WHERE parent_id=?)');
      params.push(req.session.user.linked_id);
    }
    // 招生人员只看自己负责的入学案例关联的学生
    if (req.session.user.role === 'intake_staff') {
      where.push('(s.id IN (SELECT student_id FROM intake_cases WHERE case_owner_staff_id=? AND student_id IS NOT NULL))');
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
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > _getStudentNameMaxLength()) return res.status(400).json({ error: '学生姓名格式不合法' });
    if (!_getValidGradeLevels().includes(grade_level)) return res.status(400).json({ error: `年级必须是以下之一: ${_getValidGradeLevels().join(', ')}` });
    const id = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO students (id,name,grade_level,enrol_date,exam_board,status,notes,created_at,updated_at,date_of_birth,agent_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, name.trim(), grade_level, enrol_date||null, exam_board||null, 'active', notes||'', now, now, date_of_birth||null, agent_id||null]);
    audit(req, 'CREATE', 'students', id, { name });
    res.json({ id });
  });

  router.get('/students/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const student = db.get('SELECT * FROM students WHERE id=?', [id]);
    if (!student || student.status === 'deleted') return res.status(404).json({ error: '学生不存在' });

    // 权限检查
    const _u = req.session.user;
    // agent 和 student_admin 不应通过主 API 查看学生详情
    if (_u.role === 'agent') return res.status(403).json({ error: '权限不足，请使用代理门户' });
    if (_u.role === 'student_admin') return res.status(403).json({ error: '权限不足' });
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
    // intake_staff 只能查看自己为 case_owner 的学生
    if (_u.role === 'intake_staff') {
      const owned = db.get('SELECT 1 FROM intake_cases WHERE student_id=? AND case_owner_staff_id=?', [id, _u.linked_id]);
      if (!owned) return res.status(403).json({ error: '无权访问' });
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
    const { name, grade_level, enrol_date, exam_board, notes, status, date_of_birth, agent_id, _partial, _expected_updated_at } = req.body;
    if (_partial) {
      // 局部更新：仅更新传入的非 undefined 字段
      if (agent_id !== undefined) {
        db.run(`UPDATE students SET agent_id=?, updated_at=? WHERE id=?`, [agent_id||null, new Date().toISOString(), id]);
      }
      audit(req, 'UPDATE', 'students', id, { agent_id });
      return res.json({ ok: true });
    }
    const _maxLen = _getStudentNameMaxLength();
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > _maxLen) {
      return res.status(400).json({ error: `学生姓名不能为空且不超过${_maxLen}字符` });
    }
    if (grade_level && !_getValidGradeLevels().includes(grade_level)) {
      return res.status(400).json({ error: `年级必须是以下之一: ${_getValidGradeLevels().join(', ')}` });
    }
    const VALID_STATUS = _getValidStudentStatuses();
    if (status && !VALID_STATUS.includes(status)) {
      return res.status(400).json({ error: `状态必须是以下之一: ${VALID_STATUS.join(', ')}` });
    }
    // 乐观锁：如果客户端传了 _expected_updated_at，检查是否与数据库一致
    if (_expected_updated_at) {
      const current = db.get('SELECT updated_at FROM students WHERE id=?', [id]);
      if (current && current.updated_at !== _expected_updated_at) {
        return res.status(409).json({ error: '数据已被其他用户修改，请刷新后重试', current_updated_at: current.updated_at });
      }
    }
    const now = new Date().toISOString();
    db.run(`UPDATE students SET name=?,grade_level=?,enrol_date=?,exam_board=?,notes=?,status=?,updated_at=?,date_of_birth=?,agent_id=? WHERE id=?`,
      [name.trim(), grade_level, enrol_date, exam_board, notes, status||'active', now, date_of_birth||null, agent_id||null, id]);
    audit(req, 'UPDATE', 'students', id, { name });
    res.json({ ok: true, updated_at: now });
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
    const { assess_date, assess_type, subject, score, max_score, percentile, notes, sub_scores, target_score, next_test_date, next_target_score } = req.body;
    if (!assess_date || !assess_type) return res.status(400).json({ error: '评估日期和类型必填' });
    const student = db.get('SELECT id FROM students WHERE id=?', [req.params.id]);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const aid = uuidv4();
    db.run(`INSERT INTO admission_assessments (id, student_id, assess_date, assess_type, subject, score, max_score, percentile, notes, created_at, sub_scores, target_score, next_test_date, next_target_score) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [aid, req.params.id, assess_date, assess_type, subject, score, max_score||100, percentile||null, notes||'', new Date().toISOString(), sub_scores ? (typeof sub_scores === 'string' ? sub_scores : JSON.stringify(sub_scores)) : null, target_score||null, next_test_date||null, next_target_score||null]);
    audit(req, 'CREATE', 'admission_assessments', aid, { assess_type, subject, student_id: req.params.id });
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

  // ═══════════════════════════════════════════════════════════════════
  //  学生扩展画像 (profile-ext) + 奖项 (awards) + 竞争力 + 趋势
  // ═══════════════════════════════════════════════════════════════════

  // 权限检查辅助
  function _checkStudentAccess(req, sid) {
    const u = req.session.user;
    if (u.role === 'student' && u.linked_id !== sid) return '无权访问';
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return '无权访问';
    }
    return null;
  }

  // ── GET /students/:id/profile-ext ──
  router.get('/students/:id/profile-ext', requireAuth, (req, res) => {
    const err = _checkStudentAccess(req, req.params.id);
    if (err) return res.status(403).json({ error: err });
    const profile = db.get('SELECT * FROM student_profiles_ext WHERE student_id=?', [req.params.id]);
    res.json(profile || { student_id: req.params.id });
  });

  // ── PUT /students/:id/profile-ext ──
  router.put('/students/:id/profile-ext', requireAuth, requireRole('principal','counselor','mentor'), (req, res) => {
    const sid = req.params.id;
    const { mbti, holland_code, academic_interests, career_goals, major_preferences, strengths, weaknesses, notes, _expected_updated_at } = req.body;
    const existing = db.get('SELECT id, updated_at FROM student_profiles_ext WHERE student_id=?', [sid]);
    // 乐观锁
    if (_expected_updated_at && existing && existing.updated_at && existing.updated_at !== _expected_updated_at) {
      return res.status(409).json({ error: '数据已被其他用户修改，请刷新后重试', current_updated_at: existing.updated_at });
    }
    if (existing) {
      db.run(`UPDATE student_profiles_ext SET mbti=?, holland_code=?, academic_interests=?, career_goals=?, major_preferences=?, strengths=?, weaknesses=?, notes=?, updated_at=datetime('now') WHERE student_id=?`,
        [mbti||null, holland_code||null, JSON.stringify(academic_interests||[]), career_goals||null, JSON.stringify(major_preferences||[]), JSON.stringify(strengths||[]), JSON.stringify(weaknesses||[]), notes||null, sid]);
      audit(req, 'UPDATE', 'student_profiles_ext', existing.id, { mbti, holland_code });
      res.json({ ok: true, id: existing.id });
    } else {
      const id = uuidv4();
      db.run(`INSERT INTO student_profiles_ext (id, student_id, mbti, holland_code, academic_interests, career_goals, major_preferences, strengths, weaknesses, notes) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, sid, mbti||null, holland_code||null, JSON.stringify(academic_interests||[]), career_goals||null, JSON.stringify(major_preferences||[]), JSON.stringify(strengths||[]), JSON.stringify(weaknesses||[]), notes||null]);
      audit(req, 'CREATE', 'student_profiles_ext', id, { student_id: sid });
      res.json({ ok: true, id });
    }
  });

  // ── GET /students/:id/awards ──
  router.get('/students/:id/awards', requireAuth, (req, res) => {
    const err = _checkStudentAccess(req, req.params.id);
    if (err) return res.status(403).json({ error: err });
    res.json(db.all('SELECT * FROM student_awards WHERE student_id=? ORDER BY sort_order, award_date DESC', [req.params.id]));
  });

  // ── POST /students/:id/awards ──
  router.post('/students/:id/awards', requireAuth, requireRole('principal','counselor','mentor'), (req, res) => {
    const { name, category, level, award_date, description, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '奖项名称必填' });
    const id = uuidv4();
    db.run(`INSERT INTO student_awards (id, student_id, name, category, level, award_date, description, sort_order) VALUES (?,?,?,?,?,?,?,?)`,
      [id, req.params.id, name.trim(), category||null, level||null, award_date||null, description||null, sort_order||0]);
    audit(req, 'CREATE', 'student_awards', id, { name, student_id: req.params.id });
    res.json({ id });
  });

  // ── PUT /awards/:id ──
  router.put('/awards/:id', requireAuth, requireRole('principal','counselor','mentor'), (req, res) => {
    const award = db.get('SELECT * FROM student_awards WHERE id=?', [req.params.id]);
    if (!award) return res.status(404).json({ error: '奖项不存在' });
    const { name, category, level, award_date, description, sort_order } = req.body;
    db.run(`UPDATE student_awards SET name=?, category=?, level=?, award_date=?, description=?, sort_order=?, updated_at=datetime('now') WHERE id=?`,
      [name||award.name, category??award.category, level??award.level, award_date??award.award_date, description??award.description, sort_order??award.sort_order, req.params.id]);
    audit(req, 'UPDATE', 'student_awards', req.params.id, { name });
    res.json({ ok: true });
  });

  // ── DELETE /awards/:id ──
  router.delete('/awards/:id', requireAuth, requireRole('principal','counselor'), (req, res) => {
    const award = db.get('SELECT * FROM student_awards WHERE id=?', [req.params.id]);
    if (!award) return res.status(404).json({ error: '奖项不存在' });
    db.run('DELETE FROM student_awards WHERE id=?', [req.params.id]);
    audit(req, 'DELETE', 'student_awards', req.params.id, { name: award.name });
    res.json({ ok: true });
  });

  // ── GET /students/:id/competitiveness ──
  router.get('/students/:id/competitiveness', requireAuth, (req, res) => {
    const err = _checkStudentAccess(req, req.params.id);
    if (err) return res.status(403).json({ error: err });
    const sid = req.params.id;

    // 学术: 基于 exam_sittings 的预估/实际成绩
    const exams = db.all('SELECT predicted_grade, actual_grade FROM exam_sittings WHERE student_id=?', [sid]);
    const gradeRank = _getGradeRankMap();
    let academicScore = 0;
    if (exams.length) {
      const grades = exams.map(e => gradeRank[(e.actual_grade || e.predicted_grade || '').toUpperCase()] || 0);
      academicScore = Math.round(grades.reduce((a,b)=>a+b,0) / grades.length);
    }

    // 标化: 基于 admission_assessments
    const assessments = db.all('SELECT score, max_score FROM admission_assessments WHERE student_id=?', [sid]);
    let testScore = 0;
    if (assessments.length) {
      const pcts = assessments.filter(a => a.max_score > 0).map(a => (a.score / a.max_score) * 100);
      testScore = pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0) / pcts.length) : 0;
    }

    // 活动: 数量 + 影响力
    const activities = db.all('SELECT impact_level FROM student_activities WHERE student_id=?', [sid]);
    const impactWeight = _getImpactWeightMap();
    let activityScore = 0;
    if (activities.length) {
      const impactScores = activities.map(a => impactWeight[a.impact_level] || 20);
      activityScore = Math.min(100, Math.round(impactScores.reduce((a,b)=>a+b,0) / Math.max(activities.length, 1) * (Math.min(activities.length, 10) / 10)));
    }

    // 领导力: 有 leadership 角色的活动
    const leadership = db.all("SELECT id FROM student_activities WHERE student_id=? AND (category='club_leadership' OR role LIKE '%leader%' OR role LIKE '%president%' OR role LIKE '%captain%' OR role LIKE '%founder%' OR role LIKE '%主席%' OR role LIKE '%社长%' OR role LIKE '%队长%' OR role LIKE '%创始%')", [sid]);
    const leadershipScore = Math.min(100, leadership.length * _getLeadershipScorePerItem());

    // 文书: 基于 essays 的完成率
    const essays = db.all('SELECT status FROM essays WHERE student_id=?', [sid]);
    const essayDone = essays.filter(e => ['final','submitted'].includes(e.status)).length;
    const essayScore = essays.length ? Math.round((essayDone / essays.length) * 100) : 0;

    const cw = _getCompetitivenessWeights();
    const overall = Math.round((academicScore * (cw.academic||0.3) + testScore * (cw.language||0.25) + activityScore * (cw.activities||0.2) + leadershipScore * (cw.awards||0.1) + essayScore * (cw.leadership||0.15)));

    res.json({
      academics: academicScore,
      tests: testScore,
      activities: activityScore,
      leadership: leadershipScore,
      essays: essayScore,
      overall,
      detail: { exam_count: exams.length, assessment_count: assessments.length, activity_count: activities.length, leadership_count: leadership.length, essay_count: essays.length, essay_done: essayDone }
    });
  });

  // ── GET /students/:id/grade-trends ──
  router.get('/students/:id/grade-trends', requireAuth, (req, res) => {
    const err = _checkStudentAccess(req, req.params.id);
    if (err) return res.status(403).json({ error: err });
    const rows = db.all('SELECT subject, series, year, predicted_grade, actual_grade, ums_score FROM exam_sittings WHERE student_id=? ORDER BY year, series', [req.params.id]);
    res.json(rows);
  });

  return router;
};
