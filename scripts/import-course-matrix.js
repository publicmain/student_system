/**
 * scripts/import-course-matrix.js
 *
 * 从 Excel「学生选课矩阵-2026-04-20」导入：
 *   - 42 名学生（7 个行政班）
 *   - 9 间教室
 *   - 所有 unique 课程（课号）
 *   - 课程-学生 选课关系
 *   - 科目报读记录 (subject_enrollments，便于向后兼容)
 *   - 考试场次 (exam_sittings)：基于 Edexcel GCE Summer 2026 + CIE June 2026 Zone 5 时间表
 *
 * 所有写入的行都会被记录到 import_batch_items → 可用 rollback 脚本一键撤销。
 *
 * 用法：
 *   node scripts/import-course-matrix.js                         # 正式执行（自动生成 batch_key）
 *   node scripts/import-course-matrix.js --dry-run               # 仅打印，不写库
 *   node scripts/import-course-matrix.js --batch-key=my-batch-1  # 指定 batch key
 *   node scripts/import-course-matrix.js --wipe                  # 先清空 course* / classrooms (不会影响老学生/老 sitting)
 */
'use strict';

const path = require('path');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');

const XLSX_PATH = process.env.COURSE_MATRIX_XLSX || 'C:/tmp/course_matrix.xlsx';
const DRY_RUN   = process.argv.includes('--dry-run');
const WIPE      = process.argv.includes('--wipe');
const argBatch  = (process.argv.find(a => a.startsWith('--batch-key=')) || '').split('=')[1];
const BATCH_KEY = argBatch || `course-matrix-${new Date().toISOString().slice(0,10)}-v1`;
const BATCH_LABEL = '学生选课矩阵 2026-04-20 导入';

// ═══════════════════════════════════════════════════════
//  静态映射：考试 paper → 日期（已人工从 PDF 提取）
// ═══════════════════════════════════════════════════════
const EDX_GCE = {
  Math: [
    { code: '9MA0/01', label: 'Paper 1 Pure Mathematics 1',    date: '2026-06-03', session: 'PM' },
    { code: '9MA0/02', label: 'Paper 2 Pure Mathematics 2',    date: '2026-06-11', session: 'PM' },
    { code: '9MA0/03', label: 'Paper 3 Statistics & Mechanics', date: '2026-06-18', session: 'PM' },
  ],
  FMath: [
    { code: '9FM0/01', label: 'Paper 1 Core Pure Math 1',  date: '2026-05-14', session: 'PM' },
    { code: '9FM0/02', label: 'Paper 2 Core Pure Math 2',  date: '2026-05-21', session: 'PM' },
    { code: '9FM0/3C', label: 'Paper 3C Further Mech 1',   date: '2026-06-05', session: 'PM' },
    { code: '9FM0/3A', label: 'Paper 3A Further Pure Math 1', date: '2026-06-19', session: 'PM' },
  ],
  Physics: [
    { code: '9PH0/01', label: 'Paper 1 Advanced Physics I', date: '2026-05-20', session: 'PM' },
    { code: '9PH0/02', label: 'Paper 2 Advanced Physics II', date: '2026-06-01', session: 'AM' },
    { code: '9PH0/03', label: 'Paper 3 General & Practical',  date: '2026-06-08', session: 'AM' },
  ],
  Chemistry: [
    { code: '9CH0/01', label: 'Paper 1 Inorganic & Physical', date: '2026-06-02', session: 'AM' },
    { code: '9CH0/02', label: 'Paper 2 Organic & Physical',   date: '2026-06-09', session: 'AM' },
    { code: '9CH0/03', label: 'Paper 3 General & Practical',  date: '2026-06-15', session: 'AM' },
  ],
  Economics: [
    { code: '9EC0/01', label: 'Paper 1 Markets & Business',     date: '2026-05-11', session: 'AM' },
    { code: '9EC0/02', label: 'Paper 2 National & Global Econ', date: '2026-05-18', session: 'PM' },
    { code: '9EC0/03', label: 'Paper 3 Micro & Macro',          date: '2026-06-04', session: 'AM' },
  ],
  Accounting: [],
  Art: [],
  'Computer Science': [],
  English: [],
};

