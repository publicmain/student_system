/**
 * routes/intake-cases.js — 入学案例 CRUD、状态机、材料/任务、文件发送、入学仪表盘
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const fileStorage = require('../file-storage');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, requireAdmissionModule, sendMail, escHtml, brandedEmail, upload, moveUploadedFile, _matSendInviteEmail }) {
  const router = express.Router();

  // 从 settings 表读取配置，带硬编码 fallback
  function _getSetting(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? JSON.parse(r[0].values[0][0]) : fallback; } catch(e) { return fallback; }
  }
  function _getSettingRaw(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? r[0].values[0][0] : fallback; } catch(e) { return fallback; }
  }

  // ═══════════════════════════════════════════════════════
  //  INTAKE CASES
  // ═══════════════════════════════════════════════════════

  router.post('/intake-cases', requireRole('principal','intake_staff'), (req, res) => {
    const { student_name, intake_year, program_name, case_owner_staff_id, referral_id, notes } = req.body;
    if (!student_name || !intake_year || !program_name) return res.status(400).json({ error: '缺少必填字段: student_name, intake_year, program_name' });
    // R15: 后端 intake_year 范围校验
    const year = parseInt(intake_year);
    const yearRange = _getSetting('intake_year_range', { min: 2000, max: 2100 });
    if (isNaN(year) || year < yearRange.min || year > yearRange.max) return res.status(400).json({ error: `入学年份无效（须在 ${yearRange.min}-${yearRange.max} 之间）` });
    const id = uuidv4();
    const vcId = uuidv4();
    const arId = uuidv4();
    try {
      db.transaction((runInTx) => {
        const now = new Date().toISOString();
        runInTx(`INSERT INTO intake_cases (id,student_id,student_name,intake_year,program_name,status,case_owner_staff_id,referral_id,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [id, null, student_name.trim(), intake_year, program_name, (_getSetting('intake_case_statuses', ['registered'])[0] || 'registered'), case_owner_staff_id||null, referral_id||null, notes||null, now, now]);
        runInTx(`INSERT INTO visa_cases (id,case_id,status) VALUES (?,?,?)`, [vcId, id, 'not_started']);
        runInTx(`INSERT INTO arrival_records (id,case_id) VALUES (?,?)`, [arId, id]);
      });
    } catch(e) {
      return res.status(500).json({ error: '创建案例失败: ' + e.message });
    }
    audit(req, 'CREATE', 'intake_cases', id, { student_name, intake_year, program_name });
    res.json({ id, student_name, intake_year, program_name, status: 'registered', visa_case_id: vcId });
  });

  router.get('/intake-cases', requireAdmissionModule, (req, res) => {
    const { status, owner, student_id, year } = req.query;
    let where = ['1=1'];
    let params = [];
    if (status) { where.push('ic.status=?'); params.push(status); }
    if (owner) { where.push('ic.case_owner_staff_id=?'); params.push(owner); }
    if (student_id) { where.push('ic.student_id=?'); params.push(student_id); }
    if (year) { where.push('ic.intake_year=?'); params.push(year); }
    // 学管老师（student_admin）只负责到校之后的阶段，仅返回 arrived/oriented/closed 案例
    if (req.session.user.role === 'student_admin') {
      where.push("ic.status IN ('arrived','oriented','closed')");
    }
    const isPrincipal = req.session.user.role === 'principal';
    // principal 可查看代理字段，其他角色的查询不关联代理表
    const cases = isPrincipal
      ? db.all(`
          SELECT ic.*, ic.student_name, ic.review_status, ic.adm_profile_id,
            st.name as owner_name,
            vc.status as visa_status, vc.ipa_expiry_date,
            fi.amount_total as invoice_amount, fi.status as invoice_status,
            (SELECT SUM(fp.paid_amount) FROM finance_payments fp JOIN finance_invoices fi2 ON fi2.id=fp.invoice_id WHERE fi2.case_id=ic.id AND fp.reconciled=1) as paid_amount,
            r.source_type as referral_type,
            a.name as agent_name,
            a.id as agent_id
          FROM intake_cases ic
          LEFT JOIN staff st ON st.id=ic.case_owner_staff_id
          LEFT JOIN visa_cases vc ON vc.case_id=ic.id
          LEFT JOIN finance_invoices fi ON fi.case_id=ic.id AND fi.status != 'void'
          LEFT JOIN referrals r ON r.id=ic.referral_id
          LEFT JOIN agents a ON a.id=r.agent_id
          WHERE ${where.join(' AND ')}
          ORDER BY ic.created_at DESC, ic.rowid DESC
        `, params)
      : db.all(`
          SELECT ic.id, ic.student_name, ic.intake_year, ic.program_name, ic.status,
            ic.review_status, ic.adm_profile_id,
            ic.case_owner_staff_id, ic.offer_issued_at, ic.contract_signed_at,
            ic.contract_signed_by, ic.notes, ic.created_at, ic.updated_at,
            st.name as owner_name,
            vc.status as visa_status, vc.ipa_expiry_date,
            fi.amount_total as invoice_amount, fi.status as invoice_status,
            (SELECT SUM(fp.paid_amount) FROM finance_payments fp JOIN finance_invoices fi2 ON fi2.id=fp.invoice_id WHERE fi2.case_id=ic.id AND fp.reconciled=1) as paid_amount
          FROM intake_cases ic
          LEFT JOIN staff st ON st.id=ic.case_owner_staff_id
          LEFT JOIN visa_cases vc ON vc.case_id=ic.id
          LEFT JOIN finance_invoices fi ON fi.case_id=ic.id AND fi.status != 'void'
          WHERE ${where.join(' AND ')}
          ORDER BY ic.created_at DESC, ic.rowid DESC
        `, params);
    res.json(cases);
  });

  router.get('/intake-cases/:id', requireAdmissionModule, (req, res) => {
    const isPrincipal = req.session.user.role === 'principal';
    const ic = isPrincipal
      ? db.get(`
          SELECT ic.*, ic.student_name,
            st.name as owner_name,
            r.source_type as referral_type, r.anonymous_label, r.agent_id,
            a.name as agent_name
          FROM intake_cases ic
          LEFT JOIN staff st ON st.id=ic.case_owner_staff_id
          LEFT JOIN referrals r ON r.id=ic.referral_id
          LEFT JOIN agents a ON a.id=r.agent_id
          WHERE ic.id=?
        `, [req.params.id])
      : db.get(`
          SELECT ic.id, ic.student_name, ic.intake_year, ic.program_name, ic.status,
            ic.case_owner_staff_id, ic.offer_issued_at, ic.contract_signed_at,
            ic.contract_signed_by, ic.docs_sent_at, ic.notes, ic.created_at, ic.updated_at,
            ic.adm_profile_id, ic.review_status, ic.student_id, ic.referral_id,
            ic.source_type, ic.submit_mode, ic.submitted_at,
            st.name as owner_name
          FROM intake_cases ic
          LEFT JOIN staff st ON st.id=ic.case_owner_staff_id
          WHERE ic.id=?
        `, [req.params.id]);
    if (!ic) return res.status(404).json({ error: 'Case 不存在' });
    const role = req.session.user.role;
    const isStudentAdmin = role === 'student_admin';
    // 学管老师只看到校后的任务（入学/回访类），不需要看签证/材料/财务
    const visa     = isStudentAdmin ? null : db.get('SELECT * FROM visa_cases WHERE case_id=?', [req.params.id]);
    const invoices = isStudentAdmin ? [] : db.all('SELECT * FROM finance_invoices WHERE case_id=? ORDER BY created_at DESC', [req.params.id]);
    const payments = isStudentAdmin ? [] : db.all(`SELECT fp.*, fi.invoice_no FROM finance_payments fp JOIN finance_invoices fi ON fi.id=fp.invoice_id WHERE fi.case_id=? ORDER BY fp.paid_at DESC`, [req.params.id]);
    const materials= isStudentAdmin ? [] : db.all('SELECT * FROM material_items WHERE intake_case_id=? ORDER BY created_at DESC', [req.params.id]);
    const tasks = isStudentAdmin
      ? db.all(`SELECT * FROM milestone_tasks WHERE intake_case_id=? AND category IN ('入学','回访') ORDER BY due_date ASC`, [req.params.id])
      : db.all('SELECT * FROM milestone_tasks WHERE intake_case_id=? ORDER BY due_date ASC', [req.params.id]);
    const arrival = db.get('SELECT * FROM arrival_records WHERE case_id=?', [req.params.id]);
    const survey = db.get('SELECT * FROM post_arrival_surveys WHERE case_id=? ORDER BY created_at DESC LIMIT 1', [req.params.id]);
    // 是否已移交学管（intake_staff 视角：案例进入 oriented/closed 后进入只读交接态）
    const _stageOrder = _getSetting('intake_case_statuses', ['registered','collecting_docs','contract_signed','visa_in_progress','ipa_received','paid','arrived','oriented','closed']);
    const phase_handed_off = _stageOrder.indexOf(ic.status) >= 7; // oriented 及以后
    // 案例文件 + 发送记录 + 签字记录（含文件的发送子列表）
    const caseFilesRaw = isStudentAdmin ? [] : db.all('SELECT * FROM case_files WHERE case_id=? ORDER BY created_at DESC', [req.params.id]);
    const caseSends    = isStudentAdmin ? [] : db.all('SELECT * FROM case_file_sends WHERE case_id=? ORDER BY sent_at DESC', [req.params.id]);
    const caseSignatures = isStudentAdmin ? [] : db.all('SELECT * FROM case_signatures WHERE case_id=? ORDER BY signed_at DESC', [req.params.id]);
    const caseFiles = caseFilesRaw.map(f => ({ ...f, sends: caseSends.filter(s => s.file_id === f.id) }));
    // 文件收发中心数据
    const fileExchangeRaw = isStudentAdmin ? [] : db.all(`SELECT * FROM file_exchange_records WHERE case_id=? AND is_deleted=0 AND direction='admin_to_student' ORDER BY created_at DESC`, [req.params.id]);
    const replyRecordsRaw = isStudentAdmin ? [] : db.all(`SELECT * FROM file_exchange_records WHERE case_id=? AND is_deleted=0 AND direction='student_to_admin' AND parent_id IS NOT NULL ORDER BY created_at DESC`, [req.params.id]);
    const now_iso = new Date().toISOString();
    const fileExchange = fileExchangeRaw.map(r => {
      if (r.deadline_at && r.deadline_at < now_iso && !['replied','closed'].includes(r.status)) {
        r.status = 'overdue';
      }
      r.replies = replyRecordsRaw.filter(rp => rp.parent_id === r.id);
      return r;
    });
    const fileExchangeLogs = isStudentAdmin ? [] : db.all(`SELECT * FROM file_exchange_logs WHERE case_id=? ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
    // ADM 申请表文件（如有）
    let admDocs = [];
    if (ic.adm_profile_id) {
      admDocs = db.all(
        `SELECT * FROM adm_generated_documents WHERE profile_id=? AND is_latest=1 ORDER BY doc_type`,
        [ic.adm_profile_id]
      );
    }
    // MAT 材料收集请求（关联到此 case）
    let matRequest = null;
    const matReq = db.get(`SELECT * FROM mat_requests WHERE intake_case_id=? ORDER BY created_at DESC LIMIT 1`, [req.params.id]);
    if (matReq) {
      matReq.items = db.all(`SELECT * FROM mat_request_items WHERE request_id=? ORDER BY sort_order`, [matReq.id]);
      matReq.uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [matReq.id]);
      matReq.token = db.get(`SELECT token, status as token_status, expires_at FROM mat_magic_tokens WHERE request_id=? AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`, [matReq.id]);
      matReq.reviewActions = db.all(`SELECT * FROM mat_review_actions WHERE request_id=? ORDER BY created_at DESC`, [matReq.id]);
      matReq.uifVersions = db.all(`SELECT id, version_no, status, submitted_at, reviewed_at, return_reason, is_current FROM mat_uif_versions WHERE request_id=? ORDER BY version_no DESC`, [matReq.id]);
      matRequest = matReq;
    }
    res.json({ ...ic, visa, arrival, invoices, payments, tasks, materials, survey, phase_handed_off, caseFiles, caseSends, caseSignatures, fileExchange, fileExchangeLogs, admDocs, matRequest });
  });

  // ── POST /api/intake-cases/:id/mat-request — 从 case 创建材料收集请求 ──
  router.post('/intake-cases/:id/mat-request', requireRole('principal','intake_staff','counselor'), (req, res) => {
    try {
    const ic = db.get('SELECT * FROM intake_cases WHERE id=?', [req.params.id]);
    if (!ic) return res.status(404).json({ error: 'Case not found' });

    // 检查是否已有请求
    const existing = db.get('SELECT id FROM mat_requests WHERE intake_case_id=?', [req.params.id]);
    if (existing) return res.status(400).json({ error: 'Material request already exists for this case', requestId: existing.id });

    const { company_id, contact_id, title, deadline, notes, items } = req.body;
    if (!company_id || !contact_id) return res.status(400).json({ error: 'company_id and contact_id required' });
    const company = db.get('SELECT id FROM agents WHERE id=?', [company_id]);
    if (!company) return res.status(400).json({ error: '中介公司不存在' });
    const contactCheck = db.get('SELECT id FROM mat_contacts WHERE id=? AND company_id=?', [contact_id, company_id]);
    if (!contactCheck) return res.status(400).json({ error: '联系人不存在或不属于该公司' });

    const requestId = uuidv4();
    db.run(`INSERT INTO mat_requests (id, student_id, company_id, contact_id, counselor_id, title, deadline, notes, status, intake_case_id, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [requestId, ic.student_id, company_id, contact_id, req.session.user.id, title || `${ic.student_name} 材料收集`, deadline || '', notes || '', 'PENDING', req.params.id]);

    // 创建默认材料项
    const defaultItems = items && items.length > 0 ? items : [
      { name: '护照首页', is_required: 1 },
      { name: '在读证明', is_required: 1 },
      { name: '成绩单', is_required: 1 },
      { name: '银行存款证明', is_required: 0 },
      { name: '语言成绩证明', is_required: 0 },
    ];
    defaultItems.forEach((item, idx) => {
      db.run(`INSERT INTO mat_request_items (id, request_id, name, description, is_required, status, sort_order) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(), requestId, item.name, item.description || '', item.is_required ? 1 : 0, 'PENDING', idx]);
    });

    // 生成 magic token（统一使用 APP_URL，避免反向代理导致链接错误）
    const token = require('crypto').randomBytes(32).toString('hex');
    const tokenExpiryHours = parseInt(_getSettingRaw('agent_token_expiry_hours', '72'));
    const expires = new Date(Date.now() + tokenExpiryHours * 60 * 60 * 1000).toISOString();
    db.run(`INSERT INTO mat_magic_tokens (id, request_id, contact_id, token, status, expires_at, created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
      [uuidv4(), requestId, contact_id, token, 'ACTIVE', expires]);

    // 自动发送邀请邮件给 agent
    const contact = db.get('SELECT * FROM mat_contacts WHERE id=?', [contact_id]);
    const matReqForEmail = db.get('SELECT * FROM mat_requests WHERE id=?', [requestId]);
    if (contact && contact.email && matReqForEmail) {
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const link = `${baseUrl}/agent.html?token=${token}`;
      _matSendInviteEmail(matReqForEmail, contact, link, 'invite').catch(e => {
        console.error('[MAT] Invite email failed:', e.message);
      });
    }

    audit(req, 'MAT_REQUEST_CREATED_FROM_CASE', 'intake_cases', req.params.id, { requestId });
    res.json({ ok: true, requestId, token });
    } catch(e) {
      console.error('[MAT] Create mat-request error:', e.message, e.stack);
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/intake-cases/:id/status', requireRole('principal','intake_staff','student_admin'), (req, res) => {
    const { status } = req.body;
    const validStatuses = _getSetting('intake_case_statuses', ['registered','collecting_docs','contract_signed','visa_in_progress','ipa_received','paid','arrived','oriented','closed']);
    if (!validStatuses.includes(status)) return res.status(400).json({ error: '无效状态' });
    const prev = db.get('SELECT status, student_name FROM intake_cases WHERE id=?', [req.params.id]);
    if (!prev) return res.status(404).json({ error: 'Case 不存在' });
    // BUG-001: student_admin 仅可操作 arrived/oriented 阶段，与前端一致
    if (req.session.user.role === 'student_admin' && !['arrived','oriented'].includes(status)) {
      return res.status(403).json({ error: 'student_admin 仅可将案例标记为到校或已入学' });
    }
    // 状态机顺序：从设置读取
    const ALLOWED_TRANSITIONS = _getSetting('intake_allowed_transitions', {
      'registered':['collecting_docs'], 'collecting_docs':['registered','contract_signed'],
      'contract_signed':['collecting_docs','visa_in_progress'], 'visa_in_progress':['contract_signed','ipa_received'],
      'ipa_received':['visa_in_progress','paid'], 'paid':['ipa_received','arrived'],
      'arrived':['paid','oriented'], 'oriented':['arrived','closed'], 'closed':[]
    });
    const allowed = ALLOWED_TRANSITIONS[prev.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `状态流转不合法：${prev.status} → ${status}，允许跳转至：${allowed.join('、') || '（终态，不可变更）'}` });
    }
    db.run(`UPDATE intake_cases SET status=?,updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
    // 写入状态审计日志
    db.run(`INSERT INTO case_status_log (id,case_id,from_status,to_status,changed_by,changed_by_name) VALUES (?,?,?,?,?,?)`,
      [uuidv4(), req.params.id, prev.status, status, req.session.user?.id, req.session.user?.name||'']);
    audit(req, 'UPDATE_STATUS', 'intake_cases', req.params.id, { from: prev.status, to: status });
    // 自动创建任务
    const autoTasks = [];
    const now = new Date();
    const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r.toISOString().slice(0,10); };
    const atCfg = _getSetting('intake_auto_tasks', { collect_docs_days:14, visa_submit_days:14, fee_followup_days:7, fee_receipt_days:14, arrival_confirm_days:7, accommodation_days:14, orientation_days:3, student_pass_days:7, survey_days:14 });
    if (status === 'contract_signed') {
      autoTasks.push({ title: '收集护照及入学材料', category: '材料', priority: 'high', due_date: addDays(now, atCfg.collect_docs_days||14) });
    } else if (status === 'visa_in_progress') {
      autoTasks.push({ title: '提交签证申请（Student Pass）', category: '签证', priority: 'high', due_date: addDays(now, atCfg.visa_submit_days||14) });
    } else if (status === 'paid') {
      autoTasks.push({ title: '跟进首期学费缴纳', category: '财务', priority: 'high', due_date: addDays(now, atCfg.fee_followup_days||7) });
      autoTasks.push({ title: '确认学费收据并发送给学生', category: '财务', priority: 'normal', due_date: addDays(now, atCfg.fee_receipt_days||14) });
    } else if (status === 'ipa_received') {
      autoTasks.push({ title: '提醒学生确认到校日期及航班', category: '到校', priority: 'high', due_date: addDays(now, atCfg.arrival_confirm_days||7) });
      autoTasks.push({ title: '安排接机与住宿', category: '到校', priority: 'high', due_date: addDays(now, atCfg.accommodation_days||14) });
      // IPA到期前提醒（从visa_cases获取到期日）
      const vc = db.get('SELECT ipa_expiry_date FROM visa_cases WHERE case_id=?', [req.params.id]);
      if (vc && vc.ipa_expiry_date) {
        const exp = new Date(vc.ipa_expiry_date);
        const ipaReminderDays = _getSetting('intake_ipa_reminder_days', [30, 14, 3]);
        ipaReminderDays.forEach(d => {
          const due = new Date(exp); due.setDate(due.getDate()-d);
          if (due > now) autoTasks.push({ title: `⚠️ IPA 将在 ${d} 天后到期（${vc.ipa_expiry_date}）`, category: '签证', priority: d<=3?'high':'normal', due_date: due.toISOString().slice(0,10) });
        });
      }
    } else if (status === 'arrived') {
      autoTasks.push({ title: '完成到校登记与Orientation', category: '入学', priority: 'high', due_date: addDays(now, atCfg.orientation_days||3) });
      autoTasks.push({ title: '确认学生准证办理', category: '签证', priority: 'high', due_date: addDays(now, atCfg.student_pass_days||7) });
      // 通知所有 student_admin：学生已到校
      try {
        const studentName = prev.student_name || '学生';
        const adminUsers = db.all(`SELECT id FROM users WHERE role='student_admin'`);
        if (adminUsers.length > 0) {
          const vals = adminUsers.map(() => `(?,?,?,?,?,?,?,datetime('now'))`).join(',');
          const args = adminUsers.flatMap(u => [uuidv4(), null, 'system',
            '学生已到校', `${studentName} 已到校，请开始跟进 Orientation 流程`, 'student_admin', u.id]);
          db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_role,target_user_id,created_at) VALUES ${vals}`, args);
        }
      } catch(e) { console.error('student_admin 通知创建失败:', e.message); }
    } else if (status === 'oriented') {
      autoTasks.push({ title: '发送到校后满意度问卷', category: '回访', priority: 'normal', due_date: addDays(now, atCfg.survey_days||14) });
      // 通知 intake_staff：学生已入学，案例已移交学管
      try {
        const studentName = prev.student_name || '学生';
        const intakeUsers = db.all(`SELECT id FROM users WHERE role='intake_staff'`);
        if (intakeUsers.length > 0) {
          const vals2 = intakeUsers.map(() => `(?,?,?,?,?,?,?,datetime('now'))`).join(',');
          const args2 = intakeUsers.flatMap(u => [uuidv4(), null, 'system', '案例已顺利移交',
            `${studentName} 已完成入学登记，案例已移交学管老师跟进，你的前期工作已完成。`, 'intake_staff', u.id]);
          db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_role,target_user_id,created_at) VALUES ${vals2}`, args2);
        }
      } catch(e) { console.error('intake_staff 移交通知失败:', e.message); }
    }
    let autoTasksCreated = 0;
    autoTasks.forEach(t => {
      try {
        const dup = db.get('SELECT id FROM milestone_tasks WHERE intake_case_id=? AND title=?', [req.params.id, t.title]);
        if (dup) return; // 已存在同名任务，跳过
        const tid = uuidv4(); const tnow = new Date().toISOString();
        db.run(`INSERT INTO milestone_tasks (id,student_id,intake_case_id,title,category,priority,status,due_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [tid, null, req.params.id, t.title, t.category||'其他', t.priority||'normal', 'pending', t.due_date||null, tnow, tnow]);
        autoTasksCreated++;
      } catch(e) { console.error('自动任务创建失败:', e.message); }
    });
    res.json({ ok: true, status, autoTasksCreated });
  });

  router.put('/intake-cases/:id', requireRole('principal','intake_staff'), (req, res) => {
    // BUG-006: 404 check
    const existing = db.get('SELECT id FROM intake_cases WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Case 不存在' });
    const { program_name, case_owner_staff_id, offer_issued_at, contract_signed_at, contract_signed_by, notes } = req.body;
    db.run(`UPDATE intake_cases SET program_name=COALESCE(?,program_name), case_owner_staff_id=COALESCE(?,case_owner_staff_id), offer_issued_at=?, contract_signed_at=?, contract_signed_by=?, notes=COALESCE(?,notes), updated_at=datetime('now') WHERE id=?`,
      [program_name||null, case_owner_staff_id||null, offer_issued_at||null, contract_signed_at||null, contract_signed_by||null, notes||null, req.params.id]);
    audit(req, 'UPDATE', 'intake_cases', req.params.id, req.body);
    res.json({ ok: true });
  });

  router.delete('/intake-cases/:id', requireRole('principal','intake_staff'), (req, res) => {
    const ic = db.get('SELECT id, student_name FROM intake_cases WHERE id=?', [req.params.id]);
    if (!ic) return res.status(404).json({ error: 'Case 不存在' });
    // Collect physical file paths before deletion
    const exchangeFiles = db.all('SELECT file_path FROM file_exchange_records WHERE case_id=? AND file_path IS NOT NULL', [req.params.id]);
    const caseFiles = db.all('SELECT filename FROM case_files WHERE case_id=? AND filename IS NOT NULL', [req.params.id]);
    const materialFiles = db.all('SELECT file_path FROM material_items WHERE intake_case_id=? AND file_path IS NOT NULL', [req.params.id]);
    // 材料收集相关文件
    const matRequests = db.all('SELECT id FROM mat_requests WHERE intake_case_id=?', [req.params.id]);
    const matReqIds = matRequests.map(r => r.id);
    const matUploadFiles = matReqIds.length ? db.all(`SELECT file_id FROM mat_request_items WHERE request_id IN (${matReqIds.map(()=>'?').join(',')}) AND file_id IS NOT NULL`, matReqIds) : [];
    const matVersionFiles = matReqIds.length ? db.all(`SELECT file_id FROM mat_item_versions WHERE request_id IN (${matReqIds.map(()=>'?').join(',')}) AND file_id IS NOT NULL`, matReqIds) : [];
    // ADM 生成的 PDF 文件
    const profileId = ic.adm_profile_id || db.get('SELECT adm_profile_id FROM intake_cases WHERE id=?', [req.params.id])?.adm_profile_id;
    const admDocFiles = profileId ? db.all('SELECT file_id FROM adm_generated_documents WHERE profile_id=? AND file_id IS NOT NULL', [profileId]) : [];
    const admSigFiles = profileId ? db.all('SELECT file_id FROM adm_signatures WHERE profile_id=? AND file_id IS NOT NULL', [profileId]) : [];
    try {
      db.transaction((run) => {
        run(`DELETE FROM post_arrival_surveys WHERE case_id=?`, [req.params.id]);
        run(`DELETE FROM survey_links WHERE case_id=?`, [req.params.id]);
        run(`DELETE FROM milestone_tasks WHERE intake_case_id=?`, [req.params.id]);
        run(`DELETE FROM material_items WHERE intake_case_id=?`, [req.params.id]);
        run(`DELETE FROM commission_payouts WHERE invoice_id IN (SELECT id FROM finance_invoices WHERE case_id=?)`, [req.params.id]);
        run(`DELETE FROM finance_payments WHERE invoice_id IN (SELECT id FROM finance_invoices WHERE case_id=?)`, [req.params.id]);
        run(`DELETE FROM finance_invoices WHERE case_id=?`, [req.params.id]);
        run(`DELETE FROM arrival_records WHERE case_id=?`, [req.params.id]);
        run(`DELETE FROM visa_cases WHERE case_id=?`, [req.params.id]);
        run(`DELETE FROM case_signatures WHERE case_id=?`, [req.params.id]);
        run(`DELETE FROM case_file_sends WHERE case_id=?`, [req.params.id]);
        run(`DELETE FROM case_files WHERE case_id=?`, [req.params.id]);
        run(`DELETE FROM file_exchange_logs WHERE case_id=?`, [req.params.id]);
        run(`DELETE FROM file_exchange_records WHERE case_id=?`, [req.params.id]);
        // 材料收集相关
        for (const rid of matReqIds) {
          run(`DELETE FROM mat_item_versions WHERE request_id=?`, [rid]);
          run(`DELETE FROM mat_request_items WHERE request_id=?`, [rid]);
          run(`DELETE FROM mat_uif_versions WHERE request_id=?`, [rid]);
          run(`DELETE FROM mat_uif_submissions WHERE request_id=?`, [rid]);
          run(`DELETE FROM mat_magic_tokens WHERE request_id=?`, [rid]);
          run(`DELETE FROM mat_review_actions WHERE request_id=?`, [rid]);
        }
        run(`DELETE FROM mat_requests WHERE intake_case_id=?`, [req.params.id]);
        // ADM Profile 相关
        if (profileId) {
          run(`DELETE FROM adm_generated_documents WHERE profile_id=?`, [profileId]);
          run(`DELETE FROM adm_signatures WHERE profile_id=?`, [profileId]);
          run(`DELETE FROM adm_family_members WHERE profile_id=?`, [profileId]);
          run(`DELETE FROM adm_education_history WHERE profile_id=?`, [profileId]);
          run(`DELETE FROM adm_employment_history WHERE profile_id=?`, [profileId]);
          run(`DELETE FROM adm_residence_history WHERE profile_id=?`, [profileId]);
          run(`DELETE FROM adm_guardian_info WHERE profile_id=?`, [profileId]);
          run(`DELETE FROM adm_parent_pr_additional WHERE profile_id=?`, [profileId]);
          run(`DELETE FROM adm_spouse_pr_additional WHERE profile_id=?`, [profileId]);
          run(`DELETE FROM adm_profiles WHERE id=?`, [profileId]);
        }
        run(`DELETE FROM intake_cases WHERE id=?`, [req.params.id]);
      });
    } catch(e) {
      return res.status(500).json({ error: '删除失败: ' + e.message });
    }
    // Clean up physical files after successful DB deletion
    for (const f of exchangeFiles) { fileStorage.deleteFile(f.file_path); }
    for (const f of caseFiles) { fileStorage.deleteFile(f.filename); }
    for (const f of materialFiles) { fileStorage.deleteFile(f.file_path); }
    for (const f of matUploadFiles.concat(matVersionFiles)) { fileStorage.deleteFile(f.file_id); }
    for (const f of admDocFiles.concat(admSigFiles)) { fileStorage.deleteFile(f.file_id); }
    audit(req, 'DELETE', 'intake_cases', req.params.id, { student_name: ic.student_name });
    res.json({ ok: true });
  });

  // ── Intake case docs ──

  router.get('/intake-cases/:id/docs', requireAdmissionModule, (req, res) => {
    const materials = db.all('SELECT * FROM material_items WHERE intake_case_id=? ORDER BY created_at DESC', [req.params.id]);
    res.json(materials);
  });

  router.post('/intake-cases/:id/docs', requireRole('principal','intake_staff'), (req, res) => {
    const { material_type, title, status, notes, doc_tag } = req.body;
    if (!material_type) return res.status(400).json({ error: '缺少 material_type' });
    if (!db.get('SELECT id FROM intake_cases WHERE id=?', [req.params.id])) return res.status(404).json({ error: 'Case 不存在' });
    const id = uuidv4();
    db.run(`INSERT INTO material_items (id,student_id,intake_case_id,material_type,title,status,notes,doc_tag) VALUES (?,?,?,?,?,?,?,?)`,
      [id, null, req.params.id, material_type, title||material_type, status||'未开始', notes||null, doc_tag||null]);
    audit(req, 'CREATE', 'material_items', id, { intake_case_id: req.params.id, material_type });
    res.json({ id, material_type, title: title||material_type, status: status||'未开始' });
  });

  router.post('/intake-cases/:id/tasks', requireRole('principal','intake_staff'), (req, res) => {
    const { title, description, category, due_date, priority, assigned_to } = req.body;
    if (!title) return res.status(400).json({ error: '缺少 title' });
    const ic = db.get('SELECT id, student_id FROM intake_cases WHERE id=?', [req.params.id]);
    if (!ic) return res.status(404).json({ error: 'Case 不存在' });
    const id = uuidv4();
    db.run(`INSERT INTO milestone_tasks (id,student_id,intake_case_id,title,description,category,due_date,status,priority,assigned_to) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, ic.student_id || '', req.params.id, title, description||null, category||'其他', due_date||null, 'pending', priority||'normal', assigned_to||null]);
    audit(req, 'CREATE', 'milestone_tasks', id, { intake_case_id: req.params.id, title });
    res.json({ id, title, status: 'pending' });
  });

  // ═══════════════════════════════════════════════════════
  //  合同前文件打包发送
  // ═══════════════════════════════════════════════════════

  router.post('/intake-cases/:id/send-docs', requireRole('principal','intake_staff'), async (req, res) => {
    try {
    const { email, material_ids } = req.body;
    if (!email) return res.status(400).json({ error: '请提供收件人邮箱' });
    const ic = db.get('SELECT id, student_name FROM intake_cases WHERE id=?', [req.params.id]);
    if (!ic) return res.status(404).json({ error: 'Case 不存在' });

    // 1. 查询文件（无论有没有都继续）
    let files = [];
    try {
      if (material_ids && material_ids.length) {
        files = db.all(`SELECT * FROM material_items WHERE id IN (${material_ids.map(()=>'?').join(',')}) AND file_path IS NOT NULL`, material_ids);
      } else {
        files = db.all(`SELECT * FROM material_items WHERE intake_case_id=? AND file_path IS NOT NULL`, [req.params.id]);
      }
    } catch(e) { console.error('查询文件失败:', e.message); }

    // 2. 立即记录 docs_sent_at（无论邮件是否成功）
    db.run(`UPDATE intake_cases SET docs_sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [req.params.id]);

    // 3. 尝试发送邮件，失败只记录日志不报错
    try {
      if (files.length > 0) {
        const zipBuffer = await new Promise((resolve, reject) => {
          const arc = archiver('zip', { zlib: { level: 6 } });
          const chunks = [];
          arc.on('data', d => chunks.push(d));
          arc.on('end', () => resolve(Buffer.concat(chunks)));
          arc.on('error', reject);
          files.forEach(f => {
            const filePath = fileStorage.getFilePath(f.file_path);
            if (fs.existsSync(filePath)) {
              const ext = path.extname(f.file_path);
              arc.file(filePath, { name: (f.title || f.material_type) + ext });
            }
          });
          arc.finalize();
        });
        await sendMail(email, '入学材料包',
          `<p>您好，请查收附件中的入学相关文件（共 ${files.length} 份）。</p><p>如有疑问请联系我们。</p>`,
          [{ filename: 'intake_documents.zip', content: zipBuffer }]
        );
      } else {
        await sendMail(email, '入学通知',
          `<p>您好，顾问已与您取得联系，请关注后续材料。</p><p>如有疑问请联系我们。</p>`
        );
      }
    } catch(e) {
      console.error('send-docs 邮件发送失败（已记录发送时间）:', e.message);
    }

    audit(req, 'SEND_DOCS', 'intake_cases', req.params.id, { email, file_count: files.length });
    res.json({ ok: true, file_count: files.length, docs_sent_at: new Date().toISOString() });
    } catch(e) { console.error('send-docs error:', e.message); if(!res.headersSent) res.status(500).json({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════════════
  //  INTAKE DASHBOARD
  // ═══════════════════════════════════════════════════════

  router.get('/intake-dashboard', requireAdmissionModule, (req, res) => {
    const role = req.session.user.role;
    const isPrincipal = role === 'principal';
    const isStudentAdmin = role === 'student_admin';

    let payload = {};

    if (isPrincipal) {
      // ── Principal：全局视图 ──
      payload.total = db.get('SELECT COUNT(*) as cnt FROM intake_cases WHERE status != "closed"').cnt;
      payload.byStatus = db.all('SELECT status, COUNT(*) as cnt FROM intake_cases GROUP BY status');
      payload.overdueTasks = db.get(`SELECT COUNT(*) as cnt FROM milestone_tasks WHERE intake_case_id IS NOT NULL AND status != 'done' AND due_date < date('now')`).cnt;
      payload.unpaidInvoices = db.get(`SELECT COUNT(*) as cnt, COALESCE(SUM(amount_total),0) as total FROM finance_invoices WHERE status IN ('unpaid','partial')`);
      payload.ipaExpiringSoon = db.all(`SELECT vc.*, ic.program_name, ic.id as case_id, ic.student_name FROM visa_cases vc JOIN intake_cases ic ON ic.id=vc.case_id WHERE vc.ipa_expiry_date BETWEEN date('now') AND date('now','+30 days') AND vc.status='ipa_received'`);
      payload.pendingCommissions = db.get(`SELECT COUNT(*) as cnt, COALESCE(SUM(commission_amount),0) as total FROM commission_payouts WHERE status='pending'`);
      payload.agentPerformance = db.all(`
        SELECT a.id, a.name, a.type, a.status,
          COUNT(DISTINCT ic.id) as total_cases,
          SUM(CASE WHEN ic.status IN ('contract_signed','paid','visa_in_progress','ipa_received','arrived','oriented') THEN 1 ELSE 0 END) as signed_cases,
          SUM(CASE WHEN ic.status IN ('paid','visa_in_progress','ipa_received','arrived','oriented') THEN 1 ELSE 0 END) as paid_cases,
          COALESCE(SUM(CASE WHEN cp.status='pending' THEN cp.commission_amount ELSE 0 END),0) as pending_commission,
          COALESCE(SUM(CASE WHEN cp.status='paid' THEN cp.commission_amount ELSE 0 END),0) as paid_commission
        FROM agents a LEFT JOIN referrals r ON r.agent_id=a.id
        LEFT JOIN intake_cases ic ON ic.referral_id=r.id
        LEFT JOIN commission_payouts cp ON cp.referral_id=r.id
        WHERE a.status='active' GROUP BY a.id ORDER BY total_cases DESC`);
      payload.channelFunnel = db.all(`
        SELECT r.source_type, COUNT(DISTINCT ic.id) as total,
          SUM(CASE WHEN ic.status NOT IN ('registered','collecting_docs') THEN 1 ELSE 0 END) as converted
        FROM referrals r JOIN intake_cases ic ON ic.referral_id=r.id GROUP BY r.source_type`);

    } else if (isStudentAdmin) {
      // ── 学管（student_admin）：到校后视图 ──
      payload.arrivedCount   = db.get(`SELECT COUNT(*) as cnt FROM intake_cases WHERE status='arrived'`).cnt;
      payload.orientedCount  = db.get(`SELECT COUNT(*) as cnt FROM intake_cases WHERE status='oriented'`).cnt;
      payload.closedCount    = db.get(`SELECT COUNT(*) as cnt FROM intake_cases WHERE status='closed'`).cnt;
      payload.overdueMyTasks = db.get(`SELECT COUNT(*) as cnt FROM milestone_tasks WHERE intake_case_id IS NOT NULL AND category IN ('入学','回访') AND status != 'done' AND due_date < date('now')`).cnt;
      // 7天内到期的入学/回访任务
      payload.upcomingTasks = db.all(`
        SELECT mt.id, mt.title, mt.due_date, mt.category, mt.priority,
               ic.student_name, ic.id as case_id, ic.program_name
        FROM milestone_tasks mt JOIN intake_cases ic ON ic.id=mt.intake_case_id
        WHERE mt.intake_case_id IS NOT NULL AND mt.status != 'done'
          AND mt.category IN ('入学','回访')
          AND mt.due_date BETWEEN date('now') AND date('now','+7 days')
        ORDER BY mt.due_date ASC LIMIT 10`);
      // 已到校但尚未完成入学的学生（待跟进列表）
      payload.pendingOrientation = db.all(`
        SELECT ic.id, ic.student_name, ic.program_name, ic.updated_at
        FROM intake_cases ic WHERE ic.status='arrived'
        ORDER BY ic.updated_at ASC LIMIT 10`);
      // 本月已完成入学
      payload.thisMonthOriented = db.get(`SELECT COUNT(*) as cnt FROM intake_cases WHERE status IN ('oriented','closed') AND strftime('%Y-%m',updated_at)=strftime('%Y-%m','now')`).cnt;

    } else {
      // ── 入学顾问（intake_staff）：入学前视图 ──
      payload.total = db.get(`SELECT COUNT(*) as cnt FROM intake_cases WHERE status NOT IN ('oriented','closed')`).cnt;
      payload.byStatus = db.all(`SELECT status, COUNT(*) as cnt FROM intake_cases WHERE status NOT IN ('oriented','closed') GROUP BY status`);
      payload.overdueTasks = db.get(`SELECT COUNT(*) as cnt FROM milestone_tasks WHERE intake_case_id IS NOT NULL AND status != 'done' AND due_date < date('now') AND category NOT IN ('入学','回访')`).cnt;
      payload.ipaExpiringSoon = db.all(`SELECT vc.*, ic.program_name, ic.id as case_id, ic.student_name FROM visa_cases vc JOIN intake_cases ic ON ic.id=vc.case_id WHERE vc.ipa_expiry_date BETWEEN date('now') AND date('now','+30 days') AND vc.status='ipa_received'`);
      // 7天内到期的前置任务（排除入学/回访类）
      payload.upcomingTasks = db.all(`
        SELECT mt.id, mt.title, mt.due_date, mt.category, mt.priority,
               ic.student_name, ic.id as case_id, ic.program_name
        FROM milestone_tasks mt JOIN intake_cases ic ON ic.id=mt.intake_case_id
        WHERE mt.intake_case_id IS NOT NULL AND mt.status != 'done'
          AND mt.category NOT IN ('入学','回访')
          AND mt.due_date BETWEEN date('now') AND date('now','+7 days')
        ORDER BY mt.due_date ASC LIMIT 10`);
      payload.thisMonthNew = db.get(`SELECT COUNT(*) as cnt FROM intake_cases WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`).cnt;
    }

    res.json({ ...payload, role });
  });

  return router;
};
