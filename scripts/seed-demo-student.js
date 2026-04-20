/**
 * scripts/seed-demo-student.js
 *
 * 一次性创建一名内容丰富的"demo 学生"(李思远_DEMO)，
 * 供 AI Agent / AI 文书 / AI 面试题 / AI 规划 等功能做测试。
 *
 * 幂等：按学生 name 查是否已存在；settings flag 'demo_student_seeded_v1' 门槛。
 * 落地数据覆盖：profile + 2 位家长 + 5 门课 + 10 场考试 + 8 任务 +
 *              5 申请 + 5 目标院校 + 5 沟通记录 + 3 反馈 +
 *              完整 PS + 3 位导师 + 4 项活动 + 3 项奖项 + 5 项材料。
 */
'use strict';

function seedDemoStudent(db, uuidv4) {
  try {
    const done = db.get("SELECT value FROM settings WHERE key='demo_student_seeded_v1'");
    if (done) return false;
  } catch(e) { /* settings 表可能还没建，忽略 */ }

  const DEMO_NAME = '李思远_DEMO';
  const existing = db.get("SELECT id FROM students WHERE name=?", [DEMO_NAME]);
  if (existing) {
    try { db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_student_seeded_v1', ?)", [new Date().toISOString()]); } catch(e) {}
    return false;
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const daysFromNow = (n) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  // ─── 1. 学生档案 ──────────────────────────────────────
  const sid = uuidv4();
  db.run(`INSERT INTO students (id, name, grade_level, exam_board, date_of_birth, gender, nationality,
          phone, email, wechat, address, current_school, target_countries, target_major, enrol_date,
          status, notes, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'active', ?, ?, ?)`,
    [sid, DEMO_NAME, 'G11', 'A-Level (Edexcel)', '2008-05-20', '男', '中国',
     '13811112222', 'siyuan.li.demo@example.com', 'lisiyuan_demo', '上海市浦东新区示范路 1 号',
     'ESIC 国际学校', 'UK,SG', 'Computer Science + Mathematics', '2024-09-01',
     '[DEMO 账号] 用于测试 AI Agent / 文书批改 / 面试题等功能。可安全删除。', now, now]);
  console.log(`[demo-student] ✅ 创建学生: ${DEMO_NAME} (${sid})`);

  // ─── 2. 家长（2 位） ──────────────────────────────────
  const parents = [
    { name: '李志强', relation: '父', phone: '13812345678', email: 'lizhiqiang.demo@example.com', wechat: 'li_zhiqiang_demo' },
    { name: '陈敏',   relation: '母', phone: '13987654321', email: 'chenmin.demo@example.com',     wechat: 'chen_min_demo' },
  ];
  for (const p of parents) {
    const pid = uuidv4();
    db.run(`INSERT INTO parent_guardians (id, name, relation, phone, email, wechat) VALUES (?,?,?,?,?,?)`,
      [pid, p.name, p.relation, p.phone, p.email, p.wechat]);
    db.run(`INSERT INTO student_parents (student_id, parent_id) VALUES (?, ?)`, [sid, pid]);
  }

  // ─── 3. 选课 + 科目报读（基于已有 courses 表） ─────────
  // 只选确实存在的 courses；code 不存在会被跳过，不影响整体
  const wantCourses = ['EDX_Math', 'EDX_FMath', 'IAL27M_Phy', 'IAL27_CS', 'IAL_IELTS'];
  let courseCount = 0;
  for (const code of wantCourses) {
    const c = db.get(`SELECT id, subject_id FROM courses WHERE code=?`, [code]);
    if (!c) continue;
    const ceId = uuidv4();
    try {
      db.run(`INSERT INTO course_enrollments (id, course_id, student_id, status) VALUES (?,?,?, 'active')`,
        [ceId, c.id, sid]);
      courseCount++;
    } catch(e) {}
    // 同步 subject_enrollments（便于 PS 自动补科目标签）
    if (c.subject_id) {
      try {
        db.run(`INSERT INTO subject_enrollments (id, student_id, subject_id, level, exam_board)
                VALUES (?,?,?,?,?)`, [uuidv4(), sid, c.subject_id, 'A2', 'Edexcel IAL']);
      } catch(e) {}
    }
  }
  console.log(`[demo-student] 选课 ${courseCount}/${wantCourses.length} 门`);

  // ─── 4. 考试场次 (10 条：混合预测分+实际分，2 年跨度） ──
  const sittings = [
    // 2025 AS 年份考试（已出分）
    { board:'Edexcel', series:'May/June', year:2025, subject:'Mathematics', code:'WMA11', component:'AS P1', predicted:'A', actual:'A',  date:'2025-05-15', status:'result_received' },
    { board:'Edexcel', series:'May/June', year:2025, subject:'Mathematics', code:'WMA12', component:'AS P2', predicted:'A', actual:'A*', date:'2025-05-22', status:'result_received' },
    { board:'Edexcel', series:'May/June', year:2025, subject:'Further Mathematics', code:'WFM01', component:'AS FP1', predicted:'A', actual:'A',  date:'2025-06-01', status:'result_received' },
    { board:'Edexcel', series:'May/June', year:2025, subject:'Physics',      code:'WPH11', component:'AS P1', predicted:'B', actual:'B', date:'2025-05-20', status:'result_received' },
    { board:'Edexcel', series:'May/June', year:2025, subject:'Physics',      code:'WPH12', component:'AS P2', predicted:'B', actual:'C', date:'2025-05-27', status:'result_received' }, // 预测 vs 实际有差距（用来演示 AI 识别风险）
    // 2026 A2（预测 only — 尚未考）
    { board:'Edexcel', series:'May/June', year:2026, subject:'Mathematics', code:'WMA13', component:'A2 P3', predicted:'A*', actual:null, date:'2026-05-18', status:'registered' },
    { board:'Edexcel', series:'May/June', year:2026, subject:'Mathematics', code:'WMA14', component:'A2 P4', predicted:'A*', actual:null, date:'2026-05-28', status:'registered' },
    { board:'Edexcel', series:'May/June', year:2026, subject:'Further Mathematics', code:'WFM02', component:'A2 FP2', predicted:'A', actual:null, date:'2026-06-05', status:'registered' },
    { board:'Edexcel', series:'May/June', year:2026, subject:'Physics',      code:'WPH13', component:'A2 P3', predicted:'A', actual:null, date:'2026-05-25', status:'registered' },
    // IELTS
    { board:'IELTS', series:'Special', year:2025, subject:'English (IELTS)', code:'IELTS', component:'Overall', predicted:null, actual:'7.5', date:'2025-11-10', status:'result_received' },
  ];
  for (const s of sittings) {
    db.run(`INSERT INTO exam_sittings (id, student_id, exam_board, series, year, subject, subject_code,
            component, sitting_date, predicted_grade, actual_grade, status, is_resit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [uuidv4(), sid, s.board, s.series, s.year, s.subject, s.code, s.component,
       s.date, s.predicted, s.actual, s.status]);
  }
  console.log(`[demo-student] 考试场次 ${sittings.length} 条`);

  // ─── 5. 任务 (8 条，多状态) ──────────────────────────
  const tasks = [
    { title:'提交 UCAS 预注册信息', desc:'在 UCAS 官网完成预注册，包括学校代码和个人信息',
      category:'申请', priority:'high', due_date: daysFromNow(-5), status:'done' },
    { title:'完成 PS 初稿',        desc:'个人陈述 4000 字初稿，按 q1/q2/q3 三段格式',
      category:'文书', priority:'high', due_date: daysFromNow(-2), status:'done' },
    { title:'准备 Cambridge CSAT 模拟题', desc:'完成 3 套官方历年真题并批改',
      category:'考试', priority:'high', due_date: daysFromNow(3),  status:'in_progress' },
    { title:'联系 MIT 校友做推荐信背书', desc:'通过校友网络获取 2 封有分量的 LOR',
      category:'沟通', priority:'normal', due_date: daysFromNow(7), status:'pending' },
    { title:'完成 TMUA 报名缴费',        desc:'12 月前在 CAAT 官网完成 TMUA 报名',
      category:'考试', priority:'high', due_date: daysFromNow(12), status:'pending' },
    { title:'上传护照复印件',             desc:'扫描件上传至材料系统，注意清晰度',
      category:'材料', priority:'normal', due_date: daysFromNow(-8), status:'done' },
    { title:'面试模拟 × 3',              desc:'针对牛剑 CS 方向做 3 次模拟面试并复盘',
      category:'面试', priority:'normal', due_date: daysFromNow(20), status:'pending' },
    { title:'拍摄大学申请证件照',         desc:'去专业照相馆拍 2 寸白底证件照',
      category:'材料', priority:'low',    due_date: daysFromNow(-15), status:'blocked' }, // 逾期 + 卡住 → AI 可识别风险
  ];
  for (const t of tasks) {
    db.run(`INSERT INTO milestone_tasks (id, student_id, title, description, category, priority,
            due_date, status, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), sid, t.title, t.desc, t.category, t.priority, t.due_date, t.status, now, now]);
  }
  console.log(`[demo-student] 任务 ${tasks.length} 条（含 1 逾期 / 1 阻塞）`);

  // ─── 6. 目标院校 + 申请 ─────────────────────────────
  const targets = [
    { uni:'Cambridge',    tier:'冲刺', dept:'Computer Science',              rank:1 },
    { uni:'Oxford',       tier:'冲刺', dept:'Mathematics and Computer Science', rank:2 },
    { uni:'Imperial College London', tier:'意向', dept:'Computing',          rank:3 },
    { uni:'UCL',          tier:'意向', dept:'Computer Science',              rank:4 },
    { uni:'Edinburgh',    tier:'保底', dept:'Informatics',                   rank:5 },
  ];
  const uniIdOf = {};
  for (const t of targets) {
    let uni = db.get(`SELECT id FROM universities WHERE name=?`, [t.uni]);
    let uid = uni?.id;
    if (!uid) {
      uid = uuidv4();
      try { db.run(`INSERT INTO universities (id, name) VALUES (?, ?)`, [uid, t.uni]); } catch(e) {}
    }
    uniIdOf[t.uni] = uid;
    db.run(`INSERT INTO target_uni_lists (id, student_id, university_id, uni_name, tier, priority_rank, department, rationale, created_at)
            VALUES (?,?,?,?,?,?,?,?, ?)`,
      [uuidv4(), sid, uid, t.uni, t.tier, t.rank, t.dept,
       `基于 AS 成绩 + FM 经验，${t.uni} ${t.dept} 是合理选择。`, now]);
  }
  // 申请（复用 targets）
  const apps = [
    { uni:'Cambridge',     dept:'Computer Science',                 tier:'冲刺', status:'applied',     deadline:'2026-10-15', route:'UK-UG' },
    { uni:'Oxford',        dept:'Mathematics and Computer Science', tier:'冲刺', status:'applied',     deadline:'2026-10-15', route:'UK-UG' },
    { uni:'Imperial College London', dept:'Computing',              tier:'意向', status:'pending',    deadline:'2026-01-31', route:'UK-UG' },
    { uni:'UCL',           dept:'Computer Science',                 tier:'意向', status:'offer',      deadline:'2026-01-31', route:'UK-UG' },
    { uni:'Edinburgh',     dept:'Informatics',                      tier:'保底', status:'conditional_offer', deadline:'2026-01-31', route:'UK-UG' },
  ];
  for (const a of apps) {
    db.run(`INSERT INTO applications (id, student_id, university_id, uni_name, department, tier, route,
            status, submit_deadline, notes, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), sid, uniIdOf[a.uni], a.uni, a.dept, a.tier, a.route, a.status,
       a.deadline, `DEMO 申请数据 · ${a.tier} ${a.uni}`, now, now]);
  }
  console.log(`[demo-student] 目标 ${targets.length} / 申请 ${apps.length}`);

  // ─── 7. 沟通记录 (5 条) ─────────────────────────────
  const comms = [
    { channel:'面谈',   date:'2025-10-05', summary:'[入学面谈] 初次了解学生背景与目标；家长对 CS 方向认可度高',
      actions:'1. 完成选课确认；2. 确定考试报名时间表' },
    { channel:'电话',   date:'2025-11-20', summary:'[阶段反馈] AS 成绩出分后与家长电话沟通，物理 C 略低于预期',
      actions:'计划物理一对一辅导每周 2h' },
    { channel:'微信',   date:'2025-12-15', summary:'[PS 讨论] 发送 PS 大纲给学生，收到反馈后修订',
      actions:'3 天内完成第二稿' },
    { channel:'邮件',   date:'2026-01-08', summary:'[申请进度] 向家长通报已提交 Oxbridge 申请，UCL 收到 Offer',
      actions:'等待 Oxbridge 面试邀请' },
    { channel:'面谈',   date:'2026-03-12', summary:'[面试筹备] 与学生就牛剑面试方向复盘，演练 3 道经典题',
      actions:'每周安排 2 次模拟面试' },
  ];
  for (const c of comms) {
    db.run(`INSERT INTO communication_logs (id, student_id, channel, summary, action_items, comm_date, created_at)
            VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), sid, c.channel, c.summary, c.actions, c.date, now]);
  }
  console.log(`[demo-student] 沟通记录 ${comms.length} 条`);

  // ─── 8. 反馈 (3 条) ──────────────────────────────────
  const feedbacks = [
    { from:'parent',  type:'满意度', rating:5, content:'规划师响应很及时，对孩子的学业规划非常到位',   status:'reviewed' },
    { from:'student', type:'阶段反馈', rating:4, content:'物理压力较大，希望增加练习量',                   status:'resolved' },
    { from:'mentor',  type:'建议',    rating:null, content:'学生数学能力很强，建议冲击 Cambridge CS', status:'reviewed' },
  ];
  for (const f of feedbacks) {
    db.run(`INSERT INTO feedback (id, student_id, from_role, feedback_type, rating, content, status, created_at)
            VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), sid, f.from, f.type, f.rating, f.content, f.status, now]);
  }
  console.log(`[demo-student] 反馈 ${feedbacks.length} 条`);

  // ─── 9. 个人陈述 (q1/q2/q3) ──────────────────────────
  const q1 = `计算机对我而言不只是工具，而是理解世界的一种新的语言。初二那年我用 Python 写出第一个能下棋的小程序，看着它在屏幕上与我对弈，我第一次意识到：**抽象的规则居然可以被翻译成动态的行为**。从那之后我痴迷于算法与数学的交界——从 Dijkstra 到 PageRank 的转译，从最大流最小割到线性规划的对偶，每一个证明都像一扇门，打开后是更深的问题空间。

我特别被 automata 和 complexity theory 吸引：为什么某些问题 P，某些只能 NP？halting problem 告诉我们无论算力多强都有一些问题永远无法判定，这种计算的"天花板"让人着迷。我阅读了 Sipser 的《Introduction to the Theory of Computation》前 7 章，并尝试用自己的话向同学解释 pumping lemma。正是在反复讲解中我意识到：真正理解一个定理，是能把它拆成高中生听得懂的故事。这也是我选择计算机科学的深层动力——我想把这种"抽象被翻译成可理解之物"的乐趣带给更多人。`;
  const q2 = `在 A-Level Mathematics 和 Further Mathematics 的学习中，我尝试把教材之外的工具融入解题：用 LaTeX 写下所有 proof，用 Mathematica 验证极限，用 Python 绘制动态图像来感受 Fourier 级数如何逼近方波。这些额外工具让我跳出了"会做题"的层面，进入"理解为什么"的阶段。我的 AS Math P1 (A*) 和 Further Math FP1 (A) 反映了这份投入。

物理学让我意识到抽象数学必须落地到可观测现象。虽然我的 AS Physics P2 只拿了 C，但正是那份失落让我重新审视：我习惯用数学直觉替代实验直觉。我开始每周三次 self-lab，重做真题中的实验题并对着教材的 "common pitfalls" 校准，两个月后 mock 考从 58 分升到 79 分。这次失败教会我：**学习的起点从来不是天赋，而是诚实面对数据**。

此外我完成了 MIT OCW 的 6.006 (Introduction to Algorithms) 前 12 个 lecture，并独立实现了 segment tree + lazy propagation，成功通过了 Codeforces Div 2 题库里的 50 道问题。`;
  const q3 = `过去两年我担任学校计算机社的社长，组织了 3 届校内编程大赛，参赛人数从 8 人涨到 42 人。最令我自豪的不是扩大规模，而是亲手写了一份 "**从 HelloWorld 到 BFS**" 的入门教程，帮助一名从未写过代码的高一女生最终拿到大赛第三名。

我也是志愿者组织 "Code for Kids" 的核心成员，每周六去附近的社区中心免费教小学生 Scratch 和简易 Python。三学期下来教过 27 个孩子；其中两个孩子自己在家完成了猜数字游戏，并把截图发给我——那一刻比任何比赛奖牌都让我激动。

在学术之外我坚持阅读非虚构作品：从 Cathy O'Neil 的 *Weapons of Math Destruction* 到 Byung-Chul Han 的 *The Burnout Society*。这些书让我意识到：技术从不中性，算法是有立场的。我想去 ${'{your university}'} 学 CS，不是为了成为工程师，而是为了成为**一个既能写代码又能质疑代码**的人。`;

  const psId = uuidv4();
  const wordCount = (q1 + q2 + q3).trim().split(/\s+/).length;
  db.run(`INSERT INTO personal_statements (id, student_id, version, status, q1_content, q2_content, q3_content,
          word_count, char_count, created_at, updated_at)
          VALUES (?, ?, 2, '一审中', ?, ?, ?, ?, ?, ?, ?)`,
    [psId, sid, q1, q2, q3, wordCount, (q1+q2+q3).length, now, now]);
  console.log(`[demo-student] 个人陈述 (v2, ${wordCount} 字)`);

  // ─── 10. 导师团队 (复用已有 staff) ─────────────────
  const mentorTargets = [
    { staff_name: 'Xu Junjie',   role: '数学导师' },
    { staff_name: 'Cui Yanjie',  role: '物理导师' },
    { staff_name: 'Yao Kexiang', role: '升学规划师' },
  ];
  let mentorCount = 0;
  for (const m of mentorTargets) {
    const st = db.get(`SELECT id FROM staff WHERE name=?`, [m.staff_name]);
    if (!st) continue;
    db.run(`INSERT INTO mentor_assignments (id, student_id, staff_id, role, start_date, notes)
            VALUES (?,?,?,?,?,?)`,
      [uuidv4(), sid, st.id, m.role, today, '由 demo 种子脚本自动分配']);
    mentorCount++;
  }
  console.log(`[demo-student] 导师 ${mentorCount}/${mentorTargets.length}`);

  // ─── 11. 活动 + 奖项 + 荣誉（表可能不存在则 skip） ─
  const activities = [
    { type:'领导力', title:'学校计算机社社长', org:'ESIC 国际学校', role:'社长', start:'2024-09-01', end:null, hours:4, desc:'组织校内编程赛、每周社团活动' },
    { type:'志愿服务', title:'Code for Kids 志愿者', org:'社区青少年中心', role:'小学生编程导师', start:'2024-10-01', end:null, hours:3, desc:'每周教小学生 Scratch 和 Python 基础' },
    { type:'学术', title:'Codeforces 竞赛', org:'Codeforces', role:'参赛者', start:'2024-06-01', end:'2025-12-01', hours:5, desc:'完成 50+ Div 2 题目' },
    { type:'学术', title:'MIT OCW 6.006 自学', org:'MIT OpenCourseWare', role:'自学者', start:'2025-03-01', end:'2025-08-01', hours:6, desc:'完成前 12 讲 + 独立实现 segment tree' },
  ];
  let actCount = 0;
  for (const a of activities) {
    try {
      db.run(`INSERT INTO student_activities (id, student_id, activity_type, title, organization, role, start_date, end_date, hours_per_week, description)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), sid, a.type, a.title, a.org, a.role, a.start, a.end, a.hours, a.desc]);
      actCount++;
    } catch(e) {}
  }

  const awards = [
    { title:'2024 全国青少年编程大赛 二等奖',  level:'国家级', issuer:'中国计算机学会', date:'2024-11-15', desc:'算法设计组' },
    { title:'2025 AMC 12 Distinction',       level:'国际级', issuer:'Mathematical Association of America', date:'2025-02-20', desc:'' },
    { title:'校级数学竞赛 一等奖',            level:'校级',  issuer:'ESIC 国际学校', date:'2025-05-10', desc:'' },
  ];
  let awardCount = 0;
  for (const a of awards) {
    try {
      db.run(`INSERT INTO student_awards (id, student_id, title, level, issuer, award_date, description)
              VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(), sid, a.title, a.level, a.issuer, a.date, a.desc]);
      awardCount++;
    } catch(e) {}
  }
  console.log(`[demo-student] 活动 ${actCount}/${activities.length} · 奖项 ${awardCount}/${awards.length}`);

  // ─── 12. 材料（关联到申请） ─────────────────────────
  const anyApp = db.get(`SELECT id FROM applications WHERE student_id=? LIMIT 1`, [sid]);
  if (anyApp) {
    const materials = [
      { title:'护照扫描件',     type:'identity', status:'已上传' },
      { title:'成绩单（AS）',   type:'transcript', status:'已上传' },
      { title:'PS 定稿',        type:'essay', status:'审核中' },
      { title:'推荐信 × 2',     type:'reference', status:'待提交' },
      { title:'英语成绩证明',   type:'language', status:'已上传' },
    ];
    for (const m of materials) {
      try {
        db.run(`INSERT INTO material_items (id, application_id, title, material_type, status, created_at)
                VALUES (?,?,?,?,?,?)`,
          [uuidv4(), anyApp.id, m.title, m.type, m.status, now]);
      } catch(e) {}
    }
    console.log(`[demo-student] 材料 ${materials.length} 条（挂到 Cambridge/首个申请）`);
  }

  // ─── 标记完成 ──────────────────────────────────────
  try { db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_student_seeded_v1', ?)", [now]); } catch(e) {}
  try { if (db.save) db.save(); } catch(e) {}
  console.log(`[demo-student] ✅ 全部完成：${DEMO_NAME}  id=${sid}`);
  return true;
}

module.exports = seedDemoStudent;
