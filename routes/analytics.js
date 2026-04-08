/**
 * routes/analytics.js — 数据分析 + ICS 日历导出
 * Evaluation engine moved to routes/evaluations.js
 * University programs moved to routes/uni-programs.js
 */
const express = require('express');

module.exports = function({ db, audit, requireAuth, requireRole }) {
  const router = express.Router();

  // ═══════════════════════════════════════════════════════
  //  P2.1 ANALYTICS（数据分析）
  // ═══════════════════════════════════════════════════════

  router.get('/analytics/overview', requireRole('principal','counselor'), (req, res) => {
    const admissionRate = db.get(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN a.status IN ('offer','conditional_offer','conditional','unconditional','firm','enrolled') THEN 1 ELSE 0 END) as offers,
      SUM(CASE WHEN a.status='enrolled' THEN 1 ELSE 0 END) as enrolled
      FROM applications a JOIN students s ON s.id=a.student_id`);
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

  return router;
};
