/**
 * routes/settings.js — 系统设置、监护人同意、科目字典、时间线模板、考试场次、日历锚点、申请扩展
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole }) {
  const router = express.Router();

  // ═══════════════════════════════════════════════════════
  //  SETTINGS (系统设置)
  // ═══════════════════════════════════════════════════════

  router.get('/settings', requireRole('principal','counselor'), (_req, res) => {
    const rows = db.all('SELECT key, value FROM settings');
    const obj = {};
    rows.forEach(r => { obj[r.key] = r.value; });
    res.json(obj);
  });

  router.put('/settings/:key', requireRole('principal'), (req, res) => {
    const { value } = req.body;
    db.run('INSERT OR REPLACE INTO settings VALUES (?,?)', [req.params.key, value ?? '']);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  //  GUARDIAN CONSENT （监护人同意）
  // ═══════════════════════════════════════════════════════

  router.get('/students/:id/consents', requireRole('principal','counselor','intake_staff'), (req, res) => {
    res.json(db.all('SELECT * FROM guardian_consents WHERE student_id=? ORDER BY created_at DESC', [req.params.id]));
  });

  router.post('/students/:id/consents', requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { guardian_name, relation, consent_version, consent_scope, consented, consent_date } = req.body;
    if (!guardian_name || !consent_date) return res.status(400).json({ error: '监护人姓名和同意日期必填' });
    const id = uuidv4();
    db.run(`INSERT INTO guardian_consents (id,student_id,guardian_name,relation,consent_version,consent_scope,consented,consent_date,recorded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, req.params.id, guardian_name, relation||'', consent_version||'1.0',
       JSON.stringify(consent_scope||['data_storage','counseling']),
       consented !== false ? 1 : 0, consent_date, req.session.user.id, new Date().toISOString()]);
    audit(req, 'CREATE', 'guardian_consents', id, { guardian_name, consented });
    res.json({ id });
  });

  router.put('/consents/:id/revoke', requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { revoke_reason } = req.body;
    const now = new Date().toISOString();
    db.run('UPDATE guardian_consents SET consented=0, revoke_date=?, revoke_reason=? WHERE id=?',
      [now, revoke_reason||'', req.params.id]);
    audit(req, 'REVOKE', 'guardian_consents', req.params.id, { revoke_reason });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  //  SUBJECTS (字典)
  // ═══════════════════════════════════════════════════════

  router.get('/subjects', requireAuth, (req, res) => {
    res.json(db.all('SELECT * FROM subjects ORDER BY category, code'));
  });

  // ═══════════════════════════════════════════════════════
  //  TIMELINE TEMPLATES
  // ═══════════════════════════════════════════════════════

  router.get('/templates', requireAuth, (_req, res) => {
    const templates = db.all('SELECT * FROM timeline_templates ORDER BY is_system DESC, created_at DESC');
    templates.forEach(t => {
      const items = db.all('SELECT COUNT(*) as cnt FROM template_items WHERE template_id=?', [t.id]);
      t.item_count = items[0]?.cnt || 0;
    });
    res.json(templates);
  });

  router.post('/templates', requireRole('principal','counselor'), (req, res) => {
    const { name, description, route, tier, items } = req.body;
    if (!name) return res.status(400).json({ error: '模板名称不能为空' });
    const id = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO timeline_templates (id,name,description,route,tier,is_system,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [id, name, description||'', route||'UK-UG', tier||'意向', 0, req.session.user.id, now]);
    if (items && Array.isArray(items)) {
      items.forEach((item, idx) => {
        db.run(`INSERT INTO template_items (id,template_id,title,description,category,days_before_deadline,priority,sort_order) VALUES (?,?,?,?,?,?,?,?)`,
          [uuidv4(), id, item.title, item.description||'', item.category||'其他',
           parseInt(item.days_before_deadline)||30, item.priority||'normal', idx]);
      });
    }
    res.json({ id });
  });

  router.get('/templates/:id', requireAuth, (req, res) => {
    const tpl = db.get('SELECT * FROM timeline_templates WHERE id=?', [req.params.id]);
    if (!tpl) return res.status(404).json({ error: '模板不存在' });
    const items = db.all('SELECT * FROM template_items WHERE template_id=? ORDER BY sort_order, days_before_deadline DESC', [req.params.id]);
    res.json({ template: tpl, items });
  });

  router.put('/templates/:id', requireRole('principal','counselor'), (req, res) => {
    const { name, description, route, tier, items } = req.body;
    const tpl = db.get('SELECT * FROM timeline_templates WHERE id=?', [req.params.id]);
    if (!tpl) return res.status(404).json({ error: '模板不存在' });
    if (tpl.is_system) return res.status(403).json({ error: '系统内置模板不可编辑，请复制后修改' });
    db.run('UPDATE timeline_templates SET name=?,description=?,route=?,tier=? WHERE id=?',
      [name, description||'', route||'UK-UG', tier||'意向', req.params.id]);
    if (items && Array.isArray(items)) {
      db.run('DELETE FROM template_items WHERE template_id=?', [req.params.id]);
      items.forEach((item, idx) => {
        db.run(`INSERT INTO template_items (id,template_id,title,description,category,days_before_deadline,priority,sort_order) VALUES (?,?,?,?,?,?,?,?)`,
          [uuidv4(), req.params.id, item.title, item.description||'', item.category||'其他',
           parseInt(item.days_before_deadline)||30, item.priority||'normal', idx]);
      });
    }
    res.json({ ok: true });
  });

  router.delete('/templates/:id', requireRole('principal','counselor'), (req, res) => {
    const tpl = db.get('SELECT * FROM timeline_templates WHERE id=?', [req.params.id]);
    if (!tpl) return res.status(404).json({ error: '模板不存在' });
    if (tpl.is_system) return res.status(403).json({ error: '系统内置模板不可删除' });
    db.run('DELETE FROM template_items WHERE template_id=?', [req.params.id]);
    db.run('DELETE FROM timeline_templates WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  });

  router.post('/templates/:id/copy', requireRole('principal','counselor'), (req, res) => {
    const tpl = db.get('SELECT * FROM timeline_templates WHERE id=?', [req.params.id]);
    if (!tpl) return res.status(404).json({ error: '模板不存在' });
    const items = db.all('SELECT * FROM template_items WHERE template_id=? ORDER BY sort_order', [req.params.id]);
    const newId = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO timeline_templates (id,name,description,route,tier,is_system,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [newId, `${tpl.name}（副本）`, tpl.description||'', tpl.route, tpl.tier, 0, req.session.user.id, now]);
    items.forEach((item, idx) => {
      db.run(`INSERT INTO template_items (id,template_id,title,description,category,days_before_deadline,priority,sort_order) VALUES (?,?,?,?,?,?,?,?)`,
        [uuidv4(), newId, item.title, item.description||'', item.category, item.days_before_deadline, item.priority, idx]);
    });
    res.json({ id: newId });
  });

  router.post('/templates/:id/apply', requireRole('principal','counselor','mentor'), (req, res) => {
    const { student_id, application_id, base_date } = req.body;
    if (!student_id || !base_date) return res.status(400).json({ error: '学生ID和截止日期必填' });
    const tpl = db.get('SELECT * FROM timeline_templates WHERE id=?', [req.params.id]);
    if (!tpl) return res.status(404).json({ error: '模板不存在' });
    const items = db.all('SELECT * FROM template_items WHERE template_id=? ORDER BY sort_order', [req.params.id]);
    const base = new Date(base_date);
    if (isNaN(base.getTime())) return res.status(400).json({ error: '截止日期格式无效，请使用 YYYY-MM-DD' });
    const now = new Date().toISOString();
    const created = [];
    for (const item of items) {
      const dueDate = new Date(base);
      dueDate.setDate(dueDate.getDate() - (item.days_before_deadline || 0));
      const tid = uuidv4();
      db.run(`INSERT INTO milestone_tasks (id,student_id,application_id,title,description,category,due_date,completed_at,status,priority,assigned_to,created_at,updated_at,due_time,due_timezone) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [tid, student_id, application_id||null, item.title, item.description||'', item.category,
         dueDate.toISOString().split('T')[0], null, 'pending', item.priority||'normal', null, now, now,
         tpl.deadline_time||null, tpl.deadline_timezone||null]);
      created.push(tid);
    }

    // For UK-UG templates: auto-create a reference prerequisite task if not already present
    if (tpl.route === 'UK-UG') {
      const hasRef = db.get(
        `SELECT id FROM milestone_tasks WHERE student_id=? AND (LOWER(title) LIKE '%reference%' OR LOWER(title) LIKE '%推荐信%' OR LOWER(title) LIKE '%参考人%')`,
        [student_id]
      );
      if (!hasRef) {
        const refDue = new Date(base);
        refDue.setDate(refDue.getDate() - 21); // 3 weeks before deadline
        db.run(`INSERT INTO milestone_tasks (id,student_id,application_id,title,description,category,due_date,completed_at,status,priority,assigned_to,created_at,updated_at,due_time,due_timezone) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), student_id, application_id||null,
           '【前置必须】推荐人完成并提交 Reference（UCAS硬门槛）',
           'UCAS规定：在推荐人完成并提交Reference之前，申请无法最终提交。请与推荐人确认提交状态，并在此任务中记录完成时间。',
           '材料', refDue.toISOString().split('T')[0], null, 'pending', 'high', null, now, now,
           '18:00', 'Europe/London']);
        created.push('reference-auto');
      }
    }

    res.json({ created: created.length });
  });

  // ═══════════════════════════════════════════════════════
  //  P1.2 EXAM SITTINGS（考试场次）
  // ═══════════════════════════════════════════════════════

  router.get('/students/:id/exam-sittings', requireAuth, (req, res) => {
    const u = req.session.user;
    const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    res.json(db.all('SELECT * FROM exam_sittings WHERE student_id=? ORDER BY year DESC, sitting_date DESC', [sid]));
  });

  router.post('/students/:id/exam-sittings', requireRole('principal','counselor','mentor'), (req, res) => {
    const { exam_board, series, year, subject, subject_code, component, sitting_date, results_date,
            predicted_grade, actual_grade, ums_score, status, is_resit, resit_of, notes } = req.body;
    if (!exam_board) return res.status(400).json({ error: '考试局必填' });
    if (!subject || !subject.trim()) return res.status(400).json({ error: '科目名称必填' });
    // Prevent duplicate sitting for same student/board/series/year/subject/component
    const duplicate = db.get(
      'SELECT id FROM exam_sittings WHERE student_id=? AND exam_board=? AND series=? AND year=? AND subject=? AND component=?',
      [req.params.id, exam_board, series||'', year||null, subject.trim(), component||'']
    );
    if (duplicate) return res.status(409).json({ error: '该考试记录（学生/考试局/考试季/年份/科目/成分）已存在，请编辑现有记录' });
    const id = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO exam_sittings (id,student_id,exam_board,series,year,subject,subject_code,component,sitting_date,results_date,predicted_grade,actual_grade,ums_score,status,is_resit,resit_of,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.params.id, exam_board, series||'', year||null, subject.trim(), subject_code||'', component||'',
       sitting_date||null, results_date||null, predicted_grade||'', actual_grade||'', ums_score||'',
       status||'registered', is_resit?1:0, resit_of||null, notes||'', now, now]);
    audit(req, 'CREATE', 'exam_sittings', id, { exam_board, subject });
    res.json({ id });
  });

  router.put('/exam-sittings/:id', requireRole('principal','counselor','mentor'), (req, res) => {
    const { exam_board, series, year, subject, subject_code, component, sitting_date, results_date,
            predicted_grade, actual_grade, ums_score, status, is_resit, notes } = req.body;
    const now = new Date().toISOString();
    const before = db.get('SELECT * FROM exam_sittings WHERE id=?', [req.params.id]);
    if (!before) return res.status(404).json({ error: '考试记录不存在' });
    db.run(`UPDATE exam_sittings SET exam_board=?,series=?,year=?,subject=?,subject_code=?,component=?,sitting_date=?,results_date=?,predicted_grade=?,actual_grade=?,ums_score=?,status=?,is_resit=?,notes=?,updated_at=? WHERE id=?`,
      [exam_board, series||'', year||null, subject||'', subject_code||'', component||'',
       sitting_date||null, results_date||null, predicted_grade||'', actual_grade||'', ums_score||'',
       status||'registered', is_resit?1:0, notes||'', now, req.params.id]);
    audit(req, 'UPDATE', 'exam_sittings', req.params.id, { before, after: req.body });
    res.json({ ok: true });
  });

  router.delete('/exam-sittings/:id', requireRole('principal','counselor'), (req, res) => {
    db.run('DELETE FROM exam_sittings WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  //  P1.1 CALENDAR ANCHOR EVENTS（日历锚点事件）
  // ═══════════════════════════════════════════════════════

  router.get('/anchor-events', requireAuth, (req, res) => {
    res.json(db.all('SELECT * FROM calendar_anchor_events ORDER BY event_date DESC'));
  });

  router.post('/anchor-events', requireRole('principal','counselor'), (req, res) => {
    const { name, event_type, exam_board, series, year, event_date, notes } = req.body;
    if (!name || !event_date) return res.status(400).json({ error: '名称和日期必填' });
    const id = uuidv4();
    db.run(`INSERT INTO calendar_anchor_events (id,name,event_type,exam_board,series,year,event_date,notes,is_system,created_at) VALUES (?,?,?,?,?,?,?,?,0,?)`,
      [id, name, event_type||'custom', exam_board||'', series||'', year||null, event_date, notes||'', new Date().toISOString()]);
    res.json({ id });
  });

  router.delete('/anchor-events/:id', requireRole('principal','counselor'), (req, res) => {
    const ev = db.get('SELECT is_system FROM calendar_anchor_events WHERE id=?', [req.params.id]);
    if (ev && ev.is_system) return res.status(403).json({ error: '系统内置锚点不可删除' });
    db.run('DELETE FROM calendar_anchor_events WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  //  P1.3 ROUTE-SPECIFIC APPLICATION EXTENSIONS
  // ═══════════════════════════════════════════════════════

  router.get('/applications/:id/ext', requireAuth, (req, res) => {
    const app_row = db.get('SELECT route FROM applications WHERE id=?', [req.params.id]);
    if (!app_row) return res.status(404).json({ error: '申请不存在' });
    let ext = null;
    if (app_row.route === 'UK-UG') ext = db.get('SELECT * FROM application_uk_ext WHERE application_id=?', [req.params.id]);
    else if (app_row.route === 'US') ext = db.get('SELECT * FROM application_us_ext WHERE application_id=?', [req.params.id]);
    else if (app_row.route === 'SG') ext = db.get('SELECT * FROM application_sg_ext WHERE application_id=?', [req.params.id]);
    res.json({ route: app_row.route, ext: ext || {} });
  });

  router.put('/applications/:id/ext', requireRole('principal','counselor'), (req, res) => {
    const app_row = db.get('SELECT route FROM applications WHERE id=?', [req.params.id]);
    if (!app_row) return res.status(404).json({ error: '申请不存在' });
    const aid = req.params.id;
    const d = req.body;
    if (app_row.route === 'UK-UG') {
      db.run(`INSERT OR REPLACE INTO application_uk_ext (application_id,ucas_personal_id,ucas_choice_number,reference_status,clearing_eligible,firm_conditions,insurance_conditions) VALUES (?,?,?,?,?,?,?)`,
        [aid, d.ucas_personal_id||'', d.ucas_choice_number||null, d.reference_status||'pending', d.clearing_eligible?1:0, d.firm_conditions||'', d.insurance_conditions||'']);
    } else if (app_row.route === 'US') {
      db.run(`INSERT OR REPLACE INTO application_us_ext (application_id,app_type,is_binding,platform,school_portal_url,decision_date_expected,css_profile_required,fafsa_required,supplements_required) VALUES (?,?,?,?,?,?,?,?,?)`,
        [aid, d.app_type||'RD', d.is_binding?1:0, d.platform||'', d.school_portal_url||'', d.decision_date_expected||null, d.css_profile_required?1:0, d.fafsa_required?1:0, JSON.stringify(d.supplements_required||[])]);
    } else if (app_row.route === 'SG') {
      db.run(`INSERT OR REPLACE INTO application_sg_ext (application_id,portal_name,supplement_scores_required,supplement_scores_submitted,supplement_deadline,interview_required,interview_date,interview_format,test_required,test_type,test_date,scholarship_applied) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [aid, d.portal_name||'', d.supplement_scores_required?1:0, d.supplement_scores_submitted?1:0, d.supplement_deadline||null, d.interview_required?1:0, d.interview_date||null, d.interview_format||'', d.test_required?1:0, d.test_type||'', d.test_date||null, d.scholarship_applied?1:0]);
    }
    audit(req, 'UPDATE', 'application_ext', aid, d);
    res.json({ ok: true });
  });

  // ── 别名路由：exam-records → exam-sittings ───────────
  router.get('/students/:id/exam-records', requireAuth, (req, res) => {
    const u = req.session.user;
    const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    res.json(db.all('SELECT * FROM exam_sittings WHERE student_id=? ORDER BY year DESC, sitting_date DESC', [sid]));
  });

  return router;
};
