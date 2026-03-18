/**
 * db.js — sql.js (WebAssembly SQLite) 封装
 * 持久化: 每次写操作后将数据库序列化到 data.sqlite
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Railway/生产环境用 DATA_DIR 指向持久化卷，本地开发默认放项目目录
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'data.sqlite');

let db = null;

async function init() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  createSchema();
  save();
}

function save() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
}

/**
 * Execute multiple operations in a single SQLite transaction.
 * Rolls back automatically on error. Saves to disk only once on success.
 * @param {function} fn - callback receiving a `runInTx(sql, params)` helper
 */
function transaction(fn) {
  db.run('BEGIN');
  try {
    fn((sql, params = []) => db.run(sql, params));
    db.run('COMMIT');
    save();
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const obj = stmt.getAsObject();
    stmt.free();
    return obj;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function createSchema() {
  // ── 用户账户 ────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    username   TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL, -- principal/counselor/mentor/student/parent/agent
    linked_id  TEXT,          -- student_id / staff_id / parent_id / agent_id
    name       TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── 学生 ────────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    grade_level     TEXT NOT NULL,
    enrol_date      TEXT,
    exam_board      TEXT,   -- Edexcel/CIE/A-Level
    status          TEXT DEFAULT 'active',
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  )`);

  // ── 入学评估 ─────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS admission_assessments (
    id           TEXT PRIMARY KEY,
    student_id   TEXT NOT NULL,
    assess_date  TEXT NOT NULL,
    assess_type  TEXT NOT NULL,
    subject      TEXT,
    score        REAL,
    max_score    REAL DEFAULT 100,
    percentile   REAL,
    notes        TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  )`);

  // ── 家长/监护人 ──────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS parent_guardians (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    relation   TEXT,  -- 父/母/监护人
    phone      TEXT,
    email      TEXT,
    wechat     TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── 学生-家长关联 ─────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS student_parents (
    student_id TEXT NOT NULL,
    parent_id  TEXT NOT NULL,
    PRIMARY KEY (student_id, parent_id)
  )`);

  // ── 教职工 ──────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS staff (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    role                TEXT NOT NULL,  -- principal/counselor/mentor/teacher/external
    subjects            TEXT,           -- JSON array
    exam_board_exp      TEXT,           -- JSON array
    capacity_students   INTEGER DEFAULT 20,
    email               TEXT,
    phone               TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
  )`);

  // ── 教职工资质 ────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS staff_credentials (
    id              TEXT PRIMARY KEY,
    staff_id        TEXT NOT NULL,
    credential_type TEXT NOT NULL,
    issuer          TEXT,
    issue_date      TEXT,
    valid_until     TEXT,
    description     TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
  )`);

  // ── 导师分配 ─────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS mentor_assignments (
    id          TEXT PRIMARY KEY,
    student_id  TEXT NOT NULL,
    staff_id    TEXT NOT NULL,
    role        TEXT NOT NULL,  -- 升学规划师/导师/学科导师
    start_date  TEXT,
    end_date    TEXT,
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  )`);

  // ── 科目字典 ─────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS subjects (
    id   TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT
  )`);

  // ── 选科记录 ─────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS subject_enrollments (
    id           TEXT PRIMARY KEY,
    student_id   TEXT NOT NULL,
    subject_id   TEXT NOT NULL,
    level        TEXT,   -- AS/A2/Full
    exam_board   TEXT,
    enrolled_at  TEXT DEFAULT (datetime('now'))
  )`);

  // ── 目标院校 ─────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS universities (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    country TEXT,
    website TEXT
  )`);

  // ── 目标院校清单 ──────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS target_uni_lists (
    id             TEXT PRIMARY KEY,
    student_id     TEXT NOT NULL,
    university_id  TEXT NOT NULL,
    uni_name       TEXT,         -- 冗余，方便查询
    tier           TEXT NOT NULL, -- 冲刺/意向/保底
    priority_rank  INTEGER DEFAULT 1,
    department     TEXT,
    rationale      TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  )`);

  // ── 申请 ────────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS applications (
    id                TEXT PRIMARY KEY,
    student_id        TEXT NOT NULL,
    university_id     TEXT,
    uni_name          TEXT,
    department        TEXT,
    tier              TEXT,
    cycle_year        INTEGER,
    route             TEXT,   -- UK-UG/US/CA/AU
    submit_deadline   TEXT,
    submit_date       TEXT,
    grade_type_used   TEXT,
    independent_tests TEXT,   -- JSON array
    offer_date        TEXT,
    offer_type        TEXT,   -- Conditional/Unconditional/Waitlist/Rejected/Pending
    conditions        TEXT,
    firm_choice       INTEGER DEFAULT 0,  -- boolean
    insurance_choice  INTEGER DEFAULT 0,
    matriculation_date TEXT,
    status            TEXT DEFAULT 'pending', -- pending/applied/offer/firm/declined/enrolled
    notes             TEXT,
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
  )`);

  // ── 里程碑任务 ────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS milestone_tasks (
    id             TEXT PRIMARY KEY,
    student_id     TEXT NOT NULL,
    application_id TEXT,
    title          TEXT NOT NULL,
    description    TEXT,
    category       TEXT,  -- 材料/考试/申请/面试/沟通/其他
    due_date       TEXT,
    completed_at   TEXT,
    status         TEXT DEFAULT 'pending', -- pending/in_progress/done/overdue
    priority       TEXT DEFAULT 'normal',  -- high/normal/low
    assigned_to    TEXT,  -- staff_id
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  )`);

  // ── 材料清单 ─────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS material_items (
    id              TEXT PRIMARY KEY,
    student_id      TEXT NOT NULL,
    application_id  TEXT,
    material_type   TEXT NOT NULL, -- 成绩单/推荐信/活动证明/个人陈述/其他
    title           TEXT,
    status          TEXT DEFAULT '未开始', -- 未开始/收集中/已上传/已审核/已提交/需补件
    version         INTEGER DEFAULT 1,
    file_path       TEXT,
    notes           TEXT,
    reviewed_by     TEXT,  -- staff_id
    reviewed_at     TEXT,
    submitted_at    TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  )`);

  // ── 个人陈述 ─────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS personal_statements (
    id            TEXT PRIMARY KEY,
    student_id    TEXT NOT NULL,
    application_id TEXT,
    version       INTEGER DEFAULT 1,
    status        TEXT DEFAULT '未开始', -- 未开始/草稿/一审中/需修改/二审中/定稿/已提交
    q1_content    TEXT,  -- 为什么选择这个学科
    q2_content    TEXT,  -- 学业准备
    q3_content    TEXT,  -- 课外准备
    word_count    INTEGER DEFAULT 0,
    char_count    INTEGER DEFAULT 0,
    reviewer_id   TEXT,
    review_notes  TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  )`);

  // Add content_json column to personal_statements if not exists
  try { db.run('ALTER TABLE personal_statements ADD COLUMN content_json TEXT'); } catch(e) {}

  // ── 监护人同意记录 ─────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS guardian_consents (
    id              TEXT PRIMARY KEY,
    student_id      TEXT NOT NULL,
    guardian_name   TEXT NOT NULL,
    relation        TEXT,
    consent_version TEXT DEFAULT '1.0',
    consent_scope   TEXT,   -- JSON: ["data_storage","counseling","sharing_external"]
    consented       INTEGER DEFAULT 1,  -- 1=同意 0=撤回
    consent_date    TEXT NOT NULL,
    revoke_date     TEXT,
    revoke_reason   TEXT,
    recorded_by     TEXT,   -- staff_id
    created_at      TEXT DEFAULT (datetime('now'))
  )`);

  // ── P1.2 考试场次 ─────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS exam_sittings (
    id             TEXT PRIMARY KEY,
    student_id     TEXT NOT NULL,
    exam_board     TEXT NOT NULL,
    series         TEXT,              -- June/November/March/October/May
    year           INTEGER,
    subject        TEXT,
    subject_code   TEXT,
    component      TEXT,
    sitting_date   TEXT,
    results_date   TEXT,             -- 预期出分日期
    predicted_grade TEXT,
    actual_grade   TEXT,
    ums_score      TEXT,             -- UMS / raw score
    status         TEXT DEFAULT 'registered', -- registered/sat/result_received/resit_planned/completed
    is_resit       INTEGER DEFAULT 0,
    resit_of       TEXT,             -- 原 exam_sitting id
    notes          TEXT,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  )`);

  // ── P1.3 申请通道扩展表 ───────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS application_uk_ext (
    application_id        TEXT PRIMARY KEY,
    ucas_personal_id      TEXT,
    ucas_choice_number    INTEGER,
    reference_status      TEXT DEFAULT 'pending',  -- pending/requested/submitted
    clearing_eligible     INTEGER DEFAULT 0,
    firm_conditions       TEXT,
    insurance_conditions  TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS application_us_ext (
    application_id          TEXT PRIMARY KEY,
    app_type                TEXT,  -- ED/EA/REA/ED2/RD/Rolling
    is_binding              INTEGER DEFAULT 0,
    platform                TEXT,  -- CommonApp/Coalition/QuestBridge/Direct
    school_portal_url       TEXT,
    decision_date_expected  TEXT,
    css_profile_required    INTEGER DEFAULT 0,
    fafsa_required          INTEGER DEFAULT 0,
    supplements_required    TEXT   -- JSON array of required supplements
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS application_sg_ext (
    application_id               TEXT PRIMARY KEY,
    portal_name                  TEXT,
    supplement_scores_required   INTEGER DEFAULT 0,
    supplement_scores_submitted  INTEGER DEFAULT 0,
    supplement_deadline          TEXT,
    interview_required           INTEGER DEFAULT 0,
    interview_date               TEXT,
    interview_format             TEXT,  -- online/in-person/portfolio-review
    test_required                INTEGER DEFAULT 0,
    test_type                    TEXT,  -- design-challenge/writing-test/admissions-test
    test_date                    TEXT,
    scholarship_applied          INTEGER DEFAULT 0
  )`);

  // ── P1.1 日历锚点事件 ────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS calendar_anchor_events (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    event_type TEXT,  -- results_release/exam_period/app_open/app_deadline
    exam_board TEXT,
    series     TEXT,
    year       INTEGER,
    event_date TEXT NOT NULL,
    notes      TEXT,
    is_system  INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── P1.1 模板条目锚点类型 ─────────────────────────────
  // (新列 anchor_type 和 anchor_label 通过 ALTER TABLE 添加)

  // ── P1.4 通知日志 ─────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS notification_logs (
    id             TEXT PRIMARY KEY,
    student_id     TEXT,
    task_id        TEXT,
    type           TEXT,  -- deadline_reminder/overdue/escalation/system
    trigger_days   INTEGER,
    title          TEXT NOT NULL,
    message        TEXT,
    target_role    TEXT,
    target_user_id TEXT,
    is_read        INTEGER DEFAULT 0,
    read_at        TEXT,
    is_confirmed   INTEGER DEFAULT 0,
    confirmed_at   TEXT,
    escalated      INTEGER DEFAULT 0,
    escalated_at   TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS escalation_policies (
    id                         TEXT PRIMARY KEY,
    name                       TEXT NOT NULL,
    trigger_days               TEXT,  -- JSON: [-30,-14,-3,1,3]
    escalate_to_role           TEXT DEFAULT 'counselor',
    auto_escalate_overdue_hours INTEGER DEFAULT 24,
    apply_to_categories        TEXT,  -- JSON 或 null=全部
    created_at                 TEXT DEFAULT (datetime('now'))
  )`);

  // ── ALTER TABLE 渐进式扩展（try/catch 兼容旧库） ───────
  const tryAlter = (sql) => { try { db.run(sql); } catch(e) {} };
  // 学生：出生日期、来源代理
  tryAlter('ALTER TABLE students ADD COLUMN date_of_birth TEXT');
  tryAlter('ALTER TABLE students ADD COLUMN agent_id TEXT');
  // 任务：详细描述
  tryAlter('ALTER TABLE milestone_tasks ADD COLUMN description TEXT');
  // 里程碑任务：截止时间 + 时区
  tryAlter('ALTER TABLE milestone_tasks ADD COLUMN due_time TEXT');
  tryAlter('ALTER TABLE milestone_tasks ADD COLUMN due_timezone TEXT');
  // 申请：截止时间 + 时区
  tryAlter('ALTER TABLE applications ADD COLUMN submit_deadline_time TEXT');
  tryAlter('ALTER TABLE applications ADD COLUMN submit_deadline_tz TEXT');
  // 时间线模板：默认截止时间与时区（适用该模板下所有任务）
  tryAlter('ALTER TABLE timeline_templates ADD COLUMN deadline_time TEXT');
  tryAlter('ALTER TABLE timeline_templates ADD COLUMN deadline_timezone TEXT');
  // 模板条目：锚点类型（P1.1）
  tryAlter("ALTER TABLE template_items ADD COLUMN anchor_type TEXT DEFAULT 'deadline'");
  tryAlter('ALTER TABLE template_items ADD COLUMN anchor_label TEXT');
  // 审计日志：前后值（P1.5）
  tryAlter('ALTER TABLE audit_logs ADD COLUMN before_value TEXT');
  tryAlter('ALTER TABLE audit_logs ADD COLUMN after_value TEXT');
  // 入学案例：student_name 字段（新 DB 通过 schema 创建，旧 DB 需 ALTER）
  tryAlter('ALTER TABLE intake_cases ADD COLUMN student_name TEXT');
  // 入学案例：移除 student_id 的 NOT NULL 约束（SQLite 需重建表）
  try {
    const tbl = db.exec("PRAGMA table_info(intake_cases)");
    if (tbl && tbl[0]) {
      const sidRow = tbl[0].values.find(r => r[1] === 'student_id');
      if (sidRow && sidRow[3] === 1) { // notnull === 1, migration needed
        const existingCols = tbl[0].values.map(r => r[1]);
        const targetCols = ['id','student_id','student_name','intake_year','program_name','status','case_owner_staff_id','referral_id','offer_issued_at','contract_signed_at','contract_signed_by','notes','created_at','updated_at'];
        const colsToCopy = targetCols.filter(c => existingCols.includes(c));
        db.run('DROP TABLE IF EXISTS __ic_tmp');
        db.run(`CREATE TABLE __ic_tmp (
          id TEXT PRIMARY KEY, student_id TEXT, student_name TEXT,
          intake_year INTEGER NOT NULL, program_name TEXT NOT NULL,
          status TEXT DEFAULT 'registered', case_owner_staff_id TEXT,
          referral_id TEXT, offer_issued_at TEXT, contract_signed_at TEXT,
          contract_signed_by TEXT, notes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )`);
        db.run(`INSERT INTO __ic_tmp (${colsToCopy.join(',')}) SELECT ${colsToCopy.join(',')} FROM intake_cases`);
        db.run('DROP TABLE intake_cases');
        db.run('ALTER TABLE __ic_tmp RENAME TO intake_cases');
        console.log('[migration] intake_cases student_id NOT NULL removed');
      }
    }
  } catch(e) {
    try { db.run('DROP TABLE IF EXISTS __ic_tmp'); } catch(e2) {}
    console.warn('[migration] intake_cases student_id:', e.message);
  }

  // ── 沟通记录 ─────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS communication_logs (
    id          TEXT PRIMARY KEY,
    student_id  TEXT NOT NULL,
    staff_id    TEXT,
    parent_id   TEXT,
    channel     TEXT,  -- 微信/邮件/电话/面谈
    summary     TEXT NOT NULL,
    action_items TEXT,
    comm_date   TEXT DEFAULT (datetime('now')),
    created_at  TEXT DEFAULT (datetime('now'))
  )`);

  // ── 反馈 ────────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS feedback (
    id            TEXT PRIMARY KEY,
    student_id    TEXT NOT NULL,
    from_role     TEXT,  -- parent/student/mentor/external
    from_id       TEXT,
    feedback_type TEXT,  -- 阶段反馈/满意度/疑问/投诉/建议
    content       TEXT NOT NULL,
    rating        INTEGER,  -- 1-5
    status        TEXT DEFAULT 'pending',  -- pending/reviewed/resolved
    response      TEXT,
    responded_by  TEXT,
    responded_at  TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  )`);

  // ── 时间线模板 ───────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS timeline_templates (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    description       TEXT,
    route             TEXT DEFAULT 'UK-UG',
    tier              TEXT DEFAULT '意向',
    is_system         INTEGER DEFAULT 0,
    created_by        TEXT,
    created_at        TEXT DEFAULT (datetime('now')),
    deadline_time     TEXT,
    deadline_timezone TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS template_items (
    id                  TEXT PRIMARY KEY,
    template_id         TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    category            TEXT DEFAULT '其他',
    days_before_deadline INTEGER DEFAULT 30,
    priority            TEXT DEFAULT 'normal',
    sort_order          INTEGER DEFAULT 0
  )`);

  // ── 系统设置 ─────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  )`);

  // ── 审计日志 ─────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id         TEXT PRIMARY KEY,
    user_id    TEXT,
    action     TEXT NOT NULL,
    entity     TEXT,
    entity_id  TEXT,
    detail     TEXT,
    ip         TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── 院校专业要求库（录取匹配核心数据）────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS uni_programs (
    id                   TEXT PRIMARY KEY,
    university_id        TEXT,
    uni_name             TEXT NOT NULL,
    program_name         TEXT NOT NULL,
    department           TEXT,
    country              TEXT DEFAULT 'UK',
    route                TEXT DEFAULT 'UK-UG',  -- UK-UG/US/SG
    cycle_year           INTEGER,
    app_deadline         TEXT,  -- 申请截止日期 (YYYY-MM-DD)
    app_deadline_time    TEXT,  -- 截止时间 e.g. 18:00
    app_deadline_tz      TEXT DEFAULT 'Europe/London',
    ucas_early_deadline  INTEGER DEFAULT 0,  -- 是否牛剑/医学早截止
    -- 学术要求 (JSON)
    grade_requirements   TEXT,  -- JSON: [{subject, min_grade, required, notes}]
    min_subjects         INTEGER DEFAULT 3,  -- 最少科目数
    grade_type           TEXT DEFAULT 'A-Level',  -- A-Level/IB/GCSE/SAT/ACT
    -- 语言要求
    ielts_overall        REAL,  -- e.g. 6.5
    ielts_min_component  REAL,  -- e.g. 6.0 (每项最低)
    toefl_overall        INTEGER,
    duolingo_min         INTEGER,
    -- 独立测试要求 (JSON)
    extra_tests          TEXT,  -- JSON: [{test, required, min_score, deadline, notes}]
    -- 参考信/材料
    reference_required   INTEGER DEFAULT 0,
    reference_notes      TEXT,
    -- 历史录取数据（用于概率校准）
    hist_applicants      INTEGER,  -- 历年申请人数
    hist_offers          INTEGER,  -- 历年录取人数
    hist_offer_rate      REAL,     -- 录取率
    hist_avg_grade       TEXT,     -- 平均录取等级描述 e.g. "AAA"
    hist_data_year       INTEGER,  -- 数据来源年份
    -- 权重与备注
    weight_academic      REAL DEFAULT 0.6,  -- 学术权重
    weight_language      REAL DEFAULT 0.25, -- 语言权重
    weight_extra         REAL DEFAULT 0.15, -- 额外测试权重
    notes                TEXT,
    is_active            INTEGER DEFAULT 1,
    created_by           TEXT,
    created_at           TEXT DEFAULT (datetime('now')),
    updated_at           TEXT DEFAULT (datetime('now'))
  )`);

  // ── 录取评估快照 ───────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS admission_evaluations (
    id               TEXT PRIMARY KEY,
    student_id       TEXT NOT NULL,
    program_id       TEXT NOT NULL,
    eval_date        TEXT DEFAULT (datetime('now')),
    -- 硬门槛判断
    hard_pass        INTEGER DEFAULT 0,  -- 1=通过所有硬门槛
    hard_fails       TEXT,  -- JSON: 未通过的硬门槛列表
    -- 各维度得分 (0-100)
    score_academic   REAL,
    score_language   REAL,
    score_extra      REAL,
    score_total      REAL,  -- 加权总分
    -- 差距分析 (JSON)
    gaps             TEXT,  -- [{dimension, current, required, gap, closable}]
    -- 概率区间
    prob_low         REAL,  -- 保守估计
    prob_mid         REAL,  -- 中位估计
    prob_high        REAL,  -- 乐观估计
    confidence       TEXT DEFAULT 'low',  -- low/medium/high
    confidence_note  TEXT,
    -- 元信息
    grade_snapshot   TEXT,  -- JSON: 评估时学生的成绩快照
    notes            TEXT,
    created_by       TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
  )`);

  // ── 基准评估体系 ────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS eval_benchmarks (
    id                  TEXT PRIMARY KEY,
    country             TEXT NOT NULL,
    tier                TEXT NOT NULL,
    subject_area        TEXT NOT NULL,
    display_name        TEXT NOT NULL,
    grade_requirements  TEXT,
    grade_type          TEXT DEFAULT 'A-Level',
    ielts_overall       REAL,
    toefl_overall       INTEGER,
    extra_tests         TEXT,
    weight_academic     REAL DEFAULT 0.60,
    weight_language     REAL DEFAULT 0.25,
    weight_extra        REAL DEFAULT 0.15,
    benchmark_pass_rate REAL,
    notes               TEXT,
    is_active           INTEGER DEFAULT 1,
    created_by          TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS benchmark_evaluations (
    id               TEXT PRIMARY KEY,
    student_id       TEXT NOT NULL,
    benchmark_id     TEXT NOT NULL,
    eval_date        TEXT DEFAULT (datetime('now')),
    hard_pass        INTEGER DEFAULT 0,
    hard_fails       TEXT,
    score_academic   REAL,
    score_language   REAL,
    score_extra      REAL,
    score_total      REAL,
    gaps             TEXT,
    prob_low         REAL,
    prob_mid         REAL,
    prob_high        REAL,
    confidence       TEXT DEFAULT 'low',
    confidence_note  TEXT,
    grade_snapshot   TEXT,
    ai_result        TEXT,
    notes            TEXT,
    created_by       TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
  )`);

  // ── 学校历史录取数据（按专业/年份）───────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS school_admission_history (
    id           TEXT PRIMARY KEY,
    program_id   TEXT NOT NULL,
    student_id   TEXT,       -- 关联学生（若已入学）
    cycle_year   INTEGER NOT NULL,
    offer_result TEXT NOT NULL,  -- offer/reject/waitlist
    grade_profile TEXT,  -- JSON: 该学生提交时的成绩概要
    notes        TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  )`);

  // ── AI 学生升学规划 ──────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS ai_student_plans (
    id                   TEXT PRIMARY KEY,
    student_id           TEXT NOT NULL,
    status               TEXT DEFAULT 'draft',   -- draft/approved/published/archived
    plan_json            TEXT,                    -- AI 返回的完整 JSON
    input_snapshot_json  TEXT,                    -- 发送给 AI 的快照（脱敏）
    model                TEXT,
    prompt_version       TEXT DEFAULT '1.0',
    created_by           TEXT,
    approved_by          TEXT,
    approved_at          TEXT,
    published_at         TEXT,
    notes                TEXT,
    created_at           TEXT DEFAULT (datetime('now')),
    updated_at           TEXT DEFAULT (datetime('now'))
  )`);

  // ── AI 规划应用日志 ────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS ai_plan_apply_logs (
    id           TEXT PRIMARY KEY,
    plan_id      TEXT NOT NULL,
    student_id   TEXT NOT NULL,
    action_type  TEXT NOT NULL,     -- target/task/template/application
    entity_table TEXT,
    entity_id    TEXT,
    action_data  TEXT,              -- JSON
    applied_by   TEXT,
    applied_at   TEXT DEFAULT (datetime('now'))
  )`);

  // ── 入学管理 ─────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS intake_cases (
    id                   TEXT PRIMARY KEY,
    student_id           TEXT,
    student_name         TEXT,
    intake_year          INTEGER NOT NULL,
    program_name         TEXT NOT NULL,
    status               TEXT DEFAULT 'registered',
    case_owner_staff_id  TEXT,
    referral_id          TEXT,
    offer_issued_at      TEXT,
    contract_signed_at   TEXT,
    contract_signed_by   TEXT,
    notes                TEXT,
    created_at           TEXT DEFAULT (datetime('now')),
    updated_at           TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS passport_profiles (
    id             TEXT PRIMARY KEY,
    student_id     TEXT NOT NULL,
    passport_no    TEXT NOT NULL,
    nationality    TEXT NOT NULL,
    date_of_birth  TEXT,
    expiry_date    TEXT NOT NULL,
    issued_at      TEXT,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS finance_invoices (
    id           TEXT PRIMARY KEY,
    case_id      TEXT NOT NULL,
    invoice_no   TEXT UNIQUE NOT NULL,
    currency     TEXT DEFAULT 'SGD',
    amount_total REAL NOT NULL,
    items_json   TEXT,
    status       TEXT DEFAULT 'unpaid',
    due_at       TEXT,
    issued_at    TEXT DEFAULT (datetime('now')),
    void_reason  TEXT,
    created_by   TEXT,
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS finance_payments (
    id              TEXT PRIMARY KEY,
    invoice_id      TEXT NOT NULL,
    paid_amount     REAL NOT NULL,
    method          TEXT DEFAULT 'bank_transfer',
    paid_at         TEXT NOT NULL,
    reference_no    TEXT,
    reconciled      INTEGER DEFAULT 0,
    reconciled_by   TEXT,
    reconciled_at   TEXT,
    notes           TEXT,
    created_by      TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS agents (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    contact     TEXT,
    email       TEXT,
    phone       TEXT,
    commission_rule_id TEXT,
    status      TEXT DEFAULT 'active',
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS referrals (
    id              TEXT PRIMARY KEY,
    source_type     TEXT NOT NULL,
    agent_id        TEXT,
    anonymous_label TEXT,
    referrer_name   TEXT,
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS commission_rules (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    rate        REAL,
    fixed_amount REAL,
    currency    TEXT DEFAULT 'SGD',
    applies_to  TEXT,
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS commission_payouts (
    id                TEXT PRIMARY KEY,
    referral_id       TEXT NOT NULL,
    invoice_id        TEXT,
    rule_id           TEXT,
    base_amount       REAL NOT NULL,
    commission_amount REAL NOT NULL,
    currency          TEXT DEFAULT 'SGD',
    status            TEXT DEFAULT 'pending',
    approved_by       TEXT,
    approved_at       TEXT,
    paid_at           TEXT,
    void_reason       TEXT,
    notes             TEXT,
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS visa_cases (
    id                    TEXT PRIMARY KEY,
    case_id               TEXT NOT NULL,
    status                TEXT DEFAULT 'not_started',
    submission_date       TEXT,
    ipa_issue_date        TEXT,
    ipa_expiry_date       TEXT,
    additional_docs_due   TEXT,
    medical_due           TEXT,
    approved_date         TEXT,
    student_pass_no       TEXT,
    rejection_reason      TEXT,
    notes                 TEXT,
    created_at            TEXT DEFAULT (datetime('now')),
    updated_at            TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS arrival_records (
    id                  TEXT PRIMARY KEY,
    case_id             TEXT NOT NULL,
    expected_arrival    TEXT,
    actual_arrival      TEXT,
    flight_no           TEXT,
    accommodation       TEXT,
    insurance_provider  TEXT,
    pickup_arranged     INTEGER DEFAULT 0,
    orientation_date    TEXT,
    orientation_done    INTEGER DEFAULT 0,
    student_pass_issued INTEGER DEFAULT 0,
    notes               TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS post_arrival_surveys (
    id                  TEXT PRIMARY KEY,
    case_id             TEXT NOT NULL,
    survey_date         TEXT,
    overall_satisfaction INTEGER,
    accommodation_ok    INTEGER DEFAULT 0,
    orientation_helpful INTEGER DEFAULT 0,
    support_needed      TEXT,
    comments            TEXT,
    filled_by           TEXT,
    created_at          TEXT DEFAULT (datetime('now'))
  )`);

  // survey_links 表：满意度调查外链 token
  db.run(`CREATE TABLE IF NOT EXISTS survey_links (
    id          TEXT PRIMARY KEY,
    case_id     TEXT NOT NULL,
    token       TEXT UNIQUE NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    expires_at  TEXT
  )`);

  // ── 文件收发中心（统一文件往来记录）──────────────────
  db.run(`CREATE TABLE IF NOT EXISTS file_exchange_records (
    id               TEXT PRIMARY KEY,
    case_id          TEXT NOT NULL,
    title            TEXT NOT NULL,
    description      TEXT,
    direction        TEXT NOT NULL DEFAULT 'admin_to_student',
    file_path        TEXT,
    original_name    TEXT,
    file_size        INTEGER,
    related_stage    TEXT,
    category         TEXT,
    status           TEXT NOT NULL DEFAULT 'draft',
    request_reply    INTEGER DEFAULT 0,
    reply_instruction TEXT,
    deadline_at      TEXT,
    access_token     TEXT UNIQUE,
    upload_token     TEXT UNIQUE,
    sent_at          TEXT,
    viewed_at        TEXT,
    replied_at       TEXT,
    parent_id        TEXT,
    created_by       TEXT,
    created_by_name  TEXT,
    student_email    TEXT,
    student_name     TEXT,
    reviewed_by      TEXT,
    reviewed_at      TEXT,
    is_deleted       INTEGER DEFAULT 0,
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS file_exchange_logs (
    id          TEXT PRIMARY KEY,
    record_id   TEXT NOT NULL,
    case_id     TEXT NOT NULL,
    action      TEXT NOT NULL,
    actor_type  TEXT DEFAULT 'admin',
    actor_name  TEXT,
    notes       TEXT,
    ip_address  TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  )`);

  // ── 案例文件（统一文件库）────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS case_files (
    id               TEXT PRIMARY KEY,
    case_id          TEXT NOT NULL,
    file_type        TEXT NOT NULL,
    display_name     TEXT NOT NULL,
    filename         TEXT NOT NULL,
    original_name    TEXT,
    file_size        INTEGER,
    uploaded_by      TEXT,
    uploaded_by_name TEXT,
    notes            TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
  )`);

  // ── 文件发送记录（给学生的链接/操作）─────────────────
  db.run(`CREATE TABLE IF NOT EXISTS case_file_sends (
    id               TEXT PRIMARY KEY,
    file_id          TEXT,
    case_id          TEXT NOT NULL,
    send_type        TEXT NOT NULL,
    token            TEXT UNIQUE NOT NULL,
    student_email    TEXT,
    student_name     TEXT,
    sent_by          TEXT,
    sent_by_name     TEXT,
    sent_at          TEXT DEFAULT (datetime('now')),
    viewed_at        TEXT,
    downloaded_at    TEXT,
    completed_at     TEXT,
    result_file_id   TEXT,
    with_watermark   INTEGER DEFAULT 0,
    watermark_text   TEXT DEFAULT '仅供查看',
    expires_at       TEXT
  )`);

  // ── 签字记录 ──────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS case_signatures (
    id               TEXT PRIMARY KEY,
    case_id          TEXT NOT NULL,
    send_id          TEXT,
    signer_name      TEXT,
    signature_data   TEXT,
    ip_address       TEXT,
    signed_at        TEXT DEFAULT (datetime('now')),
    notes            TEXT
  )`);

  // Schema migrations
  try { db.run('ALTER TABLE milestone_tasks ADD COLUMN intake_case_id TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE milestone_tasks ADD COLUMN due_time TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE milestone_tasks ADD COLUMN due_timezone TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE material_items ADD COLUMN intake_case_id TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE material_items ADD COLUMN doc_tag TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE students ADD COLUMN date_of_birth TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE admission_evaluations ADD COLUMN ai_result TEXT'); } catch(e) {}
  // Orientation 扩展字段
  try { db.run('ALTER TABLE arrival_records ADD COLUMN accommodation_address TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE arrival_records ADD COLUMN emergency_contact_name TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE arrival_records ADD COLUMN emergency_contact_phone TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE arrival_records ADD COLUMN student_pass_no TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE arrival_records ADD COLUMN student_pass_expiry TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE arrival_records ADD COLUMN local_bank_account TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE arrival_records ADD COLUMN orientation_notes TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE case_file_sends ADD COLUMN title TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE case_file_sends ADD COLUMN description TEXT'); } catch(e) {}
}

function seedData() {
  const { v4: uuidv4 } = require('uuid');
  const bcrypt = require('bcryptjs');

  // ── 内置日历锚点事件（考试局出分日）─────────────────────
  const anchorEvents = [
    // CIE (Cambridge) — June series 8月中旬, Nov series 次年1月
    { name:'CIE June系列成绩发布 2025', type:'results_release', board:'CIE', series:'June', year:2025, date:'2025-08-14' },
    { name:'CIE June系列成绩发布 2026', type:'results_release', board:'CIE', series:'June', year:2026, date:'2026-08-13' },
    { name:'CIE November系列成绩发布 2025', type:'results_release', board:'CIE', series:'November', year:2025, date:'2026-01-15' },
    { name:'CIE November系列成绩发布 2026', type:'results_release', board:'CIE', series:'November', year:2026, date:'2027-01-14' },
    // Edexcel / Pearson IAL — 3月 & 8月
    { name:'Edexcel IAL January系列成绩发布 2025', type:'results_release', board:'Edexcel', series:'January', year:2025, date:'2025-03-20' },
    { name:'Edexcel IAL June系列成绩发布 2025', type:'results_release', board:'Edexcel', series:'June', year:2025, date:'2025-08-14' },
    { name:'Edexcel IAL January系列成绩发布 2026', type:'results_release', board:'Edexcel', series:'January', year:2026, date:'2026-03-19' },
    { name:'Edexcel IAL June系列成绩发布 2026', type:'results_release', board:'Edexcel', series:'June', year:2026, date:'2026-08-13' },
    // IB — 7月初
    { name:'IB成绩发布 2025', type:'results_release', board:'IB', series:'May', year:2025, date:'2025-07-05' },
    { name:'IB成绩发布 2026', type:'results_release', board:'IB', series:'May', year:2026, date:'2026-07-04' },
    // UCAS key dates
    { name:'UCAS 牛剑/医学截止 2026', type:'app_deadline', board:'UCAS', series:'', year:2026, date:'2025-10-15' },
    { name:'UCAS 普通截止 2026', type:'app_deadline', board:'UCAS', series:'', year:2026, date:'2026-01-28' },
    { name:'UCAS Firm/Insurance选择截止 2026', type:'app_deadline', board:'UCAS', series:'', year:2026, date:'2026-05-06' },
    { name:'UCAS Clearing开放 2026', type:'app_open', board:'UCAS', series:'', year:2026, date:'2026-07-14' },
  ];
  for (const ev of anchorEvents) {
    const existing = get('SELECT id FROM calendar_anchor_events WHERE name=?', [ev.name]);
    if (!existing) {
      db.run(`INSERT INTO calendar_anchor_events (id,name,event_type,exam_board,series,year,event_date,is_system,created_at) VALUES (?,?,?,?,?,?,?,1,?)`,
        [uuidv4(), ev.name, ev.type, ev.board, ev.series, ev.year, ev.date, new Date().toISOString()]);
    }
  }

  // ── 默认升级策略 ──────────────────────────────────────
  const existingEsc = get("SELECT id FROM escalation_policies LIMIT 1");
  if (!existingEsc) {
    db.run(`INSERT INTO escalation_policies (id,name,trigger_days,escalate_to_role,auto_escalate_overdue_hours,apply_to_categories,created_at) VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), '默认升级策略', JSON.stringify([-30,-14,-3,1,3]), 'counselor', 24, null, new Date().toISOString()]);
  }

  // 系统设置默认值（使用 INSERT OR IGNORE，不覆盖已有配置）
  const settingDefaults = [
    ['ps_modal_title', '个人陈述编辑'],
    ['ps_char_limit', '4000'],
    ['ps_questions', JSON.stringify([
      { label: '第一问：为什么对所选学科感兴趣？（学科动机）', hint: '描述您对该学科的热情、兴趣来源和学习动力...' },
      { label: '第二问：您为学习该学科做了哪些准备？（学业准备）', hint: '描述相关课程、阅读、研究项目、竞赛等学业经历...' },
      { label: '第三问：课外活动如何帮助您为大学学习做准备？（课外准备）', hint: '描述课外活动、实践、社会参与等如何与学科相关联...' },
    ])],
    ['assessment_types', JSON.stringify([
      { name: '数学测评',   max: 100, subs: false },
      { name: '英语测评',   max: 100, subs: false },
      { name: '雅思 IELTS', max: 9,   subs: true  },
      { name: '托福 TOEFL', max: 120, subs: false },
      { name: 'SAT',        max: 1600, subs: false },
      { name: 'ACT',        max: 36,  subs: false },
      { name: 'A-Level模考', max: 100, subs: false },
      { name: '面试评估',   max: 100, subs: false },
      { name: '综合测评',   max: 100, subs: false },
      { name: '其他',       max: 100, subs: false },
    ])],
    ['task_categories', JSON.stringify(['材料', '申请', '考试', '面试', '沟通', '其他'])],
    ['app_routes', JSON.stringify(['UK-UG', 'US', 'CA', 'AU', 'SG', '通用'])],
    ['app_tiers', JSON.stringify(['冲刺', '意向', '保底', '通用'])],
    ['school_name', '升学规划中心'],
    ['academic_year', '2025-2026'],
    ['subject_levels', JSON.stringify(['A2', 'AS', 'Full A-Level', 'IB HL', 'IB SL', 'AP', 'IGCSE', '其他'])],
    ['exam_boards', JSON.stringify(['Edexcel', 'CIE', 'OCR', 'AQA', 'WJEC', 'IB', 'College Board', '其他'])],
    ['ps_min_chars_per_q', '350'],
    ['subject_list', JSON.stringify([
      { code: 'MATH', name: '数学 Mathematics' },
      { code: 'FMATH', name: '进阶数学 Further Mathematics' },
      { code: 'PHY', name: '物理 Physics' },
      { code: 'CHEM', name: '化学 Chemistry' },
      { code: 'BIO', name: '生物 Biology' },
      { code: 'ECON', name: '经济学 Economics' },
      { code: 'BUS', name: '商业 Business' },
      { code: 'ACC', name: '会计 Accounting' },
      { code: 'CS', name: '计算机 Computer Science' },
      { code: 'ENG', name: '英语文学 English Literature' },
      { code: 'HIST', name: '历史 History' },
      { code: 'GEO', name: '地理 Geography' },
      { code: 'PSYCH', name: '心理学 Psychology' },
      { code: 'SOC', name: '社会学 Sociology' },
      { code: 'ART', name: '艺术 Art & Design' },
      { code: 'MUS', name: '音乐 Music' },
      { code: 'LAW', name: '法律 Law' },
      { code: 'CHN', name: '中文 Chinese' },
      { code: 'FR', name: '法语 French' },
      { code: 'DE', name: '德语 German' },
    ])],
  ];
  for (const [key, value] of settingDefaults) {
    db.run('INSERT OR IGNORE INTO settings VALUES (?,?)', [key, value]);
  }

  // 新加坡高校模板（每次启动时检查并补充，不受用户数量限制）
  {
    const { v4: uuidv4SG } = require('uuid');
    const nowSG = new Date().toISOString();
    const insertTplEarly = (id, name, desc, route, tier, items, deadlineTime, deadlineTz) => {
      db.run(`INSERT INTO timeline_templates (id,name,description,route,tier,is_system,created_by,created_at,deadline_time,deadline_timezone) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, name, desc, route, tier, 1, null, nowSG, deadlineTime||null, deadlineTz||null]);
      items.forEach((item, idx) => {
        db.run(`INSERT INTO template_items (id,template_id,title,description,category,days_before_deadline,priority,sort_order) VALUES (?,?,?,?,?,?,?,?)`,
          [uuidv4SG(), id, item.title, item.desc||'', item.cat, item.days, item.pri||'normal', idx]);
      });
    };
    const existingSG = get("SELECT COUNT(*) as cnt FROM timeline_templates WHERE route='SG'");
    if (!existingSG || existingSG.cnt === 0) {
      insertTplEarly(uuidv4SG(), '新加坡国立大学 NUS', '新加坡国立大学本科直接申请，国际生截止日一般为次年2月底。涵盖从选专业到面试的完整流程。', 'SG', '冲刺', [
        { title: '研究NUS专业设置与录取要求',                  cat:'申请', days:270, pri:'high'   },
        { title: '确认申请学院与专业（可选3个志愿）',           cat:'申请', days:240, pri:'high'   },
        { title: '注册NUS网申账号（admissions.nus.edu.sg）',    cat:'申请', days:180, pri:'normal' },
        { title: '准备官方成绩单及A-Level/IB认证件',           cat:'材料', days:150, pri:'high'   },
        { title: '个人陈述/动机信初稿（Why NUS/Why Course）',   cat:'材料', days:120, pri:'high'   },
        { title: '确认推荐人（2封，学术推荐为主）',             cat:'材料', days:120, pri:'high'   },
        { title: '雅思/托福成绩送分至NUS',                     cat:'考试', days: 90, pri:'high'   },
        { title: 'SAT/A-Level成绩核对并录入申请表',             cat:'考试', days: 75, pri:'high'   },
        { title: '个人陈述终稿（字数与格式核对）',              cat:'材料', days: 60, pri:'high'   },
        { title: '推荐信追踪确认（确认导师已提交）',            cat:'材料', days: 45, pri:'high'   },
        { title: 'NUS Scholarship奖学金申请（如适用）',         cat:'申请', days: 30, pri:'normal' },
        { title: '申请表全项复核（所有附件上传完整）',          cat:'申请', days: 10, pri:'high'   },
        { title: '提交NUS网申',                                cat:'申请', days:  0, pri:'high'   },
        { title: '关注邮件：核实收到申请确认信',                cat:'沟通', days: -7, pri:'normal' },
        { title: '面试邀请跟进（部分专业含面试）',              cat:'面试', days:-30, pri:'normal' },
        { title: '等待录取结果（一般3-4月公布）',               cat:'申请', days:-60, pri:'normal' },
      ], '23:59', 'Asia/Singapore');
      insertTplEarly(uuidv4SG(), '新加坡南洋理工大学 NTU', '南洋理工大学本科申请，国际生截止日一般为次年2月底。工程/商科/理科/艺术路径均适用。', 'SG', '冲刺', [
        { title: '了解NTU专业分布（工程/商业/理科/人文）',      cat:'申请', days:270, pri:'high'   },
        { title: '研究NTU双联学位及荣誉学位项目',              cat:'申请', days:240, pri:'normal' },
        { title: '确认申请专业优先级（最多3个）',               cat:'申请', days:210, pri:'high'   },
        { title: '注册NTU网申账号（admissions.ntu.edu.sg）',    cat:'申请', days:180, pri:'normal' },
        { title: '准备在读成绩单与课程表（中英对照）',          cat:'材料', days:150, pri:'normal' },
        { title: '个人陈述初稿（Why NTU/专业动机）',           cat:'材料', days:120, pri:'high'   },
        { title: '推荐人确认（2封，学科老师优先）',             cat:'材料', days:120, pri:'high'   },
        { title: '语言成绩送分（雅思/托福）',                  cat:'考试', days: 90, pri:'high'   },
        { title: 'A-Level/SAT/IB成绩核对',                    cat:'考试', days: 75, pri:'high'   },
        { title: '个人陈述终稿',                               cat:'材料', days: 60, pri:'high'   },
        { title: '推荐信提交追踪',                             cat:'材料', days: 45, pri:'normal' },
        { title: '申请表全项填写并附件上传',                   cat:'申请', days: 14, pri:'high'   },
        { title: '提交NTU网申',                               cat:'申请', days:  0, pri:'high'   },
        { title: '确认申请受理邮件',                           cat:'沟通', days: -7, pri:'normal' },
        { title: '面试通知跟进（部分专业有面试）',              cat:'面试', days:-30, pri:'normal' },
        { title: '等待录取结果（一般3-4月公布）',               cat:'申请', days:-60, pri:'normal' },
      ], '23:59', 'Asia/Singapore');
      insertTplEarly(uuidv4SG(), '新加坡科技设计大学 SUTD', 'SUTD本科申请，截止日通常为3月中旬。设计/建筑方向需提交作品集，与MIT/浙大联合培养特色显著。', 'SG', '意向', [
        { title: '了解SUTD四大支柱课程：ASD/ESD/EPD/ISTD',     cat:'申请', days:270, pri:'high'   },
        { title: '确认申请方向（设计/工程/信息系统）',          cat:'申请', days:240, pri:'high'   },
        { title: '研究MIT/浙大联合培养项目申请条件',            cat:'申请', days:210, pri:'normal' },
        { title: '注册SUTD网申账号',                           cat:'申请', days:150, pri:'normal' },
        { title: '作品集选题策划（设计/建筑方向必须）',         cat:'材料', days:150, pri:'high'   },
        { title: '作品集初稿完成（8-15页，含项目说明）',        cat:'材料', days:120, pri:'high'   },
        { title: '个人陈述初稿（创新力/设计思维/学科动机）',    cat:'材料', days:105, pri:'high'   },
        { title: '推荐信申请（1-2封，可含业界导师）',           cat:'材料', days: 90, pri:'high'   },
        { title: '语言成绩送分（雅思/托福）',                  cat:'考试', days: 75, pri:'high'   },
        { title: '作品集终稿（格式/分辨率/文件大小核对）',      cat:'材料', days: 60, pri:'high'   },
        { title: '个人陈述终稿',                               cat:'材料', days: 45, pri:'high'   },
        { title: '申请表填写完整并上传所有附件',               cat:'申请', days: 10, pri:'high'   },
        { title: '提交SUTD网申',                               cat:'申请', days:  0, pri:'high'   },
        { title: '准备Design Challenge测试（如有）',            cat:'面试', days:-14, pri:'normal' },
        { title: '面试/Portfolio Review跟进',                   cat:'面试', days:-30, pri:'normal' },
        { title: '等待录取结果（一般4-5月公布）',               cat:'申请', days:-60, pri:'normal' },
      ], '23:59', 'Asia/Singapore');
      insertTplEarly(uuidv4SG(), '新加坡管理大学 SMU', 'SMU本科申请，截止日通常为3月底。商科/法律/社科为主，面试权重高，注重领导力与课外活动经历。', 'SG', '意向', [
        { title: '研究SMU六大学院：商/会计/法律/经济/社科/IT',  cat:'申请', days:270, pri:'high'   },
        { title: '确认申请学院与项目（最多2个）',               cat:'申请', days:240, pri:'high'   },
        { title: '了解SMU小班互动教学与演讲文化',              cat:'申请', days:210, pri:'normal' },
        { title: '注册SMU网申账号（admissions.smu.edu.sg）',    cat:'申请', days:150, pri:'normal' },
        { title: '整理课外活动记录（领导力/社区/竞赛）',        cat:'材料', days:120, pri:'normal' },
        { title: '个人动机信初稿（Why SMU/Why Course/Career）', cat:'材料', days:105, pri:'high'   },
        { title: '推荐信申请（2封，学术+业界各1封最佳）',       cat:'材料', days:105, pri:'high'   },
        { title: '语言成绩送分（雅思/托福）',                  cat:'考试', days: 90, pri:'high'   },
        { title: '课外活动证明材料整理上传',                   cat:'材料', days: 75, pri:'normal' },
        { title: '个人动机信终稿',                             cat:'材料', days: 60, pri:'high'   },
        { title: '申请表全项填写（成绩/活动/Essay）',           cat:'申请', days: 30, pri:'high'   },
        { title: '提交SMU网申',                               cat:'申请', days:  0, pri:'high'   },
        { title: '面试准备：商业时事、Case讨论、自我介绍',      cat:'面试', days:-14, pri:'high'   },
        { title: '参加SMU招生面试（Admissions Interview）',     cat:'面试', days:-30, pri:'high'   },
        { title: '面试后发送感谢邮件（可选但加分）',            cat:'沟通', days:-31, pri:'low'    },
        { title: '等待录取结果（一般4-5月公布）',               cat:'申请', days:-60, pri:'normal' },
      ], '23:59', 'Asia/Singapore');
    }
  }

  // ── 演示学生（5名，幂等追加，无论是否已有其他数据）──────
  if (!get("SELECT id FROM students WHERE name='陈美琳'")) {
    const dnow = new Date().toISOString();
    const { v4: _uuid } = require('uuid');
    const uid = () => _uuid();

    const counselorStaff = get("SELECT id FROM staff WHERE role='counselor' LIMIT 1");
    const mentorStaff    = get("SELECT id FROM staff WHERE role='mentor' LIMIT 1");
    const cid = counselorStaff?.id || null;
    const mid = mentorStaff?.id   || null;

    const sA = uid(), sB = uid(), sC = uid(), sD = uid(), sE = uid();
    const students5 = [
      [sA, '陈美琳', 'G12', '2024-09-01', 'CIE',     'active', '目标英国医学方向，生物化学基础扎实', dnow, dnow],
      [sB, '刘浩然', 'G12', '2024-09-01', 'CIE',     'active', '目标美国顶尖CS项目，数学成绩突出',   dnow, dnow],
      [sC, '王雅欣', 'G11', '2024-09-01', 'CIE',     'active', '目标英国经济/社科，规划阶段',        dnow, dnow],
      [sD, '赵天宇', 'G12', '2024-09-01', 'Edexcel', 'active', '英国商科金融方向，已收到多个Offer',  dnow, dnow],
      [sE, '林佳怡', 'G12', '2024-09-01', 'CIE',     'active', '新加坡高校申请，商科/经济方向',      dnow, dnow],
    ];
    for (const s of students5) db.run(
      `INSERT INTO students (id,name,grade_level,enrol_date,exam_board,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, s);

    const assessments5 = [
      [uid(),sA,'2024-09-03','数学测评','数学',88,100,82,'',dnow],
      [uid(),sA,'2024-09-03','英语测评','英语',84,100,78,'',dnow],
      [uid(),sA,'2024-10-15','雅思 IELTS','英语',7.5,9,88,'口语7.5，写作7.0',dnow],
      [uid(),sA,'2024-09-10','综合测评','综合',90,100,91,'逻辑推理优秀',dnow],
      [uid(),sB,'2024-09-04','数学测评','数学',97,100,98,'',dnow],
      [uid(),sB,'2024-09-04','英语测评','英语',88,100,85,'',dnow],
      [uid(),sB,'2024-11-20','SAT','综合',1530,1600,95,'Math 800, ERW 730',dnow],
      [uid(),sC,'2024-09-05','数学测评','数学',82,100,75,'',dnow],
      [uid(),sC,'2024-09-05','英语测评','英语',78,100,68,'',dnow],
      [uid(),sD,'2024-09-06','数学测评','数学',79,100,70,'',dnow],
      [uid(),sD,'2024-09-06','英语测评','英语',80,100,72,'',dnow],
      [uid(),sD,'2024-10-20','雅思 IELTS','英语',7.0,9,82,'四项均7.0',dnow],
      [uid(),sE,'2024-09-07','数学测评','数学',86,100,80,'',dnow],
      [uid(),sE,'2024-09-07','英语测评','英语',79,100,71,'',dnow],
      [uid(),sE,'2024-11-05','雅思 IELTS','英语',7.0,9,83,'写作6.5，其余7.0以上',dnow],
    ];
    for (const a of assessments5) db.run(`INSERT INTO admission_assessments VALUES (?,?,?,?,?,?,?,?,?,?)`, a);

    const getSubjectId5 = (code) => get('SELECT id FROM subjects WHERE code=?', [code])?.id;
    const mathId5=getSubjectId5('MATH'), physId5=getSubjectId5('PHYS'),
          chemId5=getSubjectId5('CHEM'), bioId5=getSubjectId5('BIO'),
          econId5=getSubjectId5('ECON'), csId5=getSubjectId5('CS'),
          histId5=getSubjectId5('HIST');
    const enroll5 = (sid, subId, level, board) => {
      if (subId) db.run(`INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)`, [uid(),sid,subId,level,board,dnow]);
    };
    enroll5(sA,mathId5,'A2','CIE'); enroll5(sA,bioId5,'A2','CIE'); enroll5(sA,chemId5,'A2','CIE');
    enroll5(sB,mathId5,'A2','CIE'); enroll5(sB,csId5,'A2','CIE'); enroll5(sB,physId5,'A2','CIE');
    enroll5(sC,mathId5,'AS','CIE'); enroll5(sC,econId5,'AS','CIE'); enroll5(sC,histId5,'AS','CIE');
    enroll5(sD,mathId5,'A2','Edexcel'); enroll5(sD,econId5,'A2','Edexcel');
    enroll5(sE,mathId5,'A2','CIE'); enroll5(sE,econId5,'A2','CIE'); enroll5(sE,bioId5,'A2','CIE');

    if (cid) for (const sid of [sA,sB,sC,sD,sE])
      db.run(`INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)`, [uid(),sid,cid,'升学规划师','2024-09-10',null,'',dnow]);
    if (mid) for (const sid of [sA,sB,sD,sE])
      db.run(`INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)`, [uid(),sid,mid,'导师','2024-09-10',null,'',dnow]);

    const uOxford=uid(),uUCL=uid(),uKings=uid(),uMIT=uid(),uUCLA=uid(),uNYU=uid(),
          uLSE=uid(),uManch=uid(),uWarwick=uid(),uBath=uid(),uLeeds=uid(),uNUS=uid(),uNTU=uid();
    const unis5=[
      [uOxford,'牛津大学 University of Oxford','UK',''],
      [uUCL,'伦敦大学学院 UCL','UK',''],
      [uKings,"伦敦国王学院 King's College London",'UK',''],
      [uMIT,'麻省理工学院 MIT','US',''],
      [uUCLA,'加州大学洛杉矶分校 UCLA','US',''],
      [uNYU,'纽约大学 NYU','US',''],
      [uLSE,'伦敦政治经济学院 LSE','UK',''],
      [uManch,'曼彻斯特大学 University of Manchester','UK',''],
      [uWarwick,'华威大学 University of Warwick','UK',''],
      [uBath,'巴斯大学 University of Bath','UK',''],
      [uLeeds,'利兹大学 University of Leeds','UK',''],
      [uNUS,'新加坡国立大学 NUS','SG',''],
      [uNTU,'南洋理工大学 NTU','SG',''],
    ];
    for (const u of unis5) db.run(`INSERT OR IGNORE INTO universities VALUES (?,?,?,?)`, u);

    const targetLists5=[
      [uid(),sA,uOxford,'牛津大学','冲刺',1,'生物医学 Biomedical Sciences','最高目标',dnow],
      [uid(),sA,uUCL,'UCL','意向',2,'医学 Medicine','主力意向',dnow],
      [uid(),sA,uKings,'伦敦国王学院','保底',3,'医学 Medicine','保底院校',dnow],
      [uid(),sB,uMIT,'MIT','冲刺',1,'计算机科学 CS','梦想学校',dnow],
      [uid(),sB,uUCLA,'UCLA','意向',2,'计算机科学 CS','主力意向',dnow],
      [uid(),sB,uNYU,'NYU','保底',3,'计算机科学 CS','保底',dnow],
      [uid(),sC,uLSE,'LSE','冲刺',1,'经济学 Economics','目标顶校',dnow],
      [uid(),sC,uManch,'曼彻斯特大学','意向',2,'经济学 Economics','意向选择',dnow],
      [uid(),sD,uWarwick,'华威大学','冲刺',1,'金融学 Finance','主力冲刺',dnow],
      [uid(),sD,uBath,'巴斯大学','意向',2,'商学 Business','已收Offer',dnow],
      [uid(),sD,uLeeds,'利兹大学','保底',3,'商学 Business','保底Offer',dnow],
      [uid(),sE,uNUS,'NUS','冲刺',1,'商科 Business Administration','首选',dnow],
      [uid(),sE,uNTU,'NTU','意向',2,'经济学 Economics','意向',dnow],
    ];
    for (const t of targetLists5) db.run(`INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)`, t);

    const appA1=uid(),appA2=uid(),appA3=uid(),appB1=uid(),appB2=uid(),appB3=uid(),
          appC1=uid(),appD1=uid(),appD2=uid(),appD3=uid(),appE1=uid(),appE2=uid();
    const iApp=(id,sid,uniId,uniName,dept,tier,year,route,deadline,submitDate,offerType,status,conditions,notes)=>
      db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id,sid,uniId,uniName,dept,tier,year,route,deadline,submitDate,null,'[]',null,offerType||'Pending',conditions||'',0,0,null,status,notes||'',dnow,dnow]);

    iApp(appA1,sA,uOxford,'牛津大学','生物医学 Biomedical Sciences','冲刺',2026,'UK-UG','2025-10-15','2025-10-12','Pending','pending','','牛剑截止，已提交，等待面试通知');
    iApp(appA2,sA,uUCL,'UCL','医学 Medicine','意向',2026,'UK-UG','2026-01-28','2026-01-20','Conditional','conditional_offer','A*AA in Chemistry, Biology, Mathematics','已收到Conditional Offer：A*AA');
    iApp(appA3,sA,uKings,'伦敦国王学院','医学 Medicine','保底',2026,'UK-UG','2026-01-28','2026-01-20','Conditional','conditional_offer','AAA in relevant subjects','已收到Conditional Offer：AAA');
    iApp(appB1,sB,uMIT,'MIT','计算机科学与工程 EECS','冲刺',2026,'US','2024-11-01','2024-10-30','Rejected','rejected','','ED轮申请，已收到拒信');
    iApp(appB2,sB,uUCLA,'UCLA','计算机科学 Computer Science','意向',2026,'US','2025-11-30',null,'Pending','pending','','RD申请，等待结果');
    iApp(appB3,sB,uNYU,'NYU','计算机科学 Computer Science','保底',2026,'US','2025-01-01','2024-12-28','Conditional','conditional_offer','Maintain GPA and submit final transcripts','已收到Offer');
    iApp(appC1,sC,uLSE,'LSE','经济学 Economics','冲刺',2027,'UK-UG','2027-01-15',null,'Pending','pending','','2027年入学，当前G11，提前规划');
    iApp(appD1,sD,uWarwick,'华威大学','金融学 Finance','冲刺',2026,'UK-UG','2026-01-28','2026-01-15','Conditional','conditional_offer','A*AB or above including Mathematics','已收到Conditional Offer，等待最终成绩');
    iApp(appD2,sD,uBath,'巴斯大学','商学 Business Administration','意向',2026,'UK-UG','2026-01-28','2026-01-15','Unconditional','unconditional_offer','','已收到Unconditional Offer！');
    iApp(appD3,sD,uLeeds,'利兹大学','商学 Business','保底',2026,'UK-UG','2026-01-28','2026-01-15','Unconditional','unconditional_offer','','已收到Unconditional Offer');
    iApp(appE1,sE,uNUS,'NUS','商科 Business Administration','冲刺',2026,'SG','2026-02-28','2026-02-20','Pending','pending','','已提交，等待审核');
    iApp(appE2,sE,uNTU,'NTU','经济学 Economics','意向',2026,'SG','2026-02-28','2026-02-20','Pending','pending','','已提交，等待审核');

    const iTask=(sid,appId,title,desc,cat,dueDate,completedAt,status,priority)=>
      db.run(`INSERT INTO milestone_tasks (id,student_id,application_id,title,description,category,due_date,completed_at,status,priority,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [uid(),sid,appId,title,desc||'',cat,dueDate,completedAt,status,priority,cid,dnow,dnow]);

    iTask(sA,appA1,'个人陈述三问全部草稿','完成PS三问初稿','材料','2025-08-15','2025-08-10','done','high');
    iTask(sA,appA1,'个人陈述定稿','导师修改并定稿','材料','2025-09-20','2025-09-18','done','high');
    iTask(sA,appA1,'推荐信确认（三封）','数学、生物、化学老师各一封','材料','2025-09-25','2025-09-22','done','high');
    iTask(sA,appA1,'UCAS提交牛津','牛剑截止10月15日','申请','2025-10-15','2025-10-12','done','high');
    iTask(sA,appA1,'牛津面试准备','模拟面试、学科知识深化','面试','2025-11-30',null,'in_progress','high');
    iTask(sA,appA2,'UCL Offer条件达标复核','确认A*AA成绩规划可达','申请','2026-06-30',null,'pending','high');
    iTask(sA,null,'6月大考备考计划','CIE June 2026 大考冲刺','考试','2026-04-01',null,'pending','high');
    iTask(sB,appB1,'Common App注册与基础填写','ED申请准备','申请','2024-09-01','2024-08-28','done','normal');
    iTask(sB,appB1,'MIT主Essay定稿','Why MIT及活动描述','材料','2024-10-25','2024-10-20','done','high');
    iTask(sB,appB1,'SAT成绩送分至各校','发送至MIT/UCLA/NYU','考试','2024-10-15','2024-10-10','done','high');
    iTask(sB,appB2,'UCLA Supplement Essay','填写附加文章','材料','2025-11-20',null,'in_progress','high');
    iTask(sB,appB2,'UCLA RD申请提交','截止11月30日','申请','2025-11-30',null,'pending','high');
    iTask(sB,appB3,'NYU Offer跟进','确认入学/奖学金信息','申请','2025-05-01',null,'pending','normal');
    iTask(sC,null,'选校研究与名单确认','G11阶段提前规划，英国经济方向','申请','2025-06-30',null,'in_progress','high');
    iTask(sC,null,'雅思考试备考','目标7.5+，6月考试','考试','2025-06-15',null,'pending','high');
    iTask(sC,null,'个人陈述框架规划','经济方向动机信框架','材料','2025-09-01',null,'pending','normal');
    iTask(sC,appC1,'LSE申请材料清单确认','提前了解LSE申请要求','申请','2026-04-01',null,'pending','normal');
    iTask(sD,appD1,'个人陈述定稿','金融/商科方向','材料','2025-12-10','2025-12-08','done','high');
    iTask(sD,appD1,'UCAS申请提交','1月截止前提交','申请','2026-01-15','2026-01-15','done','high');
    iTask(sD,appD2,'确认巴斯大学Firm选择','已收Unconditional，确认为First Choice','申请','2026-05-06',null,'pending','high');
    iTask(sD,appD2,'申请巴斯奖学金','递交成绩单和奖学金申请表','申请','2026-05-20',null,'pending','normal');
    iTask(sD,null,'6月大考冲刺','Edexcel数学+经济A2大考','考试','2026-04-15',null,'pending','high');
    iTask(sE,appE1,'NUS申请表填写','所有信息核对','申请','2026-02-15','2026-02-14','done','high');
    iTask(sE,appE1,'NUS申请提交','截止2月28日','申请','2026-02-28','2026-02-20','done','high');
    iTask(sE,appE1,'NUS面试准备','商科方向面试技巧','面试','2026-03-20',null,'pending','high');
    iTask(sE,appE2,'NTU Offer跟进','追踪申请进度','申请','2026-04-01',null,'pending','normal');
    iTask(sE,null,'雅思7.5冲刺','当前7.0，目标提高写作分','考试','2026-03-01',null,'pending','normal');

    const iMat=(sid,appId,type,title,status,notes)=>
      db.run(`INSERT INTO material_items (id,student_id,application_id,material_type,title,status,version,file_path,notes,reviewed_by,reviewed_at,submitted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [uid(),sid,appId,type,title,status,1,null,notes||'',cid,null,null,dnow,dnow]);

    iMat(sA,appA1,'个人陈述','牛津生物医学PS','已定稿','UCAS版本，3983字符');
    iMat(sA,appA1,'推荐信','数学老师推荐信','已提交','CIE数学老师撰写');
    iMat(sA,appA1,'推荐信','生物老师推荐信','已提交','');
    iMat(sA,appA1,'成绩单','CIE AS成绩单','已上传','Math A, Bio A, Chem A');
    iMat(sB,appB1,'个人陈述','Common App Essay','已定稿','650字，Why EECS方向');
    iMat(sB,appB2,'个人陈述','UCLA Supplement','草稿','进行中，Why UCLA篇');
    iMat(sB,appB3,'成绩单','SAT成绩单','已上传','1530分');
    iMat(sC,null,'个人陈述','LSE Economics PS','未开始','框架规划中');
    iMat(sD,appD1,'个人陈述','华威金融PS','已定稿','UCAS版本，3950字符');
    iMat(sD,appD1,'推荐信','数学老师推荐信','已提交','');
    iMat(sD,appD2,'录取通知','巴斯Unconditional Offer','已上传','已截图存档');
    iMat(sE,appE1,'个人陈述','NUS商科动机信','已定稿','NUS指定格式，800字');
    iMat(sE,appE2,'成绩单','CIE AS成绩单','已上传','Math A, Econ B, Bio A');

    const iComm=(sid,ch,summary,actions)=>
      db.run(`INSERT INTO communication_logs VALUES (?,?,?,?,?,?,?,?,?)`,
        [uid(),sid,cid,null,ch,summary,actions,dnow,dnow]);
    iComm(sA,'微信','与陈美琳家长沟通UCL Conditional Offer条件，确认备考计划','6月大考全力备考数学、生物、化学，目标A*AA');
    iComm(sB,'面谈','刘浩然MIT被拒后心理疏导，讨论UCLA RD策略','优化UCLA Supplement，确认备选校策略');
    iComm(sD,'微信','赵天宇收到巴斯Unconditional Offer，祝贺并讨论Firm选择','确认巴斯为Firm，华威为Insurance');
    iComm(sE,'邮件','林佳怡NUS申请材料核对，所有文件已提交','静候面试通知，准备商科面试题库');

    save();
  }

  // ── 录取评估库演示数据（幂等，无论是否已有其他数据都检查）──
  {
    const existingPrograms = get('SELECT COUNT(*) as cnt FROM uni_programs');
    if (!existingPrograms || existingPrograms.cnt === 0) {
      const pnow = new Date().toISOString();
      // 统一使用 31 列格式: id,uni_name,program_name,department,country,route,cycle_year,
      //   app_deadline,app_deadline_time,app_deadline_tz,ucas_early_deadline,
      //   grade_requirements,min_subjects,grade_type,ielts_overall,ielts_min_component,
      //   extra_tests,reference_required,reference_notes,
      //   hist_applicants,hist_offers,hist_offer_rate,hist_avg_grade,hist_data_year,
      //   weight_academic,weight_language,weight_extra,notes,created_by,created_at,updated_at
      const pCols = `(id,uni_name,program_name,department,country,route,cycle_year,
         app_deadline,app_deadline_time,app_deadline_tz,ucas_early_deadline,
         grade_requirements,min_subjects,grade_type,ielts_overall,ielts_min_component,
         extra_tests,reference_required,reference_notes,
         hist_applicants,hist_offers,hist_offer_rate,hist_avg_grade,hist_data_year,
         weight_academic,weight_language,weight_extra,notes,created_by,created_at,updated_at)`;
      const pQ = 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';

      // ① 剑桥大学 — 计算机科学
      const camCs = uuidv4();
      db.run(`INSERT INTO uni_programs ${pCols} ${pQ}`,
        [camCs,'University of Cambridge','Computer Science BA','Department of Computer Science and Technology',
         'UK','UK-UG',2026,'2025-10-15','18:00','Europe/London',1,
         JSON.stringify([
           { subject:'Mathematics',         min_grade:'A*', required:true,  notes:'必须A*' },
           { subject:'Further Mathematics', min_grade:'A',  required:true,  notes:'强烈推荐' },
           { subject:'Physics',             min_grade:'A',  required:false, notes:'优先考虑理科背景' },
         ]),3,'A-Level',7.0,6.5,
         JSON.stringify([{ test:'STEP', required:true, min_score:2, deadline:'', notes:'STEP II/III 成绩级别≥2' }]),
         1,'需1封学术推荐信，由数学教师撰写',
         2800,168,0.06,'A*A*A - A*AA',2024,
         0.65,0.15,0.20,
         '牛剑早截止10月15日。STEP数学笔试为硬门槛，需提前报名备考。对Further Maths要求极高。',
         null,pnow,pnow]);
      for (const [r1,g1] of [
        ['offer','A*A*A'],['offer','A*AA'],['offer','A*A*A*'],
        ['reject','AAB'], ['reject','AAA'],['waitlist','A*AA'],
        ['offer','A*A*A'],['reject','ABB'],['offer','A*AA'], ['reject','BBB'],
      ]) db.run('INSERT INTO school_admission_history (id,program_id,cycle_year,offer_result,grade_profile,created_at) VALUES (?,?,?,?,?,?)',
          [uuidv4(),camCs,2024,r1,JSON.stringify({summary:g1}),pnow]);

      // ② UCL — 经济学
      const uclEcon = uuidv4();
      db.run(`INSERT INTO uni_programs ${pCols} ${pQ}`,
        [uclEcon,'University College London (UCL)','Economics BSc','Department of Economics',
         'UK','UK-UG',2026,'2026-01-28','18:00','Europe/London',0,
         JSON.stringify([
           { subject:'Mathematics', min_grade:'A',  required:true,  notes:'数学为硬性要求' },
           { subject:'Economics',   min_grade:'A',  required:false, notes:'有经济学背景优先' },
         ]),3,'A-Level',6.5,6.0,
         null,1,null,
         3200,512,0.16,'AAA - AAB',2024,
         0.60,0.25,0.15,
         '普通UCAS截止（1月28日）。需数学A及以上。推荐有经济学或商业背景。',
         null,pnow,pnow]);
      for (const [r2,g2] of [
        ['offer','AAA'],['offer','AAB'],['offer','AAA'],['offer','ABB'],
        ['reject','BBB'],['reject','ABC'],['offer','AAA'],['reject','BCC'],
        ['waitlist','AAB'],['offer','AAA'],['reject','BBB'],['offer','AAB'],
      ]) db.run('INSERT INTO school_admission_history (id,program_id,cycle_year,offer_result,grade_profile,created_at) VALUES (?,?,?,?,?,?)',
          [uuidv4(),uclEcon,2024,r2,JSON.stringify({summary:g2}),pnow]);

      // ③ 爱丁堡大学 — 医学 MBChB
      const edMed = uuidv4();
      db.run(`INSERT INTO uni_programs ${pCols} ${pQ}`,
        [edMed,'University of Edinburgh','Medicine MBChB','Edinburgh Medical School',
         'UK','UK-UG',2026,'2025-10-15','18:00','Europe/London',1,
         JSON.stringify([
           { subject:'Chemistry',   min_grade:'A', required:true,  notes:'化学必须A' },
           { subject:'Biology',     min_grade:'A', required:true,  notes:'生物必须A' },
           { subject:'Mathematics', min_grade:'B', required:false, notes:'数学/物理之一' },
         ]),3,'A-Level',7.0,6.5,
         JSON.stringify([{ test:'UCAT', required:true, min_score:2600, deadline:'2025-09-30', notes:'UCAT联合招生测试，9月底截止' }]),
         1,'需1封职业相关推荐信（医疗工作经历证明推荐人）',
         4500,225,0.05,'A*AA - AAA（医学专业竞争极激烈）',2024,
         0.50,0.15,0.35,
         '医学专业牛剑早截止（10月15日）。UCAT是硬门槛，需提前6-9个月准备。需工作体验证明。',
         null,pnow,pnow]);
      for (const [r3,g3] of [
        ['offer','A*AA'],['offer','AAA'],['reject','AAB'],['reject','ABB'],
        ['offer','A*AA'],['reject','BBB'],['waitlist','AAA'],['reject','AAB'],
      ]) db.run('INSERT INTO school_admission_history (id,program_id,cycle_year,offer_result,grade_profile,created_at) VALUES (?,?,?,?,?,?)',
          [uuidv4(),edMed,2024,r3,JSON.stringify({summary:g3}),pnow]);

      // ④ NUS — 商科
      const nusBiz = uuidv4();
      db.run(`INSERT INTO uni_programs ${pCols} ${pQ}`,
        [nusBiz,'National University of Singapore (NUS)','Business Administration (International)','NUS Business School',
         'SG','SG',2026,'2026-03-17','23:59','Asia/Singapore',0,
         JSON.stringify([
           { subject:'Mathematics', min_grade:'B', required:true,  notes:'H2数学或等同学历' },
           { subject:'Economics',   min_grade:'C', required:false, notes:'有经济背景加分' },
         ]),2,'A-Level',6.0,5.5,
         null,1,null,
         1800,360,0.20,'AAB - ABB',2024,
         0.55,0.30,0.15,
         '国际生名额约占30%，竞争较激烈。SAT/ACT成绩可加分，不作强制要求。需提交语言成绩。',
         null,pnow,pnow]);
      for (const [r4,g4] of [
        ['offer','AAB'],['offer','ABB'],['offer','AAA'],['reject','BBC'],
        ['reject','CCC'],['offer','ABB'],['waitlist','AAB'],['reject','BCC'],
        ['offer','AAB'],['offer','ABB'],
      ]) db.run('INSERT INTO school_admission_history (id,program_id,cycle_year,offer_result,grade_profile,created_at) VALUES (?,?,?,?,?,?)',
          [uuidv4(),nusBiz,2024,r4,JSON.stringify({summary:g4}),pnow]);

      // ⑤ 曼彻斯特大学 — 计算机科学
      const manchCs = uuidv4();
      db.run(`INSERT INTO uni_programs ${pCols} ${pQ}`,
        [manchCs,'University of Manchester','Computer Science BSc','Department of Computer Science',
         'UK','UK-UG',2026,'2026-01-28','18:00','Europe/London',0,
         JSON.stringify([
           { subject:'Mathematics',      min_grade:'A', required:true,  notes:'数学A必须' },
           { subject:'Physics',          min_grade:'B', required:false, notes:'理科背景优先' },
           { subject:'Computer Science', min_grade:'B', required:false, notes:'有CS背景加分' },
         ]),3,'A-Level',6.5,5.5,
         null,1,null,
         2400,600,0.25,'AAB - ABB',2024,
         0.65,0.25,0.10,
         'Russell Group成员，CS排名全英前10。接受Further Maths替代Physics。编程作品集可显著提升录取可能性。',
         null,pnow,pnow]);
      for (const [r5,g5] of [
        ['offer','AAB'],['offer','ABB'],['offer','AAA'],['offer','AAB'],
        ['reject','BCC'],['reject','CCC'],['offer','ABB'],['reject','BBC'],
        ['offer','AAB'],['waitlist','ABB'],['offer','AAB'],['reject','BBB'],
      ]) db.run('INSERT INTO school_admission_history (id,program_id,cycle_year,offer_result,grade_profile,created_at) VALUES (?,?,?,?,?,?)',
          [uuidv4(),manchCs,2024,r5,JSON.stringify({summary:g5}),pnow]);
    }
  }

  // 检查是否已有数据
  const existing = get('SELECT COUNT(*) as cnt FROM users');
  if (existing && existing.cnt > 0) return;

  const now = new Date().toISOString();

  // ── 用户账户 ────────────────────────────────────────
  const BCRYPT_COST = parseInt(process.env.BCRYPT_COST || '12');
  const hash = (pw) => bcrypt.hashSync(pw, BCRYPT_COST);

  const principalId = uuidv4();
  const counselorId = uuidv4();
  const mentorId = uuidv4();
  const student1UserId = uuidv4();
  const parent1UserId = uuidv4();

  // ── 教职工 ──────────────────────────────────────────
  const staff1Id = uuidv4();  // counselor
  const staff2Id = uuidv4();  // mentor
  const staff3Id = uuidv4();  // principal staff

  db.run(`INSERT INTO staff VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    staff3Id, '王校长', 'principal', '[]', '[]', 0, 'principal@school.edu', '13800000001', now, now
  ]);
  db.run(`INSERT INTO staff VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    staff1Id, '李老师', 'counselor', '["数学","物理"]', '["Edexcel","CIE"]', 25, 'li@school.edu', '13800000002', now, now
  ]);
  db.run(`INSERT INTO staff VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    staff2Id, '张导师', 'mentor', '["化学","生物"]', '["CIE"]', 20, 'zhang@school.edu', '13800000003', now, now
  ]);

  // ── 用户账户 ────────────────────────────────────────
  db.run(`INSERT INTO users VALUES (?,?,?,?,?,?,?)`, [
    principalId, 'principal', hash('123456'), 'principal', staff3Id, '王校长', now
  ]);
  db.run(`INSERT INTO users VALUES (?,?,?,?,?,?,?)`, [
    counselorId, 'counselor', hash('123456'), 'counselor', staff1Id, '李老师', now
  ]);
  db.run(`INSERT INTO users VALUES (?,?,?,?,?,?,?)`, [
    mentorId, 'mentor', hash('123456'), 'mentor', staff2Id, '张导师', now
  ]);

  // ── 学生 ────────────────────────────────────────────
  const stu1 = uuidv4();
  const stu2 = uuidv4();
  const stu3 = uuidv4();

  db.run(`INSERT INTO students (id,name,grade_level,enrol_date,exam_board,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, [
    stu1, '张三', 'G12', '2024-09-01', 'Edexcel', 'active', '', now, now
  ]);
  db.run(`INSERT INTO students (id,name,grade_level,enrol_date,exam_board,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, [
    stu2, '李四', 'G11', '2024-09-01', 'CIE', 'active', '', now, now
  ]);
  db.run(`INSERT INTO students (id,name,grade_level,enrol_date,exam_board,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, [
    stu3, '王五', 'G12', '2023-09-01', 'A-Level', 'active', '', now, now
  ]);

  // 学生用户
  db.run(`INSERT INTO users VALUES (?,?,?,?,?,?,?)`, [
    student1UserId, 'student1', hash('123456'), 'student', stu1, '张三', now
  ]);

  // 入学评估
  db.run(`INSERT INTO admission_assessments VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu1, '2024-09-05', '数学测评', '数学', 82.5, 100, 75, '', now
  ]);
  db.run(`INSERT INTO admission_assessments VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu1, '2024-09-05', '英语测评', '英语', 78.0, 100, 65, '', now
  ]);
  db.run(`INSERT INTO admission_assessments VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu2, '2024-09-06', '数学测评', '数学', 91.0, 100, 88, '', now
  ]);
  db.run(`INSERT INTO admission_assessments VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu3, '2023-09-08', '综合测评', '综合', 75.5, 100, 60, '', now
  ]);

  // 家长
  const par1 = uuidv4();
  db.run(`INSERT INTO parent_guardians VALUES (?,?,?,?,?,?,?)`, [
    par1, '张父', '父', '13900000010', 'zhangfu@email.com', 'zhangfu_wx', now
  ]);
  db.run(`INSERT INTO student_parents VALUES (?,?)`, [stu1, par1]);
  db.run(`INSERT INTO users VALUES (?,?,?,?,?,?,?)`, [
    parent1UserId, 'parent1', hash('123456'), 'parent', par1, '张父', now
  ]);

  // 导师分配
  db.run(`INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu1, staff1Id, '升学规划师', '2024-09-10', null, '', now
  ]);
  db.run(`INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu1, staff2Id, '导师', '2024-09-10', null, '', now
  ]);
  db.run(`INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu2, staff1Id, '升学规划师', '2024-09-10', null, '', now
  ]);
  db.run(`INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu3, staff2Id, '导师', '2023-09-12', null, '', now
  ]);

  // 科目
  const subjects = [
    ['MATH', '数学 Mathematics', '理科'],
    ['PHYS', '物理 Physics', '理科'],
    ['CHEM', '化学 Chemistry', '理科'],
    ['BIO', '生物 Biology', '理科'],
    ['ECON', '经济 Economics', '文科'],
    ['CS', '计算机 Computer Science', '理科'],
    ['ENG', '英语文学 English Literature', '文科'],
    ['HIST', '历史 History', '文科'],
  ];
  for (const [code, name, cat] of subjects) {
    db.run(`INSERT OR IGNORE INTO subjects VALUES (?,?,?,?)`, [uuidv4(), code, name, cat]);
  }

  // 选科
  const getSubjectId = (code) => get('SELECT id FROM subjects WHERE code=?', [code]);
  const mathId = getSubjectId('MATH')?.id;
  const physId = getSubjectId('PHYS')?.id;
  const chemId = getSubjectId('CHEM')?.id;

  if (mathId) db.run(`INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)`, [uuidv4(), stu1, mathId, 'A2', 'Edexcel', now]);
  if (physId) db.run(`INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)`, [uuidv4(), stu1, physId, 'A2', 'Edexcel', now]);
  if (chemId) db.run(`INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)`, [uuidv4(), stu1, chemId, 'A2', 'Edexcel', now]);

  // 目标院校
  const uni1 = uuidv4(); const uni2 = uuidv4(); const uni3 = uuidv4();
  db.run(`INSERT INTO universities VALUES (?,?,?,?)`, [uni1, '帝国理工学院 Imperial College London', 'UK', '']);
  db.run(`INSERT INTO universities VALUES (?,?,?,?)`, [uni2, '曼彻斯特大学 University of Manchester', 'UK', '']);
  db.run(`INSERT INTO universities VALUES (?,?,?,?)`, [uni3, '莱斯特大学 University of Leicester', 'UK', '']);

  // 目标院校清单
  db.run(`INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu1, uni1, '帝国理工学院', '冲刺', 1, '化学工程', '成绩优秀，学科匹配', now
  ]);
  db.run(`INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu1, uni2, '曼彻斯特大学', '意向', 2, '化学工程', '稳妥选择', now
  ]);
  db.run(`INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu1, uni3, '莱斯特大学', '保底', 3, '化学', '保底院校', now
  ]);

  // 申请
  const app1 = uuidv4();
  db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    app1, stu1, uni1, '帝国理工学院', '化学工程', '冲刺', 2026, 'UK-UG',
    '2025-10-15', null, 'Predicted', '[]',
    null, 'Pending', null, 0, 0, null, 'pending', '', now, now
  ]);

  // 里程碑任务
  const tasks = [
    [uuidv4(), stu1, app1, '完成个人陈述第一问草稿', '为什么选择化学工程', '材料', '2025-06-30', null, 'pending', 'high', staff1Id, now, now],
    [uuidv4(), stu1, app1, '获取数学推荐信', '联系数学老师撰写推荐信', '材料', '2025-08-15', null, 'pending', 'high', staff1Id, now, now],
    [uuidv4(), stu1, app1, '完成UCAS网申注册', 'UCAS账号注册与信息填写', '申请', '2025-09-01', null, 'pending', 'normal', staff1Id, now, now],
    [uuidv4(), stu1, app1, '提交申请至帝国理工', '在截止日前提交', '申请', '2025-10-15', null, 'pending', 'high', staff1Id, now, now],
    [uuidv4(), stu1, null, '五月大考 - 数学', 'Edexcel 数学A2大考', '考试', '2025-05-15', null, 'done', 'high', staff2Id, now, now],
  ];
  for (const t of tasks) {
    db.run(`INSERT INTO milestone_tasks (id,student_id,application_id,title,description,category,due_date,completed_at,status,priority,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, t);
  }

  // 材料清单
  db.run(`INSERT INTO material_items (id,student_id,application_id,material_type,title,status,version,file_path,notes,reviewed_by,reviewed_at,submitted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu1, app1, '个人陈述', '帝国理工个人陈述', '草稿', 2, null, '第一问已完成草稿', staff1Id, null, null, now, now
  ]);
  db.run(`INSERT INTO material_items (id,student_id,application_id,material_type,title,status,version,file_path,notes,reviewed_by,reviewed_at,submitted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu1, app1, '推荐信', '数学老师推荐信', '未开始', 1, null, '', null, null, null, now, now
  ]);
  db.run(`INSERT INTO material_items (id,student_id,application_id,material_type,title,status,version,file_path,notes,reviewed_by,reviewed_at,submitted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu1, app1, '成绩单', 'Edexcel AS成绩单', '已上传', 1, null, '', staff1Id, now, null, now, now
  ]);

  // 沟通记录
  db.run(`INSERT INTO communication_logs VALUES (?,?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu1, staff1Id, par1, '微信', '与家长沟通帝国理工申请进度，家长表示支持，确认10月前完成申请材料', '家长配合准备活动证明材料', now, now
  ]);

  // 反馈
  db.run(`INSERT INTO feedback VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [
    uuidv4(), stu1, 'parent', par1, '阶段反馈', '孩子最近申请压力较大，希望规划师能多给一些心理支持和时间规划建议', 4, 'pending', null, null, null, now
  ]);

  // ── 系统内置时间线模板 ─────────────────────────────────
  const insertTpl = (id, name, desc, route, tier, items, deadlineTime, deadlineTz) => {
    db.run(`INSERT INTO timeline_templates (id,name,description,route,tier,is_system,created_by,created_at,deadline_time,deadline_timezone) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, name, desc, route, tier, 1, null, now, deadlineTime||null, deadlineTz||null]);
    items.forEach((item, idx) => {
      db.run(`INSERT INTO template_items (id,template_id,title,description,category,days_before_deadline,priority,sort_order) VALUES (?,?,?,?,?,?,?,?)`,
        [uuidv4(), id, item.title, item.desc||'', item.cat, item.days, item.pri||'normal', idx]);
    });
  };

  const existingTpl = get('SELECT COUNT(*) as cnt FROM timeline_templates');
  if (!existingTpl || existingTpl.cnt === 0) {
    insertTpl(uuidv4(), '英国本科·冲刺（牛剑/医学 10/15截止）', '适用于牛剑及医学等10月15日截止的冲刺院校', 'UK-UG', '冲刺', [
      { title: '目标院校确认与选科复核',           cat:'申请', days:120, pri:'high' },
      { title: '个人陈述第一问草稿（学科动机）',   cat:'材料', days:105, pri:'high' },
      { title: '个人陈述第二问草稿（学业准备）',   cat:'材料', days: 90, pri:'high' },
      { title: '个人陈述第三问草稿（课外准备）',   cat:'材料', days: 80, pri:'high' },
      { title: '推荐信推荐人确认',                 cat:'材料', days: 90, pri:'high' },
      { title: 'UCAS账号注册',                    cat:'申请', days: 75, pri:'normal' },
      { title: '个人陈述一审完成',                 cat:'材料', days: 55, pri:'high' },
      { title: '个人陈述定稿',                     cat:'材料', days: 25, pri:'high' },
      { title: '提交UCAS申请',                    cat:'申请', days:  0, pri:'high' },
      { title: '面试准备（如有要求）',              cat:'面试', days:-30, pri:'normal' },
      { title: '等待Offer结果',                   cat:'申请', days:-75, pri:'normal' },
    ], '18:00', 'Europe/London');

    insertTpl(uuidv4(), '英国本科·意向（1月中旬截止）', '适用于大多数英国本科专业，同等考虑截止日为次年1月中旬', 'UK-UG', '意向', [
      { title: '目标院校清单最终确认',             cat:'申请', days:165, pri:'high' },
      { title: '个人陈述三问全部完成草稿',         cat:'材料', days: 90, pri:'high' },
      { title: '推荐信收集',                       cat:'材料', days: 70, pri:'high' },
      { title: '成绩单准备与核对',                 cat:'材料', days: 55, pri:'normal' },
      { title: '个人陈述定稿',                     cat:'材料', days: 25, pri:'high' },
      { title: '提交UCAS申请',                    cat:'申请', days:  0, pri:'high' },
      { title: '等待并跟进Offer状态',              cat:'申请', days:-75, pri:'normal' },
      { title: '确认Firm/Insurance选择',           cat:'申请', days:-120, pri:'high' },
    ], '18:00', 'Europe/London');

    insertTpl(uuidv4(), '英国本科·保底（含Clearing补录）', '适用于条件相对宽松的保底院校，覆盖主流程及Clearing阶段', 'UK-UG', '保底', [
      { title: '备选院校清单确认',                 cat:'申请', days:105, pri:'normal' },
      { title: '材料准备（成绩单、推荐信）',       cat:'材料', days: 50, pri:'normal' },
      { title: '个人陈述草稿',                     cat:'材料', days: 35, pri:'normal' },
      { title: '提交UCAS申请',                    cat:'申请', days:  0, pri:'high' },
      { title: '关注Clearing补录开放',             cat:'申请', days:-195, pri:'normal' },
    ], '18:00', 'Europe/London');

    insertTpl(uuidv4(), '美国本科·Early Decision (11月初)', '适用于美国本科ED申请，截止日通常为11月1日或11月15日', 'US', '冲刺', [
      { title: '选校清单确认（ED/EA/RD分层）',     cat:'申请', days:120, pri:'high' },
      { title: 'Common App注册与基础信息填写',     cat:'申请', days: 90, pri:'normal' },
      { title: 'Essay主文章初稿',                  cat:'材料', days: 75, pri:'high' },
      { title: '推荐信确认（辅导员+2名老师）',     cat:'材料', days: 75, pri:'high' },
      { title: 'SAT/ACT成绩确认送分',              cat:'考试', days: 60, pri:'high' },
      { title: 'Supplement Essays初稿',            cat:'材料', days: 45, pri:'high' },
      { title: 'Essay定稿并提交',                  cat:'申请', days:  0, pri:'high' },
      { title: '等待ED决定（通常12月中旬）',        cat:'申请', days:-45, pri:'normal' },
    ], '23:59', 'America/New_York');
  }

  // ── 新加坡高校模板（按需追加，不受上方零值检测限制）─────
  const existingSG = get("SELECT COUNT(*) as cnt FROM timeline_templates WHERE route='SG'");
  if (!existingSG || existingSG.cnt === 0) {
    // NUS — 国立大学（截止日通常为次年2月底）
    insertTpl(uuidv4(), '新加坡国立大学 NUS', '新加坡国立大学本科直接申请，国际生截止日一般为次年2月底。涵盖从选专业到面试的完整流程。', 'SG', '冲刺', [
      { title: '研究NUS专业设置与录取要求',                cat:'申请', days:270, pri:'high'   },
      { title: '确认申请学院与专业（可选3个志愿）',        cat:'申请', days:240, pri:'high'   },
      { title: '注册NUS网申账号（admissions.nus.edu.sg）', cat:'申请', days:180, pri:'normal' },
      { title: '准备官方成绩单及A-Level/IB认证件',        cat:'材料', days:150, pri:'high'   },
      { title: '个人陈述/动机信初稿（Why NUS/Why Course）',cat:'材料', days:120, pri:'high'   },
      { title: '确认推荐人（2封，学术推荐为主）',          cat:'材料', days:120, pri:'high'   },
      { title: '雅思/托福成绩送分至NUS',                  cat:'考试', days: 90, pri:'high'   },
      { title: 'SAT/A-Level成绩核对并录入申请表',          cat:'考试', days: 75, pri:'high'   },
      { title: '个人陈述终稿（字数与格式核对）',           cat:'材料', days: 60, pri:'high'   },
      { title: '推荐信追踪确认（确认导师已提交）',         cat:'材料', days: 45, pri:'high'   },
      { title: 'NUS Scholarship奖学金申请（如适用）',      cat:'申请', days: 30, pri:'normal' },
      { title: '申请表全项复核（所有附件上传完整）',       cat:'申请', days: 10, pri:'high'   },
      { title: '提交NUS网申',                             cat:'申请', days:  0, pri:'high'   },
      { title: '关注邮件：核实收到申请确认信',             cat:'沟通', days: -7, pri:'normal' },
      { title: '面试邀请跟进（部分专业含面试）',           cat:'面试', days:-30, pri:'normal' },
      { title: '等待录取结果（一般3-4月公布）',            cat:'申请', days:-60, pri:'normal' },
    ], '23:59', 'Asia/Singapore');

    // NTU — 南洋理工大学（截止日通常为次年2月底）
    insertTpl(uuidv4(), '新加坡南洋理工大学 NTU', '南洋理工大学本科申请，国际生截止日一般为次年2月底。工程/商科/理科/艺术路径均适用。', 'SG', '冲刺', [
      { title: '了解NTU专业分布（工程/商业/理科/人文）',   cat:'申请', days:270, pri:'high'   },
      { title: '研究NTU双联学位及荣誉学位项目',           cat:'申请', days:240, pri:'normal' },
      { title: '确认申请专业优先级（最多3个）',            cat:'申请', days:210, pri:'high'   },
      { title: '注册NTU网申账号（admissions.ntu.edu.sg）', cat:'申请', days:180, pri:'normal' },
      { title: '准备在读成绩单与课程表（中英对照）',       cat:'材料', days:150, pri:'normal' },
      { title: '个人陈述初稿（Why NTU/专业动机）',        cat:'材料', days:120, pri:'high'   },
      { title: '推荐人确认（2封，学科老师优先）',          cat:'材料', days:120, pri:'high'   },
      { title: '语言成绩送分（雅思/托福）',               cat:'考试', days: 90, pri:'high'   },
      { title: 'A-Level/SAT/IB成绩核对',                 cat:'考试', days: 75, pri:'high'   },
      { title: '个人陈述终稿',                            cat:'材料', days: 60, pri:'high'   },
      { title: '推荐信提交追踪',                          cat:'材料', days: 45, pri:'normal' },
      { title: '申请表全项填写并附件上传',                 cat:'申请', days: 14, pri:'high'   },
      { title: '提交NTU网申',                             cat:'申请', days:  0, pri:'high'   },
      { title: '确认申请受理邮件',                        cat:'沟通', days: -7, pri:'normal' },
      { title: '面试通知跟进（部分专业有面试）',           cat:'面试', days:-30, pri:'normal' },
      { title: '等待录取结果（一般3-4月公布）',            cat:'申请', days:-60, pri:'normal' },
    ], '23:59', 'Asia/Singapore');

    // SUTD — 科技设计大学（截止日通常为3月中旬）
    insertTpl(uuidv4(), '新加坡科技设计大学 SUTD', 'SUTD本科申请，截止日通常为3月中旬。设计/建筑方向需提交作品集，与MIT/浙大联合培养特色显著。', 'SG', '意向', [
      { title: '了解SUTD四大支柱课程：ASD/ESD/EPD/ISTD',  cat:'申请', days:270, pri:'high'   },
      { title: '确认申请方向（设计/工程/信息系统）',       cat:'申请', days:240, pri:'high'   },
      { title: '研究MIT/浙大联合培养项目申请条件',         cat:'申请', days:210, pri:'normal' },
      { title: '注册SUTD网申账号',                        cat:'申请', days:150, pri:'normal' },
      { title: '作品集选题策划（设计/建筑方向必须）',      cat:'材料', days:150, pri:'high'   },
      { title: '作品集初稿完成（8-15页，含项目说明）',     cat:'材料', days:120, pri:'high'   },
      { title: '个人陈述初稿（创新力/设计思维/学科动机）', cat:'材料', days:105, pri:'high'   },
      { title: '推荐信申请（1-2封，可含业界导师）',        cat:'材料', days: 90, pri:'high'   },
      { title: '语言成绩送分（雅思/托福）',               cat:'考试', days: 75, pri:'high'   },
      { title: '作品集终稿（格式/分辨率/文件大小核对）',   cat:'材料', days: 60, pri:'high'   },
      { title: '个人陈述终稿',                            cat:'材料', days: 45, pri:'high'   },
      { title: '申请表填写完整并上传所有附件',             cat:'申请', days: 10, pri:'high'   },
      { title: '提交SUTD网申',                            cat:'申请', days:  0, pri:'high'   },
      { title: '准备Design Challenge测试（如有）',         cat:'面试', days:-14, pri:'normal' },
      { title: '面试/Portfolio Review跟进',               cat:'面试', days:-30, pri:'normal' },
      { title: '等待录取结果（一般4-5月公布）',            cat:'申请', days:-60, pri:'normal' },
    ], '23:59', 'Asia/Singapore');

    // SMU — 管理大学（截止日通常为3月底）
    insertTpl(uuidv4(), '新加坡管理大学 SMU', 'SMU本科申请，截止日通常为3月底。商科/法律/社科为主，面试权重高，注重领导力与课外活动经历。', 'SG', '意向', [
      { title: '研究SMU六大学院：商/会计/法律/经济/社科/IT', cat:'申请', days:270, pri:'high'   },
      { title: '确认申请学院与项目（最多2个）',             cat:'申请', days:240, pri:'high'   },
      { title: '了解SMU小班互动教学与演讲文化',            cat:'申请', days:210, pri:'normal' },
      { title: '注册SMU网申账号（admissions.smu.edu.sg）',  cat:'申请', days:150, pri:'normal' },
      { title: '整理课外活动记录（领导力/社区/竞赛）',     cat:'材料', days:120, pri:'normal' },
      { title: '个人动机信初稿（Why SMU/Why Course/Career）',cat:'材料', days:105, pri:'high'   },
      { title: '推荐信申请（2封，学术+业界各1封最佳）',    cat:'材料', days:105, pri:'high'   },
      { title: '语言成绩送分（雅思/托福）',               cat:'考试', days: 90, pri:'high'   },
      { title: '课外活动证明材料整理上传',                 cat:'材料', days: 75, pri:'normal' },
      { title: '个人动机信终稿',                          cat:'材料', days: 60, pri:'high'   },
      { title: '申请表全项填写（成绩/活动/Essay）',        cat:'申请', days: 30, pri:'high'   },
      { title: '提交SMU网申',                             cat:'申请', days:  0, pri:'high'   },
      { title: '面试准备：商业时事、Case讨论、自我介绍',   cat:'面试', days:-14, pri:'high'   },
      { title: '参加SMU招生面试（Admissions Interview）',  cat:'面试', days:-30, pri:'high'   },
      { title: '面试后发送感谢邮件（可选但加分）',         cat:'沟通', days:-31, pri:'low'    },
      { title: '等待录取结果（一般4-5月公布）',            cat:'申请', days:-60, pri:'normal' },
    ], '23:59', 'Asia/Singapore');
  }
  // ── 演示学生监护人同意记录（AI 规划必需，幂等） ──
  {
    const demoNames = ['方骏达','叶思琪','孙浩宇','苏雨薇','陈建国'];
    const guardianMap = { '方骏达':'方建平', '叶思琪':'叶明远', '孙浩宇':'孙国强', '苏雨薇':'苏志远', '陈建国':'陈德荣' };
    const cnow = new Date().toISOString();
    for (const name of demoNames) {
      const stu = get('SELECT id FROM students WHERE name=? LIMIT 1', [name]);
      if (!stu) continue;
      const existing = get('SELECT id FROM guardian_consents WHERE student_id=? AND consented=1 AND (revoke_date IS NULL OR revoke_date=\'\')', [stu.id]);
      if (existing) continue;
      db.run(`INSERT INTO guardian_consents
        (id,student_id,guardian_name,relation,consent_version,consent_scope,consented,consent_date,recorded_by,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [uid(), stu.id, guardianMap[name]||'家长', '父亲', '1.0',
         JSON.stringify(['data_storage','counseling','ai_processing']),
         1, '2025-09-01', 'system', cnow]);
    }
  }

  // ── 种子基准评估数据 ───────────────────────────────────
  const existingBM = get('SELECT COUNT(*) as cnt FROM eval_benchmarks');
  if (!existingBM || existingBM.cnt === 0) {
    const bms = [
      // UK × CS
      { country:'UK', tier:'冲刺', subject_area:'CS', display_name:'英国冲刺-计算机',
        grade_requirements:[{subject:'Mathematics',min_grade:'A*',required:true,notes:'必须A*'},{subject:'Further Mathematics',min_grade:'A',required:true,notes:'强烈推荐'},{subject:'Physics',min_grade:'A',required:false,notes:'物理A优先'}],
        grade_type:'A-Level', ielts_overall:7.0, benchmark_pass_rate:0.08, weight_academic:0.65, weight_language:0.20, weight_extra:0.15,
        notes:'英国顶尖大学CS专业（如Oxford/Cambridge/Imperial）参考标准' },
      { country:'UK', tier:'意向', subject_area:'CS', display_name:'英国意向-计算机',
        grade_requirements:[{subject:'Mathematics',min_grade:'A',required:true,notes:'数学A必须'},{subject:'Computer Science',min_grade:'B',required:false,notes:'CS B优先'},{subject:'Physics',min_grade:'B',required:false,notes:'物理B优先'}],
        grade_type:'A-Level', ielts_overall:6.5, benchmark_pass_rate:0.22, weight_academic:0.60, weight_language:0.25, weight_extra:0.15,
        notes:'英国中等院校CS（如Bristol/Leeds/Warwick CS）参考标准' },
      { country:'UK', tier:'保底', subject_area:'CS', display_name:'英国保底-计算机',
        grade_requirements:[{subject:'Mathematics',min_grade:'B',required:true,notes:'数学B最低要求'}],
        grade_type:'A-Level', ielts_overall:6.5, benchmark_pass_rate:0.55, weight_academic:0.60, weight_language:0.25, weight_extra:0.15,
        notes:'英国保底院校CS（如覆盖率较高的大学）参考标准' },
      // UK × Business
      { country:'UK', tier:'冲刺', subject_area:'Business', display_name:'英国冲刺-商科',
        grade_requirements:[{subject:'Mathematics',min_grade:'A',required:true,notes:'数学A必须'},{subject:'Economics',min_grade:'A',required:false,notes:'经济A加分'}],
        grade_type:'A-Level', ielts_overall:7.0, benchmark_pass_rate:0.12, weight_academic:0.60, weight_language:0.25, weight_extra:0.15,
        notes:'英国顶尖商科（如LSE/Warwick/UCL Economics）参考标准' },
      { country:'UK', tier:'意向', subject_area:'Business', display_name:'英国意向-商科',
        grade_requirements:[{subject:'Mathematics',min_grade:'B',required:true,notes:'数学B必须'},{subject:'Economics',min_grade:'B',required:false,notes:'经济B优先'}],
        grade_type:'A-Level', ielts_overall:6.5, benchmark_pass_rate:0.30, weight_academic:0.60, weight_language:0.25, weight_extra:0.15,
        notes:'英国中等商科（如Exeter/Bath/Birmingham商科）参考标准' },
      { country:'UK', tier:'保底', subject_area:'Business', display_name:'英国保底-商科',
        grade_requirements:[{subject:'Mathematics',min_grade:'C',required:true,notes:'数学C最低要求'}],
        grade_type:'A-Level', ielts_overall:6.0, benchmark_pass_rate:0.60, weight_academic:0.55, weight_language:0.30, weight_extra:0.15,
        notes:'英国保底商科院校参考标准' },
      // UK × Mathematics
      { country:'UK', tier:'冲刺', subject_area:'Mathematics', display_name:'英国冲刺-数学',
        grade_requirements:[{subject:'Mathematics',min_grade:'A*',required:true,notes:'数学A*必须'},{subject:'Further Mathematics',min_grade:'A*',required:true,notes:'进一步数学A*必须'}],
        grade_type:'A-Level', ielts_overall:7.0, benchmark_pass_rate:0.10, weight_academic:0.70, weight_language:0.15, weight_extra:0.15,
        notes:'英国顶尖数学（Oxford/Cambridge/Imperial Mathematics）参考标准' },
      { country:'UK', tier:'意向', subject_area:'Mathematics', display_name:'英国意向-数学',
        grade_requirements:[{subject:'Mathematics',min_grade:'A',required:true,notes:'数学A必须'},{subject:'Further Mathematics',min_grade:'A',required:false,notes:'进一步数学A优先'}],
        grade_type:'A-Level', ielts_overall:6.5, benchmark_pass_rate:0.25, weight_academic:0.65, weight_language:0.20, weight_extra:0.15,
        notes:'英国中等数学专业参考标准' },
      // UK × Engineering
      { country:'UK', tier:'冲刺', subject_area:'Engineering', display_name:'英国冲刺-工程',
        grade_requirements:[{subject:'Mathematics',min_grade:'A*',required:true,notes:'数学A*必须'},{subject:'Physics',min_grade:'A',required:true,notes:'物理A必须'},{subject:'Further Mathematics',min_grade:'A',required:false,notes:'进一步数学A加分'}],
        grade_type:'A-Level', ielts_overall:7.0, benchmark_pass_rate:0.12, weight_academic:0.65, weight_language:0.20, weight_extra:0.15,
        notes:'英国顶尖工程（Oxford/Cambridge/Imperial Engineering）参考标准' },
      { country:'UK', tier:'意向', subject_area:'Engineering', display_name:'英国意向-工程',
        grade_requirements:[{subject:'Mathematics',min_grade:'A',required:true,notes:'数学A必须'},{subject:'Physics',min_grade:'B',required:true,notes:'物理B必须'}],
        grade_type:'A-Level', ielts_overall:6.5, benchmark_pass_rate:0.28, weight_academic:0.60, weight_language:0.25, weight_extra:0.15,
        notes:'英国中等工程院校参考标准' },
      { country:'UK', tier:'保底', subject_area:'Engineering', display_name:'英国保底-工程',
        grade_requirements:[{subject:'Mathematics',min_grade:'B',required:true,notes:'数学B必须'},{subject:'Physics',min_grade:'C',required:false,notes:'物理C优先'}],
        grade_type:'A-Level', ielts_overall:6.0, benchmark_pass_rate:0.55, weight_academic:0.60, weight_language:0.25, weight_extra:0.15,
        notes:'英国保底工程院校参考标准' },
      // UK × Medicine
      { country:'UK', tier:'冲刺', subject_area:'Medicine', display_name:'英国冲刺-医学',
        grade_requirements:[{subject:'Chemistry',min_grade:'A',required:true,notes:'化学A必须'},{subject:'Biology',min_grade:'A',required:true,notes:'生物A必须'},{subject:'Mathematics',min_grade:'B',required:false,notes:'数学B加分'}],
        extra_tests:[{test:'UCAT',required:true,min_score:2700,notes:'UCAT联合招生测试最低2700'}],
        grade_type:'A-Level', ielts_overall:7.0, benchmark_pass_rate:0.06, weight_academic:0.50, weight_language:0.15, weight_extra:0.35,
        notes:'英国医学院（竞争极激烈）参考标准' },
      // SG × CS
      { country:'SG', tier:'冲刺', subject_area:'CS', display_name:'新加坡冲刺-计算机',
        grade_requirements:[{subject:'Mathematics',min_grade:'A',required:true,notes:'数学A必须'},{subject:'Physics',min_grade:'B',required:false,notes:'物理B优先'},{subject:'Computer Science',min_grade:'B',required:false,notes:'CS B加分'}],
        grade_type:'A-Level', ielts_overall:6.5, benchmark_pass_rate:0.15, weight_academic:0.60, weight_language:0.25, weight_extra:0.15,
        notes:'新加坡顶尖大学CS（NUS/NTU）参考标准' },
      { country:'SG', tier:'意向', subject_area:'CS', display_name:'新加坡意向-计算机',
        grade_requirements:[{subject:'Mathematics',min_grade:'B',required:true,notes:'数学B必须'}],
        grade_type:'A-Level', ielts_overall:6.0, benchmark_pass_rate:0.30, weight_academic:0.60, weight_language:0.25, weight_extra:0.15,
        notes:'新加坡中等院校CS参考标准' },
      // SG × Business
      { country:'SG', tier:'冲刺', subject_area:'Business', display_name:'新加坡冲刺-商科',
        grade_requirements:[{subject:'Mathematics',min_grade:'B',required:true,notes:'数学B必须'},{subject:'Economics',min_grade:'C',required:false,notes:'经济C加分'}],
        grade_type:'A-Level', ielts_overall:6.5, benchmark_pass_rate:0.18, weight_academic:0.55, weight_language:0.30, weight_extra:0.15,
        notes:'NUS/NTU Business参考标准' },
      { country:'SG', tier:'意向', subject_area:'Business', display_name:'新加坡意向-商科',
        grade_requirements:[{subject:'Mathematics',min_grade:'C',required:true,notes:'数学C最低要求'}],
        grade_type:'A-Level', ielts_overall:6.0, benchmark_pass_rate:0.38, weight_academic:0.55, weight_language:0.30, weight_extra:0.15,
        notes:'新加坡中等商科院校参考标准' },
      // HK
      { country:'HK', tier:'冲刺', subject_area:'CS', display_name:'香港冲刺-计算机',
        grade_requirements:[{subject:'Mathematics',min_grade:'A',required:true,notes:'数学A必须'},{subject:'Physics',min_grade:'B',required:false,notes:'物理B加分'},{subject:'Computer Science',min_grade:'B',required:false,notes:'CS B加分'}],
        grade_type:'A-Level', ielts_overall:6.5, benchmark_pass_rate:0.18, weight_academic:0.60, weight_language:0.25, weight_extra:0.15,
        notes:'香港顶尖大学CS（HKUST/HKU）参考标准' },
      { country:'HK', tier:'冲刺', subject_area:'Business', display_name:'香港冲刺-商科',
        grade_requirements:[{subject:'Mathematics',min_grade:'A',required:true,notes:'数学A必须'},{subject:'Economics',min_grade:'B',required:false,notes:'经济B加分'}],
        grade_type:'A-Level', ielts_overall:6.5, benchmark_pass_rate:0.15, weight_academic:0.55, weight_language:0.30, weight_extra:0.15,
        notes:'香港顶尖商科（HKUST/HKU/CUHK Business）参考标准' },
      { country:'HK', tier:'意向', subject_area:'Business', display_name:'香港意向-商科',
        grade_requirements:[{subject:'Mathematics',min_grade:'B',required:true,notes:'数学B必须'}],
        grade_type:'A-Level', ielts_overall:6.0, benchmark_pass_rate:0.35, weight_academic:0.55, weight_language:0.30, weight_extra:0.15,
        notes:'香港中等商科院校参考标准' },
      // AU
      { country:'AU', tier:'意向', subject_area:'CS', display_name:'澳大利亚意向-计算机',
        grade_requirements:[{subject:'Mathematics',min_grade:'B',required:true,notes:'数学B必须'},{subject:'Computer Science',min_grade:'C',required:false,notes:'CS C加分'}],
        grade_type:'A-Level', ielts_overall:6.5, benchmark_pass_rate:0.45, weight_academic:0.60, weight_language:0.25, weight_extra:0.15,
        notes:'澳大利亚主要大学CS（Melbourne/Sydney/ANU）参考标准' },
      { country:'AU', tier:'意向', subject_area:'Business', display_name:'澳大利亚意向-商科',
        grade_requirements:[{subject:'Mathematics',min_grade:'C',required:true,notes:'数学C最低要求'}],
        grade_type:'A-Level', ielts_overall:6.5, benchmark_pass_rate:0.50, weight_academic:0.55, weight_language:0.30, weight_extra:0.15,
        notes:'澳大利亚主要大学商科参考标准' },
      // CA
      { country:'CA', tier:'意向', subject_area:'Engineering', display_name:'加拿大意向-工程',
        grade_requirements:[{subject:'Mathematics',min_grade:'A',required:true,notes:'数学A必须'},{subject:'Physics',min_grade:'B',required:true,notes:'物理B必须'}],
        grade_type:'A-Level', ielts_overall:6.5, benchmark_pass_rate:0.35, weight_academic:0.65, weight_language:0.20, weight_extra:0.15,
        notes:'加拿大主要大学工程（UofT/UBC/Waterloo）参考标准' },
    ];
    const cnow2 = new Date().toISOString();
    for (const bm of bms) {
      db.run(`INSERT INTO eval_benchmarks
        (id,country,tier,subject_area,display_name,grade_requirements,grade_type,ielts_overall,toefl_overall,extra_tests,weight_academic,weight_language,weight_extra,benchmark_pass_rate,notes,is_active,created_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'system',?,?)`,
        [uuidv4(), bm.country, bm.tier, bm.subject_area, bm.display_name,
         JSON.stringify(bm.grade_requirements||[]),
         bm.grade_type||'A-Level',
         bm.ielts_overall||null, bm.toefl_overall||null,
         JSON.stringify(bm.extra_tests||[]),
         bm.weight_academic||0.60, bm.weight_language||0.25, bm.weight_extra||0.15,
         bm.benchmark_pass_rate||null,
         bm.notes||null,
         cnow2, cnow2]);
    }
  }

  // 确保所有 seedData 写入的数据持久化到磁盘
  save();
}

module.exports = { init, run, get, all, save, seedData, transaction };
