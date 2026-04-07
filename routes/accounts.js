/**
 * routes/accounts.js — 账号管理（学生/家长账号创建、全局账号列表、密码重置、停用）
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, bcrypt, BCRYPT_COST }) {
  const router = express.Router();

  // ── GET /api/accounts — 账号列表（principal only）──
  router.get('/accounts', requireRole('principal'), (req, res) => {
    const users = db.all(`
      SELECT u.id, u.username, u.role, u.linked_id, u.name, u.created_at, u.must_change_password,
        COALESCE(u.status, 'active') as status
      FROM users u
      ORDER BY u.created_at DESC
    `);
    // Enrich with linked entity info
    const enriched = users.map(u => {
      const info = { ...u };
      if (u.role === 'student' && u.linked_id) {
        const s = db.get('SELECT name, exam_board FROM students WHERE id=?', [u.linked_id]);
        if (s) { info.linked_name = s.name; info.linked_detail = s.exam_board || ''; }
      } else if (u.role === 'parent' && u.linked_id) {
        const p = db.get('SELECT name, relation FROM parent_guardians WHERE id=?', [u.linked_id]);
        if (p) { info.linked_name = p.name; info.linked_detail = p.relation; }
        // Find linked students
        const students = db.all('SELECT s.name FROM student_parents sp JOIN students s ON s.id=sp.student_id WHERE sp.parent_id=?', [u.linked_id]);
        if (students.length) info.linked_students = students.map(s => s.name).join(', ');
      } else if (['counselor','mentor','principal','intake_staff','student_admin'].includes(u.role) && u.linked_id) {
        const st = db.get('SELECT name, role FROM staff WHERE id=?', [u.linked_id]);
        if (st) { info.linked_name = st.name; info.linked_detail = st.role; }
      }
      return info;
    });
    res.json(enriched);
  });

  // ── POST /api/accounts/student — 为学生创建账号 ──
  router.post('/accounts/student', requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { student_id, username } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id 必填' });

    const student = db.get('SELECT * FROM students WHERE id=?', [student_id]);
    if (!student) return res.status(404).json({ error: '学生不存在' });

    // Check if already has account
    const existing = db.get('SELECT id, username FROM users WHERE linked_id=? AND role="student"', [student_id]);
    if (existing) return res.status(409).json({ error: `该学生已有账号: ${existing.username}` });

    const uname = username || `stu_${student.name.replace(/\s/g, '')}_${Date.now()}`.substring(0, 20);
    // Check username uniqueness
    if (db.get('SELECT id FROM users WHERE username=?', [uname])) {
      return res.status(409).json({ error: `用户名 "${uname}" 已被占用` });
    }

    const pw = bcrypt.hashSync('123456', BCRYPT_COST);
    const uid = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO users (id,username,password,role,linked_id,name,created_at,must_change_password) VALUES (?,?,?,?,?,?,?,0)`,
      [uid, uname, pw, 'student', student_id, student.name, now]);

    audit(req, 'CREATE_ACCOUNT', 'users', uid, { role: 'student', student_id, username: uname });
    res.json({ id: uid, username: uname, default_password: '123456' });
  });

  // ── POST /api/accounts/parent — 为家长创建账号 ──
  router.post('/accounts/parent', requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { parent_id, username } = req.body;
    if (!parent_id) return res.status(400).json({ error: 'parent_id 必填' });

    const parent = db.get('SELECT * FROM parent_guardians WHERE id=?', [parent_id]);
    if (!parent) return res.status(404).json({ error: '家长不存在' });

    // Check if already has account
    const existing = db.get('SELECT id, username FROM users WHERE linked_id=? AND role="parent"', [parent_id]);
    if (existing) return res.status(409).json({ error: `该家长已有账号: ${existing.username}` });

    const uname = username || `par_${parent.name.replace(/\s/g, '')}_${Date.now()}`.substring(0, 20);
    if (db.get('SELECT id FROM users WHERE username=?', [uname])) {
      return res.status(409).json({ error: `用户名 "${uname}" 已被占用` });
    }

    const pw = bcrypt.hashSync('123456', BCRYPT_COST);
    const uid = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO users (id,username,password,role,linked_id,name,created_at,must_change_password) VALUES (?,?,?,?,?,?,?,0)`,
      [uid, uname, pw, 'parent', parent_id, parent.name, now]);

    audit(req, 'CREATE_ACCOUNT', 'users', uid, { role: 'parent', parent_id, username: uname });
    res.json({ id: uid, username: uname, default_password: '123456' });
  });

  // ── POST /api/accounts/:id/reset-password — 重置任意账号密码 ──
  router.post('/accounts/:id/reset-password', requireRole('principal'), (req, res) => {
    const user = db.get('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!user) return res.status(404).json({ error: '账号不存在' });

    const pw = bcrypt.hashSync('123456', BCRYPT_COST);
    db.run('UPDATE users SET password=?, must_change_password=0 WHERE id=?', [pw, user.id]);

    audit(req, 'RESET_PASSWORD', 'users', user.id, { username: user.username, role: user.role });
    res.json({ username: user.username, new_password: '123456' });
  });

  // ── PUT /api/accounts/:id/status — 停用/启用账号 ──
  router.put('/accounts/:id/status', requireRole('principal'), (req, res) => {
    const { status } = req.body; // 'active' or 'disabled'
    if (!['active', 'disabled'].includes(status)) return res.status(400).json({ error: '状态只能是 active 或 disabled' });

    const user = db.get('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!user) return res.status(404).json({ error: '账号不存在' });

    // Don't allow disabling own account
    if (user.id === req.session.user.id) return res.status(400).json({ error: '不能停用自己的账号' });

    db.run('UPDATE users SET status=? WHERE id=?', [status, user.id]);

    // If disabling, destroy all their sessions
    if (status === 'disabled') {
      try {
        const allSessions = db.all('SELECT sid, sess FROM sessions');
        for (const s of allSessions) {
          try { const d = JSON.parse(s.sess); if (d.user?.id === user.id) db.run('DELETE FROM sessions WHERE sid=?', [s.sid]); } catch(e) {}
        }
      } catch(e) {}
    }

    audit(req, status === 'disabled' ? 'DISABLE_ACCOUNT' : 'ENABLE_ACCOUNT', 'users', user.id, { username: user.username });
    res.json({ ok: true });
  });

  // ── DELETE /api/accounts/:id — 删除账号 ──
  router.delete('/accounts/:id', requireRole('principal'), (req, res) => {
    const user = db.get('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!user) return res.status(404).json({ error: '账号不存在' });
    if (user.id === req.session.user.id) return res.status(400).json({ error: '不能删除自己的账号' });

    db.run('DELETE FROM users WHERE id=?', [user.id]);
    // Clean up sessions
    try {
      const allSessions = db.all('SELECT sid, sess FROM sessions');
      for (const s of allSessions) {
        try { const d = JSON.parse(s.sess); if (d.user?.id === user.id) db.run('DELETE FROM sessions WHERE sid=?', [s.sid]); } catch(e) {}
      }
    } catch(e) {}

    audit(req, 'DELETE_ACCOUNT', 'users', user.id, { username: user.username, role: user.role });
    res.json({ ok: true });
  });

  // ── GET /api/accounts/student/:studentId — 查询学生的账号状态 ──
  router.get('/accounts/student/:studentId', requireRole('principal','counselor','intake_staff'), (req, res) => {
    const user = db.get('SELECT id, username, created_at, COALESCE(status,"active") as status FROM users WHERE linked_id=? AND role="student"', [req.params.studentId]);
    res.json(user || null);
  });

  // ── GET /api/accounts/parent/:parentId — 查询家长的账号状态 ──
  router.get('/accounts/parent/:parentId', requireRole('principal','counselor','intake_staff'), (req, res) => {
    const user = db.get('SELECT id, username, created_at, COALESCE(status,"active") as status FROM users WHERE linked_id=? AND role="parent"', [req.params.parentId]);
    res.json(user || null);
  });

  return router;
};
