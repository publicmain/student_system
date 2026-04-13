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
    // BUG-M3: material_type 白名单
    const validMaterialTypes = ['成绩单', '推荐信', '活动证明', '个人陈述', '语言成绩', '护照', '签证材料', '其他'];
    if (!validMaterialTypes.includes(material_type)) return res.status(400).json({ error: `材料类型必须为 ${validMaterialTypes.join('/')}` });
    // BUG-M5: 标题非空校验
    if (title !== undefined && title !== null && typeof title === 'string' && !title.trim()) return res.status(400).json({ error: '材料标题不能为空字符串' });
    // BUG-M4: status 白名单
    const validMaterialStatuses = ['未开始', '收集中', '已上传', '已审核', '已提交', '需补件'];
    if (status && !validMaterialStatuses.includes(status)) return res.status(400).json({ error: `材料状态必须为 ${validMaterialStatuses.join('/')}` });
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
    const existing = db.get('SELECT * FROM material_items WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: '材料记录不存在' });
    const { title, status, notes, reviewed_by, version } = req.body;
    // BUG-C2: 合并已有值，防止 undefined 覆盖
    const finalTitle = title !== undefined ? title : existing.title;
    const finalStatus = status !== undefined ? status : existing.status;
    const finalNotes = notes !== undefined ? notes : existing.notes;
    const finalVersion = version !== undefined ? version : existing.version;
    const finalReviewedBy = reviewed_by !== undefined ? reviewed_by : existing.reviewed_by;
    const now = new Date().toISOString();
    const reviewed_at = reviewed_by ? now : existing.reviewed_at;
    const submitted_at = finalStatus === '已提交' ? (existing.submitted_at || now) : existing.submitted_at;
    db.run(`UPDATE material_items SET title=?,status=?,notes=?,reviewed_by=?,reviewed_at=?,submitted_at=?,version=?,updated_at=? WHERE id=?`,
      [finalTitle, finalStatus, finalNotes, finalReviewedBy||null, reviewed_at, submitted_at, finalVersion||1, now, req.params.id]);
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
    // BUG-H5: 检查学生是否存在
    const student = db.get('SELECT id FROM students WHERE id=?', [sid]);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const { application_id, content_json, q1_content, q2_content, q3_content, status } = req.body;
    // BUG-H4: status 白名单校验
    const validPsStatuses = ['未开始', '草稿', '一审中', '需修改', '二审中', '定稿', '已提交'];
    const finalStatus = status && validPsStatuses.includes(status) ? status : '草稿';
    const answers = Array.isArray(content_json) ? content_json : [q1_content||'', q2_content||'', q3_content||''];
    const c1 = answers[0]||'', c2 = answers[1]||'', c3 = answers[2]||'';
    const combined = answers.join('');
    const existing = db.get('SELECT MAX(version) as mv FROM personal_statements WHERE student_id=?', [sid]);
    const version = (existing?.mv || 0) + 1;
    const id = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO personal_statements (id,student_id,application_id,version,status,q1_content,q2_content,q3_content,word_count,char_count,reviewer_id,review_notes,created_at,updated_at,content_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, sid, application_id||null, version, finalStatus, c1, c2, c3, combined.length, combined.length, null, '', now, now, JSON.stringify(answers)]);
    res.json({ id, version });
  });

  router.put('/personal-statements/:id', requireAuth, (req, res) => {
    const ps = db.get('SELECT * FROM personal_statements WHERE id=?', [req.params.id]);
    if (!ps) return res.status(404).json({ error: '个人陈述不存在' });
    const u = req.session.user;
    if (u.role === 'student' && u.linked_id !== ps.student_id) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') return res.status(403).json({ error: '无权操作' });
    const { content_json, q1_content, q2_content, q3_content, status, reviewer_id, review_notes } = req.body;
    // BUG-H4: status 白名单校验
    const validPsStatuses = ['未开始', '草稿', '一审中', '需修改', '二审中', '定稿', '已提交'];
    const finalStatus = status !== undefined ? status : ps.status;
    if (status !== undefined && !validPsStatuses.includes(status)) return res.status(400).json({ error: `状态必须为 ${validPsStatuses.join('/')}` });
    // BUG-C3: 合并已有值，只更新传入的字段
    const c1 = q1_content !== undefined ? q1_content : (content_json ? (content_json[0]||'') : ps.q1_content);
    const c2 = q2_content !== undefined ? q2_content : (content_json ? (content_json[1]||'') : ps.q2_content);
    const c3 = q3_content !== undefined ? q3_content : (content_json ? (content_json[2]||'') : ps.q3_content);
    const answers = [c1||'', c2||'', c3||''];
    const combined = answers.join('');
    const finalReviewNotes = review_notes !== undefined ? review_notes : ps.review_notes;
    const finalReviewerId = reviewer_id !== undefined ? reviewer_id : ps.reviewer_id;
    db.run(`UPDATE personal_statements SET q1_content=?,q2_content=?,q3_content=?,content_json=?,status=?,char_count=?,reviewer_id=?,review_notes=?,updated_at=? WHERE id=?`,
      [answers[0], answers[1], answers[2], JSON.stringify(answers), finalStatus, combined.length, finalReviewerId||null, finalReviewNotes||'', new Date().toISOString(), req.params.id]);
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
    const sid = req.params.id;
    // BUG-F3: 检查学生是否存在
    const student = db.get('SELECT id FROM students WHERE id=?', [sid]);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const { parent_id, channel, summary, follow_up, action_items, comm_date } = req.body;
    // BUG-F2: 摘要非空校验
    if (!summary || !summary.trim()) return res.status(400).json({ error: '沟通摘要不能为空' });
    if (summary.length > 5000) return res.status(400).json({ error: '沟通摘要不能超过5000字符' });
    // V3: channel 白名单校验
    const validChannels = ['微信', '邮件', '电话', '面谈'];
    if (!channel || !validChannels.includes(channel)) return res.status(400).json({ error: `沟通渠道必须为 ${validChannels.join('/')}` });
    // V4: comm_date 格式校验
    if (comm_date && comm_date !== '') {
      const d = new Date(comm_date);
      if (isNaN(d.getTime())) return res.status(400).json({ error: '沟通日期格式无效' });
    }
    const cid = uuidv4();
    const staff_id = ['counselor','mentor','principal','intake_staff'].includes(req.session.user.role) ? req.session.user.linked_id : null;
    const items = action_items || follow_up || '';
    db.run(`INSERT INTO communication_logs VALUES (?,?,?,?,?,?,?,?,?)`,
      [cid, sid, staff_id, parent_id||null, channel, summary.trim(), items, comm_date||new Date().toISOString(), new Date().toISOString()]);
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
    // BUG-F3: 检查学生是否存在
    const student = db.get('SELECT id FROM students WHERE id=?', [sid]);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const { feedback_type, content, rating } = req.body;
    // BUG-F1: 反馈内容非空校验
    if (!content || !content.trim()) return res.status(400).json({ error: '反馈内容不能为空' });
    // V5: 内容长度限制
    if (content.length > 5000) return res.status(400).json({ error: '反馈内容不能超过5000字符' });
    // V2: feedback_type 白名单校验
    const validTypes = ['疑问', '建议', '满意度', '投诉', '阶段反馈'];
    if (!feedback_type || !validTypes.includes(feedback_type)) return res.status(400).json({ error: `反馈类型必须为 ${validTypes.join('/')}` });
    // V1: rating 校验
    if (rating != null && rating !== '') {
      const r = Number(rating);
      if (!Number.isInteger(r) || r < 1 || r > 5) return res.status(400).json({ error: '评分必须为1-5的整数' });
    }
    const fid = uuidv4();
    const from_role = req.session.user.role;
    const from_id = req.session.user.linked_id;
    const safeRating = (rating != null && rating !== '') ? Number(rating) : null;
    db.run(`INSERT INTO feedback VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [fid, sid, from_role, from_id, feedback_type, content.trim(), safeRating, 'pending', null, null, null, new Date().toISOString()]);
    res.json({ id: fid });
  });

  router.put('/feedback/:id', requireRole('principal','counselor'), (req, res) => {
    const { status, response } = req.body;
    // BUG-S2: status 白名单校验
    const validStatuses = ['pending', 'reviewed', 'resolved'];
    if (!status || !validStatuses.includes(status)) return res.status(400).json({ error: `status 必须为 ${validStatuses.join('/')}` });
    // BUG-S1/S3: response 非空校验
    if (!response || !response.trim()) return res.status(400).json({ error: '回复内容不能为空' });
    const existing = db.get('SELECT id FROM feedback WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: '反馈不存在' });
    db.run('UPDATE feedback SET status=?,response=?,responded_by=?,responded_at=? WHERE id=?',
      [status, response.trim(), req.session.user.id, new Date().toISOString(), req.params.id]);
    res.json({ ok: true });
  });

  // BUG-F9: 删除反馈
  router.delete('/feedback/:id', requireRole('principal','counselor'), (req, res) => {
    const existing = db.get('SELECT id FROM feedback WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: '反馈不存在' });
    db.run('DELETE FROM feedback WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  });

  // BUG-F9: 删除沟通记录
  router.delete('/students/:id/communications/:commId', requireRole('principal','counselor'), (req, res) => {
    const existing = db.get('SELECT id FROM communication_logs WHERE id=? AND student_id=?', [req.params.commId, req.params.id]);
    if (!existing) return res.status(404).json({ error: '沟通记录不存在' });
    db.run('DELETE FROM communication_logs WHERE id=?', [req.params.commId]);
    res.json({ ok: true });
  });

  router.get('/feedback', requireAuth, (req, res) => {
    const u = req.session.user;
    // BUG-F6: 支持 ?status= 过滤，默认返回全部
    const statusFilter = req.query.status;
    const statusClause = statusFilter && statusFilter !== 'all' ? "AND f.status='" + statusFilter.replace(/'/g, '') + "'" : '';
    // principal 和 counselor 可查看全部反馈
    if (u.role === 'principal' || u.role === 'counselor') {
      const rows = db.all(`
        SELECT f.*, s.name as student_name FROM feedback f
        JOIN students s ON s.id=f.student_id
        WHERE 1=1 ${statusClause} ORDER BY f.created_at DESC LIMIT 100`);
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

  // POST /feedback — 根级反馈提交（需body含student_id）
  router.post('/feedback', requireAuth, requireRole('principal','counselor'), (req, res) => {
    const { student_id, feedback_type, content, rating } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id 必填' });
    // BUG-F3: 检查学生是否存在
    const student = db.get('SELECT id FROM students WHERE id=?', [student_id]);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    if (!content || !content.trim()) return res.status(400).json({ error: '反馈内容不能为空' });
    if (content.length > 5000) return res.status(400).json({ error: '反馈内容不能超过5000字符' });
    const validTypes = ['疑问', '建议', '满意度', '投诉', '阶段反馈'];
    if (!feedback_type || !validTypes.includes(feedback_type)) return res.status(400).json({ error: `反馈类型必须为 ${validTypes.join('/')}` });
    if (rating != null && rating !== '') {
      const r = Number(rating);
      if (!Number.isInteger(r) || r < 1 || r > 5) return res.status(400).json({ error: '评分必须为1-5的整数' });
    }
    const u = req.session.user;
    const fid = uuidv4();
    const safeRating = (rating != null && rating !== '') ? Number(rating) : null;
    db.run(`INSERT INTO feedback VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [fid, student_id, u.role, u.linked_id, feedback_type, content.trim(), safeRating, 'pending', null, null, null, new Date().toISOString()]);
    res.json({ id: fid });
  });

  // GET /personal-statement — 列出当前用户可见的所有个人陈述
  router.get('/personal-statement', requireAuth, requireRole('principal','counselor'), (req, res) => {
    const u = req.session.user;
    let where = [], params = [];
    if (u.role === 'student') {
      where.push('ps.student_id=?'); params.push(u.linked_id);
    } else if (u.role === 'parent') {
      where.push('ps.student_id IN (SELECT student_id FROM student_parents WHERE parent_id=?)'); params.push(u.linked_id);
    } else if (u.role === 'mentor' || u.role === 'counselor') {
      where.push('ps.student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)'); params.push(u.linked_id);
    } else if (!['principal'].includes(u.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    const wStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.all(`SELECT ps.*, s.name as student_name FROM personal_statements ps JOIN students s ON s.id=ps.student_id ${wStr} ORDER BY ps.updated_at DESC`, params);
    res.json(rows);
  });

  // GET /calendar — 聚合日历事件（任务截止日+申请截止日+锚点事件）
  router.get('/calendar', requireAuth, requireRole('principal','counselor','mentor','parent','student'), (req, res) => {
    const u = req.session.user;
    let studentFilter = '', params = [];
    if (u.role === 'student') {
      studentFilter = 'AND student_id=?'; params.push(u.linked_id);
    } else if (u.role === 'parent') {
      studentFilter = 'AND student_id IN (SELECT student_id FROM student_parents WHERE parent_id=?)'; params.push(u.linked_id);
    } else if (u.role === 'mentor' || u.role === 'counselor') {
      studentFilter = 'AND student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)'; params.push(u.linked_id);
    } else if (!['principal'].includes(u.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    // Tasks with due dates
    const tasks = db.all(`SELECT id, title, due_date as date, category, status, student_id, 'task' as event_type FROM milestone_tasks WHERE due_date IS NOT NULL ${studentFilter} ORDER BY due_date`, params);
    // Application deadlines
    const deadlines = db.all(`SELECT id, uni_name as title, submit_deadline as date, status, student_id, 'deadline' as event_type FROM applications WHERE submit_deadline IS NOT NULL ${studentFilter} ORDER BY submit_deadline`, params);
    // Anchor events (global, no student filter)
    const anchors = db.all(`SELECT id, name as title, event_date as date, event_type, notes as description, 'anchor' as source_type FROM calendar_anchor_events ORDER BY event_date`);
    res.json({ tasks, deadlines, anchors });
  });

  return router;
};
