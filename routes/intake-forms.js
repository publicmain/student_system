/**
 * routes/intake-forms.js — 信息收集表单（公开链接 + 后台管理）
 *
 * 公开端点（无需登录，凭 token 访问）:
 *   GET  /form/:token           — 渲染表单页面
 *   GET  /api/public/form/:token — 获取表单元数据
 *   POST /api/public/form/:token — 提交表单
 *
 * 管理端点（需登录）:
 *   GET    /api/intake-forms              — 列出所有表单链接
 *   POST   /api/intake-forms              — 创建表单链接
 *   PUT    /api/intake-forms/:id          — 编辑表单链接
 *   DELETE /api/intake-forms/:id          — 删除表单链接
 *   GET    /api/intake-forms/:id/submissions — 查看提交列表
 *   GET    /api/intake-form-submissions/:subId — 查看单条提交详情
 *   PUT    /api/intake-form-submissions/:subId/status — 审核（approve/reject）
 *   POST   /api/intake-form-submissions/:subId/import — 一键导入为学生
 */
const express = require('express');
const crypto = require('crypto');

module.exports = function ({ db, uuidv4, audit, requireAuth, requireRole }) {
  const apiRouter = express.Router();
  const publicRouter = express.Router();

  // ═══════════════════════════════════════════════════════
  //  管理端点
  // ═══════════════════════════════════════════════════════

  // ── 列出所有表单链接 ──
  apiRouter.get('/intake-forms', requireRole('principal', 'counselor', 'intake_staff'), (req, res) => {
    const forms = db.all(`
      SELECT f.*,
        (SELECT COUNT(*) FROM intake_form_submissions s WHERE s.form_id = f.id) as submission_count,
        (SELECT COUNT(*) FROM intake_form_submissions s WHERE s.form_id = f.id AND s.status = 'pending') as pending_count
      FROM intake_forms f
      ORDER BY f.created_at DESC
    `);
    res.json(forms);
  });

  // ── 创建表单链接 ──
  apiRouter.post('/intake-forms', requireRole('principal', 'counselor'), (req, res) => {
    const { title, description, grade_level, expires_at, max_submissions } = req.body;
    if (!title) return res.status(400).json({ error: '标题必填' });

    const id = uuidv4();
    const token = crypto.randomBytes(16).toString('hex'); // 32字符
    const now = new Date().toISOString();

    db.run(`INSERT INTO intake_forms (id, token, title, description, grade_level, expires_at, max_submissions, status, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [id, token, title, description || '', grade_level || '', expires_at || null, max_submissions || 0, req.session.user.id, now, now]);

    audit(req, 'CREATE_INTAKE_FORM', 'intake_forms', id, { title, token });
    const form = db.get('SELECT * FROM intake_forms WHERE id=?', [id]);
    res.json(form);
  });

  // ── 编辑表单链接 ──
  apiRouter.put('/intake-forms/:id', requireRole('principal', 'counselor'), (req, res) => {
    const form = db.get('SELECT * FROM intake_forms WHERE id=?', [req.params.id]);
    if (!form) return res.status(404).json({ error: '表单不存在' });

    const { title, description, grade_level, expires_at, max_submissions, status } = req.body;
    const now = new Date().toISOString();

    db.run(`UPDATE intake_forms SET title=?, description=?, grade_level=?, expires_at=?, max_submissions=?, status=?, updated_at=? WHERE id=?`,
      [title || form.title, description ?? form.description, grade_level ?? form.grade_level,
       expires_at ?? form.expires_at, max_submissions ?? form.max_submissions,
       status || form.status, now, form.id]);

    audit(req, 'UPDATE_INTAKE_FORM', 'intake_forms', form.id, { title, status });
    res.json(db.get('SELECT * FROM intake_forms WHERE id=?', [form.id]));
  });

  // ── 删除表单链接 ──
  apiRouter.delete('/intake-forms/:id', requireRole('principal'), (req, res) => {
    const form = db.get('SELECT * FROM intake_forms WHERE id=?', [req.params.id]);
    if (!form) return res.status(404).json({ error: '表单不存在' });

    // 同时删除所有提交
    db.run('DELETE FROM intake_form_submissions WHERE form_id=?', [form.id]);
    db.run('DELETE FROM intake_forms WHERE id=?', [form.id]);

    audit(req, 'DELETE_INTAKE_FORM', 'intake_forms', form.id, { title: form.title });
    res.json({ ok: true });
  });

  // ── 查看某表单下的提交列表 ──
  apiRouter.get('/intake-forms/:id/submissions', requireRole('principal', 'counselor', 'intake_staff'), (req, res) => {
    const form = db.get('SELECT * FROM intake_forms WHERE id=?', [req.params.id]);
    if (!form) return res.status(404).json({ error: '表单不存在' });

    const subs = db.all(`
      SELECT s.*, f.title as form_title
      FROM intake_form_submissions s
      JOIN intake_forms f ON f.id = s.form_id
      WHERE s.form_id = ?
      ORDER BY s.submitted_at DESC
    `, [form.id]);

    // 解析 JSON data 供前端展示摘要
    const enriched = subs.map(s => {
      try {
        const d = JSON.parse(s.data || '{}');
        return {
          ...s,
          student_name: d.student_name || '',
          student_phone: d.student_phone || '',
          parent_name: d.parent1_name || '',
          parent_phone: d.parent1_phone || '',
          grade_level: d.grade_level || '',
        };
      } catch (e) {
        return { ...s, student_name: '(解析失败)' };
      }
    });
    res.json(enriched);
  });

  // ── 查看单条提交详情 ──
  apiRouter.get('/intake-form-submissions/:subId', requireRole('principal', 'counselor', 'intake_staff'), (req, res) => {
    const sub = db.get(`
      SELECT s.*, f.title as form_title
      FROM intake_form_submissions s
      JOIN intake_forms f ON f.id = s.form_id
      WHERE s.id = ?
    `, [req.params.subId]);
    if (!sub) return res.status(404).json({ error: '提交不存在' });
    res.json(sub);
  });

  // ── 审核：approve / reject ──
  apiRouter.put('/intake-form-submissions/:subId/status', requireRole('principal', 'counselor'), (req, res) => {
    const { status, review_notes } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: '状态只能是 approved 或 rejected' });
    }

    const sub = db.get('SELECT * FROM intake_form_submissions WHERE id=?', [req.params.subId]);
    if (!sub) return res.status(404).json({ error: '提交不存在' });

    const now = new Date().toISOString();
    db.run(`UPDATE intake_form_submissions SET status=?, review_notes=?, reviewed_by=?, reviewed_at=? WHERE id=?`,
      [status, review_notes || '', req.session.user.id, now, sub.id]);

    audit(req, status === 'approved' ? 'APPROVE_SUBMISSION' : 'REJECT_SUBMISSION',
      'intake_form_submissions', sub.id, { review_notes });

    res.json(db.get('SELECT * FROM intake_form_submissions WHERE id=?', [sub.id]));
  });

  // ── 一键导入为学生 ──
  apiRouter.post('/intake-form-submissions/:subId/import', requireRole('principal', 'counselor'), (req, res) => {
    const sub = db.get('SELECT * FROM intake_form_submissions WHERE id=?', [req.params.subId]);
    if (!sub) return res.status(404).json({ error: '提交不存在' });
    if (sub.imported_student_id) return res.status(409).json({ error: '该提交已导入', student_id: sub.imported_student_id });

    let data;
    try { data = JSON.parse(sub.data || '{}'); } catch (e) {
      return res.status(400).json({ error: '数据格式错误' });
    }

    const now = new Date().toISOString();

    // 1. 创建学生
    const studentId = uuidv4();
    db.run(`INSERT INTO students (id, name, grade_level, enrol_date, exam_board, date_of_birth, notes, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [studentId, data.student_name || '未命名',
       data.grade_level || '其他',
       data.enrol_date || null,
       data.exam_board || null,
       data.date_of_birth || null,
       buildStudentNotes(data),
       now, now]);

    // 2. 创建家长（最多2个）
    const parentIds = [];
    for (let i = 1; i <= 2; i++) {
      const pName = data[`parent${i}_name`];
      if (!pName) continue;
      const pid = uuidv4();
      db.run(`INSERT INTO parent_guardians (id, name, relation, phone, email, wechat, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [pid, pName,
         data[`parent${i}_relation`] || '',
         data[`parent${i}_phone`] || '',
         data[`parent${i}_email`] || '',
         data[`parent${i}_wechat`] || '',
         now]);
      db.run('INSERT INTO student_parents (student_id, parent_id) VALUES (?, ?)', [studentId, pid]);
      parentIds.push(pid);
    }

    // 3. 标记提交为已导入
    db.run('UPDATE intake_form_submissions SET status=?, imported_student_id=?, reviewed_at=?, reviewed_by=? WHERE id=?',
      ['imported', studentId, now, req.session.user.id, sub.id]);

    audit(req, 'IMPORT_FORM_SUBMISSION', 'students', studentId, {
      submission_id: sub.id,
      student_name: data.student_name,
      parent_count: parentIds.length
    });

    res.json({
      student_id: studentId,
      student_name: data.student_name,
      parent_ids: parentIds,
      message: '导入成功'
    });
  });

  // ═══════════════════════════════════════════════════════
  //  公开端点（凭 token 访问）
  // ═══════════════════════════════════════════════════════

  // ── 获取表单元数据（公开） ──
  publicRouter.get('/api/public/form/:token', (req, res) => {
    const form = db.get('SELECT * FROM intake_forms WHERE token=?', [req.params.token]);
    if (!form) return res.status(404).json({ error: '表单不存在或链接无效' });
    if (form.status !== 'active') return res.status(410).json({ error: '该表单已关闭' });
    if (form.expires_at && new Date(form.expires_at) < new Date()) {
      return res.status(410).json({ error: '该表单已过期' });
    }
    if (form.max_submissions > 0) {
      const cnt = db.get('SELECT COUNT(*) as cnt FROM intake_form_submissions WHERE form_id=?', [form.id]).cnt;
      if (cnt >= form.max_submissions) {
        return res.status(410).json({ error: '该表单已达最大提交数量' });
      }
    }
    // 返回安全的元数据（不含 token）
    res.json({
      id: form.id,
      title: form.title,
      description: form.description,
      grade_level: form.grade_level,
    });
  });

  // ── 提交表单（公开） ──
  publicRouter.post('/api/public/form/:token', express.json(), (req, res) => {
    const form = db.get('SELECT * FROM intake_forms WHERE token=?', [req.params.token]);
    if (!form) return res.status(404).json({ error: '表单不存在或链接无效' });
    if (form.status !== 'active') return res.status(410).json({ error: '该表单已关闭' });
    if (form.expires_at && new Date(form.expires_at) < new Date()) {
      return res.status(410).json({ error: '该表单已过期' });
    }
    if (form.max_submissions > 0) {
      const cnt = db.get('SELECT COUNT(*) as cnt FROM intake_form_submissions WHERE form_id=?', [form.id]).cnt;
      if (cnt >= form.max_submissions) {
        return res.status(410).json({ error: '该表单已达最大提交数量' });
      }
    }

    const data = req.body;
    // 基础验证
    if (!data.student_name || !data.student_name.trim()) {
      return res.status(400).json({ error: '学生姓名必填' });
    }

    const subId = uuidv4();
    const now = new Date().toISOString();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    db.run(`INSERT INTO intake_form_submissions (id, form_id, data, status, submitted_at, ip_address)
            VALUES (?, ?, ?, 'pending', ?, ?)`,
      [subId, form.id, JSON.stringify(data), now, ip]);

    res.json({ ok: true, message: '提交成功！学校将尽快审核您的信息。' });
  });

  // ── 公开表单页面（HTML） ──
  publicRouter.get('/form/:token', (req, res) => {
    const form = db.get('SELECT * FROM intake_forms WHERE token=?', [req.params.token]);
    if (!form) return res.status(404).send(formErrorPage('表单不存在或链接无效'));
    if (form.status !== 'active') return res.status(410).send(formErrorPage('该表单已关闭'));
    if (form.expires_at && new Date(form.expires_at) < new Date()) {
      return res.status(410).send(formErrorPage('该表单已过期'));
    }
    // 发送表单 HTML
    res.send(buildFormHTML(form));
  });

  // ═══════════════════════════════════════════════════════
  //  辅助函数
  // ═══════════════════════════════════════════════════════

  function buildStudentNotes(data) {
    const parts = [];
    if (data.nationality) parts.push(`国籍: ${data.nationality}`);
    if (data.id_number) parts.push(`证件号: ${data.id_number}`);
    if (data.current_school) parts.push(`原就读学校: ${data.current_school}`);
    if (data.student_phone) parts.push(`学生电话: ${data.student_phone}`);
    if (data.student_email) parts.push(`学生邮箱: ${data.student_email}`);
    if (data.student_wechat) parts.push(`学生微信: ${data.student_wechat}`);
    if (data.address) parts.push(`家庭地址: ${data.address}`);
    if (data.health_notes) parts.push(`健康/特殊需求: ${data.health_notes}`);
    if (data.hobbies) parts.push(`兴趣爱好: ${data.hobbies}`);
    if (data.target_countries) parts.push(`意向留学国家: ${data.target_countries}`);
    if (data.target_major) parts.push(`意向专业方向: ${data.target_major}`);
    if (data.extra_notes) parts.push(`补充说明: ${data.extra_notes}`);
    return parts.join('\n') || null;
  }

  function formErrorPage(msg) {
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>提示</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#fff;border-radius:16px;padding:48px;max-width:420px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.icon{font-size:48px;margin-bottom:16px}p{color:#64748b;font-size:16px;line-height:1.6}</style>
</head><body><div class="card"><div class="icon">😔</div><h2 style="margin-bottom:12px;color:#334155">${msg}</h2><p>如有疑问，请联系学校管理员。</p></div></body></html>`;
  }

  function buildFormHTML(form) {
    const esc = (s) => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(form.title)} — 信息收集</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;padding:20px}
.form-container{max-width:720px;margin:0 auto}
.form-header{text-align:center;color:#fff;padding:40px 20px 30px}
.form-header h1{font-size:28px;font-weight:700;margin-bottom:8px}
.form-header p{font-size:15px;opacity:.85;line-height:1.6}
.step-indicator{display:flex;justify-content:center;gap:8px;margin:24px 0 20px;flex-wrap:wrap}
.step-dot{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;background:rgba(255,255,255,.2);color:rgba(255,255,255,.6);transition:all .3s}
.step-dot.active{background:#fff;color:#667eea;box-shadow:0 2px 12px rgba(0,0,0,.15)}
.step-dot.done{background:rgba(255,255,255,.7);color:#22c55e}
.card{background:#fff;border-radius:16px;padding:32px;box-shadow:0 8px 32px rgba(0,0,0,.12);margin-bottom:20px}
.card h2{font-size:20px;color:#1e293b;margin-bottom:4px}
.card .subtitle{color:#64748b;font-size:14px;margin-bottom:24px}
.field{margin-bottom:20px}
.field label{display:block;font-size:14px;font-weight:600;color:#334155;margin-bottom:6px}
.field label .req{color:#ef4444;margin-left:2px}
.field input,.field select,.field textarea{width:100%;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:15px;color:#1e293b;transition:border-color .2s;background:#fff}
.field input:focus,.field select:focus,.field textarea:focus{outline:none;border-color:#667eea;box-shadow:0 0 0 3px rgba(102,126,234,.15)}
.field textarea{min-height:80px;resize:vertical}
.field .hint{font-size:12px;color:#94a3b8;margin-top:4px}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:560px){.field-row{grid-template-columns:1fr}}
.btn-row{display:flex;justify-content:space-between;gap:12px;margin-top:24px}
.btn{padding:12px 28px;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:all .2s}
.btn-prev{background:#f1f5f9;color:#475569}.btn-prev:hover{background:#e2e8f0}
.btn-next{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;margin-left:auto}.btn-next:hover{opacity:.9;transform:translateY(-1px)}
.btn-next:disabled{opacity:.5;cursor:not-allowed;transform:none}
.btn-submit{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;margin-left:auto}.btn-submit:hover{opacity:.9}
.success-card{text-align:center;padding:60px 32px}
.success-card .icon{font-size:64px;margin-bottom:16px}
.success-card h2{color:#22c55e;margin-bottom:12px}
.success-card p{color:#64748b;line-height:1.7}
.section-title{font-size:16px;font-weight:700;color:#667eea;margin:24px 0 12px;padding-bottom:8px;border-bottom:2px solid #f1f5f9}
.section-title:first-child{margin-top:0}
.hidden{display:none}
</style>
</head>
<body>
<div class="form-container">
  <div class="form-header">
    <h1>${esc(form.title)}</h1>
    ${form.description ? `<p>${esc(form.description)}</p>` : ''}
  </div>

  <div class="step-indicator" id="stepIndicator">
    <div class="step-dot active" data-step="1">1</div>
    <div class="step-dot" data-step="2">2</div>
    <div class="step-dot" data-step="3">3</div>
    <div class="step-dot" data-step="4">4</div>
    <div class="step-dot" data-step="5">5</div>
  </div>

  <form id="intakeForm" novalidate>
    <!-- Step 1: 学生基本信息 -->
    <div class="card step-card" data-step="1">
      <h2>学生基本信息</h2>
      <p class="subtitle">请填写学生的个人信息</p>
      <div class="field">
        <label>学生姓名 <span class="req">*</span></label>
        <input type="text" name="student_name" required placeholder="请输入学生全名">
      </div>
      <div class="field-row">
        <div class="field">
          <label>性别</label>
          <select name="gender">
            <option value="">请选择</option>
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
        </div>
        <div class="field">
          <label>出生日期</label>
          <input type="date" name="date_of_birth">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>国籍</label>
          <input type="text" name="nationality" placeholder="如：中国">
        </div>
        <div class="field">
          <label>证件号码</label>
          <input type="text" name="id_number" placeholder="身份证或护照号">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>当前年级 <span class="req">*</span></label>
          <select name="grade_level" required>
            <option value="">请选择</option>
            ${form.grade_level ? `<option value="${esc(form.grade_level)}" selected>${esc(form.grade_level)}</option>` : ''}
            <option value="G9">G9 (初三)</option>
            <option value="G10">G10 (高一)</option>
            <option value="G11">G11 (高二)</option>
            <option value="G12">G12 (高三)</option>
            <option value="G13">G13</option>
            <option value="其他">其他</option>
          </select>
        </div>
        <div class="field">
          <label>考试体系</label>
          <select name="exam_board">
            <option value="">请选择</option>
            <option value="A-Level (Edexcel)">A-Level (Edexcel)</option>
            <option value="A-Level (CIE)">A-Level (CIE)</option>
            <option value="A-Level (AQA)">A-Level (AQA)</option>
            <option value="IB">IB</option>
            <option value="AP">AP</option>
            <option value="普高">普高</option>
            <option value="其他">其他</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>原就读学校</label>
        <input type="text" name="current_school" placeholder="目前或之前就读的学校名称">
      </div>
      <div class="btn-row">
        <span></span>
        <button type="button" class="btn btn-next" onclick="nextStep()">下一步</button>
      </div>
    </div>

    <!-- Step 2: 学生联系方式 -->
    <div class="card step-card hidden" data-step="2">
      <h2>学生联系方式</h2>
      <p class="subtitle">请填写学生本人的联系方式</p>
      <div class="field-row">
        <div class="field">
          <label>手机号码</label>
          <input type="tel" name="student_phone" placeholder="如：13800138000">
        </div>
        <div class="field">
          <label>电子邮箱</label>
          <input type="email" name="student_email" placeholder="如：student@example.com">
        </div>
      </div>
      <div class="field">
        <label>微信号</label>
        <input type="text" name="student_wechat" placeholder="学生微信号">
      </div>
      <div class="field">
        <label>家庭地址</label>
        <textarea name="address" placeholder="省/市/区/街道/门牌号" rows="2"></textarea>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-prev" onclick="prevStep()">上一步</button>
        <button type="button" class="btn btn-next" onclick="nextStep()">下一步</button>
      </div>
    </div>

    <!-- Step 3: 家长/监护人信息 -->
    <div class="card step-card hidden" data-step="3">
      <h2>家长/监护人信息</h2>
      <p class="subtitle">请填写家长或监护人联系方式（至少填写一位）</p>

      <div class="section-title">家长 1（主要联系人）</div>
      <div class="field">
        <label>姓名 <span class="req">*</span></label>
        <input type="text" name="parent1_name" required placeholder="家长姓名">
      </div>
      <div class="field-row">
        <div class="field">
          <label>与学生关系</label>
          <select name="parent1_relation">
            <option value="">请选择</option>
            <option value="父亲">父亲</option>
            <option value="母亲">母亲</option>
            <option value="监护人">监护人</option>
            <option value="其他">其他</option>
          </select>
        </div>
        <div class="field">
          <label>手机号码</label>
          <input type="tel" name="parent1_phone" placeholder="家长手机号">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>电子邮箱</label>
          <input type="email" name="parent1_email" placeholder="家长邮箱">
        </div>
        <div class="field">
          <label>微信号</label>
          <input type="text" name="parent1_wechat" placeholder="家长微信号">
        </div>
      </div>

      <div class="section-title">家长 2（可选）</div>
      <div class="field">
        <label>姓名</label>
        <input type="text" name="parent2_name" placeholder="第二位家长姓名">
      </div>
      <div class="field-row">
        <div class="field">
          <label>与学生关系</label>
          <select name="parent2_relation">
            <option value="">请选择</option>
            <option value="父亲">父亲</option>
            <option value="母亲">母亲</option>
            <option value="监护人">监护人</option>
            <option value="其他">其他</option>
          </select>
        </div>
        <div class="field">
          <label>手机号码</label>
          <input type="tel" name="parent2_phone" placeholder="家长手机号">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>电子邮箱</label>
          <input type="email" name="parent2_email" placeholder="家长邮箱">
        </div>
        <div class="field">
          <label>微信号</label>
          <input type="text" name="parent2_wechat" placeholder="家长微信号">
        </div>
      </div>

      <div class="btn-row">
        <button type="button" class="btn btn-prev" onclick="prevStep()">上一步</button>
        <button type="button" class="btn btn-next" onclick="nextStep()">下一步</button>
      </div>
    </div>

    <!-- Step 4: 学业与留学意向 -->
    <div class="card step-card hidden" data-step="4">
      <h2>学业与留学意向</h2>
      <p class="subtitle">帮助我们更好地了解学生的学业背景和规划</p>
      <div class="field">
        <label>意向留学国家/地区</label>
        <input type="text" name="target_countries" placeholder="如：英国、美国、新加坡（可多选）">
      </div>
      <div class="field">
        <label>意向专业方向</label>
        <input type="text" name="target_major" placeholder="如：计算机科学、商科、工程等">
      </div>
      <div class="field">
        <label>预计入学时间</label>
        <input type="text" name="enrol_date" placeholder="如：2025年9月">
      </div>
      <div class="field">
        <label>目前在读科目</label>
        <textarea name="current_subjects" placeholder="列出目前正在学习的科目及预估成绩，如：数学 A*, 物理 A, 化学 A" rows="3"></textarea>
      </div>
      <div class="field">
        <label>标化考试成绩</label>
        <textarea name="test_scores" placeholder="如有，请填写：雅思/托福/SAT/ACT 等成绩" rows="2"></textarea>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-prev" onclick="prevStep()">上一步</button>
        <button type="button" class="btn btn-next" onclick="nextStep()">下一步</button>
      </div>
    </div>

    <!-- Step 5: 补充信息 -->
    <div class="card step-card hidden" data-step="5">
      <h2>补充信息</h2>
      <p class="subtitle">其他需要告知学校的信息</p>
      <div class="field">
        <label>兴趣爱好与课外活动</label>
        <textarea name="hobbies" placeholder="社团、竞赛、志愿者、体育、艺术等经历" rows="3"></textarea>
      </div>
      <div class="field">
        <label>健康状况 / 特殊需求</label>
        <textarea name="health_notes" placeholder="如有过敏、慢性病、学习障碍等需要学校关注的情况，请说明" rows="3"></textarea>
      </div>
      <div class="field">
        <label>其他补充说明</label>
        <textarea name="extra_notes" placeholder="任何其他您希望学校了解的信息" rows="3"></textarea>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-prev" onclick="prevStep()">上一步</button>
        <button type="button" class="btn btn-submit" id="submitBtn" onclick="submitForm()">提交信息</button>
      </div>
    </div>
  </form>

  <!-- 成功页面 -->
  <div class="card success-card hidden" id="successCard">
    <div class="icon">🎉</div>
    <h2>提交成功！</h2>
    <p>感谢您的填写。学校已收到您提交的信息，<br>工作人员会尽快审核并与您联系。</p>
  </div>
</div>

<script>
let currentStep = 1;
const totalSteps = 5;
const TOKEN = '${form.token}';

function updateStepUI() {
  document.querySelectorAll('.step-card').forEach(c => {
    c.classList.toggle('hidden', parseInt(c.dataset.step) !== currentStep);
  });
  document.querySelectorAll('.step-dot').forEach(d => {
    const s = parseInt(d.dataset.step);
    d.classList.toggle('active', s === currentStep);
    d.classList.toggle('done', s < currentStep);
    d.textContent = s < currentStep ? '✓' : s;
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextStep() {
  // 验证当前步骤的必填项
  const card = document.querySelector('.step-card[data-step="' + currentStep + '"]');
  const requiredFields = card.querySelectorAll('[required]');
  let valid = true;
  requiredFields.forEach(f => {
    if (!f.value.trim()) {
      f.style.borderColor = '#ef4444';
      valid = false;
      f.addEventListener('input', () => { f.style.borderColor = '#e2e8f0'; }, { once: true });
    }
  });
  if (!valid) return;
  if (currentStep < totalSteps) { currentStep++; updateStepUI(); }
}

function prevStep() {
  if (currentStep > 1) { currentStep--; updateStepUI(); }
}

async function submitForm() {
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = '提交中...';

  const form = document.getElementById('intakeForm');
  const formData = new FormData(form);
  const data = {};
  formData.forEach((v, k) => { if (v) data[k] = v; });

  try {
    const resp = await fetch('/api/public/form/' + TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await resp.json();
    if (resp.ok) {
      form.classList.add('hidden');
      document.getElementById('stepIndicator').classList.add('hidden');
      document.getElementById('successCard').classList.remove('hidden');
    } else {
      alert(result.error || '提交失败，请稍后重试');
      btn.disabled = false;
      btn.textContent = '提交信息';
    }
  } catch (e) {
    alert('网络错误，请检查网络后重试');
    btn.disabled = false;
    btn.textContent = '提交信息';
  }
}
</script>
</body>
</html>`;
  }

  return { apiRouter, publicRouter };
};
