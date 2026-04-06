/**
 * migration-demo-students.js
 * 一次性迁移：创建10个详细的演示学生，填充所有关联数据
 * 用于展示系统的所有功能特性
 */

function runMigration(db, uuidv4) {
  // 防止重复执行
  const already = db.get("SELECT value FROM settings WHERE key='migration_demo_students_v2'");
  if (already) return false;

  console.log('[migration] 开始创建10个详细演示学生...');

  const now = new Date().toISOString();
  const today = now.split('T')[0];

  // ── 获取 staff IDs ──
  const counselor = db.get("SELECT id FROM staff WHERE role='counselor' LIMIT 1");
  const mentor = db.get("SELECT id FROM staff WHERE role='mentor' LIMIT 1");
  const counselorId = counselor ? counselor.id : null;
  const mentorId = mentor ? mentor.id : null;

  // ── 获取 subject IDs ──
  function getSubjectId(code) {
    const r = db.get("SELECT id FROM subjects WHERE code=?", [code]);
    return r ? r.id : null;
  }

  // ── 获取/创建 university IDs ──
  function getOrCreateUni(name, country, website) {
    let r = db.get("SELECT id FROM universities WHERE name=?", [name]);
    if (r) return r.id;
    const id = uuidv4();
    db.run("INSERT INTO universities (id,name,country,website) VALUES (?,?,?,?)", [id, name, country, website || '']);
    return id;
  }

  // ══════════════════════════════════════════════════════════
  //  10个演示学生定义
  // ══════════════════════════════════════════════════════════

  const demoStudents = [
    {
      name: '姚可翔', grade: 'G12', board: 'CIE', dob: '2008-03-15', status: 'active',
      notes: '理科尖子生，目标英国G5工程专业。IGCSE全A*，A-Level预估A*A*A。性格沉稳，自驱力强。',
      subjects: [
        { code: 'MATH', level: 'A2' }, { code: 'PHYS', level: 'A2' },
        { code: 'CHEM', level: 'A2' }, { code: 'CS', level: 'AS' }
      ],
      parent: { name: '姚明远', relation: '父亲', phone: '13912345678', email: 'yao.my@example.com', wechat: 'yao_father' },
      parent2: { name: '林晓燕', relation: '母亲', phone: '13912345679', email: 'lin.xy@example.com', wechat: 'lin_mother' },
      targets: [
        { uni: '帝国理工学院 Imperial College London', country: 'UK', tier: '冲刺', dept: 'Mechanical Engineering', rank: 1 },
        { uni: '伦敦大学学院 UCL', country: 'UK', tier: '意向', dept: 'Engineering (Mechanical)', rank: 2 },
        { uni: '曼彻斯特大学 University of Manchester', country: 'UK', tier: '意向', dept: 'Mechanical Engineering', rank: 3 },
        { uni: '巴斯大学 University of Bath', country: 'UK', tier: '保底', dept: 'Mechanical Engineering', rank: 4 },
        { uni: '新加坡国立大学 NUS', country: 'SG', tier: '冲刺', dept: 'Engineering', rank: 5 }
      ],
      applications: [
        { uni: '帝国理工学院 Imperial College London', dept: 'Mechanical Engineering', tier: '冲刺', route: 'UK-UG', cycle: 2026, status: 'applied', offer_type: 'Pending', submit_date: '2025-10-15', deadline: '2025-10-15' },
        { uni: '伦敦大学学院 UCL', dept: 'Engineering (Mechanical)', tier: '意向', route: 'UK-UG', cycle: 2026, status: 'offer', offer_type: 'Conditional', offer_date: '2026-01-20', conditions: 'A*AA including Maths and Physics', submit_date: '2026-01-15', deadline: '2026-01-15', firm: 0 },
        { uni: '曼彻斯特大学 University of Manchester', dept: 'Mechanical Engineering', tier: '意向', route: 'UK-UG', cycle: 2026, status: 'offer', offer_type: 'Conditional', offer_date: '2026-02-10', conditions: 'AAA', submit_date: '2026-01-15', deadline: '2026-01-15', insurance: 1 },
        { uni: '巴斯大学 University of Bath', dept: 'Mechanical Engineering', tier: '保底', route: 'UK-UG', cycle: 2026, status: 'offer', offer_type: 'Unconditional', offer_date: '2026-01-05', submit_date: '2026-01-15', deadline: '2026-01-15' },
        { uni: '新加坡国立大学 NUS', dept: 'Engineering', tier: '冲刺', route: 'SG', cycle: 2026, status: 'applied', offer_type: 'Pending', submit_date: '2026-02-28', deadline: '2026-03-01' }
      ],
      exams: [
        { board: 'CIE', series: 'June', year: 2025, subject: 'Mathematics', code: '9709', predicted: 'A*', actual: 'A*', status: 'result_received' },
        { board: 'CIE', series: 'June', year: 2025, subject: 'Physics', code: '9702', predicted: 'A*', actual: 'A', status: 'result_received' },
        { board: 'CIE', series: 'June', year: 2025, subject: 'Chemistry', code: '9701', predicted: 'A', actual: 'A', status: 'result_received' },
        { board: 'CIE', series: 'June', year: 2026, subject: 'Mathematics (A2)', code: '9709', predicted: 'A*', status: 'registered' },
        { board: 'CIE', series: 'June', year: 2026, subject: 'Physics (A2)', code: '9702', predicted: 'A*', status: 'registered' },
        { board: 'CIE', series: 'June', year: 2026, subject: 'Chemistry (A2)', code: '9701', predicted: 'A', status: 'registered' }
      ],
      tasks: [
        { title: 'UCAS个人陈述终稿提交', cat: '申请', due: '2025-10-01', status: 'done', priority: 'high', completed: '2025-09-28T10:30:00Z' },
        { title: '帝国理工学院面试准备', cat: '面试', due: '2025-12-15', status: 'done', priority: 'high', completed: '2025-12-14T09:00:00Z' },
        { title: '雅思考试 (目标7.0+)', cat: '考试', due: '2025-08-20', status: 'done', priority: 'high', completed: '2025-08-20T16:00:00Z' },
        { title: 'UCL Firm Choice回复', cat: '申请', due: '2026-06-05', status: 'in_progress', priority: 'high' },
        { title: '签证材料准备', cat: '材料', due: '2026-07-15', status: 'pending', priority: 'normal' },
        { title: '住宿申请 (UCL Halls)', cat: '其他', due: '2026-06-30', status: 'pending', priority: 'normal' },
        { title: 'A2成绩出分跟踪', cat: '考试', due: '2026-08-15', status: 'pending', priority: 'high' },
        { title: '开学前体检与疫苗', cat: '材料', due: '2026-08-01', status: 'pending', priority: 'low' }
      ],
      materials: [
        { type: '成绩单', title: 'IGCSE成绩单 (8A*)', status: '已提交', submitted: '2025-09-15' },
        { type: '成绩单', title: 'AS Level成绩单', status: '已提交', submitted: '2025-10-01' },
        { type: '推荐信', title: '物理老师推荐信 (Mr. Chen)', status: '已提交', submitted: '2025-10-10' },
        { type: '推荐信', title: '数学老师推荐信 (Ms. Wang)', status: '已审核', reviewed: '2025-09-20' },
        { type: '个人陈述', title: 'UCAS Personal Statement', status: '已提交', submitted: '2025-10-15' },
        { type: '活动证明', title: '全国物理竞赛获奖证书', status: '已上传' },
        { type: '其他', title: '雅思成绩单 (Overall 7.5)', status: '已提交', submitted: '2025-09-01' },
        { type: '其他', title: '护照扫描件', status: '已上传' }
      ],
      ps: { status: '已提交', q1: '自幼对机械运动着迷，从拆装玩具到3D打印机器人，工程设计思维融入我的日常。高中期间参与学校机器人社团，带领团队获得RoboCup区域赛亚军，这段经历坚定了我追求机械工程的决心。', q2: 'A-Level数学和物理均保持年级前3%，对力学和热力学领域有深入的课外研究。通过Coursera完成MIT的Intro to Engineering课程，并以96%的成绩获得证书。', q3: '创办学校STEM社团（50+成员），组织了3场校际科技展。暑假参与新加坡NUS工程学院夏令营，完成桥梁设计课题。担任学校环保委员会主席，设计并推广校园节能方案。', wordCount: 620, charCount: 3850 },
      comms: [
        { channel: '面谈', summary: '首次规划咨询：确认目标为英国G5工程专业，讨论选课策略和时间线', date: '2025-03-15', actions: '制定选课方案、确认IELTS考试日期' },
        { channel: '微信', summary: 'AS成绩出炉，数学A物理A化学A，整体表现优秀。讨论A2冲刺策略', date: '2025-08-18', actions: '调整A2复习计划，增加物理实验复习时间' },
        { channel: '邮件', summary: '帝国理工面试邀请通知，讨论面试准备策略', date: '2025-11-20', actions: '安排3次模拟面试、发送面试准备资料' },
        { channel: '面谈', summary: '面试复盘：表现良好，技术问题回答扎实，需加强对学校特色的了解', date: '2025-12-18', actions: '持续关注申请进度' },
        { channel: '电话', summary: '家长电话：了解UCL offer条件，讨论firm/insurance选择策略', date: '2026-02-15', actions: '发送offer对比分析报告' },
        { channel: '微信', summary: '确认UCL为firm choice, Manchester为insurance。开始准备签证材料', date: '2026-03-20', actions: '发送签证材料清单、预约CAS出具' }
      ],
      assessments: [
        { type: 'IELTS', subject: 'English', score: 7.5, max: 9, date: '2025-08-20', notes: 'L:8.0 R:7.5 W:7.0 S:7.0' },
        { type: '入学测试', subject: 'Mathematics', score: 92, max: 100, date: '2025-02-10', notes: '入学数学摸底测试' },
        { type: '入学测试', subject: 'Physics', score: 88, max: 100, date: '2025-02-10', notes: '入学物理摸底测试' }
      ],
      consent: { guardian: '姚明远', relation: '父亲', scope: '["data_storage","counseling","sharing_external"]', date: '2025-03-01' },
      feedback: [
        { from_role: 'parent', type: '阶段反馈', content: '非常满意李老师的规划建议，孩子现在方向很明确，信心十足。面试辅导非常专业。', rating: 5, status: 'reviewed', response: '感谢姚爸爸的信任！可翔同学非常优秀，我们会继续跟进申请进度。' },
        { from_role: 'student', type: '建议', content: '希望能有更多模拟面试的机会，每次练习都让我有很大进步。', rating: 4, status: 'resolved', response: '已安排每两周一次的面试练习，并新增了同伴互评环节。' }
      ],
      activities: [
        { category: 'academic_competition', name: '全国高中物理竞赛', org: '中国物理学会', role: '参赛选手', start: '2024-09-01', end: '2024-12-15', hours: 8, weeks: 14, impact: 'national', desc: '备战全国物理竞赛复赛，系统学习大学物理力学与电磁学内容', achievements: '省级一等奖，全国三等奖', tags: '["Engineering","Physics"]' },
        { category: 'club_leadership', name: '校STEM创新社', org: 'ESIC', role: '社长', start: '2024-09-01', end: '2026-06-30', hours: 4, weeks: 40, impact: 'school', desc: '创办并管理STEM社团，组织科技展、编程马拉松和工程挑战赛', achievements: '社团成员从12人增长到55人，举办3场校际科技展', tags: '["Engineering","Leadership"]' },
        { category: 'research', name: 'NUS工程学院暑期研究项目', org: '新加坡国立大学', role: '研究助理', start: '2025-06-15', end: '2025-07-31', hours: 35, weeks: 7, impact: 'international', desc: '参与复合材料桥梁设计课题，使用有限元分析软件进行结构优化', achievements: '完成研究报告并在结业典礼上展示，获导师推荐信', tags: '["Engineering","Research"]' },
        { category: 'volunteer', name: '社区科学教育志愿者', org: '阳光社区中心', role: '讲师', start: '2024-03-01', end: '2025-12-31', hours: 3, weeks: 40, impact: 'city', desc: '每周为社区小学生设计并讲授趣味科学实验课程', achievements: '累计服务120+小时，受益学生200+人次', tags: '["Education","Community"]' },
        { category: 'personal_project', name: '3D打印自动浇灌系统', org: '', role: '设计者', start: '2025-01-01', end: '2025-04-30', hours: 6, weeks: 16, impact: 'school', desc: '自主设计并3D打印基于Arduino的自动植物浇灌系统，包含湿度传感器和手机APP控制', achievements: '项目被学校官网报道，并部署在校园温室中使用', tags: '["Engineering","IoT"]' }
      ],
      honors: [
        { name: '全国高中物理竞赛三等奖', level: 'national', rank: '三等奖', date: '2024-12-20', desc: '全国高中物理竞赛复赛' },
        { name: '省级物理竞赛一等奖', level: 'province', rank: '一等奖', date: '2024-11-10', desc: '省级选拔赛最高奖' },
        { name: 'RoboCup Junior区域赛亚军', level: 'city', rank: '亚军', date: '2025-03-15', desc: '机器人足球赛华东赛区' },
        { name: '校长奖学金', level: 'school', rank: '一等', date: '2025-07-01', desc: '年度综合表现最优秀学生' }
      ],
      essays: [
        { type: 'personal_statement', title: 'UCAS Personal Statement - Mechanical Engineering', prompt: 'Write about your motivation for studying Mechanical Engineering', wordLimit: 4000, status: 'submitted', strategy: '突出物理竞赛经历+NUS研究项目+STEM社团领导力，展现对工程的热情和实践能力',
          versions: [
            { content: '第一稿：从童年拆装玩具的好奇心出发...（初稿侧重个人故事）', words: 580, summary: '初稿完成，主线为个人成长故事' },
            { content: '第二稿：加强了学术深度，增加了NUS研究经历的具体描述和反思...', words: 610, summary: '增加学术深度和具体细节' },
            { content: '终稿：精炼语言，突出工程思维在不同场景中的应用，首尾呼应...', words: 620, summary: '终稿打磨，确保结构完整' }
          ]
        },
        { type: 'supplement', title: 'NUS Engineering Supplementary Essay', prompt: 'Why NUS Engineering? How will you contribute?', wordLimit: 500, status: 'final', strategy: '强调NUS暑期研究经历的亲身体验，展示对新加坡工程教育的深入了解',
          versions: [
            { content: '去年夏天在NUS工程学院的研究经历让我对这里的教学理念有了切身体会...', words: 480, summary: '完成初稿' }
          ]
        }
      ]
    },

    {
      name: '陈雨桐', grade: 'G12', board: 'Edexcel', dob: '2008-07-22', status: 'active',
      notes: '文科才女，目标英国经济学专业。写作能力突出，辩论队主力。IELTS 8.0。',
      subjects: [
        { code: 'MATH', level: 'A2' }, { code: 'ECON', level: 'A2' },
        { code: 'HIST', level: 'A2' }
      ],
      parent: { name: '陈建国', relation: '父亲', phone: '13811112222', email: 'chen.jg@example.com', wechat: 'chen_father' },
      targets: [
        { uni: '伦敦政治经济学院 LSE', country: 'UK', tier: '冲刺', dept: 'Economics', rank: 1 },
        { uni: '伦敦大学学院 UCL', country: 'UK', tier: '意向', dept: 'Economics', rank: 2 },
        { uni: '华威大学 University of Warwick', country: 'UK', tier: '意向', dept: 'Economics', rank: 3 },
        { uni: '利兹大学 University of Leeds', country: 'UK', tier: '保底', dept: 'Economics and Finance', rank: 4 }
      ],
      applications: [
        { uni: '伦敦政治经济学院 LSE', dept: 'Economics', tier: '冲刺', route: 'UK-UG', cycle: 2026, status: 'applied', offer_type: 'Pending', submit_date: '2026-01-15', deadline: '2026-01-15' },
        { uni: '伦敦大学学院 UCL', dept: 'Economics', tier: '意向', route: 'UK-UG', cycle: 2026, status: 'offer', offer_type: 'Conditional', offer_date: '2026-02-28', conditions: 'A*AA with A* in Maths', submit_date: '2026-01-15', deadline: '2026-01-15', firm: 1 },
        { uni: '华威大学 University of Warwick', dept: 'Economics', tier: '意向', route: 'UK-UG', cycle: 2026, status: 'offer', offer_type: 'Conditional', offer_date: '2026-02-15', conditions: 'AAA', submit_date: '2026-01-15', deadline: '2026-01-15' },
        { uni: '利兹大学 University of Leeds', dept: 'Economics and Finance', tier: '保底', route: 'UK-UG', cycle: 2026, status: 'offer', offer_type: 'Unconditional', offer_date: '2026-01-20', submit_date: '2026-01-15', deadline: '2026-01-15' }
      ],
      exams: [
        { board: 'Edexcel', series: 'June', year: 2025, subject: 'Mathematics', code: '9MA0', predicted: 'A*', actual: 'A*', status: 'result_received' },
        { board: 'Edexcel', series: 'June', year: 2025, subject: 'Economics', code: '9EC0', predicted: 'A', actual: 'A', status: 'result_received' },
        { board: 'Edexcel', series: 'June', year: 2026, subject: 'Mathematics (A2)', code: '9MA0', predicted: 'A*', status: 'registered' },
        { board: 'Edexcel', series: 'June', year: 2026, subject: 'Economics (A2)', code: '9EC0', predicted: 'A*', status: 'registered' },
        { board: 'Edexcel', series: 'June', year: 2026, subject: 'History (A2)', code: '9HI0', predicted: 'A', status: 'registered' }
      ],
      tasks: [
        { title: 'UCAS个人陈述完成', cat: '申请', due: '2025-10-01', status: 'done', priority: 'high', completed: '2025-09-25T14:00:00Z' },
        { title: 'TSA考试准备 (LSE)', cat: '考试', due: '2025-11-05', status: 'done', priority: 'high', completed: '2025-11-05T16:00:00Z' },
        { title: 'UCL Firm回复', cat: '申请', due: '2026-06-05', status: 'in_progress', priority: 'high' },
        { title: 'Warwick STEP数学测试', cat: '考试', due: '2026-06-20', status: 'pending', priority: 'normal' },
        { title: 'A2经济学复习计划', cat: '考试', due: '2026-05-01', status: 'in_progress', priority: 'high' }
      ],
      materials: [
        { type: '成绩单', title: 'GCSE成绩单 (7A* 2A)', status: '已提交', submitted: '2025-09-15' },
        { type: '推荐信', title: '经济老师推荐信', status: '已提交', submitted: '2025-10-05' },
        { type: '个人陈述', title: 'UCAS PS - Economics', status: '已提交', submitted: '2025-10-15' },
        { type: '其他', title: '雅思成绩单 (Overall 8.0)', status: '已提交', submitted: '2025-09-10' }
      ],
      comms: [
        { channel: '面谈', summary: '首次咨询，确定目标为经济学方向，讨论LSE的竞争力和TSA准备策略', date: '2025-03-10', actions: '制定申请时间线、推荐经济学课外阅读书目' },
        { channel: '微信', summary: 'TSA考试结束，感觉发挥不错。等待成绩中', date: '2025-11-06', actions: '关注成绩发布' },
        { channel: '面谈', summary: 'UCL发来conditional offer，与家长一起讨论择校策略', date: '2026-03-05', actions: '准备firm choice确认' }
      ],
      assessments: [
        { type: 'IELTS', subject: 'English', score: 8.0, max: 9, date: '2025-07-15', notes: 'L:8.5 R:8.0 W:7.5 S:7.5' },
        { type: 'TSA', subject: 'Thinking Skills', score: 72, max: 100, date: '2025-11-05', notes: 'LSE/Oxford经济学入学考试' }
      ],
      consent: { guardian: '陈建国', relation: '父亲', scope: '["data_storage","counseling"]', date: '2025-03-05' },
      activities: [
        { category: 'academic_competition', name: '全国中学生经济学挑战赛 NEC', org: 'Council for Economic Education', role: '队长', start: '2024-10-01', end: '2025-04-15', hours: 6, weeks: 24, impact: 'national', desc: '带队参加NEC全国总决赛，负责宏观经济模块', achievements: '全国银奖，个人单项金奖（宏观经济学）', tags: '["Economics"]' },
        { category: 'club_leadership', name: '校辩论队', org: 'ESIC', role: '队长', start: '2024-09-01', end: '2026-06-30', hours: 5, weeks: 40, impact: 'city', desc: '组织训练、参加校际辩论赛，训练批判性思维', achievements: '市级辩论赛冠军，最佳辩手', tags: '["Critical Thinking","Public Speaking"]' },
        { category: 'internship', name: '投行研习项目', org: '中信证券', role: '实习生', start: '2025-07-01', end: '2025-07-31', hours: 35, weeks: 4, impact: 'national', desc: '参与行业研究部门实习，学习财务报表分析和行业报告撰写', achievements: '独立完成一份消费行业研究报告', tags: '["Economics","Finance"]' }
      ],
      honors: [
        { name: 'NEC全国银奖', level: 'national', rank: '银奖', date: '2025-04-15', desc: '全国中学生经济学挑战赛' },
        { name: '市级辩论赛冠军暨最佳辩手', level: 'city', rank: '冠军', date: '2025-05-20', desc: '上海市高中生英语辩论赛' }
      ],
      feedback: [
        { from_role: 'parent', type: '阶段反馈', content: '老师们的规划非常专业，特别是TSA考试的备考指导帮助很大。', rating: 5, status: 'reviewed', response: '感谢陈先生的认可，雨桐同学表现一直很稳定！' }
      ],
      essays: [
        { type: 'personal_statement', title: 'UCAS PS - Economics', prompt: 'Why Economics?', wordLimit: 4000, status: 'submitted', strategy: '从NEC竞赛经历引入，结合实习体验展示经济学兴趣的广度和深度',
          versions: [
            { content: '初稿：从经济新闻关注出发，引入NEC竞赛经历...', words: 590, summary: '初稿完成' },
            { content: '终稿：增强实习经历与学术兴趣的逻辑连接，突出批判性思维...', words: 615, summary: '终稿完善' }
          ]
        }
      ]
    },

    {
      name: '张天翔', grade: 'G11', board: 'CIE', dob: '2009-01-08', status: 'active',
      notes: '全面发展型学生，目标计算机科学。编程能力突出，参加过多次黑客马拉松。',
      subjects: [
        { code: 'MATH', level: 'AS' }, { code: 'CS', level: 'AS' },
        { code: 'PHYS', level: 'AS' }
      ],
      parent: { name: '张伟', relation: '父亲', phone: '13700001111', email: 'zhang.w@example.com', wechat: 'zhangwei_dad' },
      targets: [
        { uni: '牛津大学 University of Oxford', country: 'UK', tier: '冲刺', dept: 'Computer Science', rank: 1 },
        { uni: '帝国理工学院 Imperial College London', country: 'UK', tier: '意向', dept: 'Computing', rank: 2 },
        { uni: '伦敦大学学院 UCL', country: 'UK', tier: '意向', dept: 'Computer Science', rank: 3 }
      ],
      applications: [],
      exams: [
        { board: 'CIE', series: 'June', year: 2026, subject: 'Mathematics (AS)', code: '9709', predicted: 'A', status: 'registered' },
        { board: 'CIE', series: 'June', year: 2026, subject: 'Computer Science (AS)', code: '9618', predicted: 'A', status: 'registered' },
        { board: 'CIE', series: 'June', year: 2026, subject: 'Physics (AS)', code: '9702', predicted: 'A', status: 'registered' }
      ],
      tasks: [
        { title: 'AS课程选科确认', cat: '其他', due: '2025-09-15', status: 'done', priority: 'high', completed: '2025-09-10T09:00:00Z' },
        { title: 'IGCSE成绩单提交', cat: '材料', due: '2025-10-01', status: 'done', priority: 'normal', completed: '2025-09-28T14:00:00Z' },
        { title: '确定目标院校初步名单', cat: '申请', due: '2026-03-01', status: 'done', priority: 'normal', completed: '2026-02-25T10:00:00Z' },
        { title: 'IELTS首考', cat: '考试', due: '2026-06-15', status: 'in_progress', priority: 'high' },
        { title: '个人陈述头脑风暴', cat: '申请', due: '2026-05-01', status: 'in_progress', priority: 'normal' },
        { title: 'GitHub项目整理 (申请作品集)', cat: '材料', due: '2026-07-01', status: 'pending', priority: 'normal' },
        { title: '暑期科研项目申请', cat: '其他', due: '2026-04-30', status: 'in_progress', priority: 'high' }
      ],
      materials: [
        { type: '成绩单', title: 'IGCSE成绩单 (7A* 1A)', status: '已上传' },
        { type: '活动证明', title: '黑客马拉松获奖证书', status: '已上传' }
      ],
      comms: [
        { channel: '面谈', summary: '初次规划会议，讨论CS方向的选课、竞赛和项目规划', date: '2025-09-20', actions: '参加USACO训练、准备GitHub作品集' },
        { channel: '微信', summary: '确认暑期研究项目申请方向：机器学习/自然语言处理', date: '2026-03-15', actions: '完善申请材料，联系导师' }
      ],
      assessments: [
        { type: '入学测试', subject: 'Mathematics', score: 95, max: 100, date: '2025-08-15', notes: '数学基础扎实' },
        { type: '入学测试', subject: 'Computer Science', score: 90, max: 100, date: '2025-08-15', notes: '编程逻辑优秀' }
      ],
      consent: { guardian: '张伟', relation: '父亲', scope: '["data_storage","counseling","sharing_external"]', date: '2025-09-01' },
      activities: [
        { category: 'academic_competition', name: 'USACO美国计算机奥赛', org: 'USACO', role: '参赛选手', start: '2024-12-01', end: '2025-03-31', hours: 10, weeks: 16, impact: 'international', desc: '在线参加USACO月赛，训练算法和数据结构', achievements: '晋升至Gold级别', tags: '["Computer Science","Algorithms"]' },
        { category: 'personal_project', name: '校园AI助手ChatBot', org: '', role: '开发者', start: '2025-09-01', end: '2026-02-28', hours: 8, weeks: 24, impact: 'school', desc: '使用Python和OpenAI API开发校园问答机器人，集成课表查询和成绩提醒功能', achievements: '全校500+用户使用，被学校IT部门正式采纳', tags: '["Computer Science","AI"]' }
      ],
      honors: [
        { name: 'USACO Gold级别', level: 'international', rank: 'Gold', date: '2025-02-15', desc: '美国计算机奥林匹克竞赛' }
      ],
      feedback: [],
      essays: []
    },

    {
      name: '李思雨', grade: 'G12', board: 'Edexcel', dob: '2008-05-30', status: 'active',
      notes: '艺术与学术兼修，目标建筑学。作品集精美，空间想象力出色。',
      subjects: [
        { code: 'MATH', level: 'A2' }, { code: 'PHYS', level: 'A2' },
        { code: 'CS', level: 'AS' }
      ],
      parent: { name: '李华', relation: '母亲', phone: '13600003333', email: 'li.hua@example.com', wechat: 'lihua_mom' },
      targets: [
        { uni: '伦敦大学学院 UCL', country: 'UK', tier: '冲刺', dept: 'Architecture (Bartlett)', rank: 1 },
        { uni: '曼彻斯特大学 University of Manchester', country: 'UK', tier: '意向', dept: 'Architecture', rank: 2 },
        { uni: '巴斯大学 University of Bath', country: 'UK', tier: '保底', dept: 'Architecture', rank: 3 }
      ],
      applications: [
        { uni: '伦敦大学学院 UCL', dept: 'Architecture (Bartlett)', tier: '冲刺', route: 'UK-UG', cycle: 2026, status: 'applied', offer_type: 'Pending', submit_date: '2026-01-15', deadline: '2026-01-15' },
        { uni: '曼彻斯特大学 University of Manchester', dept: 'Architecture', tier: '意向', route: 'UK-UG', cycle: 2026, status: 'offer', offer_type: 'Conditional', offer_date: '2026-03-01', conditions: 'AAB', submit_date: '2026-01-15', deadline: '2026-01-15' },
        { uni: '巴斯大学 University of Bath', dept: 'Architecture', tier: '保底', route: 'UK-UG', cycle: 2026, status: 'offer', offer_type: 'Unconditional', offer_date: '2026-02-10', submit_date: '2026-01-15', deadline: '2026-01-15' }
      ],
      exams: [
        { board: 'Edexcel', series: 'June', year: 2025, subject: 'Mathematics', code: '9MA0', predicted: 'A', actual: 'A', status: 'result_received' },
        { board: 'Edexcel', series: 'June', year: 2025, subject: 'Physics', code: '9PH0', predicted: 'B', actual: 'A', status: 'result_received' },
        { board: 'Edexcel', series: 'June', year: 2026, subject: 'Mathematics (A2)', code: '9MA0', predicted: 'A', status: 'registered' }
      ],
      tasks: [
        { title: '建筑作品集完善 (12页)', cat: '材料', due: '2025-12-15', status: 'done', priority: 'high', completed: '2025-12-10T18:00:00Z' },
        { title: 'Bartlett面试准备', cat: '面试', due: '2026-03-20', status: 'in_progress', priority: 'high' },
        { title: 'A2数学冲刺复习', cat: '考试', due: '2026-05-15', status: 'in_progress', priority: 'normal' }
      ],
      materials: [
        { type: '个人陈述', title: 'Architecture PS', status: '已提交', submitted: '2025-10-15' },
        { type: '活动证明', title: '建筑设计作品集 PDF', status: '已提交', submitted: '2025-12-20' },
        { type: '推荐信', title: '美术老师推荐信', status: '已提交', submitted: '2025-10-10' }
      ],
      comms: [
        { channel: '面谈', summary: '确定建筑学方向，讨论作品集策略和目标院校', date: '2025-04-10', actions: '开始作品集制作，联系建筑专业顾问' },
        { channel: '微信', summary: 'Bartlett面试邀请到来，讨论作品展示策略', date: '2026-03-05', actions: '准备面试PPT和作品讲解' }
      ],
      assessments: [
        { type: 'IELTS', subject: 'English', score: 7.0, max: 9, date: '2025-09-20', notes: 'L:7.5 R:7.0 W:6.5 S:7.0' }
      ],
      consent: { guardian: '李华', relation: '母亲', scope: '["data_storage","counseling"]', date: '2025-04-01' },
      activities: [
        { category: 'arts', name: '建筑设计工作坊', org: 'AA School London (线上)', role: '学员', start: '2025-03-01', end: '2025-05-31', hours: 6, weeks: 12, impact: 'international', desc: '参加AA建筑联盟线上工作坊，学习参数化设计', achievements: '完成3个概念设计项目', tags: '["Architecture","Design"]' },
        { category: 'volunteer', name: '老城区文化遗产保护调查', org: '市文化保护协会', role: '志愿者', start: '2024-07-01', end: '2024-08-31', hours: 15, weeks: 8, impact: 'city', desc: '参与老建筑调查、测绘和记录，制作保护方案', achievements: '调查报告被协会采纳，测绘图纸入档', tags: '["Architecture","Heritage"]' }
      ],
      honors: [
        { name: '全国中学生建筑模型大赛二等奖', level: 'national', rank: '二等奖', date: '2025-05-20', desc: '建筑模型设计与制作' }
      ],
      feedback: [
        { from_role: 'student', type: '阶段反馈', content: '感谢老师帮我联系到了AA工作坊的机会，对我的作品集提升很大！', rating: 5, status: 'reviewed', response: '思雨的作品集非常出色，继续保持！' }
      ],
      essays: [
        { type: 'personal_statement', title: 'Architecture PS', prompt: 'Why Architecture?', wordLimit: 4000, status: 'submitted', strategy: '从文化遗产保护经历引入，展示对建筑空间与人文关系的思考',
          versions: [
            { content: '初稿...', words: 600, summary: '初稿' },
            { content: '终稿...', words: 625, summary: '终稿润色' }
          ]
        }
      ]
    },

    {
      name: '王浩然', grade: 'G11', board: 'CIE', dob: '2009-06-18', status: 'active',
      notes: '体育特长生，目标美国大学。田径（短跑）达到国家二级运动员水平，学术成绩中上。',
      subjects: [
        { code: 'MATH', level: 'AS' }, { code: 'BIO', level: 'AS' },
        { code: 'CHEM', level: 'AS' }
      ],
      parent: { name: '王刚', relation: '父亲', phone: '13500004444', email: 'wang.g@example.com', wechat: 'wanggang' },
      targets: [
        { uni: '加州大学洛杉矶分校 UCLA', country: 'US', tier: '冲刺', dept: 'Kinesiology', rank: 1 },
        { uni: '纽约大学 NYU', country: 'US', tier: '意向', dept: 'Sports Management', rank: 2 }
      ],
      applications: [],
      exams: [
        { board: 'CIE', series: 'June', year: 2026, subject: 'Mathematics (AS)', code: '9709', predicted: 'B', status: 'registered' },
        { board: 'CIE', series: 'June', year: 2026, subject: 'Biology (AS)', code: '9700', predicted: 'B', status: 'registered' }
      ],
      tasks: [
        { title: 'SAT首考报名', cat: '考试', due: '2026-05-01', status: 'in_progress', priority: 'high' },
        { title: '运动员简历视频制作', cat: '材料', due: '2026-06-01', status: 'pending', priority: 'normal' },
        { title: 'TOEFL备考（目标90+）', cat: '考试', due: '2026-08-01', status: 'pending', priority: 'high' },
        { title: '课外活动清单整理 (Common App)', cat: '材料', due: '2026-07-01', status: 'pending', priority: 'normal' }
      ],
      materials: [
        { type: '成绩单', title: 'IGCSE成绩单', status: '已上传' },
        { type: '活动证明', title: '国家二级运动员证书', status: '已上传' }
      ],
      comms: [
        { channel: '面谈', summary: '首次规划：讨论美国大学申请路线，体育特长的优势利用', date: '2025-10-01', actions: '制定SAT/TOEFL备考时间线，调研NCAA D1院校' }
      ],
      assessments: [
        { type: '入学测试', subject: 'Mathematics', score: 72, max: 100, date: '2025-08-15', notes: '数学基础需加强' }
      ],
      consent: { guardian: '王刚', relation: '父亲', scope: '["data_storage","counseling","sharing_external"]', date: '2025-10-01' },
      activities: [
        { category: 'sports', name: '校田径队（短跑）', org: 'ESIC', role: '主力队员', start: '2023-09-01', end: '2026-06-30', hours: 12, weeks: 44, impact: 'national', desc: '100m/200m短跑专项训练，代表学校参加各级比赛', achievements: '省运会100m第三名，达到国家二级运动员标准', tags: '["Athletics","Leadership"]' },
        { category: 'volunteer', name: '特殊奥林匹克教练志愿者', org: 'Special Olympics', role: '助理教练', start: '2024-09-01', end: '2025-08-31', hours: 3, weeks: 40, impact: 'city', desc: '协助智力障碍运动员进行田径训练', achievements: '帮助3名运动员达到参赛标准', tags: '["Sports","Community Service"]' }
      ],
      honors: [
        { name: '省运会100m短跑第三名', level: 'province', rank: '第三名', date: '2025-04-10', desc: '省级青少年田径运动会' },
        { name: '国家二级运动员', level: 'national', rank: '二级', date: '2025-05-01', desc: '100m成绩达标' }
      ],
      feedback: [],
      essays: []
    },

    {
      name: '刘欣怡', grade: 'G12', board: 'CIE', dob: '2008-09-12', status: 'active',
      notes: '目标医学方向，新加坡NUS/NTU为首选。生物化学成绩优异，有医院志愿者经历。',
      subjects: [
        { code: 'BIO', level: 'A2' }, { code: 'CHEM', level: 'A2' },
        { code: 'MATH', level: 'A2' }
      ],
      parent: { name: '刘强', relation: '父亲', phone: '13400005555', email: 'liu.q@example.com', wechat: 'liuqiang55' },
      parent2: { name: '赵敏', relation: '母亲', phone: '13400005556', email: 'zhao.m@example.com', wechat: 'zhaomin_mom' },
      targets: [
        { uni: '新加坡国立大学 NUS', country: 'SG', tier: '冲刺', dept: 'Medicine (Yong Loo Lin)', rank: 1 },
        { uni: '南洋理工大学 NTU', country: 'SG', tier: '意向', dept: 'Biological Sciences', rank: 2 },
        { uni: '伦敦国王学院 King\'s College London', country: 'UK', tier: '意向', dept: 'Biomedical Science', rank: 3 },
        { uni: '伦敦大学学院 UCL', country: 'UK', tier: '保底', dept: 'Biomedical Sciences', rank: 4 }
      ],
      applications: [
        { uni: '新加坡国立大学 NUS', dept: 'Medicine', tier: '冲刺', route: 'SG', cycle: 2026, status: 'applied', offer_type: 'Pending', submit_date: '2026-02-28', deadline: '2026-03-01' },
        { uni: '南洋理工大学 NTU', dept: 'Biological Sciences', tier: '意向', route: 'SG', cycle: 2026, status: 'applied', offer_type: 'Pending', submit_date: '2026-02-28', deadline: '2026-03-15' },
        { uni: '伦敦国王学院 King\'s College London', dept: 'Biomedical Science', tier: '意向', route: 'UK-UG', cycle: 2026, status: 'offer', offer_type: 'Conditional', offer_date: '2026-03-10', conditions: 'AAA including Biology and Chemistry', submit_date: '2026-01-15', deadline: '2026-01-15' }
      ],
      exams: [
        { board: 'CIE', series: 'June', year: 2025, subject: 'Biology', code: '9700', predicted: 'A*', actual: 'A*', status: 'result_received' },
        { board: 'CIE', series: 'June', year: 2025, subject: 'Chemistry', code: '9701', predicted: 'A', actual: 'A', status: 'result_received' },
        { board: 'CIE', series: 'June', year: 2025, subject: 'Mathematics', code: '9709', predicted: 'A', actual: 'A', status: 'result_received' },
        { board: 'CIE', series: 'June', year: 2026, subject: 'Biology (A2)', code: '9700', predicted: 'A*', status: 'registered' },
        { board: 'CIE', series: 'June', year: 2026, subject: 'Chemistry (A2)', code: '9701', predicted: 'A*', status: 'registered' }
      ],
      tasks: [
        { title: 'BMAT考试准备', cat: '考试', due: '2025-11-01', status: 'done', priority: 'high', completed: '2025-11-01T16:00:00Z' },
        { title: 'NUS医学院面试', cat: '面试', due: '2026-04-15', status: 'pending', priority: 'high' },
        { title: 'A2生物复习计划', cat: '考试', due: '2026-05-01', status: 'in_progress', priority: 'high' },
        { title: '医院志愿者经历总结报告', cat: '材料', due: '2026-03-01', status: 'done', priority: 'normal', completed: '2026-02-25T10:00:00Z' }
      ],
      materials: [
        { type: '成绩单', title: 'AS Level成绩单', status: '已提交', submitted: '2025-10-01' },
        { type: '推荐信', title: '生物老师推荐信', status: '已提交', submitted: '2025-10-10' },
        { type: '活动证明', title: '医院志愿者服务证明 (200小时)', status: '已上传' },
        { type: '其他', title: 'BMAT成绩单', status: '已提交', submitted: '2025-12-01' }
      ],
      comms: [
        { channel: '面谈', summary: '讨论医学方向申请策略，NUS医学院竞争激烈需全面准备', date: '2025-04-15', actions: '准备BMAT、积累志愿者经历' },
        { channel: '微信', summary: 'BMAT成绩出来了：5.5/5.0/3A，不错的成绩', date: '2025-12-10', actions: '提交NUS申请' },
        { channel: '电话', summary: '家长来电确认NUS面试准备安排', date: '2026-03-25', actions: '安排模拟面试（MMI格式）' }
      ],
      assessments: [
        { type: 'IELTS', subject: 'English', score: 7.0, max: 9, date: '2025-08-15', notes: 'L:7.5 R:7.0 W:6.5 S:7.0' },
        { type: 'BMAT', subject: 'Biomedical', score: 5.5, max: 9, date: '2025-11-01', notes: 'Section 1: 5.5, Section 2: 5.0, Section 3: 3A' }
      ],
      consent: { guardian: '刘强', relation: '父亲', scope: '["data_storage","counseling","sharing_external"]', date: '2025-04-10' },
      activities: [
        { category: 'volunteer', name: '市中心医院志愿者', org: '市第一人民医院', role: '志愿者', start: '2024-06-01', end: '2025-08-31', hours: 4, weeks: 52, impact: 'city', desc: '在急诊室和儿科病房协助护士工作，陪伴患者', achievements: '累计服务200+小时，获优秀志愿者称号', tags: '["Medicine","Community Service"]' },
        { category: 'research', name: '抗生素耐药性研究项目', org: '中学生科学创新项目', role: '研究员', start: '2025-01-01', end: '2025-06-30', hours: 6, weeks: 24, impact: 'province', desc: '研究常见细菌的抗生素耐药机制，进行实验和数据分析', achievements: '论文入选省级青少年科技创新大赛', tags: '["Biology","Medicine","Research"]' }
      ],
      honors: [
        { name: '省级青少年科技创新大赛二等奖', level: 'province', rank: '二等奖', date: '2025-07-15', desc: '抗生素耐药性研究项目' },
        { name: '优秀医院志愿者', level: 'city', rank: '优秀', date: '2025-09-01', desc: '市第一人民医院年度表彰' }
      ],
      feedback: [
        { from_role: 'parent', type: '满意度', content: '对BMAT备考辅导非常满意，老师的经验帮助孩子有效提分。', rating: 4, status: 'reviewed', response: '欣怡非常努力，面试准备也会同样认真对待！' }
      ],
      essays: [
        { type: 'personal_statement', title: 'Medical School PS', prompt: 'Why Medicine?', wordLimit: 4000, status: 'submitted', strategy: '从医院志愿者经历引入，展示对医学的热情和对患者的关怀',
          versions: [
            { content: '在医院急诊室的200个小时里，我见证了生命的脆弱与坚韧...', words: 600, summary: '初稿' },
            { content: '终稿：结合研究项目经历，展示科研素养与人文关怀的结合...', words: 635, summary: '终稿' }
          ]
        }
      ]
    },

    {
      name: '赵明轩', grade: 'G10', board: 'CIE', dob: '2010-02-14', status: 'active',
      notes: '新生，O-Level课程。数学天赋很高但英语基础薄弱，需要重点辅导语言能力。',
      subjects: [
        { code: 'MATH', level: 'Full' }, { code: 'PHYS', level: 'Full' },
        { code: 'CHEM', level: 'Full' }, { code: 'ENG', level: 'Full' }
      ],
      parent: { name: '赵磊', relation: '父亲', phone: '13300006666', email: 'zhao.l@example.com', wechat: 'zhaolei66' },
      targets: [],
      applications: [],
      exams: [
        { board: 'CIE', series: 'June', year: 2027, subject: 'Mathematics (O-Level)', code: '4024', predicted: 'A*', status: 'registered' },
        { board: 'CIE', series: 'June', year: 2027, subject: 'Physics (O-Level)', code: '5054', predicted: 'A', status: 'registered' }
      ],
      tasks: [
        { title: '英语分级测试', cat: '考试', due: '2025-09-05', status: 'done', priority: 'high', completed: '2025-09-05T10:00:00Z' },
        { title: '英语补习计划制定', cat: '其他', due: '2025-09-15', status: 'done', priority: 'high', completed: '2025-09-12T14:00:00Z' },
        { title: '每周英语辅导 (持续)', cat: '其他', due: '2026-06-30', status: 'in_progress', priority: 'high' },
        { title: '学期中期学业评估', cat: '考试', due: '2026-04-15', status: 'pending', priority: 'normal' },
        { title: 'IGCSE课程规划讨论', cat: '申请', due: '2026-05-01', status: 'pending', priority: 'normal' }
      ],
      materials: [
        { type: '成绩单', title: '国内初中成绩单', status: '已上传' }
      ],
      comms: [
        { channel: '面谈', summary: '新生入学评估，数学摸底99/100非常优秀，英语仅32/100需要大量补习', date: '2025-09-01', actions: '安排英语一对一辅导，每周3次' },
        { channel: '电话', summary: '家长来电了解孩子适应情况，反馈英语进步明显', date: '2026-01-15', actions: '继续当前辅导计划' }
      ],
      assessments: [
        { type: '入学测试', subject: 'Mathematics', score: 99, max: 100, date: '2025-09-01', notes: '数学能力极强' },
        { type: '入学测试', subject: 'English', score: 32, max: 100, date: '2025-09-01', notes: '英语基础非常薄弱，需重点补习' },
        { type: '入学测试', subject: 'Physics', score: 78, max: 100, date: '2025-09-01', notes: '物理基础良好' }
      ],
      consent: { guardian: '赵磊', relation: '父亲', scope: '["data_storage","counseling"]', date: '2025-09-01' },
      activities: [
        { category: 'academic_competition', name: '全国初中数学联赛', org: '中国数学会', role: '参赛选手', start: '2024-09-01', end: '2025-03-31', hours: 5, weeks: 20, impact: 'national', desc: '参加全国初中数学联赛培训与选拔', achievements: '省级一等奖', tags: '["Mathematics"]' }
      ],
      honors: [
        { name: '全国初中数学联赛省级一等奖', level: 'province', rank: '一等奖', date: '2025-03-20', desc: '数学竞赛' }
      ],
      feedback: [
        { from_role: 'parent', type: '阶段反馈', content: '孩子刚来英语很弱，但老师们很耐心，一个学期进步很大，非常感谢。', rating: 5, status: 'reviewed', response: '明轩在数学方面是真正的天才，英语只要持续努力一定能跟上！' }
      ],
      essays: []
    },

    {
      name: '周子涵', grade: 'G12', board: 'CIE', dob: '2008-11-05', status: 'active',
      notes: '商科方向，目标英国/新加坡顶尖商学院。沟通能力强，模联主席。',
      subjects: [
        { code: 'MATH', level: 'A2' }, { code: 'ECON', level: 'A2' },
        { code: 'CS', level: 'AS' }
      ],
      parent: { name: '周建明', relation: '父亲', phone: '13200007777', email: 'zhou.jm@example.com', wechat: 'zhoujm77' },
      targets: [
        { uni: '伦敦政治经济学院 LSE', country: 'UK', tier: '冲刺', dept: 'Management', rank: 1 },
        { uni: '华威大学 University of Warwick', country: 'UK', tier: '意向', dept: 'WBS Accounting & Finance', rank: 2 },
        { uni: '新加坡国立大学 NUS', country: 'SG', tier: '意向', dept: 'Business Administration', rank: 3 },
        { uni: '南洋理工大学 NTU', country: 'SG', tier: '保底', dept: 'Business', rank: 4 }
      ],
      applications: [
        { uni: '伦敦政治经济学院 LSE', dept: 'Management', tier: '冲刺', route: 'UK-UG', cycle: 2026, status: 'applied', offer_type: 'Pending', submit_date: '2026-01-15', deadline: '2026-01-15' },
        { uni: '华威大学 University of Warwick', dept: 'Accounting & Finance', tier: '意向', route: 'UK-UG', cycle: 2026, status: 'offer', offer_type: 'Conditional', offer_date: '2026-02-20', conditions: 'A*AA', submit_date: '2026-01-15', deadline: '2026-01-15' },
        { uni: '新加坡国立大学 NUS', dept: 'Business Administration', tier: '意向', route: 'SG', cycle: 2026, status: 'applied', offer_type: 'Pending', submit_date: '2026-02-28', deadline: '2026-03-01' }
      ],
      exams: [
        { board: 'CIE', series: 'June', year: 2025, subject: 'Mathematics', code: '9709', predicted: 'A*', actual: 'A*', status: 'result_received' },
        { board: 'CIE', series: 'June', year: 2025, subject: 'Economics', code: '9708', predicted: 'A', actual: 'A', status: 'result_received' },
        { board: 'CIE', series: 'June', year: 2026, subject: 'Mathematics (A2)', code: '9709', predicted: 'A*', status: 'registered' },
        { board: 'CIE', series: 'June', year: 2026, subject: 'Economics (A2)', code: '9708', predicted: 'A*', status: 'registered' }
      ],
      tasks: [
        { title: 'UCAS PS提交', cat: '申请', due: '2026-01-15', status: 'done', priority: 'high', completed: '2026-01-10T15:00:00Z' },
        { title: 'NUS商学院面试准备', cat: '面试', due: '2026-04-20', status: 'pending', priority: 'high' },
        { title: 'LSE申请跟踪', cat: '申请', due: '2026-05-31', status: 'in_progress', priority: 'normal' }
      ],
      materials: [
        { type: '个人陈述', title: 'UCAS PS - Management', status: '已提交', submitted: '2026-01-10' },
        { type: '推荐信', title: '经济老师推荐信', status: '已提交', submitted: '2026-01-05' },
        { type: '其他', title: '雅思成绩单 (7.5)', status: '已提交', submitted: '2025-11-15' }
      ],
      comms: [
        { channel: '面谈', summary: '规划咨询：商科方向，LSE vs Warwick vs NUS对比分析', date: '2025-06-15', actions: '制定UK+SG双轨申请策略' },
        { channel: '微信', summary: 'Warwick发来offer, A*AA条件。讨论后续策略', date: '2026-02-22', actions: '等待LSE结果再做firm选择' }
      ],
      assessments: [
        { type: 'IELTS', subject: 'English', score: 7.5, max: 9, date: '2025-10-20', notes: 'L:8.0 R:7.5 W:7.0 S:7.5' }
      ],
      consent: { guardian: '周建明', relation: '父亲', scope: '["data_storage","counseling","sharing_external"]', date: '2025-06-10' },
      activities: [
        { category: 'club_leadership', name: '模拟联合国 (MUN)', org: '校际MUN组织', role: '主席', start: '2024-02-01', end: '2026-03-31', hours: 5, weeks: 40, impact: 'international', desc: '组织和主持校际模联大会，培训新成员', achievements: '主持2次区域大会（200+参与者），获最佳主席奖', tags: '["Leadership","International Relations"]' },
        { category: 'internship', name: '创业公司实习', org: 'TechStart SG', role: '商业分析实习生', start: '2025-06-15', end: '2025-07-31', hours: 30, weeks: 7, impact: 'international', desc: '在新加坡科技创业公司进行商业分析和市场调研', achievements: '完成竞品分析报告，建议被CEO采纳', tags: '["Business","Entrepreneurship"]' }
      ],
      honors: [
        { name: 'HMUN最佳主席奖', level: 'international', rank: '最佳', date: '2025-11-20', desc: '哈佛模联区域赛' },
        { name: '学校商业计划书大赛一等奖', level: 'school', rank: '一等奖', date: '2025-06-01', desc: '校内创业竞赛' }
      ],
      feedback: [],
      essays: [
        { type: 'personal_statement', title: 'UCAS PS - Management', prompt: 'Why Management?', wordLimit: 4000, status: 'submitted', strategy: '从MUN领导力经历引入，结合创业实习体验',
          versions: [
            { content: '在模联主席台上的经历让我理解了管理的本质...', words: 610, summary: '终稿' }
          ]
        }
      ]
    },

    {
      name: '吴佳琪', grade: 'G10', board: 'CIE', dob: '2010-08-20', status: 'active',
      notes: '新生，IGCSE课程。性格活泼，对艺术和设计有浓厚兴趣。正在探索方向中。',
      subjects: [
        { code: 'MATH', level: 'Full' }, { code: 'ENG', level: 'Full' },
        { code: 'PHYS', level: 'Full' }
      ],
      parent: { name: '吴涛', relation: '父亲', phone: '13100008888', email: 'wu.t@example.com', wechat: 'wutao88' },
      parent2: { name: '陈美玲', relation: '母亲', phone: '13100008889', email: 'chen.ml@example.com', wechat: 'chenml_mom' },
      targets: [],
      applications: [],
      exams: [],
      tasks: [
        { title: '入学适应期观察', cat: '其他', due: '2025-10-31', status: 'done', priority: 'normal', completed: '2025-10-28T09:00:00Z' },
        { title: '兴趣探索课程选择', cat: '其他', due: '2025-11-15', status: 'done', priority: 'normal', completed: '2025-11-10T14:00:00Z' },
        { title: '学期末学业评估', cat: '考试', due: '2026-06-15', status: 'pending', priority: 'normal' },
        { title: '暑期艺术工作坊推荐', cat: '其他', due: '2026-06-01', status: 'pending', priority: 'low' }
      ],
      materials: [
        { type: '成绩单', title: '国内初中成绩单', status: '已上传' }
      ],
      comms: [
        { channel: '面谈', summary: '新生入学咨询，家长希望孩子先适应环境，不急于确定方向', date: '2025-09-05', actions: '安排入学适应课程，观察兴趣方向' },
        { channel: '微信', summary: '反馈佳琪最近对室内设计很感兴趣，询问相关课程', date: '2026-02-20', actions: '推荐AA建筑夏校和设计基础课程' }
      ],
      assessments: [
        { type: '入学测试', subject: 'Mathematics', score: 75, max: 100, date: '2025-09-01', notes: '中等水平' },
        { type: '入学测试', subject: 'English', score: 58, max: 100, date: '2025-09-01', notes: '基础尚可，需加强' }
      ],
      consent: { guardian: '吴涛', relation: '父亲', scope: '["data_storage","counseling"]', date: '2025-09-01' },
      activities: [
        { category: 'arts', name: '绘画兴趣班', org: '校外美术工作室', role: '学员', start: '2023-09-01', end: '2025-08-31', hours: 3, weeks: 40, impact: 'school', desc: '学习素描、水彩和油画基础', achievements: '作品入选校园画展', tags: '["Art","Design"]' }
      ],
      honors: [],
      feedback: [],
      essays: []
    },

    {
      name: '黄子豪', grade: 'G11', board: 'Edexcel', dob: '2009-04-25', status: 'active',
      notes: '理工科均衡发展，目标英国或香港。偏好电子工程/EE方向。动手能力极强。',
      subjects: [
        { code: 'MATH', level: 'AS' }, { code: 'PHYS', level: 'AS' },
        { code: 'CS', level: 'AS' }
      ],
      parent: { name: '黄海', relation: '父亲', phone: '13000009999', email: 'huang.h@example.com', wechat: 'huanghai99' },
      targets: [
        { uni: '帝国理工学院 Imperial College London', country: 'UK', tier: '冲刺', dept: 'Electrical Engineering', rank: 1 },
        { uni: '曼彻斯特大学 University of Manchester', country: 'UK', tier: '意向', dept: 'EEE', rank: 2 }
      ],
      applications: [],
      exams: [
        { board: 'Edexcel', series: 'June', year: 2026, subject: 'Mathematics (AS)', code: '9MA0', predicted: 'A', status: 'registered' },
        { board: 'Edexcel', series: 'June', year: 2026, subject: 'Physics (AS)', code: '9PH0', predicted: 'A', status: 'registered' },
        { board: 'Edexcel', series: 'June', year: 2026, subject: 'Computer Science (AS)', code: '9CS0', predicted: 'A', status: 'registered' }
      ],
      tasks: [
        { title: 'AS模考准备', cat: '考试', due: '2026-03-15', status: 'done', priority: 'normal', completed: '2026-03-14T10:00:00Z' },
        { title: 'IELTS备考开始', cat: '考试', due: '2026-04-01', status: 'in_progress', priority: 'high' },
        { title: '电子工程项目作品整理', cat: '材料', due: '2026-07-01', status: 'pending', priority: 'normal' },
        { title: '暑期实验室访问申请', cat: '其他', due: '2026-05-01', status: 'pending', priority: 'normal' }
      ],
      materials: [
        { type: '成绩单', title: 'IGCSE成绩单 (6A* 3A)', status: '已上传' },
        { type: '活动证明', title: '电子设计竞赛获奖证书', status: '已上传' }
      ],
      comms: [
        { channel: '面谈', summary: '规划会议：确定EE方向，讨论IC与Manchester的要求差异', date: '2025-11-01', actions: '制定AS目标成绩、推荐课外项目' },
        { channel: '微信', summary: 'AS模考成绩不错：数学A 物理A CS B+，讨论CS提升策略', date: '2026-03-20', actions: '增加CS练习题量' }
      ],
      assessments: [
        { type: '入学测试', subject: 'Mathematics', score: 88, max: 100, date: '2025-08-20', notes: '数学基础扎实' },
        { type: '入学测试', subject: 'Physics', score: 85, max: 100, date: '2025-08-20', notes: '物理理解力好' }
      ],
      consent: { guardian: '黄海', relation: '父亲', scope: '["data_storage","counseling"]', date: '2025-11-01' },
      activities: [
        { category: 'personal_project', name: 'Arduino智能家居系统', org: '', role: '设计者', start: '2025-01-01', end: '2025-06-30', hours: 8, weeks: 24, impact: 'school', desc: '设计并制作基于Arduino的智能家居控制系统，包含温湿度监控、灯光自动调节', achievements: '在校科技节获一等奖，作品被学校展厅永久收藏', tags: '["Electrical Engineering","IoT"]' },
        { category: 'academic_competition', name: '全国青少年电子设计竞赛', org: '中国电子学会', role: '参赛选手', start: '2024-10-01', end: '2025-01-15', hours: 8, weeks: 14, impact: 'national', desc: '设计制作无线通信模块', achievements: '全国二等奖', tags: '["EE","Electronics"]' }
      ],
      honors: [
        { name: '全国青少年电子设计竞赛二等奖', level: 'national', rank: '二等奖', date: '2025-01-15', desc: '无线通信模块设计' },
        { name: '校科技节创新作品一等奖', level: 'school', rank: '一等奖', date: '2025-06-15', desc: 'Arduino智能家居系统' }
      ],
      feedback: [],
      essays: []
    },

    {
      name: '孙悦然', grade: 'G12', board: 'Edexcel', dob: '2008-12-03', status: 'active',
      notes: '心理学方向，目标英国。成绩中上，文笔好，有丰富的志愿者和社会调研经验。',
      subjects: [
        { code: 'BIO', level: 'A2' }, { code: 'MATH', level: 'A2' },
        { code: 'ECON', level: 'AS' }
      ],
      parent: { name: '孙伟东', relation: '父亲', phone: '13800001234', email: 'sun.wd@example.com', wechat: 'sunwd_dad' },
      targets: [
        { uni: '伦敦大学学院 UCL', country: 'UK', tier: '冲刺', dept: 'Psychology', rank: 1 },
        { uni: '伦敦国王学院 King\'s College London', country: 'UK', tier: '意向', dept: 'Psychology', rank: 2 },
        { uni: '利兹大学 University of Leeds', country: 'UK', tier: '保底', dept: 'Psychology', rank: 3 }
      ],
      applications: [
        { uni: '伦敦大学学院 UCL', dept: 'Psychology', tier: '冲刺', route: 'UK-UG', cycle: 2026, status: 'applied', offer_type: 'Pending', submit_date: '2026-01-15', deadline: '2026-01-15' },
        { uni: '伦敦国王学院 King\'s College London', dept: 'Psychology', tier: '意向', route: 'UK-UG', cycle: 2026, status: 'offer', offer_type: 'Conditional', offer_date: '2026-03-15', conditions: 'ABB including Biology', submit_date: '2026-01-15', deadline: '2026-01-15', firm: 1 },
        { uni: '利兹大学 University of Leeds', dept: 'Psychology', tier: '保底', route: 'UK-UG', cycle: 2026, status: 'offer', offer_type: 'Unconditional', offer_date: '2026-02-01', submit_date: '2026-01-15', deadline: '2026-01-15', insurance: 1 }
      ],
      exams: [
        { board: 'Edexcel', series: 'June', year: 2025, subject: 'Biology', code: '9BI0', predicted: 'A', actual: 'B', status: 'result_received' },
        { board: 'Edexcel', series: 'June', year: 2025, subject: 'Mathematics', code: '9MA0', predicted: 'A', actual: 'A', status: 'result_received' },
        { board: 'Edexcel', series: 'November', year: 2025, subject: 'Biology (Resit)', code: '9BI0', predicted: 'A', actual: 'A', status: 'result_received', isResit: true },
        { board: 'Edexcel', series: 'June', year: 2026, subject: 'Biology (A2)', code: '9BI0', predicted: 'A', status: 'registered' },
        { board: 'Edexcel', series: 'June', year: 2026, subject: 'Mathematics (A2)', code: '9MA0', predicted: 'A', status: 'registered' }
      ],
      tasks: [
        { title: 'UCAS PS提交', cat: '申请', due: '2026-01-15', status: 'done', priority: 'high', completed: '2026-01-12T11:00:00Z' },
        { title: 'Biology AS重考', cat: '考试', due: '2025-11-15', status: 'done', priority: 'high', completed: '2025-11-15T16:00:00Z' },
        { title: 'KCL Firm回复', cat: '申请', due: '2026-06-05', status: 'in_progress', priority: 'high' },
        { title: 'A2生物终极冲刺', cat: '考试', due: '2026-05-15', status: 'in_progress', priority: 'high' }
      ],
      materials: [
        { type: '个人陈述', title: 'Psychology PS', status: '已提交', submitted: '2026-01-12' },
        { type: '推荐信', title: '生物老师推荐信', status: '已提交', submitted: '2026-01-05' },
        { type: '其他', title: '雅思成绩单 (7.0)', status: '已提交', submitted: '2025-11-01' },
        { type: '活动证明', title: '心理健康志愿服务证明', status: '已上传' }
      ],
      comms: [
        { channel: '面谈', summary: '讨论AS Biology重考策略，B→A需要重考才能满足UCL条件', date: '2025-08-25', actions: '安排11月考试报名，制定重考复习计划' },
        { channel: '微信', summary: '重考成绩出来了，A！家长和学生都很开心', date: '2025-12-20', actions: '调整申请策略，恢复UCL作为目标' },
        { channel: '面谈', summary: 'KCL发来offer，讨论firm/insurance选择', date: '2026-03-20', actions: 'KCL firm, Leeds insurance' }
      ],
      assessments: [
        { type: 'IELTS', subject: 'English', score: 7.0, max: 9, date: '2025-10-15', notes: 'L:7.5 R:7.0 W:6.5 S:7.0' }
      ],
      consent: { guardian: '孙伟东', relation: '父亲', scope: '["data_storage","counseling"]', date: '2025-08-20' },
      activities: [
        { category: 'volunteer', name: '青少年心理健康热线志愿者', org: '心理援助中心', role: '接线志愿者', start: '2024-09-01', end: '2025-12-31', hours: 4, weeks: 52, impact: 'city', desc: '接听青少年心理咨询热线，提供初步心理支持', achievements: '累计接听150+通电话，参加40小时专业培训', tags: '["Psychology","Community Service"]' },
        { category: 'research', name: '青少年社交媒体使用与心理健康调研', org: '学校心理社团', role: '项目负责人', start: '2025-03-01', end: '2025-08-31', hours: 5, weeks: 24, impact: 'school', desc: '设计问卷、收集数据、统计分析并撰写报告', achievements: '调研报告在校刊发表，样本量300+', tags: '["Psychology","Research"]' }
      ],
      honors: [
        { name: '校刊优秀论文奖', level: 'school', rank: '优秀', date: '2025-09-15', desc: '社交媒体与心理健康调研报告' }
      ],
      feedback: [
        { from_role: 'student', type: '阶段反馈', content: '感谢老师帮我制定了重考计划，从B提到A让我重新看到了希望！', rating: 5, status: 'reviewed', response: '悦然很坚强，遇到挫折不放弃的精神值得赞赏！' }
      ],
      essays: [
        { type: 'personal_statement', title: 'Psychology PS', prompt: 'Why Psychology?', wordLimit: 4000, status: 'submitted', strategy: '从心理热线志愿经历引入，展示对心理学的实践理解和学术兴趣',
          versions: [
            { content: '那个凌晨两点的电话改变了我对心理学的理解...', words: 605, summary: '初稿' },
            { content: '终稿：加强了调研经历与学术兴趣的衔接...', words: 620, summary: '终稿' }
          ]
        }
      ]
    }
  ];

  // ══════════════════════════════════════════════════════════
  //  执行插入
  // ══════════════════════════════════════════════════════════

  let totalInserted = 0;

  for (const s of demoStudents) {
    const studentId = uuidv4();

    // 1. 插入学生
    db.run(`INSERT INTO students (id,name,grade_level,enrol_date,exam_board,status,notes,date_of_birth,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [studentId, s.name, s.grade, '2025-09-01', s.board, s.status, s.notes, s.dob, now, now]);

    // 2. 分配导师和规划师
    if (counselorId) {
      db.run(`INSERT INTO mentor_assignments (id,student_id,staff_id,role,start_date,notes,created_at)
        VALUES (?,?,?,?,?,?,?)`, [uuidv4(), studentId, counselorId, '升学规划师', '2025-09-01', '系统自动分配', now]);
    }
    if (mentorId) {
      db.run(`INSERT INTO mentor_assignments (id,student_id,staff_id,role,start_date,notes,created_at)
        VALUES (?,?,?,?,?,?,?)`, [uuidv4(), studentId, mentorId, '导师', '2025-09-01', '系统自动分配', now]);
    }

    // 3. 选科
    if (s.subjects) {
      for (const sub of s.subjects) {
        const subId = getSubjectId(sub.code);
        if (subId) {
          db.run(`INSERT INTO subject_enrollments (id,student_id,subject_id,level,exam_board,enrolled_at)
            VALUES (?,?,?,?,?,?)`, [uuidv4(), studentId, subId, sub.level, s.board, now]);
        }
      }
    }

    // 4. 家长
    const parentIds = [];
    if (s.parent) {
      const pid = uuidv4();
      parentIds.push(pid);
      db.run(`INSERT INTO parent_guardians (id,name,relation,phone,email,wechat,created_at)
        VALUES (?,?,?,?,?,?,?)`, [pid, s.parent.name, s.parent.relation, s.parent.phone, s.parent.email, s.parent.wechat, now]);
      db.run(`INSERT INTO student_parents (student_id,parent_id) VALUES (?,?)`, [studentId, pid]);
    }
    if (s.parent2) {
      const pid2 = uuidv4();
      parentIds.push(pid2);
      db.run(`INSERT INTO parent_guardians (id,name,relation,phone,email,wechat,created_at)
        VALUES (?,?,?,?,?,?,?)`, [pid2, s.parent2.name, s.parent2.relation, s.parent2.phone, s.parent2.email, s.parent2.wechat, now]);
      db.run(`INSERT INTO student_parents (student_id,parent_id) VALUES (?,?)`, [studentId, pid2]);
    }

    // 5. 目标院校
    if (s.targets) {
      for (const t of s.targets) {
        const uniId = getOrCreateUni(t.uni, t.country, '');
        db.run(`INSERT INTO target_uni_lists (id,student_id,university_id,uni_name,tier,priority_rank,department,created_at)
          VALUES (?,?,?,?,?,?,?,?)`, [uuidv4(), studentId, uniId, t.uni, t.tier, t.rank, t.dept, now]);
      }
    }

    // 6. 申请
    const appIdMap = {};
    if (s.applications) {
      for (const a of s.applications) {
        const appId = uuidv4();
        const uniId = getOrCreateUni(a.uni, a.route === 'SG' ? 'SG' : 'UK', '');
        db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,offer_date,offer_type,conditions,firm_choice,insurance_choice,status,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [appId, studentId, uniId, a.uni, a.dept, a.tier, a.cycle, a.route,
           a.deadline, a.submit_date, a.offer_date || null, a.offer_type, a.conditions || null,
           a.firm ? 1 : 0, a.insurance ? 1 : 0, a.status, now, now]);
        appIdMap[a.uni] = appId;
      }
    }

    // 7. 考试场次
    if (s.exams) {
      for (const e of s.exams) {
        db.run(`INSERT INTO exam_sittings (id,student_id,exam_board,series,year,subject,subject_code,predicted_grade,actual_grade,status,is_resit,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), studentId, e.board, e.series, e.year, e.subject, e.code, e.predicted, e.actual || null, e.status, e.isResit ? 1 : 0, now, now]);
      }
    }

    // 8. 里程碑任务
    if (s.tasks) {
      for (const t of s.tasks) {
        db.run(`INSERT INTO milestone_tasks (id,student_id,title,category,due_date,status,priority,assigned_to,completed_at,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), studentId, t.title, t.cat, t.due, t.status, t.priority,
           counselorId, t.completed || null, now, now]);
      }
    }

    // 9. 材料
    if (s.materials) {
      for (const m of s.materials) {
        db.run(`INSERT INTO material_items (id,student_id,material_type,title,status,submitted_at,reviewed_at,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), studentId, m.type, m.title, m.status, m.submitted || null, m.reviewed || null, now, now]);
      }
    }

    // 10. 个人陈述 (legacy表)
    if (s.ps) {
      db.run(`INSERT INTO personal_statements (id,student_id,version,status,q1_content,q2_content,q3_content,word_count,char_count,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), studentId, 3, s.ps.status, s.ps.q1, s.ps.q2, s.ps.q3, s.ps.wordCount, s.ps.charCount, now, now]);
    }

    // 11. 沟通记录
    if (s.comms) {
      for (const c of s.comms) {
        db.run(`INSERT INTO communication_logs (id,student_id,staff_id,channel,summary,action_items,comm_date,created_at)
          VALUES (?,?,?,?,?,?,?,?)`,
          [uuidv4(), studentId, counselorId, c.channel, c.summary, c.actions, c.date, now]);
      }
    }

    // 12. 入学评估
    if (s.assessments) {
      for (const a of s.assessments) {
        db.run(`INSERT INTO admission_assessments (id,student_id,assess_date,assess_type,subject,score,max_score,notes,created_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), studentId, a.date, a.type, a.subject, a.score, a.max, a.notes, now]);
      }
    }

    // 13. 监护人同意书
    if (s.consent) {
      db.run(`INSERT INTO guardian_consents (id,student_id,guardian_name,relation,consent_scope,consent_date,recorded_by,created_at)
        VALUES (?,?,?,?,?,?,?,?)`,
        [uuidv4(), studentId, s.consent.guardian, s.consent.relation, s.consent.scope, s.consent.date, counselorId, now]);
    }

    // 14. 反馈
    if (s.feedback) {
      for (const f of s.feedback) {
        db.run(`INSERT INTO feedback (id,student_id,from_role,feedback_type,content,rating,status,response,created_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), studentId, f.from_role, f.type, f.content, f.rating, f.status, f.response || null, now]);
      }
    }

    // 15. 课外活动
    if (s.activities) {
      for (const act of s.activities) {
        const actId = uuidv4();
        db.run(`INSERT INTO student_activities (id,student_id,category,name,organization,role,start_date,end_date,hours_per_week,weeks_per_year,impact_level,description,achievements,related_major_tags,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [actId, studentId, act.category, act.name, act.org, act.role, act.start, act.end,
           act.hours, act.weeks, act.impact, act.desc, act.achievements, act.tags, now, now]);
      }
    }

    // 16. 荣誉奖项
    if (s.honors) {
      for (const h of s.honors) {
        db.run(`INSERT INTO student_honors (id,student_id,name,level,award_rank,award_date,description,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), studentId, h.name, h.level, h.rank, h.date, h.desc, now, now]);
      }
    }

    // 17. 文书 (essays模块)
    if (s.essays) {
      for (const es of s.essays) {
        const essayId = uuidv4();
        const versionCount = es.versions ? es.versions.length : 0;
        db.run(`INSERT INTO essays (id,student_id,essay_type,title,prompt,word_limit,status,current_version,assigned_reviewer_id,strategy_notes,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [essayId, studentId, es.type, es.title, es.prompt, es.wordLimit, es.status, versionCount, counselorId, es.strategy, now, now]);

        if (es.versions) {
          for (let vi = 0; vi < es.versions.length; vi++) {
            const v = es.versions[vi];
            db.run(`INSERT INTO essay_versions (id,essay_id,version_no,content,word_count,change_summary,created_at)
              VALUES (?,?,?,?,?,?,?)`,
              [uuidv4(), essayId, vi + 1, v.content, v.words, v.summary, now]);
          }
        }
      }
    }

    totalInserted++;
    console.log(`  [migration] ✓ ${s.name} (${s.grade}, ${s.board})`);
  }

  // 标记迁移完成
  db.run("INSERT OR REPLACE INTO settings (key,value) VALUES ('migration_demo_students_v2',?)", [now]);
  console.log(`[migration] ✅ 成功创建 ${totalInserted} 个详细演示学生`);
  return true;
}

module.exports = runMigration;
