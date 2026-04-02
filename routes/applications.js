// ═══════════════════════════════════════════════════════
//  APPLICATIONS & TIMELINE
// ═══════════════════════════════════════════════════════
module.exports = function({ db, uuidv4, audit, requireAuth, requireRole }) {
  const router = require('express').Router();

  function _getSettingRaw(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? r[0].values[0][0] : fallback; } catch(e) { return fallback; }
  }
  function _getSetting(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? JSON.parse(r[0].values[0][0]) : fallback; } catch(e) { return fallback; }
  }

  router.post('/applications', requireRole('principal','counselor'), (req, res) => {
    const { student_id, uni_name, department, tier, cycle_year, route, submit_deadline, grade_type_used } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id 必填' });
    const studentExists = db.get('SELECT id FROM students WHERE id=? AND status != "deleted"', [student_id]);
    if (!studentExists) return res.status(400).json({ error: '学生不存在或已归档' });
    const id = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, student_id, uuidv4(), uni_name, department, tier, cycle_year, route||_getSettingRaw('default_application_route','UK-UG'),
      submit_deadline, null, grade_type_used||_getSettingRaw('default_grade_type_used','Predicted'), '[]', null, _getSettingRaw('default_application_status','Pending'), null, 0, 0, null, 'pending', '', now, now]);
    res.json({ id });
  });

  router.get('/applications/:id', requireAuth, (req, res) => {
    const app = db.get('SELECT * FROM applications WHERE id=?', [req.params.id]);
    if (!app) return res.status(404).json({ error: '申请不存在' });
    const u = req.session.user;
    // 学生只能查看自己的申请；家长只能查看关联学生的申请
    if (u.role === 'student' && u.linked_id !== app.student_id) {
      return res.status(403).json({ error: '无权访问' });
    }
    if (u.role === 'parent') {
      const sp = db.get('SELECT 1 FROM student_parents WHERE student_id=? AND parent_id=?', [app.student_id, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    const tasks = db.all('SELECT * FROM milestone_tasks WHERE application_id=? ORDER BY due_date', [req.params.id]);
    const materials = db.all('SELECT * FROM material_items WHERE application_id=? ORDER BY created_at', [req.params.id]);
    const ps = db.get('SELECT * FROM personal_statements WHERE application_id=? ORDER BY version DESC LIMIT 1', [req.params.id]);
    res.json({ application: app, tasks, materials, personal_statement: ps });
  });

  router.put('/applications/:id', requireRole('principal','counselor'), (req, res) => {
    const { uni_name, department, tier, cycle_year, route, submit_deadline, submit_date, grade_type_used,
      offer_date, offer_type, conditions, firm_choice, insurance_choice, status, notes } = req.body;

    // UCAS Reference Gating: UK-UG applications cannot be marked 'applied' unless a Reference task is done
    if (status === 'applied' && (route || '') === 'UK-UG') {
      const app = db.get('SELECT * FROM applications WHERE id=?', [req.params.id]);
      if (app) {
        const _refKeywords = _getSetting('reference_task_keywords', ['reference%','推荐信%','参考人%']);
        const _refCond = _refKeywords.map(k => `LOWER(title) LIKE '%${k.replace(/%/g,'').toLowerCase()}%'`).join(' OR ');
        const refTask = db.get(
          `SELECT id FROM milestone_tasks WHERE student_id=? AND status='done' AND (${_refCond})`,
          [app.student_id]
        );
        if (!refTask) {
          return res.status(422).json({ error: 'UCAS申请无法标记为"已提交"：推荐信/Reference任务尚未完成（标记为"已完成"）。请先确认推荐人已完成并提交Reference，再更新申请状态。' });
        }
      }
    }

    const isFirm = firm_choice===true||firm_choice===1?1:0;
    // Enforce UCAS rule: only one firm choice per student per cycle_year
    if (isFirm) {
      const thisApp = db.get('SELECT student_id, cycle_year FROM applications WHERE id=?', [req.params.id]);
      if (thisApp) {
        const existingFirm = db.get(
          'SELECT id FROM applications WHERE student_id=? AND cycle_year=? AND firm_choice=1 AND id!=?',
          [thisApp.student_id, thisApp.cycle_year || cycle_year, req.params.id]
        );
        if (existingFirm) return res.status(400).json({ error: '每个申请周期只能有一个 Firm Choice' });
      }
    }
    db.run(`UPDATE applications SET uni_name=?,department=?,tier=?,cycle_year=?,route=?,submit_deadline=?,
      submit_date=?,grade_type_used=?,offer_date=?,offer_type=?,conditions=?,firm_choice=?,insurance_choice=?,
      status=?,notes=?,updated_at=? WHERE id=?`,
      [uni_name, department, tier, cycle_year, route, submit_deadline, submit_date, grade_type_used,
      offer_date, offer_type, conditions, isFirm, insurance_choice===true||insurance_choice===1?1:0, status, notes, new Date().toISOString(), req.params.id]);
    res.json({ ok: true });
  });

  router.delete('/applications/:id', requireRole('principal','counselor'), (req, res) => {
    const app = db.get('SELECT * FROM applications WHERE id=?', [req.params.id]);
    if (!app) return res.status(404).json({ error: '申请不存在' });
    db.run('DELETE FROM applications WHERE id=?', [req.params.id]);
    // Clean up related records
    db.run('DELETE FROM milestone_tasks WHERE application_id=?', [req.params.id]);
    db.run('DELETE FROM material_items WHERE application_id=?', [req.params.id]);
    db.run('DELETE FROM personal_statements WHERE application_id=?', [req.params.id]);
    audit(req, 'DELETE', 'applications', req.params.id, { uni_name: app.uni_name });
    res.json({ ok: true });
  });

  // 批量生成时间线任务（英国本科申请模板）
  router.post('/students/:id/generate-timeline', requireRole('principal','counselor'), (req, res) => {
    const { application_id, route, tier, cycle_year } = req.body;
    const year = cycle_year || new Date().getFullYear();
    const now = new Date().toISOString();
    const sid = req.params.id;

    const templates = {
      'UK-UG-冲刺': [
        { title: '目标院校确认与选科复核', category: '申请', due_date: `${year-1}-07-31`, priority: 'high' },
        { title: '个人陈述第一问草稿（为什么选择该学科）', category: '材料', due_date: `${year-1}-08-15`, priority: 'high' },
        { title: '个人陈述第二问草稿（学业准备）', category: '材料', due_date: `${year-1}-08-31`, priority: 'high' },
        { title: '个人陈述第三问草稿（课外准备）', category: '材料', due_date: `${year-1}-09-10`, priority: 'high' },
        { title: '推荐信确认（推荐人确认）', category: '材料', due_date: `${year-1}-08-31`, priority: 'high' },
        { title: 'UCAS网申账号注册', category: '申请', due_date: `${year-1}-09-01`, priority: 'normal' },
        { title: '个人陈述一审完成', category: '材料', due_date: `${year-1}-09-20`, priority: 'high' },
        { title: '个人陈述定稿', category: '材料', due_date: `${year-1}-10-05`, priority: 'high' },
        { title: '提交UCAS申请（冲刺院校截止 10/15）', category: '申请', due_date: `${year-1}-10-15`, priority: 'high' },
        { title: '面试准备（如有）', category: '面试', due_date: `${year-1}-11-30`, priority: 'normal' },
        { title: '等待Offer结果', category: '申请', due_date: `${year}-01-31`, priority: 'normal' },
      ],
      'UK-UG-意向': [
        { title: '目标院校清单确认', category: '申请', due_date: `${year-1}-07-31`, priority: 'high' },
        { title: '个人陈述三问草稿完成', category: '材料', due_date: `${year-1}-10-31`, priority: 'high' },
        { title: '推荐信收集', category: '材料', due_date: `${year-1}-11-15`, priority: 'high' },
        { title: '成绩单准备', category: '材料', due_date: `${year-1}-11-30`, priority: 'normal' },
        { title: 'UCAS提交（主截止 1月中旬）', category: '申请', due_date: `${year}-01-15`, priority: 'high' },
        { title: '等待并跟进Offer状态', category: '申请', due_date: `${year}-03-31`, priority: 'normal' },
        { title: '确认Firm/Insurance选择', category: '申请', due_date: `${year}-05-31`, priority: 'high' },
      ],
      'UK-UG-保底': [
        { title: '备选院校清单确认', category: '申请', due_date: `${year-1}-09-30`, priority: 'normal' },
        { title: '材料准备（成绩单、推荐信）', category: '材料', due_date: `${year-1}-12-15`, priority: 'normal' },
        { title: 'UCAS提交（保底截止 1月中旬）', category: '申请', due_date: `${year}-01-15`, priority: 'high' },
        { title: '关注Clearing补录机会', category: '申请', due_date: `${year}-08-15`, priority: 'normal' },
      ]
    };

    const key = `${route || 'UK-UG'}-${tier || '意向'}`;
    const template = templates[key] || templates['UK-UG-意向'];

    const created = [];
    for (const t of template) {
      const tid = uuidv4();
      db.run(`INSERT INTO milestone_tasks (id,student_id,application_id,title,description,category,due_date,completed_at,status,priority,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [tid, sid, application_id||null, t.title, t.description||'', t.category, t.due_date, null, 'pending', t.priority||'normal', null, now, now]);
      created.push(tid);
    }

    res.json({ created: created.length, tasks: created });
  });

  return router;
};
