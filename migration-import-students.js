/**
 * 一次性迁移：删除测试学生（保留苏瑶），导入真实学生名单
 * 通过 settings 表标记已执行，不会重复运行
 */

function runMigration(db, uuidv4) {
  // 检查是否已执行
  const done = db.get("SELECT value FROM settings WHERE key='migration_import_real_students'");
  if (done) return false;

  const KEEP_IDS = [
    'edee7ca2-1101-4306-bccf-1d93e659cd3e', // 苏瑶
    'edee7ca2-2202-4306-bccf-2d93e659cd3e', // 林子轩
  ];
  const now = new Date().toISOString();

  // ═══ Step 1: 删除除苏瑶和林子轩外的所有测试学生 ═══
  const placeholders = KEEP_IDS.map(() => '?').join(',');
  const toDelete = db.all(`SELECT id, name FROM students WHERE id NOT IN (${placeholders})`, KEEP_IDS);
  console.log(`[migration] 删除 ${toDelete.length} 名测试学生`);

  const relatedTables = [
    'mentor_assignments', 'milestone_tasks', 'applications', 'target_uni_lists',
    'subject_enrollments', 'material_items', 'communication_logs', 'feedback',
    'essays', 'admission_assessments'
  ];

  for (const s of toDelete) {
    for (const tbl of relatedTables) {
      try { db.run(`DELETE FROM ${tbl} WHERE student_id=?`, [s.id]); } catch(e) {}
    }
    try { db.run('DELETE FROM admission_evaluations WHERE student_id=?', [s.id]); } catch(e) {}
    const parentLinks = db.all('SELECT parent_id FROM student_parents WHERE student_id=?', [s.id]);
    db.run('DELETE FROM student_parents WHERE student_id=?', [s.id]);
    for (const pl of parentLinks) {
      const other = db.get('SELECT 1 FROM student_parents WHERE parent_id=?', [pl.parent_id]);
      if (!other) db.run('DELETE FROM parent_guardians WHERE id=?', [pl.parent_id]);
    }
    db.run('DELETE FROM users WHERE linked_id=? AND role="student"', [s.id]);
    try { db.run('DELETE FROM intake_cases WHERE student_id=?', [s.id]); } catch(e) {}
    db.run('DELETE FROM students WHERE id=?', [s.id]);
  }

  // ═══ Step 2: 导入学生 ═══
  const students = [
    // 新生 - O Level → G10
    { name: 'Wang Zhangxin', grade: 'G10', board: 'O-Level', dob: '2011-09-10' },
    { name: 'Liu Sixuan', grade: 'G10', board: 'O-Level', dob: '2009-04-09' },
    { name: 'Hein Htet Naing', grade: 'G10', board: 'O-Level', dob: '2006-12-08' },
    { name: 'Mu Ge', grade: 'G10', board: 'O-Level', dob: '2009-01-21' },
    { name: 'Wang Chenxu', grade: 'G10', board: 'O-Level', dob: '2009-12-29' },
    { name: 'Wang Chenyu', grade: 'G10', board: 'O-Level', dob: '2009-12-29' },
    // 新生 - A Level → G11
    { name: 'Kong Fanjin', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2007-12-06' },
    { name: 'Yan Jinnuo', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2010-03-28' },
    { name: 'Li Mingyang', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2007-09-25' },
    { name: 'Lei Zerui', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2009-03-20' },
    { name: 'Zhu Zhenhao', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2009-02-03' },
    { name: 'Li Chun', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2009-10-03' },
    { name: 'Mao Silin', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2008-05-02' },
    { name: 'Wang Yaoxing', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2008-06-06' },
    { name: 'Ye Shurui', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2008-08-30' },
    { name: 'Tian Chang', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2007-11-26' },
    { name: 'Tian Shuo', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2007-11-26' },
    { name: 'Niu Xinglin', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2006-08-27' },
    { name: 'Lin Yinjia', grade: 'G11', board: 'A-Level (CIE)', dob: '2007-12-06' },
    { name: 'Zheng Jingxi', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2008-05-02' },
    { name: 'Zheng Xiyu', grade: 'G11', board: 'A-Level (Edexcel)', dob: '2008-05-02' },
    // 老生 - A Level → G12
    { name: 'Yang Tong', grade: 'G12', board: 'A-Level', dob: '2007-01-29' },
    { name: 'Yang Chenshuo', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2008-03-25' },
    { name: 'Li Jiayan', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2007-06-21' },
    { name: 'Jiang Xinyu', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2007-05-16' },
    { name: 'Zhang Yimeng', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2007-01-01' },
    { name: 'Su Yiying', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2006-09-18' },
    { name: 'Huang Yutai', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2008-07-12' },
    { name: 'Chen Jiaen', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2008-04-08', notes: 'DP学生' },
    { name: 'Jia Deshi', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2006-11-18' },
    { name: 'Zheng Ruishang', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2005-12-07', notes: 'DP学生' },
    { name: 'Zhong Ruitao', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2008-06-07' },
    { name: 'Liu Yijia', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2007-02-22' },
    { name: 'Wang Ziliang', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2008-08-16' },
    { name: 'Zhou Siyuan', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2008-02-17' },
    { name: 'Lu Xinnan', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2008-04-18' },
    { name: 'Zhuang Ziyue', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2006-08-23' },
    { name: 'Cai Qingdou', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2007-11-29', notes: 'DP学生' },
    { name: 'Zhou Zixin', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2009-08-10' },
    { name: 'Liu Yicun', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2008-05-16', notes: 'DP学生' },
    { name: 'Zhang Yiteng', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2007-01-04' },
    { name: 'Wang Qianpeng', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2006-03-18' },
    { name: 'Yan Wenhan', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2009-04-03' },
    { name: 'Li Yongxuan', grade: 'G12', board: 'A-Level (Edexcel)', dob: '2009-09-08' },
    // 老生 - O Level → G11
    { name: 'Fan Enhui', grade: 'G11', board: 'O-Level', dob: '2009-04-29' },
    { name: 'Yu Yaocheng', grade: 'G11', board: 'O-Level', dob: '2010-04-10' },
    { name: 'Yu Xiaoting', grade: 'G11', board: 'O-Level', dob: null },
    { name: 'Yu Xiaoping', grade: 'G11', board: 'O-Level', dob: null },
  ];

  let count = 0;
  for (const s of students) {
    const id = uuidv4();
    db.run(
      `INSERT INTO students (id, name, grade_level, exam_board, date_of_birth, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [id, s.name, s.grade, s.board, s.dob, s.notes || '', now, now]
    );
    count++;
  }

  // 标记已执行
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration_import_real_students', ?)", [now]);

  console.log(`[migration] 导入 ${count} 名真实学生完成`);
  return true;
}

module.exports = runMigration;
