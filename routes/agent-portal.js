/**
 * routes/agent-portal.js — Agent 自助门户 + 中介材料收集系统
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, upload, fileStorage, moveUploadedFile, sendMail, escHtml, brandedEmail, crypto, bcrypt, BCRYPT_COST, pdfGenerator, UPLOAD_DIR, fs, path, agentCallAttempts, AGENT_CALL_MAX, AGENT_CALL_WINDOW_MS }) {
  const router = express.Router();

  // ═══════════════════════════════════════════════════════
  //  AGENT 自助门户（仅 agent 角色访问自身数据）
  // ═══════════════════════════════════════════════════════

  router.get('/agent/me', requireRole('agent'), (req, res) => {
    const agentId = req.session.user.linked_id;
    if (!agentId) return res.status(404).json({ error: '代理账号未关联代理档案' });
    const agent = db.get('SELECT id, name, type, contact, email, phone, status, notes, created_at FROM agents WHERE id=?', [agentId]);
    if (!agent) return res.status(404).json({ error: '代理档案不存在' });
    res.json(agent);
  });

  router.get('/agent/my-referrals', requireRole('agent'), (req, res) => {
    const agentId = req.session.user.linked_id;
    if (!agentId) return res.status(403).json({ error: '未关联代理档案' });
    const referrals = db.all(`
      SELECT r.id, r.source_type, r.anonymous_label, r.referrer_name, r.notes, r.created_at,
        COUNT(DISTINCT ic.id) as case_count
      FROM referrals r
      LEFT JOIN intake_cases ic ON ic.referral_id=r.id
      WHERE r.agent_id=?
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `, [agentId]);
    res.json(referrals);
  });

  router.get('/agent/my-students', requireRole('agent'), (req, res) => {
    const agentId = req.session.user.linked_id;
    if (!agentId) return res.status(403).json({ error: '未关联代理档案' });
    const students = db.all(`
      SELECT DISTINCT s.id, s.name, s.grade_level,
        ic.id as case_id, ic.program_name, ic.intake_year, ic.status as case_status,
        ic.created_at as case_created_at
      FROM referrals r
      JOIN intake_cases ic ON ic.referral_id=r.id
      JOIN students s ON s.id=ic.student_id
      WHERE r.agent_id=? AND s.status != 'deleted'
      ORDER BY ic.created_at DESC, ic.rowid DESC
    `, [agentId]);
    res.json(students);
  });

  router.get('/agent/my-commissions', requireRole('agent'), (req, res) => {
    const agentId = req.session.user.linked_id;
    if (!agentId) return res.status(403).json({ error: '未关联代理档案' });
    const commissions = db.all(`
      SELECT cp.id, cp.base_amount, cp.commission_amount, cp.currency, cp.status,
        cp.approved_at, cp.paid_at, cp.created_at,
        cr.name as rule_name, fi.invoice_no
      FROM commission_payouts cp
      JOIN referrals r ON r.id=cp.referral_id
      LEFT JOIN commission_rules cr ON cr.id=cp.rule_id
      LEFT JOIN finance_invoices fi ON fi.id=cp.invoice_id
      WHERE r.agent_id=?
      ORDER BY cp.created_at DESC
    `, [agentId]);
    res.json(commissions);
  });

  // ═══════════════════════════════════════════════════════
  //  中介材料收集系统 (Mat Collection Portal)
  // ═══════════════════════════════════════════════════════

  // ── Magic Link 辅助函数 ───────────────────────────────
  function _matGenerateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  function _matCreateMagicLink(requestId, contactId) {
    db.run(`UPDATE mat_magic_tokens SET status='REVOKED' WHERE request_id=? AND status='ACTIVE'`, [requestId]);
    const token = _matGenerateToken();
    const id = uuidv4();
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    db.run(`INSERT INTO mat_magic_tokens (id,token,request_id,contact_id,status,expires_at) VALUES (?,?,?,?,?,?)`,
      [id, token, requestId, contactId, 'ACTIVE', expiresAt]);
    const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    return { token, link: `${baseUrl}/agent.html?token=${token}` };
  }

  function _matValidateToken(token, ip) {
    const rec = db.get(`SELECT * FROM mat_magic_tokens WHERE token=?`, [token]);
    if (!rec) return { error: 'TOKEN_INVALID', status: 401 };
    if (rec.status === 'REVOKED') return { error: 'TOKEN_REVOKED', status: 401 };
    if (rec.status === 'EXPIRED' || new Date(rec.expires_at) < new Date()) {
      db.run(`UPDATE mat_magic_tokens SET status='EXPIRED' WHERE id=?`, [rec.id]);
      return { error: 'TOKEN_EXPIRED', status: 401 };
    }
    db.run(`UPDATE mat_magic_tokens SET last_used_at=datetime('now'), access_ip=? WHERE id=?`, [ip, rec.id]);
    return { rec };
  }

  function _matAudit(requestId, actorType, actorId, actorName, action, detail, ip) {
    try {
      db.run(`INSERT INTO mat_audit_logs (id,request_id,actor_type,actor_id,actor_name,action,detail,ip) VALUES (?,?,?,?,?,?,?,?)`,
        [uuidv4(), requestId, actorType, actorId, actorName, action, typeof detail === 'object' ? JSON.stringify(detail) : detail, ip]);
    } catch(e) { /* non-blocking */ }
  }

  async function _matSendInviteEmail(req2, contact, link, type = 'invite') {
    const subjects = {
      invite:   `[材料收集] 请提交 ${req2.title} 所需材料`,
      upcoming: `[提醒] ${req2.title} 材料截止日临近`,
      due:      `[今日截止] ${req2.title} 材料请求`,
      overdue:  `[逾期催件] ${req2.title} 材料请求`,
      rejected: `[重新提交] ${req2.title} 有材料需要重传`,
    };
    const subjectLine = subjects[type] || subjects.invite;

    const items = db.all(`SELECT * FROM mat_request_items WHERE request_id=?`, [req2.id]);
    const pending = items.filter(i => ['PENDING','REJECTED'].includes(i.status)).length;
    const total = items.length;

    const _em3 = brandedEmail(
      `<p style="font-size:15px;color:#333;">${type === 'invite' ? '我们需要您协助提交以下学生的入学申请材料：' : '提醒您尽快完成材料提交：'}</p>
      <div style="background:#f8f9fa;border:1px solid #e5e5e5;border-radius:6px;padding:16px;margin:16px 0;">
        <div style="margin-bottom:6px;"><strong>案件：</strong>${escHtml(req2.title)}</div>
        <div style="margin-bottom:6px;"><strong>截止日期：</strong>${req2.deadline || '未设置'}</div>
        <div><strong>待提交：</strong>${pending} / ${total} 项</div>
      </div>`,
      { greeting: `您好 <strong>${escHtml(contact.name)}</strong>，`, buttonUrl: link, buttonText: '进入提交工作台 →', footerExtra: '此链接有效期 72 小时。如有问题请联系顾问。' }
    );

    sendMail(contact.email, subjectLine, _em3.html, _em3.attachments).catch(e =>
      console.error('[MAT MAIL]', e.message));
  }

  // Expose _matSendInviteEmail for intake-cases.js to use
  router._matSendInviteEmail = _matSendInviteEmail;

  // ── 中介公司管理 ──────────────────────────────────────
  router.get('/mat-companies', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const rows = db.all(`SELECT mc.*,
      (SELECT count(*) FROM mat_contacts WHERE company_id=mc.id AND is_active=1) as contact_count,
      (SELECT count(*) FROM mat_requests WHERE company_id=mc.id AND status NOT IN ('CANCELLED','COMPLETED')) as active_requests
      FROM mat_companies mc WHERE mc.is_active=1 ORDER BY mc.name`);
    res.json(rows);
  });

  router.post('/mat-companies', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { name, city, country, agreement_date, notes } = req.body;
    if (!name) return res.status(400).json({ error: '公司名称必填' });
    const id = uuidv4();
    db.run(`INSERT INTO mat_companies (id,name,city,country,agreement_date,notes,created_by) VALUES (?,?,?,?,?,?,?)`,
      [id, name, city||null, country||null, agreement_date||null, notes||null, req.session.user.id]);
    res.json({ id });
  });

  router.put('/mat-companies/:id', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { name, city, country, agreement_date, notes, is_active } = req.body;
    db.run(`UPDATE mat_companies SET name=?,city=?,country=?,agreement_date=?,notes=?,is_active=?,updated_at=datetime('now') WHERE id=?`,
      [name, city||null, country||null, agreement_date||null, notes||null, is_active !== undefined ? is_active : 1, req.params.id]);
    res.json({ ok: true });
  });

  router.get('/mat-companies/:id/contacts', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const rows = db.all(`SELECT * FROM mat_contacts WHERE company_id=? AND is_active=1 ORDER BY name`, [req.params.id]);
    res.json(rows);
  });

  router.post('/mat-companies/:id/contacts', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { name, email, phone, wechat, is_admin } = req.body;
    if (!name || !email) return res.status(400).json({ error: '姓名和邮箱必填' });
    const id = uuidv4();
    db.run(`INSERT INTO mat_contacts (id,company_id,name,email,phone,wechat,is_admin) VALUES (?,?,?,?,?,?,?)`,
      [id, req.params.id, name, email, phone||null, wechat||null, is_admin ? 1 : 0]);
    res.json({ id });
  });

  router.put('/mat-contacts/:id', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { name, email, phone, wechat, is_admin, is_active } = req.body;
    db.run(`UPDATE mat_contacts SET name=?,email=?,phone=?,wechat=?,is_admin=?,is_active=? WHERE id=?`,
      [name, email, phone||null, wechat||null, is_admin ? 1 : 0, is_active !== undefined ? is_active : 1, req.params.id]);
    res.json({ ok: true });
  });

  // ── 材料请求 ──────────────────────────────────────────
  router.get('/mat-requests', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { status, company_id } = req.query;
    let sql = `SELECT mr.*,
      mc.name as company_name, ct.name as contact_name, ct.email as contact_email,
      s.name as student_name,
      (SELECT count(*) FROM mat_request_items WHERE request_id=mr.id) as item_total,
      (SELECT count(*) FROM mat_request_items WHERE request_id=mr.id AND status='APPROVED') as item_approved
      FROM mat_requests mr
      JOIN mat_companies mc ON mr.company_id=mc.id
      JOIN mat_contacts ct ON mr.contact_id=ct.id
      LEFT JOIN students s ON mr.student_id=s.id
      WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND mr.status=?'; params.push(status); }
    if (company_id) { sql += ' AND mr.company_id=?'; params.push(company_id); }
    sql += ' ORDER BY mr.created_at DESC';
    res.json(db.all(sql, params));
  });

  router.post('/mat-requests', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { student_id, company_id, contact_id, title, deadline, notes,
            remind_days_before, overdue_interval_days, max_overdue_reminders, items } = req.body;
    if (!company_id || !contact_id || !title || !deadline)
      return res.status(400).json({ error: '中介公司、联系人、标题、截止日期必填' });
    if (!items || items.length === 0)
      return res.status(400).json({ error: '至少需要一个材料项目' });

    const id = uuidv4();
    db.run(`INSERT INTO mat_requests (id,student_id,company_id,contact_id,counselor_id,title,deadline,notes,
      remind_days_before,overdue_interval_days,max_overdue_reminders,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, student_id||null, company_id, contact_id,
       req.session.user.id, title, deadline, notes||null,
       remind_days_before || 3, overdue_interval_days || 2, max_overdue_reminders || 5,
       req.session.user.id]);

    (items || []).forEach((item, idx) => {
      db.run(`INSERT INTO mat_request_items (id,request_id,name,description,is_required,sort_order) VALUES (?,?,?,?,?,?)`,
        [uuidv4(), id, item.name, item.description||null, item.is_required !== false ? 1 : 0, idx]);
    });

    const contact = db.get(`SELECT * FROM mat_contacts WHERE id=?`, [contact_id]);
    const { link } = _matCreateMagicLink(id, contact_id);
    const req2 = db.get(`SELECT * FROM mat_requests WHERE id=?`, [id]);
    _matSendInviteEmail(req2, contact, link, 'invite');

    _matAudit(id, 'internal', req.session.user.id, req.session.user.username, 'REQUEST_CREATED', { title, deadline }, req.ip);
    res.json({ id });
  });

  router.get('/mat-requests/:id', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const r = db.get(`SELECT mr.*,
      mc.name as company_name, ct.name as contact_name, ct.email as contact_email, ct.phone as contact_phone,
      s.name as student_name
      FROM mat_requests mr
      JOIN mat_companies mc ON mr.company_id=mc.id
      JOIN mat_contacts ct ON mr.contact_id=ct.id
      LEFT JOIN students s ON mr.student_id=s.id
      WHERE mr.id=?`, [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Not found' });
    r.items = db.all(`SELECT * FROM mat_request_items WHERE request_id=? ORDER BY sort_order`, [req.params.id]);
    r.uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [req.params.id]);
    r.reminders = db.all(`SELECT * FROM mat_reminder_logs WHERE request_id=? ORDER BY sent_at DESC LIMIT 20`, [req.params.id]);
    res.json(r);
  });

  router.put('/mat-requests/:id', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { deadline, notes, auto_remind_paused, status } = req.body;
    const existing = db.get(`SELECT * FROM mat_requests WHERE id=?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.run(`UPDATE mat_requests SET deadline=?,notes=?,auto_remind_paused=?,status=?,updated_at=datetime('now') WHERE id=?`,
      [deadline || existing.deadline, notes !== undefined ? notes : existing.notes,
       auto_remind_paused !== undefined ? auto_remind_paused : existing.auto_remind_paused,
       status || existing.status, req.params.id]);
    res.json({ ok: true });
  });

  router.delete('/mat-requests/:id', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    db.run(`UPDATE mat_requests SET status='CANCELLED', updated_at=datetime('now') WHERE id=?`, [req.params.id]);
    db.run(`UPDATE mat_magic_tokens SET status='REVOKED' WHERE request_id=? AND status='ACTIVE'`, [req.params.id]);
    res.json({ ok: true });
  });

  router.post('/mat-requests/:id/remind', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const r = db.get(`SELECT mr.*,ct.name as contact_name,ct.email as contact_email
      FROM mat_requests mr JOIN mat_contacts ct ON mr.contact_id=ct.id WHERE mr.id=?`, [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Not found' });
    const contact = { name: r.contact_name, email: r.contact_email };
    const { link } = _matCreateMagicLink(r.id, r.contact_id);
    _matSendInviteEmail(r, contact, link, 'overdue');
    db.run(`INSERT INTO mat_reminder_logs (id,request_id,type,sent_to,status) VALUES (?,?,?,?,?)`,
      [uuidv4(), r.id, 'manual', contact.email, 'sent']);
    _matAudit(r.id, 'internal', req.session.user.id, req.session.user.username, 'MANUAL_REMIND', {}, req.ip);
    res.json({ ok: true });
  });

  router.put('/mat-request-items/:id/review', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { action, reason } = req.body;
    if (!['approve','reject'].includes(action)) return res.status(400).json({ error: '无效操作' });
    const item = db.get(`SELECT * FROM mat_request_items WHERE id=?`, [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    db.run(`UPDATE mat_request_items SET status=?,reject_reason=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=?`,
      [status, reason||null, req.session.user.id, req.params.id]);

    const allItems = db.all(`SELECT * FROM mat_request_items WHERE request_id=?`, [item.request_id]);
    const allApproved = allItems.every(i => i.id === req.params.id ? status === 'APPROVED' : i.status === 'APPROVED');
    if (allApproved) {
      db.run(`UPDATE mat_requests SET status='APPROVED',updated_at=datetime('now') WHERE id=?`, [item.request_id]);
    }

    res.json({ ok: true });
  });

  // UIF 操作
  router.get('/mat-uif/:requestId', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [req.params.requestId]);
    res.json(uif || { request_id: req.params.requestId, data: '{}', status: 'DRAFT' });
  });

  router.get('/mat-requests/:id/uif', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [req.params.id]);
    res.json(uif || { request_id: req.params.id, data: '{}', status: 'DRAFT' });
  });

  router.put('/mat-uif/:requestId/field-notes', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { field_notes } = req.body;
    db.run(`UPDATE mat_uif_submissions SET field_notes=? WHERE request_id=?`,
      [field_notes ? JSON.stringify(field_notes) : null, req.params.requestId]);
    res.json({ ok: true });
  });

  router.post('/mat-uif/:requestId/merge', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const { fields } = req.body;
    const uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [req.params.requestId]);
    if (!uif) return res.status(404).json({ error: 'UIF not found' });
    const r = db.get(`SELECT * FROM mat_requests WHERE id=?`, [req.params.requestId]);
    if (!r?.student_id) return res.status(400).json({ error: '该请求未关联学生档案' });

    const directMap = {
      dob:   'date_of_birth',
      grade: 'grade_level',
    };

    const fieldLabels = {
      cn_name:'中文姓名', en_name:'英文姓名', gender:'性别', dob:'出生日期',
      nationality:'国籍', passport_no:'护照号码', passport_expiry:'护照有效期',
      phone:'手机号码', email:'电子邮箱', wechat:'微信号', emergency_name:'紧急联系人',
      emergency_rel:'关系', emergency_phone:'紧急联系电话',
      school:'就读学校', grade:'年级', grad_date:'预计毕业日期', grades_notes:'成绩情况',
      ielts:'雅思成绩', toefl:'托福成绩', other_lang:'其他语言成绩',
      target_countries:'目标国家', target_major:'目标专业', intake_season:'申请轮次',
      budget:'留学预算', scholarship:'奖学金需求', activities:'课外活动',
      ps_draft:'个人陈述草稿', agent_notes:'中介备注',
    };

    const applied = [];
    const notesLines = [];

    for (const [field, value] of Object.entries(fields || {})) {
      if (!value) continue;
      const col = directMap[field];
      if (col) {
        db.run(`UPDATE students SET ${col}=?, updated_at=datetime('now') WHERE id=?`, [value, r.student_id]);
      } else {
        notesLines.push(`${fieldLabels[field] || field}: ${value}`);
      }
      applied.push(field);
    }

    if (notesLines.length > 0) {
      const student = db.get(`SELECT notes FROM students WHERE id=?`, [r.student_id]);
      const existing = student?.notes || '';
      const dateStr = new Date().toLocaleDateString('zh-CN');
      const block = `\n\n== UIF 信息（${dateStr}）==\n` + notesLines.join('\n');
      db.run(`UPDATE students SET notes=?, updated_at=datetime('now') WHERE id=?`,
        [(existing + block).trim(), r.student_id]);
    }

    db.run(`UPDATE mat_uif_submissions SET status='MERGED', merged_at=datetime('now'),
      merge_diff=?, reviewed_by=?, reviewed_at=datetime('now') WHERE request_id=?`,
      [JSON.stringify({ applied, fields }), req.session.user.id, req.params.requestId]);
    db.run(`UPDATE mat_requests SET status='COMPLETED', updated_at=datetime('now') WHERE id=?`, [req.params.requestId]);
    _matAudit(req.params.requestId, 'internal', req.session.user.id, req.session.user.username, 'UIF_MERGED', { applied }, req.ip);
    res.json({ ok: true, applied });
  });

  // ── 外部 Agent Workspace API (Magic Link 鉴权) ────────

  function _agentRateLimit(token, res) {
    const now = Date.now();
    const key = token ? token.slice(0, 16) : 'anon';
    let r = agentCallAttempts.get(key);
    if (!r || now > r.resetAt) { r = { count: 0, resetAt: now + AGENT_CALL_WINDOW_MS }; agentCallAttempts.set(key, r); }
    r.count++;
    if (r.count > AGENT_CALL_MAX) {
      res.status(429).json({ error: 'TOO_MANY_REQUESTS' });
      return false;
    }
    return true;
  }

  router.get('/agent/auth', (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token' });
    if (!_agentRateLimit(token, res)) return;
    const v = _matValidateToken(token, req.ip);
    if (v.error) return res.status(v.status).json({ error: v.error });
    const contact = db.get(`SELECT id,name,email,phone FROM mat_contacts WHERE id=?`, [v.rec.contact_id]);
    const r = db.get(`SELECT mr.*,mc.name as company_name FROM mat_requests mr
      JOIN mat_companies mc ON mr.company_id=mc.id WHERE mr.id=?`, [v.rec.request_id]);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    if (['CANCELLED', 'COMPLETED'].includes(r.status)) return res.status(403).json({ error: `REQUEST_${r.status}` });
    r.return_reason = r.return_reason || null;
    r.editable = ['PENDING','IN_PROGRESS','REVISION_NEEDED'].includes(r.status);
    res.json({ request: r, contact, token });
  });

  router.get('/agent/workspace', (req, res) => {
    const { token } = req.query;
    if (!_agentRateLimit(token, res)) return;
    const v = _matValidateToken(token, req.ip);
    if (v.error) return res.status(v.status).json({ error: v.error });
    const r = db.get(`SELECT mr.*,mc.name as company_name,ct.name as contact_name
      FROM mat_requests mr JOIN mat_companies mc ON mr.company_id=mc.id
      JOIN mat_contacts ct ON mr.contact_id=ct.id WHERE mr.id=?`, [v.rec.request_id]);
    if (['CANCELLED', 'COMPLETED'].includes(r?.status)) return res.status(403).json({ error: `REQUEST_${r.status}` });
    r.items = db.all(`SELECT * FROM mat_request_items WHERE request_id=? ORDER BY sort_order`, [v.rec.request_id]);
    r.uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [v.rec.request_id])
             || { data: '{}', status: 'DRAFT' };
    r.return_reason = r.return_reason || null;
    r.field_notes = null;
    try { r.field_notes = r.uif.field_notes ? JSON.parse(r.uif.field_notes) : null; } catch(e) {}
    r.versions = db.all(`SELECT id, version_no, status, submitted_at, reviewed_at, return_reason FROM mat_uif_versions WHERE request_id=? ORDER BY version_no DESC`, [v.rec.request_id]);
    r.editable = ['PENDING','IN_PROGRESS','REVISION_NEEDED'].includes(r.status);
    res.json(r);
  });

  router.post('/agent/upload/:itemId', upload.single('file'), (req, res) => {
    const { token } = req.query;
    if (!_agentRateLimit(token, res)) return;
    const v = _matValidateToken(token, req.ip);
    if (v.error) return res.status(v.status).json({ error: v.error });
    const reqStatus = db.get(`SELECT status FROM mat_requests WHERE id=?`, [v.rec.request_id]);
    if (reqStatus && ['CANCELLED', 'COMPLETED'].includes(reqStatus.status)) {
      return res.status(403).json({ error: `REQUEST_${reqStatus.status}` });
    }

    const item = db.get(`SELECT mi.* FROM mat_request_items mi
      JOIN mat_requests mr ON mi.request_id=mr.id
      WHERE mi.id=? AND mr.id=?`, [req.params.itemId, v.rec.request_id]);
    if (!item) return res.status(403).json({ error: 'FORBIDDEN' });
    if (item.status === 'APPROVED') return res.status(403).json({ error: 'ITEM_ALREADY_APPROVED' });
    if (!req.file) return res.status(400).json({ error: '未收到文件' });

    const fileId = req.file.filename;
    moveUploadedFile(fileId, 'material');
    const curFileVer = db.get(`SELECT MAX(version_no) as mv FROM mat_item_versions WHERE item_id=?`, [req.params.itemId]);
    const fileVersionNo = (curFileVer?.mv || 0) + 1;
    db.run(`UPDATE mat_item_versions SET is_current=0 WHERE item_id=? AND is_current=1`, [req.params.itemId]);
    db.run(`INSERT INTO mat_item_versions (id,item_id,request_id,version_no,file_id,file_name,file_size,status,uploaded_at,is_current) VALUES (?,?,?,?,?,?,?,?,datetime('now'),1)`,
      [uuidv4(), req.params.itemId, v.rec.request_id, fileVersionNo, fileId, req.file.originalname, req.file.size, 'UPLOADED']);
    db.run(`UPDATE mat_request_items SET status='UPLOADED',file_id=?,file_name=?,file_size=?,uploaded_at=datetime('now'),
      reject_reason=NULL,version_no=? WHERE id=?`,
      [fileId, req.file.originalname, req.file.size, fileVersionNo, req.params.itemId]);

    const r = db.get(`SELECT status FROM mat_requests WHERE id=?`, [v.rec.request_id]);
    if (r && r.status === 'PENDING') {
      db.run(`UPDATE mat_requests SET status='IN_PROGRESS',updated_at=datetime('now') WHERE id=?`, [v.rec.request_id]);
    }

    const allItems = db.all(`SELECT * FROM mat_request_items WHERE request_id=?`, [v.rec.request_id]);
    const requiredPending = allItems.filter(i => i.is_required && (i.id === req.params.itemId ? false : i.status === 'PENDING'));
    if (requiredPending.length === 0) {
      db.run(`UPDATE mat_requests SET status='SUBMITTED',updated_at=datetime('now') WHERE id=?`, [v.rec.request_id]);
    }

    _matAudit(v.rec.request_id, 'agent', v.rec.contact_id, '', 'FILE_UPLOAD', { item: item.name, file: req.file.originalname }, req.ip);
    res.json({ ok: true, file_id: fileId, file_name: req.file.originalname, file_size: req.file.size });
  });

  router.get('/agent/uif', (req, res) => {
    const { token } = req.query;
    if (!_agentRateLimit(token, res)) return;
    const v = _matValidateToken(token, req.ip);
    if (v.error) return res.status(v.status).json({ error: v.error });
    const uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [v.rec.request_id])
                || { data: '{}', status: 'DRAFT' };
    res.json(uif);
  });

  router.put('/agent/uif', (req, res) => {
    const { token } = req.query;
    if (!_agentRateLimit(token, res)) return;
    const v = _matValidateToken(token, req.ip);
    if (v.error) return res.status(v.status).json({ error: v.error });
    const reqStatus = db.get(`SELECT status FROM mat_requests WHERE id=?`, [v.rec.request_id]);
    if (reqStatus && ['CANCELLED', 'COMPLETED'].includes(reqStatus.status)) {
      return res.status(403).json({ error: `REQUEST_${reqStatus.status}` });
    }
    if (reqStatus && ['SUBMITTED','APPROVED'].includes(reqStatus.status)) {
      return res.status(403).json({ error: '已提交审核中，不能修改' });
    }
    const { data } = req.body;
    const existing = db.get(`SELECT id, data AS old_data FROM mat_uif_submissions WHERE request_id=?`, [v.rec.request_id]);
    if (existing) {
      let merged = data;
      if (existing.old_data) {
        try {
          const old = JSON.parse(existing.old_data);
          if (!merged._id_photo_data && old._id_photo_data) merged._id_photo_data = old._id_photo_data;
          if (!merged._id_photo_file && old._id_photo_file) merged._id_photo_file = old._id_photo_file;
          if ((!merged._signatures || !Object.keys(merged._signatures).length) && old._signatures && Object.keys(old._signatures).length) {
            merged._signatures = old._signatures;
          }
        } catch(e) {}
      }
      db.run(`UPDATE mat_uif_submissions SET data=? WHERE request_id=?`, [JSON.stringify(merged), v.rec.request_id]);
    } else {
      db.run(`INSERT INTO mat_uif_submissions (id,request_id,data,status) VALUES (?,?,?,?)`,
        [uuidv4(), v.rec.request_id, JSON.stringify(data), 'DRAFT']);
    }
    res.json({ ok: true });
  });

  router.post('/agent/uif/submit', (req, res) => {
    console.log('[SUBMIT] called, token:', (req.query.token||'').slice(0,8));
    const { token } = req.query;
    if (!_agentRateLimit(token, res)) { console.log('[SUBMIT] rate limited'); return; }
    const v = _matValidateToken(token, req.ip);
    if (v.error) { console.log('[SUBMIT] token error:', v.error); return res.status(v.status).json({ error: v.error }); }
    console.log('[SUBMIT] request_id:', v.rec.request_id.slice(0,8));
    const mr = db.get(`SELECT status, current_version FROM mat_requests WHERE id=?`, [v.rec.request_id]);
    console.log('[SUBMIT] mr.status:', mr?.status, 'version:', mr?.current_version);
    if (mr && ['CANCELLED', 'COMPLETED'].includes(mr.status)) {
      console.log('[SUBMIT] BLOCKED: request cancelled/completed');
      return res.status(403).json({ error: `REQUEST_${mr.status}` });
    }
    if (mr && mr.status === 'SUBMITTED') {
      const uifCheck = db.get(`SELECT status FROM mat_uif_submissions WHERE request_id=?`, [v.rec.request_id]);
      console.log('[SUBMIT] duplicate check: uif.status=', uifCheck?.status);
      if (uifCheck && uifCheck.status === 'SUBMITTED') {
        console.log('[SUBMIT] BLOCKED: already submitted');
        return res.status(400).json({ error: '已提交，请等待审核' });
      }
      console.log('[SUBMIT] ALLOWED: uif not SUBMITTED, proceeding to fix');
    }

    const rejectedItems = db.all(`SELECT name FROM mat_request_items WHERE request_id=? AND status='REJECTED'`, [v.rec.request_id]);
    if (rejectedItems.length) {
      return res.status(400).json({ error: '以下文件已被退回，请重新上传后再提交：' + rejectedItems.map(i => i.name).join('、') });
    }

    const { data } = req.body;
    const dataStr = JSON.stringify(data);
    const newVersion = (mr?.current_version || 0) + 1;

    const existing = db.get(`SELECT id, status FROM mat_uif_submissions WHERE request_id=?`, [v.rec.request_id]);
    console.log('[UIF SUBMIT]', v.rec.request_id.slice(0,8), 'existing:', existing ? 'id='+existing.id.slice(0,8)+' status='+existing.status : 'NONE', '→ newVersion:', newVersion);
    if (existing) {
      db.run(`UPDATE mat_uif_submissions SET data=?,status='SUBMITTED',submitted_at=datetime('now'),version_no=?,return_reason=NULL,field_notes=NULL WHERE request_id=?`,
        [dataStr, newVersion, v.rec.request_id]);
    } else {
      db.run(`INSERT INTO mat_uif_submissions (id,request_id,data,status,submitted_at,version_no) VALUES (?,?,?,?,datetime('now'),?)`,
        [uuidv4(), v.rec.request_id, dataStr, 'SUBMITTED', newVersion]);
    }
    const verify = db.get(`SELECT status FROM mat_uif_submissions WHERE request_id=?`, [v.rec.request_id]);
    console.log('[UIF SUBMIT] after update:', verify?.status);

    db.run(`UPDATE mat_uif_versions SET is_current=0 WHERE request_id=?`, [v.rec.request_id]);
    db.run(`INSERT INTO mat_uif_versions (id,request_id,version_no,data,status,submitted_at,is_current) VALUES (?,?,?,?,?,datetime('now'),1)`,
      [uuidv4(), v.rec.request_id, newVersion, dataStr, 'SUBMITTED']);

    db.run(`UPDATE mat_requests SET status='SUBMITTED',current_version=?,updated_at=datetime('now'),return_reason=NULL,returned_at=NULL WHERE id=?`,
      [newVersion, v.rec.request_id]);

    const caseId = db.get(`SELECT intake_case_id FROM mat_requests WHERE id=?`, [v.rec.request_id])?.intake_case_id;
    if (caseId) {
      const profileId = db.get(`SELECT adm_profile_id FROM intake_cases WHERE id=?`, [caseId])?.adm_profile_id;
      if (profileId) {
        db.run(`UPDATE adm_generated_documents SET is_outdated=1 WHERE profile_id=? AND is_latest=1`, [profileId]);
      }
    }

    _matAudit(v.rec.request_id, 'agent', v.rec.contact_id, '', 'UIF_SUBMITTED', { version: newVersion }, req.ip);
    res.json({ ok: true, version: newVersion });
  });

  // ── POST /api/mat-requests/:id/approve ──
  router.post('/mat-requests/:id/approve', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const mr = db.get(`SELECT * FROM mat_requests WHERE id=?`, [req.params.id]);
    if (!mr) return res.status(404).json({ error: '请求不存在' });
    if (!['SUBMITTED','REVISION_NEEDED','APPROVED','MERGED'].includes(mr.status)) return res.status(400).json({ error: '当前状态不允许审核通过: ' + mr.status });

    db.run(`UPDATE mat_requests SET status='APPROVED',approved_at=datetime('now'),return_reason=NULL,updated_at=datetime('now') WHERE id=?`, [req.params.id]);
    db.run(`UPDATE mat_uif_submissions SET status='APPROVED',return_reason=NULL,field_notes=NULL,reviewed_by=?,reviewed_at=datetime('now') WHERE request_id=?`,
      [req.session.user.id, req.params.id]);
    db.run(`UPDATE mat_uif_versions SET status='APPROVED',reviewed_by=?,reviewed_at=datetime('now') WHERE request_id=? AND is_current=1`,
      [req.session.user.id, req.params.id]);

    _matAudit(req.params.id, 'internal', req.session.user.id, req.session.user.name||'', 'UIF_APPROVED', { version: mr.current_version }, req.ip);
    db.run(`INSERT INTO mat_review_actions (id,request_id,action_type,actor_id,actor_name,version_no,ip_address) VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), req.params.id, 'APPROVE', req.session.user.id, req.session.user.name||'', mr.current_version, req.ip]);
    res.json({ ok: true });
  });

  // ── POST /api/mat-requests/:id/return ──
  router.post('/mat-requests/:id/return', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const mr = db.get(`SELECT * FROM mat_requests WHERE id=?`, [req.params.id]);
    if (!mr) return res.status(404).json({ error: '请求不存在' });
    if (!['SUBMITTED','APPROVED','MERGED','REVISION_NEEDED'].includes(mr.status)) return res.status(400).json({ error: '当前状态不允许打回: ' + mr.status });

    const { reason, field_notes, file_rejects, add_items } = req.body;
    if (!reason) return res.status(400).json({ error: '请填写退回原因' });

    db.run(`UPDATE mat_requests SET status='REVISION_NEEDED',return_reason=?,returned_at=datetime('now'),updated_at=datetime('now') WHERE id=?`,
      [reason, req.params.id]);

    db.run(`UPDATE mat_uif_submissions SET status='RETURNED',return_reason=?,field_notes=?,reviewed_by=?,reviewed_at=datetime('now') WHERE request_id=?`,
      [reason, field_notes ? JSON.stringify(field_notes) : null, req.session.user.id, req.params.id]);
    db.run(`UPDATE mat_uif_versions SET status='RETURNED',return_reason=?,reviewed_by=?,reviewed_at=datetime('now') WHERE request_id=? AND is_current=1`,
      [reason, req.session.user.id, req.params.id]);

    const rejectedFiles = [];
    if (file_rejects && file_rejects.length) {
      for (const fr of file_rejects) {
        const item = db.get(`SELECT id, name FROM mat_request_items WHERE id=? AND request_id=?`, [fr.item_id, req.params.id]);
        if (item) {
          db.run(`UPDATE mat_request_items SET status='REJECTED',reject_reason=? WHERE id=?`, [fr.reason || '需要重新上传', item.id]);
          rejectedFiles.push({ name: item.name, reason: fr.reason || '需要重新上传' });
        }
      }
    }

    const addedItems = [];
    if (add_items && add_items.length) {
      for (const item of add_items) {
        if (!item.name || !item.name.trim()) continue;
        const itemId = uuidv4();
        db.run(`INSERT INTO mat_request_items (id, request_id, name, is_required, status) VALUES (?,?,?,?,?)`,
          [itemId, req.params.id, item.name.trim(), item.is_required ? 1 : 0, 'PENDING']);
        addedItems.push({ name: item.name.trim(), is_required: !!item.is_required });
      }
    }

    if (mr.intake_case_id) {
      const profileId = db.get(`SELECT adm_profile_id FROM intake_cases WHERE id=?`, [mr.intake_case_id])?.adm_profile_id;
      if (profileId) db.run(`UPDATE adm_generated_documents SET is_outdated=1 WHERE profile_id=? AND is_latest=1`, [profileId]);
    }

    _matAudit(req.params.id, 'internal', req.session.user.id, req.session.user.name||'', 'RETURNED', {
      reason, field_notes: field_notes || null, rejected_files: rejectedFiles.length ? rejectedFiles : null,
      version: mr.current_version
    }, req.ip);
    db.run(`INSERT INTO mat_review_actions (id,request_id,action_type,actor_id,actor_name,reason,field_notes,file_rejects,add_items,version_no,ip_address) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), req.params.id, 'RETURN', req.session.user.id, req.session.user.name||'',
       reason, field_notes ? JSON.stringify(field_notes) : null,
       rejectedFiles.length ? JSON.stringify(rejectedFiles) : null,
       addedItems.length ? JSON.stringify(addedItems) : null,
       mr.current_version, req.ip]);

    try {
      const contact = db.get(`SELECT name,email FROM mat_contacts WHERE id=?`, [mr.contact_id]);
      const tk = db.get(`SELECT token FROM mat_magic_tokens WHERE request_id=? AND status='ACTIVE'`, [req.params.id]);
      if (contact?.email && tk) {
        const link = `${req.protocol}://${req.get('host')}/agent.html?token=${tk.token}`;

        let sections = '';
        sections += `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:14px;margin:0 0 16px;">
          <strong style="color:#dc2626;">⚠ 您的材料需要修改</strong>
          <p style="margin:8px 0 0;color:#333;white-space:pre-line">${escHtml(reason)}</p>
        </div>`;

        if (addedItems.length) {
          sections += `<div style="margin:0 0 16px;padding:12px 16px;background:#f5f3ff;border-radius:6px;border:1px solid #c4b5fd;">
            <strong style="color:#7c3aed;">📎 需要额外上传的文件</strong>
            <ul style="margin:8px 0 0;padding-left:20px">
              ${addedItems.map(a => `<li style="margin:4px 0"><strong>${escHtml(a.name)}</strong>${a.is_required ? ' <span style="color:#dc2626">(必须)</span>' : ' (可选)'}</li>`).join('')}
            </ul>
          </div>`;
        }

        sections += `<div style="margin:16px 0 0;padding:12px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0;">
          <p style="margin:0;color:#166534;font-size:14px"><strong>操作说明：</strong></p>
          <p style="margin:4px 0 0;color:#333;font-size:13px">请点击下方链接进入材料收集页面。系统会保留您之前填写的内容。</p>
        </div>`;

        const _emRet = brandedEmail(sections, {
          greeting: `您好 ${escHtml(contact.name)}，`,
          buttonUrl: link,
          buttonText: '修改并重新提交 →',
          footerExtra: '如有疑问请联系顾问。'
        });
        sendMail(contact.email, `【修改通知】${mr.title} 需要修改`, _emRet.html, _emRet.attachments).catch(e => console.error('[MAT RETURN MAIL]', e.message));
      }
    } catch(e) { console.error('Return email failed:', e.message); }

    res.json({ ok: true });
  });

  // ── POST /api/mat-requests/:id/add-items ──
  router.post('/mat-requests/:id/add-items', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const mr = db.get(`SELECT * FROM mat_requests WHERE id=?`, [req.params.id]);
    if (!mr) return res.status(404).json({ error: '请求不存在' });
    if (['CANCELLED','COMPLETED'].includes(mr.status)) return res.status(400).json({ error: '请求已结束' });

    const { items, notify } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: '请添加至少一个文件项' });

    const added = [];
    for (const item of items) {
      if (!item.name || !item.name.trim()) continue;
      const itemId = uuidv4();
      db.run(`INSERT INTO mat_request_items (id, request_id, name, is_required, status) VALUES (?,?,?,?,?)`,
        [itemId, mr.id, item.name.trim(), item.is_required ? 1 : 0, 'PENDING']);
      added.push({ id: itemId, name: item.name.trim(), is_required: !!item.is_required });
    }

    if (['APPROVED','MERGED','SUBMITTED'].includes(mr.status)) {
      db.run(`UPDATE mat_requests SET status='REVISION_NEEDED',return_reason=?,updated_at=datetime('now') WHERE id=?`,
        ['需要补充材料: ' + added.map(a => a.name).join(', '), mr.id]);
    }

    _matAudit(mr.id, 'internal', req.session.user.id, req.session.user.name||'', 'ITEMS_ADDED',
      { items: added.map(a => a.name) }, req.ip);

    if (notify) {
      try {
        const tk = db.get(`SELECT token FROM mat_magic_tokens WHERE request_id=? AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`, [mr.id]);
        const contact = db.get(`SELECT c.name, c.email FROM mat_contacts c JOIN mat_requests mr ON mr.contact_id=c.id WHERE mr.id=?`, [mr.id]);
        if (tk && contact) {
          const link = `${req.protocol}://${req.get('host')}/agent.html?token=${tk.token}`;
          const itemList = added.map(a => `<li>${escHtml(a.name)}${a.is_required ? ' <span style="color:#dc2626">(必须)</span>' : ' (可选)'}</li>`).join('');
          const _em = brandedEmail(
            `<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;padding:14px;margin:0 0 16px;">
              <strong style="color:#1d4ed8;">📎 需要补充材料</strong>
              <p style="margin:8px 0 0;color:#333;">请补充上传以下文件：</p>
              <ul style="margin:8px 0 0;padding-left:20px">${itemList}</ul>
            </div>
            <p style="color:#555;">请通过以下链接上传补充材料：</p>`,
            { greeting: `您好 ${escHtml(contact.name)}，`, buttonUrl: link, buttonText: '上传补充材料 →', footerExtra: '如有疑问请联系顾问。' }
          );
          sendMail(contact.email, `【补充材料】${mr.title}`, _em.html, _em.attachments).catch(e => console.error('[ADD ITEMS MAIL]', e.message));
        }
      } catch(e) { console.error('Add items email failed:', e.message); }
    }

    res.json({ ok: true, added });
  });

  // ── GET /api/mat-requests/:id/versions ──
  router.get('/mat-requests/:id/versions', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const versions = db.all(`SELECT id, version_no, status, submitted_at, reviewed_at, return_reason, field_notes, reviewed_by FROM mat_uif_versions WHERE request_id=? ORDER BY version_no DESC`, [req.params.id]);
    const itemVersions = db.all(`SELECT iv.*, mi.name as item_name FROM mat_item_versions iv JOIN mat_request_items mi ON iv.item_id=mi.id WHERE iv.request_id=? ORDER BY iv.version_no DESC`, [req.params.id]);
    res.json({ uifVersions: versions, itemVersions });
  });

  router.get('/mat-request-items/:id/versions', requireAuth, (req, res) => {
    const versions = db.all(`SELECT * FROM mat_item_versions WHERE item_id=? ORDER BY version_no DESC`, [req.params.id]);
    res.json(versions);
  });

  // ── POST /api/mat-requests/:id/generate-documents ──
  router.post('/mat-requests/:id/generate-documents', requireAuth, requireRole('principal','counselor','intake_staff','student_admin'), (req, res) => {
    const requestId = req.params.id;
    const request = db.get(`SELECT * FROM mat_requests WHERE id=?`, [requestId]);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=? AND status IN ('SUBMITTED','APPROVED','MERGED')`, [requestId]);
    if (!uif) return res.status(400).json({ error: 'UIF 尚未提交或未通过审核' });
    if (uif.status === 'SUBMITTED' && !req.body.force) {
      _matAudit(requestId, 'internal', req.session.user.id, req.session.user.name||'', 'PDF_GENERATED_WITHOUT_APPROVAL', { version: uif.version_no }, req.ip);
    }

    let data;
    try { data = JSON.parse(uif.data || '{}'); } catch(e) { return res.status(400).json({ error: 'Invalid UIF data' }); }

    const intakeCaseId = request.intake_case_id || null;

    let profile = intakeCaseId
      ? db.get(`SELECT * FROM adm_profiles WHERE intake_case_id=?`, [intakeCaseId])
      : db.get(`SELECT * FROM adm_profiles WHERE intake_case_id=?`, [requestId]);
    const profileId = profile ? profile.id : uuidv4();

    const profileFields = [
      'course_name','course_code','intake_year','intake_month','study_mode','campus','school_name',
      'surname','given_name','chinese_name','alias','gender','dob','birth_certificate_no',
      'nationality','birth_country','birth_city','race','religion','occupation','marital_status',
      'email','phone_mobile','phone_home',
      'passport_type','passport_no','passport_issue_date','passport_expiry','passport_issue_country','passport_issue_place',
      'foreign_identification_no','malaysian_id_no',
      'sg_pass_type','sg_nric_fin','sg_pass_expiry','was_ever_sg_citizen_or_pr','requires_student_pass',
      'prior_sg_study','prior_sg_school','prior_sg_year',
      'address_line1','address_line2','city','state_province','postal_code','country_of_residence',
      'sg_address','sg_tel_no','hometown_address',
      'native_language','english_proficiency','ielts_score','toefl_score','other_lang_test','other_lang_score',
      'highest_lang_proficiency','need_english_placement_test',
      'financial_source','annual_income','sponsor_name','sponsor_relation','bank_statement_available',
      'applicant_monthly_income','applicant_current_saving','spouse_monthly_income','spouse_current_saving',
      'father_monthly_income','father_current_saving','mother_monthly_income','mother_current_saving',
      'other_financial_support','other_financial_details','other_financial_amount',
      'antecedent_q1','antecedent_q2','antecedent_q3','antecedent_q4','antecedent_remarks',
      'pdpa_consent','pdpa_marketing','pdpa_photo_video','remarks',
      'period_applied_from','period_applied_to',
      'f16_declaration_agreed','v36_declaration_agreed',
      'no_education_info','no_employment_info',
    ];

    const boolFields = ['antecedent_q1','antecedent_q2','antecedent_q3','antecedent_q4',
      'was_ever_sg_citizen_or_pr','requires_student_pass','prior_sg_study',
      'need_english_placement_test','other_financial_support','bank_statement_available',
      'pdpa_consent','pdpa_marketing','pdpa_photo_video','f16_declaration_agreed','v36_declaration_agreed',
      'no_education_info','no_employment_info'];
    boolFields.forEach(f => { if (data[f] !== undefined) data[f] = (data[f] === '1' || data[f] === true || data[f] === 1) ? 1 : 0; });

    if (!profile) {
      const cols = ['id','intake_case_id','created_by','source_type','status','step_completed','created_at','updated_at'];
      const vals = [profileId, intakeCaseId || requestId, req.session.user.id, 'agent', 'submitted', 11, new Date().toISOString(), new Date().toISOString()];
      profileFields.forEach(f => { if (data[f] !== undefined) { cols.push(f); vals.push(data[f]); } });
      db.run(`INSERT INTO adm_profiles (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`, vals);
    } else {
      const sets = ['updated_at=?','status=?'];
      const vals = [new Date().toISOString(), 'submitted'];
      profileFields.forEach(f => { if (data[f] !== undefined) { sets.push(`${f}=?`); vals.push(data[f]); } });
      vals.push(profileId);
      db.run(`UPDATE adm_profiles SET ${sets.join(',')} WHERE id=?`, vals);
    }

    if (data._id_photo_data && data._id_photo_data.startsWith('data:image/')) {
      try {
        const base64 = data._id_photo_data.replace(/^data:image\/\w+;base64,/, '');
        const ext = data._id_photo_data.match(/^data:image\/(\w+)/)?.[1] || 'jpg';
        const photoFileId = uuidv4() + '.' + ext;
        fileStorage.saveFile('photo', photoFileId, Buffer.from(base64, 'base64'));
        db.run(`UPDATE adm_profiles SET id_photo=? WHERE id=?`, [photoFileId, profileId]);
      } catch(e) { console.error('[ADM] Photo save error:', e.message); }
    }

    const _cleanArr = (arr) => (arr||[]).filter(item => Object.values(item).some(v => v && v !== ''));

    const familyArr = _cleanArr(data._family);
    if (familyArr.length > 0) {
      db.run(`DELETE FROM adm_family_members WHERE profile_id=?`, [profileId]);
      familyArr.forEach((m, idx) => {
        db.run(`INSERT INTO adm_family_members (id,profile_id,member_type,surname,given_name,dob,nationality,sg_status,nric_fin,occupation,sex,sg_mobile,email,contact_number,passport_no,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), profileId, m.member_type||'', m.surname||'', m.given_name||'', m.dob||null, m.nationality||'', m.sg_status||'', m.nric_fin||m.passport_no||'', m.occupation||'', m.sex||'', m.sg_mobile||'', m.email||'', m.contact_number||m.sg_mobile||'', m.passport_no||'', idx]);
      });
    }

    const resArr = _cleanArr(data._residence);
    if (resArr.length > 0) {
      db.run(`DELETE FROM adm_residence_history WHERE profile_id=?`, [profileId]);
      resArr.forEach((r, idx) => {
        db.run(`INSERT INTO adm_residence_history (id,profile_id,country,address,date_from,date_to,sort_order) VALUES (?,?,?,?,?,?,?)`,
          [uuidv4(), profileId, r.country||'', r.address||'', r.date_from||null, r.date_to||null, idx]);
      });
    }

    const eduArr = _cleanArr(data._education);
    if (eduArr.length > 0) {
      db.run(`DELETE FROM adm_education_history WHERE profile_id=?`, [profileId]);
      eduArr.forEach((e, idx) => {
        db.run(`INSERT INTO adm_education_history (id,profile_id,institution_name,country,state_province,language_of_instruction,date_from,date_to,qualification,educational_cert_no,obtained_pass_english,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), profileId, e.institution_name||'', e.country||'', e.state_province||'', e.language_of_instruction||'', e.date_from||null, e.date_to||null, e.qualification||'', e.educational_cert_no||'', e.obtained_pass_english==='1'||e.obtained_pass_english===true?1:0, idx]);
      });
    }

    const empArr = _cleanArr(data._employment);
    if (empArr.length > 0) {
      db.run(`DELETE FROM adm_employment_history WHERE profile_id=?`, [profileId]);
      empArr.forEach((e, idx) => {
        db.run(`INSERT INTO adm_employment_history (id,profile_id,employer,country,position,date_from,date_to,nature_of_duties,is_current,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), profileId, e.employer||'', e.country||'', e.position||'', e.date_from||null, e.date_to||null, e.nature_of_duties||'', e.is_current==='1'||e.is_current===true?1:0, idx]);
      });
    }

    if (data.birth_city && !data.birth_province_state) {
      db.run(`UPDATE adm_profiles SET birth_province_state=? WHERE id=?`, [data.birth_city, profileId]);
    }
    if (data.passport_issue_country && !data.passport_issue_place) {
      db.run(`UPDATE adm_profiles SET passport_issue_place=? WHERE id=? AND (passport_issue_place IS NULL OR passport_issue_place='')`, [data.passport_issue_country, profileId]);
    }
    if (data.intake_year && data.intake_month) {
      const monthMap = {January:'01',February:'02',March:'03',April:'04',May:'05',June:'06',July:'07',August:'08',September:'09',October:'10',November:'11',December:'12'};
      const mm = monthMap[data.intake_month] || '01';
      const comDate = `${data.intake_year}-${mm}-01`;
      db.run(`UPDATE adm_profiles SET commencement_date=?, period_applied_from=? WHERE id=?`, [comDate, comDate, profileId]);
      const endYear = parseInt(data.intake_year) + 2;
      const lastDay = new Date(endYear, parseInt(mm), 0).getDate();
      const toDate = `${endYear}-${mm}-${String(lastDay).padStart(2,'0')}`;
      db.run(`UPDATE adm_profiles SET period_applied_to=? WHERE id=? AND (period_applied_to IS NULL OR period_applied_to='')`, [toDate, profileId]);
    }
    if (!data.school_name) {
      db.run(`UPDATE adm_profiles SET school_name='Equistar International College' WHERE id=? AND (school_name IS NULL OR school_name='')`, [profileId]);
    }

    const guardianFields = ['surname','given_name','relation','nationality','phone','email','address','passport_no','occupation'];
    const hasGuardian = guardianFields.some(f => data['guardian_' + f]);
    if (hasGuardian) {
      db.run(`DELETE FROM adm_guardian_info WHERE profile_id=?`, [profileId]);
      db.run(`INSERT INTO adm_guardian_info (id,profile_id,surname,given_name,relation,nationality,phone,email,address,passport_no,occupation) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), profileId,
         data.guardian_surname||'', data.guardian_given_name||'', data.guardian_relation||'',
         data.guardian_nationality||'', data.guardian_phone||'', data.guardian_email||'',
         data.guardian_address||'', data.guardian_passport_no||'', data.guardian_occupation||'']);
    }

    const sigs = data._signatures || {};
    db.run(`DELETE FROM adm_signatures WHERE profile_id=?`, [profileId]);
    for (const sigType of ['applicant', 'guardian']) {
      const sig = sigs[sigType];
      if (sig && (sig.sig_data || sig.signer_name)) {
        let fileId = null;
        if (sig.sig_data && sig.sig_data.startsWith('data:image/png;base64,')) {
          const base64 = sig.sig_data.replace('data:image/png;base64,', '');
          fileId = uuidv4() + '.png';
          try {
            const sigPath = path.join(UPLOAD_DIR, fileId);
            fs.writeFileSync(sigPath, Buffer.from(base64, 'base64'));
          } catch(e) { console.error('[ADM] Signature save error:', e.message); fileId = null; }
        }
        db.run(`INSERT INTO adm_signatures (id,profile_id,sig_type,signer_name,file_id,sig_date) VALUES (?,?,?,?,?,?)`,
          [uuidv4(), profileId, sigType, sig.signer_name||'', fileId, sig.sig_date||new Date().toISOString().slice(0,10)]);
      }
    }
    if (!sigs.applicant && data.sig_date) {
      const sigName = (data.surname||'') + ' ' + (data.given_name||'');
      db.run(`INSERT INTO adm_signatures (id,profile_id,sig_type,signer_name,sig_date) VALUES (?,?,?,?,?)`,
        [uuidv4(), profileId, 'applicant', sigName.trim(), data.sig_date]);
    }

    const scPrParents = familyArr.filter(m => ['father','mother','step_father','step_mother'].includes(m.member_type) && ['SC','PR'].includes(m.sg_status));
    if (scPrParents.length > 0) {
      db.run(`DELETE FROM adm_parent_pr_additional WHERE profile_id=?`, [profileId]);
      const dbFamily = db.all(`SELECT id, member_type FROM adm_family_members WHERE profile_id=?`, [profileId]);
      scPrParents.forEach(par => {
        const dbMem = dbFamily.find(f => f.member_type === par.member_type);
        if (dbMem) {
          db.run(`INSERT INTO adm_parent_pr_additional (id,profile_id,family_member_id,marital_status,marriage_certificate_no,marriage_date,divorce_certificate_no,divorce_date,custody_of_applicant,school_name,school_country,highest_qualification,educational_cert_no,company_name,monthly_income,annual_income,avg_monthly_cpf) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [uuidv4(), profileId, dbMem.id, par.pr_marital_status||'', par.pr_marriage_cert||'', par.pr_marriage_date||null, par.pr_divorce_cert||'', par.pr_divorce_date||null, par.pr_custody?1:0, par.pr_school||'', par.pr_school_country||'', par.pr_qualification||'', par.pr_edu_cert||'', par.pr_company||'', par.pr_monthly_income||null, par.pr_annual_income||null, par.pr_cpf||null]);
        }
      });
    }

    const spouseMem = familyArr.find(m => m.member_type === 'spouse' && ['SC','PR'].includes(m.sg_status));
    if (spouseMem) {
      db.run(`DELETE FROM adm_spouse_pr_additional WHERE profile_id=?`, [profileId]);
      const dbSpouse = db.get(`SELECT id FROM adm_family_members WHERE profile_id=? AND member_type='spouse'`, [profileId]);
      if (dbSpouse) {
        db.run(`INSERT INTO adm_spouse_pr_additional (id,profile_id,family_member_id,marriage_certificate_no,marriage_date,school_name,school_country,highest_qualification,educational_cert_no,company_name,monthly_income,annual_income,avg_monthly_cpf) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), profileId, dbSpouse.id, spouseMem.sp_marriage_cert||'', spouseMem.sp_marriage_date||null, spouseMem.sp_school||'', spouseMem.sp_school_country||'', spouseMem.sp_qualification||'', spouseMem.sp_edu_cert||'', spouseMem.sp_company||'', spouseMem.sp_monthly_income||null, spouseMem.sp_annual_income||null, spouseMem.sp_cpf||null]);
      }
    }

    if (intakeCaseId) {
      db.run(`UPDATE intake_cases SET adm_profile_id=?, review_status='generating_documents' WHERE id=? AND (adm_profile_id IS NULL OR adm_profile_id='')`,
        [profileId, intakeCaseId]);
    }

    // Use the _admTriggerGeneration from adm-profiles module (passed via deps or inline)
    // For now, inline the trigger logic
    _admTriggerGeneration(profileId);

    db.run(`UPDATE mat_uif_submissions SET status='MERGED' WHERE request_id=?`, [requestId]);

    res.json({ ok: true, profileId });
  });

  // Helper for PDF generation trigger (shared with adm-profiles)
  const _generatingProfiles = new Set();
  function _admTriggerGeneration(profileId) {
    if (!pdfGenerator) {
      console.warn('[ADM] pdf-generator not loaded, skipping document generation');
      db.run(`UPDATE intake_cases SET review_status='pending_review' WHERE adm_profile_id=?`, [profileId]);
      return;
    }
    const p = db.get('SELECT surname,given_name,passport_no,dob,nationality,course_name FROM adm_profiles WHERE id=?', [profileId]);
    if (p) {
      const missing = [];
      if (!p.surname && !p.given_name) missing.push('姓名');
      if (!p.passport_no) missing.push('护照号');
      if (!p.dob) missing.push('出生日期');
      if (!p.nationality) missing.push('国籍');
      if (!p.course_name) missing.push('课程名称');
      if (missing.length > 0) {
        console.warn(`[ADM] PDF 生成跳过：缺少关键字段 [${missing.join(',')}]，profile=${profileId}`);
        db.run(`UPDATE intake_cases SET review_status='generation_failed' WHERE adm_profile_id=?`, [profileId]);
        return;
      }
    }
    if (_generatingProfiles.has(profileId)) {
      console.log(`[ADM] Generation already in progress for ${profileId}, skipping`);
      return;
    }
    _generatingProfiles.add(profileId);
    const _doGenerate = (attempt) => {
      pdfGenerator.generateAllDocuments(profileId, db, UPLOAD_DIR)
        .then(results => {
          _generatingProfiles.delete(profileId);
          const validResults = results.filter(r => {
            if (r.status !== 'done' || !r.file_id) return false;
            const size = fileStorage.getFileSize(r.file_id);
            if (size < 1000) {
              console.warn(`[ADM] 损坏的 PDF 已清理: ${r.file_id} (${size} bytes)`);
              fileStorage.deleteFile(r.file_id);
              return false;
            }
            return true;
          });
          const allOk = validResults.length === results.length && results.length > 0;
          const newStatus = allOk ? 'pending_review' : 'generation_failed';
          db.run(`UPDATE intake_cases SET review_status=? WHERE adm_profile_id=?`, [newStatus, profileId]);
          console.log(`[ADM] Document generation ${newStatus} for profile ${profileId} (${validResults.length}/${results.length} OK)`);
        })
        .catch(err => {
          console.error(`[ADM] Document generation error (attempt ${attempt}):`, err.message);
          if (attempt < 2) {
            console.log(`[ADM] Retrying in 3s... (attempt ${attempt + 1})`);
            setTimeout(() => _doGenerate(attempt + 1), 3000);
          } else {
            _generatingProfiles.delete(profileId);
            db.run(`UPDATE intake_cases SET review_status='generation_failed' WHERE adm_profile_id=?`, [profileId]);
          }
        });
    };
    _doGenerate(1);
  }

  // Expose for adm-profiles module
  router._admTriggerGeneration = _admTriggerGeneration;

  // Serve uploaded file (agent can download own file for preview)
  router.get('/agent/file/:fileId', (req, res) => {
    const { token } = req.query;
    const v = _matValidateToken(token, req.ip);
    if (v.error) return res.status(v.status).json({ error: v.error });
    const item = db.get(`SELECT mi.* FROM mat_request_items mi
      JOIN mat_requests mr ON mi.request_id=mr.id
      WHERE mi.file_id=? AND mr.id=?`, [req.params.fileId, v.rec.request_id]);
    const filePath = fileStorage.getFilePath(req.params.fileId);
    if (!item && !fs.existsSync(filePath)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.download(filePath, item?.file_name || req.params.fileId);
  });

  router.get('/mat-request-items/:id/download', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const item = db.get(`SELECT * FROM mat_request_items WHERE id=?`, [req.params.id]);
    if (!item || !item.file_id) return res.status(404).json({ error: 'File not found' });
    const filePath = fileStorage.getFilePath(item.file_id);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
    res.download(filePath, item.file_name || item.file_id);
  });

  router.get('/mat-request-items/:id/preview', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
    const item = db.get(`SELECT * FROM mat_request_items WHERE id=?`, [req.params.id]);
    if (!item || !item.file_id) return res.status(404).json({ error: 'File not found' });
    const filePath = fileStorage.getFilePath(item.file_id);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
    const ext = path.extname(item.file_id).toLowerCase();
    const mimeMap = {'.pdf':'application/pdf','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp'};
    const mime = mimeMap[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'inline; filename="' + (item.file_name || item.file_id) + '"');
    fs.createReadStream(filePath).pipe(res);
  });

  // ── 自动催件引擎 (每小时检查，每天仅发一次) ─────────
  let _matLastReminderDate = '';
  setInterval(async () => {
    const today = new Date().toISOString().split('T')[0];
    if (today === _matLastReminderDate) return;
    _matLastReminderDate = today;
    try {
      const activeRequests = db.all(`SELECT mr.*,ct.name as contact_name,ct.email as contact_email
        FROM mat_requests mr JOIN mat_contacts ct ON mr.contact_id=ct.id
        WHERE mr.status IN ('PENDING','IN_PROGRESS') AND mr.auto_remind_paused=0`);

      for (const r of activeRequests) {
        const contact = { name: r.contact_name, email: r.contact_email };
        const deadline = new Date(r.deadline);
        const now = new Date();
        const daysUntil = Math.ceil((deadline - now) / 86400000);
        const daysOverdue = Math.floor((now - deadline) / 86400000);
        let reminderType = null;

        if (daysUntil > 0 && daysUntil <= (r.remind_days_before || 3)) {
          const sent = db.get(`SELECT id FROM mat_reminder_logs WHERE request_id=? AND type='upcoming' AND date(sent_at)=?`,
            [r.id, today]);
          if (!sent) reminderType = 'upcoming';
        } else if (daysUntil <= 0) {
          if (!r.is_overdue) {
            db.run(`UPDATE mat_requests SET is_overdue=1,updated_at=datetime('now') WHERE id=?`, [r.id]);
          }
          if (daysOverdue === 0) {
            const sent = db.get(`SELECT id FROM mat_reminder_logs WHERE request_id=? AND type='due' AND date(sent_at)=?`,
              [r.id, today]);
            if (!sent) reminderType = 'due';
          } else {
            const overdueLogs = db.all(`SELECT * FROM mat_reminder_logs WHERE request_id=? AND type='overdue'`, [r.id]);
            if (overdueLogs.length < (r.max_overdue_reminders || 5)) {
              if (daysOverdue % (r.overdue_interval_days || 2) === 0) {
                reminderType = 'overdue';
              }
            }
          }
        }

        if (reminderType) {
          const { link } = _matCreateMagicLink(r.id, r.contact_id);
          _matSendInviteEmail(r, contact, link, reminderType);
          db.run(`INSERT INTO mat_reminder_logs (id,request_id,type,sent_to,status) VALUES (?,?,?,?,?)`,
            [uuidv4(), r.id, reminderType, contact.email, 'sent']);
          console.log(`[MAT REMIND] ${reminderType} → ${contact.email} (${r.title})`);
        }
      }
    } catch(e) {
      console.error('[MAT REMIND JOB]', e.message);
    }
  }, 60 * 60 * 1000);

  return router;
};
