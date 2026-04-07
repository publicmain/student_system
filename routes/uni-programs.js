/**
 * routes/uni-programs.js — 院校专业库 CRUD + 学校历史录取数据
 * Split from routes/analytics.js
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole }) {
  const router = express.Router();

  function _getSettingRaw(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? r[0].values[0][0] : fallback; } catch(e) { return fallback; }
  }

  // ── 院校专业库 CRUD ───────────────────────────────────
  router.get('/uni-programs', requireAuth, requireRole('principal','counselor','mentor','intake_staff'), (req, res) => {
    const { country, route, search, uni_name } = req.query;
    let where = ['is_active=1'];
    let params = [];
    if (country) { where.push('country=?'); params.push(country); }
    if (route)   { where.push('route=?');   params.push(route); }
    if (uni_name){ where.push('uni_name LIKE ?'); params.push(`%${uni_name}%`); }
    if (search)  { where.push('(uni_name LIKE ? OR program_name LIKE ? OR department LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const rows = db.all(`SELECT * FROM uni_programs WHERE ${where.join(' AND ')} ORDER BY country, uni_name, program_name`, params);
    res.json(rows);
  });

  router.get('/uni-programs/:id', requireAuth, requireRole('principal','counselor','mentor','intake_staff'), (req, res) => {
    const prog = db.get('SELECT * FROM uni_programs WHERE id=?', [req.params.id]);
    if (!prog) return res.status(404).json({ error: '专业不存在' });
    const history = db.all('SELECT * FROM school_admission_history WHERE program_id=? ORDER BY cycle_year DESC', [req.params.id]);
    res.json({ ...prog, history });
  });

  router.post('/uni-programs', requireRole('principal','counselor'), (req, res) => {
    const id = uuidv4();
    const {
      university_id, uni_name, program_name, department, country, route, cycle_year,
      app_deadline, app_deadline_time, app_deadline_tz, ucas_early_deadline,
      grade_requirements, min_subjects, grade_type,
      ielts_overall, ielts_min_component, toefl_overall, duolingo_min,
      extra_tests, reference_required, reference_notes,
      hist_applicants, hist_offers, hist_offer_rate, hist_avg_grade, hist_data_year,
      weight_academic, weight_language, weight_extra, notes
    } = req.body;
    if (!uni_name || !program_name) return res.status(400).json({ error: '院校名和专业名必填' });
    db.run(`INSERT INTO uni_programs
      (id,university_id,uni_name,program_name,department,country,route,cycle_year,
       app_deadline,app_deadline_time,app_deadline_tz,ucas_early_deadline,
       grade_requirements,min_subjects,grade_type,
       ielts_overall,ielts_min_component,toefl_overall,duolingo_min,
       extra_tests,reference_required,reference_notes,
       hist_applicants,hist_offers,hist_offer_rate,hist_avg_grade,hist_data_year,
       weight_academic,weight_language,weight_extra,notes,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, university_id||null, uni_name, program_name, department||null, country||'UK', route||'UK-UG',
       cycle_year||null, app_deadline||null, app_deadline_time||null, app_deadline_tz||_getSettingRaw('default_timezone', 'Europe/London'),
       ucas_early_deadline?1:0,
       typeof grade_requirements === 'object' ? JSON.stringify(grade_requirements) : (grade_requirements||null),
       min_subjects||3, grade_type||'A-Level',
       ielts_overall||null, ielts_min_component||null, toefl_overall||null, duolingo_min||null,
       typeof extra_tests === 'object' ? JSON.stringify(extra_tests) : (extra_tests||null),
       reference_required?1:0, reference_notes||null,
       hist_applicants||null, hist_offers||null, hist_offer_rate||null, hist_avg_grade||null, hist_data_year||null,
       weight_academic||parseFloat(_getSettingRaw('default_weight_academic','0.6')), weight_language||parseFloat(_getSettingRaw('default_weight_language','0.25')), weight_extra||parseFloat(_getSettingRaw('default_weight_extra','0.15')),
       notes||null, req.session.user.id, new Date().toISOString(), new Date().toISOString()
      ]);
    audit(req, 'CREATE', 'uni_programs', id, { uni_name, program_name });
    res.json({ id });
  });

  router.put('/uni-programs/:id', requireRole('principal','counselor'), (req, res) => {
    const prog = db.get('SELECT id FROM uni_programs WHERE id=?', [req.params.id]);
    if (!prog) return res.status(404).json({ error: '专业不存在' });
    const fields = [
      'university_id','uni_name','program_name','department','country','route','cycle_year',
      'app_deadline','app_deadline_time','app_deadline_tz','ucas_early_deadline',
      'grade_requirements','min_subjects','grade_type',
      'ielts_overall','ielts_min_component','toefl_overall','duolingo_min',
      'extra_tests','reference_required','reference_notes',
      'hist_applicants','hist_offers','hist_offer_rate','hist_avg_grade','hist_data_year',
      'weight_academic','weight_language','weight_extra','notes','is_active'
    ];
    const sets = []; const vals = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f}=?`);
        const v = req.body[f];
        vals.push((f === 'grade_requirements' || f === 'extra_tests') && typeof v === 'object' ? JSON.stringify(v) : v);
      }
    }
    if (!sets.length) return res.status(400).json({ error: '无更新字段' });
    sets.push('updated_at=?'); vals.push(new Date().toISOString()); vals.push(req.params.id);
    db.run(`UPDATE uni_programs SET ${sets.join(',')} WHERE id=?`, vals);
    audit(req, 'UPDATE', 'uni_programs', req.params.id, req.body);
    res.json({ ok: true });
  });

  router.delete('/uni-programs/:id', requireRole('principal','counselor'), (req, res) => {
    db.run('UPDATE uni_programs SET is_active=0 WHERE id=?', [req.params.id]);
    audit(req, 'DELETE', 'uni_programs', req.params.id, null);
    res.json({ ok: true });
  });

  // ── 学校历史录取数据 ──────────────────────────────────
  router.post('/uni-programs/:id/history', requireRole('principal','counselor'), (req, res) => {
    const { student_id, cycle_year, offer_result, grade_profile, notes } = req.body;
    if (!cycle_year || !offer_result) return res.status(400).json({ error: '年份和结果必填' });
    const id = uuidv4();
    db.run(`INSERT INTO school_admission_history (id,program_id,student_id,cycle_year,offer_result,grade_profile,notes,created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [id, req.params.id, student_id||null, cycle_year, offer_result,
       typeof grade_profile === 'object' ? JSON.stringify(grade_profile) : (grade_profile||null),
       notes||null, new Date().toISOString()]);
    // 更新 uni_programs 的 hist_offer_rate
    const stats = db.get(`SELECT COUNT(*) as total, SUM(CASE WHEN offer_result='offer' THEN 1 ELSE 0 END) as offers FROM school_admission_history WHERE program_id=?`, [req.params.id]);
    if (stats.total > 0) {
      db.run('UPDATE uni_programs SET hist_applicants=?, hist_offers=?, hist_offer_rate=? WHERE id=?',
        [stats.total, stats.offers, Math.round(stats.offers/stats.total*100)/100, req.params.id]);
    }
    res.json({ id });
  });

  // ── 别名路由 ──────────────────────────────────────────

  // /admission-programs → 同 /uni-programs
  router.get('/admission-programs', requireAuth, requireRole('principal','counselor','mentor','intake_staff'), (req, res) => {
    const { country, route, search, uni_name } = req.query;
    let where = ['is_active=1'], params = [];
    if (country) { where.push('country=?'); params.push(country); }
    if (route)   { where.push('route=?');   params.push(route); }
    if (uni_name){ where.push('uni_name LIKE ?'); params.push(`%${uni_name}%`); }
    if (search)  { where.push('(uni_name LIKE ? OR program_name LIKE ? OR department LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const rows = db.all(`SELECT * FROM uni_programs WHERE ${where.join(' AND ')} ORDER BY country, uni_name, program_name`, params);
    res.json(rows);
  });

  return router;
};
