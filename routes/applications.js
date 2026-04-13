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

  // GET /applications — 申请列表（支持按学生、状态、周期筛选）
  router.get('/applications', requireAuth, (req, res) => {
    const u = req.session.user;
    // agent 和 student_admin 无权通过主 API 查看申请列表
    if (['agent', 'student_admin'].includes(u.role)) {
      return res.status(403).json({ error: '权限不足' });
    }

    let where = ['1=1', "a.status != 'deleted'"], params = [];
    const { student_id, status, cycle_year, search } = req.query;

    // 角色数据隔离
    if (u.role === 'student') {
      where.push('a.student_id=?'); params.push(u.linked_id);
    } else if (u.role === 'parent') {
      where.push('a.student_id IN (SELECT student_id FROM student_parents WHERE parent_id=?)');
      params.push(u.linked_id);
    } else if (u.role === 'mentor') {
      where.push('a.student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)');
      params.push(u.linked_id);
    } else if (u.role === 'counselor') {
      where.push('a.student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)');
      params.push(u.linked_id);
    } else if (u.role === 'intake_staff') {
      where.push('a.student_id IN (SELECT student_id FROM intake_cases WHERE case_owner_staff_id=? AND student_id IS NOT NULL)');
      params.push(u.linked_id);
    }
    // principal: 不加额外过滤

    if (student_id) { where.push('a.student_id=?'); params.push(student_id); }
    if (status) { where.push('a.status=?'); params.push(status); }
    if (cycle_year) { where.push('a.cycle_year=?'); params.push(cycle_year); }
    if (search) { where.push('(a.uni_name LIKE ? OR a.department LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

    const wantPagination = req.query.page != null || req.query.limit != null;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = wantPagination ? Math.min(100, Math.max(1, parseInt(req.query.limit) || 20)) : 99999;
    const offset = (page - 1) * limit;

    const paginatedParams = [...params, limit, offset];
    const rows = db.all(`SELECT a.*, s.name as student_name FROM applications a
      LEFT JOIN students s ON s.id=a.student_id
      WHERE ${where.join(' AND ')} ORDER BY a.updated_at DESC
      LIMIT ? OFFSET ?`, paginatedParams);
    if (wantPagination) {
      const countResult = db.get(`SELECT COUNT(*) as total FROM applications a WHERE ${where.join(' AND ')}`, params);
      res.json({ data: rows, pagination: { page, limit, total: countResult.total, totalPages: Math.ceil(countResult.total / limit) } });
    } else {
      res.json(rows);
    }
  });

  // GET /students/:sid/applications — 学生申请列表（子资源）
  router.get('/students/:sid/applications', requireAuth, (req, res) => {
    const u = req.session.user;
    const sid = req.params.sid;
    // 角色权限检查
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT 1 FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    if (u.role === 'mentor' || u.role === 'counselor') {
      const ma = db.get('SELECT 1 FROM mentor_assignments WHERE student_id=? AND staff_id=?', [sid, u.linked_id]);
      if (!ma) return res.status(403).json({ error: '无权访问' });
    }
    if (['agent', 'student_admin'].includes(u.role)) return res.status(403).json({ error: '权限不足' });

    const rows = db.all("SELECT * FROM applications WHERE student_id=? AND status != 'deleted' ORDER BY updated_at DESC", [sid]);
    res.json(rows);
  });

  router.post('/applications', requireRole('principal','counselor'), (req, res) => {
    const { student_id, university_id, uni_name, department, tier, cycle_year, route, submit_deadline, grade_type_used } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id 必填' });
    // BUG-C1: 必填字段校验
    if (!uni_name || !uni_name.trim()) return res.status(400).json({ error: '学校名称必填' });
    if (!tier || !tier.trim()) return res.status(400).json({ error: '申请层级必填' });
    if (!cycle_year) return res.status(400).json({ error: '申请年份必填' });
    if (!department || !department.trim()) return res.status(400).json({ error: '专业/院系必填' });
    if (!submit_deadline) return res.status(400).json({ error: '截止日期必填' });
    const studentExists = db.get('SELECT id FROM students WHERE id=? AND status != "deleted"', [student_id]);
    if (!studentExists) return res.status(400).json({ error: '学生不存在或已归档' });
    const id = uuidv4();
    const now = new Date().toISOString();
    // Look up university_id: use provided value, or match by name, or generate new
    let uniId = university_id || null;
    if (!uniId && uni_name) {
      const existing = db.get('SELECT id FROM universities WHERE name LIKE ?', [`%${uni_name}%`]);
      if (existing) uniId = existing.id;
    }
    if (!uniId) uniId = uuidv4();
    db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, student_id, uniId, uni_name, department, tier, cycle_year, route||_getSettingRaw('default_application_route','UK-UG'),
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

    const VALID_STATUSES = ['pending','applied','offer','conditional_offer','unconditional_offer','firm','insurance','enrolled','accepted','declined','rejected','withdrawn','waitlisted','draft','deleted'];
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: '无效的申请状态值' });
    }

    // 状态转换矩阵：定义每个状态允许转换到的目标状态
    const STATUS_TRANSITIONS = {
      draft:                ['pending', 'withdrawn', 'deleted'],
      pending:              ['applied', 'submitted', 'withdrawn', 'declined', 'deleted'],
      applied:              ['submitted', 'offer', 'conditional_offer', 'unconditional_offer', 'rejected', 'waitlisted', 'withdrawn', 'deleted'],
      submitted:            ['offer', 'conditional_offer', 'unconditional_offer', 'rejected', 'waitlisted', 'withdrawn', 'deleted'],
      offer:                ['accepted', 'firm', 'insurance', 'declined', 'withdrawn', 'deleted'],
      conditional_offer:    ['unconditional_offer', 'accepted', 'firm', 'insurance', 'declined', 'withdrawn', 'deleted'],
      unconditional_offer:  ['accepted', 'firm', 'insurance', 'declined', 'withdrawn', 'deleted'],
      accepted:             ['firm', 'insurance', 'enrolled', 'declined', 'withdrawn', 'deleted'],
      firm:                 ['enrolled', 'declined', 'withdrawn', 'deleted'],
      insurance:            ['enrolled', 'declined', 'withdrawn', 'deleted'],
      waitlisted:           ['offer', 'conditional_offer', 'unconditional_offer', 'rejected', 'declined', 'withdrawn', 'deleted'],
      enrolled:             ['withdrawn', 'deleted'],
      declined:             ['deleted'],
      rejected:             ['deleted'],
      withdrawn:            ['pending', 'deleted'], // 允许重新激活
    };
    if (status !== undefined) {
      const currentApp = db.get('SELECT status FROM applications WHERE id=?', [req.params.id]);
      if (currentApp && currentApp.status !== status) {
        const allowed = STATUS_TRANSITIONS[currentApp.status];
        if (allowed && !allowed.includes(status)) {
          const statusLabels = { pending:'准备中', applied:'已提交', submitted:'已提交', offer:'Offer', conditional_offer:'有条件录取', unconditional_offer:'无条件录取', accepted:'已接受', firm:'Firm', insurance:'Insurance', enrolled:'已入学', declined:'已拒绝', rejected:'被拒绝', withdrawn:'已撤回', waitlisted:'等候名单', draft:'草稿', deleted:'已删除' };
          return res.status(422).json({
            error: `无法从「${statusLabels[currentApp.status] || currentApp.status}」直接转换为「${statusLabels[status] || status}」，请按正常流程操作`,
            current: currentApp.status,
            target: status,
            allowed: allowed
          });
        }
      }
    }

    // UCAS Reference Gating: UK-UG applications cannot be marked 'applied' unless a Reference task is done
    if (status === 'applied' && (route || '') === 'UK-UG') {
      const app = db.get('SELECT * FROM applications WHERE id=?', [req.params.id]);
      if (app) {
        const _refKeywords = _getSetting('reference_task_keywords', ['reference%','推荐信%','参考人%']);
        const _refCond = _refKeywords.map(() => `LOWER(title) LIKE ?`).join(' OR ');
        const _refParams = _refKeywords.map(k => `%${k.replace(/%/g,'').toLowerCase()}%`);
        const refTask = db.get(
          `SELECT id FROM milestone_tasks WHERE student_id=? AND status='done' AND (${_refCond})`,
          [app.student_id, ..._refParams]
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
    // 只更新请求体中提供的字段（partial update）
    const existing = db.get('SELECT * FROM applications WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: '申请不存在' });

    const fields = {
      uni_name: uni_name !== undefined ? uni_name : existing.uni_name,
      department: department !== undefined ? department : existing.department,
      tier: tier !== undefined ? tier : existing.tier,
      cycle_year: cycle_year !== undefined ? cycle_year : existing.cycle_year,
      route: route !== undefined ? route : existing.route,
      submit_deadline: submit_deadline !== undefined ? submit_deadline : existing.submit_deadline,
      submit_date: submit_date !== undefined ? submit_date : existing.submit_date,
      grade_type_used: grade_type_used !== undefined ? grade_type_used : existing.grade_type_used,
      offer_date: offer_date !== undefined ? offer_date : existing.offer_date,
      offer_type: offer_type !== undefined ? offer_type : existing.offer_type,
      conditions: conditions !== undefined ? conditions : existing.conditions,
      firm_choice: firm_choice !== undefined ? isFirm : existing.firm_choice,
      insurance_choice: insurance_choice !== undefined ? (insurance_choice===true||insurance_choice===1?1:0) : existing.insurance_choice,
      status: status !== undefined ? status : existing.status,
      notes: notes !== undefined ? notes : existing.notes,
    };

    db.run(`UPDATE applications SET uni_name=?,department=?,tier=?,cycle_year=?,route=?,submit_deadline=?,
      submit_date=?,grade_type_used=?,offer_date=?,offer_type=?,conditions=?,firm_choice=?,insurance_choice=?,
      status=?,notes=?,updated_at=? WHERE id=?`,
      [fields.uni_name, fields.department, fields.tier, fields.cycle_year, fields.route, fields.submit_deadline,
      fields.submit_date, fields.grade_type_used, fields.offer_date, fields.offer_type, fields.conditions,
      fields.firm_choice, fields.insurance_choice, fields.status, fields.notes, new Date().toISOString(), req.params.id]);
    res.json({ ok: true });
  });

  router.delete('/applications/:id', requireRole('principal','counselor'), (req, res) => {
    const app = db.get('SELECT * FROM applications WHERE id=?', [req.params.id]);
    if (!app) return res.status(404).json({ error: '申请不存在' });
    db.run("UPDATE applications SET status='deleted', updated_at=? WHERE id=?", [new Date().toISOString(), req.params.id]);
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