const CIE_OL = {
  Math: [
    { code: '4024/13', label: 'Math Syllabus D P1', date: '2026-04-28', session: 'AM' },
    { code: '4024/23', label: 'Math Syllabus D P2', date: '2026-05-04', session: 'AM' },
  ],
  Amath: [
    { code: '0606/12', label: 'Additional Math P1', date: '2026-05-18', session: 'PM' },
    { code: '0606/22', label: 'Additional Math P2', date: '2026-05-26', session: 'PM' },
  ],
  Physics: [
    { code: '5054/12', label: 'Physics MCQ P1',          date: '2026-06-01', session: 'PM' },
    { code: '5054/22', label: 'Physics Theory P2',       date: '2026-05-04', session: 'PM' },
    { code: '5054/32', label: 'Physics Practical P3',    date: '2026-05-19', session: 'PM' },
  ],
  Chemistry: [
    { code: '5070/12', label: 'Chemistry MCQ P1',       date: '2026-06-09', session: 'PM' },
    { code: '5070/22', label: 'Chemistry Theory P2',    date: '2026-04-28', session: 'PM' },
    { code: '5070/32', label: 'Chemistry Practical P3', date: '2026-05-07', session: 'PM' },
  ],
  English: [
    { code: '1123/12', label: 'English Language P1', date: '2026-05-06', session: 'PM' },
    { code: '1123/22', label: 'English Language P2', date: '2026-04-27', session: 'PM' },
  ],
};

const CIE_IG = {
  Math: [
    { code: '0580/23', label: 'Math (Extended) P2', date: '2026-04-28', session: 'AM' },
    { code: '0580/43', label: 'Math (Extended) P4', date: '2026-05-05', session: 'AM' },
  ],
  'Combined Science': [
    { code: '0478/12', label: 'Computer Science P1', date: '2026-05-13', session: 'PM' },
    { code: '0478/22', label: 'Computer Science P2', date: '2026-05-20', session: 'PM' },
  ],
  English: [],
  Chemistry: [
    { code: '0620/22', label: 'Chem (Ext) MCQ',   date: '2026-06-09', session: 'PM' },
    { code: '0620/42', label: 'Chem (Ext) Theory', date: '2026-04-28', session: 'PM' },
    { code: '0620/52', label: 'Chem Practical',    date: '2026-05-07', session: 'PM' },
  ],
  Physics: [
    { code: '0625/22', label: 'Physics (Ext) MCQ',    date: '2026-06-01', session: 'PM' },
    { code: '0625/42', label: 'Physics (Ext) Theory', date: '2026-05-08', session: 'PM' },
    { code: '0625/52', label: 'Physics Practical',    date: '2026-05-19', session: 'PM' },
  ],
};

function resolveExamPapers(code, columnName) {
  const col = (columnName || '').trim();
  if (!code) return null;
  if (/^(EDX_|IAL|Su&Zhou|Zhou_|YYC_)/i.test(code)) {
    let key = col;
    if (col === 'Fmath') key = 'FMath';
    if (col === 'Math + FMath') key = 'MathFMath';
    if (col === 'Amath') key = null;
    if (col === 'Combined Science') key = null;
    return {
      board: 'Edexcel IAL',
      level: 'A2',
      papers: key === 'MathFMath'
        ? [...(EDX_GCE.Math || []), ...(EDX_GCE.FMath || [])]
        : (EDX_GCE[key] || []),
      note: col,
    };
  }
  if (/^OL_/i.test(code)) {
    let key = col;
    if (col === 'Fmath') key = null;
    if (col === 'Amath') key = 'Amath';
    if (col === 'Combined Science') key = null;
    return { board: 'CIE O-Level', level: 'OL', papers: CIE_OL[key] || [], note: col };
  }
  if (/^SEC_/i.test(code)) {
    let key = col;
    if (col === 'Combined Science') key = 'Combined Science';
    if (col === 'Computer Science') key = 'Combined Science';
    return { board: 'CIE IGCSE', level: 'IGCSE', papers: CIE_IG[key] || [], note: col };
  }
  if (/IELTS/i.test(code)) {
    return { board: 'IELTS', level: 'N/A', papers: [], note: 'IELTS 外部考试 — 自行预约' };
  }
  return { board: 'Unknown', level: '', papers: [], note: col };
}

