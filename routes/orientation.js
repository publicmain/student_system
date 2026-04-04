/**
 * routes/orientation.js — Orientation 导出/发送 + 满意度调查
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, requireAdmissionModule, sendMail, escHtml, brandedEmail, xlsx }) {
  const apiRouter = express.Router();
  const publicRouter = express.Router();

  // ═══════════════════════════════════════════════════════
  //  Orientation 表格导出 (Excel)
  // ═══════════════════════════════════════════════════════

  apiRouter.get('/intake-cases/:id/orientation-export', requireAdmissionModule, (req, res) => {
    try {
      const c = db.get(`
        SELECT ic.*, s.name as student_name,
               ar.expected_arrival, ar.actual_arrival, ar.flight_no, ar.accommodation,
               ar.orientation_date, ar.orientation_done, ar.student_pass_issued,
               ar.accommodation_address, ar.emergency_contact_name, ar.emergency_contact_phone,
               ar.student_pass_no, ar.student_pass_expiry, ar.local_bank_account, ar.orientation_notes
        FROM intake_cases ic
        JOIN students s ON s.id = ic.student_id
        LEFT JOIN arrival_records ar ON ar.case_id = ic.id
        WHERE ic.id=?`, [req.params.id]);
      if (!c) return res.status(404).json({ error: 'Case 不存在' });
      const rows = [
        ['Orientation 记录表', ''],
        ['', ''],
        ['学生姓名', c.student_name || ''],
        ['课程/项目', c.program_name || ''],
        ['入学年份', c.intake_year || ''],
        ['', ''],
        ['到校信息', ''],
        ['预计到校日期', c.expected_arrival || ''],
        ['实际到校日期', c.actual_arrival || ''],
        ['航班号', c.flight_no || ''],
        ['Orientation 日期', c.orientation_date || ''],
        ['住宿安排', c.accommodation || ''],
        ['住宿地址', c.accommodation_address || ''],
        ['', ''],
        ['紧急联系人信息', ''],
        ['紧急联系人姓名', c.emergency_contact_name || ''],
        ['紧急联系人电话', c.emergency_contact_phone || ''],
        ['', ''],
        ['证件与账户', ''],
        ['学生证号 (Student Pass)', c.student_pass_no || ''],
        ['学生证有效期', c.student_pass_expiry || ''],
        ['本地银行账户', c.local_bank_account || ''],
        ['', ''],
        ['完成状态', ''],
        ['Orientation 已完成', c.orientation_done ? '是' : '否'],
        ['学生准证已办理', c.student_pass_issued ? '是' : '否'],
        ['', ''],
        ['备注', c.orientation_notes || ''],
      ];
      const ws = xlsx.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 24 }, { wch: 36 }];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Orientation');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = `orientation_${(c.student_name||'student').replace(/\s+/g,'_')}.xlsx`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buf);
    } catch(e) {
      console.error('orientation-export 失败:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  apiRouter.post('/intake-cases/:id/orientation-send', requireRole('principal','student_admin','intake_staff'), async (req, res) => {
    try {
      const c = db.get(`
        SELECT ic.*, s.name as student_name,
               ar.expected_arrival, ar.actual_arrival, ar.flight_no, ar.accommodation,
               ar.orientation_date, ar.orientation_done, ar.student_pass_issued,
               ar.accommodation_address, ar.emergency_contact_name, ar.emergency_contact_phone,
               ar.student_pass_no, ar.student_pass_expiry, ar.local_bank_account, ar.orientation_notes
        FROM intake_cases ic
        JOIN students s ON s.id = ic.student_id
        LEFT JOIN arrival_records ar ON ar.case_id = ic.id
        WHERE ic.id=?`, [req.params.id]);
      if (!c) return res.status(404).json({ error: 'Case 不存在' });
      const rows = [
        ['Orientation 记录表', ''],
        ['学生姓名', c.student_name || ''],
        ['课程/项目', c.program_name || ''],
        ['入学年份', c.intake_year || ''],
        ['预计到校日期', c.expected_arrival || ''],
        ['实际到校日期', c.actual_arrival || ''],
        ['航班号', c.flight_no || ''],
        ['Orientation 日期', c.orientation_date || ''],
        ['住宿安排', c.accommodation || ''],
        ['住宿地址', c.accommodation_address || ''],
        ['紧急联系人姓名', c.emergency_contact_name || ''],
        ['紧急联系人电话', c.emergency_contact_phone || ''],
        ['学生证号', c.student_pass_no || ''],
        ['学生证有效期', c.student_pass_expiry || ''],
        ['本地银行账户', c.local_bank_account || ''],
        ['Orientation 已完成', c.orientation_done ? '是' : '否'],
        ['学生准证已办理', c.student_pass_issued ? '是' : '否'],
        ['备注', c.orientation_notes || ''],
      ];
      const ws = xlsx.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 24 }, { wch: 36 }];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Orientation');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const guanUser = db.get(`SELECT s.email, s.name FROM users u JOIN staff s ON s.id=u.linked_id WHERE u.username='guan'`);
      const toEmail = (guanUser && guanUser.email) ? guanUser.email : req.body.to_email;
      if (!toEmail) return res.status(400).json({ error: '无法找到关老师邮箱，请手动提供 to_email' });
      const filename = `orientation_${(c.student_name||'student').replace(/\s+/g,'_')}.xlsx`;
      await sendMail(toEmail,
        `Orientation 表格 - ${c.student_name}`,
        `<p>您好，请查收 ${c.student_name} 的 Orientation 记录表。</p>`,
        [{ filename, content: buf }]
      );
      res.json({ ok: true, sent_to: toEmail });
    } catch(e) {
      console.error('orientation-send 失败:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════
  //  满意度调查外链
  // ═══════════════════════════════════════════════════════

  apiRouter.post('/intake-cases/:id/send-survey-link', requireAdmissionModule, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: '请提供收件人邮箱' });
      let link = db.get('SELECT token FROM survey_links WHERE case_id=?', [req.params.id]);
      if (!link) {
        const token = uuidv4();
        db.run(`INSERT INTO survey_links (id,case_id,token) VALUES (?,?,?)`, [uuidv4(), req.params.id, token]);
        link = { token };
      }
      const _appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const surveyUrl = `${_appUrl}/survey/${link.token}`;
      const ic = db.get(`SELECT program_name, student_name FROM intake_cases WHERE id=?`, [req.params.id]);
      res.json({ ok: true, survey_url: surveyUrl });
      sendMail(email,
        `满意度调查邀请 - ${ic?.student_name || ''}`,
        `<p>您好，</p><p>感谢您选择我们！请花几分钟填写入学满意度调查：</p><p><a href="${surveyUrl}" style="font-size:1.1em;font-weight:bold;">${surveyUrl}</a></p><p>您的反馈对我们非常重要。</p>`
      ).catch(e => { console.error('send-survey-link 失败:', e.message); });
    } catch(e) {
      console.error('send-survey-link 失败:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  apiRouter.post('/intake-cases/:id/survey-link', requireAdmissionModule, (req, res) => {
    const existing = db.get('SELECT * FROM survey_links WHERE case_id=?', [req.params.id]);
    if (existing) {
      const _appUrl2 = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const url = `${_appUrl2}/survey/${existing.token}`;
      return res.json({ url, token: existing.token, existing: true });
    }
    const token = uuidv4();
    db.run(`INSERT INTO survey_links (id,case_id,token) VALUES (?,?,?)`, [uuidv4(), req.params.id, token]);
    const _appUrl3 = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const url = `${_appUrl3}/survey/${token}`;
    res.json({ url, token, existing: false });
  });

  // ── 公开路由：渲染问卷页面（无需登录） ──────────────────
  publicRouter.get('/survey/:token', (req, res) => {
    const link = db.get('SELECT sl.*, ic.program_name, ic.student_name FROM survey_links sl JOIN intake_cases ic ON ic.id=sl.case_id WHERE sl.token=?', [req.params.token]);
    if (!link) return res.status(404).send('<h2>链接无效或已失效</h2>');
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).send('<h2>此调查链接已过期</h2>');
    }
    const submitted = db.get('SELECT id FROM post_arrival_surveys WHERE case_id=?', [link.case_id]);
    if (submitted) {
      return res.send(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>调查问卷</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet"></head><body class="bg-light"><div class="container py-5 text-center"><div class="card shadow-sm mx-auto" style="max-width:500px"><div class="card-body p-5"><h3 class="text-success mb-3">✅ 已提交</h3><p class="text-muted">您已提交过满意度调查，感谢您的反馈！</p></div></div></div></body></html>`);
    }
    res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>满意度调查 - ${escHtml(link.student_name)}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background: #f8f9fa; }
    .star-rating { display:flex; flex-direction:row-reverse; justify-content:flex-end; gap:4px; }
    .star-rating input { display:none; }
    .star-rating label { font-size:2rem; cursor:pointer; color:#dee2e6; transition:color .2s; }
    .star-rating input:checked ~ label,
    .star-rating label:hover,
    .star-rating label:hover ~ label { color:#ffc107; }
  </style>
</head>
<body>
  <div class="container py-5">
    <div class="card shadow-sm mx-auto" style="max-width:600px">
      <div class="card-body p-4">
        <h4 class="mb-1">入学满意度调查</h4>
        <p class="text-muted small mb-4">学生：${escHtml(link.student_name)} · 课程：${escHtml(link.program_name)}</p>
        <form method="POST" action="/survey/${escHtml(req.params.token)}">
          <div class="mb-4">
            <label class="form-label fw-semibold">整体满意度 <span class="text-danger">*</span></label>
            <div class="star-rating">
              <input type="radio" name="overall_satisfaction" id="s5" value="5" required><label for="s5">★</label>
              <input type="radio" name="overall_satisfaction" id="s4" value="4"><label for="s4">★</label>
              <input type="radio" name="overall_satisfaction" id="s3" value="3"><label for="s3">★</label>
              <input type="radio" name="overall_satisfaction" id="s2" value="2"><label for="s2">★</label>
              <input type="radio" name="overall_satisfaction" id="s1" value="1"><label for="s1">★</label>
            </div>
            <div class="d-flex justify-content-between small text-muted mt-1"><span>非常不满意</span><span>非常满意</span></div>
          </div>
          <div class="mb-3">
            <label class="form-label fw-semibold">住宿安排是否满意？</label>
            <div class="d-flex gap-3">
              <div class="form-check"><input class="form-check-input" type="radio" name="accommodation_ok" id="acc1" value="1"><label class="form-check-label" for="acc1">满意</label></div>
              <div class="form-check"><input class="form-check-input" type="radio" name="accommodation_ok" id="acc0" value="0"><label class="form-check-label" for="acc0">不满意</label></div>
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label fw-semibold">Orientation 对您是否有帮助？</label>
            <div class="d-flex gap-3">
              <div class="form-check"><input class="form-check-input" type="radio" name="orientation_helpful" id="ori1" value="1"><label class="form-check-label" for="ori1">有帮助</label></div>
              <div class="form-check"><input class="form-check-input" type="radio" name="orientation_helpful" id="ori0" value="0"><label class="form-check-label" for="ori0">帮助不大</label></div>
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label fw-semibold">您还需要哪些支持？</label>
            <input type="text" class="form-control" name="support_needed" placeholder="请简要描述（可留空）">
          </div>
          <div class="mb-4">
            <label class="form-label fw-semibold">总体评价与建议</label>
            <textarea class="form-control" name="comments" rows="3" placeholder="请填写您的意见与建议（可留空）"></textarea>
          </div>
          <button type="submit" class="btn btn-primary w-100">提交调查</button>
        </form>
      </div>
    </div>
  </div>
</body>
</html>`);
  });

  // 公开路由：接收问卷提交
  publicRouter.post('/survey/:token', express.urlencoded({ extended: false }), async (req, res) => {
    const link = db.get('SELECT * FROM survey_links WHERE token=?', [req.params.token]);
    if (!link) return res.status(404).send('<h2>链接无效</h2>');
    const existing = db.get('SELECT id FROM post_arrival_surveys WHERE case_id=?', [link.case_id]);
    if (existing) return res.redirect(`/survey/${req.params.token}`);
    const { overall_satisfaction, accommodation_ok, orientation_helpful, support_needed, comments } = req.body;
    if (!overall_satisfaction) return res.status(400).send('<p>请填写整体满意度评分</p>');
    const id = uuidv4();
    db.run(`INSERT INTO post_arrival_surveys (id,case_id,survey_date,overall_satisfaction,accommodation_ok,orientation_helpful,support_needed,comments,filled_by)
      VALUES (?,?,date('now'),?,?,?,?,?,?)`,
      [id, link.case_id, parseInt(overall_satisfaction),
       accommodation_ok?1:0, orientation_helpful?1:0,
       support_needed||null, comments||null, 'student_external']);
    try {
      const ic = db.get(`SELECT * FROM intake_cases WHERE id=?`, [link.case_id]);
      const adminUsers = db.all(`SELECT u.id, s.email FROM users u JOIN staff s ON s.id=u.linked_id WHERE u.role='student_admin'`);
      for (const u of adminUsers) {
        db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_role,target_user_id,created_at)
          VALUES(?,?,?,?,?,?,?,datetime('now'))`,
          [uuidv4(), null, 'system',
           '满意度调查已提交',
           `${ic?.student_name || '学生'} 已完成满意度调查（${overall_satisfaction}星）`,
           'student_admin', u.id]);
        if (u.email) {
          try {
            await sendMail(u.email, `满意度调查已提交 - ${ic?.student_name}`,
              `<p>${ic?.student_name || '学生'} 已完成满意度调查，整体评分 ${overall_satisfaction} 星。</p><p>请登录系统查看详情。</p>`
            );
          } catch(e) { console.error('调查通知邮件失败:', e.message); }
        }
      }
    } catch(e) { console.error('调查通知失败:', e.message); }
    res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>感谢您的反馈</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
  <div class="container py-5 text-center">
    <div class="card shadow-sm mx-auto" style="max-width:500px">
      <div class="card-body p-5">
        <div class="display-3 mb-3">🎉</div>
        <h3 class="text-success mb-2">感谢您的反馈！</h3>
        <p class="text-muted">您的满意度调查已成功提交。<br>我们会认真参考您的意见，持续改善服务。</p>
      </div>
    </div>
  </div>
</body>
</html>`);
  });

  return { apiRouter, publicRouter };
};
