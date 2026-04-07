/**
 * routes/agent-portal.js — Agent 自助门户 + 外部 Agent Workspace API (Magic Link)
 * Material request management endpoints moved to routes/mat-requests.js
 */
const express = require('express');

module.exports = function({ db, uuidv4, requireRole, upload, fileStorage, moveUploadedFile, fs, path,
  // Shared helpers injected from mat-requests router
  _matSendInviteEmail, _matCreateMagicLink, _matValidateToken, _matAudit, _agentRateLimit }) {
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
  //  外部 Agent Workspace API (Magic Link 鉴权)
  // ═══════════════════════════════════════════════════════

  router.get('/agent/auth', (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token' });
    if (!_agentRateLimit(token, res)) return;
    const v = _matValidateToken(token, req.ip);
    if (v.error) return res.status(v.status).json({ error: v.error });
    const contact = db.get(`SELECT id,name,email,phone FROM mat_contacts WHERE id=?`, [v.rec.contact_id]);
    const r = db.get(`SELECT mr.*,a.name as company_name FROM mat_requests mr
      LEFT JOIN agents a ON mr.company_id=a.id WHERE mr.id=?`, [v.rec.request_id]);
    if (!r) return res.status(404).json({ error: 'REQUEST_NOT_FOUND' });
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
    const r = db.get(`SELECT mr.*,a.name as company_name,ct.name as contact_name
      FROM mat_requests mr LEFT JOIN agents a ON mr.company_id=a.id
      LEFT JOIN mat_contacts ct ON mr.contact_id=ct.id WHERE mr.id=?`, [v.rec.request_id]);
    if (!r) return res.status(404).json({ error: 'REQUEST_NOT_FOUND' });
    if (['CANCELLED', 'COMPLETED'].includes(r.status)) return res.status(403).json({ error: `REQUEST_${r.status}` });
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

    // 使用事务避免并发上传导致的版本号冲突和状态竞态
    const curFileVer = db.get(`SELECT MAX(version_no) as mv FROM mat_item_versions WHERE item_id=?`, [req.params.itemId]);
    const fileVersionNo = (curFileVer?.mv || 0) + 1;
    const versionId = uuidv4();
    const requestId = v.rec.request_id;

    db.transaction((runInTx) => {
      runInTx(`UPDATE mat_item_versions SET is_current=0 WHERE item_id=? AND is_current=1`, [req.params.itemId]);
      runInTx(`INSERT INTO mat_item_versions (id,item_id,request_id,version_no,file_id,file_name,file_size,status,uploaded_at,is_current) VALUES (?,?,?,?,?,?,?,?,datetime('now'),1)`,
        [versionId, req.params.itemId, requestId, fileVersionNo, fileId, req.file.originalname, req.file.size, 'UPLOADED']);
      runInTx(`UPDATE mat_request_items SET status='UPLOADED',file_id=?,file_name=?,file_size=?,uploaded_at=datetime('now'),
        reject_reason=NULL,version_no=? WHERE id=?`,
        [fileId, req.file.originalname, req.file.size, fileVersionNo, req.params.itemId]);

      const r = db.get(`SELECT status FROM mat_requests WHERE id=?`, [requestId]);
      if (r && r.status === 'PENDING') {
        runInTx(`UPDATE mat_requests SET status='IN_PROGRESS',updated_at=datetime('now') WHERE id=?`, [requestId]);
      }

      const allItems = db.all(`SELECT * FROM mat_request_items WHERE request_id=?`, [requestId]);
      const requiredPending = allItems.filter(i => i.is_required && (i.id === req.params.itemId ? false : i.status === 'PENDING'));
      if (requiredPending.length === 0) {
        runInTx(`UPDATE mat_requests SET status='SUBMITTED',updated_at=datetime('now') WHERE id=?`, [requestId]);
      }
    });

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

  // Serve uploaded file (agent can download own file for preview)
  router.get('/agent/file/:fileId', (req, res) => {
    const { token } = req.query;
    const v = _matValidateToken(token, req.ip);
    if (v.error) return res.status(v.status).json({ error: v.error });
    const item = db.get(`SELECT mi.* FROM mat_request_items mi
      JOIN mat_requests mr ON mi.request_id=mr.id
      WHERE mi.file_id=? AND mr.id=?`, [req.params.fileId, v.rec.request_id]);
    if (!item) return res.status(403).json({ error: 'FORBIDDEN' });
    const filePath = fileStorage.getFilePath(req.params.fileId);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.download(filePath, item.file_name || req.params.fileId);
  });

  return router;
};
