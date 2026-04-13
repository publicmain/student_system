// ═══════════════════════════════════════════════════════
//  MILESTONE TASKS
// ═══════════════════════════════════════════════════════
module.exports = function({ db, uuidv4, requireAuth, requireRole }) {
  const router = require('express').Router();

  router.get('/students/:id/tasks', requireAuth, (req, res) => {
    const u = req.session.user;
    const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    const tasks = db.all('SELECT * FROM milestone_tasks WHERE student_id=? ORDER BY due_date', [sid]);
    res.json(tasks);
  });

  router.post('/students/:id/tasks', requireRole('principal','counselor','mentor','intake_staff'), (req, res) => {
    const { application_id, title, description, category, due_date, priority, assigned_to, status } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: '任务标题必填' });
    const student = db.get('SELECT id FROM students WHERE id=?', [req.params.id]);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    // BUG-H1: status 白名单
    const validStatuses = ['pending', 'in_progress', 'done', 'overdue'];
    if (status && !validStatuses.includes(status)) return res.status(400).json({ error: `任务状态必须为 ${validStatuses.join('/')}` });
    // BUG-H2: priority 白名单
    const validPriorities = ['high', 'normal', 'low'];
    if (priority && !validPriorities.includes(priority)) return res.status(400).json({ error: `优先级必须为 ${validPriorities.join('/')}` });
    // BUG-M1: category 白名单
    const validCategories = ['材料', '考试', '申请', '面试', '沟通', '其他'];
    if (category && !validCategories.includes(category)) return res.status(400).json({ error: `分类必须为 ${validCategories.join('/')}` });
    // BUG-M2: due_date 格式校验
    if (due_date && isNaN(new Date(due_date).getTime())) return res.status(400).json({ error: '截止日期格式无效' });
    // BUG-M6: application_id 存在性校验
    if (application_id) {
      const app = db.get('SELECT id FROM applications WHERE id=?', [application_id]);
      if (!app) return res.status(400).json({ error: '关联的申请记录不存在' });
    }
    const tid = uuidv4();
    const now = new Date().toISOString();
    const finalStatus = status || 'pending';
    const completed_at = finalStatus === 'done' ? now : null;
    db.run(`INSERT INTO milestone_tasks (id,student_id,application_id,title,description,category,due_date,completed_at,status,priority,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [tid, req.params.id, application_id||null, title.trim(), description||'', category||'其他', due_date||null, completed_at, finalStatus, priority||'normal', assigned_to||null, now, now]);
    res.json({ id: tid });
  });

  router.get('/tasks/:id', requireAuth, (req, res) => {
    const task = db.get('SELECT * FROM milestone_tasks WHERE id=?', [req.params.id]);
    if (!task) return res.status(404).json({ error: '任务不存在' });
    const u = req.session.user;
    if (u.role === 'student' && task.student_id && u.linked_id !== task.student_id) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent' && task.student_id) {
      const sp = db.get('SELECT 1 FROM student_parents WHERE student_id=? AND parent_id=?', [task.student_id, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    // 关联学生信息
    const student = task.student_id ? db.get('SELECT id, name, grade_level, exam_board FROM students WHERE id=?', [task.student_id]) : null;
    // 关联入学案例
    const intakeCase = task.intake_case_id ? db.get('SELECT id, program_name, intake_year, status FROM intake_cases WHERE id=?', [task.intake_case_id]) : null;
    // 关联申请
    const application = task.application_id ? db.get('SELECT id, uni_name, department, status FROM applications WHERE id=?', [task.application_id]) : null;
    // 负责人
    const assignee = task.assigned_to ? db.get('SELECT id, name, role FROM staff WHERE id=?', [task.assigned_to]) : null;
    res.json({ task, student, intakeCase, application, assignee });
  });

  router.put('/tasks/:id', requireRole('principal','counselor','mentor','intake_staff'), (req, res) => {
    try {
      const { title, description, category, due_date, status, priority, assigned_to } = req.body;
      const existing = db.get('SELECT * FROM milestone_tasks WHERE id=?', [req.params.id]);
      if (!existing) return res.status(404).json({ error: '任务不存在' });
      const finalTitle = title !== undefined ? title : existing.title;
      if (!finalTitle || !finalTitle.trim()) return res.status(400).json({ error: '任务标题不能为空' });
      // BUG-H1: status 白名单
      const validStatuses = ['pending', 'in_progress', 'done', 'overdue'];
      if (status && !validStatuses.includes(status)) return res.status(400).json({ error: `任务状态必须为 ${validStatuses.join('/')}` });
      // BUG-H2: priority 白名单
      const validPriorities = ['high', 'normal', 'low'];
      if (priority && !validPriorities.includes(priority)) return res.status(400).json({ error: `优先级必须为 ${validPriorities.join('/')}` });
      // BUG-M1: category 白名单
      const validCategories = ['材料', '考试', '申请', '面试', '沟通', '其他'];
      if (category && !validCategories.includes(category)) return res.status(400).json({ error: `分类必须为 ${validCategories.join('/')}` });
      // BUG-M2: due_date 格式校验
      if (due_date && isNaN(new Date(due_date).getTime())) return res.status(400).json({ error: '截止日期格式无效' });
      const finalStatus = status || existing.status || 'pending';
      // BUG-H3: status=done 时自动设置 completed_at
      const completed_at = finalStatus === 'done' ? (existing.completed_at || new Date().toISOString()) : null;
      db.run(`UPDATE milestone_tasks SET title=?,description=?,category=?,due_date=?,status=?,priority=?,assigned_to=?,completed_at=?,updated_at=? WHERE id=?`,
        [finalTitle.trim(), description ?? existing.description ?? '', category || existing.category || '其他', due_date ?? existing.due_date, finalStatus, priority || existing.priority || 'normal', assigned_to ?? existing.assigned_to, completed_at, new Date().toISOString(), req.params.id]);
      res.json({ ok: true });
    } catch(e) {
      console.error('[tasks]', e);
      res.status(500).json({ error: '服务器错误，请重试' });
    }
  });

  router.delete('/tasks/:id', requireRole('principal','counselor','intake_staff'), (req, res) => {
    db.run('DELETE FROM milestone_tasks WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
