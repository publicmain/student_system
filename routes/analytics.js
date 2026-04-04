/**
 * routes/analytics.js — 数据分析 + ICS 日历导出 + 录取评估引擎 + AI 增强评估
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, aiEval, aiCallAttempts, AI_CALL_MAX, AI_CALL_WINDOW_MS }) {
  const router = express.Router();

  function _getSetting(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? JSON.parse(r[0].values[0][0]) : fallback; } catch(e) { return fallback; }
  }
  function _getSettingRaw(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? r[0].values[0][0] : fallback; } catch(e) { return fallback; }
  }

  // ═══════════════════════════════════════════════════════
  //  P2.1 ANALYTICS（数据分析）
  // ═══════════════════════════════════════════════════════

  router.get('/analytics/overview', requireRole('principal','counselor'), (req, res) => {
    const admissionRate = db.get(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN offer_type IN ('Conditional','Unconditional') THEN 1 ELSE 0 END) as offers,
      SUM(CASE WHEN status='enrolled' THEN 1 ELSE 0 END) as enrolled
      FROM applications`);
    const taskStats = db.all(`SELECT category, COUNT(*) as total,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status NOT IN ('done') AND due_date < date('now') THEN 1 ELSE 0 END) as overdue
      FROM milestone_tasks GROUP BY category`);
    const counselorKPI = db.all(`SELECT st.id, st.name, st.role,
      COUNT(DISTINCT ma.student_id) as students,
      COUNT(DISTINCT mt.id) as total_tasks,
      SUM(CASE WHEN mt.status='done' THEN 1 ELSE 0 END) as done_tasks,
      SUM(CASE WHEN mt.status NOT IN ('done') AND mt.due_date < date('now') THEN 1 ELSE 0 END) as overdue_tasks
      FROM staff st
      LEFT JOIN mentor_assignments ma ON ma.staff_id=st.id
      LEFT JOIN milestone_tasks mt ON mt.student_id=ma.student_id
      WHERE st.role IN ('counselor','principal')
      GROUP BY st.id ORDER BY students DESC`);
    const templateEff = db.all(`SELECT tt.name, tt.route,
      COUNT(mt.id) as total_tasks,
      SUM(CASE WHEN mt.status='done' THEN 1 ELSE 0 END) as done_tasks,
      SUM(CASE WHEN mt.status NOT IN ('done') AND mt.due_date < date('now') THEN 1 ELSE 0 END) as overdue_tasks
      FROM timeline_templates tt
      JOIN template_items ti ON ti.template_id=tt.id
      JOIN milestone_tasks mt ON mt.title=ti.title
      GROUP BY tt.id ORDER BY overdue_tasks DESC LIMIT 10`);
    const routeStats = db.all(`SELECT route, COUNT(*) as cnt,
      SUM(CASE WHEN offer_type IN ('Conditional','Unconditional') THEN 1 ELSE 0 END) as offers
      FROM applications WHERE route IS NOT NULL GROUP BY route`);
    res.json({ admissionRate, taskStats, counselorKPI, templateEff, routeStats });
  });

  // ═══════════════════════════════════════════════════════
  //  P2.2 ICS CALENDAR EXPORT（日历导出）
  // ═══════════════════════════════════════════════════════

  router.get('/students/:id/calendar.ics', requireAuth, (req, res) => {
    const u = req.session.user;
    const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    const student = db.get('SELECT * FROM students WHERE id=?', [sid]);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const tasks = db.all(`SELECT * FROM milestone_tasks WHERE student_id=? AND due_date IS NOT NULL AND status NOT IN ('done') ORDER BY due_date`, [sid]);
    const exams = db.all(`SELECT * FROM exam_sittings WHERE student_id=? AND sitting_date IS NOT NULL ORDER BY sitting_date`, [sid]);

    const fmtICSDate = (d) => d ? d.replace(/-/g,'') : '';
    const escICS = (s) => (s||'').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//升学规划系统//ZH',
      `X-WR-CALNAME:${escICS(student.name)} 升学日历`,
      'X-WR-TIMEZONE:Asia/Shanghai',
      'CALSCALE:GREGORIAN',
    ];
    for (const t of tasks) {
      const uid = `task-${t.id}@student-system`;
      lines.push('BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTART;VALUE=DATE:${fmtICSDate(t.due_date)}`,
        `DTEND;VALUE=DATE:${fmtICSDate(t.due_date)}`,
        `SUMMARY:${escICS(t.title)}`,
        `DESCRIPTION:${escICS((t.description||'') + (t.due_time ? `\\n截止时间: ${t.due_time}` : '') + (t.due_timezone ? ` ${t.due_timezone}` : ''))}`,
        `CATEGORIES:${escICS(t.category||'任务')}`,
        `STATUS:${t.status === 'in_progress' ? 'IN-PROCESS' : 'NEEDS-ACTION'}`,
        `PRIORITY:${t.priority === 'high' ? 1 : t.priority === 'low' ? 9 : 5}`,
        'END:VEVENT');
    }
    for (const e of exams) {
      if (!e.sitting_date) continue;
      lines.push('BEGIN:VEVENT',
        `UID:exam-${e.id}@student-system`,
        `DTSTART;VALUE=DATE:${fmtICSDate(e.sitting_date)}`,
        `DTEND;VALUE=DATE:${fmtICSDate(e.sitting_date)}`,
        `SUMMARY:📝 ${escICS(e.exam_board)} ${escICS(e.subject||'')} 考试`,
        `DESCRIPTION:${escICS([e.series, e.year, e.component].filter(Boolean).join(' | '))}`,
        `CATEGORIES:考试`,
        'END:VEVENT');
      if (e.results_date) {
        lines.push('BEGIN:VEVENT',
          `UID:result-${e.id}@student-system`,
          `DTSTART;VALUE=DATE:${fmtICSDate(e.results_date)}`,
          `DTEND;VALUE=DATE:${fmtICSDate(e.results_date)}`,
          `SUMMARY:📊 ${escICS(e.exam_board)} ${escICS(e.subject||'')} 出分日`,
          `DESCRIPTION:${escICS(e.exam_board + ' ' + (e.series||'') + ' ' + (e.year||''))}`,
          `CATEGORIES:出分`,
          'END:VEVENT');
      }
    }
    lines.push('END:VCALENDAR');

    audit(req, 'EXPORT', 'calendar', sid, { student: student.name });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(student.name)}_calendar.ics"`);
    res.send(lines.join('\r\n'));
  });

  // ═══════════════════════════════════════════════════════
  //  录取要求匹配 & 概率评估
  // ═══════════════════════════════════════════════════════

  // ── 院校专业库 CRUD ───────────────────────────────────
  router.get('/uni-programs', requireAuth, (req, res) => {
    if (['agent', 'student_admin'].includes(req.session.user.role)) return res.status(403).json({ error: '权限不足' });
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

  router.get('/uni-programs/:id', requireAuth, (req, res) => {
    if (['agent', 'student_admin'].includes(req.session.user.role)) return res.status(403).json({ error: '权限不足' });
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

  // ════════════════════════════════════════════════════════
  //  基准评估库 CRUD
  // ════════════════════════════════════════════════════════
  router.get('/eval-benchmarks', requireAuth, (req, res) => {
    if (['agent', 'student_admin'].includes(req.session.user.role)) return res.status(403).json({ error: '权限不足' });
    const { country, tier, subject_area } = req.query;
    const where = ['is_active=1'];
    const params = [];
    if (country)      { where.push('country=?');      params.push(country); }
    if (tier)         { where.push('tier=?');          params.push(tier); }
    if (subject_area) { where.push('subject_area=?');  params.push(subject_area); }
    const rows = db.all(`SELECT * FROM eval_benchmarks WHERE ${where.join(' AND ')} ORDER BY country, tier, subject_area`, params);
    res.json(rows);
  });

  router.get('/eval-benchmarks/:id', requireAuth, (req, res) => {
    if (['agent', 'student_admin'].includes(req.session.user.role)) return res.status(403).json({ error: '权限不足' });
    const bm = db.get('SELECT * FROM eval_benchmarks WHERE id=?', [req.params.id]);
    if (!bm) return res.status(404).json({ error: '基准不存在' });
    res.json(bm);
  });

  router.post('/eval-benchmarks', requireRole('principal','counselor'), (req, res) => {
    const { country, tier, subject_area, display_name, grade_requirements, grade_type,
            ielts_overall, toefl_overall, extra_tests, weight_academic, weight_language,
            weight_extra, benchmark_pass_rate, notes } = req.body;
    if (!country || !tier || !subject_area || !display_name) {
      return res.status(400).json({ error: 'country / tier / subject_area / display_name 必填' });
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO eval_benchmarks
      (id,country,tier,subject_area,display_name,grade_requirements,grade_type,ielts_overall,toefl_overall,extra_tests,weight_academic,weight_language,weight_extra,benchmark_pass_rate,notes,is_active,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`,
      [id, country, tier, subject_area, display_name,
       typeof grade_requirements==='object' ? JSON.stringify(grade_requirements) : (grade_requirements||null),
       grade_type||'A-Level', ielts_overall||null, toefl_overall||null,
       typeof extra_tests==='object' ? JSON.stringify(extra_tests) : (extra_tests||null),
       weight_academic||0.60, weight_language||0.25, weight_extra||0.15,
       benchmark_pass_rate||null, notes||null,
       req.session.user.id, now, now]);
    audit(req, 'CREATE', 'eval_benchmarks', id, { display_name });
    res.status(201).json({ id });
  });

  router.put('/eval-benchmarks/:id', requireRole('principal','counselor'), (req, res) => {
    const bm = db.get('SELECT id FROM eval_benchmarks WHERE id=?', [req.params.id]);
    if (!bm) return res.status(404).json({ error: '基准不存在' });
    const fields = ['country','tier','subject_area','display_name','grade_requirements','grade_type',
                    'ielts_overall','toefl_overall','extra_tests','weight_academic','weight_language',
                    'weight_extra','benchmark_pass_rate','notes','is_active'];
    const sets = []; const vals = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f}=?`);
        vals.push((f==='grade_requirements'||f==='extra_tests') && typeof req.body[f]==='object'
          ? JSON.stringify(req.body[f]) : req.body[f]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: '无可更新字段' });
    sets.push('updated_at=?'); vals.push(new Date().toISOString()); vals.push(req.params.id);
    db.run(`UPDATE eval_benchmarks SET ${sets.join(',')} WHERE id=?`, vals);
    audit(req, 'UPDATE', 'eval_benchmarks', req.params.id, req.body);
    res.json({ ok: true });
  });

  router.delete('/eval-benchmarks/:id', requireRole('principal','counselor'), (req, res) => {
    db.run('UPDATE eval_benchmarks SET is_active=0 WHERE id=?', [req.params.id]);
    audit(req, 'DELETE', 'eval_benchmarks', req.params.id, null);
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

  // ── 成绩等级转换工具 ──────────────────────────────────
  function gradeToScore(grade, gradeType) {
    const aLevelMap = _getSetting('grade_conversion_alevel', { 'A*': 100, 'A': 90, 'B': 80, 'C': 70, 'D': 60, 'E': 50, 'U': 0 });
    const ibMap = _getSetting('grade_conversion_ib', { '7': 100, '6': 85, '5': 70, '4': 55, '3': 40, '2': 25, '1': 10 });
    const g = String(grade||'').trim().toUpperCase();
    if (!gradeType || gradeType.includes('A-Level')) return aLevelMap[g] ?? null;
    if (gradeType === 'IB') return ibMap[g] ?? (parseFloat(grade) ? parseFloat(grade)/7*100 : null);
    return null;
  }

  function gradeRank(grade, gradeType) {
    const aLevelOrder = ['A*','A','B','C','D','E','U'];
    const g = String(grade||'').trim().toUpperCase();
    if (!gradeType || gradeType.includes('A-Level')) {
      const idx = aLevelOrder.indexOf(g);
      return idx === -1 ? 999 : idx;
    }
    return null;
  }

  // ── 核心评估引擎 ──────────────────────────────────────
  function runAdmissionEval(_student, program, examSittings, assessments) {
    const gradeReqs = (() => { try { return JSON.parse(program.grade_requirements||'[]'); } catch(e) { return []; } })();
    const extraTests = (() => { try { return JSON.parse(program.extra_tests||'[]'); } catch(e) { return []; } })();

    const studentGrades = {};
    for (const s of examSittings) {
      const key = (s.subject||'').toLowerCase().trim();
      if (!studentGrades[key]) studentGrades[key] = {};
      if (s.actual_grade) studentGrades[key].actual = s.actual_grade;
      if (s.predicted_grade) studentGrades[key].predicted = s.predicted_grade;
    }

    const studentTests = {};
    for (const a of assessments) {
      const key = (a.assess_type||'').toLowerCase().trim();
      if (!studentTests[key] || studentTests[key] < a.score) {
        studentTests[key] = a.score;
      }
    }

    // ── 1. 硬门槛检查 ──────────────────────────────────
    const hardFails = [];

    const requiredSubjects = gradeReqs.filter(r => r.required);
    for (const req of requiredSubjects) {
      const key = (req.subject||'').toLowerCase().trim();
      const sg = studentGrades[key];
      const bestGrade = sg?.actual || sg?.predicted;
      if (!bestGrade) {
        hardFails.push({ type: 'missing_subject', subject: req.subject, required: req.min_grade, message: `缺少必修科目: ${req.subject}` });
      } else {
        const studentRank = gradeRank(bestGrade, program.grade_type);
        const reqRank = gradeRank(req.min_grade, program.grade_type);
        if (studentRank !== null && reqRank !== null && studentRank > reqRank) {
          hardFails.push({ type: 'grade_below_threshold', subject: req.subject, current: bestGrade, required: req.min_grade, message: `${req.subject}: 当前${bestGrade} < 要求${req.min_grade}` });
        }
      }
    }

    if (program.ielts_overall) {
      const ieltsScore = studentTests['雅思 ielts'] || studentTests['ielts'];
      if (ieltsScore && ieltsScore < program.ielts_overall) {
        hardFails.push({ type: 'language_below_threshold', test: 'IELTS', current: ieltsScore, required: program.ielts_overall, message: `IELTS: 当前${ieltsScore} < 要求${program.ielts_overall}` });
      }
    }
    if (program.toefl_overall) {
      const toeflScore = studentTests['托福 toefl'] || studentTests['toefl'];
      if (toeflScore && toeflScore < program.toefl_overall) {
        hardFails.push({ type: 'language_below_threshold', test: 'TOEFL', current: toeflScore, required: program.toefl_overall, message: `TOEFL: 当前${toeflScore} < 要求${program.toefl_overall}` });
      }
    }

    const hardPass = hardFails.length === 0;

    // ── 2. 学术评分 (0-100) ────────────────────────────
    let academicScore = 0;
    let academicGaps = [];
    if (gradeReqs.length > 0) {
      let totalWeight = 0; let weightedScore = 0;
      for (const req of gradeReqs) {
        const key = (req.subject||'').toLowerCase().trim();
        const sg = studentGrades[key];
        const bestGrade = sg?.actual || sg?.predicted;
        const reqScore = gradeToScore(req.min_grade, program.grade_type) || 0;
        const stuScore = bestGrade ? (gradeToScore(bestGrade, program.grade_type) || 0) : 0;
        const weight = req.required ? 2 : 1;
        totalWeight += weight;
        weightedScore += Math.min(stuScore, 100) * weight;

        if (reqScore > 0 || !bestGrade) {
          const gap = stuScore - reqScore;
          const closable = !bestGrade && (sg?.predicted) ? true : gap >= -15;
          academicGaps.push({
            dimension: 'academic', subject: req.subject, required: req.min_grade,
            current: bestGrade || '未知', gap: Math.round(gap), closable,
            message: !bestGrade ? `${req.subject} 无成绩记录` :
              gap >= 0 ? `${req.subject} 达标 (${bestGrade})` : `${req.subject} 差距 ${Math.abs(gap)}分 (${bestGrade} vs ${req.min_grade})`
          });
        }
      }
      academicScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
    } else {
      academicScore = 60;
    }

    // ── 3. 语言评分 (0-100) ────────────────────────────
    let languageScore = 100;
    let languageGaps = [];
    if (program.ielts_overall) {
      const ieltsScore = studentTests['雅思 ielts'] || studentTests['ielts'];
      if (ieltsScore) {
        const pct = Math.min(ieltsScore / program.ielts_overall * 100, 110);
        languageScore = Math.min(Math.round(pct), 100);
        languageGaps.push({
          dimension: 'language', test: 'IELTS',
          current: ieltsScore, required: program.ielts_overall,
          gap: Math.round((ieltsScore - program.ielts_overall) * 10) / 10,
          closable: ieltsScore >= program.ielts_overall - 0.5,
          message: ieltsScore >= program.ielts_overall ? `IELTS 达标 (${ieltsScore})` : `IELTS 差 ${(program.ielts_overall - ieltsScore).toFixed(1)} 分`
        });
      } else {
        languageScore = 40;
        languageGaps.push({ dimension: 'language', test: 'IELTS', current: null, required: program.ielts_overall, gap: null, closable: true, message: `IELTS 要求 ${program.ielts_overall}，尚无成绩` });
      }
    } else if (program.toefl_overall && parseFloat(program.toefl_overall) > 0) {
      const toeflScore = studentTests['托福 toefl'] || studentTests['toefl'];
      if (toeflScore) {
        languageScore = Math.min(Math.round(toeflScore / parseFloat(program.toefl_overall) * 100), 100);
        languageGaps.push({ dimension: 'language', test: 'TOEFL', current: toeflScore, required: program.toefl_overall, gap: toeflScore - program.toefl_overall, closable: toeflScore >= program.toefl_overall - 5, message: toeflScore >= program.toefl_overall ? `TOEFL 达标 (${toeflScore})` : `TOEFL 差 ${program.toefl_overall - toeflScore} 分` });
      } else {
        languageScore = 40;
        languageGaps.push({ dimension: 'language', test: 'TOEFL', current: null, required: program.toefl_overall, gap: null, closable: true, message: `TOEFL 要求 ${program.toefl_overall}，尚无成绩` });
      }
    } else {
      languageScore = 75;
    }

    // ── 4. 额外测试评分 (0-100) ───────────────────────
    let extraScore = 100;
    let extraGaps = [];
    if (extraTests.length > 0) {
      let passed = 0;
      for (const et of extraTests) {
        const key = (et.test||'').toLowerCase().trim();
        const stuScore = studentTests[key];
        if (et.required) {
          if (!stuScore) {
            extraGaps.push({ dimension: 'extra', test: et.test, current: null, required: et.min_score, gap: null, closable: true, message: `${et.test} 要求，尚无成绩` });
          } else if (et.min_score && stuScore < et.min_score) {
            extraGaps.push({ dimension: 'extra', test: et.test, current: stuScore, required: et.min_score, gap: stuScore - et.min_score, closable: false, message: `${et.test}: ${stuScore} < 要求${et.min_score}` });
            passed--;
          } else {
            extraGaps.push({ dimension: 'extra', test: et.test, current: stuScore, required: et.min_score, gap: stuScore - (et.min_score||0), closable: true, message: `${et.test} 达标 (${stuScore})` });
            passed++;
          }
        }
      }
      const requiredCount = extraTests.filter(e => e.required).length;
      extraScore = requiredCount > 0 ? Math.round(Math.max(0, (passed + requiredCount) / (requiredCount * 2)) * 100) : 80;
    } else {
      extraScore = 80;
    }

    // ── 5. 综合评分 ────────────────────────────────────
    const wa = parseFloat(program.weight_academic) || parseFloat(_getSettingRaw('default_weight_academic','0.6'));
    const wl = parseFloat(program.weight_language) || parseFloat(_getSettingRaw('default_weight_language','0.25'));
    const we = parseFloat(program.weight_extra) || parseFloat(_getSettingRaw('default_weight_extra','0.15'));
    const totalScore = Math.round(academicScore * wa + languageScore * wl + extraScore * we);

    // ── 6. 概率区间估算 ────────────────────────────────
    let probLow, probMid, probHigh, confidence, confidenceNote;
    const histRate = program.hist_offer_rate;
    const histTotal = program.hist_applicants || 0;

    if (histTotal >= 20) { confidence = 'high'; }
    else if (histTotal >= 5) { confidence = 'medium'; }
    else { confidence = 'low'; }

    const admScoring = _getSetting('admission_scoring', { prior_rate: 0.30, sample_size: 30, score_factors: [1.8, 1.4, 1.0, 0.7, 0.4], low_pass_multiplier: 0.6 });
    const priorRate = admScoring.prior_rate || 0.30;
    const observedRate = histRate != null ? parseFloat(histRate) : priorRate;

    const histWeight = Math.min(histTotal / (admScoring.sample_size || 30), 1.0);
    const baseProbability = observedRate * histWeight + priorRate * (1 - histWeight);

    const sf = admScoring.score_factors || [1.8, 1.4, 1.0, 0.7, 0.4];
    const scoreFactor = totalScore >= 90 ? sf[0] : totalScore >= 75 ? sf[1] : totalScore >= 60 ? sf[2] : totalScore >= 45 ? sf[3] : sf[4];
    const hardPenalty = hardPass ? 1.0 : 0.2;

    probMid = Math.min(Math.round(baseProbability * scoreFactor * hardPenalty * 100), 98);
    probLow = Math.max(Math.round(probMid * (admScoring.low_pass_multiplier || 0.6)), hardPass ? 2 : 0);
    probHigh = Math.min(Math.round(probMid * 1.5), 98);
    probLow = Math.min(probLow, probMid);
    probHigh = Math.max(probHigh, probMid);

    if (!hardPass) {
      confidenceNote = '未通过硬门槛，概率大幅降低。须先满足必备条件。';
    } else if (confidence === 'low') {
      confidenceNote = '历史数据不足（<5条记录），概率区间参考价值有限，以保守先验为主。';
    } else if (confidence === 'medium') {
      confidenceNote = `基于 ${histTotal} 条历史记录估算，置信度中等。`;
    } else {
      confidenceNote = `基于 ${histTotal} 条历史记录，置信度较高，但不构成录取承诺。`;
    }

    const gaps = [...academicGaps, ...languageGaps, ...extraGaps];

    return {
      hard_pass: hardPass ? 1 : 0,
      hard_fails: JSON.stringify(hardFails),
      score_academic: academicScore,
      score_language: languageScore,
      score_extra: extraScore,
      score_total: totalScore,
      gaps: JSON.stringify(gaps),
      prob_low: probLow,
      prob_mid: probMid,
      prob_high: probHigh,
      confidence,
      confidence_note: confidenceNote,
      grade_snapshot: JSON.stringify({ studentGrades, studentTests })
    };
  }

  // ── 对单个学生运行评估 ────────────────────────────────
  router.post('/students/:id/admission-eval', requireAuth, (req, res) => {
    const u = req.session.user; const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权操作他人评估' });
    if (u.role === 'parent') return res.status(403).json({ error: '家长账户无权运行评估' });
    const student = db.get('SELECT * FROM students WHERE id=?', [sid]);
    if (!student) return res.status(404).json({ error: '学生不存在' });

    const { program_id, notes } = req.body;
    if (!program_id) return res.status(400).json({ error: 'program_id 必填' });

    const program = db.get('SELECT * FROM uni_programs WHERE id=? AND is_active=1', [program_id]);
    if (!program) return res.status(404).json({ error: '专业不存在' });

    const examSittings = db.all('SELECT * FROM exam_sittings WHERE student_id=?', [req.params.id]);
    const assessments  = db.all('SELECT * FROM admission_assessments WHERE student_id=?', [req.params.id]);

    const evalResult = runAdmissionEval(student, program, examSittings, assessments);

    const evalId = uuidv4();
    db.run(`INSERT INTO admission_evaluations
      (id,student_id,program_id,eval_date,hard_pass,hard_fails,score_academic,score_language,score_extra,score_total,gaps,prob_low,prob_mid,prob_high,confidence,confidence_note,grade_snapshot,notes,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [evalId, req.params.id, program_id, new Date().toISOString(),
       evalResult.hard_pass, evalResult.hard_fails,
       evalResult.score_academic, evalResult.score_language, evalResult.score_extra, evalResult.score_total,
       evalResult.gaps, evalResult.prob_low, evalResult.prob_mid, evalResult.prob_high,
       evalResult.confidence, evalResult.confidence_note, evalResult.grade_snapshot,
       notes||null, req.session.user.id, new Date().toISOString()
      ]);
    audit(req, 'CREATE', 'admission_evaluations', evalId, { student: student.name, program: program.program_name });

    const full = db.get('SELECT * FROM admission_evaluations WHERE id=?', [evalId]);
    res.json({ ...full, program });
  });

  // ── 获取学生所有评估记录 ───────────────────────────────
  router.get('/students/:id/admission-evals', requireAuth, (req, res) => {
    const u = req.session.user; const sid = req.params.id;
    if (['agent', 'student_admin', 'intake_staff'].includes(u.role)) return res.status(403).json({ error: '权限不足' });
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    if (u.role === 'mentor' || u.role === 'counselor') {
      const ma = db.get('SELECT 1 FROM mentor_assignments WHERE student_id=? AND staff_id=?', [sid, u.linked_id]);
      if (!ma) return res.status(403).json({ error: '无权访问' });
    }
    const evals = db.all(`
      SELECT ae.*, up.uni_name, up.program_name, up.department, up.country, up.route
      FROM admission_evaluations ae
      JOIN uni_programs up ON up.id = ae.program_id
      WHERE ae.student_id=?
      ORDER BY ae.created_at DESC`, [sid]);
    res.json(evals);
  });

  // ── 获取单条评估详情 ──────────────────────────────────
  router.get('/admission-evals/:id', requireAuth, (req, res) => {
    const u = req.session.user;
    if (['agent', 'student_admin', 'intake_staff'].includes(u.role)) return res.status(403).json({ error: '权限不足' });
    const ev = db.get(`
      SELECT ae.*, up.uni_name, up.program_name, up.department, up.country, up.route,
             up.grade_requirements, up.extra_tests, up.ielts_overall, up.toefl_overall,
             up.hist_offer_rate, up.hist_applicants, up.app_deadline
      FROM admission_evaluations ae
      JOIN uni_programs up ON up.id = ae.program_id
      WHERE ae.id=?`, [req.params.id]);
    if (!ev) return res.status(404).json({ error: '评估不存在' });
    if (u.role === 'student' && u.linked_id !== ev.student_id) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT 1 FROM student_parents WHERE student_id=? AND parent_id=?', [ev.student_id, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    res.json(ev);
  });

  // ── 删除评估记录 ──────────────────────────────────────
  router.delete('/admission-evals/:id', requireRole('principal','counselor'), (req, res) => {
    const ev = db.get('SELECT * FROM admission_evaluations WHERE id=?', [req.params.id]);
    if (!ev) return res.status(404).json({ error: '评估不存在' });
    db.run('DELETE FROM admission_evaluations WHERE id=?', [req.params.id]);
    audit(req, 'DELETE', 'admission_evaluations', req.params.id, {});
    res.json({ success: true });
  });

  // ── AI 接口限流工具 ───────────────────────────────────
  function checkAiRateLimit(req, res) {
    const userId = req.session.user.id;
    const now = Date.now();
    const ar = aiCallAttempts.get(userId) || { count: 0, resetAt: now + AI_CALL_WINDOW_MS };
    if (now > ar.resetAt) { ar.count = 0; ar.resetAt = now + AI_CALL_WINDOW_MS; }
    if (ar.count >= AI_CALL_MAX) {
      res.status(429).json({ error: `AI 调用次数已达上限（每小时 ${AI_CALL_MAX} 次），请稍后重试` });
      return false;
    }
    ar.count++;
    aiCallAttempts.set(userId, ar);
    return true;
  }

  // ── AI 增强评估 ───────────────────────────────────────
  router.post('/admission-evals/:id/ai-enhance', requireRole('principal','counselor'), async (req, res) => {
    if (!aiEval) return res.status(503).json({ error: 'AI 评估模块未加载，请检查服务器配置' });
    if (!checkAiRateLimit(req, res)) return;
    try {
      const ev = db.get('SELECT ae.*, up.uni_name, up.program_name, up.department, up.country, up.route, up.grade_type, up.grade_requirements, up.extra_tests, up.ielts_overall, up.toefl_overall, up.hist_offer_rate, up.hist_applicants FROM admission_evaluations ae JOIN uni_programs up ON up.id=ae.program_id WHERE ae.id=?', [req.params.id]);
      if (!ev) return res.status(404).json({ error: '评估记录不存在' });

      const student     = db.get('SELECT * FROM students WHERE id=?', [ev.student_id]);
      const examSittings = db.all('SELECT * FROM exam_sittings WHERE student_id=?', [ev.student_id]);
      const assessments  = db.all('SELECT * FROM admission_assessments WHERE student_id=?', [ev.student_id]);

      const aiResult = await aiEval.enhanceEval(ev, student, ev, examSittings, assessments);

      db.run('UPDATE admission_evaluations SET ai_result=? WHERE id=?', [JSON.stringify(aiResult), req.params.id]);
      audit(req, 'AI_ENHANCE', 'admission_evaluations', req.params.id, { uni: ev.uni_name, program: ev.program_name });

      res.json(aiResult);
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ════════════════════════════════════════════════════════
  //  基准评估 — 学生评估端点
  // ════════════════════════════════════════════════════════
  router.post('/students/:id/benchmark-eval', requireAuth, (req, res) => {
    const u = req.session.user; const sid = req.params.id;
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权操作他人评估' });
    if (u.role === 'parent') return res.status(403).json({ error: '家长账户无权运行评估' });
    const student = db.get('SELECT * FROM students WHERE id=?', [sid]);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const { benchmark_id, notes } = req.body;
    if (!benchmark_id) return res.status(400).json({ error: 'benchmark_id 必填' });
    const bm = db.get('SELECT * FROM eval_benchmarks WHERE id=? AND is_active=1', [benchmark_id]);
    if (!bm) return res.status(404).json({ error: '基准不存在' });

    const examSittings = db.all('SELECT * FROM exam_sittings WHERE student_id=?', [req.params.id]);
    const assessments  = db.all('SELECT * FROM admission_assessments WHERE student_id=?', [req.params.id]);

    const programLike = {
      grade_requirements: bm.grade_requirements,
      grade_type:         bm.grade_type || 'A-Level',
      ielts_overall:      bm.ielts_overall,
      toefl_overall:      bm.toefl_overall,
      extra_tests:        bm.extra_tests,
      weight_academic:    bm.weight_academic || 0.60,
      weight_language:    bm.weight_language || 0.25,
      weight_extra:       bm.weight_extra   || 0.15,
      hist_offer_rate:    bm.benchmark_pass_rate,
      hist_applicants:    null,
    };
    const evalResult = runAdmissionEval(student, programLike, examSittings, assessments);

    const evalId = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO benchmark_evaluations
      (id,student_id,benchmark_id,eval_date,hard_pass,hard_fails,score_academic,score_language,score_extra,score_total,gaps,prob_low,prob_mid,prob_high,confidence,confidence_note,grade_snapshot,notes,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [evalId, req.params.id, benchmark_id, now,
       evalResult.hard_pass, evalResult.hard_fails,
       evalResult.score_academic, evalResult.score_language, evalResult.score_extra, evalResult.score_total,
       evalResult.gaps, evalResult.prob_low, evalResult.prob_mid, evalResult.prob_high,
       evalResult.confidence, evalResult.confidence_note, evalResult.grade_snapshot,
       notes||null, req.session.user.id, now]);
    audit(req, 'CREATE', 'benchmark_evaluations', evalId, { student: student.name, benchmark: bm.display_name });

    const full = db.get(`SELECT be.*, eb.country, eb.tier, eb.subject_area, eb.display_name, eb.benchmark_pass_rate
      FROM benchmark_evaluations be JOIN eval_benchmarks eb ON eb.id=be.benchmark_id WHERE be.id=?`, [evalId]);
    res.status(201).json(full);
  });

  router.get('/students/:id/benchmark-evals', requireAuth, (req, res) => {
    const u = req.session.user; const sid = req.params.id;
    if (['agent', 'student_admin', 'intake_staff'].includes(u.role)) return res.status(403).json({ error: '权限不足' });
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    if (u.role === 'mentor' || u.role === 'counselor') {
      const ma = db.get('SELECT 1 FROM mentor_assignments WHERE student_id=? AND staff_id=?', [sid, u.linked_id]);
      if (!ma) return res.status(403).json({ error: '无权访问' });
    }
    const rows = db.all(`SELECT be.*, eb.country, eb.tier, eb.subject_area, eb.display_name, eb.benchmark_pass_rate, eb.grade_requirements, eb.ielts_overall
      FROM benchmark_evaluations be JOIN eval_benchmarks eb ON eb.id=be.benchmark_id
      WHERE be.student_id=? ORDER BY be.created_at DESC`, [sid]);
    res.json(rows);
  });

  router.get('/benchmark-evals/:id', requireAuth, (req, res) => {
    if (['agent', 'student_admin', 'intake_staff'].includes(req.session.user.role)) return res.status(403).json({ error: '权限不足' });
    const ev = db.get(`SELECT be.*, eb.country, eb.tier, eb.subject_area, eb.display_name,
      eb.benchmark_pass_rate, eb.grade_requirements, eb.extra_tests, eb.ielts_overall, eb.toefl_overall,
      eb.weight_academic, eb.weight_language, eb.weight_extra, eb.grade_type, eb.notes as benchmark_notes
      FROM benchmark_evaluations be JOIN eval_benchmarks eb ON eb.id=be.benchmark_id WHERE be.id=?`, [req.params.id]);
    if (!ev) return res.status(404).json({ error: '评估不存在' });
    const u = req.session.user;
    if (u.role === 'student' && u.linked_id !== ev.student_id) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') {
      const sp = db.get('SELECT 1 FROM student_parents WHERE student_id=? AND parent_id=?', [ev.student_id, u.linked_id]);
      if (!sp) return res.status(403).json({ error: '无权访问' });
    }
    res.json(ev);
  });

  router.delete('/benchmark-evals/:id', requireRole('principal','counselor'), (req, res) => {
    const ev = db.get('SELECT * FROM benchmark_evaluations WHERE id=?', [req.params.id]);
    if (!ev) return res.status(404).json({ error: '评估不存在' });
    db.run('DELETE FROM benchmark_evaluations WHERE id=?', [req.params.id]);
    audit(req, 'DELETE', 'benchmark_evaluations', req.params.id, {});
    res.json({ ok: true });
  });

  router.post('/benchmark-evals/:id/ai-enhance', requireRole('principal','counselor'), async (req, res) => {
    if (!aiEval) return res.status(503).json({ error: 'AI 评估模块未加载，请检查服务器配置' });
    if (!checkAiRateLimit(req, res)) return;
    try {
      const ev = db.get(`SELECT be.*, eb.country, eb.tier, eb.subject_area, eb.display_name,
        eb.benchmark_pass_rate, eb.grade_requirements, eb.extra_tests, eb.ielts_overall, eb.toefl_overall,
        eb.weight_academic, eb.weight_language, eb.weight_extra, eb.grade_type
        FROM benchmark_evaluations be JOIN eval_benchmarks eb ON eb.id=be.benchmark_id WHERE be.id=?`, [req.params.id]);
      if (!ev) return res.status(404).json({ error: '评估不存在' });

      const student      = db.get('SELECT * FROM students WHERE id=?', [ev.student_id]);
      const examSittings = db.all('SELECT * FROM exam_sittings WHERE student_id=?', [ev.student_id]);
      const assessments  = db.all('SELECT * FROM admission_assessments WHERE student_id=?', [ev.student_id]);

      const programProxy = {
        uni_name: ev.display_name,
        program_name: `${ev.subject_area} (${ev.tier} 基准)`,
        country: ev.country,
        route: ev.country,
        grade_type: ev.grade_type,
        grade_requirements: ev.grade_requirements,
        extra_tests: ev.extra_tests,
        ielts_overall: ev.ielts_overall,
        toefl_overall: ev.toefl_overall,
        hist_offer_rate: ev.benchmark_pass_rate,
        hist_applicants: null,
      };
      const aiResult = await aiEval.enhanceEval(ev, student, programProxy, examSittings, assessments);
      db.run('UPDATE benchmark_evaluations SET ai_result=? WHERE id=?', [JSON.stringify(aiResult), req.params.id]);
      audit(req, 'AI_ENHANCE', 'benchmark_evaluations', req.params.id, { benchmark: ev.display_name });
      res.json(aiResult);
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── 批量评估：学生 vs 所有候选专业 ─────────────────────
  router.post('/students/:id/admission-eval/batch', requireRole('principal','counselor'), (req, res) => {
    const student = db.get('SELECT * FROM students WHERE id=?', [req.params.id]);
    if (!student) return res.status(404).json({ error: '学生不存在' });

    const { program_ids } = req.body;
    if (!Array.isArray(program_ids) || program_ids.length === 0) return res.status(400).json({ error: 'program_ids 必填' });
    const _maxBatch = parseInt(_getSettingRaw('max_batch_programs', '50'));
    if (program_ids.length > _maxBatch) return res.status(400).json({ error: `program_ids 最多一次提交 ${_maxBatch} 个` });

    const examSittings = db.all('SELECT * FROM exam_sittings WHERE student_id=?', [req.params.id]);
    const assessments  = db.all('SELECT * FROM admission_assessments WHERE student_id=?', [req.params.id]);

    const today = new Date().toISOString().slice(0, 10);
    const results = [];
    const evalsToInsert = [];
    for (const programId of program_ids) {
      const program = db.get('SELECT * FROM uni_programs WHERE id=? AND is_active=1', [programId]);
      if (!program) continue;
      const existing = db.get(
        `SELECT id FROM admission_evaluations WHERE student_id=? AND program_id=? AND substr(eval_date,1,10)=?`,
        [req.params.id, programId, today]);
      if (existing) { results.push({ skipped: true, programId, existingId: existing.id }); continue; }
      const evalResult = runAdmissionEval(student, program, examSittings, assessments);
      const evalId = uuidv4();
      evalsToInsert.push({ evalId, programId, program, evalResult });
    }
    db.transaction(runInTx => {
      const now = new Date().toISOString();
      for (const { evalId, programId, program, evalResult } of evalsToInsert) {
        runInTx(`INSERT INTO admission_evaluations
          (id,student_id,program_id,eval_date,hard_pass,hard_fails,score_academic,score_language,score_extra,score_total,gaps,prob_low,prob_mid,prob_high,confidence,confidence_note,grade_snapshot,created_by,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [evalId, req.params.id, programId, now,
           evalResult.hard_pass, evalResult.hard_fails,
           evalResult.score_academic, evalResult.score_language, evalResult.score_extra, evalResult.score_total,
           evalResult.gaps, evalResult.prob_low, evalResult.prob_mid, evalResult.prob_high,
           evalResult.confidence, evalResult.confidence_note, evalResult.grade_snapshot,
           req.session.user.id, now]);
        results.push({ evalId, programId, uni_name: program.uni_name, program_name: program.program_name, ...evalResult });
      }
    });

    audit(req, 'BATCH_EVAL', 'admission_evaluations', req.params.id, { count: results.length });
    res.json({ count: results.length, results });
  });

  // ── 别名路由 ──────────────────────────────────────────

  // /admission-programs → 同 /uni-programs
  router.get('/admission-programs', requireAuth, (req, res) => {
    if (['agent', 'student_admin'].includes(req.session.user.role)) return res.status(403).json({ error: '权限不足' });
    const { country, route, search, uni_name } = req.query;
    let where = ['is_active=1'], params = [];
    if (country) { where.push('country=?'); params.push(country); }
    if (route)   { where.push('route=?');   params.push(route); }
    if (uni_name){ where.push('uni_name LIKE ?'); params.push(`%${uni_name}%`); }
    if (search)  { where.push('(uni_name LIKE ? OR program_name LIKE ? OR department LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const rows = db.all(`SELECT * FROM uni_programs WHERE ${where.join(' AND ')} ORDER BY country, uni_name, program_name`, params);
    res.json(rows);
  });

  // /admission-assessments → 列出所有可见的录取评估
  router.get('/admission-assessments', requireAuth, (req, res) => {
    const u = req.session.user;
    if (['agent', 'student_admin', 'intake_staff'].includes(u.role)) return res.status(403).json({ error: '权限不足' });
    let where = [], params = [];
    if (u.role === 'student') {
      where.push('ae.student_id=?'); params.push(u.linked_id);
    } else if (u.role === 'parent') {
      where.push('ae.student_id IN (SELECT student_id FROM student_parents WHERE parent_id=?)'); params.push(u.linked_id);
    } else if (u.role === 'mentor' || u.role === 'counselor') {
      where.push('ae.student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)'); params.push(u.linked_id);
    }
    // principal: no filter
    const wStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.all(`SELECT ae.*, up.uni_name, up.program_name, up.department, up.country, up.route, s.name as student_name
      FROM admission_evaluations ae
      JOIN uni_programs up ON up.id = ae.program_id
      JOIN students s ON s.id = ae.student_id
      ${wStr}
      ORDER BY ae.created_at DESC`, params);
    res.json(rows);
  });

  return router;
};
