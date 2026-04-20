/**
 * scripts/import-teacher-map.js
 *
 * 补录「任课教师 / 教室 / 课时」映射（数据来自系统 UI 课程页面截图 2026-04-20）。
 * 做四件事：
 *   1. 补齐缺失教室：Classroom 7、Classroom 9、Studio、MPR
 *   2. 为 courses 表新增 periods_per_week 列（若未有）
 *   3. 批量创建 14 名任课教师（staff.role='teacher'，含 subjects JSON）
 *   4. 为每门课更正 classroom_id + periods_per_week，并写入 course_staff（含联课老师的
 *      每人分担课时，记入 notes 字段，保持与截图一致）
 *
 * 所有写入都记录到 import_batch_items → 可一键回滚。
 *
 * 用法：
 *   node scripts/import-teacher-map.js            # 正式执行
 *   node scripts/import-teacher-map.js --dry-run  # 预演
 */
'use strict';
const { v4: uuidv4 } = require('uuid');
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_KEY = `teacher-map-${new Date().toISOString().slice(0,10)}-v1`;
const BATCH_LABEL = '任课教师/教室/课时映射 2026-04-20 导入';

// ══════════════════════════════════════════════════
//  SOURCE OF TRUTH — 来自 UI 截图
// ══════════════════════════════════════════════════
// 课号 → 教室 / 课时 / 老师（含每人分担的课时）
const MAP = [
  // code,               room,         periods, teachers [{name, periods}]
  ['IAL26S1_Math/FMath', 'Classroom 6', 3, [['Xu Junjie', 3]]],
  ['EDX_Math',           'Classroom 2', 4, [['Nie Xin', 4]]],
  ['IAL26W_Math/Fmath',  'Classroom 5', 6, [['Xu Junjie', 6]]],
  ['IAL27W_Math',        'Classroom 3', 5, [['Xu Junjie', 5]]],
  ['OL_Math',            'Classroom 1', 4, [['Nie Xin', 4]]],
  ['SEC_Math',           'Classroom 4', 6, [['Nie Xin', 6]]],
  ['EDX_FMath',          'Classroom 2', 4, [['Xu Junjie', 4]]],
  ['OL_Amath',           'Classroom 1', 3, [['Nie Xin', 3]]],
  ['IAL26S1_Phy',        'Classroom 6', 3, [['Cui Yanjie', 3]]],
  ['IAL26_Phy',          'Classroom 5', 6, [['Cui Yanjie', 4], ['Fu Hanqi Frank', 2]]],
  ['IAL27M_Phy',         'Classroom 2', 5, [['Cui Yanjie', 5]]],
  ['IAL27W_Phy',         'Classroom 3', 5, [['Fu Hanqi Frank', 5]]],
  ['OL_Phy',             'Classroom 1', 4, [['Cui Yanjie', 4]]],
  ['SEC_ComSci',         'Classroom 4', 7, [['Kelvin Lee', 7]]],
  ['IAL26S1_Chem',       'Classroom 6', 3, [['Sun Jin', 3]]],
  ['Su&Zhou_EDX_Chem',   'Classroom 9', 3, [['Kelvin Lee', 3]]],
  ['IAL26_Chem',         'Classroom 5', 5, [['Sun Jin', 5]]],
  ['IAL27M_Chem',        'Classroom 2', 5, [['Sun Jin', 5]]],
  ['IAL27W_Chem',        'Classroom 3', 5, [['Sun Jin', 5]]],
  ['OL_Chem',            'Classroom 1', 4, [['Kelvin Lee', 4]]],
  ['IAL27M_Econ',        'Classroom 7', 5, [['Chmel Oon', 5]]],
  ['Zhou_Econ',          'Classroom 9', 5, [['Chmel Oon', 5]]],
  ['IAL27W_Econ',        'Classroom 7', 4, [['Chmel Oon', 4]]],
  ['SEC_Eng',            'Classroom 4', 5, [['Stanley', 5]]],
  ['OL_Eng',             'Classroom 1', 8, [['Stanley', 4], ['Keith Ang', 4]]],
  ['IAL_IELTS',          'MPR',         4, [['Daniel', 4]]],
  ['IAL/SEC_IELTS',      'Classroom 3', 4, [['Stanley', 4]]],
  ['IAL27W_Acc',         'Classroom 7', 3, [['Cynthia', 3]]],
  ['IAL27W_Art',         'Studio',      6, [['Jingqi', 3], ['Corrina', 3]]],
  ['IAL27_CS',           'Classroom 9', 3, [['Yao Kexiang', 3]]],
  ['YYC_Math',           'Classroom 9', 4, [['Yao Kexiang', 4]]],
];

// 每位老师授课的科目（用于 staff.subjects 字段）
const TEACHER_SUBJECTS = {
  'Xu Junjie':       ['Math', 'Fmath'],
  'Nie Xin':         ['Math', 'Amath'],
  'Cui Yanjie':      ['Physics'],
  'Fu Hanqi Frank':  ['Physics'],
  'Kelvin Lee':      ['Chemistry', 'Combined Science'],
  'Sun Jin':         ['Chemistry'],
  'Chmel Oon':       ['Economics'],
  'Stanley':         ['English'],
  'Keith Ang':       ['English'],
  'Daniel':          ['English'],
  'Cynthia':         ['Accounting'],
  'Jingqi':          ['Art'],
  'Corrina':         ['Art'],
  'Yao Kexiang':     ['Math', 'Computer Science'],
};

