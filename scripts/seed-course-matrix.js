/**
 * scripts/seed-course-matrix.js
 *
 * 服务启动时读取 data/course-matrix-seed.json，如果数据库里还没有 courses，
 * 就把 11 间教室 / 31 门课 / 14 位任课教师 / 34 条课程-教师绑定 /
 * 170 条学生选课 / 385 条考试场次 全部种下去。
 *
 * 依赖：students 表必须已有（由 migration-import-students.js 保证）。
 * 如找不到匹配学生（按 name 精确匹配），跳过该条 enrollment/sitting 并记录警告。
 *
 * 只执行一次（通过 settings.key='seed_course_matrix_v1' 门槛）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

function runSeed(db, uuidv4) {
  // 门槛
  try {
    const done = db.get("SELECT value FROM settings WHERE key='seed_course_matrix_v1'");
    if (done) return false;
  } catch(e) {}

  const seedPath = path.join(__dirname, '..', 'data', 'course-matrix-seed.json');
  if (!fs.existsSync(seedPath)) {
    console.log('[seed-cm] 未找到 data/course-matrix-seed.json，跳过');
    return false;
  }

  // 若 courses 已有数据，跳过（防止生产已经手动导入过）
  const existingCourses = db.get('SELECT COUNT(*) c FROM courses');
  if (existingCourses && existingCourses.c > 0) {
    console.log(`[seed-cm] courses 已有 ${existingCourses.c} 条记录，跳过种子`);
    try { db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('seed_course_matrix_v1', ?)", [new Date().toISOString()]); } catch(e) {}
    return false;
  }

  const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const now = new Date().toISOString();
  let stats = { classrooms: 0, teachers: 0, courses: 0, course_staff: 0, enrollments: 0, subject_enr: 0, sittings: 0, skipped: 0, errors: 0 };
  const firstErrors = [];
  const tryRun = (sql, params, tag) => {
    try { db.run(sql, params); return true; }
    catch (e) {
      stats.errors++;
      if (firstErrors.length < 5) firstErrors.push(`${tag}: ${e.message}`);
      return false;
    }
  };

  // 1) classrooms
  const classroomId = {};
  for (const cr of data.classrooms) {
    let row = db.get('SELECT id FROM classrooms WHERE name=?', [cr.name]);
    if (!row) {
      const id = uuidv4();
      db.run('INSERT INTO classrooms (id, name, capacity) VALUES (?,?,?)', [id, cr.name, cr.capacity || 20]);
      row = { id };
      stats.classrooms++;
    }
    classroomId[cr.name] = row.id;
  }

  // 2) teachers (staff role=teacher)
  const teacherId = {};
  for (const t of data.teachers) {
    let row = db.get(`SELECT id FROM staff WHERE name=? AND role='teacher'`, [t.name]);
    if (!row) {
      const id = uuidv4();
      db.run(`INSERT INTO staff (id, name, role, subjects, capacity_students, created_at, updated_at)
              VALUES (?,?,'teacher',?,20,?,?)`,
        [id, t.name, t.subjects || '[]', now, now]);
      row = { id };
      stats.teachers++;
    }
    teacherId[t.name] = row.id;
  }

  // 3) courses
  const courseId = {};
  const subjectIdByCode = {};
  for (const row of db.all('SELECT id, code FROM subjects')) subjectIdByCode[row.code] = row.id;
  for (const c of data.courses) {
    let row = db.get('SELECT id FROM courses WHERE code=?', [c.code]);
    if (!row) {
      const id = uuidv4();
      const ok = tryRun(`INSERT INTO courses (id, code, name, subject_id, classroom_id, exam_board, level, session_label,
              num_students, periods_per_week, notes, status, created_at, updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?, '', 'active', ?,?)`,
        [id, c.code, c.name, subjectIdByCode[c.subject_code] || null, classroomId[c.classroom_name] || null,
         c.exam_board || '', c.level || '', c.session_label || '', c.num_students || 0, c.periods_per_week || 0, now, now],
        `courses[${c.code}]`);
      if (!ok) continue;
      row = { id };
      stats.courses++;
    }
    courseId[c.code] = row.id;
  }

  // 4) course_staff
  for (const cs of data.course_staff) {
    const cid = courseId[cs.course_code];
    const sid = teacherId[cs.teacher_name];
    if (!cid || !sid) { stats.skipped++; continue; }
    const dup = db.get('SELECT id FROM course_staff WHERE course_id=? AND staff_id=?', [cid, sid]);
    if (dup) continue;
    db.run(`INSERT INTO course_staff (id, course_id, staff_id, role, notes, created_at)
            VALUES (?,?,?,?,?,?)`, [uuidv4(), cid, sid, cs.role || 'teacher', cs.notes || '', now]);
    stats.course_staff++;
  }

  // 5) course_enrollments — 要求 students 表里已有对应 name
  const studentIdByName = {};
  for (const row of db.all(`SELECT id, TRIM(name) AS name FROM students WHERE status='active'`)) studentIdByName[row.name] = row.id;

  const warnMissing = new Set();
  for (const ce of data.course_enrollments) {
    const cid = courseId[ce.course_code];
    const sid = studentIdByName[ce.student_name];
    if (!cid) { stats.skipped++; continue; }
    if (!sid) { warnMissing.add(ce.student_name); stats.skipped++; continue; }
    const dup = db.get('SELECT id FROM course_enrollments WHERE course_id=? AND student_id=?', [cid, sid]);
    if (dup) continue;
    db.run(`INSERT INTO course_enrollments (id, course_id, student_id, status) VALUES (?,?,?, 'active')`,
      [uuidv4(), cid, sid]);
    stats.enrollments++;
  }
  // refresh courses.num_students
  db.run(`UPDATE courses SET num_students = (SELECT COUNT(*) FROM course_enrollments WHERE course_id=courses.id AND status='active')`);

  // 5.5) subject_enrollments (学生档案右侧"选科"面板数据源)
  if (Array.isArray(data.subject_enrollments)) {
    for (const se of data.subject_enrollments) {
      const sid = studentIdByName[se.student_name];
      const subId = subjectIdByCode[se.subject_code];
      if (!sid || !subId) { stats.skipped++; continue; }
      const dup = db.get('SELECT id FROM subject_enrollments WHERE student_id=? AND subject_id=? AND exam_board=?',
        [sid, subId, se.exam_board || '']);
      if (dup) continue;
      const ok = tryRun(`INSERT INTO subject_enrollments (id, student_id, subject_id, level, exam_board) VALUES (?,?,?,?,?)`,
        [uuidv4(), sid, subId, se.level || '', se.exam_board || ''],
        `subject_enr[${se.student_name}/${se.subject_code}]`);
      if (ok) stats.subject_enr++;
    }
  }

  // 6) exam_sittings
  for (const es of data.exam_sittings) {
    const sid = studentIdByName[es.student_name];
    if (!sid) { warnMissing.add(es.student_name); stats.skipped++; continue; }
    const dup = db.get(`SELECT id FROM exam_sittings WHERE student_id=? AND subject_code=? AND sitting_date=?`,
      [sid, es.subject_code, es.sitting_date]);
    if (dup) continue;
    // 构造 INSERT 列表（兼容不同 schema 版本）
    const cols = ['id', 'student_id'];
    const vals = [uuidv4(), sid];
    for (const k of Object.keys(es)) {
      if (k === 'student_name') continue;
      if (es[k] === null || es[k] === undefined) continue;
      cols.push(k); vals.push(es[k]);
    }
    const placeholders = cols.map(()=>'?').join(',');
    try {
      db.run(`INSERT INTO exam_sittings (${cols.join(',')}) VALUES (${placeholders})`, vals);
      stats.sittings++;
    } catch(e) {
      stats.skipped++;
    }
  }

  // 标记完成
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('seed_course_matrix_v1', ?)", [now]);

  console.log(`[seed-cm] ✅ 课程矩阵种子完成:`,
    `classrooms+${stats.classrooms}, teachers+${stats.teachers}, courses+${stats.courses},`,
    `course_staff+${stats.course_staff}, enrollments+${stats.enrollments},`,
    `subject_enr+${stats.subject_enr}, sittings+${stats.sittings},`,
    `skipped=${stats.skipped}, errors=${stats.errors}`);
  if (firstErrors.length > 0) {
    console.log(`[seed-cm] ⚠️ 错误样本 (${firstErrors.length}):`);
    firstErrors.forEach(e => console.log(`  - ${e}`));
  }
  if (warnMissing.size > 0) {
    console.log(`[seed-cm] ⚠️ 以下学生未在 students 表中（跳过其选课/考试）: ${[...warnMissing].slice(0,10).join(', ')}${warnMissing.size>10?'...':''}`);
  }
  return true;
}

module.exports = runSeed;
