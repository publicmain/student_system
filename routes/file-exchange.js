/**
 * routes/file-exchange.js — 文件收发中心 + Case Files + 公开学生端路由
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, requireAdmissionModule, upload, fileStorage, moveUploadedFile, sendMail, escHtml, brandedEmail, fs, path, crypto, archiver }) {
  // Two routers: one for session-protected /api routes, one for public /s/* routes
  const apiRouter = express.Router();
  const publicRouter = express.Router();

  function fxLog(recordId, caseId, action, actorType, actorName, notes, ip) {
    try {
      db.run(`INSERT INTO file_exchange_logs (id,record_id,case_id,action,actor_type,actor_name,notes,ip_address) VALUES (?,?,?,?,?,?,?,?)`,
        [uuidv4(), recordId, caseId, action, actorType||'admin', actorName||null, notes||null, ip||null]);
    } catch(e) { console.error('fxLog失败:', e.message); }
  }

  // ═══════════════════════════════════════════════════════
  //  FILE EXCHANGE CENTER — 文件收发中心 (session routes)
  // ═══════════════════════════════════════════════════════

  // 创建文件记录（上传文件）
  apiRouter.post('/intake-cases/:id/file-exchange', requireRole('principal','intake_staff'), upload.single('file'), (req, res) => {
    const ic = db.get('SELECT id, student_name FROM intake_cases WHERE id=?', [req.params.id]);
    if (!ic) return res.status(404).json({ error: 'Case 不存在' });
    const { title, description, category, request_reply, reply_instruction, deadline_at, student_email, student_name, direction, related_stage, upload_items } = req.body;
    if (!title) return res.status(400).json({ error: '请填写文件标题' });
    const isRequestMode = parseInt(request_reply, 10) === 1;
    if (!req.file && !isRequestMode) return res.status(400).json({ error: '请上传文件（或勾选要求回传模式）' });
    const dir = direction || 'admin_to_student';
    const id = uuidv4();
    const caseStatus = db.get('SELECT status FROM intake_cases WHERE id=?', [req.params.id])?.status || '';
    const stage = related_stage || caseStatus;
    let itemsJson = null;
    if (upload_items) {
      try { const arr = JSON.parse(upload_items); if (Array.isArray(arr) && arr.length) itemsJson = upload_items; } catch(e) {}
    }
    db.run(`INSERT INTO file_exchange_records
      (id,case_id,title,description,direction,file_path,original_name,file_size,related_stage,category,status,request_reply,reply_instruction,deadline_at,student_email,student_name,created_by,created_by_name,upload_items)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.params.id, title, description||null, dir,
       req.file ? (moveUploadedFile(req.file.filename, 'exchange'), req.file.filename) : null,
       req.file ? req.file.originalname : null,
       req.file ? req.file.size : null,
       stage, category||null, 'draft',
       isRequestMode ? 1 : 0, reply_instruction||null, deadline_at||null,
       student_email||null, student_name||ic.student_name||null,
       req.session.user.id, req.session.user.name||req.session.user.username, itemsJson]);
    fxLog(id, req.params.id, 'uploaded', 'admin', req.session.user.name||req.session.user.username, `文件：${title}`, req.ip);
    audit(req, 'FX_CREATE', 'file_exchange_records', id, { title, direction: dir });
    res.json({ id, title, status: 'draft', direction: dir });
  });

  // 列出所有文件记录（含日志）
  apiRouter.get('/intake-cases/:id/file-exchange', requireAdmissionModule, (req, res) => {
    const records = db.all(`SELECT * FROM file_exchange_records WHERE case_id=? AND is_deleted=0 AND direction='admin_to_student' ORDER BY created_at DESC`, [req.params.id]);
    const logs    = db.all(`SELECT * FROM file_exchange_logs WHERE case_id=? ORDER BY created_at DESC`, [req.params.id]);
    res.json({ records, logs });
  });

  // 发送文件给学生（生成 token，可选邮件）
  apiRouter.put('/file-exchange/:id/send', requireRole('principal','intake_staff'), async (req, res) => {
    try {
    const rec = db.get('SELECT * FROM file_exchange_records WHERE id=? AND is_deleted=0', [req.params.id]);
    if (!rec) return res.status(404).json({ error: '记录不存在' });
    const accessToken = rec.access_token || crypto.randomBytes(32).toString('hex');
    const uploadToken = (rec.request_reply && !rec.upload_token) ? uuidv4() : (rec.upload_token || null);
    const { student_email, student_name } = req.body;
    const email = student_email || rec.student_email;
    const sname = student_name || rec.student_name;
    db.run(`UPDATE file_exchange_records SET status='sent', access_token=?, upload_token=?, sent_at=datetime('now'), student_email=COALESCE(?,student_email), student_name=COALESCE(?,student_name), updated_at=datetime('now') WHERE id=?`,
      [accessToken, uploadToken, email||null, sname||null, req.params.id]);
    const ic = db.get('SELECT student_name, program_name FROM intake_cases WHERE id=?', [rec.case_id]);
    const host = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`);
    const viewUrl = `${host}/s/fx/${accessToken}`;
    fxLog(req.params.id, rec.case_id, 'sent', 'admin', req.session.user.name||req.session.user.username, `发送给 ${sname||'—'} (${email||'无邮件'})`, req.ip);
    audit(req, 'FX_SEND', 'file_exchange_records', req.params.id, { email, request_reply: rec.request_reply });
    let emailSent = false;
    if (email) {
      const _em1 = brandedEmail(
        `<p style="font-size:15px;color:#333;">顾问老师已向您发送文件：<strong>${escHtml(rec.title)}</strong></p>
        ${rec.description ? `<p style="color:#555;">${escHtml(rec.description)}</p>` : ''}
        ${rec.request_reply ? `<div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin:16px 0;">
          <strong style="color:#d97706;">⚠ 需要您上传文件</strong>
          ${rec.reply_instruction ? `<p style="margin:4px 0 0;color:#92400e;font-size:14px;">${escHtml(rec.reply_instruction)}</p>` : ''}
          ${rec.deadline_at ? `<p style="margin:4px 0 0;color:#dc2626;font-size:13px;">截止日期：${rec.deadline_at}</p>` : ''}
        </div>` : ''}`,
        { greeting: `您好 ${escHtml(sname||'同学')}，`, buttonUrl: viewUrl, buttonText: rec.request_reply ? '打开链接上传文件 →' : '查看文件 →', footerExtra: '如有疑问请联系您的顾问老师' }
      );
      try {
        await sendMail(email, `文件通知：${rec.title} — ${ic?.student_name||''}`, _em1.html, _em1.attachments);
        fxLog(req.params.id, rec.case_id, 'email_sent', 'system', 'system', `邮件已发送至 ${email}`, null);
        emailSent = true;
      } catch(e) { console.error('fx send mail failed:', e.message); }
    }
    res.json({ ok: true, access_token: accessToken, upload_token: uploadToken, view_url: viewUrl, email_sent: emailSent });
    } catch(e) { console.error('fx send error:', e.message, e.stack); res.status(500).json({ error: '发送失败：' + (e.message || '未知错误') }); }
  });

  // 关闭记录
  apiRouter.put('/file-exchange/:id/close', requireRole('principal','intake_staff'), (req, res) => {
    const rec = db.get('SELECT id, case_id, title FROM file_exchange_records WHERE id=? AND is_deleted=0', [req.params.id]);
    if (!rec) return res.status(404).json({ error: '记录不存在' });
    db.run(`UPDATE file_exchange_records SET status='closed', updated_at=datetime('now') WHERE id=?`, [req.params.id]);
    fxLog(req.params.id, rec.case_id, 'closed', 'admin', req.session.user.name||req.session.user.username, null, req.ip);
    res.json({ ok: true });
  });

  // 软删除
  apiRouter.delete('/file-exchange/:id', requireRole('principal','intake_staff'), (req, res) => {
    const rec = db.get('SELECT id, case_id, file_path, title FROM file_exchange_records WHERE id=?', [req.params.id]);
    if (!rec) return res.status(404).json({ error: '记录不存在' });
    db.run(`UPDATE file_exchange_records SET is_deleted=1, updated_at=datetime('now') WHERE id=?`, [req.params.id]);
    fxLog(req.params.id, rec.case_id, 'deleted', 'admin', req.session.user.name||req.session.user.username, `删除：${rec.title}`, req.ip);
    res.json({ ok: true });
  });

  // 编辑文件记录
  apiRouter.patch('/file-exchange/:id', requireRole('principal','intake_staff'), (req, res) => {
    const rec = db.get('SELECT id, case_id, title FROM file_exchange_records WHERE id=? AND is_deleted=0', [req.params.id]);
    if (!rec) return res.status(404).json({ error: '记录不存在' });
    const { title, description, student_email, student_name } = req.body;
    if (title !== undefined && !String(title).trim()) return res.status(400).json({ error: '标题不能为空' });
    const updates = [];
    const params = [];
    if (title       !== undefined) { updates.push('title=?');         params.push(String(title).trim()); }
    if (description !== undefined) { updates.push('description=?');   params.push(description || null); }
    if (student_email !== undefined) { updates.push('student_email=?'); params.push(student_email || null); }
    if (student_name  !== undefined) { updates.push('student_name=?');  params.push(student_name  || null); }
    if (!updates.length) return res.status(400).json({ error: '无可更新字段' });
    updates.push("updated_at=datetime('now')");
    params.push(req.params.id);
    db.run(`UPDATE file_exchange_records SET ${updates.join(',')} WHERE id=?`, params);
    fxLog(req.params.id, rec.case_id, 'edited', 'admin', req.session.user.name||req.session.user.username, `编辑：${title||rec.title}`, req.ip);
    audit(req, 'FX_EDIT', 'file_exchange_records', req.params.id, { title, description });
    res.json({ ok: true });
  });

  // 催办
  apiRouter.post('/file-exchange/:id/remind', requireRole('principal','intake_staff'), async (req, res) => {
    const rec = db.get('SELECT * FROM file_exchange_records WHERE id=? AND is_deleted=0', [req.params.id]);
    if (!rec) return res.status(404).json({ error: '记录不存在' });
    if (!rec.access_token) return res.status(400).json({ error: '请先发送文件给学生' });
    const email = req.body.email || rec.student_email;
    if (!email) return res.status(400).json({ error: '学生邮箱未填写' });
    const lastRemind = db.get(`SELECT created_at FROM file_exchange_logs WHERE record_id=? AND action='reminded' ORDER BY created_at DESC LIMIT 1`, [req.params.id]);
    if (lastRemind) {
      const elapsed = Date.now() - new Date(lastRemind.created_at).getTime();
      if (elapsed < 24 * 3600 * 1000) {
        const nextTime = new Date(new Date(lastRemind.created_at).getTime() + 24 * 3600 * 1000);
        return res.status(429).json({ error: `催办过于频繁，下次可催办时间：${nextTime.toLocaleString('zh-CN')}` });
      }
    }
    const host = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`);
    const viewUrl = `${host}/s/fx/${rec.access_token}`;
    fxLog(req.params.id, rec.case_id, 'reminded', 'admin', req.session.user.name||req.session.user.username, `催办邮件已发至 ${email}`, req.ip);
    const _em2 = brandedEmail(
      `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:14px;margin:0 0 16px;">
        <strong style="color:#dc2626;">⏰ 催办提醒</strong>
        <p style="margin:4px 0 0;color:#333;">请尽快查看并回传文件：<strong>${escHtml(rec.title)}</strong></p>
        ${rec.deadline_at ? `<p style="margin:4px 0 0;color:#dc2626;font-weight:600;">截止日期：${rec.deadline_at}</p>` : ''}
      </div>`,
      { greeting: `您好 ${escHtml(rec.student_name||'同学')}，`, buttonUrl: viewUrl, buttonText: '打开链接处理 →', footerExtra: '请及时处理，如有疑问请联系顾问老师' }
    );
    let emailSent = false;
    try {
      await sendMail(email, `【催办】请查看/上传文件：${rec.title}`, _em2.html, _em2.attachments);
      emailSent = true;
    } catch(e) { console.error('fx remind mail failed:', e.message); }
    res.json({ ok: true, email_sent: emailSent });
  });

  // 管理员下载文件
  apiRouter.get('/file-exchange/:id/download', requireAdmissionModule, (req, res) => {
    const rec = db.get('SELECT * FROM file_exchange_records WHERE id=? AND is_deleted=0', [req.params.id]);
    if (!rec) return res.status(404).json({ error: '记录不存在' });
    const fp = fileStorage.getFilePath(rec.file_path || '');
    if (!rec.file_path || !fs.existsSync(fp)) return res.status(404).json({ error: '文件不存在' });
    fxLog(req.params.id, rec.case_id, 'admin_downloaded', 'admin', req.session.user.name||req.session.user.username, null, req.ip);
    const ext = path.extname(rec.file_path);
    const safeName = (rec.original_name || rec.title).replace(/[^\w.\u4e00-\u9fa5-]/g,'_') + (rec.original_name ? '' : ext);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}"`);
    res.sendFile(fp, (err) => { if (err && !res.headersSent) res.status(500).json({ error: '文件发送失败' }); });
  });

  // 管理员下载学生回传文件
  apiRouter.get('/file-exchange/:id/reply-download', requireAdmissionModule, (req, res) => {
    const reply = db.get('SELECT * FROM file_exchange_records WHERE parent_id=? AND direction=? AND is_deleted=0 ORDER BY created_at DESC LIMIT 1', [req.params.id, 'student_to_admin']);
    if (!reply || !reply.file_path) return res.status(404).json({ error: '学生尚未上传回传文件' });
    const fp = fileStorage.getFilePath(reply.file_path);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: '文件不存在' });
    fxLog(req.params.id, reply.case_id, 'admin_reviewed_reply', 'admin', req.session.user.name||req.session.user.username, null, req.ip);
    db.run(`UPDATE file_exchange_records SET reviewed_by=?, reviewed_at=datetime('now') WHERE id=?`, [req.session.user.id, reply.id]);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(reply.original_name || '学生回传文件')}"`);
    res.sendFile(fp, (err) => { if (err && !res.headersSent) res.status(500).json({ error: '文件发送失败' }); });
  });

  // ═══════════════════════════════════════════════════════
  //  CASE FILES — 案例文件上传 / 发送 / 学生端链接
  // ═══════════════════════════════════════════════════════

  apiRouter.post('/intake-cases/:id/case-files', requireRole('principal','intake_staff'), upload.single('file'), (req, res) => {
    const ic = db.get('SELECT id, student_name FROM intake_cases WHERE id=?', [req.params.id]);
    if (!ic) return res.status(404).json({ error: 'Case 不存在' });
    if (!req.file) return res.status(400).json({ error: '请上传文件' });
    const { file_type, display_name, notes } = req.body;
    if (!file_type || !display_name) return res.status(400).json({ error: '请填写文件类型和名称' });
    moveUploadedFile(req.file.filename, 'case');
    const id = uuidv4();
    db.run(`INSERT INTO case_files (id,case_id,file_type,display_name,filename,original_name,file_size,uploaded_by,uploaded_by_name,notes) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, req.params.id, file_type, display_name, req.file.filename, req.file.originalname, req.file.size,
       req.session.user.id, req.session.user.name || req.session.user.username, notes || null]);
    audit(req, 'UPLOAD_CASE_FILE', 'case_files', id, { case_id: req.params.id, file_type, display_name });
    res.json({ id, file_type, display_name, filename: req.file.filename, created_at: new Date().toISOString() });
  });

  apiRouter.get('/intake-cases/:id/case-files', requireAdmissionModule, (req, res) => {
    const files = db.all('SELECT * FROM case_files WHERE case_id=? ORDER BY created_at DESC', [req.params.id]);
    const sends = db.all('SELECT * FROM case_file_sends WHERE case_id=? ORDER BY sent_at DESC', [req.params.id]);
    const sigs  = db.all('SELECT * FROM case_signatures WHERE case_id=? ORDER BY signed_at DESC', [req.params.id]);
    const filesWithSends = files.map(f => ({
      ...f,
      sends: sends.filter(s => s.file_id === f.id),
    }));
    res.json({ files: filesWithSends, sends, signatures: sigs });
  });

  apiRouter.delete('/case-files/:id', requireRole('principal','intake_staff'), (req, res) => {
    const f = db.get('SELECT * FROM case_files WHERE id=?', [req.params.id]);
    if (!f) return res.status(404).json({ error: '文件不存在' });
    try {
      const fp = fileStorage.getFilePath(f.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch(e) { console.error('删除文件失败:', e.message); }
    db.run('DELETE FROM case_file_sends WHERE file_id=?', [req.params.id]);
    db.run('DELETE FROM case_files WHERE id=?', [req.params.id]);
    audit(req, 'DELETE_CASE_FILE', 'case_files', req.params.id, { display_name: f.display_name });
    res.json({ ok: true });
  });

  apiRouter.post('/case-files/:id/send', requireRole('principal','intake_staff'), async (req, res) => {
    const f = db.get('SELECT * FROM case_files WHERE id=?', [req.params.id]);
    if (!f) return res.status(404).json({ error: '文件不存在' });
    const { student_email, student_name, with_watermark, watermark_text } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    const sendId = uuidv4();
    const watermark = with_watermark ? 1 : 0;
    const wmText = watermark_text || '仅供查看';
    db.run(`INSERT INTO case_file_sends (id,file_id,case_id,send_type,token,student_email,student_name,sent_by,sent_by_name,with_watermark,watermark_text) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [sendId, f.id, f.case_id, 'file_view', token, student_email||null, student_name||null,
       req.session.user.id, req.session.user.name || req.session.user.username, watermark, wmText]);
    const fileUrl = `${req.protocol}://${req.get('host')}/s/file/${token}`;
    if (student_email) {
      const ic = db.get('SELECT student_name, program_name FROM intake_cases WHERE id=?', [f.case_id]);
      sendMail(student_email,
        `文件通知 - ${ic?.student_name || ''} - ${f.display_name}`,
        `<p>您好 ${student_name||'同学'}，</p><p>请点击以下链接查看文件：<strong>${f.display_name}</strong></p>
        <p><a href="${fileUrl}" style="font-size:1.1em;font-weight:bold;">${fileUrl}</a></p>
        ${watermark ? `<p style="color:#888;font-size:0.9em;">注：该文件为${wmText}版本</p>` : ''}
        <p>如有疑问请联系顾问老师。</p>`
      ).catch(e => { console.error('send file email failed:', e.message); });
    }
    audit(req, 'SEND_CASE_FILE', 'case_file_sends', sendId, { file_id: f.id, student_email, with_watermark: watermark });
    res.json({ ok: true, token, url: fileUrl, send_id: sendId });
  });

  apiRouter.post('/intake-cases/:id/contract-upload-link', requireRole('principal','intake_staff'), async (req, res) => {
    const ic = db.get('SELECT id, student_name FROM intake_cases WHERE id=?', [req.params.id]);
    if (!ic) return res.status(404).json({ error: 'Case 不存在' });
    const { student_email, student_name } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    const sendId = uuidv4();
    db.run(`INSERT INTO case_file_sends (id,file_id,case_id,send_type,token,student_email,student_name,sent_by,sent_by_name) VALUES (?,?,?,?,?,?,?,?,?)`,
      [sendId, null, req.params.id, 'contract_upload', token, student_email||null, student_name||ic.student_name,
       req.session.user.id, req.session.user.name || req.session.user.username]);
    const uploadUrl = `${req.protocol}://${req.get('host')}/s/upload/${token}`;
    if (student_email) {
      sendMail(student_email,
        `请上传已签合同 - ${ic.student_name}`,
        `<p>您好 ${student_name||ic.student_name}，</p>
        <p>请点击以下链接，上传您签署好的合同：</p>
        <p><a href="${uploadUrl}" style="font-size:1.1em;font-weight:bold;">${uploadUrl}</a></p>
        <p>上传后我们将尽快确认，如有疑问请联系顾问老师。</p>`
      ).catch(e => { console.error('contract upload email failed:', e.message); });
    }
    audit(req, 'GEN_UPLOAD_LINK', 'case_file_sends', sendId, { case_id: req.params.id, student_email });
    res.json({ ok: true, token, url: uploadUrl, send_id: sendId });
  });

  apiRouter.post('/intake-cases/:id/signature-requests', requireRole('principal','intake_staff'), async (req, res) => {
    const ic = db.get('SELECT id, student_name FROM intake_cases WHERE id=?', [req.params.id]);
    if (!ic) return res.status(404).json({ error: 'Case 不存在' });
    const { student_email, student_name, title, description } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    const sendId = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.run(`INSERT INTO case_file_sends (id,file_id,case_id,send_type,token,student_email,student_name,sent_by,sent_by_name,title,description,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [sendId, null, req.params.id, 'signature', token, student_email||null, student_name||ic.student_name,
       req.session.user.id, req.session.user.name || req.session.user.username,
       title||'签字确认', description||null, expiresAt]);
    const signUrl = `${req.protocol}://${req.get('host')}/s/sign/${token}`;
    if (student_email) {
      sendMail(student_email,
        `请签字确认 - ${title||'签字确认'} - ${ic.student_name}`,
        `<p>您好 ${student_name||ic.student_name}，</p>
        <p>请点击以下链接完成签字：<strong>${title||'签字确认'}</strong></p>
        ${description ? `<p>${description}</p>` : ''}
        <p><a href="${signUrl}" style="font-size:1.1em;font-weight:bold;">${signUrl}</a></p>
        <p>如有疑问请联系顾问老师。</p>`
      ).catch(e => { console.error('signature email failed:', e.message); });
    }
    audit(req, 'GEN_SIGN_LINK', 'case_file_sends', sendId, { case_id: req.params.id, student_email, title });
    res.json({ ok: true, token, url: signUrl, send_id: sendId });
  });

  apiRouter.delete('/case-file-sends/:id', requireRole('principal','intake_staff'), (req, res) => {
    const s = db.get('SELECT id FROM case_file_sends WHERE id=?', [req.params.id]);
    if (!s) return res.status(404).json({ error: '记录不存在' });
    db.run('DELETE FROM case_signatures WHERE send_id=?', [req.params.id]);
    db.run('DELETE FROM case_file_sends WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  //  公开学生端路由（无需登录） — mounted at app root
  // ═══════════════════════════════════════════════════════

  // 学生查看文件页
  publicRouter.get('/s/fx/:token', (req, res) => {
    const rec = db.get('SELECT * FROM file_exchange_records WHERE access_token=? AND is_deleted=0', [req.params.token]);
    if (!rec) return res.status(404).send('<h2>链接无效或已失效</h2>');
    if (!rec.viewed_at) {
      db.run(`UPDATE file_exchange_records SET viewed_at=datetime('now'), status=CASE WHEN status='sent' AND request_reply=1 THEN 'awaiting_upload' WHEN status='sent' THEN 'viewed' ELSE status END, updated_at=datetime('now') WHERE id=?`, [rec.id]);
      fxLog(rec.id, rec.case_id, 'student_viewed', 'student', rec.student_name||'学生', null, req.ip);
    }
    const isOverdue = rec.deadline_at && new Date(rec.deadline_at) < new Date() && rec.status !== 'replied' && rec.status !== 'closed';
    if (isOverdue && rec.status === 'awaiting_upload') {
      db.run(`UPDATE file_exchange_records SET status='overdue', updated_at=datetime('now') WHERE id=?`, [rec.id]);
    }
    const replies = db.all(`SELECT * FROM file_exchange_records WHERE parent_id=? AND direction='student_to_admin' AND is_deleted=0 ORDER BY created_at DESC`, [rec.id]);
    const isPdf = rec.file_path && /\.pdf$/i.test(rec.file_path);
    const isImage = rec.file_path && /\.(jpg|jpeg|png|gif)$/i.test(rec.file_path);
    const statusMap = { draft:'草稿', sent:'已发送', viewed:'已查看', awaiting_upload:'待上传', overdue:'已逾期', replied:'已回传', closed:'已完成' };
    let uploadItems = [];
    try { if (rec.upload_items) uploadItems = JSON.parse(rec.upload_items); } catch(e) {}
    const replyMap = {};
    replies.forEach(r => { const key = (r.title||'').replace('【回传】','').replace('【上传】','').trim(); replyMap[key] = r; });
    const hasItems = uploadItems.length > 0;
    const doneCount = hasItems ? uploadItems.filter(i => replyMap[i.name]).length : replies.length;
    const totalCount = hasItems ? uploadItems.length : (doneCount || 1);
    const reqCount = uploadItems.filter(i => i.required).length;
    const reqDone = uploadItems.filter(i => i.required && replyMap[i.name]).length;
    const allComplete = hasItems ? (reqCount > 0 ? reqDone >= reqCount : doneCount >= totalCount) : replies.length > 0;
    const pct = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;

    const statusColor = allComplete ? '#16a34a' : isOverdue ? '#dc2626' : rec.status==='awaiting_upload' ? '#d97706' : rec.status==='replied'||rec.status==='closed' ? '#16a34a' : '#A51C30';
    const statusLabel = allComplete ? '已完成' : (statusMap[rec.status]||rec.status);
    const deadlineDays = rec.deadline_at ? Math.ceil((new Date(rec.deadline_at) - new Date()) / 86400000) : null;

    res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(rec.title)} — Equistar International College</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
  <style>
    :root{--brand:#A51C30;--brand-dark:#8B1425;--brand-light:#FBF0F1;--brand-lighter:#fdf7f8;--green:#16a34a;--green-light:#f0fdf4;--green-border:#bbf7d0;--warn:#d97706;--warn-light:#fffbeb;--red:#dc2626;--gray-50:#f9fafb;--gray-100:#f3f4f6;--gray-200:#e5e7eb;--gray-400:#9ca3af;--gray-600:#4b5563;--gray-800:#1f2937;--radius:12px;--shadow:0 4px 24px rgba(0,0,0,.06);--shadow-lg:0 8px 40px rgba(0,0,0,.1)}
    *{box-sizing:border-box}
    body{margin:0;background:var(--gray-50);min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--gray-800)}
    .page-header{background:#fff;border-bottom:1px solid var(--gray-200);padding:16px 0;text-align:center}
    .page-header .logo-wrap{display:inline-flex;align-items:center;gap:12px}
    .page-header img{height:42px}
    .page-header .school-name{font-size:17px;font-weight:700;color:var(--gray-800);letter-spacing:.3px}
    .page-header .school-url{font-size:11px;color:var(--gray-400);margin-top:1px}
    .accent-bar{height:4px;background:linear-gradient(90deg,var(--brand) 0%,#d4424f 50%,var(--brand-dark) 100%)}
    .page-wrap{max-width:640px;margin:0 auto;padding:24px 16px 40px}
    .welcome{background:#fff;border:1px solid var(--gray-200);border-radius:var(--radius);padding:20px 24px;margin-bottom:20px;box-shadow:var(--shadow)}
    .welcome h1{font-size:20px;font-weight:700;margin:0 0 4px;color:var(--gray-800)}
    .welcome .sub{font-size:14px;color:var(--gray-600);margin:0}
    .status-strip{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px}
    .status-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600;color:#fff}
    .deadline-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:500;border:1px solid var(--gray-200);background:#fff;color:var(--gray-600)}
    .deadline-chip.urgent{border-color:#fca5a5;background:#fef2f2;color:var(--red);font-weight:600}
    .deadline-chip.soon{border-color:#fde68a;background:var(--warn-light);color:var(--warn)}
    .fx-card{background:#fff;border:1px solid var(--gray-200);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;margin-bottom:20px}
    .fx-card-head{padding:16px 20px;border-bottom:1px solid var(--gray-100);display:flex;align-items:center;justify-content:space-between}
    .fx-card-head h3{font-size:15px;font-weight:700;margin:0;display:flex;align-items:center;gap:8px}
    .fx-card-body{padding:20px}
    .progress-wrap{margin-bottom:20px}
    .progress-label{display:flex;justify-content:space-between;font-size:13px;color:var(--gray-600);margin-bottom:6px}
    .progress-bar-outer{height:8px;background:var(--gray-100);border-radius:4px;overflow:hidden}
    .progress-bar-inner{height:100%;border-radius:4px;transition:width .4s ease}
    .file-item{border:1px solid var(--gray-200);border-radius:10px;padding:16px;margin-bottom:12px;transition:all .2s}
    .file-item:hover{border-color:#d1d5db;box-shadow:0 2px 8px rgba(0,0,0,.04)}
    .file-item.done{background:var(--green-light);border-color:var(--green-border)}
    .file-item .fi-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
    .file-item .fi-name{font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px}
    .file-item .fi-name i{font-size:18px}
    .fi-badge{font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600}
    .fi-badge.req{background:#fef2f2;color:var(--red)}
    .fi-badge.opt{background:var(--gray-100);color:var(--gray-400)}
    .fi-status{font-size:12px;padding:3px 10px;border-radius:12px;font-weight:600}
    .fi-status.pending{background:var(--warn-light);color:var(--warn)}
    .fi-status.uploaded{background:var(--green-light);color:var(--green)}
    .fi-uploaded-info{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--green);margin-bottom:8px}
    .fi-uploaded-info i{font-size:16px}
    .upload-zone{border:2px dashed var(--gray-200);border-radius:10px;padding:16px;text-align:center;transition:all .2s;cursor:pointer;position:relative}
    .upload-zone:hover{border-color:var(--brand);background:var(--brand-lighter)}
    .upload-zone i{font-size:28px;color:var(--brand);opacity:.6}
    .upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer}
    .upload-zone .file-name{margin-top:6px;font-size:13px;color:var(--brand);font-weight:500;display:none}
    .upload-zone.has-file{border-color:var(--brand);background:var(--brand-lighter)}
    .upload-zone.has-file .file-name{display:block}
    .upload-zone.has-file .uz-hint{display:none}
    .btn-brand{background:var(--brand);color:#fff;border:none;font-weight:600;padding:10px 24px;border-radius:8px;font-size:14px;transition:all .15s}
    .btn-brand:hover{background:var(--brand-dark);color:#fff;transform:translateY(-1px);box-shadow:0 4px 12px rgba(165,28,48,.3)}
    .btn-brand:active{transform:translateY(0)}
    .btn-brand-outline{background:#fff;color:var(--brand);border:1.5px solid var(--brand);font-weight:600;padding:8px 20px;border-radius:8px;font-size:13px;transition:all .15s}
    .btn-brand-outline:hover{background:var(--brand-light);color:var(--brand-dark)}
    .preview-frame{border:1px solid var(--gray-200);border-radius:10px;overflow:hidden;margin-bottom:12px}
    .all-done{text-align:center;padding:24px;background:var(--green-light);border:1px solid var(--green-border);border-radius:var(--radius)}
    .all-done i{font-size:40px;color:var(--green)}
    .all-done h4{margin:8px 0 4px;color:var(--green)}
    .page-footer{text-align:center;padding:20px 16px 32px;font-size:12px;color:var(--gray-400)}
    .page-footer a{color:var(--brand);text-decoration:none}
    .page-footer .divider{display:inline-block;width:3px;height:3px;border-radius:50%;background:var(--gray-400);margin:0 8px;vertical-align:middle}
    @media(max-width:576px){
      .page-wrap{padding:16px 12px 32px}
      .fx-card-body{padding:16px}
      .file-item{padding:12px}
      .welcome{padding:16px}
      .welcome h1{font-size:18px}
    }
  </style>
</head>
<body>
<!-- Header -->
<div class="page-header">
  <div class="logo-wrap">
    <img src="/esic-logo.jpg" alt="ESIC" onerror="this.style.display='none'">
    <div>
      <div class="school-name">Equistar International College</div>
      <div class="school-url">www.esic.edu.sg</div>
    </div>
  </div>
</div>
<div class="accent-bar"></div>

<div class="page-wrap">
  <!-- Welcome -->
  <div class="welcome">
    <h1>${escHtml(rec.title)}</h1>
    <p class="sub">${rec.description ? escHtml(rec.description) : (rec.request_reply ? 'Please complete your document submission below.' : 'The following document has been shared with you.')}</p>
  </div>

  <!-- Status + Deadline -->
  <div class="status-strip">
    <span class="status-chip" style="background:${statusColor}">${statusLabel}</span>
    ${rec.deadline_at ? `<span class="deadline-chip ${isOverdue?'urgent':deadlineDays!==null&&deadlineDays<=3?'soon':''}">
      <i class="bi bi-calendar3"></i>
      ${isOverdue ? '已逾期' : deadlineDays!==null&&deadlineDays<=0 ? '今日截止' : deadlineDays!==null&&deadlineDays<=3 ? '剩余 '+deadlineDays+' 天' : '截止 '+rec.deadline_at}
    </span>` : ''}
    ${rec.reply_instruction ? `<span class="deadline-chip"><i class="bi bi-info-circle"></i>${escHtml(rec.reply_instruction)}</span>` : ''}
  </div>

  ${allComplete && rec.request_reply ? `
  <!-- All done banner -->
  <div class="all-done mb-4">
    <i class="bi bi-check-circle-fill"></i>
    <h4>材料已提交完成</h4>
    <p class="small text-muted mb-0">感谢您的配合，老师会尽快审核您的材料。</p>
  </div>` : ''}

  <!-- Attached file preview -->
  ${rec.file_path ? `
  <div class="fx-card">
    <div class="fx-card-head">
      <h3><i class="bi bi-paperclip" style="color:var(--brand)"></i>附件文件</h3>
      <a href="/s/fx/${escHtml(rec.access_token)}/dl" class="btn-brand-outline" download><i class="bi bi-download me-1"></i>下载</a>
    </div>
    <div class="fx-card-body" style="padding:0">
      ${isPdf ? `<div class="preview-frame" style="margin:0;border:none;border-radius:0"><iframe src="/s/fx/${escHtml(rec.access_token)}/dl" style="width:100%;height:500px;border:none"></iframe></div>` : ''}
      ${isImage ? `<div class="p-3"><img src="/s/fx/${escHtml(rec.access_token)}/dl" class="img-fluid rounded"></div>` : ''}
      ${!isPdf && !isImage ? `<div class="p-4 text-center"><i class="bi bi-file-earmark fs-1" style="color:var(--gray-400)"></i><div class="mt-2 text-muted">${escHtml(rec.original_name||rec.title)}</div></div>` : ''}
    </div>
  </div>` : ''}

  <!-- Upload section -->
  ${rec.request_reply && rec.upload_token ? (() => {
    if (hasItems) {
      const itemsHtml = uploadItems.map((item, idx) => {
        const uploaded = replyMap[item.name];
        return '<div class="file-item '+(uploaded?'done':'')+'">'
          + '<div class="fi-top">'
          + '<div class="fi-name">'
          + '<i class="bi '+(uploaded?'bi-file-earmark-check':'bi-file-earmark-arrow-up')+'" style="color:'+(uploaded?'var(--green)':'var(--brand)')+'"></i>'
          + escHtml(item.name)
          + ' <span class="fi-badge '+(item.required?'req':'opt')+'">'+(item.required?'必交':'选交')+'</span>'
          + '</div>'
          + '<span class="fi-status '+(uploaded?'uploaded':'pending')+'">'
          + (uploaded ? '<i class="bi bi-check-circle me-1"></i>已上传' : '<i class="bi bi-clock me-1"></i>待上传')
          + '</span>'
          + '</div>'
          + (uploaded
            ? '<div class="fi-uploaded-info"><i class="bi bi-check-circle-fill"></i>'+escHtml(uploaded.original_name||uploaded.title)+' <span class="text-muted" style="font-size:12px">'+uploaded.created_at.slice(0,16)+'</span></div>'
              + '<details><summary class="small" style="color:var(--brand);cursor:pointer;font-weight:500">替换文件</summary>'
              + '<form method="POST" action="/s/fx/'+escHtml(rec.upload_token)+'/reply-item" enctype="multipart/form-data" class="mt-2">'
              + '<input type="hidden" name="item_name" value="'+escHtml(item.name)+'">'
              + '<div class="d-flex gap-2"><input class="form-control form-control-sm" type="file" name="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" required>'
              + '<button type="submit" class="btn-brand-outline" style="white-space:nowrap">重新上传</button></div></form></details>'
            : '<form method="POST" action="/s/fx/'+escHtml(rec.upload_token)+'/reply-item" enctype="multipart/form-data" onsubmit="this.querySelector(\'button\').disabled=true;this.querySelector(\'button\').innerHTML=\'<i class=bi-arrow-repeat></i> 上传中...\'">'
              + '<input type="hidden" name="item_name" value="'+escHtml(item.name)+'">'
              + '<div class="upload-zone" id="uz'+idx+'">'
              + '<i class="bi bi-cloud-arrow-up"></i>'
              + '<div class="uz-hint small text-muted mt-1">点击选择文件或拖拽到此处</div>'
              + '<div class="file-name"></div>'
              + '<input type="file" name="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" required onchange="var z=this.closest(\'.upload-zone\'),n=z.querySelector(\'.file-name\');if(this.files[0]){n.textContent=this.files[0].name;z.classList.add(\'has-file\')}else{z.classList.remove(\'has-file\');n.textContent=\'\'}">'
              + '</div>'
              + '<button type="submit" class="btn-brand w-100 mt-3"><i class="bi bi-upload me-1"></i>确认上传</button>'
              + '</form>'
          )
          + '</div>';
      }).join('');

      return `
      <div class="fx-card">
        <div class="fx-card-head" style="background:var(--brand-lighter)">
          <h3 style="color:var(--brand)"><i class="bi bi-cloud-arrow-up"></i>文件上传</h3>
          <span class="small fw-semibold" style="color:var(--brand)">${doneCount} / ${totalCount}</span>
        </div>
        <div class="fx-card-body">
          <div class="progress-wrap">
            <div class="progress-label"><span>${reqCount?'必交项 '+reqDone+'/'+reqCount:'上传进度'}</span><span>${pct}%</span></div>
            <div class="progress-bar-outer"><div class="progress-bar-inner" style="width:${pct}%;background:${pct>=100?'var(--green)':'var(--brand)'}"></div></div>
          </div>
          ${itemsHtml}
        </div>
      </div>`;
    } else {
      return `
      <div class="fx-card">
        <div class="fx-card-head" style="background:var(--brand-lighter)">
          <h3 style="color:var(--brand)"><i class="bi bi-upload"></i>上传文件</h3>
        </div>
        <div class="fx-card-body">
          ${replies.length ? `<div style="background:var(--green-light);border:1px solid var(--green-border);border-radius:10px;padding:14px 16px;margin-bottom:16px;">
            <div class="fw-semibold" style="color:var(--green)"><i class="bi bi-check-circle-fill me-1"></i>已上传 ${replies.length} 个文件</div>
            ${replies.map(r=>'<div class="small mt-1" style="color:var(--gray-600)"><i class="bi bi-file-earmark me-1"></i>'+escHtml(r.original_name||r.title)+' · '+r.created_at.slice(0,16)+'</div>').join('')}
          </div>` : ''}
          <form method="POST" action="/s/fx/${escHtml(rec.upload_token)}/reply" enctype="multipart/form-data" onsubmit="this.querySelector('button[type=submit]').disabled=true;this.querySelector('button[type=submit]').innerHTML='<i class=bi-arrow-repeat></i> 上传中...'">
            <div class="upload-zone" id="uzMain">
              <i class="bi bi-cloud-arrow-up"></i>
              <div class="uz-hint small text-muted mt-1">点击选择文件或拖拽到此处</div>
              <div class="file-name"></div>
              <input type="file" name="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" required onchange="var z=this.closest('.upload-zone'),n=z.querySelector('.file-name');if(this.files[0]){n.textContent=this.files[0].name;z.classList.add('has-file')}else{z.classList.remove('has-file');n.textContent=''}">
            </div>
            <div class="form-text small text-center mt-1 mb-3" style="color:var(--gray-400)">支持 PDF / Word / 图片 / ZIP，最大 10MB</div>
            <button type="submit" class="btn-brand w-100"><i class="bi bi-upload me-1"></i>${replies.length ? '补充上传' : '确认上传'}</button>
          </form>
        </div>
      </div>`;
    }
  })() : ''}
</div>
<!-- Footer -->
<div class="page-footer">
  <div>Equistar International College</div>
  <div style="margin-top:4px">
    <span>1 Selegie Rd #07-02, Singapore</span>
    <span class="divider"></span>
    <a href="https://www.esic.edu.sg">www.esic.edu.sg</a>
  </div>
</div>
</body></html>`);
  });

  // 学生下载文件
  publicRouter.get('/s/fx/:token/dl', (req, res) => {
    const rec = db.get('SELECT * FROM file_exchange_records WHERE access_token=? AND is_deleted=0', [req.params.token]);
    if (!rec || !rec.file_path) return res.status(404).send('文件不存在');
    const fp = fileStorage.getFilePath(rec.file_path);
    if (!fs.existsSync(fp)) return res.status(404).send('文件不存在');
    fxLog(rec.id, rec.case_id, 'student_downloaded', 'student', rec.student_name||'学生', null, req.ip);
    const isPdfDl = rec.file_path && /\.pdf$/i.test(rec.file_path);
    const isImgDl = rec.file_path && /\.(jpg|jpeg|png|gif)$/i.test(rec.file_path);
    const dispDl = (isPdfDl || isImgDl) ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${dispDl}; filename="${encodeURIComponent(rec.original_name||rec.title)}"`);
    res.sendFile(fp, (err) => { if (err && !res.headersSent) res.status(500).json({ error: '文件发送失败' }); });
  });

  // 学生上传回传件
  publicRouter.post('/s/fx/:token/reply', upload.single('file'), (req, res) => {
    const rec = db.get('SELECT * FROM file_exchange_records WHERE upload_token=? AND is_deleted=0', [req.params.token]);
    if (!rec) return res.status(404).send('<h2>链接无效或已失效</h2>');
    if (rec.status === 'closed') return res.redirect(`/s/fx/${rec.access_token}`);
    if (!req.file) return res.redirect(`/s/fx/${rec.access_token}`);
    moveUploadedFile(req.file.filename, 'exchange');
    db.run(`UPDATE file_exchange_records SET is_deleted=1, updated_at=datetime('now') WHERE parent_id=? AND direction='student_to_admin'`, [rec.id]);
    const replyId = uuidv4();
    db.run(`INSERT INTO file_exchange_records (id,case_id,title,direction,file_path,original_name,file_size,status,parent_id,created_by,created_by_name,related_stage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [replyId, rec.case_id, `【回传】${rec.title}`, 'student_to_admin', req.file.filename, req.file.originalname, req.file.size, 'uploaded_by_student', rec.id, 'student', rec.student_name||'学生', rec.related_stage]);
    db.run(`UPDATE file_exchange_records SET status='replied', replied_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [rec.id]);
    fxLog(rec.id, rec.case_id, 'student_uploaded_reply', 'student', rec.student_name||'学生', `上传：${req.file.originalname}`, req.ip);
    try {
      const ic = db.get('SELECT student_name FROM intake_cases WHERE id=?', [rec.case_id]);
      db.all(`SELECT id FROM users WHERE role IN ('principal','intake_staff')`).forEach(u => {
        db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_user_id,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`,
          [uuidv4(), null, 'system', '学生已上传回传文件',
           `${ic?.student_name||rec.student_name||'学生'} 已上传文件《${rec.title}》的回传件，请查看。`, u.id]);
      });
    } catch(e) { console.error('回传通知失败:', e.message); }
    res.redirect(`/s/fx/${rec.access_token}`);
  });

  // 按清单项上传
  publicRouter.post('/s/fx/:token/reply-item', upload.single('file'), (req, res) => {
    const rec = db.get('SELECT * FROM file_exchange_records WHERE upload_token=? AND is_deleted=0', [req.params.token]);
    if (!rec) return res.status(404).send('<h2>链接无效或已失效</h2>');
    if (rec.status === 'closed') return res.redirect(`/s/fx/${rec.access_token}`);
    if (!req.file) return res.redirect(`/s/fx/${rec.access_token}`);
    moveUploadedFile(req.file.filename, 'exchange');
    const itemName = req.body.item_name || rec.title;
    db.run(`UPDATE file_exchange_records SET is_deleted=1, updated_at=datetime('now') WHERE parent_id=? AND direction='student_to_admin' AND title=? AND is_deleted=0`, [rec.id, `【上传】${itemName}`]);
    const replyId = uuidv4();
    db.run(`INSERT INTO file_exchange_records (id,case_id,title,direction,file_path,original_name,file_size,status,parent_id,created_by,created_by_name,related_stage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [replyId, rec.case_id, `【上传】${itemName}`, 'student_to_admin', req.file.filename, req.file.originalname, req.file.size, 'uploaded_by_student', rec.id, 'student', rec.student_name||'学生', rec.related_stage]);
    let allDone = true;
    try {
      const items = JSON.parse(rec.upload_items || '[]');
      const replies = db.all(`SELECT title FROM file_exchange_records WHERE parent_id=? AND direction='student_to_admin' AND is_deleted=0`, [rec.id]);
      const replyNames = new Set(replies.map(r => r.title.replace('【上传】','').replace('【回传】','').trim()));
      const reqItems = items.filter(i => i.required);
      allDone = reqItems.every(i => replyNames.has(i.name));
    } catch(e) { allDone = true; }
    db.run(`UPDATE file_exchange_records SET status=?, replied_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
      [allDone ? 'replied' : 'awaiting_upload', rec.id]);
    fxLog(rec.id, rec.case_id, 'student_uploaded_item', 'student', rec.student_name||'学生', `上传：${itemName} (${req.file.originalname})`, req.ip);
    try {
      const ic = db.get('SELECT student_name FROM intake_cases WHERE id=?', [rec.case_id]);
      db.all(`SELECT id FROM users WHERE role IN ('principal','intake_staff')`).forEach(u => {
        db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_user_id,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`,
          [uuidv4(), null, 'system', '学生已上传文件',
           `${ic?.student_name||rec.student_name||'学生'} 已上传「${itemName}」(${req.file.originalname})`, u.id]);
      });
    } catch(e) {}
    res.redirect(`/s/fx/${rec.access_token}`);
  });

  // ── 公开学生端路由（Case Files） ─────────────────────────

  publicRouter.get('/s/file/:token', (req, res) => {
    const send = db.get('SELECT cfs.*, cf.filename, cf.display_name, cf.original_name FROM case_file_sends cfs JOIN case_files cf ON cf.id=cfs.file_id WHERE cfs.token=? AND cfs.send_type=?', [req.params.token, 'file_view']);
    if (!send) return res.status(404).send('<h2>链接无效或已失效</h2>');
    if (send.expires_at && new Date(send.expires_at) < new Date()) return res.status(410).send('<h2>此文件链接已过期，请联系顾问重新发送</h2>');
    if (!send.viewed_at) db.run(`UPDATE case_file_sends SET viewed_at=datetime('now') WHERE token=?`, [req.params.token]);
    const filePath = fileStorage.getFilePath(send.filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('<h2>文件不存在</h2>');
    const isImage = /\.(jpg|jpeg|png|gif)$/i.test(send.filename);
    const isPdf = /\.pdf$/i.test(send.filename);
    const wmText = send.watermark_text || '仅供查看';
    const pageHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(send.display_name)}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    .watermark-wrap { position:relative; }
    .watermark-overlay { position:fixed; top:0; left:0; right:0; bottom:0; pointer-events:none; z-index:999;
      display:flex; align-items:center; justify-content:center; }
    .watermark-text { color:rgba(180,0,0,0.15); font-size:4rem; font-weight:900; transform:rotate(-30deg);
      user-select:none; white-space:nowrap; letter-spacing:.3em; }
  </style>
</head>
<body class="bg-light">
  <div class="container py-3">
    <div class="d-flex align-items-center gap-2 mb-3">
      <h5 class="mb-0">${escHtml(send.display_name)}</h5>
      ${send.with_watermark ? `<span class="badge bg-warning text-dark">${escHtml(wmText)}</span>` : ''}
      <a class="btn btn-sm btn-outline-primary ms-auto" href="/s/file/${escHtml(req.params.token)}/download">
        <i class="bi bi-download me-1"></i>下载
      </a>
    </div>
    ${isPdf ? `<iframe src="/s/file/${escHtml(req.params.token)}/download" style="width:100%;height:80vh;border:none;border-radius:8px"></iframe>` : ''}
    ${isImage ? `<img src="/s/file/${escHtml(req.params.token)}/download" class="img-fluid rounded shadow">` : ''}
    ${!isPdf && !isImage ? `<div class="alert alert-info">请点击上方"下载"按钮查看该文件。</div>` : ''}
  </div>
  ${send.with_watermark ? `<div class="watermark-overlay"><div class="watermark-text">${escHtml(wmText)}</div></div>` : ''}
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
</body></html>`;
    res.send(pageHtml);
  });

  publicRouter.get('/s/file/:token/download', (req, res) => {
    const send = db.get('SELECT cfs.*, cf.filename, cf.display_name, cf.original_name FROM case_file_sends cfs JOIN case_files cf ON cf.id=cfs.file_id WHERE cfs.token=? AND cfs.send_type=?', [req.params.token, 'file_view']);
    if (!send) return res.status(404).send('链接无效');
    if (send.expires_at && new Date(send.expires_at) < new Date()) return res.status(410).send('链接已过期');
    const filePath = fileStorage.getFilePath(send.filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('文件不存在');
    if (!send.downloaded_at) db.run(`UPDATE case_file_sends SET downloaded_at=datetime('now') WHERE token=?`, [req.params.token]);
    const ext = path.extname(send.filename);
    const safeOriginal = (send.original_name || send.display_name).replace(/[^\w.\u4e00-\u9fa5-]/g, '_') + (send.original_name ? '' : ext);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(safeOriginal)}"`);
    res.sendFile(filePath, (err) => { if (err && !res.headersSent) res.status(500).json({ error: '文件发送失败' }); });
  });

  publicRouter.get('/s/upload/:token', (req, res) => {
    const send = db.get('SELECT * FROM case_file_sends WHERE token=? AND send_type=?', [req.params.token, 'contract_upload']);
    if (!send) return res.status(404).send('<h2>链接无效或已失效</h2>');
    if (send.expires_at && new Date(send.expires_at) < new Date()) return res.status(410).send('<h2>此上传链接已过期，请联系顾问重新发送</h2>');
    const done = !!send.completed_at;
    if (!send.viewed_at) db.run(`UPDATE case_file_sends SET viewed_at=datetime('now') WHERE token=?`, [req.params.token]);
    res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>上传已签合同</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
<div class="container py-5">
  <div class="card shadow-sm mx-auto" style="max-width:560px">
    <div class="card-body p-4">
      <h5 class="mb-1"><i class="bi bi-file-earmark-check me-2"></i>上传已签合同</h5>
      <p class="text-muted small mb-4">学生：${escHtml(send.student_name||'')}</p>
      ${done ? `<div class="alert alert-success"><i class="bi bi-check-circle me-1"></i>已成功上传，感谢您！</div>` : `
      <form method="POST" action="/s/upload/${escHtml(req.params.token)}" enctype="multipart/form-data">
        <div class="mb-3">
          <label class="form-label fw-semibold">选择已签合同文件 <span class="text-danger">*</span></label>
          <input class="form-control" type="file" name="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" required>
          <div class="form-text">支持 PDF / Word / 图片，最大 10MB</div>
        </div>
        <button type="submit" class="btn btn-success w-100"><i class="bi bi-upload me-1"></i>确认上传</button>
      </form>`}
    </div>
  </div>
</div>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
</body></html>`);
  });

  publicRouter.post('/s/upload/:token', upload.single('file'), (req, res) => {
    const send = db.get('SELECT * FROM case_file_sends WHERE token=? AND send_type=?', [req.params.token, 'contract_upload']);
    if (!send) return res.status(404).send('<h2>链接无效或已失效</h2>');
    if (send.completed_at) return res.send('<h2>您已经上传过了，无需重复提交。</h2>');
    if (!req.file) return res.status(400).send('<h2>请选择文件</h2>');
    moveUploadedFile(req.file.filename, 'case');
    const fileId = uuidv4();
    db.run(`INSERT INTO case_files (id,case_id,file_type,display_name,filename,original_name,file_size,uploaded_by,uploaded_by_name) VALUES (?,?,?,?,?,?,?,?,?)`,
      [fileId, send.case_id, 'signed_contract', `已签合同（${send.student_name||'学生'}）`, req.file.filename, req.file.originalname, req.file.size, 'student', send.student_name||'学生']);
    db.run(`UPDATE case_file_sends SET completed_at=datetime('now'), result_file_id=? WHERE token=?`, [fileId, req.params.token]);
    try {
      const ic = db.get('SELECT student_name FROM intake_cases WHERE id=?', [send.case_id]);
      const staffUsers = db.all(`SELECT id FROM users WHERE role IN ('principal','intake_staff')`);
      staffUsers.forEach(u => {
        db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_role,target_user_id,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))`,
          [uuidv4(), null, 'system', '学生已上传已签合同',
           `${ic?.student_name||send.student_name||'学生'} 已通过链接上传了已签合同，请查看。`,
           u.role || 'intake_staff', u.id]);
      });
    } catch(e) { console.error('合同上传通知失败:', e.message); }
    res.redirect(`/s/upload/${req.params.token}`);
  });

  publicRouter.get('/s/sign/:token', (req, res) => {
    const send = db.get('SELECT * FROM case_file_sends WHERE token=? AND send_type=?', [req.params.token, 'signature']);
    if (!send) return res.status(404).send('<h2>链接无效或已失效</h2>');
    const sig = db.get('SELECT * FROM case_signatures WHERE send_id=?', [send.id]);
    const done = !!sig;
    if (!send.viewed_at) db.run(`UPDATE case_file_sends SET viewed_at=datetime('now') WHERE token=?`, [req.params.token]);
    let titleInfo = { title: send.title || '签字确认', description: send.description || '' };
    if (!send.title) { try { const p = JSON.parse(send.watermark_text || '{}'); titleInfo = { title: p.title||'签字确认', description: p.description||'' }; } catch(e) {} }
    res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(titleInfo.title||'签字确认')}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    #sig-canvas { border:2px dashed #ced4da; border-radius:8px; cursor:crosshair; touch-action:none; background:#fff; }
    body { background:#f8f9fa; }
  </style>
</head>
<body>
<div class="container py-5">
  <div class="card shadow-sm mx-auto" style="max-width:600px">
    <div class="card-body p-4">
      <h5 class="mb-1"><i class="bi bi-pen me-2"></i>${escHtml(titleInfo.title||'签字确认')}</h5>
      <p class="text-muted small mb-1">学生：${escHtml(send.student_name||'')}</p>
      ${titleInfo.description ? `<p class="small mb-3">${escHtml(titleInfo.description)}</p>` : '<div class="mb-3"></div>'}
      ${done ? `<div class="alert alert-success"><i class="bi bi-check-circle me-1"></i>您已完成签字，感谢！</div>
        <div class="text-center mt-2"><img src="${sig.signature_data}" style="max-width:100%;border:1px solid #dee2e6;border-radius:8px"></div>`
      : `
      <div class="mb-3">
        <label class="form-label fw-semibold">请在下方空白处签名 <span class="text-danger">*</span></label>
        <canvas id="sig-canvas" width="520" height="200" style="width:100%;max-width:520px"></canvas>
        <div class="d-flex gap-2 mt-1">
          <button class="btn btn-outline-secondary btn-sm" onclick="clearSig()"><i class="bi bi-eraser me-1"></i>清除</button>
          <span class="text-muted small ms-auto">用鼠标或手指在上方签名</span>
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">姓名确认</label>
        <input type="text" class="form-control" id="signer-name" placeholder="请输入您的姓名" value="${escHtml(send.student_name||'')}">
      </div>
      <button class="btn btn-success w-100" onclick="submitSig()"><i class="bi bi-check-lg me-1"></i>确认签字</button>`}
    </div>
  </div>
</div>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
<script>
${!done ? `
const canvas = document.getElementById('sig-canvas');
const ctx = canvas.getContext('2d');
let drawing = false, lastX = 0, lastY = 0;
function getPos(e) {
  const r = canvas.getBoundingClientRect();
  const scaleX = canvas.width / r.width;
  const scaleY = canvas.height / r.height;
  if (e.touches) return { x: (e.touches[0].clientX - r.left) * scaleX, y: (e.touches[0].clientY - r.top) * scaleY };
  return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
}
canvas.addEventListener('mousedown', e => { drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; });
canvas.addEventListener('mousemove', e => { if (!drawing) return; const p = getPos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); lastX = p.x; lastY = p.y; });
canvas.addEventListener('mouseup', () => drawing = false);
canvas.addEventListener('mouseleave', () => drawing = false);
canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; }, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); lastX = p.x; lastY = p.y; }, { passive: false });
canvas.addEventListener('touchend', () => drawing = false);
function clearSig() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
function submitSig() {
  const pix = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  if (!Array.from(pix).some((v, i) => i % 4 === 3 && v > 0)) { alert('请先在上方完成签名'); return; }
  const name = document.getElementById('signer-name').value.trim();
  if (!name) { alert('请填写您的姓名'); return; }
  fetch('/s/sign/${escHtml(req.params.token)}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature_data: canvas.toDataURL('image/png'), signer_name: name })
  }).then(r => r.json()).then(d => { if (d.ok) location.reload(); else alert(d.error || '提交失败'); });
}` : ''}
</script>
</body></html>`);
  });

  publicRouter.post('/s/sign/:token', express.json(), (req, res) => {
    const send = db.get('SELECT * FROM case_file_sends WHERE token=? AND send_type=?', [req.params.token, 'signature']);
    if (!send) return res.status(404).json({ error: '链接无效' });
    const existing = db.get('SELECT id FROM case_signatures WHERE send_id=?', [send.id]);
    if (existing) return res.status(400).json({ error: '您已完成签字' });
    const { signature_data, signer_name } = req.body;
    if (!signature_data) return res.status(400).json({ error: '请先完成签名' });
    const sigId = uuidv4();
    db.run(`INSERT INTO case_signatures (id,case_id,send_id,signer_name,signature_data,ip_address) VALUES (?,?,?,?,?,?)`,
      [sigId, send.case_id, send.id, signer_name||send.student_name, signature_data, req.ip]);
    db.run(`UPDATE case_file_sends SET completed_at=datetime('now') WHERE token=?`, [req.params.token]);
    try {
      const ic = db.get('SELECT student_name FROM intake_cases WHERE id=?', [send.case_id]);
      const staffUsers = db.all(`SELECT id FROM users WHERE role IN ('principal','intake_staff')`);
      staffUsers.forEach(u => {
        db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_role,target_user_id,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))`,
          [uuidv4(), null, 'system', '学生已完成签字',
           `${ic?.student_name||signer_name||'学生'} 已通过链接完成签字。`,
           'intake_staff', u.id]);
      });
    } catch(e) { console.error('签字通知失败:', e.message); }
    res.json({ ok: true });
  });

  return { apiRouter, publicRouter };
};
