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

  // ── 一键导入为学生（结构化映射） ──
  apiRouter.post('/intake-form-submissions/:subId/import', requireRole('principal', 'counselor'), (req, res) => {
    const sub = db.get('SELECT * FROM intake_form_submissions WHERE id=?', [req.params.subId]);
    if (!sub) return res.status(404).json({ error: '提交不存在' });
    if (sub.imported_student_id) return res.status(409).json({ error: '该提交已导入', student_id: sub.imported_student_id });

    let data;
    try { data = JSON.parse(sub.data || '{}'); } catch (e) {
      return res.status(400).json({ error: '数据格式错误' });
    }

    const now = new Date().toISOString();

    // ── 解析 JSON 数组字段（兼容旧版纯文本） ──
    const parseJsonArray = (val) => {
      if (!val) return [];
      if (typeof val === 'object' && Array.isArray(val)) return val;
      try { const arr = JSON.parse(val); return Array.isArray(arr) ? arr : []; } catch(e) { return []; }
    };

    // ── 1. 创建学生（结构化字段直接映射） ──
    const studentId = uuidv4();
    // target_countries: 可能是 JSON 数组字符串，存到 students 表
    let targetCountries = data.target_countries || null;
    if (targetCountries) {
      try {
        const arr = JSON.parse(targetCountries);
        if (Array.isArray(arr)) targetCountries = arr.join('、');
      } catch(e) { /* keep as-is text */ }
    }

    db.run(`INSERT INTO students (id, name, grade_level, enrol_date, exam_board, date_of_birth,
              gender, nationality, id_number, phone, email, wechat, address, current_school,
              target_countries, target_major, health_notes, notes, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [studentId,
       data.student_name || '未命名',
       data.grade_level || '',
       data.enrol_date || null,
       data.exam_board || null,
       data.date_of_birth || null,
       data.gender || null,
       data.nationality || null,
       data.id_number || null,
       data.student_phone || null,
       data.student_email || null,
       data.student_wechat || null,
       data.address || null,
       data.current_school || null,
       targetCountries,
       data.target_major || null,
       data.health_notes || null,
       data.extra_notes || null,   // notes 只存补充说明
       now, now]);

    // ── 2. 创建家长（最多2个） ──
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

    // ── 3. 导入科目 → subjects + subject_enrollments + admission_assessments (predicted) ──
    const subjects = parseJsonArray(data.subjects);
    let subjectCount = 0;
    subjects.forEach(subj => {
      if (!subj.name) return;
      // 查找或创建 subject
      let subjectRow = db.get('SELECT id FROM subjects WHERE name=?', [subj.name]);
      if (!subjectRow) {
        const sid = uuidv4();
        db.run('INSERT INTO subjects (id, code, name, category) VALUES (?, ?, ?, ?)',
          [sid, subj.name.substring(0, 10).toUpperCase().replace(/\s/g, ''), subj.name, 'academic']);
        subjectRow = { id: sid };
      }
      // 创建 enrollment
      db.run('INSERT INTO subject_enrollments (id, student_id, subject_id, level, exam_board, enrolled_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), studentId, subjectRow.id, subj.level || null, data.exam_board || null, now]);
      // 预估成绩 → admission_assessments
      if (subj.predicted_grade) {
        db.run(`INSERT INTO admission_assessments (id, student_id, assess_date, assess_type, subject, score, notes, created_at)
                VALUES (?, ?, ?, 'predicted', ?, ?, '信息收集表单-预估成绩', ?)`,
          [uuidv4(), studentId, now.split('T')[0], subj.name, subj.predicted_grade, now]);
      }
      subjectCount++;
    });

    // ── 4. 导入标化成绩 → admission_assessments ──
    const maxScoreMap = { IELTS: 9, TOEFL: 120, SAT: 1600, ACT: 36, AP: 5, Duolingo: 160, PTE: 90 };
    const testScores = parseJsonArray(data.test_scores);
    let testCount = 0;
    testScores.forEach(ts => {
      if (!ts.type || !ts.score) return;
      // sub_scores → JSON if provided
      let subScoresJson = null;
      if (ts.sub_scores) {
        // Parse "L8.0 R7.5 W6.5 S7.0" into JSON
        const parts = ts.sub_scores.match(/[A-Za-z]+[\s]*[\d.]+/g);
        if (parts && parts.length > 1) {
          const obj = {};
          parts.forEach(p => {
            const m = p.match(/([A-Za-z]+)[\s]*([\d.]+)/);
            if (m) obj[m[1].toUpperCase()] = parseFloat(m[2]);
          });
          subScoresJson = JSON.stringify(obj);
        } else {
          subScoresJson = ts.sub_scores;
        }
      }
      db.run(`INSERT INTO admission_assessments (id, student_id, assess_date, assess_type, score, max_score, sub_scores, notes, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, '信息收集表单自动导入', ?)`,
        [uuidv4(), studentId,
         ts.test_date || now.split('T')[0],
         ts.type,
         parseFloat(ts.score) || 0,
         maxScoreMap[ts.type] || null,
         subScoresJson,
         now]);
      testCount++;
    });

    // 兼容旧版纯文本 test_scores（如果不是 JSON 数组）
    if (testCount === 0 && data.test_scores && typeof data.test_scores === 'string' && !data.test_scores.startsWith('[')) {
      const scorePatterns = [
        { pattern: /(?:雅思|IELTS)\s*[:：]?\s*([\d.]+)/i, type: 'IELTS', max: 9 },
        { pattern: /(?:托福|TOEFL)\s*[:：]?\s*(\d+)/i, type: 'TOEFL', max: 120 },
        { pattern: /SAT\s*[:：]?\s*(\d+)/i, type: 'SAT', max: 1600 },
        { pattern: /ACT\s*[:：]?\s*(\d+)/i, type: 'ACT', max: 36 },
      ];
      scorePatterns.forEach(({ pattern, type, max }) => {
        const m = data.test_scores.match(pattern);
        if (m) {
          db.run(`INSERT INTO admission_assessments (id, student_id, assess_date, assess_type, score, max_score, notes, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, '信息收集表单自动导入(文本解析)', ?)`,
            [uuidv4(), studentId, now.split('T')[0], type, parseFloat(m[1]), max, now]);
          testCount++;
        }
      });
    }

    // ── 5. 导入活动 → student_activities ──
    const activities = parseJsonArray(data.activities);
    let activityCount = 0;
    activities.forEach((act, idx) => {
      if (!act.name) return;
      db.run(`INSERT INTO student_activities (id, student_id, category, name, role, description, sort_order, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, '信息收集表单', ?, ?, ?)`,
        [uuidv4(), studentId, act.category || '其他', act.name, act.role || null, idx, now, now]);
      activityCount++;
    });

    // 兼容旧版纯文本 hobbies
    if (activityCount === 0 && data.hobbies && typeof data.hobbies === 'string') {
      const items = data.hobbies.split(/[，,、;；\n]+/).map(s => s.trim()).filter(Boolean);
      items.forEach((item, idx) => {
        db.run(`INSERT INTO student_activities (id, student_id, category, name, description, sort_order, created_at, updated_at)
                VALUES (?, ?, '课外活动', ?, '信息收集表单填写', ?, ?, ?)`,
          [uuidv4(), studentId, item, idx, now, now]);
        activityCount++;
      });
    }

    // ── 6. 导入获奖 → student_honors ──
    const honors = parseJsonArray(data.honors);
    let honorCount = 0;
    honors.forEach(h => {
      if (!h.name) return;
      db.run(`INSERT INTO student_honors (id, student_id, name, level, award_date, description, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, '信息收集表单', ?, ?)`,
        [uuidv4(), studentId, h.name, h.level || null, h.award_date || null, now, now]);
      honorCount++;
    });

    // ── 7. 标记提交为已导入 ──
    db.run('UPDATE intake_form_submissions SET status=?, imported_student_id=?, reviewed_at=?, reviewed_by=? WHERE id=?',
      ['imported', studentId, now, req.session.user.id, sub.id]);

    audit(req, 'IMPORT_FORM_SUBMISSION', 'students', studentId, {
      submission_id: sub.id,
      student_name: data.student_name,
      parent_count: parentIds.length,
      subject_count: subjectCount,
      test_count: testCount,
      activity_count: activityCount,
      honor_count: honorCount
    });

    res.json({
      student_id: studentId,
      student_name: data.student_name,
      parent_ids: parentIds,
      imported: {
        subjects: subjectCount,
        test_scores: testCount,
        activities: activityCount,
        honors: honorCount,
      },
      message: `导入成功：${subjectCount}个科目、${testCount}条成绩、${activityCount}个活动、${honorCount}个奖项`
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
    const sections = [];

    // 个人信息
    const personal = [];
    if (data.gender) personal.push(`性别: ${data.gender}`);
    if (data.nationality) personal.push(`国籍: ${data.nationality}`);
    if (data.id_number) personal.push(`证件号: ${data.id_number}`);
    if (data.current_school) personal.push(`原就读学校: ${data.current_school}`);
    if (personal.length) sections.push('【个人信息】\n' + personal.join('\n'));

    // 联系方式
    const contact = [];
    if (data.student_phone) contact.push(`电话: ${data.student_phone}`);
    if (data.student_email) contact.push(`邮箱: ${data.student_email}`);
    if (data.student_wechat) contact.push(`微信: ${data.student_wechat}`);
    if (data.address) contact.push(`地址: ${data.address}`);
    if (contact.length) sections.push('【联系方式】\n' + contact.join('\n'));

    // 学业与留学意向
    const academic = [];
    if (data.target_countries) academic.push(`意向国家: ${data.target_countries}`);
    if (data.target_major) academic.push(`意向专业: ${data.target_major}`);
    if (data.current_subjects) academic.push(`在读科目: ${data.current_subjects}`);
    if (data.test_scores) academic.push(`标化成绩: ${data.test_scores}`);
    if (academic.length) sections.push('【学业与留学意向】\n' + academic.join('\n'));

    // 其他
    const extra = [];
    if (data.hobbies) extra.push(`兴趣爱好: ${data.hobbies}`);
    if (data.health_notes) extra.push(`健康/特殊需求: ${data.health_notes}`);
    if (data.extra_notes) extra.push(`补充说明: ${data.extra_notes}`);
    if (extra.length) sections.push('【其他信息】\n' + extra.join('\n'));

    return sections.join('\n\n') || null;
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
.checkbox-group{display:flex;flex-wrap:wrap;gap:8px 16px}
.cb-label{display:flex;align-items:center;gap:6px;font-size:14px;color:#334155;cursor:pointer;padding:6px 12px;border-radius:8px;border:1.5px solid #e2e8f0;transition:all .2s}
.cb-label:has(input:checked){background:#f0f4ff;border-color:#667eea;color:#4338ca}
.cb-label input[type="checkbox"]{accent-color:#667eea;width:16px;height:16px}
.dynamic-row{display:grid;gap:8px;padding:12px;margin-bottom:8px;border-radius:10px;border:1.5px solid #e2e8f0;background:#fafbfc;position:relative}
.dynamic-row:hover{border-color:#cbd5e1}
.dynamic-row .row-del{position:absolute;top:8px;right:8px;width:24px;height:24px;border:none;background:#fee2e2;color:#dc2626;border-radius:6px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s}
.dynamic-row:hover .row-del{opacity:1}
.dynamic-row input,.dynamic-row select{padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;color:#1e293b;background:#fff}
.dynamic-row input:focus,.dynamic-row select:focus{outline:none;border-color:#667eea}
.subject-row{grid-template-columns:1fr 120px 80px}
.test-row{grid-template-columns:120px 80px 1fr 120px}
.activity-row{grid-template-columns:110px 1fr 100px}
.honor-row{grid-template-columns:1fr 100px 120px}
@media(max-width:560px){.subject-row,.test-row,.activity-row,.honor-row{grid-template-columns:1fr}}
.btn-add{display:block;width:100%;padding:10px;border:2px dashed #cbd5e1;border-radius:10px;background:transparent;color:#667eea;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;margin-top:8px;margin-bottom:16px}
.btn-add:hover{border-color:#667eea;background:#f0f4ff}
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
        <input type="hidden" name="grade_level" value="">
        <div class="field">
          <label>考试体系 <span class="req">*</span></label>
          <select name="exam_board" required>
            <option value="">请选择</option>
            <option value="GCE A-Level">GCE A-Level</option>
            <option value="GCE O-Level">GCE O-Level</option>
            <option value="CIE A-Level">CIE A-Level</option>
            <option value="Edexcel A-Level">Edexcel A-Level</option>
            <option value="CIE IGCSE">CIE IGCSE</option>
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
        <label>意向留学国家/地区（可多选）</label>
        <div class="checkbox-group" id="countryGroup">
          <label class="cb-label"><input type="checkbox" name="country_uk" value="英国"> 🇬🇧 英国</label>
          <label class="cb-label"><input type="checkbox" name="country_us" value="美国"> 🇺🇸 美国</label>
          <label class="cb-label"><input type="checkbox" name="country_hk" value="中国香港"> 🇭🇰 中国香港</label>
          <label class="cb-label"><input type="checkbox" name="country_sg" value="新加坡"> 🇸🇬 新加坡</label>
          <label class="cb-label"><input type="checkbox" name="country_au" value="澳大利亚"> 🇦🇺 澳大利亚</label>
          <label class="cb-label"><input type="checkbox" name="country_ca" value="加拿大"> 🇨🇦 加拿大</label>
          <label class="cb-label"><input type="checkbox" name="country_eu" value="欧洲"> 🇪🇺 欧洲</label>
          <label class="cb-label"><input type="checkbox" name="country_other_cb" value="其他"> 其他</label>
        </div>
        <input type="text" id="countryOtherInput" class="hidden" placeholder="请填写其他国家/地区" style="margin-top:8px">
      </div>

      <div class="field">
        <label>意向专业方向</label>
        <input type="text" name="target_major" placeholder="如：计算机科学、商科、工程等">
      </div>
      <div class="field">
        <label>预计入学时间</label>
        <select name="enrol_date">
          <option value="">请选择</option>
          <option value="2025年9月">2025年9月</option>
          <option value="2026年1月">2026年1月</option>
          <option value="2026年9月">2026年9月</option>
          <option value="2027年9月">2027年9月</option>
          <option value="待定">待定</option>
        </select>
      </div>

      <div class="section-title">目前在读科目</div>
      <p class="hint" style="margin-bottom:12px">请逐行添加正在学习的科目，选择级别并填写预估成绩</p>
      <div id="subjectRows"></div>
      <button type="button" class="btn-add" onclick="addSubjectRow()">+ 添加科目</button>

      <div class="section-title">标化考试成绩</div>
      <p class="hint" style="margin-bottom:12px">如已考过或有模考成绩，请逐项添加</p>
      <div id="testScoreRows"></div>
      <button type="button" class="btn-add" onclick="addTestScoreRow()">+ 添加成绩</button>

      <div class="btn-row">
        <button type="button" class="btn btn-prev" onclick="prevStep()">上一步</button>
        <button type="button" class="btn btn-next" onclick="nextStep()">下一步</button>
      </div>
    </div>

    <!-- Step 5: 活动经历与补充信息 -->
    <div class="card step-card hidden" data-step="5">
      <h2>活动经历与补充信息</h2>
      <p class="subtitle">课外活动、获奖经历及其他需要告知学校的信息</p>

      <div class="section-title">课外活动</div>
      <p class="hint" style="margin-bottom:12px">社团、竞赛、志愿者、体育、艺术等经历</p>
      <div id="activityRows"></div>
      <button type="button" class="btn-add" onclick="addActivityRow()">+ 添加活动</button>

      <div class="section-title">获奖经历</div>
      <p class="hint" style="margin-bottom:12px">竞赛奖项、荣誉称号等</p>
      <div id="honorRows"></div>
      <button type="button" class="btn-add" onclick="addHonorRow()">+ 添加奖项</button>

      <div class="field" style="margin-top:24px">
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

// ── Step navigation ──
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

// ── "Other country" toggle ──
document.querySelector('input[name="country_other_cb"]').addEventListener('change', function() {
  document.getElementById('countryOtherInput').classList.toggle('hidden', !this.checked);
});

// ── Dynamic row helpers ──
function removeRow(btn) { btn.closest('.dynamic-row').remove(); }

const COMMON_SUBJECTS = ['Mathematics','Further Mathematics','Physics','Chemistry','Biology','Economics','Business','Accounting','English Literature','English Language','Computer Science','Psychology','History','Geography','Art & Design','Chinese','Music','Drama','Sociology','Politics','Philosophy','Design & Technology','Media Studies'];
function subjectOptions() {
  return '<option value="">选择科目</option>' + COMMON_SUBJECTS.map(s => '<option value="' + s + '">' + s + '</option>').join('') + '<option value="__other">其他（自填）</option>';
}

function addSubjectRow() {
  const row = document.createElement('div');
  row.className = 'dynamic-row subject-row';
  row.innerHTML = '<select onchange="handleSubjectSelect(this)">' + subjectOptions() + '</select>'
    + '<select><option value="">级别</option><option value="IGCSE">IGCSE</option><option value="AS">AS</option><option value="A2">A2</option><option value="IB HL">IB HL</option><option value="IB SL">IB SL</option><option value="AP">AP</option><option value="普高">普高</option><option value="其他">其他</option></select>'
    + '<input type="text" placeholder="预估成绩">'
    + '<button type="button" class="row-del" onclick="removeRow(this)">&times;</button>';
  document.getElementById('subjectRows').appendChild(row);
}
function handleSubjectSelect(sel) {
  if (sel.value === '__other') {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = '输入科目名称'; inp.className = 'subject-custom';
    inp.style.cssText = 'grid-column:1/-1;margin-top:4px';
    sel.closest('.dynamic-row').appendChild(inp);
    inp.focus();
  } else {
    const custom = sel.closest('.dynamic-row').querySelector('.subject-custom');
    if (custom) custom.remove();
  }
}

function addTestScoreRow() {
  const row = document.createElement('div');
  row.className = 'dynamic-row test-row';
  row.innerHTML = '<select><option value="">考试类型</option><option value="IELTS">IELTS 雅思</option><option value="TOEFL">TOEFL 托福</option><option value="SAT">SAT</option><option value="ACT">ACT</option><option value="AP">AP 考试</option><option value="Duolingo">Duolingo</option><option value="PTE">PTE</option><option value="其他">其他</option></select>'
    + '<input type="text" placeholder="总分">'
    + '<input type="text" placeholder="小分（如 L8.0 R7.5 W6.5 S7.0）">'
    + '<input type="date" title="考试日期">'
    + '<button type="button" class="row-del" onclick="removeRow(this)">&times;</button>';
  document.getElementById('testScoreRows').appendChild(row);
}

function addActivityRow() {
  const row = document.createElement('div');
  row.className = 'dynamic-row activity-row';
  row.innerHTML = '<select><option value="">类别</option><option value="学术竞赛">学术竞赛</option><option value="体育">体育</option><option value="艺术">艺术</option><option value="社团">社团</option><option value="志愿服务">志愿服务</option><option value="实习">实习</option><option value="其他">其他</option></select>'
    + '<input type="text" placeholder="活动名称">'
    + '<input type="text" placeholder="角色/职务">'
    + '<button type="button" class="row-del" onclick="removeRow(this)">&times;</button>';
  document.getElementById('activityRows').appendChild(row);
}

function addHonorRow() {
  const row = document.createElement('div');
  row.className = 'dynamic-row honor-row';
  row.innerHTML = '<input type="text" placeholder="奖项名称">'
    + '<select><option value="">级别</option><option value="校级">校级</option><option value="市级">市级</option><option value="省级">省级</option><option value="国家级">国家级</option><option value="国际级">国际级</option></select>'
    + '<input type="month" title="获奖时间">'
    + '<button type="button" class="row-del" onclick="removeRow(this)">&times;</button>';
  document.getElementById('honorRows').appendChild(row);
}

// ── Add initial empty rows ──
addSubjectRow();
addTestScoreRow();
addActivityRow();

// ── Collect structured data ──
function collectStructuredData() {
  const form = document.getElementById('intakeForm');
  const fd = new FormData(form);
  const data = {};
  // Basic fields (Steps 1-3 + simple fields in 4-5)
  fd.forEach((v, k) => {
    if (v && !k.startsWith('country_')) data[k] = v;
  });

  // Target countries (checkboxes → JSON array)
  const countries = [];
  document.querySelectorAll('#countryGroup input[type="checkbox"]:checked').forEach(cb => {
    if (cb.name === 'country_other_cb') {
      const otherVal = document.getElementById('countryOtherInput').value.trim();
      if (otherVal) countries.push(otherVal);
    } else {
      countries.push(cb.value);
    }
  });
  if (countries.length) data.target_countries = JSON.stringify(countries);

  // Subjects → JSON array
  const subjects = [];
  document.querySelectorAll('#subjectRows .dynamic-row').forEach(row => {
    const selects = row.querySelectorAll('select');
    const inputs = row.querySelectorAll('input');
    const custom = row.querySelector('.subject-custom');
    let name = selects[0]?.value || '';
    if (name === '__other' && custom) name = custom.value.trim();
    const level = selects[1]?.value || '';
    const grade = inputs[0]?.value?.trim() || '';
    if (name) subjects.push({ name, level, predicted_grade: grade });
  });
  if (subjects.length) data.subjects = JSON.stringify(subjects);

  // Test scores → JSON array
  const testScores = [];
  document.querySelectorAll('#testScoreRows .dynamic-row').forEach(row => {
    const sel = row.querySelector('select');
    const inputs = row.querySelectorAll('input');
    const type = sel?.value || '';
    const score = inputs[0]?.value?.trim() || '';
    const subScores = inputs[1]?.value?.trim() || '';
    const testDate = inputs[2]?.value || '';
    if (type && score) testScores.push({ type, score, sub_scores: subScores, test_date: testDate });
  });
  if (testScores.length) data.test_scores = JSON.stringify(testScores);

  // Activities → JSON array
  const activities = [];
  document.querySelectorAll('#activityRows .dynamic-row').forEach(row => {
    const sel = row.querySelector('select');
    const inputs = row.querySelectorAll('input');
    const category = sel?.value || '';
    const name = inputs[0]?.value?.trim() || '';
    const role = inputs[1]?.value?.trim() || '';
    if (name) activities.push({ category, name, role });
  });
  if (activities.length) data.activities = JSON.stringify(activities);

  // Honors → JSON array
  const honors = [];
  document.querySelectorAll('#honorRows .dynamic-row').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const sel = row.querySelector('select');
    const name = inputs[0]?.value?.trim() || '';
    const level = sel?.value || '';
    const awardDate = inputs[1]?.value || '';
    if (name) honors.push({ name, level, award_date: awardDate });
  });
  if (honors.length) data.honors = JSON.stringify(honors);

  return data;
}

// ── Submit ──
async function submitForm() {
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = '提交中...';

  const data = collectStructuredData();

  try {
    const resp = await fetch('/api/public/form/' + TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await resp.json();
    if (resp.ok) {
      document.getElementById('intakeForm').classList.add('hidden');
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
