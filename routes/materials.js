// ═══════════════════════════════════════════════════════
//  MATERIALS, PERSONAL STATEMENT, COMMUNICATIONS, FEEDBACK
// ═══════════════════════════════════════════════════════
module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, upload, fileStorage, moveUploadedFile, ALLOWED_EXTENSIONS, path, fs }) {
  const router = require('express').Router();

  function _getSetting(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? JSON.parse(r[0].values[0][0]) : fallback; } catch(e) { return fallback; }
  }

  // ── Materials CRUD ─────────────────────────────────────

  router.get('/students/:id/materials', requireAuth, (req, res) => {
    const u = req.session.user;
    const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    const materials = db.all('SELECT * FROM material_items WHERE student_id=? ORDER BY created_at DESC', [sid]);
    res.json(materials);
  });

  router.post('/students/:id/materials', requireRole('principal','counselor','mentor','intake_staff','student_admin'), (req, res) => {
    const { application_id, intake_case_id, material_type, title, notes, doc_tag, status } = req.body;
    const sid = req.params.id;
    const student = db.get('SELECT id FROM students WHERE id=?', [sid]);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    if (!material_type) return res.status(400).json({ error: 'material_type 必填' });
    if (application_id) {
      const app = db.get('SELECT id FROM applications WHERE id=? AND student_id=?', [application_id, sid]);
      if (!app) return res.status(400).json({ error: '申请记录不属于该学生' });
    }
    if (intake_case_id) {
      const ic = db.get('SELECT id FROM intake_cases WHERE id=? AND student_id=?', [intake_case_id, sid]);
      if (!ic) return res.status(400).json({ error: '入学案例不属于该学生' });
    }
    const mid = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO material_items (id,student_id,application_id,intake_case_id,material_type,title,status,version,file_path,notes,doc_tag,reviewed_by,reviewed_at,submitted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [mid, sid, application_id||null, intake_case_id||null, material_type, title||'', status||'未开始', 1, null, notes||'', doc_tag||null, null, null, null, now, now]);
    res.json({ id: mid });
  });

  router.put('/materials/:id', requireRole('principal','counselor','mentor','intake_staff'), (req, res) => {
    if (!db.get('SELECT id FROM material_items WHERE id=?', [req.params.id])) {
      return res.status(404).json({ error: '材料记录不存在' });
    }
    const { title, status, notes, reviewed_by, version } = req.body;
    const now = new Date().toISOString();
    const reviewed_at = reviewed_by ? now : null;
    const _materialStatuses = _getSetting('material_statuses', ['未提交','已提交','已审核','需补充']);
    const _submittedStatus = _materialStatuses[1] || '已提交';
    const submitted_at = status === _submittedStatus ? now : null;
    db.run(`UPDATE material_items SET title=?,status=?,notes=?,reviewed_by=?,reviewed_at=?,submitted_at=?,version=?,updated_at=? WHERE id=?`,
      [title, status, notes, reviewed_by||null, reviewed_at, submitted_at, version||1, now, req.params.id]);
    res.json({ ok: true });
  });

  router.post('/materials/:id/upload', requireRole('principal','counselor','mentor','intake_staff'), upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    moveUploadedFile(req.file.filename, 'material');
    db.run('UPDATE material_items SET file_path=?,updated_at=? WHERE id=?',
      [req.file.filename, new Date().toISOString(), req.params.id]);
    audit(req, 'UPLOAD', 'material_items', req.params.id, { filename: req.file.filename });
    res.json({ file: req.file.filename });
  });

  // ── 鉴权文件下载（替代原 /uploads 静态路由） ──────────
  router.get('/files/:filename', requireAuth, (req, res) => {
    const filename = path.basename(req.params.filename); // 防路径穿越
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) return res.status(403).json({ error: '不允许访问此类型文件' });

    // 验证该文件确实属于该用户有权访问的学生材料
    const material = db.get('SELECT mi.*, s.id as student_id FROM material_items mi JOIN students s ON s.id=mi.student_id WHERE mi.file_path=?', [filename]);
    if (!material) return res.status(404).json({ error: '文件不存在' });

    // 权限检查
    const u = req.session.user;
    if (['agent', 'student_admin'].includes(u.role)) {
      return res.status(403).json({ error: '无权访问此文件' });
    }
    if (u.role === 'student' && material.student_id !== u.linked_id) {
      return res.status(403).json({ error: '无权访问此文件' });
    }
    if (u.role === 'parent') {
      const sp = db.get('SELECT 1 FROM student_parents WHERE student_id=? AND parent_id=?', [material.student_id, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问此文件' });
    }
    if (u.role === 'mentor' || u.role === 'counselor') {
      const ma = db.get('SELECT 1 FROM mentor_assignments WHERE student_id=? AND staff_id=?', [material.student_id, u.linked_id]);
      if (!ma) return res.status(403).json({ error: '无权访问此文件' });
    }

    const filePath = fileStorage.getFilePath(filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });

    audit(req, 'DOWNLOAD', 'material_items', material.id, { filename });
    res.download(filePath, filename);
  });

  // ── 个人陈述 ──────────────────────────────────────────
  router.get('/students/:id/personal-statement', requireAuth, (req, res) => {
    const u = req.session.user;
    const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    const ps = db.all('SELECT * FROM personal_statements WHERE student_id=? ORDER BY version DESC', [sid]);
    res.json(ps);
  });

  router.post('/students/:id/personal-statement', requireAuth, (req, res) => {
    const u = req.session.user; const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') return res.status(403).json({ error: '无权操作' });
    const { application_id, content_json, q1_content, q2_content, q3_content } = req.body;
    const answers = Array.isArray(content_json) ? content_json : [q1_content||'', q2_content||'', q3_content||''];
    const c1 = answers[0]||'', c2 = answers[1]||'', c3 = answers[2]||'';
    const combined = answers.join('');
    const existing = db.get('SELECT MAX(version) as mv FROM personal_statements WHERE student_id=?', [req.params.id]);
    const version = (existing?.mv || 0) + 1;
    const id = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO personal_statements (id,student_id,application_id,version,status,q1_content,q2_content,q3_content,word_count,char_count,reviewer_id,review_notes,created_at,updated_at,content_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.params.id, application_id||null, version, '草稿', c1, c2, c3, combined.length, combined.length, null, '', now, now, JSON.stringify(answers)]);
    res.json({ id, version });
  });

  router.put('/personal-statements/:id', requireAuth, (req, res) => {
    const ps = db.get('SELECT student_id FROM personal_statements WHERE id=?', [req.params.id]);
    if (!ps) return res.status(404).json({ error: '个人陈述不存在' });
    const u = req.session.user;
    if (u.role === 'student' && u.linked_id !== ps.student_id) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') return res.status(403).json({ error: '无权操作' });
    const { content_json, q1_content, q2_content, q3_content, status, reviewer_id, review_notes } = req.body;
    const answers = Array.isArray(content_json) ? content_json : [q1_content||'', q2_content||'', q3_content||''];
    const combined = answers.join('');
    db.run(`UPDATE personal_statements SET q1_content=?,q2_content=?,q3_content=?,content_json=?,status=?,char_count=?,reviewer_id=?,review_notes=?,updated_at=? WHERE id=?`,
      [answers[0]||'', answers[1]||'', answers[2]||'', JSON.stringify(answers), status, combined.length, reviewer_id||null, review_notes||'', new Date().toISOString(), req.params.id]);
    res.json({ ok: true });
  });

  // ── Communications ────────────────────────────────────
  router.get('/students/:id/communications', requireAuth, (req, res) => {
    const u = req.session.user;
    const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    const logs = db.all(`
      SELECT cl.*, st.name as staff_name, pg.name as parent_name
      FROM communication_logs cl
      LEFT JOIN staff st ON st.id=cl.staff_id
      LEFT JOIN parent_guardians pg ON pg.id=cl.parent_id
      WHERE cl.student_id=? ORDER BY cl.comm_date DESC`, [sid]);
    res.json(logs);
  });

  router.post('/students/:id/communications', requireRole('principal','counselor','mentor','intake_staff'), (req, res) => {
    const { parent_id, channel, summary, action_items, comm_date } = req.body;
    const cid = uuidv4();
    const staff_id = ['counselor','mentor','principal'].includes(req.session.user.role) ? req.session.user.linked_id : null;
    db.run(`INSERT INTO communication_logs VALUES (?,?,?,?,?,?,?,?,?)`,
      [cid, req.params.id, staff_id, parent_id||null, channel, summary, action_items||'', comm_date||new Date().toISOString(), new Date().toISOString()]);
    res.json({ id: cid });
  });

  // ── Feedback ──────────────────────────────────────────
  router.get('/students/:id/feedback', requireAuth, (req, res) => {
    const u = req.session.user; const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    const rows = db.all('SELECT * FROM feedback WHERE student_id=? ORDER BY created_at DESC', [sid]);
    res.json(rows);
  });

  router.post('/students/:id/feedback', requireAuth, (req, res) => {
    const u = req.session.user; const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '只能为本人提交反馈' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权为该学生提交反馈' });
    }
    const { feedback_type, content, rating } = req.body;
    const fid = uuidv4();
    const from_role = req.session.user.role;
    const from_id = req.session.user.linked_id;
    db.run(`INSERT INTO feedback VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [fid, req.params.id, from_role, from_id, feedback_type, content, rating||null, 'pending', null, null, null, new Date().toISOString()]);
    res.json({ id: fid });
  });

  router.put('/feedback/:id', requireRole('principal','counselor'), (req, res) => {
    const { status, response } = req.body;
    db.run('UPDATE feedback SET status=?,response=?,responded_by=?,responded_at=? WHERE id=?',
      [status, response, req.session.user.id, new Date().toISOString(), req.params.id]);
    res.json({ ok: true });
  });

  router.get('/feedback', requireAuth, (req, res) => {
    const u = req.session.user;
    // principal 和 counselor 可查看全部待处理反馈
    if (u.role === 'principal' || u.role === 'counselor') {
      const rows = db.all(`
        SELECT f.*, s.name as student_name FROM feedback f
        JOIN students s ON s.id=f.student_id
        WHERE f.status='pending' ORDER BY f.created_at DESC LIMIT 50`);
      return res.json(rows);
    }
    // mentor 可查看自己提交的反馈
    if (u.role === 'mentor') {
      const rows = db.all(`
        SELECT f.*, s.name as student_name FROM feedback f
        JOIN students s ON s.id=f.student_id
        WHERE f.from_role='mentor' AND f.from_id=?
        ORDER BY f.created_at DESC LIMIT 50`, [u.linked_id]);
      return res.json(rows);
    }
    // student 可查看自己的反馈
    if (u.role === 'student') {
      const rows = db.all(`
        SELECT f.*, s.name as student_name FROM feedback f
        JOIN students s ON s.id=f.student_id
        WHERE f.student_id=?
        ORDER BY f.created_at DESC LIMIT 50`, [u.linked_id]);
      return res.json(rows);
    }
    // parent 可查看自己孩子的反馈
    if (u.role === 'parent') {
      const rows = db.all(`
        SELECT f.*, s.name as student_name FROM feedback f
        JOIN students s ON s.id=f.student_id
        WHERE f.student_id IN (SELECT student_id FROM student_parents WHERE parent_id=?)
        ORDER BY f.created_at DESC LIMIT 50`, [u.linked_id]);
      return res.json(rows);
    }
    // intake_staff 可查看自己提交的反馈
    if (u.role === 'intake_staff') {
      const rows = db.all(`
        SELECT f.*, s.name as student_name FROM feedback f
        JOIN students s ON s.id=f.student_id
        WHERE f.from_role='intake_staff' AND f.from_id=?
        ORDER BY f.created_at DESC LIMIT 50`, [u.linked_id]);
      return res.json(rows);
    }
    // 其他角色（student_admin, agent）无权限
    return res.status(403).json({ error: '权限不足' });
  });

  return router;
};
