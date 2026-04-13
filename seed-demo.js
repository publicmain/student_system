#!/usr/bin/env node
/**
 * seed-demo.js — 插入两位高仿真演示学生数据
 *
 * 可独立运行: node seed-demo.js
 * 也可从 db.js seedData() 调用: require('./seed-demo').seedDemo(db)
 *
 * 学生 1: 苏瑶 (Sophie Su) — G12 CIE, 申请 UK + SG, 高分学霸, 多维数据丰富
 * 学生 2: 林子轩 (Jason Lin) — G12 Edexcel, 申请 UK + US, 有风险/逾期任务, 触发 AI 预警
 */

function seedDemo(db) {
  // 防止重复插入
  const existingDemo = db.get("SELECT id FROM students WHERE name='苏瑶' LIMIT 1");
  if (existingDemo) { return; }

  const { v4: uuid } = require('uuid');
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // ── 查找现有员工 ────────────────────────────────────────
  const counselor = db.get("SELECT id FROM staff WHERE role='counselor' LIMIT 1");
  const mentor    = db.get("SELECT id FROM staff WHERE role='mentor' LIMIT 1");
  if (!counselor || !mentor) { console.error('❌ 请先确保数据库中有 counselor 和 mentor 员工'); process.exit(1); }
  const cId = counselor.id;
  const mId = mentor.id;

  // ── 查找科目 ID ──────────────────────────────────────────
  const sub = (code) => db.get("SELECT id FROM subjects WHERE code=?", [code])?.id;
  const MATH = sub('MATH'), FMATH = sub('FMATH'), PHYS = sub('PHYS'), CHEM = sub('CHEM'),
        BIO = sub('BIO'), ECON = sub('ECON'), CS = sub('CS'), ENG = sub('ENG');

  // ── 查找或创建科目（如果缺失）─────────────────────────────
  function ensureSubject(code, name, cat) {
    let id = sub(code);
    if (!id) {
      id = uuid();
      db.run("INSERT INTO subjects VALUES (?,?,?,?)", [id, code, name, cat]);
    }
    return id;
  }
  const FMATH_ID = ensureSubject('FMATH', '高等数学 Further Mathematics', '理科');
  const BIO_ID   = ensureSubject('BIO',   '生物 Biology', '理科');
  const ECON_ID  = ensureSubject('ECON',  '经济 Economics', '文科');
  const CS_ID    = ensureSubject('CS',    '计算机 Computer Science', '理科');
  const PSYCH_ID = ensureSubject('PSYCH', '心理学 Psychology', '文科');

  // ════════════════════════════════════════════════════════
  //  学生 1: 苏瑶 Sophie Su — CIE G12, 目标: 牛剑生物 + NUS
  // ════════════════════════════════════════════════════════
  // BUG-F5: 使用固定 UUID，确保与 migration-import-students.js 中 KEEP_ID 一致
  const s1 = 'edee7ca2-1101-4306-bccf-1d93e659cd3e';
  db.run(`INSERT INTO students (id,name,grade_level,enrol_date,exam_board,status,date_of_birth,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    s1, '苏瑶', 'G12', '2023-09-01', 'CIE', 'active', '2007-03-15',
    '目标剑桥自然科学，学术能力突出，课外活动丰富。英国与新加坡双线申请。', now, now
  ]);

  // 学生用户 — 固定 UUID
  const s1UserId = 'a1b2c3d4-sophie-user-0001-000000000001';
  const bcrypt = require('bcryptjs');
  const hash = (pw) => bcrypt.hashSync(pw, 10);
  db.run("INSERT INTO users (id,username,password,role,linked_id,name,created_at) VALUES (?,?,?,?,?,?,?)", [
    s1UserId, 'sophie', hash('123456'), 'student', s1, '苏瑶', now
  ]);

  // 扩展档案
  db.run(`INSERT INTO student_profiles_ext (id,student_id,mbti,holland_code,academic_interests,career_goals,major_preferences,strengths,weaknesses,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, 'INTJ', 'RIA',
    '分子生物学、基因编辑、生物化学',
    '希望成为生物医学研究员，长期目标进入学术界或生物技术公司',
    '自然科学 Natural Sciences (Cambridge), 生物科学 Biological Sciences',
    '学术成绩顶尖、实验动手能力强、英语流利、自我驱动力高',
    '时间管理有时不够好、面试时容易紧张',
    'IGCSE 阶段全 A*，AS 阶段预测 4A，目标剑桥自然科学', now, now
  ]);

  // ── 家长 — 固定 UUID ─────────────────────────────────────
  const p1a = 'f5e6d7c8-parent-su-0001-000000000001';
  const p1b = 'f5e6d7c8-parent-su-0002-000000000002';
  db.run("INSERT INTO parent_guardians VALUES (?,?,?,?,?,?,?)", [
    p1a, '苏建国', '父', '13612345678', 'sujg@email.com', 'sujg_wechat', now
  ]);
  db.run("INSERT INTO parent_guardians VALUES (?,?,?,?,?,?,?)", [
    p1b, '王丽华', '母', '13712345678', 'wanglh@email.com', 'wanglh_wx', now
  ]);
  db.run("INSERT INTO student_parents VALUES (?,?)", [s1, p1a]);
  db.run("INSERT INTO student_parents VALUES (?,?)", [s1, p1b]);

  // 家长用户 — 固定 UUID
  const p1UserId = 'a1b2c3d4-parent-user-0001-000000000001';
  db.run("INSERT INTO users (id,username,password,role,linked_id,name,created_at) VALUES (?,?,?,?,?,?,?)", [
    p1UserId, 'su_parent', hash('123456'), 'parent', p1a, '苏建国', now
  ]);

  // 监护人同意
  db.run(`INSERT INTO guardian_consents (id,student_id,guardian_name,relation,consent_version,consent_scope,consented,consent_date,recorded_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, '苏建国', '父', '2.0',
    '["data_storage","counseling","sharing_external","photo_video"]',
    1, '2023-09-05', cId, now
  ]);

  // ── 导师分配 ─────────────────────────────────────────────
  db.run("INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)", [uuid(), s1, cId, '升学规划师', '2023-09-10', null, '主要负责人', now]);
  db.run("INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)", [uuid(), s1, mId, '导师', '2023-09-10', null, '', now]);

  // ── 选科 ─────────────────────────────────────────────────
  if (MATH)    db.run("INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)", [uuid(), s1, MATH,     'A2', 'CIE', now]);
  if (FMATH_ID) db.run("INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)", [uuid(), s1, FMATH_ID, 'A2', 'CIE', now]);
  if (CHEM)    db.run("INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)", [uuid(), s1, CHEM,     'A2', 'CIE', now]);
  if (BIO_ID)  db.run("INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)", [uuid(), s1, BIO_ID,   'A2', 'CIE', now]);

  // ── 入学评估 ─────────────────────────────────────────────
  db.run(`INSERT INTO admission_assessments (id,student_id,assess_date,assess_type,subject,score,max_score,percentile,sub_scores,target_score,next_test_date,next_target_score,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, '2023-09-08', '数学测评', '数学', 96.5, 100, 98, null, null, null, null, '逻辑推理与代数表现优秀', now
  ]);
  db.run(`INSERT INTO admission_assessments (id,student_id,assess_date,assess_type,subject,score,max_score,percentile,sub_scores,target_score,next_test_date,next_target_score,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, '2023-09-08', '英语测评', '英语', 88.0, 100, 85, null, null, null, null, '', now
  ]);
  db.run(`INSERT INTO admission_assessments (id,student_id,assess_date,assess_type,subject,score,max_score,percentile,sub_scores,target_score,next_test_date,next_target_score,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, '2024-06-20', '雅思 IELTS', '英语', 7.5, 9, 90,
    '{"listening":8.0,"reading":8.5,"writing":6.5,"speaking":7.0}',
    8.0, '2025-08-15', 8.0, '写作和口语需要提升', now
  ]);
  db.run(`INSERT INTO admission_assessments (id,student_id,assess_date,assess_type,subject,score,max_score,percentile,sub_scores,target_score,next_test_date,next_target_score,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, '2025-03-10', '雅思 IELTS', '英语', 8.0, 9, 95,
    '{"listening":8.5,"reading":9.0,"writing":7.0,"speaking":7.5}',
    null, null, null, '第二次雅思，写作提升到7.0，总分达标', now
  ]);

  // ── 考试记录 ─────────────────────────────────────────────
  // AS Level (已出分)
  const examData1 = [
    ['Mathematics', '9709', 'Paper 1+2', '2025-05-12', '2025-08-14', 'A', 'A', null, 'result_received'],
    ['Further Maths', '9231', 'Paper 1+2', '2025-05-14', '2025-08-14', 'A', 'A', null, 'result_received'],
    ['Chemistry', '9701', 'Paper 1+2', '2025-05-20', '2025-08-14', 'A', 'A', null, 'result_received'],
    ['Biology', '9700', 'Paper 1+2+3', '2025-05-22', '2025-08-14', 'A*', 'A*', null, 'result_received'],
  ];
  for (const [subj, code, comp, sDate, rDate, pred, actual, ums, status] of examData1) {
    db.run(`INSERT INTO exam_sittings (id,student_id,exam_board,series,year,subject,subject_code,component,sitting_date,results_date,predicted_grade,actual_grade,ums_score,status,is_resit,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      uuid(), s1, 'CIE', 'June', 2025, subj, code, comp, sDate, rDate, pred, actual, ums, status, 0, '', now, now
    ]);
  }
  // A2 Level (即将考试)
  const examData1A2 = [
    ['Mathematics', '9709', 'Paper 3+4', '2026-05-11', '2026-08-13', 'A*', null, null, 'registered'],
    ['Further Maths', '9231', 'Paper 3+4', '2026-05-13', '2026-08-13', 'A*', null, null, 'registered'],
    ['Chemistry', '9701', 'Paper 3+4+5', '2026-05-19', '2026-08-13', 'A*', null, null, 'registered'],
    ['Biology', '9700', 'Paper 3+4+5', '2026-05-21', '2026-08-13', 'A*', null, null, 'registered'],
  ];
  for (const [subj, code, comp, sDate, rDate, pred, actual, ums, status] of examData1A2) {
    db.run(`INSERT INTO exam_sittings (id,student_id,exam_board,series,year,subject,subject_code,component,sitting_date,results_date,predicted_grade,actual_grade,ums_score,status,is_resit,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      uuid(), s1, 'CIE', 'June', 2026, subj, code, comp, sDate, rDate, pred, actual, ums, status, 0, '', now, now
    ]);
  }

  // ── 大学 & 目标院校 ──────────────────────────────────────
  const uCambridge = uuid(), uICL = uuid(), uUCL = uuid(), uNUS = uuid(), uNTU = uuid();
  db.run("INSERT OR IGNORE INTO universities VALUES (?,?,?,?)", [uCambridge, '剑桥大学 University of Cambridge', 'UK', 'https://www.cam.ac.uk']);
  db.run("INSERT OR IGNORE INTO universities VALUES (?,?,?,?)", [uICL, '帝国理工学院 Imperial College London', 'UK', 'https://www.imperial.ac.uk']);
  db.run("INSERT OR IGNORE INTO universities VALUES (?,?,?,?)", [uUCL, '伦敦大学学院 University College London', 'UK', 'https://www.ucl.ac.uk']);
  db.run("INSERT OR IGNORE INTO universities VALUES (?,?,?,?)", [uNUS, '新加坡国立大学 NUS', 'SG', 'https://www.nus.edu.sg']);
  db.run("INSERT OR IGNORE INTO universities VALUES (?,?,?,?)", [uNTU, '南洋理工大学 NTU', 'SG', 'https://www.ntu.edu.sg']);

  db.run("INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)", [uuid(), s1, uCambridge, '剑桥大学', '冲刺', 1, 'Natural Sciences (Biological)', '学术成绩顶尖，实验经验丰富，BPHO/BBO竞赛获奖', now]);
  db.run("INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)", [uuid(), s1, uICL, '帝国理工学院', '冲刺', 2, 'Biochemistry', '生化方向强校，AS成绩匹配要求', now]);
  db.run("INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)", [uuid(), s1, uUCL, '伦敦大学学院', '意向', 3, 'Biomedical Sciences', '综合排名高，专业实力强', now]);
  db.run("INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)", [uuid(), s1, uNUS, '新加坡国立大学', '意向', 4, 'Life Sciences', '亚洲顶尖，靠近家庭，奖学金机会', now]);
  db.run("INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)", [uuid(), s1, uNTU, '南洋理工大学', '保底', 5, 'Biological Sciences', '保底选择，录取率较高', now]);

  // ── 申请 ─────────────────────────────────────────────────
  // App 1: Cambridge — applied, conditional offer received!
  const app1_1 = uuid();
  db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    app1_1, s1, uCambridge, '剑桥大学', 'Natural Sciences (Biological)', '冲刺', 2026, 'UK-UG',
    '2025-10-15', '2025-10-10', 'Predicted',
    '[]', '2026-01-15', 'Conditional',
    'A*A*A in Chemistry, Biology, Mathematics with A* in at least two sciences',
    1, 0, null, 'offer', '面试表现优秀，收到Conditional Offer', now, now
  ]);
  // UK extension
  db.run("INSERT INTO application_uk_ext VALUES (?,?,?,?,?,?,?)", [
    app1_1, 'SUO-2026-001234', 1, 'submitted', 0,
    'A*A*A (Chemistry, Biology, Mathematics)', null
  ]);

  // App 2: ICL — applied, waiting
  const app1_2 = uuid();
  db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    app1_2, s1, uICL, '帝国理工学院', 'Biochemistry', '冲刺', 2026, 'UK-UG',
    '2026-01-28', '2026-01-15', 'Predicted', '[]',
    null, 'Pending', null, 0, 0, null, 'applied', '已提交，等待回复', now, now
  ]);
  db.run("INSERT INTO application_uk_ext VALUES (?,?,?,?,?,?,?)", [
    app1_2, 'SUO-2026-001234', 2, 'submitted', 0, null, null
  ]);

  // App 3: UCL — offer, insurance choice
  const app1_3 = uuid();
  db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    app1_3, s1, uUCL, '伦敦大学学院', 'Biomedical Sciences', '意向', 2026, 'UK-UG',
    '2026-01-28', '2026-01-15', 'Predicted', '[]',
    '2026-02-20', 'Conditional', 'AAA including Chemistry and Biology',
    0, 1, null, 'offer', 'Insurance选择', now, now
  ]);
  db.run("INSERT INTO application_uk_ext VALUES (?,?,?,?,?,?,?)", [
    app1_3, 'SUO-2026-001234', 3, 'submitted', 0, null, 'AAA including Chemistry and Biology'
  ]);

  // App 4: NUS — applied
  const app1_4 = uuid();
  db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    app1_4, s1, uNUS, '新加坡国立大学', 'Life Sciences', '意向', 2026, 'SG',
    '2026-02-28', '2026-02-20', 'Predicted', '[]',
    null, 'Pending', null, 0, 0, null, 'applied', '已提交NUS网申', now, now
  ]);
  db.run("INSERT INTO application_sg_ext VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [
    app1_4, 'NUS Admissions Portal', 0, 0, null, 1, '2026-04-15', 'online', 0, null, 1
  ]);

  // App 5: NTU — pending (preparing)
  const app1_5 = uuid();
  db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    app1_5, s1, uNTU, '南洋理工大学', 'Biological Sciences', '保底', 2026, 'SG',
    '2026-03-15', null, null, '[]',
    null, 'Pending', null, 0, 0, null, 'pending', '准备中，尚未提交', now, now
  ]);

  // ── 个人陈述 ─────────────────────────────────────────────
  db.run(`INSERT INTO personal_statements (id,student_id,application_id,version,status,q1_content,q2_content,q3_content,word_count,char_count,reviewer_id,review_notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, app1_1, 3, '已提交',
    'My fascination with the natural world began when I observed mitosis under a microscope at age 14. The elegant choreography of cell division sparked a question that has driven my academic pursuits ever since: how do living systems achieve such extraordinary precision? This question led me to Cambridge Natural Sciences, where the interdisciplinary approach mirrors my own conviction that biology cannot be understood in isolation from chemistry and mathematics.',
    'My academic preparation has been rigorous and deliberate. Studying CIE A-Level Biology, Chemistry, Further Mathematics, and Mathematics has given me a strong quantitative foundation. Beyond the syllabus, I have independently explored molecular biology through reading "The Gene" by Siddhartha Mukherjee and research papers on CRISPR-Cas9 gene editing. My school laboratory project on enzyme kinetics, where I investigated the effect of competitive inhibitors on catalase activity, taught me the importance of experimental design and statistical analysis.',
    'Outside the classroom, I have pursued my passion for biology through meaningful engagement. As president of our school Biology Society, I organised a seminar series featuring guest speakers from local research institutions. I completed a two-week work experience placement at the Institute of Molecular and Cell Biology in Singapore, where I assisted with PCR protocols and gel electrophoresis. I also volunteer weekly at a community health clinic, which has reinforced my understanding of how fundamental science translates to real-world health outcomes.',
    590, 3420, cId,
    '第三版终稿，剑桥面试后微调了学科动机段落，增强了与Natural Sciences课程的关联性', now, now
  ]);

  // ── 文书 (Essay) ─────────────────────────────────────────
  const essay1 = uuid();
  db.run(`INSERT INTO essays (id,student_id,application_id,essay_type,title,prompt,word_limit,status,current_version,assigned_reviewer_id,review_deadline,strategy_notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    essay1, s1, app1_4, 'personal_statement', 'NUS Personal Statement',
    'Tell us about yourself and why you are interested in your chosen course at NUS.',
    800, 'review', 2, cId, '2026-02-10',
    '突出生物学研究经历和对亚洲科研环境的兴趣', now, now
  ]);
  db.run(`INSERT INTO essay_versions (id,essay_id,version_no,content,word_count,char_count,created_by,created_at,change_summary) VALUES (?,?,?,?,?,?,?,?,?)`, [
    uuid(), essay1, 1,
    'Growing up in a family that values both Eastern and Western education, I have developed a unique perspective on how science transcends cultural boundaries...',
    650, 3800, s1, '2026-01-15', '初稿'
  ]);
  db.run(`INSERT INTO essay_versions (id,essay_id,version_no,content,word_count,char_count,created_by,created_at,change_summary) VALUES (?,?,?,?,?,?,?,?,?)`, [
    uuid(), essay1, 2,
    'My passion for life sciences crystallised during a transformative work experience at Singapore Institute of Molecular and Cell Biology. Witnessing the intersection of computational biology and wet-lab research at NUS Faculty of Science...',
    780, 4500, s1, '2026-02-01', '加入新加坡实习经历，强化Why NUS'
  ]);
  // Essay annotation
  db.run(`INSERT INTO essay_annotations (id,essay_id,version_id,annotator_id,annotator_name,type,position_start,position_end,content,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), essay1, null, cId, '李老师', 'overall', null, null,
    '整体不错，建议增加对NUS Life Sciences curriculum特色的具体描述，比如提到他们的跨学科模块', 'open', now
  ]);

  // ── 素材库 ───────────────────────────────────────────────
  db.run(`INSERT INTO essay_materials (id,student_id,category,title,content,related_activity_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`, [
    uuid(), s1, '学术经历', '酶动力学实验项目',
    '在校内实验室独立完成了过氧化氢酶抑制动力学实验，使用Lineweaver-Burk图分析了竞争性抑制剂的效果。掌握了分光光度法和Michaelis-Menten方程的实际应用。结果在校内科学展获一等奖。',
    null, now, now
  ]);
  db.run(`INSERT INTO essay_materials (id,student_id,category,title,content,related_activity_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`, [
    uuid(), s1, '实习经历', '新加坡IMCB实习',
    '两周沉浸式实习，参与了癌症基因组学实验室的日常工作。学会了PCR、凝胶电泳、细胞培养基本操作。旁听了3场学术报告，对CRISPR在癌症治疗中的前沿应用有了更深的理解。',
    null, now, now
  ]);

  // ── 课外活动 ─────────────────────────────────────────────
  const act1_1 = uuid();
  db.run(`INSERT INTO student_activities (id,student_id,category,name,organization,role,start_date,end_date,hours_per_week,weeks_per_year,impact_level,description,achievements,related_major_tags,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    act1_1, s1, 'club_leadership', '生物社社长', '校生物学社 Biology Society', '社长 President',
    '2024-09-01', null, 4, 40, 'school',
    '创办了每月一次的学术讲座系列，邀请大学教授和研究员来校分享最新研究成果。组织了年度Bio Olympiad备赛小组，带领5名成员参加BBO竞赛。',
    '社团规模从12人增长到35人；组织了8场学术讲座',
    '["biology","natural_sciences"]', 1, now, now
  ]);
  db.run(`INSERT INTO student_activities (id,student_id,category,name,organization,role,start_date,end_date,hours_per_week,weeks_per_year,impact_level,description,achievements,related_major_tags,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, 'academic_competition', '英国生物奥林匹克 BBO', 'Royal Society of Biology', '参赛选手',
    '2025-01-15', '2025-03-20', 6, 12, 'national',
    '在学校生物老师指导下系统备赛，覆盖分子生物学、生态学、遗传学等领域。',
    'Silver Medal (Top 10%)',
    '["biology"]', 2, now, now
  ]);
  db.run(`INSERT INTO student_activities (id,student_id,category,name,organization,role,start_date,end_date,hours_per_week,weeks_per_year,impact_level,description,achievements,related_major_tags,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, 'research', 'IMCB 实习研究项目', 'Institute of Molecular and Cell Biology, A*STAR', '实习生',
    '2025-06-15', '2025-06-28', 40, 2, 'international',
    '在癌症基因组学实验室参与为期两周的沉浸式研究实习，学习PCR、凝胶电泳和细胞培养技术。',
    '独立完成了一个mini-project报告，获得导师推荐信',
    '["biology","biochemistry"]', 3, now, now
  ]);
  db.run(`INSERT INTO student_activities (id,student_id,category,name,organization,role,start_date,end_date,hours_per_week,weeks_per_year,impact_level,description,achievements,related_major_tags,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, 'volunteer', '社区健康诊所志愿者', '仁爱社区诊所', '志愿者',
    '2024-03-01', null, 3, 45, 'city',
    '每周在社区诊所协助基础健康检查和健康教育宣传，帮助老年患者理解基本医疗信息。',
    '累计服务超过130小时，获得年度优秀志愿者表彰',
    '["biomedical","public_health"]', 4, now, now
  ]);
  db.run(`INSERT INTO student_activities (id,student_id,category,name,organization,role,start_date,end_date,hours_per_week,weeks_per_year,impact_level,description,achievements,related_major_tags,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, 'sports', '校游泳队', '学校体育部', '队员',
    '2022-09-01', null, 5, 36, 'school',
    '参加校游泳队训练，主攻50米和100米自由泳。',
    '校际游泳比赛50米自由泳第三名',
    '[]', 5, now, now
  ]);

  // ── 荣誉奖项 ─────────────────────────────────────────────
  db.run(`INSERT INTO student_honors (id,student_id,activity_id,name,level,award_rank,award_date,description,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, null, 'BBO Silver Medal', 'national', 'Top 10%', '2025-03-20', '英国生物奥林匹克银牌，全国前10%', 1, now, now
  ]);
  db.run(`INSERT INTO student_honors (id,student_id,activity_id,name,level,award_rank,award_date,description,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, null, 'UKMT Senior Mathematical Challenge Gold', 'national', 'Gold', '2024-11-15', '英国高级数学挑战赛金奖', 2, now, now
  ]);
  db.run(`INSERT INTO student_honors (id,student_id,activity_id,name,level,award_rank,award_date,description,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, null, '校内科学展 一等奖', 'school', '一等奖', '2025-01-10', '酶动力学抑制实验获校内科学展一等奖', 3, now, now
  ]);
  db.run(`INSERT INTO student_honors (id,student_id,activity_id,name,level,award_rank,award_date,description,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, null, 'Cambridge Natural Sciences Interview Invitation', 'international', null, '2025-12-01', '获得剑桥自然科学面试邀请，1月确认Conditional Offer', 4, now, now
  ]);

  // ── 学生奖项 ─────────────────────────────────────────────
  db.run(`INSERT INTO student_awards (id,student_id,name,category,level,award_date,description,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, 'CIE Outstanding Cambridge Learner Award', '学术', 'international', '2025-09-01', 'Biology AS 全球最高分', 1, now, now
  ]);

  // ── 里程碑任务 ───────────────────────────────────────────
  const tasks1 = [
    // 已完成的
    [uuid(), s1, app1_1, '完成UCAS个人陈述终稿', 'Natural Sciences方向，已提交第三版', '材料', '2025-09-30', '2025-09-25 14:30:00', 'done', 'high', cId],
    [uuid(), s1, app1_1, '获取两封推荐信', '化学老师 + 生物老师', '材料', '2025-09-20', '2025-09-18 10:00:00', 'done', 'high', cId],
    [uuid(), s1, app1_1, '提交UCAS申请（剑桥）', '10/15截止', '申请', '2025-10-15', '2025-10-10 16:00:00', 'done', 'high', cId],
    [uuid(), s1, app1_1, '剑桥面试准备', '模拟面试3次', '面试', '2025-12-01', '2025-11-28 09:00:00', 'done', 'high', mId],
    [uuid(), s1, null, '雅思第二次考试', '目标总分8.0', '考试', '2025-03-10', '2025-03-10 08:00:00', 'done', 'high', cId],
    // 进行中
    [uuid(), s1, app1_4, 'NUS个人陈述修改', '根据老师反馈修改Why NUS段落', '材料', '2026-02-15', null, 'in_progress', 'high', cId],
    [uuid(), s1, app1_5, '准备NTU申请材料', '收集成绩单翻译件和推荐信', '材料', '2026-03-01', null, 'in_progress', 'normal', cId],
    // 待完成
    [uuid(), s1, app1_4, '关注NUS面试通知', '面试预计4月中旬', '面试', '2026-04-20', null, 'pending', 'high', cId],
    [uuid(), s1, null, 'A2大考复习计划执行', '化学和生物重点复习', '考试', '2026-05-10', null, 'pending', 'high', mId],
    [uuid(), s1, null, '确认Firm/Insurance选择', 'UCAS截止5月6日', '申请', '2026-05-06', null, 'pending', 'high', cId],
    // 逾期（用于触发AI风险）
    [uuid(), s1, app1_5, '提交NTU网申', '截止3月15日', '申请', '2026-03-15', null, 'pending', 'high', cId],
  ];
  for (const t of tasks1) {
    db.run(`INSERT INTO milestone_tasks (id,student_id,application_id,title,description,category,due_date,completed_at,status,priority,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...t, now, now]);
  }

  // ── 材料清单 ─────────────────────────────────────────────
  const mats1 = [
    [uuid(), s1, app1_1, '个人陈述', 'UCAS Personal Statement (Natural Sciences)', '已提交', 3, null, '三稿定稿已提交', cId, now, now],
    [uuid(), s1, app1_1, '推荐信', '化学老师推荐信 (Dr. Smith)', '已提交', 1, null, '', cId, now, now],
    [uuid(), s1, app1_1, '推荐信', '生物老师推荐信 (Ms. Chen)', '已提交', 1, null, '', cId, now, now],
    [uuid(), s1, app1_1, '成绩单', 'CIE AS Level 成绩单', '已提交', 1, null, '4A (Math A, FM A, Chem A, Bio A*)', cId, now, now],
    [uuid(), s1, app1_4, '个人陈述', 'NUS Personal Statement', '收集中', 2, null, '第二版审核中', cId, null, null],
    [uuid(), s1, app1_4, '成绩单', 'CIE AS Level 成绩单（NUS版）', '已上传', 1, null, '已翻译公证', null, null, null],
    [uuid(), s1, app1_4, '推荐信', 'NUS 推荐信', '收集中', 1, null, '等待老师提交', null, null, null],
    [uuid(), s1, app1_5, '个人陈述', 'NTU Personal Statement', '未开始', 0, null, '', null, null, null],
    [uuid(), s1, null, '活动证明', 'BBO Silver Medal 证书', '已审核', 1, null, '已扫描存档', cId, now, null],
    [uuid(), s1, null, '活动证明', 'IMCB实习证明 + 推荐信', '已审核', 1, null, '', cId, now, null],
    [uuid(), s1, null, '其他', '雅思成绩单 (8.0)', '已确认', 1, null, '', null, null, null],
  ];
  for (const m of mats1) {
    db.run(`INSERT INTO material_items (id,student_id,application_id,material_type,title,status,version,file_path,notes,reviewed_by,reviewed_at,submitted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...m, now, now]);
  }

  // ── 沟通记录 ─────────────────────────────────────────────
  const comms1 = [
    [uuid(), s1, cId, p1a, '面谈', '与苏瑶及父亲面谈，讨论剑桥自然科学申请策略。确认以Cambridge为Firm Choice，UCL为Insurance。NUS作为平行申请。家长完全支持。', '1.确认Firm/Insurance策略 2.准备NUS申请', '2026-01-20 10:00:00'],
    [uuid(), s1, cId, null, '微信', '苏瑶反馈NUS面试准备进展，已完成两轮模拟面试。建议她重点准备Why NUS和研究兴趣方面的问题。', '苏瑶自行练习NUS面试常见问题', '2026-03-25 15:30:00'],
    [uuid(), s1, mId, null, '微信', '与苏瑶讨论A2复习计划。数学和高数进度良好，化学有机合成部分需要加强。建议每周增加2小时化学复习。', '化学有机合成重点复习', '2026-03-20 11:00:00'],
    [uuid(), s1, cId, p1b, '电话', '与苏瑶母亲电话沟通剑桥Conditional Offer的条件要求，解释A*A*A的含义和达标策略。母亲表示会在家辅助督促复习。', '', '2026-02-05 16:00:00'],
    [uuid(), s1, cId, null, '邮件', '发送NTU申请材料清单给苏瑶，提醒3月15日截止。附上NTU Personal Statement写作指南。', '苏瑶准备NTU材料', '2026-02-28 09:00:00'],
  ];
  for (const c of comms1) {
    db.run("INSERT INTO communication_logs VALUES (?,?,?,?,?,?,?,?,?)", [...c, now]);
  }

  // ── 反馈 ─────────────────────────────────────────────────
  db.run("INSERT INTO feedback VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [
    uuid(), s1, 'parent', p1a, '满意度',
    '非常满意李老师的规划服务，从选校到个人陈述指导都非常专业。特别是在剑桥面试准备阶段，模拟面试环节对孩子帮助很大。建议后续可以增加家长参与的讲座。',
    5, 'reviewed', '感谢苏爸爸的肯定，我们会继续保持高质量服务。关于家长讲座的建议已转达校方。', cId, now, now
  ]);
  db.run("INSERT INTO feedback VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [
    uuid(), s1, 'student', s1, '阶段反馈',
    '最近在同时准备NUS申请和A2复习，感觉时间不太够用。NTU的申请还没开始写PS，有点焦虑。',
    3, 'pending', null, null, null, now
  ]);

  // ── 通知 ─────────────────────────────────────────────────
  db.run(`INSERT INTO notification_logs (id,student_id,task_id,type,trigger_days,title,message,target_role,target_user_id,is_read,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s1, null, 'deadline_reminder', -3, 'NTU申请截止提醒',
    '苏瑶的NTU申请将于3月15日截止，请尽快完成材料准备并提交。', 'counselor', null, 0, now
  ]);

  console.log(`✅ 学生 1: 苏瑶 (ID: ${s1}) 插入完成`);

  // ════════════════════════════════════════════════════════
  //  学生 2: 林子轩 Jason Lin — Edexcel G12, 申请 UK + US
  //  特点: 有风险、逾期任务多、成绩中等偏上、适合触发AI预警
  // ════════════════════════════════════════════════════════
  // BUG-F5: 固定 UUID
  const s2 = 'edee7ca2-2202-4306-bccf-2d93e659cd3e';
  db.run(`INSERT INTO students (id,name,grade_level,enrol_date,exam_board,status,date_of_birth,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    s2, '林子轩', 'G12', '2023-09-01', 'Edexcel', 'active', '2007-08-22',
    '理工方向，计算机科学兴趣浓厚。英美双申，时间管理需要加强。', now, now
  ]);

  // 学生用户 — 固定 UUID
  const s2UserId = 'a1b2c3d4-jason-user-0002-000000000002';
  db.run("INSERT INTO users (id,username,password,role,linked_id,name,created_at) VALUES (?,?,?,?,?,?,?)", [
    s2UserId, 'jason', hash('123456'), 'student', s2, '林子轩', now
  ]);

  // 扩展档案
  db.run(`INSERT INTO student_profiles_ext (id,student_id,mbti,holland_code,academic_interests,career_goals,major_preferences,strengths,weaknesses,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, 'ENTP', 'IRE',
    '人工智能、机器学习、算法设计、游戏开发',
    '希望进入科技公司从事AI工程师或创业',
    'Computer Science, Artificial Intelligence',
    '编程能力强（Python/JS/C++）、创造力好、团队协作能力强',
    '拖延症比较严重、写作能力一般、时间规划不够好',
    '有独立开发的GitHub项目，但学业成绩不够稳定', now, now
  ]);

  // ── 家长 — 固定 UUID ─────────────────────────────────────
  const p2a = 'f5e6d7c8-parent-lin-001-000000000003';
  db.run("INSERT INTO parent_guardians VALUES (?,?,?,?,?,?,?)", [
    p2a, '林国强', '父', '13898765432', 'lingq@email.com', 'lingq_wx', now
  ]);
  db.run("INSERT INTO student_parents VALUES (?,?)", [s2, p2a]);

  // ── 导师分配 ─────────────────────────────────────────────
  db.run("INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)", [uuid(), s2, cId, '升学规划师', '2023-09-10', null, '', now]);
  db.run("INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)", [uuid(), s2, mId, '导师', '2023-09-10', null, '', now]);

  // ── 选科 ─────────────────────────────────────────────────
  if (MATH) db.run("INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)", [uuid(), s2, MATH, 'A2', 'Edexcel', now]);
  if (PHYS) db.run("INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)", [uuid(), s2, PHYS, 'A2', 'Edexcel', now]);
  if (CS_ID) db.run("INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)", [uuid(), s2, CS_ID, 'A2', 'Edexcel', now]);
  if (FMATH_ID) db.run("INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)", [uuid(), s2, FMATH_ID, 'AS', 'Edexcel', now]);

  // ── 入学评估 ─────────────────────────────────────────────
  db.run(`INSERT INTO admission_assessments (id,student_id,assess_date,assess_type,subject,score,max_score,percentile,sub_scores,target_score,next_test_date,next_target_score,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, '2023-09-08', '数学测评', '数学', 85.0, 100, 78, null, null, null, null, '基础扎实', now
  ]);
  db.run(`INSERT INTO admission_assessments (id,student_id,assess_date,assess_type,subject,score,max_score,percentile,sub_scores,target_score,next_test_date,next_target_score,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, '2023-09-08', '英语测评', '英语', 72.0, 100, 55, null, null, null, null, '写作偏弱', now
  ]);
  db.run(`INSERT INTO admission_assessments (id,student_id,assess_date,assess_type,subject,score,max_score,percentile,sub_scores,target_score,next_test_date,next_target_score,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, '2024-10-12', '雅思 IELTS', '英语', 6.5, 9, 60,
    '{"listening":7.0,"reading":7.0,"writing":5.5,"speaking":6.5}',
    7.0, '2025-06-15', 7.0, '写作5.5不达标，需要重考', now
  ]);
  db.run(`INSERT INTO admission_assessments (id,student_id,assess_date,assess_type,subject,score,max_score,percentile,sub_scores,target_score,next_test_date,next_target_score,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, '2025-06-15', '雅思 IELTS', '英语', 7.0, 9, 75,
    '{"listening":7.5,"reading":7.5,"writing":6.0,"speaking":7.0}',
    null, null, null, '写作提升到6.0，总分达标但writing仍偏低', now
  ]);
  db.run(`INSERT INTO admission_assessments (id,student_id,assess_date,assess_type,subject,score,max_score,percentile,sub_scores,target_score,next_test_date,next_target_score,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, '2025-03-08', 'SAT', '综合', 1420, 1600, 82,
    '{"math":780,"reading_writing":640}',
    1500, '2025-10-05', 1500, '数学780不错，阅读写作需要提升', now
  ]);
  db.run(`INSERT INTO admission_assessments (id,student_id,assess_date,assess_type,subject,score,max_score,percentile,sub_scores,target_score,next_test_date,next_target_score,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, '2025-10-05', 'SAT', '综合', 1480, 1600, 88,
    '{"math":800,"reading_writing":680}',
    null, null, null, '数学满分800，R&W提升40分', now
  ]);

  // ── 考试记录 ─────────────────────────────────────────────
  // AS Level (已出分) — 成绩不算顶尖
  const examData2 = [
    ['Mathematics', 'WMA12', 'Unit 2', '2025-01-13', '2025-03-20', 'A', 'A', '285/300', 'result_received'],
    ['Further Maths', 'WFM01', 'Unit 1', '2025-01-15', '2025-03-20', 'A', 'B', '240/300', 'result_received'],
    ['Physics', 'WPH12', 'Unit 2', '2025-01-17', '2025-03-20', 'A', 'A', '268/300', 'result_received'],
    ['Computer Science', 'WCS01', 'Unit 1', '2025-06-09', '2025-08-14', 'A', 'A', null, 'result_received'],
  ];
  for (const [subj, code, comp, sDate, rDate, pred, actual, ums, status] of examData2) {
    db.run(`INSERT INTO exam_sittings (id,student_id,exam_board,series,year,subject,subject_code,component,sitting_date,results_date,predicted_grade,actual_grade,ums_score,status,is_resit,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      uuid(), s2, 'Edexcel', subj.includes('Further') ? 'January' : (code === 'WCS01' ? 'June' : 'January'),
      2025, subj, code, comp, sDate, rDate, pred, actual, ums, status, 0, '', now, now
    ]);
  }
  // FM resit planned
  db.run(`INSERT INTO exam_sittings (id,student_id,exam_board,series,year,subject,subject_code,component,sitting_date,results_date,predicted_grade,actual_grade,ums_score,status,is_resit,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, 'Edexcel', 'June', 2025, 'Further Maths', 'WFM01', 'Unit 1 Resit',
    '2025-06-12', '2025-08-14', 'A', 'A', '270/300', 'result_received', 1,
    'Resit: B→A, 提升30分', now, now
  ]);
  // A2 Level (即将考试)
  const examData2A2 = [
    ['Mathematics', 'WMA14', 'Unit 4', '2026-06-08', '2026-08-13', 'A*', null, null, 'registered'],
    ['Physics', 'WPH14', 'Unit 4+5', '2026-06-12', '2026-08-13', 'A', null, null, 'registered'],
    ['Computer Science', 'WCS02', 'Unit 2', '2026-06-16', '2026-08-13', 'A*', null, null, 'registered'],
    ['Further Maths', 'WFM02', 'Unit 2', '2026-06-10', '2026-08-13', 'A', null, null, 'registered'],
  ];
  for (const [subj, code, comp, sDate, rDate, pred, actual, ums, status] of examData2A2) {
    db.run(`INSERT INTO exam_sittings (id,student_id,exam_board,series,year,subject,subject_code,component,sitting_date,results_date,predicted_grade,actual_grade,ums_score,status,is_resit,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      uuid(), s2, 'Edexcel', 'June', 2026, subj, code, comp, sDate, rDate, pred, actual, ums, status, 0, '', now, now
    ]);
  }

  // ── 大学 & 目标院校 ──────────────────────────────────────
  const uWarwick = uuid(), uBath = uuid(), uMIT2 = uuid(), uCMU = uuid(), uGT = uuid();
  db.run("INSERT OR IGNORE INTO universities VALUES (?,?,?,?)", [uWarwick, '华威大学 University of Warwick', 'UK', '']);
  db.run("INSERT OR IGNORE INTO universities VALUES (?,?,?,?)", [uBath, '巴斯大学 University of Bath', 'UK', '']);
  db.run("INSERT OR IGNORE INTO universities VALUES (?,?,?,?)", [uMIT2, '麻省理工学院 MIT', 'US', '']);
  db.run("INSERT OR IGNORE INTO universities VALUES (?,?,?,?)", [uCMU, '卡内基梅隆大学 Carnegie Mellon', 'US', '']);
  db.run("INSERT OR IGNORE INTO universities VALUES (?,?,?,?)", [uGT, '佐治亚理工 Georgia Tech', 'US', '']);

  // 复用之前的 ICL
  db.run("INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)", [uuid(), s2, uICL, '帝国理工学院', '冲刺', 1, 'Computing', '英国CS顶尖，但竞争极其激烈', now]);
  db.run("INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)", [uuid(), s2, uWarwick, '华威大学', '意向', 2, 'Computer Science', 'CS排名高，工业联系强', now]);
  db.run("INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)", [uuid(), s2, uBath, '巴斯大学', '保底', 3, 'Computer Science', '保底选择，录取可能性大', now]);
  db.run("INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)", [uuid(), s2, uCMU, '卡内基梅隆大学', '冲刺', 4, 'Computer Science', '全美CS第一，极其挑战', now]);
  db.run("INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)", [uuid(), s2, uGT, '佐治亚理工', '意向', 5, 'Computer Science', '性价比高，CS实力强', now]);

  // ── 申请 ─────────────────────────────────────────────────
  // App 1: ICL Computing — applied, waiting
  const app2_1 = uuid();
  db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    app2_1, s2, uICL, '帝国理工学院', 'Computing', '冲刺', 2026, 'UK-UG',
    '2026-01-28', '2026-01-20', 'Predicted', '[]',
    null, 'Pending', null, 0, 0, null, 'applied', '已提交，等待回复', now, now
  ]);
  db.run("INSERT INTO application_uk_ext VALUES (?,?,?,?,?,?,?)", [app2_1, 'LIN-2026-005678', 1, 'submitted', 0, null, null]);

  // App 2: Warwick CS — offer
  const app2_2 = uuid();
  db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    app2_2, s2, uWarwick, '华威大学', 'Computer Science', '意向', 2026, 'UK-UG',
    '2026-01-28', '2026-01-20', 'Predicted', '[]',
    '2026-03-01', 'Conditional', 'A*AA including Mathematics',
    0, 0, null, 'offer', 'Conditional Offer已收到', now, now
  ]);
  db.run("INSERT INTO application_uk_ext VALUES (?,?,?,?,?,?,?)", [app2_2, 'LIN-2026-005678', 2, 'submitted', 0, 'A*AA including Mathematics', null]);

  // App 3: Bath CS — offer, likely insurance
  const app2_3 = uuid();
  db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    app2_3, s2, uBath, '巴斯大学', 'Computer Science', '保底', 2026, 'UK-UG',
    '2026-01-28', '2026-01-20', 'Predicted', '[]',
    '2026-02-15', 'Conditional', 'AAB including Mathematics',
    0, 0, null, 'offer', '条件宽松，大概率做Insurance', now, now
  ]);
  db.run("INSERT INTO application_uk_ext VALUES (?,?,?,?,?,?,?)", [app2_3, 'LIN-2026-005678', 3, 'submitted', 0, null, 'AAB including Mathematics']);

  // App 4: CMU — US ED2 (rejected, for drama)
  const app2_4 = uuid();
  db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    app2_4, s2, uCMU, '卡内基梅隆大学', 'Computer Science', '冲刺', 2026, 'US',
    '2026-01-02', '2025-12-28', 'Predicted',
    '["SAT:1480"]', '2026-02-15', 'Rejected', null,
    0, 0, null, 'declined', 'ED2被拒', now, now
  ]);
  db.run("INSERT INTO application_us_ext VALUES (?,?,?,?,?,?,?,?,?)", [
    app2_4, 'ED2', 1, 'CommonApp', null, '2026-02-15', 0, 0, '["Why CMU SCS","Describe a challenge"]'
  ]);

  // App 5: Georgia Tech — US RD, pending
  const app2_5 = uuid();
  db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    app2_5, s2, uGT, '佐治亚理工', 'Computer Science', '意向', 2026, 'US',
    '2026-01-06', '2026-01-05', 'Predicted',
    '["SAT:1480"]', null, 'Pending', null,
    0, 0, null, 'applied', 'RD已提交，3月底出结果', now, now
  ]);
  db.run("INSERT INTO application_us_ext VALUES (?,?,?,?,?,?,?,?,?)", [
    app2_5, 'RD', 0, 'CommonApp', null, '2026-03-20', 0, 0, '["Why Georgia Tech","Community essay"]'
  ]);

  // ── 个人陈述 ─────────────────────────────────────────────
  db.run(`INSERT INTO personal_statements (id,student_id,application_id,version,status,q1_content,q2_content,q3_content,word_count,char_count,reviewer_id,review_notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, app2_1, 2, '已提交',
    'The moment I wrote my first line of code at age 12 — a simple Python script that automated my homework calculations — I knew I had found my calling. What captivated me was not just the immediate utility, but the realisation that code is a medium for translating abstract ideas into tangible solutions. This revelation has since evolved into a deep fascination with artificial intelligence and its potential to reshape every aspect of human life.',
    'My academic journey has been deliberately shaped to build a strong foundation for computer science. Studying Edexcel A-Level Mathematics, Further Mathematics, Physics, and Computer Science has equipped me with rigorous analytical thinking and problem-solving skills. Beyond the curriculum, I have spent significant time on competitive programming through USACO, reaching the Silver division.',
    'My passion for computing extends well beyond the classroom. I developed "StudyBuddy", an open-source study planning web app using React and Node.js that has gained 200+ GitHub stars. I lead our school Coding Club, where I teach younger students Python and organise hackathons. Last summer, I completed a remote internship with a Singapore-based startup where I helped build a recommendation engine using collaborative filtering.',
    520, 3100, cId,
    '第二版定稿，加强了CS学科动机的深度，减少了泛泛而谈', now, now
  ]);

  // ── 文书 (US Essays) ─────────────────────────────────────
  const essay2_1 = uuid();
  db.run(`INSERT INTO essays (id,student_id,application_id,essay_type,title,prompt,word_limit,status,current_version,assigned_reviewer_id,review_deadline,strategy_notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    essay2_1, s2, app2_5, 'main', 'Common App Personal Essay',
    'Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story.',
    650, 'final', 3, cId, '2025-12-20',
    '以编程和创造力为主线，展示从游戏开发到AI的成长路径', now, now
  ]);
  const essay2_2 = uuid();
  db.run(`INSERT INTO essays (id,student_id,application_id,essay_type,title,prompt,word_limit,status,current_version,assigned_reviewer_id,review_deadline,strategy_notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    essay2_2, s2, app2_5, 'supplement', 'Why Georgia Tech',
    'Why do you want to study your chosen major at Georgia Tech, and what has prepared you for this?',
    300, 'submitted', 2, cId, '2025-12-30',
    '突出GT的CS+工程跨学科优势和Atlanta科技生态', now, now
  ]);
  // A draft essay that's overdue (for risk)
  const essay2_3 = uuid();
  db.run(`INSERT INTO essays (id,student_id,application_id,essay_type,title,prompt,word_limit,status,current_version,assigned_reviewer_id,review_deadline,strategy_notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    essay2_3, s2, null, 'supplement', 'UK UCAS PS 补充材料',
    '为帝国理工准备的supplementary questionnaire',
    500, 'draft', 1, cId, '2026-02-15',
    '需要补充编程项目细节', now, now
  ]);

  // ── 课外活动 ─────────────────────────────────────────────
  db.run(`INSERT INTO student_activities (id,student_id,category,name,organization,role,start_date,end_date,hours_per_week,weeks_per_year,impact_level,description,achievements,related_major_tags,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, 'personal_project', 'StudyBuddy 学习规划App', 'GitHub Open Source', '独立开发者 Creator',
    '2024-06-01', null, 8, 40, 'international',
    '使用React + Node.js + PostgreSQL开发的智能学习规划工具。支持AI驱动的时间安排、Pomodoro计时器、学科进度追踪。部署在Vercel上，月活用户500+。',
    'GitHub 200+ stars, 月活用户500+, ProductHunt周榜第15名',
    '["computer_science","software_engineering"]', 1, now, now
  ]);
  db.run(`INSERT INTO student_activities (id,student_id,category,name,organization,role,start_date,end_date,hours_per_week,weeks_per_year,impact_level,description,achievements,related_major_tags,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, 'club_leadership', '编程社社长', '校编程社 Coding Club', '社长 President',
    '2024-09-01', null, 5, 36, 'school',
    '管理30人社团，每周组织Python/JS教学工作坊。策划并执行了两次校际Hackathon，共吸引120名参赛者。',
    '社团人数翻倍，组织2次Hackathon',
    '["computer_science"]', 2, now, now
  ]);
  db.run(`INSERT INTO student_activities (id,student_id,category,name,organization,role,start_date,end_date,hours_per_week,weeks_per_year,impact_level,description,achievements,related_major_tags,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, 'academic_competition', 'USACO 美国计算机奥林匹克', 'USA Computing Olympiad', '参赛选手',
    '2024-01-01', null, 6, 48, 'international',
    '自学算法与数据结构，参加USACO月赛。从Bronze起步，目前稳定在Silver级别。重点训练图论、动态规划和贪心算法。',
    'Silver Division (Top 25%)',
    '["computer_science","algorithms"]', 3, now, now
  ]);
  db.run(`INSERT INTO student_activities (id,student_id,category,name,organization,role,start_date,end_date,hours_per_week,weeks_per_year,impact_level,description,achievements,related_major_tags,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, 'internship', '初创公司远程实习', 'TechPulse Pte Ltd (Singapore)', '软件工程实习生',
    '2025-07-01', '2025-08-15', 30, 6, 'international',
    '在新加坡初创公司远程实习6周，参与推荐引擎开发。使用Python、pandas和scikit-learn实现协同过滤算法，将推荐准确率提升了12%。',
    '推荐算法准确率提升12%, 获得CEO推荐信',
    '["machine_learning","software_engineering"]', 4, now, now
  ]);
  db.run(`INSERT INTO student_activities (id,student_id,category,name,organization,role,start_date,end_date,hours_per_week,weeks_per_year,impact_level,description,achievements,related_major_tags,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, 'volunteer', '编程教育志愿者', 'Code.org / 社区中心', '志愿者讲师',
    '2024-03-01', null, 2, 30, 'city',
    '在社区中心为10-14岁学生教授Scratch和Python基础编程。设计了8周的课程大纲。',
    '累计教授60名学生，其中3名参加了校际编程比赛',
    '["education","computer_science"]', 5, now, now
  ]);

  // ── 荣誉奖项 ─────────────────────────────────────────────
  db.run(`INSERT INTO student_honors (id,student_id,activity_id,name,level,award_rank,award_date,description,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, null, 'USACO Silver Division', 'international', 'Silver', '2025-02-01', '美国计算机奥林匹克Silver级别', 1, now, now
  ]);
  db.run(`INSERT INTO student_honors (id,student_id,activity_id,name,level,award_rank,award_date,description,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, null, 'Hackathon冠军', 'city', '第一名', '2025-04-20', '市级青少年Hackathon AI赛道冠军', 2, now, now
  ]);
  db.run(`INSERT INTO student_honors (id,student_id,activity_id,name,level,award_rank,award_date,description,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, null, 'UKMT Senior Mathematical Challenge Silver', 'national', 'Silver', '2024-11-15', '英国高级数学挑战赛银奖', 3, now, now
  ]);

  // ── 学生奖项 ─────────────────────────────────────────────
  db.run(`INSERT INTO student_awards (id,student_id,name,category,level,award_date,description,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, 'ProductHunt Weekly Top 20', '技术', 'international', '2025-03-15', 'StudyBuddy App在ProductHunt获得周榜前20', 1, now, now
  ]);

  // ── 里程碑任务 ───────────────────────────────────────────
  const tasks2 = [
    // 已完成
    [uuid(), s2, app2_4, 'Common App主文书终稿', '650字主Essay提交', '材料', '2025-12-20', '2025-12-18 16:00:00', 'done', 'high', cId],
    [uuid(), s2, app2_4, 'CMU ED2申请提交', '1月2日截止', '申请', '2026-01-02', '2025-12-28 20:00:00', 'done', 'high', cId],
    [uuid(), s2, app2_1, 'UCAS申请提交', '1月28日截止', '申请', '2026-01-28', '2026-01-20 15:00:00', 'done', 'high', cId],
    [uuid(), s2, null, 'SAT第二次考试', '目标1500', '考试', '2025-10-05', '2025-10-05 08:00:00', 'done', 'high', cId],
    // 逾期!! (关键：触发AI风险预警)
    [uuid(), s2, app2_2, '确认Warwick为Firm Choice', '需要尽快做决定', '申请', '2026-03-20', null, 'pending', 'high', cId],
    [uuid(), s2, null, '雅思写作专项提升', '写作6.0偏低，部分学校要求6.5', '考试', '2026-03-01', null, 'pending', 'high', cId],
    [uuid(), s2, null, 'ICL Supplementary Questionnaire', '帝国理工补充材料', '材料', '2026-02-28', null, 'pending', 'high', cId],
    // 进行中
    [uuid(), s2, null, 'A2大考复习 — 数学', 'Pure Math + Stats/Mechanics', '考试', '2026-06-08', null, 'in_progress', 'high', mId],
    [uuid(), s2, null, 'A2大考复习 — 物理', '力学 + 电磁学重点', '考试', '2026-06-12', null, 'in_progress', 'normal', mId],
    // 待完成
    [uuid(), s2, null, '确认Firm/Insurance选择', 'UCAS截止5月6日', '申请', '2026-05-06', null, 'pending', 'high', cId],
    [uuid(), s2, app2_5, '跟进Georgia Tech RD结果', '预计3月底出结果', '申请', '2026-03-25', null, 'pending', 'normal', cId],
    [uuid(), s2, null, '与家长商讨UK vs US最终选择', '如果GT录取需要综合对比', '沟通', '2026-04-15', null, 'pending', 'normal', cId],
  ];
  for (const t of tasks2) {
    db.run(`INSERT INTO milestone_tasks (id,student_id,application_id,title,description,category,due_date,completed_at,status,priority,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...t, now, now]);
  }

  // ── 材料清单 ─────────────────────────────────────────────
  const mats2 = [
    [uuid(), s2, app2_1, '个人陈述', 'UCAS Personal Statement (Computing)', '已提交', 2, null, '二稿定稿', cId, now, now],
    [uuid(), s2, app2_1, '推荐信', '数学老师推荐信', '已提交', 1, null, '', cId, now, now],
    [uuid(), s2, app2_1, '推荐信', '计算机老师推荐信', '已提交', 1, null, '', cId, now, now],
    [uuid(), s2, app2_1, '成绩单', 'Edexcel AS Level 成绩单', '已提交', 1, null, 'Math A, FM A(resit), Physics A, CS A', cId, now, now],
    [uuid(), s2, app2_1, '其他', 'ICL Supplementary Questionnaire', '草稿', 1, null, '需要补充编程项目经历', null, null, null],
    [uuid(), s2, app2_4, '其他', 'Common App Essay (Main)', '已提交', 3, null, '', cId, now, now],
    [uuid(), s2, app2_4, '其他', 'CMU Supplement: Why SCS', '已提交', 2, null, '', cId, now, now],
    [uuid(), s2, app2_5, '其他', 'GT Supplement: Why Georgia Tech', '已提交', 2, null, '', cId, now, now],
    [uuid(), s2, app2_5, '其他', 'GT Supplement: Community Essay', '已提交', 2, null, '', cId, now, now],
    [uuid(), s2, null, '活动证明', 'USACO Silver Certificate', '已审核', 1, null, '', cId, now, null],
    [uuid(), s2, null, '活动证明', 'TechPulse实习证明 + 推荐信', '已审核', 1, null, '', cId, now, null],
    [uuid(), s2, null, '活动证明', 'GitHub Profile & StudyBuddy项目文档', '已上传', 1, null, '', null, null, null],
    [uuid(), s2, null, '其他', 'SAT成绩单 (1480)', '已确认', 1, null, '', null, null, null],
    [uuid(), s2, null, '其他', '雅思成绩单 (7.0)', '已确认', 1, null, '写作6.0偏低', null, null, null],
  ];
  for (const m of mats2) {
    db.run(`INSERT INTO material_items (id,student_id,application_id,material_type,title,status,version,file_path,notes,reviewed_by,reviewed_at,submitted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...m, now, now]);
  }

  // ── 沟通记录 ─────────────────────────────────────────────
  const comms2 = [
    [uuid(), s2, cId, p2a, '面谈', '与林子轩及父亲面谈，讨论CMU ED2被拒后的策略调整。建议专注UK申请，将Warwick作为Firm Choice候选。家长对GT仍有期待，需要等3月结果再最终决定。', '1.等GT结果 2.准备ICL补充材料 3.考虑是否重考雅思写作', '2026-02-20 14:00:00'],
    [uuid(), s2, cId, null, '微信', '提醒林子轩ICL补充材料截止日期临近，需要尽快完成编程项目描述。他说这周末会完成。', '子轩周末完成ICL问卷', '2026-02-25 10:00:00'],
    [uuid(), s2, mId, null, '面谈', '与林子轩一对一辅导，复习数学Pure Math部分。他在微积分应用题上还需要加强练习。物理电磁学也有薄弱环节。制定了4-6月详细复习计划。', '每天2小时数学+1小时物理', '2026-03-15 11:00:00'],
    [uuid(), s2, cId, p2a, '电话', '与林爸爸电话沟通GT结果延迟的情况，解释RD通常3月底4月初出结果。建议做好两手准备。', '', '2026-03-28 16:30:00'],
  ];
  for (const c of comms2) {
    db.run("INSERT INTO communication_logs VALUES (?,?,?,?,?,?,?,?,?)", [...c, now]);
  }

  // ── 反馈 ─────────────────────────────────────────────────
  db.run("INSERT INTO feedback VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [
    uuid(), s2, 'parent', p2a, '疑问',
    '想了解一下CMU被拒后，是否还有机会申请其他美国前20的CS项目？另外GT如果录取了，学费和奖学金情况如何？',
    3, 'pending', null, null, null, now
  ]);
  db.run("INSERT INTO feedback VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [
    uuid(), s2, 'student', s2, '阶段反馈',
    '感觉自己时间不够用，一边要准备A2大考，一边还有ICL的补充材料没做完。CMU拒了有点打击信心。希望老师能帮我理一下接下来的优先级。',
    2, 'pending', null, null, null, now
  ]);

  // ── 通知 ─────────────────────────────────────────────────
  db.run(`INSERT INTO notification_logs (id,student_id,task_id,type,trigger_days,title,message,target_role,target_user_id,is_read,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, null, 'overdue', 1, '逾期警告: ICL补充材料',
    '林子轩的ICL Supplementary Questionnaire已逾期，原截止日2月28日。请立即跟进。', 'counselor', null, 0, now
  ]);
  db.run(`INSERT INTO notification_logs (id,student_id,task_id,type,trigger_days,title,message,target_role,target_user_id,is_read,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, null, 'overdue', 1, '逾期警告: 雅思写作提升',
    '林子轩的雅思写作专项提升任务已逾期（截止3月1日）。写作6.0低于部分院校6.5的要求。', 'counselor', null, 0, now
  ]);
  db.run(`INSERT INTO notification_logs (id,student_id,task_id,type,trigger_days,title,message,target_role,target_user_id,is_read,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    uuid(), s2, null, 'escalation', 3, '升级: Firm Choice未确认',
    '林子轩的Warwick Firm Choice确认任务已逾期超过2周，需要校长关注。', 'principal', null, 0, now
  ]);

  console.log(`✅ 学生 2: 林子轩 (ID: ${s2}) 插入完成`);
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  演示数据插入完成！');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('学生账号:');
  console.log('  苏瑶  — 用户名: sophie  密码: 123456');
  console.log('  林子轩 — 用户名: jason   密码: 123456');
  console.log('');
  console.log('家长账号:');
  console.log('  苏建国 — 用户名: su_parent 密码: 123456');
  console.log('');
  console.log('苏瑶: CIE G12, 5所目标院校 (UK+SG), 剑桥Conditional Offer');
  console.log('  → 5个申请 (1 offer+firm, 1 applied, 1 offer+insurance, 1 applied, 1 pending)');
  console.log('  → 11个任务, 4个活动, 4个荣誉, 雅思8.0, AS: 4A');
  console.log('  → 完整PS + NUS Essay + 素材库 + 沟通记录 + 反馈');
  console.log('');
  console.log('林子轩: Edexcel G12, 5所目标院校 (UK+US), 有风险/逾期');
  console.log('  → 5个申请 (2 offer, 1 applied, 1 rejected, 1 applied)');
  console.log('  → 12个任务(含3个逾期!), 5个活动, 3个荣誉, SAT 1480, 雅思7.0');
  console.log('  → UCAS PS + US Essays + 沟通记录 + 家长疑问反馈');
  console.log('  → ⚠️ 3个逾期任务将触发AI风险预警');
  console.log('');

}

