/**
 * scripts/assign-teacher-mentors.js
 *
 * 给每个学生把其所有任课老师分配为"导师"(role='学科导师')。
 * 数据源：course_enrollments ⋈ course_staff (学生选了哪些课 → 这些课的老师)
 * 去重：mentor_assignments(student_id, staff_id, role) 相同则跳过
 *
 * 用法：
 *   node scripts/assign-teacher-mentors.js --dry-run    # 预演
 *   node scripts/assign-teacher-mentors.js              # 正式写库
 */
'use strict';
const { v4: uuidv4 } = require('uuid');
const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
  const db = require('../db.js');
  await db.init();

  const today = new Date().toISOString().slice(0,10);

  // 每生→所有任课老师（unique）
  const rows = db.all(`
    SELECT DISTINCT
           ce.student_id AS student_id,
           s.name        AS student_name,
           cs.staff_id   AS staff_id,
           st.name       AS staff_name
    FROM course_enrollments ce
    JOIN students s   ON s.id = ce.student_id
    JOIN course_staff cs ON cs.course_id = ce.course_id
    JOIN staff st     ON st.id = cs.staff_id
    WHERE ce.status='active'
    ORDER BY s.name, st.name
  `);

  console.log(`\n═══ 学科导师分配 ═══`);
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log(`学生×老师 候选: ${rows.length}\n`);

  let created = 0, dup = 0;
  const byStudent = new Map();
  for (const r of rows) {
    const existing = db.get(
      `SELECT id FROM mentor_assignments WHERE student_id=? AND staff_id=? AND role=?`,
      [r.student_id, r.staff_id, '学科导师']
    );
    if (existing) { dup++; continue; }

    if (!DRY_RUN) {
      db.run(`INSERT INTO mentor_assignments (id, student_id, staff_id, role, start_date, notes)
              VALUES (?,?,?,?,?,?)`,
        [uuidv4(), r.student_id, r.staff_id, '学科导师', today, '由任课老师自动分配']);
    }
    created++;
    if (!byStudent.has(r.student_name)) byStudent.set(r.student_name, []);
    byStudent.get(r.student_name).push(r.staff_name);
  }

  if (!DRY_RUN) db.save();

  console.log(`[结果]`);
  console.log(`  新建:  ${created}`);
  console.log(`  已存在跳过: ${dup}`);
  console.log(`  涉及学生: ${byStudent.size}`);
  if (byStudent.size > 0 && byStudent.size <= 50) {
    console.log(`\n  ✓ 明细（学生 → 老师们）：`);
    for (const [stu, teachers] of [...byStudent].sort((a,b)=>a[0].localeCompare(b[0]))) {
      console.log(`    ${stu.padEnd(20)} ← ${teachers.join(' / ')}`);
    }
  }
  console.log(DRY_RUN ? `\n⚠️ DRY_RUN — 未实际写库\n` : `\n✅ 已写库\n`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