(async () => {
  const db = require('../db.js');
  await db.init();

  console.log(`\n═══ 任课教师/教室/课时映射 导入脚本 ═══`);
  console.log(`batch_key = ${BATCH_KEY}   DRY_RUN=${DRY_RUN}\n`);

  const trackedRuns = [];
  const track = (table, rowId) => {
    if (DRY_RUN) return;
    trackedRuns.push({ table, rowId });
  };

  // ── step 1: 补齐缺失教室 ─────────────────────────────
  console.log('[1] 补齐缺失教室（Classroom 7 / 9 / Studio / MPR）');
  const ensureClassroom = (name) => {
    const row = db.get('SELECT id FROM classrooms WHERE name = ?', [name]);
    if (row) return row.id;
    const id = uuidv4();
    if (!DRY_RUN) {
      db.run('INSERT INTO classrooms (id, name, capacity) VALUES (?, ?, ?)',
        [id, name, name === 'MPR' ? 40 : (name === 'Studio' ? 15 : 20)]);
      track('classrooms', id);
    }
    console.log(`   + ${name} (${id.slice(0,8)}…)`);
    return id;
  };
  const roomId = {};
  for (const name of ['Classroom 1','Classroom 2','Classroom 3','Classroom 4','Classroom 5','Classroom 6','Classroom 7','Classroom 8','Classroom 9','Studio','MPR']) {
    roomId[name] = ensureClassroom(name);
  }

  // ── step 2: ALTER courses 增加 periods_per_week 列 ─
  console.log('\n[2] 为 courses 表新增 periods_per_week 列（若未有）');
  const cols = db.all(`PRAGMA table_info(courses)`);
  const hasPeriods = cols.some(c => c.name === 'periods_per_week');
  if (!hasPeriods) {
    if (!DRY_RUN) db.run(`ALTER TABLE courses ADD COLUMN periods_per_week INTEGER DEFAULT 0`);
    console.log('   + 列 periods_per_week 已添加');
  } else {
    console.log('   ✓ 列已存在');
  }

  // ── step 3: 创建 14 名任课教师 ───────────────────────
  console.log('\n[3] 创建 14 名任课教师 (role=teacher)');
  const teacherId = {};
  for (const [name, subs] of Object.entries(TEACHER_SUBJECTS)) {
    const existing = db.get(`SELECT id FROM staff WHERE name = ? AND role = 'teacher'`, [name]);
    if (existing) {
      teacherId[name] = existing.id;
      console.log(`   ✓ ${name} 已存在`);
      continue;
    }
    const id = uuidv4();
    if (!DRY_RUN) {
      db.run(`INSERT INTO staff (id, name, role, subjects, exam_board_exp, capacity_students)
              VALUES (?, ?, 'teacher', ?, ?, 20)`,
        [id, name, JSON.stringify(subs), JSON.stringify(['Edexcel IAL','CIE IGCSE','CIE O-Level'])]);
      track('staff', id);
    }
    teacherId[name] = id;
    console.log(`   + ${name} (${subs.join(',')})`);
  }

  // ── step 4: 更新 courses 并写 course_staff ──────────
  console.log('\n[4] 更新 classroom_id / periods_per_week + 写 course_staff');
  let cUpdated = 0, csInserted = 0;
  for (const [code, room, periods, teachers] of MAP) {
    const course = db.get('SELECT id FROM courses WHERE code = ?', [code]);
    if (!course) {
      console.log(`   ✗ 找不到课号 ${code} — 跳过`);
      continue;
    }
    const rid = roomId[room];
    if (!rid) { console.log(`   ✗ 找不到教室 ${room}`); continue; }
    if (!DRY_RUN) {
      db.run(`UPDATE courses SET classroom_id = ?, periods_per_week = ?, updated_at = datetime('now') WHERE id = ?`,
        [rid, periods, course.id]);
    }
    cUpdated++;

    for (const [tname, tperiods] of teachers) {
      const sid = teacherId[tname];
      if (!sid) { console.log(`   ✗ ${code}: 老师 ${tname} 未找到`); continue; }
      const dup = db.get('SELECT id FROM course_staff WHERE course_id=? AND staff_id=?', [course.id, sid]);
      if (dup) continue;
      const csId = uuidv4();
      if (!DRY_RUN) {
        db.run(`INSERT INTO course_staff (id, course_id, staff_id, role, notes) VALUES (?, ?, ?, 'teacher', ?)`,
          [csId, course.id, sid, `${tperiods}节/周`]);
        track('course_staff', csId);
      }
      csInserted++;
    }
    const tlist = teachers.map(t => `${t[0]}(${t[1]}节)`).join(' + ');
    console.log(`   ✓ ${code.padEnd(22)} → ${room.padEnd(12)} ${periods}节  | ${tlist}`);
  }

  // ── step 5: 写 import_batch_items (用于 rollback) ───
  if (!DRY_RUN && trackedRuns.length > 0) {
    try {
      db.run(`CREATE TABLE IF NOT EXISTS import_batch_items (
        id TEXT PRIMARY KEY, batch_key TEXT NOT NULL, label TEXT,
        table_name TEXT NOT NULL, row_id TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
      )`);
      for (const t of trackedRuns) {
        db.run(`INSERT INTO import_batch_items (id, batch_key, label, table_name, row_id) VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), BATCH_KEY, BATCH_LABEL, t.table, t.rowId]);
      }
    } catch (e) { console.warn('batch log 写入失败:', e.message); }
  }

  console.log(`\n═══ 完成 ═══`);
  console.log(`  课程更新:        ${cUpdated}`);
  console.log(`  course_staff 写入: ${csInserted}`);
  console.log(`  batch_key:       ${BATCH_KEY}`);
  console.log(DRY_RUN ? '\n⚠️  DRY_RUN — 未实际写库\n' : '\n✅ 已写库\n');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