// ════════════════════════════════════════════════════════════
//  补全所有已有学生的缺失数据
// ════════════════════════════════════════════════════════════
function enrichExistingStudents(db) {
  const existingProfile = db.get("SELECT spe.id FROM student_profiles_ext spe JOIN students s ON s.id=spe.student_id WHERE s.name='陈美琳'");
  if (existingProfile) return; // 已补全过

  const { v4: uuid } = require('uuid');
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const bcrypt = require('bcryptjs');
  const hash = (pw) => bcrypt.hashSync(pw, 10);

  const cId = db.get("SELECT id FROM staff WHERE role='counselor' LIMIT 1")?.id;
  const mId = db.get("SELECT id FROM staff WHERE role='mentor' LIMIT 1")?.id;

  // 获取学生ID
  const sid = (name) => db.get("SELECT id FROM students WHERE name=?", [name])?.id;
  const sA = sid('陈美琳'), sB = sid('刘浩然'), sC = sid('王雅欣'),
        sD = sid('赵天宇'), sE = sid('林佳怡'),
        s1 = sid('张三'), s2 = sid('李四'), s3 = sid('王五');

  if (!sA) return; // 如果没有这些学生就跳过

  // 获取科目ID
  const sub = (code) => db.get("SELECT id FROM subjects WHERE code=?", [code])?.id;
  const MATH=sub('MATH'), PHYS=sub('PHYS'), CHEM=sub('CHEM'), BIO=sub('BIO'),
        ECON=sub('ECON'), CS=sub('CS'), ENG=sub('ENG'), HIST=sub('HIST');

  // ════════════════════════════════════════════
  //  补全 date_of_birth
  // ════════════════════════════════════════════
  const dobs = [
    [sA, '2007-05-12'], [sB, '2007-01-28'], [sC, '2008-07-19'],
    [sD, '2007-09-03'], [sE, '2007-11-15'],
    [s1, '2007-04-22'], [s2, '2008-06-10'], [s3, '2007-02-14']
  ];
  for (const [id, dob] of dobs) {
    if (id) db.run("UPDATE students SET date_of_birth=? WHERE id=? AND date_of_birth IS NULL", [dob, id]);
  }

  // ════════════════════════════════════════════
  //  补全扩展档案
  // ════════════════════════════════════════════
  const profiles = [
    [sA, 'INFJ', 'ISA', '分子生物学、医学伦理、公共卫生', '成为临床医生或生物医学研究员', '医学 Medicine / 生物医学 Biomedical Sciences', '学术功底扎实、有耐心、沟通能力好', '面试紧张、时间管理需加强', 'IGCSE 7A*，AS预测3A，目标牛津生物医学'],
    [sB, 'INTP', 'IRE', '人工智能、算法设计、量子计算', '进入顶尖科技公司或攻读CS博士', '计算机科学 Computer Science', '数学能力极强(SAT数学800)、编程经验丰富(Python/C++)', '英语写作一般、社交活动较少', 'MIT被拒但UCLA/NYU在申，USACO银牌'],
    [sC, 'ENFJ', 'SEC', '宏观经济学、发展经济学、社会政策', '从事经济政策分析或国际组织工作', '经济学 Economics / 政治经济学 PPE', '写作能力强、领导力好、关心社会议题', '数学基础需加强、还在G11阶段较早', 'G11提前规划，目标LSE经济学'],
    [sD, 'ESTJ', 'ECS', '金融市场、企业管理、创业', '投行或管理咨询方向', '金融学 Finance / 商学 Business', '务实高效、量化分析能力好', '个人陈述深度不够、课外活动单一', '已收巴斯Unconditional，华威Conditional'],
    [sE, 'ISFJ', 'CSE', '国际贸易、东南亚经济、可持续发展', '在新加坡金融或咨询行业发展', '商科 Business / 经济学 Economics', '踏实认真、跨文化沟通能力强', '雅思写作偏低6.5、需要提升学术英语', 'NUS/NTU双申，商科方向'],
    [s1, 'ENTJ', 'EIR', '机械工程、新能源技术、工业设计', '成为工程师或技术创业者', '工程学 Engineering / 机械工程', '动手能力强、领导力好、逻辑思维清晰', '有时过于急躁、英语口语需提升', 'Edexcel体系，目标帝国理工工程'],
    [s2, 'INFP', 'AIS', '心理学、教育学、人文关怀', '成为心理咨询师或教育工作者', '心理学 Psychology / 教育学', '共情能力强、写作好、有创造力', 'G11阶段，还在探索方向', 'CIE体系，早期规划阶段'],
    [s3, 'ISTP', 'RIC', '数据科学、统计学、金融工程', '从事量化分析或数据科学', '数学与统计 Mathematics & Statistics', '数学直觉好、编程有基础', '写作和沟通偏弱、不够主动', 'A-Level体系，数学方向']
  ];
  for (const [id, mbti, holland, interests, goals, major, strengths, weaknesses, notes] of profiles) {
    if (id) db.run(`INSERT INTO student_profiles_ext (id,student_id,mbti,holland_code,academic_interests,career_goals,major_preferences,strengths,weaknesses,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [uuid(), id, mbti, holland, interests, goals, major, strengths, weaknesses, notes, now, now]);
  }

  // ════════════════════════════════════════════
  //  补全家长 + 家长用户
  // ════════════════════════════════════════════
  const parentData = [
    [sA, '陈建明', '父', '13611112222', 'chenjm@email.com', 'chen_jm_wx'],
    [sA, '李敏华', '母', '13611113333', 'limh@email.com', 'limh_wx'],
    [sB, '刘志强', '父', '13622221111', 'liuzq@email.com', 'liuzq_wx'],
    [sB, '张晓燕', '母', '13622222222', 'zhangxy@email.com', 'zhangxy_wx'],
    [sC, '王建华', '父', '13633331111', 'wangjh@email.com', 'wangjh_wx'],
    [sD, '赵德明', '父', '13644441111', 'zhaodm@email.com', 'zhaodm_wx'],
    [sE, '林国平', '父', '13655551111', 'lingp@email.com', 'lingp_wx'],
    [sE, '陈美玲', '母', '13655552222', 'chenml@email.com', 'chenml_wx'],
    [s2, '李明', '父', '13677771111', 'liming@email.com', 'liming_wx'],
    [s3, '王强', '父', '13688881111', 'wangqiang@email.com', 'wangq_wx'],
  ];
  for (const [studentId, name, relation, phone, email, wechat] of parentData) {
    if (!studentId) continue;
    const existing = db.get("SELECT p.id FROM parent_guardians p JOIN student_parents sp ON sp.parent_id=p.id WHERE sp.student_id=? AND p.name=?", [studentId, name]);
    if (existing) continue;
    const pid = uuid();
    db.run("INSERT INTO parent_guardians VALUES (?,?,?,?,?,?,?)", [pid, name, relation, phone, email, wechat, now]);
    db.run("INSERT INTO student_parents VALUES (?,?)", [studentId, pid]);
  }

  // ════════════════════════════════════════════
  //  补全导师分配（检查已有的不重复）
  // ════════════════════════════════════════════
  const allStudents = [sA, sB, sC, sD, sE, s1, s2, s3].filter(Boolean);
  for (const sid2 of allStudents) {
    const hasCounselor = db.get("SELECT ma.id FROM mentor_assignments ma WHERE ma.student_id=? AND ma.role='升学规划师' AND ma.end_date IS NULL", [sid2]);
    if (!hasCounselor && cId) db.run("INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)", [uuid(), sid2, cId, '升学规划师', '2024-09-10', null, '', now]);
    const hasMentor = db.get("SELECT ma.id FROM mentor_assignments ma WHERE ma.student_id=? AND ma.role='导师' AND ma.end_date IS NULL", [sid2]);
    if (!hasMentor && mId) db.run("INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)", [uuid(), sid2, mId, '导师', '2024-09-10', null, '', now]);
  }

  // ════════════════════════════════════════════
  //  补全考试记录 (exam_sittings)
  // ════════════════════════════════════════════
  const examInsert = (sid2, board, series, year, subj, code, comp, sDate, rDate, pred, actual, status, resit) => {
    db.run(`INSERT INTO exam_sittings (id,student_id,exam_board,series,year,subject,subject_code,component,sitting_date,results_date,predicted_grade,actual_grade,ums_score,status,is_resit,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uuid(), sid2, board, series, year, subj, code, comp, sDate, rDate, pred, actual, null, status, resit?1:0, '', now, now]);
  };

  // 陈美琳 CIE AS (已出分) + A2 (即将)
  examInsert(sA, 'CIE','June',2025,'Mathematics','9709','P1+P2','2025-05-12','2025-08-14','A','A','result_received');
  examInsert(sA, 'CIE','June',2025,'Biology','9700','P1+P2+P3','2025-05-20','2025-08-14','A*','A','result_received');
  examInsert(sA, 'CIE','June',2025,'Chemistry','9701','P1+P2','2025-05-22','2025-08-14','A','A','result_received');
  examInsert(sA, 'CIE','June',2026,'Mathematics','9709','P3+P4','2026-05-11','2026-08-13','A*',null,'registered');
  examInsert(sA, 'CIE','June',2026,'Biology','9700','P3+P4+P5','2026-05-20','2026-08-13','A*',null,'registered');
  examInsert(sA, 'CIE','June',2026,'Chemistry','9701','P3+P4+P5','2026-05-22','2026-08-13','A*',null,'registered');

  // 刘浩然 CIE AS + A2
  examInsert(sB, 'CIE','June',2025,'Mathematics','9709','P1+P2','2025-05-12','2025-08-14','A*','A*','result_received');
  examInsert(sB, 'CIE','June',2025,'Physics','9702','P1+P2','2025-05-16','2025-08-14','A','A','result_received');
  examInsert(sB, 'CIE','June',2025,'Computer Science','9618','P1+P2','2025-06-05','2025-08-14','A*','A*','result_received');
  examInsert(sB, 'CIE','June',2026,'Mathematics','9709','P3+P4','2026-05-11','2026-08-13','A*',null,'registered');
  examInsert(sB, 'CIE','June',2026,'Physics','9702','P3+P4+P5','2026-05-16','2026-08-13','A*',null,'registered');
  examInsert(sB, 'CIE','June',2026,'Computer Science','9618','P3+P4','2026-06-03','2026-08-13','A*',null,'registered');

  // 赵天宇 Edexcel AS + A2
  examInsert(sD, 'Edexcel','January',2025,'Mathematics','WMA12','Unit 2','2025-01-13','2025-03-20','A','A','result_received');
  examInsert(sD, 'Edexcel','January',2025,'Economics','WEC12','Unit 2','2025-01-17','2025-03-20','A','B','result_received');
  examInsert(sD, 'Edexcel','June',2025,'Economics','WEC12','Unit 2 Resit','2025-06-10','2025-08-14','A','A','result_received',true);
  examInsert(sD, 'Edexcel','June',2026,'Mathematics','WMA14','Unit 4','2026-06-08','2026-08-13','A*',null,'registered');
  examInsert(sD, 'Edexcel','June',2026,'Economics','WEC14','Unit 4','2026-06-12','2026-08-13','A',null,'registered');

  // 林佳怡 CIE AS + A2
  examInsert(sE, 'CIE','June',2025,'Mathematics','9709','P1+P2','2025-05-12','2025-08-14','A','A','result_received');
  examInsert(sE, 'CIE','June',2025,'Economics','9708','P1+P2','2025-05-18','2025-08-14','B','B','result_received');
  examInsert(sE, 'CIE','June',2025,'Biology','9700','P1+P2','2025-05-22','2025-08-14','A','A','result_received');
  examInsert(sE, 'CIE','June',2026,'Mathematics','9709','P3+P4','2026-05-11','2026-08-13','A*',null,'registered');
  examInsert(sE, 'CIE','June',2026,'Economics','9708','P3+P4','2026-05-18','2026-08-13','A',null,'registered');
  examInsert(sE, 'CIE','June',2026,'Biology','9700','P3+P4+P5','2026-05-22','2026-08-13','A',null,'registered');

  // 张三 Edexcel (已有选科但无考试)
  if (s1) {
    examInsert(s1, 'Edexcel','January',2025,'Mathematics','WMA12','Unit 2','2025-01-13','2025-03-20','A','A','result_received');
    examInsert(s1, 'Edexcel','June',2025,'Physics','WPH12','Unit 2','2025-06-10','2025-08-14','A','B','result_received');
    examInsert(s1, 'Edexcel','June',2025,'Chemistry','WCH12','Unit 2','2025-06-12','2025-08-14','B','B','result_received');
    examInsert(s1, 'Edexcel','June',2026,'Mathematics','WMA14','Unit 4','2026-06-08','2026-08-13','A*',null,'registered');
    examInsert(s1, 'Edexcel','June',2026,'Physics','WPH14','Unit 4+5','2026-06-12','2026-08-13','A',null,'registered');
    examInsert(s1, 'Edexcel','June',2026,'Chemistry','WCH14','Unit 4+5','2026-06-16','2026-08-13','A',null,'registered');
  }

  // ════════════════════════════════════════════
  //  补全课外活动
  // ════════════════════════════════════════════
  const actInsert = (sid2, cat, name2, org, role, start, end2, hpw, wpy, impact, desc, ach, tags, sort) => {
    db.run(`INSERT INTO student_activities (id,student_id,category,name,organization,role,start_date,end_date,hours_per_week,weeks_per_year,impact_level,description,achievements,related_major_tags,sort_order,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uuid(), sid2, cat, name2, org, role, start, end2, hpw, wpy, impact, desc, ach, JSON.stringify(tags), sort, now, now]);
  };

  // 陈美琳 — 医学方向
  actInsert(sA, 'volunteer', '社区诊所志愿者', '仁爱社区诊所', '志愿者', '2024-03-01', null, 4, 40, 'city',
    '每周在社区诊所协助健康检查和患者引导，了解基层医疗服务流程', '累计服务150+小时，获优秀志愿者称号', ['medicine','public_health'], 1);
  actInsert(sA, 'academic_competition', '英国生物奥林匹克 BBO', 'Royal Society of Biology', '参赛选手', '2025-01-10', '2025-03-20', 5, 10, 'national',
    '系统备赛，覆盖分子生物学、遗传学、生态学', 'Bronze Medal', ['biology'], 2);
  actInsert(sA, 'club_leadership', '校科学社副社长', '学校科学社', '副社长', '2024-09-01', null, 3, 36, 'school',
    '协助组织科学讲座和实验展示活动，带领低年级同学准备科学竞赛', '组织了4场学术讲座', ['science'], 3);
  actInsert(sA, 'research', '医学伦理研究项目', '学校人文社科项目', '研究员', '2025-02-01', '2025-05-30', 3, 16, 'school',
    '独立调研"基因编辑的伦理边界"，撰写5000字研究报告', '报告获校内学术论文比赛二等奖', ['medicine','ethics'], 4);

  // 刘浩然 — CS方向
  actInsert(sB, 'personal_project', 'AlgoViz 算法可视化工具', 'GitHub Open Source', '独立开发者', '2024-08-01', null, 6, 40, 'international',
    '使用React+D3.js开发的算法可视化教学工具，支持排序、图论、DP等15种算法的动态演示', 'GitHub 150+ stars', ['computer_science'], 1);
  actInsert(sB, 'academic_competition', 'USACO 美国计算机奥林匹克', 'USA Computing Olympiad', '参赛选手', '2024-06-01', null, 8, 48, 'international',
    '自学算法与数据结构，Silver级别稳定', 'Silver Division', ['computer_science','algorithms'], 2);
  actInsert(sB, 'club_leadership', '校机器人社社长', '学校机器人社', '社长', '2024-09-01', null, 4, 36, 'school',
    '带领团队参加FRC机器人竞赛，负责软件控制系统设计', '校际机器人挑战赛亚军', ['robotics','engineering'], 3);
  actInsert(sB, 'internship', '远程AI实习', 'DeepTech Labs (远程)', '算法实习生', '2025-07-01', '2025-08-10', 25, 6, 'international',
    '参与NLP项目，使用PyTorch训练文本分类模型，F1提升8%', '获得导师推荐信', ['machine_learning','NLP'], 4);

  // 王雅欣 — 经济/社科方向 (G11)
  actInsert(sC, 'club_leadership', '校辩论社社长', '学校辩论社', '社长', '2024-09-01', null, 5, 36, 'school',
    '组织校内辩论赛，代表学校参加市级辩论锦标赛', '市级辩论赛最佳辩手', ['economics','politics'], 1);
  actInsert(sC, 'volunteer', '公益经济学讲座', 'TEDx Youth组织', '组织者', '2025-01-15', '2025-03-15', 3, 8, 'city',
    '策划并组织了面向高中生的经济学普及讲座系列', '3场讲座共吸引200+听众', ['economics'], 2);
  actInsert(sC, 'academic_competition', '全国经济学知识竞赛', '中国经济学会', '参赛选手', '2025-03-01', '2025-04-15', 4, 6, 'national',
    '参加全国高中生经济学知识竞赛', '全国三等奖', ['economics'], 3);

  // 赵天宇 — 商科/金融方向
  actInsert(sD, 'club_leadership', '校商业社创始人', '学校商业社', '创始人兼社长', '2024-03-01', null, 4, 36, 'school',
    '创办学校第一个商业社团，组织模拟投资大赛和商业案例分析活动', '社团发展到25人，举办3次校际模拟投资赛', ['business','finance'], 1);
  actInsert(sD, 'academic_competition', '模拟联合国 MUN', 'THIMUN Singapore', '代表', '2024-11-01', '2024-11-04', 30, 1, 'international',
    '代表学校参加新加坡THIMUN会议，担任经济与金融委员会代表', 'Honorable Mention Award', ['international_relations','economics'], 2);
  actInsert(sD, 'internship', '银行暑期实习', '汇丰银行（新加坡）', '实习生', '2025-06-15', '2025-07-15', 35, 4, 'international',
    '在财富管理部门实习，协助客户数据分析和市场调研', '完成独立研究报告，获得主管推荐信', ['finance','banking'], 3);

  // 林佳怡 — 新加坡商科方向
  actInsert(sE, 'volunteer', '社区英语教学', '社区教育中心', '志愿者老师', '2024-06-01', null, 3, 40, 'city',
    '为社区低收入家庭的孩子提供免费英语辅导', '累计教授40+名学生', ['education'], 1);
  actInsert(sE, 'club_leadership', '校学生会财务部长', '学校学生会', '财务部长', '2024-09-01', null, 3, 36, 'school',
    '管理学生会年度预算，审批社团活动经费', '优化预算分配流程，节省15%开支', ['business','management'], 2);
  actInsert(sE, 'academic_competition', 'NUS商业案例分析赛', 'NUS Business School', '参赛队长', '2025-08-10', '2025-08-12', 40, 1, 'international',
    '带领3人团队参加NUS主办的高中生商业案例分析比赛', '前10名（共40队）', ['business'], 3);

  // 张三 — 工程方向
  if (s1) {
    actInsert(s1, 'personal_project', '3D打印机械臂', '学校创客实验室', '项目负责人', '2024-10-01', '2025-03-15', 5, 20, 'school',
      '设计并3D打印了一个4自由度机械臂，用Arduino控制', '校科技创新展一等奖', ['engineering','robotics'], 1);
    actInsert(s1, 'sports', '校足球队', '学校体育部', '队员', '2023-09-01', null, 5, 36, 'school',
      '校足球队主力中场，参加校际联赛', '校际联赛季军', ['sports'], 2);
  }

  // 李四 — G11探索阶段
  if (s2) {
    actInsert(s2, 'volunteer', '心理热线志愿者', '青少年心理热线', '志愿者', '2025-01-01', null, 2, 30, 'city',
      '接听青少年心理咨询热线，提供倾听和初步支持', '培训合格，每周值班2小时', ['psychology'], 1);
    actInsert(s2, 'arts', '校话剧社', '学校话剧社', '演员', '2024-09-01', null, 4, 30, 'school',
      '参演校内话剧，体验角色心理分析', '年度话剧《等待戈多》主演', ['arts','psychology'], 2);
  }

  // 王五 — 数学/数据方向
  if (s3) {
    actInsert(s3, 'academic_competition', 'UKMT高级数学挑战赛', 'UK Mathematics Trust', '参赛选手', '2024-11-01', '2024-11-15', 3, 2, 'national',
      '参加UKMT Senior Mathematical Challenge', 'Silver Certificate', ['mathematics'], 1);
    actInsert(s3, 'personal_project', '数据分析小工具', 'GitHub', '开发者', '2025-01-01', null, 4, 20, 'school',
      '用Python+pandas写了一个分析学校考试成绩的自动化工具', '被数学老师用于班级成绩分析', ['data_science','statistics'], 2);
  }

  // ════════════════════════════════════════════
  //  补全荣誉奖项
  // ════════════════════════════════════════════
  const honorInsert = (sid2, name2, level, rank, date, desc, sort) => {
    db.run(`INSERT INTO student_honors (id,student_id,name,level,award_rank,award_date,description,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uuid(), sid2, name2, level, rank, date, desc, sort, now, now]);
  };

  honorInsert(sA, 'BBO Bronze Medal', 'national', 'Bronze', '2025-03-20', '英国生物奥林匹克铜牌', 1);
  honorInsert(sA, '校内科学论文二等奖', 'school', '二等奖', '2025-05-15', '医学伦理研究报告', 2);
  honorInsert(sA, 'CIE Top in School Biology', 'school', '第一名', '2025-09-01', 'AS Biology校内最高分', 3);

  honorInsert(sB, 'USACO Silver Division', 'international', 'Silver', '2025-02-01', '美国计算机奥林匹克银级', 1);
  honorInsert(sB, '校际机器人挑战赛亚军', 'city', '第二名', '2025-03-15', 'FRC赛季校际赛', 2);
  honorInsert(sB, 'GitHub AlgoViz 150+ Stars', 'international', null, '2025-06-01', '开源项目获得社区认可', 3);

  honorInsert(sC, '市级辩论赛最佳辩手', 'city', '最佳辩手', '2025-02-20', '市级高中英语辩论锦标赛', 1);
  honorInsert(sC, '全国经济学知识竞赛三等奖', 'national', '三等奖', '2025-04-15', '', 2);

  honorInsert(sD, 'THIMUN Honorable Mention', 'international', 'Honorable Mention', '2024-11-04', '新加坡THIMUN模联', 1);
  honorInsert(sD, '汇丰实习优秀实习生', 'international', null, '2025-07-15', '财富管理部门实习表现优秀', 2);

  honorInsert(sE, 'NUS商业案例赛前10', 'international', 'Top 10', '2025-08-12', '全国40队中前10', 1);

  if (s1) honorInsert(s1, '校科技创新展一等奖', 'school', '一等奖', '2025-03-15', '3D打印机械臂项目', 1);
  if (s3) honorInsert(s3, 'UKMT Silver Certificate', 'national', 'Silver', '2024-11-15', '英国高级数学挑战赛银奖', 1);

  // ════════════════════════════════════════════
  //  补全个人陈述
  // ════════════════════════════════════════════
  const appId = (studentId, uniNameLike) => db.get("SELECT a.id FROM applications a WHERE a.student_id=? AND a.uni_name LIKE ?", [studentId, '%'+uniNameLike+'%'])?.id;

  // 陈美琳 — 牛津PS
  const appA1 = appId(sA, '牛津');
  if (appA1) {
    db.run(`INSERT INTO personal_statements (id,student_id,application_id,version,status,q1_content,q2_content,q3_content,word_count,char_count,reviewer_id,review_notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      uuid(), sA, appA1, 2, '已提交',
      'My desire to study Biomedical Sciences stems from a profound curiosity about the mechanisms underlying human disease. Volunteering at a community clinic, I witnessed the gap between scientific knowledge and patient outcomes, igniting my resolve to bridge this divide through research.',
      'Studying CIE A-Level Biology, Chemistry, and Mathematics has provided me with a rigorous scientific foundation. My independent research on the ethics of gene editing deepened my understanding of both the molecular biology of CRISPR and the societal implications of its application.',
      'As vice-president of our school Science Society, I have organised academic seminars and mentored younger students. My 150+ hours of clinical volunteering have reinforced my commitment to medicine and given me insight into the holistic nature of patient care.',
      480, 2900, cId, '二稿终稿，UCAS已提交', now, now
    ]);
  }

  // 赵天宇 — 华威金融PS
  const appD1 = appId(sD, '华威');
  if (appD1) {
    db.run(`INSERT INTO personal_statements (id,student_id,application_id,version,status,q1_content,q2_content,q3_content,word_count,char_count,reviewer_id,review_notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      uuid(), sD, appD1, 2, '已提交',
      'My fascination with finance began when I founded our school Business Society. Organising simulated investment competitions revealed how quantitative analysis and behavioural economics intersect in real market decisions.',
      'Studying A-Level Mathematics and Economics has equipped me with analytical tools essential for finance. My summer internship at HSBC Singapore exposed me to wealth management and portfolio analysis in a professional context.',
      'Leading the school Business Society and participating in THIMUN Model UN have honed my leadership and communication skills. The MUN experience in particular taught me to negotiate complex economic policy positions.',
      420, 2500, cId, '已提交UCAS', now, now
    ]);
  }

  // 林佳怡 — NUS商科PS
  const appE1 = appId(sE, 'NUS');
  if (appE1) {
    db.run(`INSERT INTO personal_statements (id,student_id,application_id,version,status,q1_content,q2_content,q3_content,word_count,char_count,reviewer_id,review_notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      uuid(), sE, appE1, 2, '已提交',
      'Growing up in a multicultural environment has shaped my understanding of how international business transcends borders. I am drawn to NUS Business School for its emphasis on Asian markets and global connectivity.',
      'My academic foundation in Mathematics, Economics, and Biology has given me a unique interdisciplinary perspective. Serving as Student Council Treasurer taught me practical financial management and budget optimisation.',
      'Participating in the NUS Business Case Competition was a transformative experience. Leading my team to a Top 10 finish among 40 teams validated my analytical skills and confirmed my passion for strategic business thinking.',
      450, 2700, cId, 'NUS格式已提交', now, now
    ]);
  }

  // ════════════════════════════════════════════
  //  补全文书 (刘浩然已有，其他学生补)
  // ════════════════════════════════════════════
  // 王雅欣 — LSE PS草稿 (G11早期)
  const appC1 = appId(sC, 'LSE');
  if (appC1) {
    const essayC = uuid();
    db.run(`INSERT INTO essays (id,student_id,application_id,essay_type,title,prompt,word_limit,status,current_version,assigned_reviewer_id,review_deadline,strategy_notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      essayC, sC, appC1, 'personal_statement', 'LSE Economics PS Framework',
      'Write about why you want to study Economics at LSE',
      4000, 'collecting_material', 0, cId, '2026-08-01',
      'G11阶段先积累素材，暑假开始写初稿', now, now
    ]);
  }

  // ════════════════════════════════════════════
  //  补全反馈
  // ════════════════════════════════════════════
  const fbInsert = (sid2, fromRole, fromId, type, content, rating, status) => {
    db.run("INSERT INTO feedback VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [
      uuid(), sid2, fromRole, fromId, type, content, rating, status, null, null, null, now
    ]);
  };

  // 家长反馈
  const parentOf = (studentId) => db.get("SELECT p.id FROM parent_guardians p JOIN student_parents sp ON sp.parent_id=p.id WHERE sp.student_id=? LIMIT 1", [studentId])?.id;

  fbInsert(sA, 'parent', parentOf(sA), '满意度', '对李老师的牛津申请指导非常满意，PS修改很专业。孩子信心增强了很多。', 5, 'reviewed');
  fbInsert(sB, 'parent', parentOf(sB), '疑问', 'MIT被拒后，UCLA的录取概率有多大？是否需要调整选校策略？', 3, 'pending');
  fbInsert(sD, 'parent', parentOf(sD), '满意度', '巴斯的Unconditional Offer来得很及时，感谢老师的指导！', 5, 'reviewed');
  fbInsert(sE, 'student', sE, '阶段反馈', '雅思写作一直提不上去，有点担心NUS的语言要求。希望能有专门的写作辅导。', 3, 'pending');
  if (s1) fbInsert(s1, 'parent', parentOf(s1), '建议', '希望能增加一些工程方向的实习或项目机会推荐。', 4, 'pending');

  // ════════════════════════════════════════════
  //  补全更多沟通记录
  // ════════════════════════════════════════════
  const commInsert = (sid2, staffId, parentId, channel, summary, actions, date) => {
    db.run("INSERT INTO communication_logs VALUES (?,?,?,?,?,?,?,?,?)", [
      uuid(), sid2, staffId, parentId, channel, summary, actions, date, now
    ]);
  };

  commInsert(sA, cId, parentOf(sA), '面谈', '与陈美琳及父亲面谈牛津面试准备事项，讨论模拟面试安排。家长非常配合，已确认12月面试日期。', '安排3次模拟面试', '2025-11-10 14:00:00');
  commInsert(sA, mId, null, '微信', '与陈美琳讨论A2化学有机合成部分的备考重点，建议多做past paper。', '化学有机合成重点练习', '2026-03-15 16:00:00');

  commInsert(sB, cId, parentOf(sB), '面谈', '与刘浩然及父母面谈MIT被拒后的策略调整。建议保持UCLA申请质量，NYU已有Offer作为保底。', '优化UCLA Supplement', '2025-01-20 10:00:00');
  commInsert(sB, mId, null, '微信', '刘浩然A2复习进展：数学和CS稳定，物理需要加强力学部分。', '每周增加2小时物理复习', '2026-03-10 11:00:00');

  commInsert(sC, cId, parentOf(sC), '电话', '与王雅欣父亲通话，讨论G11阶段的规划路径。建议暑假参加经济学夏校或研究项目。', '暑假调研LSE夏校', '2025-04-20 15:00:00');

  commInsert(sD, cId, parentOf(sD), '微信', '赵天宇确认巴斯大学为Firm Choice，华威为Insurance。奖学金申请已提交。', '等待奖学金结果', '2026-03-20 09:30:00');

  commInsert(sE, cId, parentOf(sE), '面谈', '与林佳怡及母亲讨论NUS面试准备。建议重点准备Why NUS和商科案例分析。', '面试模拟安排', '2026-03-05 14:00:00');
  commInsert(sE, mId, null, '微信', '林佳怡雅思写作辅导进展，当前6.5，目标7.0。建议每周写2篇Task 2。', '每周2篇雅思写作练习', '2026-03-18 10:00:00');

  // ════════════════════════════════════════════
  //  补全选科 (所有缺选科的学生)
  // ════════════════════════════════════════════
  const enroll = (sid2, subId, level, board) => {
    if (!sid2 || !subId) return;
    const exists = db.get("SELECT se.id FROM subject_enrollments se WHERE se.student_id=? AND se.subject_id=?", [sid2, subId]);
    if (!exists) db.run("INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)", [uuid(), sid2, subId, level, board, now]);
  };

  // 陈美琳 CIE (医学: Math, Bio, Chem)
  enroll(sA, MATH, 'A2', 'CIE'); enroll(sA, BIO, 'A2', 'CIE'); enroll(sA, CHEM, 'A2', 'CIE');

  // 刘浩然 CIE (CS: Math, CS, Phys)
  enroll(sB, MATH, 'A2', 'CIE'); enroll(sB, CS, 'A2', 'CIE'); enroll(sB, PHYS, 'A2', 'CIE');

  // 王雅欣 CIE G11 (经济: Math, Econ, Hist)
  enroll(sC, MATH, 'AS', 'CIE'); enroll(sC, ECON, 'AS', 'CIE'); enroll(sC, HIST, 'AS', 'CIE');

  // 赵天宇 Edexcel (商科: Math, Econ)
  enroll(sD, MATH, 'A2', 'Edexcel'); enroll(sD, ECON, 'A2', 'Edexcel');

  // 林佳怡 CIE (商科: Math, Econ, Bio)
  enroll(sE, MATH, 'A2', 'CIE'); enroll(sE, ECON, 'A2', 'CIE'); enroll(sE, BIO, 'A2', 'CIE');

  // 张三 Edexcel (工程: Math, Phys, Chem — 已有但可能缺)
  if (s1) { enroll(s1, MATH, 'A2', 'Edexcel'); enroll(s1, PHYS, 'A2', 'Edexcel'); enroll(s1, CHEM, 'A2', 'Edexcel'); }

  // 李四 CIE (心理学方向)
  if (s2) {
    const PSYCH = db.get("SELECT id FROM subjects WHERE code='PSYCH'")?.id;
    enroll(s2, MATH, 'AS', 'CIE');
    enroll(s2, ENG, 'AS', 'CIE');
    if (PSYCH) enroll(s2, PSYCH, 'AS', 'CIE');
    else if (BIO) enroll(s2, BIO, 'AS', 'CIE');
  }

  // 王五 (数学/统计方向)
  if (s3) {
    enroll(s3, MATH, 'A2', 'CIE');
    enroll(s3, PHYS, 'A2', 'CIE');
    enroll(s3, CS, 'AS', 'CIE');
  }

  console.log('✅ 已补全所有学生的缺失数据');
}

module.exports = { seedDemo, enrichExistingStudents };

// 独立运行支持
if (require.main === module) {
  const db = require('./db');
  db.init().then(() => {
    seedDemo(db);
    enrichExistingStudents(db);
    db.save();
    console.log('✅ 演示数据插入完成');
    process.exit(0);
  }).catch(err => {
    console.error('❌ 错误:', err);
    process.exit(1);
  });
}