// ═══════════════════════════════════════════════════════
//  主流程
// ═══════════════════════════════════════════════════════
async function main() {
  const db = require(path.join(__dirname, '..', 'db.js'));
  await db.init();

  console.log(`\n════ 导入开始 ════  ${DRY_RUN ? '【DRY-RUN】' : ''}${WIPE ? ' 【WIPE】' : ''}`);
  console.log(`     batch_key = ${BATCH_KEY}\n`);

  // Step -1: 检查 batch 是否已存在
  const existBatch = db.get('SELECT id, status FROM import_batches WHERE batch_key=?', [BATCH_KEY]);
  if (existBatch && existBatch.status === 'active') {
    console.log(`⚠️ batch_key="${BATCH_KEY}" 已存在且未回滚。请先 rollback 或换一个 batch key。`);
    return;
  }
  // 如果是 rolled_back 状态，清理历史记录以允许重用同一 batch_key
  if (existBatch && existBatch.status === 'rolled_back' && !DRY_RUN) {
    db.run('DELETE FROM import_batch_items WHERE batch_id=?', [existBatch.id]);
    db.run('DELETE FROM import_batches WHERE id=?', [existBatch.id]);
    console.log(`[清理] 移除已回滚的旧批次记录 (id=${existBatch.id})`);
  }

  // Step 0: 清表 (可选)
  if (WIPE && !DRY_RUN) {
    console.log('[0] 清空 course_enrollments / course_staff / courses / classrooms (及相关 batch 记录)');
    db.run(`DELETE FROM import_batch_items WHERE table_name IN ('courses','classrooms','course_enrollments','course_staff','students','subject_enrollments','exam_sittings')`);
    db.run(`UPDATE import_batches SET status='rolled_back', rolled_back_at=datetime('now') WHERE status='active'`);
    db.run('DELETE FROM course_enrollments');
    db.run('DELETE FROM course_staff');
    db.run('DELETE FROM courses');
    db.run('DELETE FROM classrooms');
  }

  // Step 1: 创建 batch 记录
  const batchId = uuidv4();
  if (!DRY_RUN) {
    db.run(`INSERT INTO import_batches (id, batch_key, label, source_file, status, notes, created_at)
            VALUES (?,?,?,?,'active',?, datetime('now'))`,
      [batchId, BATCH_KEY, BATCH_LABEL, XLSX_PATH, '包含 42 学生 + 7 教室 + 31 课程 + 选课 + 考试场次']);
  }

  // 批次记录辅助函数
  const items = [];   // 内存先累积，最后批量写
  function trackItem(table, rowId) {
    items.push({ batch_id: batchId, table_name: table, row_id: rowId });
  }
  function flushItems() {
    if (DRY_RUN) return;
    for (const it of items) {
      db.run('INSERT INTO import_batch_items (id, batch_id, table_name, row_id) VALUES (?,?,?,?)',
        [uuidv4(), it.batch_id, it.table_name, it.row_id]);
    }
    db.run('UPDATE import_batches SET item_count=? WHERE id=?', [items.length, batchId]);
  }

  // Step 2: 读 Excel
  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets['选课矩阵'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const header = rows[2];
  console.log('[2] 读取 Excel 成功');

  // Step 3: 解析分组
  const sessions = [];
  let curSession = null;
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    const first = String(r[0] || '').trim();
    if (!first) continue;
    const mSession = first.match(/^(IAL\d+[A-Z]\d?|OL\d+[A-Z]|SEC\d+[A-Z])\s*·\s*(Classroom\s*\d+|Studio|MPR)\s*·/i);
    if (mSession) {
      curSession = { sessionKey: mSession[1].toUpperCase().replace(/\s+/g, ''), classroom: mSession[2].trim(), label: first, students: [] };
      sessions.push(curSession);
      continue;
    }
    if (curSession) {
      const picks = {};
      for (let c = 3; c < header.length; c++) {
        const col = header[c];
        const val = String(r[c] || '').trim();
        if (val) picks[col] = val;
      }
      curSession.students.push({ name: first, gradeTag: String(r[1]||'').trim(), adminClass: String(r[2]||'').trim(), picks });
    }
  }
  console.log(`[3] 解析出 ${sessions.length} 个行政班，${sessions.reduce((a,s)=>a+s.students.length, 0)} 名学生`);

  // Step 4: 教室
  const classroomMap = {};
  const uniqClassroom = [...new Set(sessions.map(s => s.classroom))];
  for (const cr of uniqClassroom) {
    let existing = db.get('SELECT id FROM classrooms WHERE name=?', [cr]);
    if (existing) { classroomMap[cr] = existing.id; continue; }
    const id = uuidv4();
    if (!DRY_RUN) db.run('INSERT INTO classrooms (id, name, capacity) VALUES (?,?,?)', [id, cr, 20]);
    classroomMap[cr] = id;
    trackItem('classrooms', id);
  }
  console.log(`[4] 教室 ${uniqClassroom.length} 间`);

  // Step 5: subjects 字典
  const SUBJECT_DEFS = [
    { code: 'math', name: '数学', category: 'Math' },
    { code: 'fmath', name: '进阶数学', category: 'Math' },
    { code: 'amath', name: '附加数学', category: 'Math' },
    { code: 'physics', name: '物理', category: 'Science' },
    { code: 'chemistry', name: '化学', category: 'Science' },
    { code: 'combined_sci', name: '综合科学/计算机', category: 'Science' },
    { code: 'economics', name: '经济学', category: 'Humanities' },
    { code: 'english', name: '英语', category: 'Language' },
    { code: 'accounting', name: '会计', category: 'Business' },
    { code: 'art', name: '艺术', category: 'Arts' },
    { code: 'computer_science', name: '计算机科学', category: 'STEM' },
  ];
  const subjectMap = {};
  for (const sd of SUBJECT_DEFS) {
    let row = db.get('SELECT id FROM subjects WHERE code=?', [sd.code]);
    if (!row) {
      const id = uuidv4();
      if (!DRY_RUN) db.run('INSERT INTO subjects (id, code, name, category) VALUES (?,?,?,?)', [id, sd.code, sd.name, sd.category]);
      subjectMap[sd.code] = id;
      trackItem('subjects', id);
    } else subjectMap[sd.code] = row.id;
  }
  function columnToSubjectCode(col) {
    const map = { 'Math + FMath': 'math', 'Math': 'math', 'Fmath': 'fmath', 'Amath': 'amath', 'Physics': 'physics',
      'Combined Science': 'combined_sci', 'Chemistry': 'chemistry', 'Economics': 'economics',
      'English': 'english', 'Accounting': 'accounting', 'Art': 'art', 'Computer Science': 'computer_science' };
    return map[col] || null;
  }

  // Step 6: courses
  const courseCodes = new Map();
  for (const sess of sessions) {
    for (const stu of sess.students) {
      for (const [col, val] of Object.entries(stu.picks)) {
        const codes = val.split(/,\s*/).map(s=>s.trim()).filter(Boolean);
        for (const code of codes) {
          if (!courseCodes.has(code)) {
            const papers = resolveExamPapers(code, col);
            courseCodes.set(code, { code, primaryColumn: col, classroom: sess.classroom, sessionKey: sess.sessionKey,
              examBoard: papers?.board || '', level: papers?.level || '' });
          }
        }
      }
    }
  }
  const courseIdMap = {};
  for (const [code, info] of courseCodes) {
    const existing = db.get('SELECT id FROM courses WHERE code=?', [code]);
    let id;
    if (existing) id = existing.id;
    else {
      id = uuidv4();
      const subjCode = columnToSubjectCode(info.primaryColumn);
      const subjId = subjCode ? subjectMap[subjCode] : null;
      const now = new Date().toISOString();
      const name = `${info.primaryColumn}（${code}）`;
      if (!DRY_RUN) {
        db.run(`INSERT INTO courses (id, code, name, subject_id, classroom_id, exam_board, level, session_label, num_students, notes, status, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,0,?,'active',?,?)`,
          [id, code, name, subjId, classroomMap[info.classroom] || null, info.examBoard, info.level, info.sessionKey, '', now, now]);
      }
      trackItem('courses', id);
    }
    courseIdMap[code] = id;
  }
  console.log(`[6] 课程 ${courseCodes.size} 门`);

  // Step 7: 学生 + course_enrollments + subject_enrollments + exam_sittings
  let newStu = 0, reuseStu = 0, enr = 0, se = 0, sit = 0;
  const sessionToBoard = (sk) => sk.startsWith('IAL') ? 'Edexcel IAL' : (sk.startsWith('OL') ? 'CIE O-Level' : (sk.startsWith('SEC') ? 'CIE IGCSE' : ''));

  for (const sess of sessions) {
    const board = sessionToBoard(sess.sessionKey);
    for (const stu of sess.students) {
      let srow = db.get('SELECT id FROM students WHERE TRIM(name)=? AND status=?', [stu.name, 'active']);
      let sid;
      if (srow) {
        sid = srow.id; reuseStu++;
        if (!DRY_RUN) db.run('UPDATE students SET grade_level=?, exam_board=?, updated_at=? WHERE id=?',
          [sess.sessionKey, board, new Date().toISOString(), sid]);
      } else {
        sid = uuidv4();
        const now = new Date().toISOString();
        if (!DRY_RUN) db.run(`INSERT INTO students (id, name, grade_level, exam_board, status, notes, created_at, updated_at)
          VALUES (?,?,?,?, 'active', ?,?,?)`,
          [sid, stu.name, sess.sessionKey, board, `行政班: ${sess.label}`, now, now]);
        newStu++;
        trackItem('students', sid);
      }

      const processed = new Set();
      for (const [col, val] of Object.entries(stu.picks)) {
        const codes = val.split(/,\s*/).map(s=>s.trim()).filter(Boolean);
        const subjId = columnToSubjectCode(col) ? subjectMap[columnToSubjectCode(col)] : null;

        for (const code of codes) {
          if (processed.has(code)) continue;
          processed.add(code);

          const cid = courseIdMap[code];
          if (cid) {
            const exists = db.get('SELECT id FROM course_enrollments WHERE course_id=? AND student_id=?', [cid, sid]);
            if (!exists) {
              const eid = uuidv4();
              if (!DRY_RUN) db.run(`INSERT INTO course_enrollments (id, course_id, student_id, status) VALUES (?,?,?, 'active')`, [eid, cid, sid]);
              trackItem('course_enrollments', eid);
              enr++;
            }
          }

          if (subjId) {
            const info = resolveExamPapers(code, col);
            const existsSE = db.get('SELECT id FROM subject_enrollments WHERE student_id=? AND subject_id=? AND exam_board=?',
              [sid, subjId, info?.board || board]);
            if (!existsSE) {
              const seid = uuidv4();
              if (!DRY_RUN) db.run(`INSERT INTO subject_enrollments (id, student_id, subject_id, level, exam_board) VALUES (?,?,?,?,?)`,
                [seid, sid, subjId, info?.level || '', info?.board || board]);
              trackItem('subject_enrollments', seid);
              se++;
            }
          }

          const papers = resolveExamPapers(code, col)?.papers || [];
          for (const p of papers) {
            const dup = db.get(`SELECT id FROM exam_sittings WHERE student_id=? AND subject_code=? AND sitting_date=?`,
              [sid, p.code, p.date]);
            if (dup) continue;
            const esid = uuidv4();
            if (!DRY_RUN) db.run(`INSERT INTO exam_sittings
              (id, student_id, exam_board, series, year, subject, subject_code, component, sitting_date, status, created_at, updated_at)
              VALUES (?,?,?,?,?,?,?,?,?, 'registered', ?, ?)`,
              [esid, sid, resolveExamPapers(code, col)?.board || '', 'June', 2026, col, p.code, p.label, p.date,
               new Date().toISOString(), new Date().toISOString()]);
            trackItem('exam_sittings', esid);
            sit++;
          }
        }
      }
    }
  }

  if (!DRY_RUN) {
    db.run(`UPDATE courses SET num_students = (SELECT COUNT(*) FROM course_enrollments WHERE course_id=courses.id AND status='active')`);
  }

  flushItems();

  console.log('\n════ 导入完成 ════');
  console.log(`  batch_key:          ${BATCH_KEY}`);
  console.log(`  学生:    新建 ${newStu}，已存在 ${reuseStu}`);
  console.log(`  教室:    ${Object.keys(classroomMap).length}`);
  console.log(`  课程:    ${Object.keys(courseIdMap).length}`);
  console.log(`  选课记录:${enr}`);
  console.log(`  科目报读:${se}`);
  console.log(`  考试场次:${sit}`);
  console.log(`  batch_items 追踪行: ${items.length}`);
  if (DRY_RUN) console.log('\n【DRY-RUN】未写库');
  else {
    console.log('\n✅ 数据已持久化，batch 可通过 rollback 脚本回滚：');
    console.log(`     node scripts/rollback-course-matrix.js --batch-key=${BATCH_KEY}`);
  }
}

main().catch(e => { console.error('\n❌ 导入失败:', e); process.exit(1); });
