/**
 * server.js — 学生升学与学业规划管理系统 后端
 * Node.js + Express + sql.js (SQLite)
 */
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const SQLiteSessionStore = require('./session-store');
const { sendMail } = require('./mailer');
const archiver = require('archiver');
const xlsx = require('xlsx');
const crypto = require('crypto');
let aiPlanner = null, aiEval = null;
try { aiPlanner = require('./ai-planner'); } catch(e) { console.warn('[警告] ai-planner 模块加载失败:', e.message); }
try { aiEval    = require('./ai-eval');    } catch(e) { console.warn('[警告] ai-eval 模块加载失败:',    e.message); }
let pdfGenerator = null;
try { pdfGenerator = require('./pdf-filler-bridge'); console.log('[PDF] 模板填充模式 (Python)'); } catch(e) {
  try { pdfGenerator = require('./pdf-generator'); console.log('[PDF] 从零生成模式 (JS fallback)'); } catch(e2) { console.warn('[警告] pdf 模块加载失败:', e.message, e2.message); }
}

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// cPanel Phusion Passenger 作为反向代理，信任一层代理才能正确识别 HTTPS 和客户端 IP
if (IS_PROD) app.set('trust proxy', 1);

// 登录限流（防暴力破解）：每个 IP 15 分钟内最多 10 次失败
const loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
// 密码修改限流：每个 userId 15 分钟内最多 5 次失败
const pwdChangeAttempts = new Map();
const PWD_CHANGE_MAX = 5;
// AI 接口限流：每个 userId 每小时最多 20 次调用
const aiCallAttempts = new Map();
const AI_CALL_MAX = 20;
const AI_CALL_WINDOW_MS = 60 * 60 * 1000;
// Agent workspace 限流：每个 token 每分钟最多 60 次请求
const agentCallAttempts = new Map();
const AGENT_CALL_MAX = 60;
const AGENT_CALL_WINDOW_MS = 60 * 1000;
// 定期清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [ip, r] of loginAttempts) { if (now > r.resetAt) loginAttempts.delete(ip); }
  for (const [k, r] of pwdChangeAttempts) { if (now > r.resetAt) pwdChangeAttempts.delete(k); }
  for (const [k, r] of aiCallAttempts) { if (now > r.resetAt) aiCallAttempts.delete(k); }
  for (const [k, r] of agentCallAttempts) { if (now > r.resetAt) agentCallAttempts.delete(k); }
}, 5 * 60 * 1000);

// ── 生产安全检查 ──────────────────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET || 'student-system-secret-2026';
if (!process.env.SESSION_SECRET && IS_PROD) {
  console.error('\x1b[31m[安全错误] 生产环境下 SESSION_SECRET 未配置，启动终止。请设置 SESSION_SECRET 环境变量。\x1b[0m');
  process.exit(1);
} else if (!process.env.SESSION_SECRET) {
  console.warn('\x1b[33m════════════════════════════════════════════════════════════\x1b[0m');
  console.warn('\x1b[33m[安全警告] SESSION_SECRET 未配置，当前使用内置默认密钥。\x1b[0m');
  console.warn('\x1b[33m          请在 .env 文件中设置随机长密钥后再部署到生产环境！\x1b[0m');
  console.warn('\x1b[33m════════════════════════════════════════════════════════════\x1b[0m');
}

// ── bcrypt 成本因子（≥10，生产建议12） ────────────────
const BCRYPT_COST = parseInt(process.env.BCRYPT_COST || '12');

// ── 上传目录（存储在 web root 之外） ──────────────────
// Railway/生产环境用 DATA_DIR 指向持久化卷，本地开发默认放项目目录
const DATA_DIR = process.env.DATA_DIR || __dirname;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const fileStorage = require('./file-storage');
fileStorage.initDirs();

// 上传后自动移动文件到分类子目录的辅助函数
function moveUploadedFile(fileId, category) {
  if (!fileId || !category) return;
  try { fileStorage.migrateFile(fileId, category); } catch(e) { console.error('[FILE MOVE]', e.message); }
}

// 允许上传的扩展名白名单
const ALLOWED_EXTENSIONS = new Set(['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.jpg','.jpeg','.png','.gif','.zip','.rar','.txt']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Fix Windows latin1→utf8 encoding for original filename
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`); // 随机文件名，不暴露原始名
  }
});

// MIME type 白名单（与扩展名白名单双重校验，防止扩展名伪造）
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg','image/png','image/gif',
  'application/zip','application/x-rar-compressed','application/x-zip-compressed',
  'text/plain','application/octet-stream', // octet-stream 作为兜底（部分浏览器对zip/rar上报此类型）
]);

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error(`不允许上传此类型文件（${ext}）。支持：PDF/Word/Excel/PPT/图片/ZIP`));
    }
    // 双重校验：MIME type 必须在白名单中
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`文件内容类型不合法（${file.mimetype}）`));
    }
    cb(null, true);
  }
});

// ── 安全响应头 ────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' cdn.jsdelivr.net; font-src 'self' cdn.jsdelivr.net; img-src 'self' data: blob:; connect-src 'self' cdn.jsdelivr.net");
  next();
});

// ── 中间件 ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
// 注意：/uploads 不再作为静态目录直接暴露，改由鉴权下载端点提供

const sessionStore = new SQLiteSessionStore();

app.use(session({
  store: sessionStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,  // 必须为 true，否则 regenerate() 后 Set-Cookie 不会发出
  rolling: true,  // 每次有请求就自动续期，只要还在活跃就不掉线
  name: 'ssid',
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8小时无操作才过期
    httpOnly: true,
    sameSite: 'lax',
    // 仅当 COOKIE_SECURE=true 时启用 HTTPS-only Cookie（Railway 生产环境设此变量）
    // 不再依赖 NODE_ENV，避免本地开发设 NODE_ENV=production 时 cookie 无法发送
    secure: process.env.COOKIE_SECURE === 'true',
  }
}));

// ── CSRF 防护：所有状态变更请求必须携带 application/json Content-Type ──
// 跨站表单提交（CSRF攻击）只能发送 application/x-www-form-urlencoded 或 multipart，
// 无法设置 application/json，因此此检查有效阻断跨站伪造请求。
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.path.startsWith('/api/')) {
    const ct = (req.headers['content-type'] || '').split(';')[0].trim();
    // 文件上传（multipart）和 JSON API 均合法；其他类型（form-urlencoded等）拒绝
    if (ct !== 'application/json' && ct !== 'multipart/form-data') {
      return res.status(403).json({ error: 'CSRF 校验失败：不支持此请求内容类型' });
    }
  }
  next();
});

// ── 鉴权中间件 ────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: '未登录' });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: '权限不足' });
    next();
  };
}

// ── 模块级权限中间件 ──────────────────────────────────────
// 代理市场模块：仅 principal 可管理，agent 只能访问自身数据
function requireAgentModule(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  const role = req.session.user.role;
  if (!['principal', 'agent'].includes(role))
    return res.status(403).json({ error: '无权访问代理模块' });
  next();
}

// 入学管理模块：intake_staff/student_admin/principal 可访问；counselor/mentor/agent/student/parent 不可访问
function requireAdmissionModule(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  const role = req.session.user.role;
  if (!['principal', 'intake_staff', 'student_admin'].includes(role))
    return res.status(403).json({ error: '无权访问入学管理模块' });
  next();
}

// 从对象中移除代理相关字段（用于非 principal 接口响应）
function stripAgentFields(obj) {
  if (!obj) return obj;
  const { agent_name, agent_id, referral_id, referral_type, source_type,
          agent_email, agent_phone, agent_status, commission_amount,
          pending_commission, paid_commission, rule_name, rule_type } = obj;
  void agent_name; void agent_id; void referral_id; void referral_type;
  void source_type; void agent_email; void agent_phone; void agent_status;
  void commission_amount; void pending_commission; void paid_commission;
  void rule_name; void rule_type;
  const safe = { ...obj };
  ['agent_name','agent_id','referral_id','referral_type','source_type',
   'agent_email','agent_phone','agent_status','commission_amount',
   'pending_commission','paid_commission','rule_name','rule_type'].forEach(k => delete safe[k]);
  return safe;
}

// 审计日志
function audit(req, action, entity, entityId, detail) {
  try {
    db.run(`INSERT INTO audit_logs (id,user_id,action,entity,entity_id,detail,ip) VALUES (?,?,?,?,?,?,?)`, [
      uuidv4(), req.session.user?.id, action, entity, entityId,
      typeof detail === 'object' ? JSON.stringify(detail) : detail,
      req.ip
    ]);
  } catch (e) { /* 不阻塞主流程 */ }
}

// ═══════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  // Rate limiting: check failed attempts for this IP
  const ip = req.ip;
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + LOGIN_WINDOW_MS; }
  if (record.count >= LOGIN_MAX_ATTEMPTS) {
    const wait = Math.ceil((record.resetAt - now) / 1000);
    return res.status(429).json({ error: `登录尝试过于频繁，请 ${wait} 秒后再试` });
  }
  const user = db.get('SELECT * FROM users WHERE username=?', [username]);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    record.count++;
    loginAttempts.set(ip, record);
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  // Reset failed attempts on success
  loginAttempts.delete(ip);
  // Regenerate session ID to prevent session fixation
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: '会话初始化失败' });
    req.session.user = { id: user.id, username: user.username, role: user.role, linked_id: user.linked_id, name: user.name };
    req.session.save((err2) => {
      if (err2) return res.status(500).json({ error: '会话保存失败' });
      audit(req, 'LOGIN', 'users', user.id, null);
      res.json({ user: req.session.user, must_change_password: user.must_change_password === 1 });
    });
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  res.json({ user: req.session.user });
});

// ═══════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════

app.get('/api/dashboard/stats', requireAuth, (req, res) => {
  const totalStudents = db.get('SELECT COUNT(*) as cnt FROM students WHERE status="active"').cnt;
  const totalApplications = db.get('SELECT COUNT(*) as cnt FROM applications').cnt;
  const pendingTasks = db.get('SELECT COUNT(*) as cnt FROM milestone_tasks WHERE status IN ("pending","in_progress")').cnt;
  const overdueTasks = db.get(`SELECT COUNT(*) as cnt FROM milestone_tasks WHERE status NOT IN ('done') AND due_date < date('now')`).cnt;
  const totalStaff = db.get('SELECT COUNT(*) as cnt FROM staff').cnt;
  const pendingMaterials = db.get(`SELECT COUNT(*) as cnt FROM material_items WHERE status IN ('未开始','收集中','草稿')`).cnt;

  // 按梯度统计
  const tierStats = db.all(`SELECT tier, COUNT(*) as cnt FROM target_uni_lists GROUP BY tier`);

  res.json({ totalStudents, totalApplications, pendingTasks, overdueTasks, totalStaff, pendingMaterials, tierStats });
});

app.get('/api/dashboard/risks', requireRole('principal','counselor'), (req, res) => {
  const risks = db.all(`
    SELECT s.id, s.name, s.grade_level, s.exam_board,
      COUNT(CASE WHEN mt.status NOT IN ('done') AND mt.due_date < date('now') THEN 1 END) as overdue_count
    FROM students s
    LEFT JOIN milestone_tasks mt ON mt.student_id = s.id
    WHERE s.status='active'
    GROUP BY s.id
    HAVING overdue_count > 0
    ORDER BY overdue_count DESC
    LIMIT 10
  `);
  res.json(risks);
});

app.get('/api/dashboard/workload', requireRole('principal','counselor'), (req, res) => {
  const workload = db.all(`
    SELECT st.id, st.name, st.role, st.capacity_students,
      COUNT(DISTINCT ma.student_id) as current_students
    FROM staff st
    LEFT JOIN mentor_assignments ma ON ma.staff_id = st.id AND ma.end_date IS NULL
    GROUP BY st.id
    ORDER BY current_students DESC
  `);
  res.json(workload);
});

// ═══════════════════════════════════════════════════════
//  STUDENTS
// ═══════════════════════════════════════════════════════

app.get('/api/students', requireAuth, (req, res) => {
  const { grade, exam_board, search } = req.query;
  let where = ['s.status="active"'];
  let params = [];

  // 学生只能看自己
  if (req.session.user.role === 'student') {
    where.push('s.id=?'); params.push(req.session.user.linked_id);
  }
  // 导师只看自己负责的学生
  if (req.session.user.role === 'mentor') {
    where.push('s.id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)');
    params.push(req.session.user.linked_id);
  }
  // 家长只看自己关联的学生
  if (req.session.user.role === 'parent') {
    where.push('s.id IN (SELECT student_id FROM student_parents WHERE parent_id=?)');
    params.push(req.session.user.linked_id);
  }
  if (grade) { where.push('s.grade_level=?'); params.push(grade); }
  if (exam_board) { where.push('s.exam_board=?'); params.push(exam_board); }
  if (search) { where.push('s.name LIKE ?'); params.push(`%${search}%`); }

  const isPrincipal = req.session.user.role === 'principal';
  // principal 才关联代理表，其他角色不返回任何代理字段
  const students = isPrincipal
    ? db.all(`
        SELECT s.*,
          (SELECT COUNT(*) FROM milestone_tasks mt WHERE mt.student_id=s.id AND mt.status NOT IN ('done') AND mt.due_date < date('now')) as overdue_count,
          (SELECT GROUP_CONCAT(st.name,', ') FROM mentor_assignments ma JOIN staff st ON st.id=ma.staff_id WHERE ma.student_id=s.id AND ma.end_date IS NULL) as mentors,
          (SELECT GROUP_CONCAT(tul.tier||':'||tul.uni_name, ' | ') FROM target_uni_lists tul WHERE tul.student_id=s.id LIMIT 3) as targets,
          a.name as agent_name, a.id as agent_id_ref, a.type as agent_type
        FROM students s
        LEFT JOIN agents a ON a.id=s.agent_id
        WHERE ${where.join(' AND ')}
        ORDER BY s.grade_level DESC, s.name
      `, params)
    : db.all(`
        SELECT s.id, s.name, s.grade_level, s.enrol_date, s.exam_board, s.status, s.notes,
          s.date_of_birth, s.created_at, s.updated_at,
          (SELECT COUNT(*) FROM milestone_tasks mt WHERE mt.student_id=s.id AND mt.status NOT IN ('done') AND mt.due_date < date('now')) as overdue_count,
          (SELECT GROUP_CONCAT(st.name,', ') FROM mentor_assignments ma JOIN staff st ON st.id=ma.staff_id WHERE ma.student_id=s.id AND ma.end_date IS NULL) as mentors,
          (SELECT GROUP_CONCAT(tul.tier||':'||tul.uni_name, ' | ') FROM target_uni_lists tul WHERE tul.student_id=s.id LIMIT 3) as targets
        FROM students s
        WHERE ${where.join(' AND ')}
        ORDER BY s.grade_level DESC, s.name
      `, params);

  res.json(students);
});

const VALID_GRADE_LEVELS = ['G9','G10','G11','G12','G13','Year 9','Year 10','Year 11','Year 12','Year 13','9','10','11','12','13','其他'];
app.post('/api/students', requireRole('principal','counselor'), (req, res) => {
  const { name, grade_level, enrol_date, exam_board, notes, date_of_birth, agent_id } = req.body;
  if (!name || !grade_level) return res.status(400).json({ error: '姓名和年级必填' });
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 200) return res.status(400).json({ error: '学生姓名格式不合法' });
  if (!VALID_GRADE_LEVELS.includes(grade_level)) return res.status(400).json({ error: `年级必须是以下之一: ${VALID_GRADE_LEVELS.join(', ')}` });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.run(`INSERT INTO students (id,name,grade_level,enrol_date,exam_board,status,notes,created_at,updated_at,date_of_birth,agent_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, name, grade_level, enrol_date, exam_board, 'active', notes||'', now, now, date_of_birth||null, agent_id||null]);
  audit(req, 'CREATE', 'students', id, { name });
  res.json({ id });
});

app.get('/api/students/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const student = db.get('SELECT * FROM students WHERE id=?', [id]);
  if (!student || student.status === 'deleted') return res.status(404).json({ error: '学生不存在' });

  // 权限检查
  const _u = req.session.user;
  if (_u.role === 'student' && _u.linked_id !== id) return res.status(403).json({ error: '无权访问' });
  if (_u.role === 'parent') {
    const sp = db.get('SELECT * FROM student_parents WHERE student_id=? AND parent_id=?', [id, _u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  if (_u.role === 'counselor' || _u.role === 'mentor') {
    const assigned = db.get(
      'SELECT 1 FROM mentor_assignments WHERE student_id=? AND staff_id=? AND end_date IS NULL',
      [id, _u.linked_id || _u.id]);
    if (!assigned) return res.status(403).json({ error: '无权访问' });
  }

  const assessments = db.all('SELECT * FROM admission_assessments WHERE student_id=? ORDER BY assess_date DESC', [id]);
  const subjects = db.all(`
    SELECT se.*, s.code, s.name as subject_name FROM subject_enrollments se
    JOIN subjects s ON s.id=se.subject_id WHERE se.student_id=?`, [id]);
  const targets = db.all('SELECT * FROM target_uni_lists WHERE student_id=? ORDER BY tier, priority_rank', [id]);
  const mentors = db.all(`
    SELECT ma.*, st.name as staff_name, st.role as staff_role FROM mentor_assignments ma
    JOIN staff st ON st.id=ma.staff_id WHERE ma.student_id=? AND ma.end_date IS NULL`, [id]);
  const applications = db.all('SELECT * FROM applications WHERE student_id=? ORDER BY created_at DESC', [id]);
  const parents = db.all(`
    SELECT pg.* FROM parent_guardians pg
    JOIN student_parents sp ON sp.parent_id=pg.id WHERE sp.student_id=?`, [id]);
  // 关联代理：优先走 intake_cases → referrals → agents 链路，fallback 读 student.agent_id
  let agentInfo = db.get(`
    SELECT a.id as agent_id, a.name as agent_name, a.type as agent_type,
      a.email as agent_email, a.phone as agent_phone,
      r.source_type, ic.program_name, ic.intake_year
    FROM intake_cases ic
    JOIN referrals r ON r.id=ic.referral_id
    JOIN agents a ON a.id=r.agent_id
    WHERE ic.student_id=? AND r.source_type='agent'
    ORDER BY ic.created_at DESC, ic.rowid DESC LIMIT 1
  `, [id]);
  // fallback: 直接用 students.agent_id
  if (!agentInfo && student.agent_id) {
    agentInfo = db.get(`
      SELECT a.id as agent_id, a.name as agent_name, a.type as agent_type,
        a.email as agent_email, a.phone as agent_phone,
        NULL as source_type, NULL as program_name, NULL as intake_year
      FROM agents a WHERE a.id=?
    `, [student.agent_id]);
  }

  // 代理信息仅对 principal 可见（防止counselor/student/parent看到佣金来源）
  const canSeeAgent = req.session.user.role === 'principal';
  res.json({ student, assessments, subjects, targets, mentors, applications, parents, agentInfo: canSeeAgent ? (agentInfo||null) : undefined });
});

app.put('/api/students/:id', requireRole('principal','counselor'), (req, res) => {
  const { id } = req.params;
  const { name, grade_level, enrol_date, exam_board, notes, status, date_of_birth, agent_id, _partial } = req.body;
  if (_partial) {
    // 局部更新：仅更新传入的非 undefined 字段
    if (agent_id !== undefined) {
      db.run(`UPDATE students SET agent_id=?, updated_at=? WHERE id=?`, [agent_id||null, new Date().toISOString(), id]);
    }
    audit(req, 'UPDATE', 'students', id, { agent_id });
    return res.json({ ok: true });
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 200) {
    return res.status(400).json({ error: '学生姓名不能为空且不超过200字符' });
  }
  if (grade_level && !VALID_GRADE_LEVELS.includes(grade_level)) {
    return res.status(400).json({ error: `年级必须是以下之一: ${VALID_GRADE_LEVELS.join(', ')}` });
  }
  const VALID_STATUS = ['active','inactive','graduated','deleted'];
  if (status && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: `状态必须是以下之一: ${VALID_STATUS.join(', ')}` });
  }
  db.run(`UPDATE students SET name=?,grade_level=?,enrol_date=?,exam_board=?,notes=?,status=?,updated_at=?,date_of_birth=?,agent_id=? WHERE id=?`,
    [name.trim(), grade_level, enrol_date, exam_board, notes, status||'active', new Date().toISOString(), date_of_birth||null, agent_id||null, id]);
  audit(req, 'UPDATE', 'students', id, { name });
  res.json({ ok: true });
});

app.delete('/api/students/:id', requireRole('principal'), (req, res) => {
  const { id } = req.params;
  db.run('UPDATE students SET status="deleted" WHERE id=?', [id]);
  audit(req, 'DELETE', 'students', id, null);
  res.json({ ok: true });
});

// ── 入学评估 ─────────────────────────────────────────
app.get('/api/students/:id/assessments', requireAuth, (req, res) => {
  const u = req.session.user;
  const sid = req.params.id;
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent') {
    const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  const rows = db.all('SELECT * FROM admission_assessments WHERE student_id=? ORDER BY assess_date DESC', [sid]);
  res.json(rows);
});

app.post('/api/students/:id/assessments', requireRole('principal','counselor'), (req, res) => {
  const { assess_date, assess_type, subject, score, max_score, percentile, notes } = req.body;
  const student = db.get('SELECT id FROM students WHERE id=?', [req.params.id]);
  if (!student) return res.status(404).json({ error: '学生不存在' });
  const aid = uuidv4();
  db.run(`INSERT INTO admission_assessments VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [aid, req.params.id, assess_date, assess_type, subject, score, max_score||100, percentile||null, notes||'', new Date().toISOString()]);
  res.json({ id: aid });
});

// ── 选科 ─────────────────────────────────────────────
app.get('/api/students/:id/subjects', requireAuth, (req, res) => {
  const rows = db.all(`SELECT se.*, s.code, s.name as subject_name FROM subject_enrollments se JOIN subjects s ON s.id=se.subject_id WHERE se.student_id=?`, [req.params.id]);
  res.json(rows);
});

app.post('/api/students/:id/subjects', requireRole('principal','counselor'), (req, res) => {
  const { subject_id, level, exam_board } = req.body;
  const eid = uuidv4();
  db.run(`INSERT INTO subject_enrollments VALUES (?,?,?,?,?,?)`,
    [eid, req.params.id, subject_id, level, exam_board, new Date().toISOString()]);
  res.json({ id: eid });
});

app.delete('/api/students/:sid/subjects/:eid', requireRole('principal','counselor'), (req, res) => {
  db.run('DELETE FROM subject_enrollments WHERE id=?', [req.params.eid]);
  res.json({ ok: true });
});

// ── 目标院校 ─────────────────────────────────────────
app.get('/api/students/:id/targets', requireAuth, (req, res) => {
  const rows = db.all('SELECT * FROM target_uni_lists WHERE student_id=? ORDER BY tier, priority_rank', [req.params.id]);
  res.json(rows);
});

app.post('/api/students/:id/targets', requireRole('principal','counselor'), (req, res) => {
  const { uni_name, tier, priority_rank, department, rationale } = req.body;
  const tid = uuidv4();
  db.run(`INSERT INTO target_uni_lists VALUES (?,?,?,?,?,?,?,?,?)`,
    [tid, req.params.id, uuidv4(), uni_name, tier, priority_rank||1, department||'', rationale||'', new Date().toISOString()]);
  res.json({ id: tid });
});

app.put('/api/students/:sid/targets/:tid', requireRole('principal','counselor'), (req, res) => {
  if (!db.get('SELECT id FROM target_uni_lists WHERE id=?', [req.params.tid])) {
    return res.status(404).json({ error: '目标院校记录不存在' });
  }
  const { uni_name, tier, priority_rank, department, rationale } = req.body;
  db.run('UPDATE target_uni_lists SET uni_name=?,tier=?,priority_rank=?,department=?,rationale=? WHERE id=?',
    [uni_name, tier, priority_rank, department, rationale, req.params.tid]);
  res.json({ ok: true });
});

app.delete('/api/students/:sid/targets/:tid', requireRole('principal','counselor'), (req, res) => {
  db.run('DELETE FROM target_uni_lists WHERE id=?', [req.params.tid]);
  res.json({ ok: true });
});

// ── 导师分配 ─────────────────────────────────────────
app.get('/api/students/:id/mentors', requireAuth, (req, res) => {
  const u = req.session.user;
  const sid = req.params.id;
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent') {
    const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  const rows = db.all(`
    SELECT ma.*, st.name as staff_name, st.role as staff_role, st.subjects, st.exam_board_exp
    FROM mentor_assignments ma JOIN staff st ON st.id=ma.staff_id WHERE ma.student_id=?`, [sid]);
  res.json(rows);
});

app.post('/api/students/:id/mentors', requireRole('principal','counselor'), (req, res) => {
  const { staff_id, role, start_date, notes } = req.body;
  if (!staff_id) return res.status(400).json({ error: 'staff_id 必填' });
  // Prevent duplicate active assignment for same student+staff
  const existing = db.get('SELECT id FROM mentor_assignments WHERE student_id=? AND staff_id=? AND end_date IS NULL', [req.params.id, staff_id]);
  if (existing) return res.status(409).json({ error: '该导师已分配且尚未结束，请先结束当前分配再重新指派' });
  const mid = uuidv4();
  db.run(`INSERT INTO mentor_assignments VALUES (?,?,?,?,?,?,?,?)`,
    [mid, req.params.id, staff_id, role, start_date||new Date().toISOString().split('T')[0], null, notes||'', new Date().toISOString()]);
  res.json({ id: mid });
});

app.delete('/api/students/:sid/mentors/:mid', requireRole('principal','counselor'), (req, res) => {
  db.run('UPDATE mentor_assignments SET end_date=? WHERE id=?', [new Date().toISOString().split('T')[0], req.params.mid]);
  res.json({ ok: true });
});

// ── 家长 ─────────────────────────────────────────────
app.post('/api/students/:id/parents', requireRole('principal','counselor'), (req, res) => {
  const { name, relation, phone, email, wechat } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '家长姓名必填' });
  const student = db.get('SELECT id FROM students WHERE id=?', [req.params.id]);
  if (!student) return res.status(404).json({ error: '学生不存在' });
  const pid = uuidv4();
  try {
    db.transaction(runInTx => {
      runInTx(`INSERT INTO parent_guardians VALUES (?,?,?,?,?,?,?)`,
        [pid, name.trim(), relation||'', phone||'', email||'', wechat||'', new Date().toISOString()]);
      runInTx('INSERT INTO student_parents VALUES (?,?)', [req.params.id, pid]);
    });
    res.json({ id: pid });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════
//  STAFF
// ═══════════════════════════════════════════════════════

app.get('/api/staff', requireAuth, (req, res) => {
  const staff = db.all(`
    SELECT st.*,
      COUNT(DISTINCT ma.student_id) as current_students
    FROM staff st
    LEFT JOIN mentor_assignments ma ON ma.staff_id=st.id AND ma.end_date IS NULL
    GROUP BY st.id
    ORDER BY st.role, st.name
  `);
  res.json(staff);
});

app.post('/api/staff', requireRole('principal'), (req, res) => {
  const { name, role, subjects, exam_board_exp, capacity_students, email, phone } = req.body;
  const id = uuidv4();
  const now = new Date().toISOString();
  db.run(`INSERT INTO staff VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, name, role, JSON.stringify(subjects||[]), JSON.stringify(exam_board_exp||[]), capacity_students||20, email||'', phone||'', now, now]);
  // 创建用户账号（must_change_password=1 强制首次登录修改密码）
  const username = `staff_${name.replace(/\s/g,'')}_${Date.now()}`.substring(0,20);
  const pw = bcrypt.hashSync('123456', BCRYPT_COST);
  db.run(`INSERT INTO users (id,username,password,role,linked_id,name,created_at,must_change_password) VALUES (?,?,?,?,?,?,?,1)`,
    [uuidv4(), username, pw, role, id, name, now]);
  audit(req, 'CREATE', 'staff', id, { name, role });
  res.json({ id, username, message: '账号已创建，初始密码为 123456，首次登录后系统将强制修改密码' });
});

app.get('/api/staff/:id', requireAuth, (req, res) => {
  const staff = db.get('SELECT * FROM staff WHERE id=?', [req.params.id]);
  if (!staff) return res.status(404).json({ error: '教职工不存在' });
  const credentials = db.all('SELECT * FROM staff_credentials WHERE staff_id=?', [req.params.id]);
  const students = db.all(`
    SELECT s.id, s.name, s.grade_level, ma.role as assignment_role FROM mentor_assignments ma
    JOIN students s ON s.id=ma.student_id WHERE ma.staff_id=? AND ma.end_date IS NULL`, [req.params.id]);
  res.json({ staff, credentials, students });
});

app.put('/api/staff/:id', requireRole('principal','counselor'), (req, res) => {
  if (!db.get('SELECT id FROM staff WHERE id=?', [req.params.id])) {
    return res.status(404).json({ error: '员工不存在' });
  }
  const { name, subjects, exam_board_exp, capacity_students, email, phone } = req.body;
  db.run('UPDATE staff SET name=?,subjects=?,exam_board_exp=?,capacity_students=?,email=?,phone=?,updated_at=? WHERE id=?',
    [name, JSON.stringify(subjects||[]), JSON.stringify(exam_board_exp||[]), capacity_students, email, phone, new Date().toISOString(), req.params.id]);
  res.json({ ok: true });
});

app.post('/api/staff/:id/credentials', requireRole('principal','counselor'), (req, res) => {
  const { credential_type, issuer, issue_date, valid_until, description } = req.body;
  const cid = uuidv4();
  db.run(`INSERT INTO staff_credentials VALUES (?,?,?,?,?,?,?,?)`,
    [cid, req.params.id, credential_type, issuer||'', issue_date||'', valid_until||'', description||'', new Date().toISOString()]);
  res.json({ id: cid });
});

// ═══════════════════════════════════════════════════════
//  APPLICATIONS & TIMELINE
// ═══════════════════════════════════════════════════════

app.post('/api/applications', requireRole('principal','counselor'), (req, res) => {
  const { student_id, uni_name, department, tier, cycle_year, route, submit_deadline, grade_type_used } = req.body;
  if (!student_id) return res.status(400).json({ error: 'student_id 必填' });
  const studentExists = db.get('SELECT id FROM students WHERE id=? AND status != "deleted"', [student_id]);
  if (!studentExists) return res.status(400).json({ error: '学生不存在或已归档' });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.run(`INSERT INTO applications (id,student_id,university_id,uni_name,department,tier,cycle_year,route,submit_deadline,submit_date,grade_type_used,independent_tests,offer_date,offer_type,conditions,firm_choice,insurance_choice,matriculation_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, student_id, uuidv4(), uni_name, department, tier, cycle_year, route||'UK-UG',
    submit_deadline, null, grade_type_used||'Predicted', '[]', null, 'Pending', null, 0, 0, null, 'pending', '', now, now]);
  res.json({ id });
});

app.get('/api/applications/:id', requireAuth, (req, res) => {
  const app = db.get('SELECT * FROM applications WHERE id=?', [req.params.id]);
  if (!app) return res.status(404).json({ error: '申请不存在' });
  const u = req.session.user;
  // 学生只能查看自己的申请；家长只能查看关联学生的申请
  if (u.role === 'student' && u.linked_id !== app.student_id) {
    return res.status(403).json({ error: '无权访问' });
  }
  if (u.role === 'parent') {
    const sp = db.get('SELECT 1 FROM student_parents WHERE student_id=? AND parent_id=?', [app.student_id, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  const tasks = db.all('SELECT * FROM milestone_tasks WHERE application_id=? ORDER BY due_date', [req.params.id]);
  const materials = db.all('SELECT * FROM material_items WHERE application_id=? ORDER BY created_at', [req.params.id]);
  const ps = db.get('SELECT * FROM personal_statements WHERE application_id=? ORDER BY version DESC LIMIT 1', [req.params.id]);
  res.json({ application: app, tasks, materials, personal_statement: ps });
});

app.put('/api/applications/:id', requireRole('principal','counselor'), (req, res) => {
  const { uni_name, department, tier, cycle_year, route, submit_deadline, submit_date, grade_type_used,
    offer_date, offer_type, conditions, firm_choice, insurance_choice, status, notes } = req.body;

  // UCAS Reference Gating: UK-UG applications cannot be marked 'applied' unless a Reference task is done
  if (status === 'applied' && (route || '') === 'UK-UG') {
    const app = db.get('SELECT * FROM applications WHERE id=?', [req.params.id]);
    if (app) {
      const refTask = db.get(
        `SELECT id FROM milestone_tasks WHERE student_id=? AND status='done'
         AND (LOWER(title) LIKE '%reference%' OR LOWER(title) LIKE '%推荐信%' OR LOWER(title) LIKE '%参考人%')`,
        [app.student_id]
      );
      if (!refTask) {
        return res.status(422).json({ error: 'UCAS申请无法标记为"已提交"：推荐信/Reference任务尚未完成（标记为"已完成"）。请先确认推荐人已完成并提交Reference，再更新申请状态。' });
      }
    }
  }

  const isFirm = firm_choice===true||firm_choice===1?1:0;
  // Enforce UCAS rule: only one firm choice per student per cycle_year
  if (isFirm) {
    const thisApp = db.get('SELECT student_id, cycle_year FROM applications WHERE id=?', [req.params.id]);
    if (thisApp) {
      const existingFirm = db.get(
        'SELECT id FROM applications WHERE student_id=? AND cycle_year=? AND firm_choice=1 AND id!=?',
        [thisApp.student_id, thisApp.cycle_year || cycle_year, req.params.id]
      );
      if (existingFirm) return res.status(400).json({ error: '每个申请周期只能有一个 Firm Choice' });
    }
  }
  db.run(`UPDATE applications SET uni_name=?,department=?,tier=?,cycle_year=?,route=?,submit_deadline=?,
    submit_date=?,grade_type_used=?,offer_date=?,offer_type=?,conditions=?,firm_choice=?,insurance_choice=?,
    status=?,notes=?,updated_at=? WHERE id=?`,
    [uni_name, department, tier, cycle_year, route, submit_deadline, submit_date, grade_type_used,
    offer_date, offer_type, conditions, isFirm, insurance_choice===true||insurance_choice===1?1:0, status, notes, new Date().toISOString(), req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/applications/:id', requireRole('principal','counselor'), (req, res) => {
  const app = db.get('SELECT * FROM applications WHERE id=?', [req.params.id]);
  if (!app) return res.status(404).json({ error: '申请不存在' });
  db.run('DELETE FROM applications WHERE id=?', [req.params.id]);
  // Clean up related records
  db.run('DELETE FROM milestone_tasks WHERE application_id=?', [req.params.id]);
  db.run('DELETE FROM material_items WHERE application_id=?', [req.params.id]);
  db.run('DELETE FROM personal_statements WHERE application_id=?', [req.params.id]);
  audit(req, 'DELETE', 'applications', req.params.id, { uni_name: app.uni_name });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  MILESTONE TASKS
// ═══════════════════════════════════════════════════════

app.get('/api/students/:id/tasks', requireAuth, (req, res) => {
  const u = req.session.user;
  const sid = req.params.id;
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent') {
    const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  const tasks = db.all('SELECT * FROM milestone_tasks WHERE student_id=? ORDER BY due_date', [sid]);
  res.json(tasks);
});

app.post('/api/students/:id/tasks', requireRole('principal','counselor','mentor','intake_staff'), (req, res) => {
  const { application_id, title, description, category, due_date, priority, assigned_to } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: '任务标题必填' });
  const student = db.get('SELECT id FROM students WHERE id=?', [req.params.id]);
  if (!student) return res.status(404).json({ error: '学生不存在' });
  const tid = uuidv4();
  const now = new Date().toISOString();
  db.run(`INSERT INTO milestone_tasks (id,student_id,application_id,title,description,category,due_date,completed_at,status,priority,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [tid, req.params.id, application_id||null, title.trim(), description||'', category||'其他', due_date||null, null, 'pending', priority||'normal', assigned_to||null, now, now]);
  res.json({ id: tid });
});

app.get('/api/tasks/:id', requireAuth, (req, res) => {
  const task = db.get('SELECT * FROM milestone_tasks WHERE id=?', [req.params.id]);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  const u = req.session.user;
  if (u.role === 'student' && task.student_id && u.linked_id !== task.student_id) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent' && task.student_id) {
    const sp = db.get('SELECT 1 FROM student_parents WHERE student_id=? AND parent_id=?', [task.student_id, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  // 关联学生信息
  const student = task.student_id ? db.get('SELECT id, name, grade_level, exam_board FROM students WHERE id=?', [task.student_id]) : null;
  // 关联入学案例
  const intakeCase = task.intake_case_id ? db.get('SELECT id, program_name, intake_year, status FROM intake_cases WHERE id=?', [task.intake_case_id]) : null;
  // 关联申请
  const application = task.application_id ? db.get('SELECT id, uni_name, department, status FROM applications WHERE id=?', [task.application_id]) : null;
  // 负责人
  const assignee = task.assigned_to ? db.get('SELECT id, name, role FROM staff WHERE id=?', [task.assigned_to]) : null;
  res.json({ task, student, intakeCase, application, assignee });
});

app.put('/api/tasks/:id', requireRole('principal','counselor','mentor','intake_staff'), (req, res) => {
  try {
    const { title, description, category, due_date, status, priority, assigned_to } = req.body;
    if (!title) return res.status(400).json({ error: '任务标题不能为空' });
    const existing = db.get('SELECT * FROM milestone_tasks WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: '任务不存在' });
    const completed_at = status === 'done' ? (existing.completed_at || new Date().toISOString()) : null;
    db.run(`UPDATE milestone_tasks SET title=?,description=?,category=?,due_date=?,status=?,priority=?,assigned_to=?,completed_at=?,updated_at=? WHERE id=?`,
      [title, description||'', category||'其他', due_date||null, status||'pending', priority||'normal', assigned_to||null, completed_at, new Date().toISOString(), req.params.id]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/tasks/:id', requireRole('principal','counselor','intake_staff'), (req, res) => {
  db.run('DELETE FROM milestone_tasks WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// 批量生成时间线任务（英国本科申请模板）
app.post('/api/students/:id/generate-timeline', requireRole('principal','counselor'), (req, res) => {
  const { application_id, route, tier, cycle_year } = req.body;
  const year = cycle_year || new Date().getFullYear();
  const now = new Date().toISOString();
  const sid = req.params.id;

  const templates = {
    'UK-UG-冲刺': [
      { title: '目标院校确认与选科复核', category: '申请', due_date: `${year-1}-07-31`, priority: 'high' },
      { title: '个人陈述第一问草稿（为什么选择该学科）', category: '材料', due_date: `${year-1}-08-15`, priority: 'high' },
      { title: '个人陈述第二问草稿（学业准备）', category: '材料', due_date: `${year-1}-08-31`, priority: 'high' },
      { title: '个人陈述第三问草稿（课外准备）', category: '材料', due_date: `${year-1}-09-10`, priority: 'high' },
      { title: '推荐信确认（推荐人确认）', category: '材料', due_date: `${year-1}-08-31`, priority: 'high' },
      { title: 'UCAS网申账号注册', category: '申请', due_date: `${year-1}-09-01`, priority: 'normal' },
      { title: '个人陈述一审完成', category: '材料', due_date: `${year-1}-09-20`, priority: 'high' },
      { title: '个人陈述定稿', category: '材料', due_date: `${year-1}-10-05`, priority: 'high' },
      { title: '提交UCAS申请（冲刺院校截止 10/15）', category: '申请', due_date: `${year-1}-10-15`, priority: 'high' },
      { title: '面试准备（如有）', category: '面试', due_date: `${year-1}-11-30`, priority: 'normal' },
      { title: '等待Offer结果', category: '申请', due_date: `${year}-01-31`, priority: 'normal' },
    ],
    'UK-UG-意向': [
      { title: '目标院校清单确认', category: '申请', due_date: `${year-1}-07-31`, priority: 'high' },
      { title: '个人陈述三问草稿完成', category: '材料', due_date: `${year-1}-10-31`, priority: 'high' },
      { title: '推荐信收集', category: '材料', due_date: `${year-1}-11-15`, priority: 'high' },
      { title: '成绩单准备', category: '材料', due_date: `${year-1}-11-30`, priority: 'normal' },
      { title: 'UCAS提交（主截止 1月中旬）', category: '申请', due_date: `${year}-01-15`, priority: 'high' },
      { title: '等待并跟进Offer状态', category: '申请', due_date: `${year}-03-31`, priority: 'normal' },
      { title: '确认Firm/Insurance选择', category: '申请', due_date: `${year}-05-31`, priority: 'high' },
    ],
    'UK-UG-保底': [
      { title: '备选院校清单确认', category: '申请', due_date: `${year-1}-09-30`, priority: 'normal' },
      { title: '材料准备（成绩单、推荐信）', category: '材料', due_date: `${year-1}-12-15`, priority: 'normal' },
      { title: 'UCAS提交（保底截止 1月中旬）', category: '申请', due_date: `${year}-01-15`, priority: 'high' },
      { title: '关注Clearing补录机会', category: '申请', due_date: `${year}-08-15`, priority: 'normal' },
    ]
  };

  const key = `${route || 'UK-UG'}-${tier || '意向'}`;
  const template = templates[key] || templates['UK-UG-意向'];

  const created = [];
  for (const t of template) {
    const tid = uuidv4();
    db.run(`INSERT INTO milestone_tasks (id,student_id,application_id,title,description,category,due_date,completed_at,status,priority,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [tid, sid, application_id||null, t.title, t.description||'', t.category, t.due_date, null, 'pending', t.priority||'normal', null, now, now]);
    created.push(tid);
  }

  res.json({ created: created.length, tasks: created });
});

// ═══════════════════════════════════════════════════════
//  MATERIALS & PERSONAL STATEMENT
// ═══════════════════════════════════════════════════════

app.get('/api/students/:id/materials', requireAuth, (req, res) => {
  const u = req.session.user;
  const sid = req.params.id;
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent') {
    const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  const materials = db.all('SELECT * FROM material_items WHERE student_id=? ORDER BY created_at DESC', [sid]);
  res.json(materials);
});

app.post('/api/students/:id/materials', requireRole('principal','counselor','mentor','intake_staff','student_admin'), (req, res) => {
  const { application_id, intake_case_id, material_type, title, notes, doc_tag, status } = req.body;
  const sid = req.params.id;
  const student = db.get('SELECT id FROM students WHERE id=?', [sid]);
  if (!student) return res.status(404).json({ error: '学生不存在' });
  if (!material_type) return res.status(400).json({ error: 'material_type 必填' });
  if (application_id) {
    const app = db.get('SELECT id FROM applications WHERE id=? AND student_id=?', [application_id, sid]);
    if (!app) return res.status(400).json({ error: '申请记录不属于该学生' });
  }
  if (intake_case_id) {
    const ic = db.get('SELECT id FROM intake_cases WHERE id=? AND student_id=?', [intake_case_id, sid]);
    if (!ic) return res.status(400).json({ error: '入学案例不属于该学生' });
  }
  const mid = uuidv4();
  const now = new Date().toISOString();
  db.run(`INSERT INTO material_items (id,student_id,application_id,intake_case_id,material_type,title,status,version,file_path,notes,doc_tag,reviewed_by,reviewed_at,submitted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [mid, sid, application_id||null, intake_case_id||null, material_type, title||'', status||'未开始', 1, null, notes||'', doc_tag||null, null, null, null, now, now]);
  res.json({ id: mid });
});

app.put('/api/materials/:id', requireRole('principal','counselor','mentor','intake_staff'), (req, res) => {
  if (!db.get('SELECT id FROM material_items WHERE id=?', [req.params.id])) {
    return res.status(404).json({ error: '材料记录不存在' });
  }
  const { title, status, notes, reviewed_by, version } = req.body;
  const now = new Date().toISOString();
  const reviewed_at = reviewed_by ? now : null;
  const submitted_at = status === '已提交' ? now : null;
  db.run(`UPDATE material_items SET title=?,status=?,notes=?,reviewed_by=?,reviewed_at=?,submitted_at=?,version=?,updated_at=? WHERE id=?`,
    [title, status, notes, reviewed_by||null, reviewed_at, submitted_at, version||1, now, req.params.id]);
  res.json({ ok: true });
});

app.post('/api/materials/:id/upload', requireRole('principal','counselor','mentor','intake_staff'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  moveUploadedFile(req.file.filename, 'material');
  db.run('UPDATE material_items SET file_path=?,updated_at=? WHERE id=?',
    [req.file.filename, new Date().toISOString(), req.params.id]);
  audit(req, 'UPLOAD', 'material_items', req.params.id, { filename: req.file.filename });
  res.json({ file: req.file.filename });
});

// ── 鉴权文件下载（替代原 /uploads 静态路由） ──────────
app.get('/api/files/:filename', requireAuth, (req, res) => {
  const filename = path.basename(req.params.filename); // 防路径穿越
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return res.status(403).json({ error: '不允许访问此类型文件' });

  // 验证该文件确实属于该用户有权访问的学生材料
  const material = db.get('SELECT mi.*, s.id as student_id FROM material_items mi JOIN students s ON s.id=mi.student_id WHERE mi.file_path=?', [filename]);
  if (!material) return res.status(404).json({ error: '文件不存在' });

  // 权限检查：学生只能下载自己的文件
  const u = req.session.user;
  if (u.role === 'student' && material.student_id !== u.linked_id) {
    return res.status(403).json({ error: '无权访问此文件' });
  }

  const filePath = fileStorage.getFilePath(filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });

  audit(req, 'DOWNLOAD', 'material_items', material.id, { filename });
  res.download(filePath, filename);
});

// 个人陈述
app.get('/api/students/:id/personal-statement', requireAuth, (req, res) => {
  const u = req.session.user;
  const sid = req.params.id;
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent') {
    const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  const ps = db.all('SELECT * FROM personal_statements WHERE student_id=? ORDER BY version DESC', [sid]);
  res.json(ps);
});

app.post('/api/students/:id/personal-statement', requireAuth, (req, res) => {
  const u = req.session.user; const sid = req.params.id;
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent') return res.status(403).json({ error: '无权操作' });
  const { application_id, content_json, q1_content, q2_content, q3_content } = req.body;
  const answers = Array.isArray(content_json) ? content_json : [q1_content||'', q2_content||'', q3_content||''];
  const c1 = answers[0]||'', c2 = answers[1]||'', c3 = answers[2]||'';
  const combined = answers.join('');
  const existing = db.get('SELECT MAX(version) as mv FROM personal_statements WHERE student_id=?', [req.params.id]);
  const version = (existing?.mv || 0) + 1;
  const id = uuidv4();
  const now = new Date().toISOString();
  db.run(`INSERT INTO personal_statements (id,student_id,application_id,version,status,q1_content,q2_content,q3_content,word_count,char_count,reviewer_id,review_notes,created_at,updated_at,content_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, req.params.id, application_id||null, version, '草稿', c1, c2, c3, combined.length, combined.length, null, '', now, now, JSON.stringify(answers)]);
  res.json({ id, version });
});

app.put('/api/personal-statements/:id', requireAuth, (req, res) => {
  const ps = db.get('SELECT student_id FROM personal_statements WHERE id=?', [req.params.id]);
  if (!ps) return res.status(404).json({ error: '个人陈述不存在' });
  const u = req.session.user;
  if (u.role === 'student' && u.linked_id !== ps.student_id) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent') return res.status(403).json({ error: '无权操作' });
  const { content_json, q1_content, q2_content, q3_content, status, reviewer_id, review_notes } = req.body;
  const answers = Array.isArray(content_json) ? content_json : [q1_content||'', q2_content||'', q3_content||''];
  const combined = answers.join('');
  db.run(`UPDATE personal_statements SET q1_content=?,q2_content=?,q3_content=?,content_json=?,status=?,char_count=?,reviewer_id=?,review_notes=?,updated_at=? WHERE id=?`,
    [answers[0]||'', answers[1]||'', answers[2]||'', JSON.stringify(answers), status, combined.length, reviewer_id||null, review_notes||'', new Date().toISOString(), req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  COMMUNICATIONS
// ═══════════════════════════════════════════════════════

app.get('/api/students/:id/communications', requireAuth, (req, res) => {
  const u = req.session.user;
  const sid = req.params.id;
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent') {
    const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  const logs = db.all(`
    SELECT cl.*, st.name as staff_name, pg.name as parent_name
    FROM communication_logs cl
    LEFT JOIN staff st ON st.id=cl.staff_id
    LEFT JOIN parent_guardians pg ON pg.id=cl.parent_id
    WHERE cl.student_id=? ORDER BY cl.comm_date DESC`, [sid]);
  res.json(logs);
});

app.post('/api/students/:id/communications', requireRole('principal','counselor','mentor','intake_staff'), (req, res) => {
  const { parent_id, channel, summary, action_items, comm_date } = req.body;
  const cid = uuidv4();
  const staff_id = ['counselor','mentor','principal'].includes(req.session.user.role) ? req.session.user.linked_id : null;
  db.run(`INSERT INTO communication_logs VALUES (?,?,?,?,?,?,?,?,?)`,
    [cid, req.params.id, staff_id, parent_id||null, channel, summary, action_items||'', comm_date||new Date().toISOString(), new Date().toISOString()]);
  res.json({ id: cid });
});

// ═══════════════════════════════════════════════════════
//  FEEDBACK
// ═══════════════════════════════════════════════════════

app.get('/api/students/:id/feedback', requireAuth, (req, res) => {
  const u = req.session.user; const sid = req.params.id;
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent') {
    const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  const rows = db.all('SELECT * FROM feedback WHERE student_id=? ORDER BY created_at DESC', [sid]);
  res.json(rows);
});

app.post('/api/students/:id/feedback', requireAuth, (req, res) => {
  const u = req.session.user; const sid = req.params.id;
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '只能为本人提交反馈' });
  if (u.role === 'parent') {
    const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权为该学生提交反馈' });
  }
  const { feedback_type, content, rating } = req.body;
  const fid = uuidv4();
  const from_role = req.session.user.role;
  const from_id = req.session.user.linked_id;
  db.run(`INSERT INTO feedback VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [fid, req.params.id, from_role, from_id, feedback_type, content, rating||null, 'pending', null, null, null, new Date().toISOString()]);
  res.json({ id: fid });
});

app.put('/api/feedback/:id', requireRole('principal','counselor'), (req, res) => {
  const { status, response } = req.body;
  db.run('UPDATE feedback SET status=?,response=?,responded_by=?,responded_at=? WHERE id=?',
    [status, response, req.session.user.id, new Date().toISOString(), req.params.id]);
  res.json({ ok: true });
});

app.get('/api/feedback', requireRole('principal','counselor'), (req, res) => {
  const rows = db.all(`
    SELECT f.*, s.name as student_name FROM feedback f
    JOIN students s ON s.id=f.student_id
    WHERE f.status='pending' ORDER BY f.created_at DESC LIMIT 50`);
  res.json(rows);
});

// ═══════════════════════════════════════════════════════
//  SETTINGS (系统设置)
// ═══════════════════════════════════════════════════════

app.get('/api/settings', requireAuth, (_req, res) => {
  const rows = db.all('SELECT key, value FROM settings');
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

app.put('/api/settings/:key', requireRole('principal'), (req, res) => {
  const { value } = req.body;
  db.run('INSERT OR REPLACE INTO settings VALUES (?,?)', [req.params.key, value ?? '']);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  GUARDIAN CONSENT （监护人同意）
// ═══════════════════════════════════════════════════════

app.get('/api/students/:id/consents', requireRole('principal','counselor','intake_staff'), (req, res) => {
  res.json(db.all('SELECT * FROM guardian_consents WHERE student_id=? ORDER BY created_at DESC', [req.params.id]));
});

app.post('/api/students/:id/consents', requireRole('principal','counselor','intake_staff'), (req, res) => {
  const { guardian_name, relation, consent_version, consent_scope, consented, consent_date } = req.body;
  if (!guardian_name || !consent_date) return res.status(400).json({ error: '监护人姓名和同意日期必填' });
  const id = uuidv4();
  db.run(`INSERT INTO guardian_consents (id,student_id,guardian_name,relation,consent_version,consent_scope,consented,consent_date,recorded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, req.params.id, guardian_name, relation||'', consent_version||'1.0',
     JSON.stringify(consent_scope||['data_storage','counseling']),
     consented !== false ? 1 : 0, consent_date, req.session.user.id, new Date().toISOString()]);
  audit(req, 'CREATE', 'guardian_consents', id, { guardian_name, consented });
  res.json({ id });
});

app.put('/api/consents/:id/revoke', requireRole('principal','counselor','intake_staff'), (req, res) => {
  const { revoke_reason } = req.body;
  const now = new Date().toISOString();
  db.run('UPDATE guardian_consents SET consented=0, revoke_date=?, revoke_reason=? WHERE id=?',
    [now, revoke_reason||'', req.params.id]);
  audit(req, 'REVOKE', 'guardian_consents', req.params.id, { revoke_reason });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  SUBJECTS (字典)
// ═══════════════════════════════════════════════════════

app.get('/api/subjects', requireAuth, (req, res) => {
  res.json(db.all('SELECT * FROM subjects ORDER BY category, code'));
});

// ═══════════════════════════════════════════════════════
//  TIMELINE TEMPLATES
// ═══════════════════════════════════════════════════════

app.get('/api/templates', requireAuth, (_req, res) => {
  const templates = db.all('SELECT * FROM timeline_templates ORDER BY is_system DESC, created_at DESC');
  templates.forEach(t => {
    const items = db.all('SELECT COUNT(*) as cnt FROM template_items WHERE template_id=?', [t.id]);
    t.item_count = items[0]?.cnt || 0;
  });
  res.json(templates);
});

app.post('/api/templates', requireRole('principal','counselor'), (req, res) => {
  const { name, description, route, tier, items } = req.body;
  if (!name) return res.status(400).json({ error: '模板名称不能为空' });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.run(`INSERT INTO timeline_templates (id,name,description,route,tier,is_system,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [id, name, description||'', route||'UK-UG', tier||'意向', 0, req.session.user.id, now]);
  if (items && Array.isArray(items)) {
    items.forEach((item, idx) => {
      db.run(`INSERT INTO template_items (id,template_id,title,description,category,days_before_deadline,priority,sort_order) VALUES (?,?,?,?,?,?,?,?)`,
        [uuidv4(), id, item.title, item.description||'', item.category||'其他',
         parseInt(item.days_before_deadline)||30, item.priority||'normal', idx]);
    });
  }
  res.json({ id });
});

app.get('/api/templates/:id', requireAuth, (req, res) => {
  const tpl = db.get('SELECT * FROM timeline_templates WHERE id=?', [req.params.id]);
  if (!tpl) return res.status(404).json({ error: '模板不存在' });
  const items = db.all('SELECT * FROM template_items WHERE template_id=? ORDER BY sort_order, days_before_deadline DESC', [req.params.id]);
  res.json({ template: tpl, items });
});

app.put('/api/templates/:id', requireRole('principal','counselor'), (req, res) => {
  const { name, description, route, tier, items } = req.body;
  const tpl = db.get('SELECT * FROM timeline_templates WHERE id=?', [req.params.id]);
  if (!tpl) return res.status(404).json({ error: '模板不存在' });
  if (tpl.is_system) return res.status(403).json({ error: '系统内置模板不可编辑，请复制后修改' });
  db.run('UPDATE timeline_templates SET name=?,description=?,route=?,tier=? WHERE id=?',
    [name, description||'', route||'UK-UG', tier||'意向', req.params.id]);
  if (items && Array.isArray(items)) {
    db.run('DELETE FROM template_items WHERE template_id=?', [req.params.id]);
    items.forEach((item, idx) => {
      db.run(`INSERT INTO template_items (id,template_id,title,description,category,days_before_deadline,priority,sort_order) VALUES (?,?,?,?,?,?,?,?)`,
        [uuidv4(), req.params.id, item.title, item.description||'', item.category||'其他',
         parseInt(item.days_before_deadline)||30, item.priority||'normal', idx]);
    });
  }
  res.json({ ok: true });
});

app.delete('/api/templates/:id', requireRole('principal','counselor'), (req, res) => {
  const tpl = db.get('SELECT * FROM timeline_templates WHERE id=?', [req.params.id]);
  if (!tpl) return res.status(404).json({ error: '模板不存在' });
  if (tpl.is_system) return res.status(403).json({ error: '系统内置模板不可删除' });
  db.run('DELETE FROM template_items WHERE template_id=?', [req.params.id]);
  db.run('DELETE FROM timeline_templates WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/templates/:id/copy', requireRole('principal','counselor'), (req, res) => {
  const tpl = db.get('SELECT * FROM timeline_templates WHERE id=?', [req.params.id]);
  if (!tpl) return res.status(404).json({ error: '模板不存在' });
  const items = db.all('SELECT * FROM template_items WHERE template_id=? ORDER BY sort_order', [req.params.id]);
  const newId = uuidv4();
  const now = new Date().toISOString();
  db.run(`INSERT INTO timeline_templates (id,name,description,route,tier,is_system,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [newId, `${tpl.name}（副本）`, tpl.description||'', tpl.route, tpl.tier, 0, req.session.user.id, now]);
  items.forEach((item, idx) => {
    db.run(`INSERT INTO template_items (id,template_id,title,description,category,days_before_deadline,priority,sort_order) VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), newId, item.title, item.description||'', item.category, item.days_before_deadline, item.priority, idx]);
  });
  res.json({ id: newId });
});

app.post('/api/templates/:id/apply', requireRole('principal','counselor','mentor'), (req, res) => {
  const { student_id, application_id, base_date } = req.body;
  if (!student_id || !base_date) return res.status(400).json({ error: '学生ID和截止日期必填' });
  const tpl = db.get('SELECT * FROM timeline_templates WHERE id=?', [req.params.id]);
  if (!tpl) return res.status(404).json({ error: '模板不存在' });
  const items = db.all('SELECT * FROM template_items WHERE template_id=? ORDER BY sort_order', [req.params.id]);
  const base = new Date(base_date);
  if (isNaN(base.getTime())) return res.status(400).json({ error: '截止日期格式无效，请使用 YYYY-MM-DD' });
  const now = new Date().toISOString();
  const created = [];
  for (const item of items) {
    const dueDate = new Date(base);
    dueDate.setDate(dueDate.getDate() - (item.days_before_deadline || 0));
    const tid = uuidv4();
    db.run(`INSERT INTO milestone_tasks (id,student_id,application_id,title,description,category,due_date,completed_at,status,priority,assigned_to,created_at,updated_at,due_time,due_timezone) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [tid, student_id, application_id||null, item.title, item.description||'', item.category,
       dueDate.toISOString().split('T')[0], null, 'pending', item.priority||'normal', null, now, now,
       tpl.deadline_time||null, tpl.deadline_timezone||null]);
    created.push(tid);
  }

  // For UK-UG templates: auto-create a reference prerequisite task if not already present
  if (tpl.route === 'UK-UG') {
    const hasRef = db.get(
      `SELECT id FROM milestone_tasks WHERE student_id=? AND (LOWER(title) LIKE '%reference%' OR LOWER(title) LIKE '%推荐信%' OR LOWER(title) LIKE '%参考人%')`,
      [student_id]
    );
    if (!hasRef) {
      const refDue = new Date(base);
      refDue.setDate(refDue.getDate() - 21); // 3 weeks before deadline
      db.run(`INSERT INTO milestone_tasks (id,student_id,application_id,title,description,category,due_date,completed_at,status,priority,assigned_to,created_at,updated_at,due_time,due_timezone) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), student_id, application_id||null,
         '【前置必须】推荐人完成并提交 Reference（UCAS硬门槛）',
         'UCAS规定：在推荐人完成并提交Reference之前，申请无法最终提交。请与推荐人确认提交状态，并在此任务中记录完成时间。',
         '材料', refDue.toISOString().split('T')[0], null, 'pending', 'high', null, now, now,
         '18:00', 'Europe/London']);
      created.push('reference-auto');
    }
  }

  res.json({ created: created.length });
});

// ═══════════════════════════════════════════════════════
//  P1.2 EXAM SITTINGS（考试场次）
// ═══════════════════════════════════════════════════════

app.get('/api/students/:id/exam-sittings', requireAuth, (req, res) => {
  const u = req.session.user;
  const sid = req.params.id;
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent') {
    const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  res.json(db.all('SELECT * FROM exam_sittings WHERE student_id=? ORDER BY year DESC, sitting_date DESC', [sid]));
});

app.post('/api/students/:id/exam-sittings', requireRole('principal','counselor','mentor'), (req, res) => {
  const { exam_board, series, year, subject, subject_code, component, sitting_date, results_date,
          predicted_grade, actual_grade, ums_score, status, is_resit, resit_of, notes } = req.body;
  if (!exam_board) return res.status(400).json({ error: '考试局必填' });
  if (!subject || !subject.trim()) return res.status(400).json({ error: '科目名称必填' });
  // Prevent duplicate sitting for same student/board/series/year/subject/component
  const duplicate = db.get(
    'SELECT id FROM exam_sittings WHERE student_id=? AND exam_board=? AND series=? AND year=? AND subject=? AND component=?',
    [req.params.id, exam_board, series||'', year||null, subject.trim(), component||'']
  );
  if (duplicate) return res.status(409).json({ error: '该考试记录（学生/考试局/考试季/年份/科目/成分）已存在，请编辑现有记录' });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.run(`INSERT INTO exam_sittings (id,student_id,exam_board,series,year,subject,subject_code,component,sitting_date,results_date,predicted_grade,actual_grade,ums_score,status,is_resit,resit_of,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, req.params.id, exam_board, series||'', year||null, subject.trim(), subject_code||'', component||'',
     sitting_date||null, results_date||null, predicted_grade||'', actual_grade||'', ums_score||'',
     status||'registered', is_resit?1:0, resit_of||null, notes||'', now, now]);
  audit(req, 'CREATE', 'exam_sittings', id, { exam_board, subject });
  res.json({ id });
});

app.put('/api/exam-sittings/:id', requireRole('principal','counselor','mentor'), (req, res) => {
  const { exam_board, series, year, subject, subject_code, component, sitting_date, results_date,
          predicted_grade, actual_grade, ums_score, status, is_resit, notes } = req.body;
  const now = new Date().toISOString();
  const before = db.get('SELECT * FROM exam_sittings WHERE id=?', [req.params.id]);
  if (!before) return res.status(404).json({ error: '考试记录不存在' });
  db.run(`UPDATE exam_sittings SET exam_board=?,series=?,year=?,subject=?,subject_code=?,component=?,sitting_date=?,results_date=?,predicted_grade=?,actual_grade=?,ums_score=?,status=?,is_resit=?,notes=?,updated_at=? WHERE id=?`,
    [exam_board, series||'', year||null, subject||'', subject_code||'', component||'',
     sitting_date||null, results_date||null, predicted_grade||'', actual_grade||'', ums_score||'',
     status||'registered', is_resit?1:0, notes||'', now, req.params.id]);
  audit(req, 'UPDATE', 'exam_sittings', req.params.id, { before, after: req.body });
  res.json({ ok: true });
});

app.delete('/api/exam-sittings/:id', requireRole('principal','counselor'), (req, res) => {
  db.run('DELETE FROM exam_sittings WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  P1.1 CALENDAR ANCHOR EVENTS（日历锚点事件）
// ═══════════════════════════════════════════════════════

app.get('/api/anchor-events', requireAuth, (req, res) => {
  res.json(db.all('SELECT * FROM calendar_anchor_events ORDER BY event_date DESC'));
});

app.post('/api/anchor-events', requireRole('principal','counselor'), (req, res) => {
  const { name, event_type, exam_board, series, year, event_date, notes } = req.body;
  if (!name || !event_date) return res.status(400).json({ error: '名称和日期必填' });
  const id = uuidv4();
  db.run(`INSERT INTO calendar_anchor_events (id,name,event_type,exam_board,series,year,event_date,notes,is_system,created_at) VALUES (?,?,?,?,?,?,?,?,0,?)`,
    [id, name, event_type||'custom', exam_board||'', series||'', year||null, event_date, notes||'', new Date().toISOString()]);
  res.json({ id });
});

app.delete('/api/anchor-events/:id', requireRole('principal','counselor'), (req, res) => {
  const ev = db.get('SELECT is_system FROM calendar_anchor_events WHERE id=?', [req.params.id]);
  if (ev && ev.is_system) return res.status(403).json({ error: '系统内置锚点不可删除' });
  db.run('DELETE FROM calendar_anchor_events WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  P1.3 ROUTE-SPECIFIC APPLICATION EXTENSIONS
// ═══════════════════════════════════════════════════════

app.get('/api/applications/:id/ext', requireAuth, (req, res) => {
  const app_row = db.get('SELECT route FROM applications WHERE id=?', [req.params.id]);
  if (!app_row) return res.status(404).json({ error: '申请不存在' });
  let ext = null;
  if (app_row.route === 'UK-UG') ext = db.get('SELECT * FROM application_uk_ext WHERE application_id=?', [req.params.id]);
  else if (app_row.route === 'US') ext = db.get('SELECT * FROM application_us_ext WHERE application_id=?', [req.params.id]);
  else if (app_row.route === 'SG') ext = db.get('SELECT * FROM application_sg_ext WHERE application_id=?', [req.params.id]);
  res.json({ route: app_row.route, ext: ext || {} });
});

app.put('/api/applications/:id/ext', requireRole('principal','counselor'), (req, res) => {
  const app_row = db.get('SELECT route FROM applications WHERE id=?', [req.params.id]);
  if (!app_row) return res.status(404).json({ error: '申请不存在' });
  const aid = req.params.id;
  const d = req.body;
  if (app_row.route === 'UK-UG') {
    db.run(`INSERT OR REPLACE INTO application_uk_ext (application_id,ucas_personal_id,ucas_choice_number,reference_status,clearing_eligible,firm_conditions,insurance_conditions) VALUES (?,?,?,?,?,?,?)`,
      [aid, d.ucas_personal_id||'', d.ucas_choice_number||null, d.reference_status||'pending', d.clearing_eligible?1:0, d.firm_conditions||'', d.insurance_conditions||'']);
  } else if (app_row.route === 'US') {
    db.run(`INSERT OR REPLACE INTO application_us_ext (application_id,app_type,is_binding,platform,school_portal_url,decision_date_expected,css_profile_required,fafsa_required,supplements_required) VALUES (?,?,?,?,?,?,?,?,?)`,
      [aid, d.app_type||'RD', d.is_binding?1:0, d.platform||'', d.school_portal_url||'', d.decision_date_expected||null, d.css_profile_required?1:0, d.fafsa_required?1:0, JSON.stringify(d.supplements_required||[])]);
  } else if (app_row.route === 'SG') {
    db.run(`INSERT OR REPLACE INTO application_sg_ext (application_id,portal_name,supplement_scores_required,supplement_scores_submitted,supplement_deadline,interview_required,interview_date,interview_format,test_required,test_type,test_date,scholarship_applied) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [aid, d.portal_name||'', d.supplement_scores_required?1:0, d.supplement_scores_submitted?1:0, d.supplement_deadline||null, d.interview_required?1:0, d.interview_date||null, d.interview_format||'', d.test_required?1:0, d.test_type||'', d.test_date||null, d.scholarship_applied?1:0]);
  }
  audit(req, 'UPDATE', 'application_ext', aid, d);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  P1.4 NOTIFICATIONS（通知与升级）
// ═══════════════════════════════════════════════════════

// 生成通知（按需触发，检查即将到期/已逾期任务）
app.post('/api/notifications/generate', requireRole('principal','counselor'), (req, res) => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const policies = db.all('SELECT * FROM escalation_policies');
  const tasks = db.all(`SELECT mt.*, s.name as student_name FROM milestone_tasks mt JOIN students s ON s.id=mt.student_id WHERE mt.status NOT IN ('done') AND mt.due_date IS NOT NULL`);
  let created = 0;
  for (const task of tasks) {
    const due = new Date(task.due_date);
    const diffDays = Math.round((due - now) / (1000 * 60 * 60 * 24));
    for (const policy of policies) {
      const triggerDays = JSON.parse(policy.trigger_days || '[]');
      for (const td of triggerDays) {
        if (diffDays === td) {
          const existing = db.get('SELECT id FROM notification_logs WHERE task_id=? AND trigger_days=?', [task.id, td]);
          if (!existing) {
            const title = td > 0 ? `距截止还有 ${td} 天` : (td === 0 ? '今日截止！' : `已逾期 ${Math.abs(td)} 天`);
            db.run(`INSERT INTO notification_logs (id,student_id,task_id,type,trigger_days,title,message,target_role,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
              [uuidv4(), task.student_id, task.id,
               diffDays < 0 ? 'overdue' : 'deadline_reminder', td,
               `${task.student_name}·${task.title}｜${title}`,
               `任务"${task.title}"截止日：${task.due_date}，当前状态：${task.status}`,
               policy.escalate_to_role, new Date().toISOString()]);
            created++;
          }
        }
      }
    }
  }
  res.json({ created });
});

app.get('/api/notifications', requireAuth, (req, res) => {
  const u = req.session.user;
  let where = [];
  let params = [];
  if (u.role === 'student') {
    where.push('n.student_id=?'); params.push(u.linked_id);
  } else if (u.role === 'mentor') {
    where.push('n.student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)');
    params.push(u.linked_id);
  } else if (u.role === 'intake_staff' || u.role === 'student_admin') {
    // 入学管理角色：只看入学相关通知（target_role 匹配或直接点名）
    where.push('(n.target_user_id=? OR n.target_role=?)');
    params.push(u.id, u.role);
  } else {
    // 其他角色(principal/counselor)：看自己被直接点名的通知 OR 按角色广播的通知
    where.push('(n.target_user_id=? OR (n.target_role=? AND n.target_user_id IS NULL) OR (n.target_role IS NULL AND n.target_user_id IS NULL))');
    params.push(u.id, u.role);
  }
  const whereStr = `WHERE ${where.join(' AND ')}`;
  const notifs = db.all(`SELECT n.*, s.name as student_name FROM notification_logs n LEFT JOIN students s ON s.id=n.student_id ${whereStr} ORDER BY n.created_at DESC LIMIT 100`, params);
  res.json(notifs);
});

app.put('/api/notifications/:id/read', requireAuth, (req, res) => {
  db.run('UPDATE notification_logs SET is_read=1, read_at=? WHERE id=?', [new Date().toISOString(), req.params.id]);
  res.json({ ok: true });
});

app.put('/api/notifications/read-all', requireAuth, (req, res) => {
  const now = new Date().toISOString();
  const u = req.session.user;
  if (u.role === 'student') {
    db.run('UPDATE notification_logs SET is_read=1, read_at=? WHERE student_id=? AND is_read=0', [now, u.linked_id]);
  } else {
    db.run(`UPDATE notification_logs SET is_read=1, read_at=? WHERE is_read=0
      AND (target_user_id=? OR (target_role=? AND target_user_id IS NULL) OR (target_role IS NULL AND target_user_id IS NULL))`,
      [now, u.id, u.role]);
  }
  res.json({ ok: true });
});

app.get('/api/escalation-policies', requireRole('principal','counselor'), (req, res) => {
  res.json(db.all('SELECT * FROM escalation_policies ORDER BY created_at'));
});

app.put('/api/escalation-policies/:id', requireRole('principal','counselor'), (req, res) => {
  const { name, trigger_days, escalate_to_role, auto_escalate_overdue_hours, apply_to_categories } = req.body;
  db.run('UPDATE escalation_policies SET name=?,trigger_days=?,escalate_to_role=?,auto_escalate_overdue_hours=?,apply_to_categories=? WHERE id=?',
    [name, JSON.stringify(trigger_days||[]), escalate_to_role||'counselor', auto_escalate_overdue_hours||24,
     apply_to_categories ? JSON.stringify(apply_to_categories) : null, req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  P1.5 ENHANCED AUDIT（增强审计与合规导出）
// ═══════════════════════════════════════════════════════

app.get('/api/audit', requireRole('principal'), (req, res) => {
  const { student_id, action, entity_type, start, end, limit } = req.query;
  let where = [];
  let params = [];
  if (student_id) { where.push('entity_id=?'); params.push(student_id); }
  if (action) { where.push('action=?'); params.push(action); }
  if (entity_type) { where.push('entity=?'); params.push(entity_type); }
  if (start) { where.push("created_at >= ?"); params.push(start); }
  if (end) { where.push("created_at <= ?"); params.push(end + 'T23:59:59'); }
  const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeLimit = Math.min(Math.max(parseInt(limit) || 200, 1), 1000);
  const rows = db.all(`SELECT al.*, u.username, u.name as user_name FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id ${whereStr} ORDER BY al.created_at DESC LIMIT ${safeLimit}`, params);
  res.json(rows);
});

app.get('/api/audit/export', requireRole('principal'), (req, res) => {
  const { student_id, start, end } = req.query;
  let where = [];
  let params = [];
  if (student_id) { where.push('al.entity_id=?'); params.push(student_id); }
  if (start) { where.push("al.created_at >= ?"); params.push(start); }
  if (end) { where.push("al.created_at <= ?"); params.push(end + 'T23:59:59'); }
  const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.all(`SELECT al.*, u.username, u.name as user_name FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id ${whereStr} ORDER BY al.created_at DESC LIMIT 5000`, params);
  const csv = ['时间,操作者,操作,对象类型,对象ID,详情,IP'].concat(
    rows.map(r => [r.created_at, r.user_name||r.username||'', r.action, r.entity||'', r.entity_id||'', JSON.stringify(r.detail||'').replace(/,/g,'，'), r.ip||''].join(','))
  ).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit_export_${new Date().toISOString().split('T')[0]}.csv"`);
  res.send('\uFEFF' + csv); // BOM for Excel UTF-8
});

// ═══════════════════════════════════════════════════════
//  P2.1 ANALYTICS（数据分析）
// ═══════════════════════════════════════════════════════

app.get('/api/analytics/overview', requireRole('principal','counselor'), (req, res) => {
  const admissionRate = db.get(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN offer_type IN ('Conditional','Unconditional') THEN 1 ELSE 0 END) as offers,
    SUM(CASE WHEN status='enrolled' THEN 1 ELSE 0 END) as enrolled
    FROM applications`);
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

app.get('/api/students/:id/calendar.ics', requireAuth, (req, res) => {
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

// ═══════════════════════════════════════════════════════
//  录取要求匹配 & 概率评估
// ═══════════════════════════════════════════════════════

// ── 院校专业库 CRUD ───────────────────────────────────
app.get('/api/uni-programs', requireAuth, (req, res) => {
  const { country, route, search, uni_name } = req.query;
  let where = ['is_active=1'];
  let params = [];
  if (country) { where.push('country=?'); params.push(country); }
  if (route)   { where.push('route=?');   params.push(route); }
  if (uni_name){ where.push('uni_name LIKE ?'); params.push(`%${uni_name}%`); }
  if (search)  { where.push('(uni_name LIKE ? OR program_name LIKE ? OR department LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const rows = db.all(`SELECT * FROM uni_programs WHERE ${where.join(' AND ')} ORDER BY country, uni_name, program_name`, params);
  res.json(rows);
});

app.get('/api/uni-programs/:id', requireAuth, (req, res) => {
  const prog = db.get('SELECT * FROM uni_programs WHERE id=?', [req.params.id]);
  if (!prog) return res.status(404).json({ error: '专业不存在' });
  const history = db.all('SELECT * FROM school_admission_history WHERE program_id=? ORDER BY cycle_year DESC', [req.params.id]);
  res.json({ ...prog, history });
});

app.post('/api/uni-programs', requireRole('principal','counselor'), (req, res) => {
  const id = uuidv4();
  const {
    university_id, uni_name, program_name, department, country, route, cycle_year,
    app_deadline, app_deadline_time, app_deadline_tz, ucas_early_deadline,
    grade_requirements, min_subjects, grade_type,
    ielts_overall, ielts_min_component, toefl_overall, duolingo_min,
    extra_tests, reference_required, reference_notes,
    hist_applicants, hist_offers, hist_offer_rate, hist_avg_grade, hist_data_year,
    weight_academic, weight_language, weight_extra, notes
  } = req.body;
  if (!uni_name || !program_name) return res.status(400).json({ error: '院校名和专业名必填' });
  db.run(`INSERT INTO uni_programs
    (id,university_id,uni_name,program_name,department,country,route,cycle_year,
     app_deadline,app_deadline_time,app_deadline_tz,ucas_early_deadline,
     grade_requirements,min_subjects,grade_type,
     ielts_overall,ielts_min_component,toefl_overall,duolingo_min,
     extra_tests,reference_required,reference_notes,
     hist_applicants,hist_offers,hist_offer_rate,hist_avg_grade,hist_data_year,
     weight_academic,weight_language,weight_extra,notes,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, university_id||null, uni_name, program_name, department||null, country||'UK', route||'UK-UG',
     cycle_year||null, app_deadline||null, app_deadline_time||null, app_deadline_tz||'Europe/London',
     ucas_early_deadline?1:0,
     typeof grade_requirements === 'object' ? JSON.stringify(grade_requirements) : (grade_requirements||null),
     min_subjects||3, grade_type||'A-Level',
     ielts_overall||null, ielts_min_component||null, toefl_overall||null, duolingo_min||null,
     typeof extra_tests === 'object' ? JSON.stringify(extra_tests) : (extra_tests||null),
     reference_required?1:0, reference_notes||null,
     hist_applicants||null, hist_offers||null, hist_offer_rate||null, hist_avg_grade||null, hist_data_year||null,
     weight_academic||0.6, weight_language||0.25, weight_extra||0.15,
     notes||null, req.session.user.id, new Date().toISOString(), new Date().toISOString()
    ]);
  audit(req, 'CREATE', 'uni_programs', id, { uni_name, program_name });
  res.json({ id });
});

app.put('/api/uni-programs/:id', requireRole('principal','counselor'), (req, res) => {
  const prog = db.get('SELECT id FROM uni_programs WHERE id=?', [req.params.id]);
  if (!prog) return res.status(404).json({ error: '专业不存在' });
  const fields = [
    'university_id','uni_name','program_name','department','country','route','cycle_year',
    'app_deadline','app_deadline_time','app_deadline_tz','ucas_early_deadline',
    'grade_requirements','min_subjects','grade_type',
    'ielts_overall','ielts_min_component','toefl_overall','duolingo_min',
    'extra_tests','reference_required','reference_notes',
    'hist_applicants','hist_offers','hist_offer_rate','hist_avg_grade','hist_data_year',
    'weight_academic','weight_language','weight_extra','notes','is_active'
  ];
  const sets = []; const vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f}=?`);
      const v = req.body[f];
      vals.push((f === 'grade_requirements' || f === 'extra_tests') && typeof v === 'object' ? JSON.stringify(v) : v);
    }
  }
  if (!sets.length) return res.status(400).json({ error: '无更新字段' });
  sets.push('updated_at=?'); vals.push(new Date().toISOString()); vals.push(req.params.id);
  db.run(`UPDATE uni_programs SET ${sets.join(',')} WHERE id=?`, vals);
  audit(req, 'UPDATE', 'uni_programs', req.params.id, req.body);
  res.json({ ok: true });
});

app.delete('/api/uni-programs/:id', requireRole('principal','counselor'), (req, res) => {
  db.run('UPDATE uni_programs SET is_active=0 WHERE id=?', [req.params.id]);
  audit(req, 'DELETE', 'uni_programs', req.params.id, null);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════
//  基准评估库 CRUD
// ════════════════════════════════════════════════════════
app.get('/api/eval-benchmarks', requireAuth, (req, res) => {
  const { country, tier, subject_area } = req.query;
  const where = ['is_active=1'];
  const params = [];
  if (country)      { where.push('country=?');      params.push(country); }
  if (tier)         { where.push('tier=?');          params.push(tier); }
  if (subject_area) { where.push('subject_area=?');  params.push(subject_area); }
  const rows = db.all(`SELECT * FROM eval_benchmarks WHERE ${where.join(' AND ')} ORDER BY country, tier, subject_area`, params);
  res.json(rows);
});

app.get('/api/eval-benchmarks/:id', requireAuth, (req, res) => {
  const bm = db.get('SELECT * FROM eval_benchmarks WHERE id=?', [req.params.id]);
  if (!bm) return res.status(404).json({ error: '基准不存在' });
  res.json(bm);
});

app.post('/api/eval-benchmarks', requireRole('principal','counselor'), (req, res) => {
  const { country, tier, subject_area, display_name, grade_requirements, grade_type,
          ielts_overall, toefl_overall, extra_tests, weight_academic, weight_language,
          weight_extra, benchmark_pass_rate, notes } = req.body;
  if (!country || !tier || !subject_area || !display_name) {
    return res.status(400).json({ error: 'country / tier / subject_area / display_name 必填' });
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  db.run(`INSERT INTO eval_benchmarks
    (id,country,tier,subject_area,display_name,grade_requirements,grade_type,ielts_overall,toefl_overall,extra_tests,weight_academic,weight_language,weight_extra,benchmark_pass_rate,notes,is_active,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`,
    [id, country, tier, subject_area, display_name,
     typeof grade_requirements==='object' ? JSON.stringify(grade_requirements) : (grade_requirements||null),
     grade_type||'A-Level', ielts_overall||null, toefl_overall||null,
     typeof extra_tests==='object' ? JSON.stringify(extra_tests) : (extra_tests||null),
     weight_academic||0.60, weight_language||0.25, weight_extra||0.15,
     benchmark_pass_rate||null, notes||null,
     req.session.user.id, now, now]);
  audit(req, 'CREATE', 'eval_benchmarks', id, { display_name });
  res.status(201).json({ id });
});

app.put('/api/eval-benchmarks/:id', requireRole('principal','counselor'), (req, res) => {
  const bm = db.get('SELECT id FROM eval_benchmarks WHERE id=?', [req.params.id]);
  if (!bm) return res.status(404).json({ error: '基准不存在' });
  const fields = ['country','tier','subject_area','display_name','grade_requirements','grade_type',
                  'ielts_overall','toefl_overall','extra_tests','weight_academic','weight_language',
                  'weight_extra','benchmark_pass_rate','notes','is_active'];
  const sets = []; const vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f}=?`);
      vals.push((f==='grade_requirements'||f==='extra_tests') && typeof req.body[f]==='object'
        ? JSON.stringify(req.body[f]) : req.body[f]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: '无可更新字段' });
  sets.push('updated_at=?'); vals.push(new Date().toISOString()); vals.push(req.params.id);
  db.run(`UPDATE eval_benchmarks SET ${sets.join(',')} WHERE id=?`, vals);
  audit(req, 'UPDATE', 'eval_benchmarks', req.params.id, req.body);
  res.json({ ok: true });
});

app.delete('/api/eval-benchmarks/:id', requireRole('principal','counselor'), (req, res) => {
  db.run('UPDATE eval_benchmarks SET is_active=0 WHERE id=?', [req.params.id]);
  audit(req, 'DELETE', 'eval_benchmarks', req.params.id, null);
  res.json({ ok: true });
});

// ── 学校历史录取数据 ──────────────────────────────────
app.post('/api/uni-programs/:id/history', requireRole('principal','counselor'), (req, res) => {
  const { student_id, cycle_year, offer_result, grade_profile, notes } = req.body;
  if (!cycle_year || !offer_result) return res.status(400).json({ error: '年份和结果必填' });
  const id = uuidv4();
  db.run(`INSERT INTO school_admission_history (id,program_id,student_id,cycle_year,offer_result,grade_profile,notes,created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [id, req.params.id, student_id||null, cycle_year, offer_result,
     typeof grade_profile === 'object' ? JSON.stringify(grade_profile) : (grade_profile||null),
     notes||null, new Date().toISOString()]);
  // 更新 uni_programs 的 hist_offer_rate
  const stats = db.get(`SELECT COUNT(*) as total, SUM(CASE WHEN offer_result='offer' THEN 1 ELSE 0 END) as offers FROM school_admission_history WHERE program_id=?`, [req.params.id]);
  if (stats.total > 0) {
    db.run('UPDATE uni_programs SET hist_applicants=?, hist_offers=?, hist_offer_rate=? WHERE id=?',
      [stats.total, stats.offers, Math.round(stats.offers/stats.total*100)/100, req.params.id]);
  }
  res.json({ id });
});

// ── 成绩等级转换工具 ──────────────────────────────────
function gradeToScore(grade, gradeType) {
  // A-Level / AS-Level
  const aLevelMap = { 'A*': 100, 'A': 90, 'B': 80, 'C': 70, 'D': 60, 'E': 50, 'U': 0 };
  // IB 分制 7-1
  const ibMap = { '7': 100, '6': 85, '5': 70, '4': 55, '3': 40, '2': 25, '1': 10 };
  // SAT/ACT/其他 直接按百分比
  const g = String(grade||'').trim().toUpperCase();
  if (!gradeType || gradeType.includes('A-Level')) return aLevelMap[g] ?? null;
  if (gradeType === 'IB') return ibMap[g] ?? (parseFloat(grade) ? parseFloat(grade)/7*100 : null);
  return null;
}

function gradeRank(grade, gradeType) {
  // 返回等级的序数（越低越好/越高越好取决于考试类型）
  const aLevelOrder = ['A*','A','B','C','D','E','U'];
  const g = String(grade||'').trim().toUpperCase();
  if (!gradeType || gradeType.includes('A-Level')) {
    const idx = aLevelOrder.indexOf(g);
    return idx === -1 ? 999 : idx; // 越小越好（A*=0是最好）
  }
  return null;
}

// ── 核心评估引擎 ──────────────────────────────────────
function runAdmissionEval(_student, program, examSittings, assessments) {
  const gradeReqs = (() => { try { return JSON.parse(program.grade_requirements||'[]'); } catch(e) { return []; } })();
  const extraTests = (() => { try { return JSON.parse(program.extra_tests||'[]'); } catch(e) { return []; } })();

  // 构建学生成绩映射: subject -> {predicted, actual}
  const studentGrades = {};
  for (const s of examSittings) {
    const key = (s.subject||'').toLowerCase().trim();
    if (!studentGrades[key]) studentGrades[key] = {};
    if (s.actual_grade) studentGrades[key].actual = s.actual_grade;
    if (s.predicted_grade) studentGrades[key].predicted = s.predicted_grade;
  }

  // 构建学生测试成绩映射: assess_type -> score
  const studentTests = {};
  for (const a of assessments) {
    const key = (a.assess_type||'').toLowerCase().trim();
    if (!studentTests[key] || studentTests[key] < a.score) {
      studentTests[key] = a.score; // 取最高分
    }
  }

  // ── 1. 硬门槛检查 ──────────────────────────────────
  const hardFails = [];

  // 必修科目检查
  const requiredSubjects = gradeReqs.filter(r => r.required);
  for (const req of requiredSubjects) {
    const key = (req.subject||'').toLowerCase().trim();
    const sg = studentGrades[key];
    const bestGrade = sg?.actual || sg?.predicted;
    if (!bestGrade) {
      hardFails.push({ type: 'missing_subject', subject: req.subject, required: req.min_grade, message: `缺少必修科目: ${req.subject}` });
    } else {
      const studentRank = gradeRank(bestGrade, program.grade_type);
      const reqRank = gradeRank(req.min_grade, program.grade_type);
      if (studentRank !== null && reqRank !== null && studentRank > reqRank) {
        hardFails.push({ type: 'grade_below_threshold', subject: req.subject, current: bestGrade, required: req.min_grade, message: `${req.subject}: 当前${bestGrade} < 要求${req.min_grade}` });
      }
    }
  }

  // 语言硬门槛检查
  if (program.ielts_overall) {
    const ieltsScore = studentTests['雅思 ielts'] || studentTests['ielts'];
    if (ieltsScore && ieltsScore < program.ielts_overall) {
      hardFails.push({ type: 'language_below_threshold', test: 'IELTS', current: ieltsScore, required: program.ielts_overall, message: `IELTS: 当前${ieltsScore} < 要求${program.ielts_overall}` });
    }
  }
  if (program.toefl_overall) {
    const toeflScore = studentTests['托福 toefl'] || studentTests['toefl'];
    if (toeflScore && toeflScore < program.toefl_overall) {
      hardFails.push({ type: 'language_below_threshold', test: 'TOEFL', current: toeflScore, required: program.toefl_overall, message: `TOEFL: 当前${toeflScore} < 要求${program.toefl_overall}` });
    }
  }

  const hardPass = hardFails.length === 0;

  // ── 2. 学术评分 (0-100) ────────────────────────────
  let academicScore = 0;
  let academicGaps = [];
  if (gradeReqs.length > 0) {
    let totalWeight = 0; let weightedScore = 0;
    for (const req of gradeReqs) {
      const key = (req.subject||'').toLowerCase().trim();
      const sg = studentGrades[key];
      const bestGrade = sg?.actual || sg?.predicted;
      const reqScore = gradeToScore(req.min_grade, program.grade_type) || 0;
      const stuScore = bestGrade ? (gradeToScore(bestGrade, program.grade_type) || 0) : 0;
      const weight = req.required ? 2 : 1;
      totalWeight += weight;
      weightedScore += Math.min(stuScore, 100) * weight;

      if (reqScore > 0 || !bestGrade) {
        const gap = stuScore - reqScore;
        const closable = !bestGrade && (sg?.predicted) ? true : gap >= -15;
        academicGaps.push({
          dimension: 'academic', subject: req.subject, required: req.min_grade,
          current: bestGrade || '未知', gap: Math.round(gap), closable,
          message: !bestGrade ? `${req.subject} 无成绩记录` :
            gap >= 0 ? `${req.subject} 达标 (${bestGrade})` : `${req.subject} 差距 ${Math.abs(gap)}分 (${bestGrade} vs ${req.min_grade})`
        });
      }
    }
    academicScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
  } else {
    academicScore = 60; // 无要求时给中等分
  }

  // ── 3. 语言评分 (0-100) ────────────────────────────
  let languageScore = 100;
  let languageGaps = [];
  if (program.ielts_overall) {
    const ieltsScore = studentTests['雅思 ielts'] || studentTests['ielts'];
    if (ieltsScore) {
      const pct = Math.min(ieltsScore / program.ielts_overall * 100, 110);
      languageScore = Math.min(Math.round(pct), 100);
      languageGaps.push({
        dimension: 'language', test: 'IELTS',
        current: ieltsScore, required: program.ielts_overall,
        gap: Math.round((ieltsScore - program.ielts_overall) * 10) / 10,
        closable: ieltsScore >= program.ielts_overall - 0.5,
        message: ieltsScore >= program.ielts_overall ? `IELTS 达标 (${ieltsScore})` : `IELTS 差 ${(program.ielts_overall - ieltsScore).toFixed(1)} 分`
      });
    } else {
      languageScore = 40; // 有要求但无成绩
      languageGaps.push({ dimension: 'language', test: 'IELTS', current: null, required: program.ielts_overall, gap: null, closable: true, message: `IELTS 要求 ${program.ielts_overall}，尚无成绩` });
    }
  } else if (program.toefl_overall && parseFloat(program.toefl_overall) > 0) {
    const toeflScore = studentTests['托福 toefl'] || studentTests['toefl'];
    if (toeflScore) {
      languageScore = Math.min(Math.round(toeflScore / parseFloat(program.toefl_overall) * 100), 100);
      languageGaps.push({ dimension: 'language', test: 'TOEFL', current: toeflScore, required: program.toefl_overall, gap: toeflScore - program.toefl_overall, closable: toeflScore >= program.toefl_overall - 5, message: toeflScore >= program.toefl_overall ? `TOEFL 达标 (${toeflScore})` : `TOEFL 差 ${program.toefl_overall - toeflScore} 分` });
    } else {
      languageScore = 40;
      languageGaps.push({ dimension: 'language', test: 'TOEFL', current: null, required: program.toefl_overall, gap: null, closable: true, message: `TOEFL 要求 ${program.toefl_overall}，尚无成绩` });
    }
  } else {
    languageScore = 75; // 无语言要求给基础分
  }

  // ── 4. 额外测试评分 (0-100) ───────────────────────
  let extraScore = 100;
  let extraGaps = [];
  if (extraTests.length > 0) {
    let passed = 0;
    for (const et of extraTests) {
      const key = (et.test||'').toLowerCase().trim();
      const stuScore = studentTests[key];
      if (et.required) {
        if (!stuScore) {
          extraGaps.push({ dimension: 'extra', test: et.test, current: null, required: et.min_score, gap: null, closable: true, message: `${et.test} 要求，尚无成绩` });
        } else if (et.min_score && stuScore < et.min_score) {
          extraGaps.push({ dimension: 'extra', test: et.test, current: stuScore, required: et.min_score, gap: stuScore - et.min_score, closable: false, message: `${et.test}: ${stuScore} < 要求${et.min_score}` });
          passed--;
        } else {
          extraGaps.push({ dimension: 'extra', test: et.test, current: stuScore, required: et.min_score, gap: stuScore - (et.min_score||0), closable: true, message: `${et.test} 达标 (${stuScore})` });
          passed++;
        }
      }
    }
    const requiredCount = extraTests.filter(e => e.required).length;
    extraScore = requiredCount > 0 ? Math.round(Math.max(0, (passed + requiredCount) / (requiredCount * 2)) * 100) : 80;
  } else {
    extraScore = 80; // 无额外测试给基础分
  }

  // ── 5. 综合评分 ────────────────────────────────────
  const wa = parseFloat(program.weight_academic) || 0.6;
  const wl = parseFloat(program.weight_language) || 0.25;
  const we = parseFloat(program.weight_extra) || 0.15;
  const totalScore = Math.round(academicScore * wa + languageScore * wl + extraScore * we);

  // ── 6. 概率区间估算 ────────────────────────────────
  let probLow, probMid, probHigh, confidence, confidenceNote;
  const histRate = program.hist_offer_rate;
  const histTotal = program.hist_applicants || 0;

  // 信心度依据：历史数据量
  if (histTotal >= 20) { confidence = 'high'; }
  else if (histTotal >= 5) { confidence = 'medium'; }
  else { confidence = 'low'; }

  // 基础概率（保守先验：30%）
  const priorRate = 0.30;
  const observedRate = histRate != null ? parseFloat(histRate) : priorRate;

  // 贝叶斯混合（历史数据越多权重越大）
  const histWeight = Math.min(histTotal / 30, 1.0);
  const baseProbability = observedRate * histWeight + priorRate * (1 - histWeight);

  // 根据评分调整倍数（0.5-2.0）
  const scoreFactor = totalScore >= 90 ? 1.8 : totalScore >= 75 ? 1.4 : totalScore >= 60 ? 1.0 : totalScore >= 45 ? 0.7 : 0.4;
  const hardPenalty = hardPass ? 1.0 : 0.2; // 未过硬门槛大幅降低概率

  probMid = Math.min(Math.round(baseProbability * scoreFactor * hardPenalty * 100), 98);
  probLow = Math.max(Math.round(probMid * 0.6), hardPass ? 2 : 0);
  probHigh = Math.min(Math.round(probMid * 1.5), 98);
  // 保证单调性：low ≤ mid ≤ high
  probLow = Math.min(probLow, probMid);
  probHigh = Math.max(probHigh, probMid);

  if (!hardPass) {
    confidenceNote = '未通过硬门槛，概率大幅降低。须先满足必备条件。';
  } else if (confidence === 'low') {
    confidenceNote = '历史数据不足（<5条记录），概率区间参考价值有限，以保守先验为主。';
  } else if (confidence === 'medium') {
    confidenceNote = `基于 ${histTotal} 条历史记录估算，置信度中等。`;
  } else {
    confidenceNote = `基于 ${histTotal} 条历史记录，置信度较高，但不构成录取承诺。`;
  }

  const gaps = [...academicGaps, ...languageGaps, ...extraGaps];

  return {
    hard_pass: hardPass ? 1 : 0,
    hard_fails: JSON.stringify(hardFails),
    score_academic: academicScore,
    score_language: languageScore,
    score_extra: extraScore,
    score_total: totalScore,
    gaps: JSON.stringify(gaps),
    prob_low: probLow,
    prob_mid: probMid,
    prob_high: probHigh,
    confidence,
    confidence_note: confidenceNote,
    grade_snapshot: JSON.stringify({ studentGrades, studentTests })
  };
}

// ── 对单个学生运行评估 ────────────────────────────────
app.post('/api/students/:id/admission-eval', requireAuth, (req, res) => {
  const u = req.session.user; const sid = req.params.id;
  // 学生只能对自己运行评估；家长不可运行；staff角色均可
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权操作他人评估' });
  if (u.role === 'parent') return res.status(403).json({ error: '家长账户无权运行评估' });
  const student = db.get('SELECT * FROM students WHERE id=?', [sid]);
  if (!student) return res.status(404).json({ error: '学生不存在' });

  const { program_id, notes } = req.body;
  if (!program_id) return res.status(400).json({ error: 'program_id 必填' });

  const program = db.get('SELECT * FROM uni_programs WHERE id=? AND is_active=1', [program_id]);
  if (!program) return res.status(404).json({ error: '专业不存在' });

  const examSittings = db.all('SELECT * FROM exam_sittings WHERE student_id=?', [req.params.id]);
  const assessments  = db.all('SELECT * FROM admission_assessments WHERE student_id=?', [req.params.id]);

  const evalResult = runAdmissionEval(student, program, examSittings, assessments);

  const evalId = uuidv4();
  db.run(`INSERT INTO admission_evaluations
    (id,student_id,program_id,eval_date,hard_pass,hard_fails,score_academic,score_language,score_extra,score_total,gaps,prob_low,prob_mid,prob_high,confidence,confidence_note,grade_snapshot,notes,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [evalId, req.params.id, program_id, new Date().toISOString(),
     evalResult.hard_pass, evalResult.hard_fails,
     evalResult.score_academic, evalResult.score_language, evalResult.score_extra, evalResult.score_total,
     evalResult.gaps, evalResult.prob_low, evalResult.prob_mid, evalResult.prob_high,
     evalResult.confidence, evalResult.confidence_note, evalResult.grade_snapshot,
     notes||null, req.session.user.id, new Date().toISOString()
    ]);
  audit(req, 'CREATE', 'admission_evaluations', evalId, { student: student.name, program: program.program_name });

  const full = db.get('SELECT * FROM admission_evaluations WHERE id=?', [evalId]);
  res.json({ ...full, program });
});

// ── 获取学生所有评估记录 ───────────────────────────────
app.get('/api/students/:id/admission-evals', requireAuth, (req, res) => {
  const u = req.session.user; const sid = req.params.id;
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent') {
    const sp = db.get('SELECT id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  const evals = db.all(`
    SELECT ae.*, up.uni_name, up.program_name, up.department, up.country, up.route
    FROM admission_evaluations ae
    JOIN uni_programs up ON up.id = ae.program_id
    WHERE ae.student_id=?
    ORDER BY ae.created_at DESC`, [sid]);
  res.json(evals);
});

// ── 获取单条评估详情 ──────────────────────────────────
app.get('/api/admission-evals/:id', requireAuth, (req, res) => {
  const ev = db.get(`
    SELECT ae.*, up.uni_name, up.program_name, up.department, up.country, up.route,
           up.grade_requirements, up.extra_tests, up.ielts_overall, up.toefl_overall,
           up.hist_offer_rate, up.hist_applicants, up.app_deadline
    FROM admission_evaluations ae
    JOIN uni_programs up ON up.id = ae.program_id
    WHERE ae.id=?`, [req.params.id]);
  if (!ev) return res.status(404).json({ error: '评估不存在' });
  const u = req.session.user;
  if (u.role === 'student' && u.linked_id !== ev.student_id) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent') {
    const sp = db.get('SELECT 1 FROM student_parents WHERE student_id=? AND parent_id=?', [ev.student_id, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  res.json(ev);
});

// ── 删除评估记录 ──────────────────────────────────────
app.delete('/api/admission-evals/:id', requireRole('principal','counselor'), (req, res) => {
  const ev = db.get('SELECT * FROM admission_evaluations WHERE id=?', [req.params.id]);
  if (!ev) return res.status(404).json({ error: '评估不存在' });
  db.run('DELETE FROM admission_evaluations WHERE id=?', [req.params.id]);
  audit(req, 'DELETE', 'admission_evaluations', req.params.id, {});
  res.json({ success: true });
});

// ── AI 接口限流工具 ───────────────────────────────────
function checkAiRateLimit(req, res) {
  const userId = req.session.user.id;
  const now = Date.now();
  const ar = aiCallAttempts.get(userId) || { count: 0, resetAt: now + AI_CALL_WINDOW_MS };
  if (now > ar.resetAt) { ar.count = 0; ar.resetAt = now + AI_CALL_WINDOW_MS; }
  if (ar.count >= AI_CALL_MAX) {
    res.status(429).json({ error: `AI 调用次数已达上限（每小时 ${AI_CALL_MAX} 次），请稍后重试` });
    return false;
  }
  ar.count++;
  aiCallAttempts.set(userId, ar);
  return true;
}

// ── AI 增强评估 ───────────────────────────────────────
app.post('/api/admission-evals/:id/ai-enhance', requireRole('principal','counselor'), async (req, res) => {
  if (!aiEval) return res.status(503).json({ error: 'AI 评估模块未加载，请检查服务器配置' });
  if (!checkAiRateLimit(req, res)) return;
  try {
    const ev = db.get('SELECT ae.*, up.uni_name, up.program_name, up.department, up.country, up.route, up.grade_type, up.grade_requirements, up.extra_tests, up.ielts_overall, up.toefl_overall, up.hist_offer_rate, up.hist_applicants FROM admission_evaluations ae JOIN uni_programs up ON up.id=ae.program_id WHERE ae.id=?', [req.params.id]);
    if (!ev) return res.status(404).json({ error: '评估记录不存在' });

    const student     = db.get('SELECT * FROM students WHERE id=?', [ev.student_id]);
    const examSittings = db.all('SELECT * FROM exam_sittings WHERE student_id=?', [ev.student_id]);
    const assessments  = db.all('SELECT * FROM admission_assessments WHERE student_id=?', [ev.student_id]);

    const aiResult = await aiEval.enhanceEval(ev, student, ev /* program fields on ev */, examSittings, assessments);

    // Persist AI result to the eval record
    db.run('UPDATE admission_evaluations SET ai_result=? WHERE id=?', [JSON.stringify(aiResult), req.params.id]);
    audit(req, 'AI_ENHANCE', 'admission_evaluations', req.params.id, { uni: ev.uni_name, program: ev.program_name });

    res.json(aiResult);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════
//  基准评估 — 学生评估端点
// ════════════════════════════════════════════════════════
app.post('/api/students/:id/benchmark-eval', requireAuth, (req, res) => {
  const u = req.session.user; const sid = req.params.id;
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权操作他人评估' });
  if (u.role === 'parent') return res.status(403).json({ error: '家长账户无权运行评估' });
  const student = db.get('SELECT * FROM students WHERE id=?', [sid]);
  if (!student) return res.status(404).json({ error: '学生不存在' });
  const { benchmark_id, notes } = req.body;
  if (!benchmark_id) return res.status(400).json({ error: 'benchmark_id 必填' });
  const bm = db.get('SELECT * FROM eval_benchmarks WHERE id=? AND is_active=1', [benchmark_id]);
  if (!bm) return res.status(404).json({ error: '基准不存在' });

  const examSittings = db.all('SELECT * FROM exam_sittings WHERE student_id=?', [req.params.id]);
  const assessments  = db.all('SELECT * FROM admission_assessments WHERE student_id=?', [req.params.id]);

  // 适配为 runAdmissionEval 期望的 program-like 对象
  const programLike = {
    grade_requirements: bm.grade_requirements,
    grade_type:         bm.grade_type || 'A-Level',
    ielts_overall:      bm.ielts_overall,
    toefl_overall:      bm.toefl_overall,
    extra_tests:        bm.extra_tests,
    weight_academic:    bm.weight_academic || 0.60,
    weight_language:    bm.weight_language || 0.25,
    weight_extra:       bm.weight_extra   || 0.15,
    hist_offer_rate:    bm.benchmark_pass_rate,
    hist_applicants:    null,
  };
  const evalResult = runAdmissionEval(student, programLike, examSittings, assessments);

  const evalId = uuidv4();
  const now = new Date().toISOString();
  db.run(`INSERT INTO benchmark_evaluations
    (id,student_id,benchmark_id,eval_date,hard_pass,hard_fails,score_academic,score_language,score_extra,score_total,gaps,prob_low,prob_mid,prob_high,confidence,confidence_note,grade_snapshot,notes,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [evalId, req.params.id, benchmark_id, now,
     evalResult.hard_pass, evalResult.hard_fails,
     evalResult.score_academic, evalResult.score_language, evalResult.score_extra, evalResult.score_total,
     evalResult.gaps, evalResult.prob_low, evalResult.prob_mid, evalResult.prob_high,
     evalResult.confidence, evalResult.confidence_note, evalResult.grade_snapshot,
     notes||null, req.session.user.id, now]);
  audit(req, 'CREATE', 'benchmark_evaluations', evalId, { student: student.name, benchmark: bm.display_name });

  const full = db.get(`SELECT be.*, eb.country, eb.tier, eb.subject_area, eb.display_name, eb.benchmark_pass_rate
    FROM benchmark_evaluations be JOIN eval_benchmarks eb ON eb.id=be.benchmark_id WHERE be.id=?`, [evalId]);
  res.status(201).json(full);
});

app.get('/api/students/:id/benchmark-evals', requireAuth, (req, res) => {
  const u = req.session.user; const sid = req.params.id;
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
  if (u.role === 'parent') {
    const sp = db.get('SELECT id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  const rows = db.all(`SELECT be.*, eb.country, eb.tier, eb.subject_area, eb.display_name, eb.benchmark_pass_rate, eb.grade_requirements, eb.ielts_overall
    FROM benchmark_evaluations be JOIN eval_benchmarks eb ON eb.id=be.benchmark_id
    WHERE be.student_id=? ORDER BY be.created_at DESC`, [sid]);
  res.json(rows);
});

app.get('/api/benchmark-evals/:id', requireAuth, (req, res) => {
  const ev = db.get(`SELECT be.*, eb.country, eb.tier, eb.subject_area, eb.display_name,
    eb.benchmark_pass_rate, eb.grade_requirements, eb.extra_tests, eb.ielts_overall, eb.toefl_overall,
    eb.weight_academic, eb.weight_language, eb.weight_extra, eb.grade_type, eb.notes as benchmark_notes
    FROM benchmark_evaluations be JOIN eval_benchmarks eb ON eb.id=be.benchmark_id WHERE be.id=?`, [req.params.id]);
  if (!ev) return res.status(404).json({ error: '评估不存在' });
  res.json(ev);
});

app.delete('/api/benchmark-evals/:id', requireRole('principal','counselor'), (req, res) => {
  const ev = db.get('SELECT * FROM benchmark_evaluations WHERE id=?', [req.params.id]);
  if (!ev) return res.status(404).json({ error: '评估不存在' });
  db.run('DELETE FROM benchmark_evaluations WHERE id=?', [req.params.id]);
  audit(req, 'DELETE', 'benchmark_evaluations', req.params.id, {});
  res.json({ ok: true });
});

app.post('/api/benchmark-evals/:id/ai-enhance', requireRole('principal','counselor'), async (req, res) => {
  if (!aiEval) return res.status(503).json({ error: 'AI 评估模块未加载，请检查服务器配置' });
  if (!checkAiRateLimit(req, res)) return;
  try {
    const ev = db.get(`SELECT be.*, eb.country, eb.tier, eb.subject_area, eb.display_name,
      eb.benchmark_pass_rate, eb.grade_requirements, eb.extra_tests, eb.ielts_overall, eb.toefl_overall,
      eb.weight_academic, eb.weight_language, eb.weight_extra, eb.grade_type
      FROM benchmark_evaluations be JOIN eval_benchmarks eb ON eb.id=be.benchmark_id WHERE be.id=?`, [req.params.id]);
    if (!ev) return res.status(404).json({ error: '评估不存在' });

    const student      = db.get('SELECT * FROM students WHERE id=?', [ev.student_id]);
    const examSittings = db.all('SELECT * FROM exam_sittings WHERE student_id=?', [ev.student_id]);
    const assessments  = db.all('SELECT * FROM admission_assessments WHERE student_id=?', [ev.student_id]);

    // Shape ev as both eval record and "program" for the AI enhancer
    const programProxy = {
      uni_name: ev.display_name,
      program_name: `${ev.subject_area} (${ev.tier} 基准)`,
      country: ev.country,
      route: ev.country,
      grade_type: ev.grade_type,
      grade_requirements: ev.grade_requirements,
      extra_tests: ev.extra_tests,
      ielts_overall: ev.ielts_overall,
      toefl_overall: ev.toefl_overall,
      hist_offer_rate: ev.benchmark_pass_rate,
      hist_applicants: null,
    };
    const aiResult = await aiEval.enhanceEval(ev, student, programProxy, examSittings, assessments);
    db.run('UPDATE benchmark_evaluations SET ai_result=? WHERE id=?', [JSON.stringify(aiResult), req.params.id]);
    audit(req, 'AI_ENHANCE', 'benchmark_evaluations', req.params.id, { benchmark: ev.display_name });
    res.json(aiResult);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 批量评估：学生 vs 所有候选专业 ─────────────────────
app.post('/api/students/:id/admission-eval/batch', requireRole('principal','counselor'), (req, res) => {
  const student = db.get('SELECT * FROM students WHERE id=?', [req.params.id]);
  if (!student) return res.status(404).json({ error: '学生不存在' });

  const { program_ids } = req.body;
  if (!Array.isArray(program_ids) || program_ids.length === 0) return res.status(400).json({ error: 'program_ids 必填' });
  if (program_ids.length > 50) return res.status(400).json({ error: 'program_ids 最多一次提交 50 个' });

  const examSittings = db.all('SELECT * FROM exam_sittings WHERE student_id=?', [req.params.id]);
  const assessments  = db.all('SELECT * FROM admission_assessments WHERE student_id=?', [req.params.id]);

  const today = new Date().toISOString().slice(0, 10);
  const results = [];
  const evalsToInsert = [];
  for (const programId of program_ids) {
    const program = db.get('SELECT * FROM uni_programs WHERE id=? AND is_active=1', [programId]);
    if (!program) continue;
    // Skip if same-day eval already exists for this student+program
    const existing = db.get(
      `SELECT id FROM admission_evaluations WHERE student_id=? AND program_id=? AND substr(eval_date,1,10)=?`,
      [req.params.id, programId, today]);
    if (existing) { results.push({ skipped: true, programId, existingId: existing.id }); continue; }
    const evalResult = runAdmissionEval(student, program, examSittings, assessments);
    const evalId = uuidv4();
    evalsToInsert.push({ evalId, programId, program, evalResult });
  }
  db.transaction(runInTx => {
    const now = new Date().toISOString();
    for (const { evalId, programId, program, evalResult } of evalsToInsert) {
      runInTx(`INSERT INTO admission_evaluations
        (id,student_id,program_id,eval_date,hard_pass,hard_fails,score_academic,score_language,score_extra,score_total,gaps,prob_low,prob_mid,prob_high,confidence,confidence_note,grade_snapshot,created_by,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [evalId, req.params.id, programId, now,
         evalResult.hard_pass, evalResult.hard_fails,
         evalResult.score_academic, evalResult.score_language, evalResult.score_extra, evalResult.score_total,
         evalResult.gaps, evalResult.prob_low, evalResult.prob_mid, evalResult.prob_high,
         evalResult.confidence, evalResult.confidence_note, evalResult.grade_snapshot,
         req.session.user.id, now]);
      results.push({ evalId, programId, uni_name: program.uni_name, program_name: program.program_name, ...evalResult });
    }
  });

  audit(req, 'BATCH_EVAL', 'admission_evaluations', req.params.id, { count: results.length });
  res.json({ count: results.length, results });
});

// ═══════════════════════════════════════════════════════
//  AI 规划（AI Student Planning）
// ═══════════════════════════════════════════════════════

// POST /api/students/:id/ai-plan/generate  — 生成 AI 规划草稿
app.post('/api/students/:id/ai-plan/generate', requireRole('principal','counselor'), async (req, res) => {
  if (!aiPlanner) return res.status(503).json({ error: 'AI 规划模块未加载，请检查服务器配置' });
  if (!checkAiRateLimit(req, res)) return;
  const student = db.get('SELECT * FROM students WHERE id=?', [req.params.id]);
  if (!student) return res.status(404).json({ error: '学生不存在' });
  const { route_focus, constraints } = req.body;
  try {
    const result = await aiPlanner.generatePlan(db, req.params.id, req.session.user.id, { route_focus, constraints });
    audit(req, 'GENERATE', 'ai_student_plans', result.plan_id, { student: student.name, model: result.plan?.meta?.schema_version });
    res.json({ plan_id: result.plan_id, status: result.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/students/:id/ai-plan  — 获取最新规划（根据角色过滤内容）
app.get('/api/students/:id/ai-plan', requireAuth, (req, res) => {
  const u = req.session.user;
  const sid = req.params.id;
  // Student can only access own plan
  if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
  // Parent can only access linked student's plan
  if (u.role === 'parent') {
    const sp = db.get('SELECT id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
    if (!sp) return res.status(403).json({ error: '无权访问' });
  }
  const role = u.role;
  // Parents/students only see published plans
  const restrictToPublished = (role === 'parent' || role === 'student');
  const plan = restrictToPublished
    ? db.get(`SELECT * FROM ai_student_plans WHERE student_id=? AND status=? ORDER BY created_at DESC LIMIT 1`, [sid, 'published'])
    : db.get(`SELECT * FROM ai_student_plans WHERE student_id=? ORDER BY created_at DESC LIMIT 1`, [sid]);
  if (!plan) return res.json(null);
  if (restrictToPublished) {
    // Return only parent-safe fields
    const p = JSON.parse(plan.plan_json || '{}');
    return res.json({ id: plan.id, status: plan.status, published_at: plan.published_at, parent_view: p.parent_view, risk: p.risk });
  }
  res.json(plan);
});

// GET /api/students/:id/ai-plans  — 所有规划版本列表
app.get('/api/students/:id/ai-plans', requireRole('principal','counselor'), (req, res) => {
  const plans = db.all(
    `SELECT id, status, model, prompt_version, created_by, approved_by, approved_at, published_at, created_at, updated_at
     FROM ai_student_plans WHERE student_id=? ORDER BY created_at DESC`, [req.params.id]
  );
  res.json(plans);
});

// GET /api/ai-plans/:id  — 获取单条规划完整内容
app.get('/api/ai-plans/:id', requireRole('principal','counselor'), (req, res) => {
  const plan = db.get('SELECT * FROM ai_student_plans WHERE id=?', [req.params.id]);
  if (!plan) return res.status(404).json({ error: '规划不存在' });
  res.json(plan);
});

// PUT /api/ai-plans/:id/approve  — 批准规划
app.put('/api/ai-plans/:id/approve', requireRole('principal','counselor'), (req, res) => {
  const plan = db.get('SELECT * FROM ai_student_plans WHERE id=?', [req.params.id]);
  if (!plan) return res.status(404).json({ error: '规划不存在' });
  if (plan.status !== 'draft') return res.status(400).json({ error: '只能批准草稿状态的规划' });
  const now = new Date().toISOString();
  db.run(`UPDATE ai_student_plans SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?`,
    [req.session.user.id, now, now, req.params.id]);
  audit(req, 'APPROVE', 'ai_student_plans', req.params.id, {});
  res.json({ ok: true, status: 'approved' });
});

// POST /api/ai-plans/:id/apply  — 将 auto_fill 写入系统表
app.post('/api/ai-plans/:id/apply', requireRole('principal','counselor'), (req, res) => {
  if (!aiPlanner) return res.status(503).json({ error: 'AI 规划模块未加载，请检查服务器配置' });
  const plan = db.get('SELECT * FROM ai_student_plans WHERE id=?', [req.params.id]);
  if (!plan) return res.status(404).json({ error: '规划不存在' });
  if (!['approved','published'].includes(plan.status)) return res.status(400).json({ error: '请先批准规划再应用' });
  const planData = JSON.parse(plan.plan_json || '{}');
  // Allow partial apply via req.body.selected_sections (array: targets/template_applications/custom_tasks/draft_applications)
  const selected = req.body.selected_sections;
  const autoFill = {};
  const ALL = ['targets','template_applications','custom_tasks','draft_applications'];
  for (const k of ALL) {
    autoFill[k] = (!selected || selected.includes(k)) ? (planData.auto_fill?.[k] || []) : [];
  }
  try {
    const counts = aiPlanner.applyPlanActions(db, req.params.id, plan.student_id, req.session.user.id, autoFill);
    audit(req, 'APPLY', 'ai_student_plans', req.params.id, { counts });
    res.json({ ok: true, counts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/ai-plans/:id/publish  — 发布给家长/学生
app.put('/api/ai-plans/:id/publish', requireRole('principal','counselor'), (req, res) => {
  const plan = db.get('SELECT * FROM ai_student_plans WHERE id=?', [req.params.id]);
  if (!plan) return res.status(404).json({ error: '规划不存在' });
  if (plan.status === 'published') return res.status(400).json({ error: '已发布' });
  const now = new Date().toISOString();
  db.run(`UPDATE ai_student_plans SET status='published', published_at=?, updated_at=? WHERE id=?`, [now, now, req.params.id]);
  audit(req, 'PUBLISH', 'ai_student_plans', req.params.id, {});
  res.json({ ok: true, status: 'published', published_at: now });
});

// PUT /api/ai-plans/:id/archive  — 存档
app.put('/api/ai-plans/:id/archive', requireRole('principal','counselor'), (req, res) => {
  const plan = db.get('SELECT * FROM ai_student_plans WHERE id=?', [req.params.id]);
  if (!plan) return res.status(404).json({ error: '规划不存在' });
  const now = new Date().toISOString();
  db.run(`UPDATE ai_student_plans SET status='archived', updated_at=? WHERE id=?`, [now, req.params.id]);
  audit(req, 'ARCHIVE', 'ai_student_plans', req.params.id, {});
  res.json({ ok: true, status: 'archived' });
});

// ═══════════════════════════════════════════════════════
//  USERS (密码修改)
// ═══════════════════════════════════════════════════════

app.put('/api/auth/password', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const now = Date.now();
  // Rate limit: max PWD_CHANGE_MAX failed attempts per user per 15 min
  const pr = pwdChangeAttempts.get(userId) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (now > pr.resetAt) { pr.count = 0; pr.resetAt = now + LOGIN_WINDOW_MS; }
  if (pr.count >= PWD_CHANGE_MAX) {
    return res.status(429).json({ error: `密码修改失败次数过多，请 ${Math.ceil((pr.resetAt - now) / 60000)} 分钟后重试` });
  }
  const { old_password, new_password } = req.body;
  if (!new_password || new_password.length < 6 || new_password.length > 128) {
    return res.status(400).json({ error: '新密码长度须在 6-128 位之间' });
  }
  const user = db.get('SELECT * FROM users WHERE id=?', [userId]);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (!bcrypt.compareSync(old_password, user.password)) {
    pr.count++;
    pwdChangeAttempts.set(userId, pr);
    return res.status(400).json({ error: `原密码错误（剩余尝试次数：${PWD_CHANGE_MAX - pr.count}）` });
  }
  pwdChangeAttempts.delete(userId);
  db.run('UPDATE users SET password=?,must_change_password=0 WHERE id=?', [bcrypt.hashSync(new_password, BCRYPT_COST), user.id]);
  // Invalidate current session after password change for security
  req.session.destroy(() => {});
  res.json({ ok: true, message: '密码已修改，请重新登录' });
});

// ═══════════════════════════════════════════════════════
//  INTAKE CASES
// ═══════════════════════════════════════════════════════

app.post('/api/intake-cases', requireRole('principal','intake_staff'), (req, res) => {
  const { student_name, intake_year, program_name, case_owner_staff_id, referral_id, notes } = req.body;
  if (!student_name || !intake_year || !program_name) return res.status(400).json({ error: '缺少必填字段: student_name, intake_year, program_name' });
  // R15: 后端 intake_year 范围校验
  const year = parseInt(intake_year);
  if (isNaN(year) || year < 2000 || year > 2100) return res.status(400).json({ error: '入学年份无效（须在 2000-2100 之间）' });
  const id = uuidv4();
  const vcId = uuidv4();
  const arId = uuidv4();
  try {
    db.transaction((runInTx) => {
      runInTx(`INSERT INTO intake_cases (id,student_id,student_name,intake_year,program_name,status,case_owner_staff_id,referral_id,notes) VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, null, student_name.trim(), intake_year, program_name, 'registered', case_owner_staff_id||null, referral_id||null, notes||null]);
      runInTx(`INSERT INTO visa_cases (id,case_id,status) VALUES (?,?,?)`, [vcId, id, 'not_started']);
      runInTx(`INSERT INTO arrival_records (id,case_id) VALUES (?,?)`, [arId, id]);
    });
  } catch(e) {
    return res.status(500).json({ error: '创建案例失败: ' + e.message });
  }
  audit(req, 'CREATE', 'intake_cases', id, { student_name, intake_year, program_name });
  res.json({ id, student_name, intake_year, program_name, status: 'registered', visa_case_id: vcId });
});

app.get('/api/intake-cases', requireAdmissionModule, (req, res) => {
  const { status, owner, student_id, year } = req.query;
  let where = ['1=1'];
  let params = [];
  if (status) { where.push('ic.status=?'); params.push(status); }
  if (owner) { where.push('ic.case_owner_staff_id=?'); params.push(owner); }
  if (student_id) { where.push('ic.student_id=?'); params.push(student_id); }
  if (year) { where.push('ic.intake_year=?'); params.push(year); }
  // 学管老师（student_admin）只负责到校之后的阶段，仅返回 arrived/oriented/closed 案例
  if (req.session.user.role === 'student_admin') {
    where.push("ic.status IN ('arrived','oriented','closed')");
  }
  const isPrincipal = req.session.user.role === 'principal';
  // principal 可查看代理字段，其他角色的查询不关联代理表
  const cases = isPrincipal
    ? db.all(`
        SELECT ic.*, ic.student_name, ic.review_status, ic.adm_profile_id,
          st.name as owner_name,
          vc.status as visa_status, vc.ipa_expiry_date,
          fi.amount_total as invoice_amount, fi.status as invoice_status,
          (SELECT SUM(fp.paid_amount) FROM finance_payments fp JOIN finance_invoices fi2 ON fi2.id=fp.invoice_id WHERE fi2.case_id=ic.id AND fp.reconciled=1) as paid_amount,
          r.source_type as referral_type,
          a.name as agent_name,
          a.id as agent_id
        FROM intake_cases ic
        LEFT JOIN staff st ON st.id=ic.case_owner_staff_id
        LEFT JOIN visa_cases vc ON vc.case_id=ic.id
        LEFT JOIN finance_invoices fi ON fi.case_id=ic.id AND fi.status != 'void'
        LEFT JOIN referrals r ON r.id=ic.referral_id
        LEFT JOIN agents a ON a.id=r.agent_id
        WHERE ${where.join(' AND ')}
        ORDER BY ic.created_at DESC, ic.rowid DESC
      `, params)
    : db.all(`
        SELECT ic.id, ic.student_name, ic.intake_year, ic.program_name, ic.status,
          ic.review_status, ic.adm_profile_id,
          ic.case_owner_staff_id, ic.offer_issued_at, ic.contract_signed_at,
          ic.contract_signed_by, ic.notes, ic.created_at, ic.updated_at,
          st.name as owner_name,
          vc.status as visa_status, vc.ipa_expiry_date,
          fi.amount_total as invoice_amount, fi.status as invoice_status,
          (SELECT SUM(fp.paid_amount) FROM finance_payments fp JOIN finance_invoices fi2 ON fi2.id=fp.invoice_id WHERE fi2.case_id=ic.id AND fp.reconciled=1) as paid_amount
        FROM intake_cases ic
        LEFT JOIN staff st ON st.id=ic.case_owner_staff_id
        LEFT JOIN visa_cases vc ON vc.case_id=ic.id
        LEFT JOIN finance_invoices fi ON fi.case_id=ic.id AND fi.status != 'void'
        WHERE ${where.join(' AND ')}
        ORDER BY ic.created_at DESC, ic.rowid DESC
      `, params);
  res.json(cases);
});

app.get('/api/intake-cases/:id', requireAdmissionModule, (req, res) => {
  const isPrincipal = req.session.user.role === 'principal';
  const ic = isPrincipal
    ? db.get(`
        SELECT ic.*, ic.student_name,
          st.name as owner_name,
          r.source_type as referral_type, r.anonymous_label, r.agent_id,
          a.name as agent_name
        FROM intake_cases ic
        LEFT JOIN staff st ON st.id=ic.case_owner_staff_id
        LEFT JOIN referrals r ON r.id=ic.referral_id
        LEFT JOIN agents a ON a.id=r.agent_id
        WHERE ic.id=?
      `, [req.params.id])
    : db.get(`
        SELECT ic.id, ic.student_name, ic.intake_year, ic.program_name, ic.status,
          ic.case_owner_staff_id, ic.offer_issued_at, ic.contract_signed_at,
          ic.contract_signed_by, ic.docs_sent_at, ic.notes, ic.created_at, ic.updated_at,
          ic.adm_profile_id, ic.review_status, ic.student_id, ic.referral_id,
          ic.source_type, ic.submit_mode, ic.submitted_at,
          st.name as owner_name
        FROM intake_cases ic
        LEFT JOIN staff st ON st.id=ic.case_owner_staff_id
        WHERE ic.id=?
      `, [req.params.id]);
  if (!ic) return res.status(404).json({ error: 'Case 不存在' });
  const role = req.session.user.role;
  const isStudentAdmin = role === 'student_admin';
  // 学管老师只看到校后的任务（入学/回访类），不需要看签证/材料/财务
  const visa     = isStudentAdmin ? null : db.get('SELECT * FROM visa_cases WHERE case_id=?', [req.params.id]);
  const invoices = isStudentAdmin ? [] : db.all('SELECT * FROM finance_invoices WHERE case_id=? ORDER BY created_at DESC', [req.params.id]);
  const payments = isStudentAdmin ? [] : db.all(`SELECT fp.*, fi.invoice_no FROM finance_payments fp JOIN finance_invoices fi ON fi.id=fp.invoice_id WHERE fi.case_id=? ORDER BY fp.paid_at DESC`, [req.params.id]);
  const materials= isStudentAdmin ? [] : db.all('SELECT * FROM material_items WHERE intake_case_id=? ORDER BY created_at DESC', [req.params.id]);
  const tasks = isStudentAdmin
    ? db.all(`SELECT * FROM milestone_tasks WHERE intake_case_id=? AND category IN ('入学','回访') ORDER BY due_date ASC`, [req.params.id])
    : db.all('SELECT * FROM milestone_tasks WHERE intake_case_id=? ORDER BY due_date ASC', [req.params.id]);
  const arrival = db.get('SELECT * FROM arrival_records WHERE case_id=?', [req.params.id]);
  const survey = db.get('SELECT * FROM post_arrival_surveys WHERE case_id=? ORDER BY created_at DESC LIMIT 1', [req.params.id]);
  // 是否已移交学管（intake_staff 视角：案例进入 oriented/closed 后进入只读交接态）
  const _stageOrder = ['registered','collecting_docs','contract_signed','visa_in_progress','ipa_received','paid','arrived','oriented','closed'];
  const phase_handed_off = _stageOrder.indexOf(ic.status) >= 7; // oriented 及以后
  // 案例文件 + 发送记录 + 签字记录（含文件的发送子列表）
  const caseFilesRaw = isStudentAdmin ? [] : db.all('SELECT * FROM case_files WHERE case_id=? ORDER BY created_at DESC', [req.params.id]);
  const caseSends    = isStudentAdmin ? [] : db.all('SELECT * FROM case_file_sends WHERE case_id=? ORDER BY sent_at DESC', [req.params.id]);
  const caseSignatures = isStudentAdmin ? [] : db.all('SELECT * FROM case_signatures WHERE case_id=? ORDER BY signed_at DESC', [req.params.id]);
  const caseFiles = caseFilesRaw.map(f => ({ ...f, sends: caseSends.filter(s => s.file_id === f.id) }));
  // 文件收发中心数据
  const fileExchangeRaw = isStudentAdmin ? [] : db.all(`SELECT * FROM file_exchange_records WHERE case_id=? AND is_deleted=0 AND direction='admin_to_student' ORDER BY created_at DESC`, [req.params.id]);
  const replyRecordsRaw = isStudentAdmin ? [] : db.all(`SELECT * FROM file_exchange_records WHERE case_id=? AND is_deleted=0 AND direction='student_to_admin' AND parent_id IS NOT NULL ORDER BY created_at DESC`, [req.params.id]);
  const now_iso = new Date().toISOString();
  const fileExchange = fileExchangeRaw.map(r => {
    if (r.deadline_at && r.deadline_at < now_iso && !['replied','closed'].includes(r.status)) {
      r.status = 'overdue';
    }
    r.replies = replyRecordsRaw.filter(rp => rp.parent_id === r.id);
    return r;
  });
  const fileExchangeLogs = isStudentAdmin ? [] : db.all(`SELECT * FROM file_exchange_logs WHERE case_id=? ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
  // ADM 申请表文件（如有）
  let admDocs = [];
  if (ic.adm_profile_id) {
    admDocs = db.all(
      `SELECT * FROM adm_generated_documents WHERE profile_id=? AND is_latest=1 ORDER BY doc_type`,
      [ic.adm_profile_id]
    );
  }
  // MAT 材料收集请求（关联到此 case）
  let matRequest = null;
  const matReq = db.get(`SELECT * FROM mat_requests WHERE intake_case_id=? ORDER BY created_at DESC LIMIT 1`, [req.params.id]);
  if (matReq) {
    matReq.items = db.all(`SELECT * FROM mat_request_items WHERE request_id=? ORDER BY sort_order`, [matReq.id]);
    matReq.uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [matReq.id]);
    matReq.token = db.get(`SELECT token, status as token_status, expires_at FROM mat_magic_tokens WHERE request_id=? AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`, [matReq.id]);
    matReq.reviewActions = db.all(`SELECT * FROM mat_review_actions WHERE request_id=? ORDER BY created_at DESC`, [matReq.id]);
    matReq.uifVersions = db.all(`SELECT id, version_no, status, submitted_at, reviewed_at, return_reason, is_current FROM mat_uif_versions WHERE request_id=? ORDER BY version_no DESC`, [matReq.id]);
    matRequest = matReq;
  }
  res.json({ ...ic, visa, arrival, invoices, payments, tasks, materials, survey, phase_handed_off, caseFiles, caseSends, caseSignatures, fileExchange, fileExchangeLogs, admDocs, matRequest });
});

// ── POST /api/intake-cases/:id/mat-request — 从 case 创建材料收集请求 ──
app.post('/api/intake-cases/:id/mat-request', requireRole('principal','intake_staff','counselor'), (req, res) => {
  try {
  const ic = db.get('SELECT * FROM intake_cases WHERE id=?', [req.params.id]);
  if (!ic) return res.status(404).json({ error: 'Case not found' });

  // 检查是否已有请求
  const existing = db.get('SELECT id FROM mat_requests WHERE intake_case_id=?', [req.params.id]);
  if (existing) return res.status(400).json({ error: 'Material request already exists for this case', requestId: existing.id });

  const { company_id, contact_id, title, deadline, notes, items } = req.body;
  if (!company_id || !contact_id) return res.status(400).json({ error: 'company_id and contact_id required' });

  const requestId = uuidv4();
  db.run(`INSERT INTO mat_requests (id, student_id, company_id, contact_id, counselor_id, title, deadline, notes, status, intake_case_id, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    [requestId, ic.student_id, company_id, contact_id, req.session.user.id, title || `${ic.student_name} 材料收集`, deadline || '', notes || '', 'PENDING', req.params.id]);

  // 创建默认材料项
  const defaultItems = items && items.length > 0 ? items : [
    { name: '护照首页', is_required: 1 },
    { name: '在读证明', is_required: 1 },
    { name: '成绩单', is_required: 1 },
    { name: '银行存款证明', is_required: 0 },
    { name: '语言成绩证明', is_required: 0 },
  ];
  defaultItems.forEach((item, idx) => {
    db.run(`INSERT INTO mat_request_items (id, request_id, name, description, is_required, status, sort_order) VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), requestId, item.name, item.description || '', item.is_required ? 1 : 0, 'PENDING', idx]);
  });

  // 生成 magic token
  const token = require('crypto').randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  db.run(`INSERT INTO mat_magic_tokens (id, request_id, contact_id, token, status, expires_at, created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
    [uuidv4(), requestId, contact_id, token, 'ACTIVE', expires]);

  // 自动发送邀请邮件给 agent
  const contact = db.get('SELECT * FROM mat_contacts WHERE id=?', [contact_id]);
  const matReqForEmail = db.get('SELECT * FROM mat_requests WHERE id=?', [requestId]);
  if (contact && contact.email && matReqForEmail) {
    const link = `${req.protocol}://${req.get('host')}/agent.html?token=${token}`;
    _matSendInviteEmail(matReqForEmail, contact, link, 'invite').catch(e => {
      console.error('[MAT] Invite email failed:', e.message);
    });
  }

  audit(req, 'MAT_REQUEST_CREATED_FROM_CASE', 'intake_cases', req.params.id, { requestId });
  res.json({ ok: true, requestId, token });
  } catch(e) {
    console.error('[MAT] Create mat-request error:', e.message, e.stack);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/intake-cases/:id/status', requireRole('principal','intake_staff','student_admin'), (req, res) => {
  const { status } = req.body;
  const validStatuses = ['registered','collecting_docs','contract_signed','visa_in_progress','ipa_received','paid','arrived','oriented','closed'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: '无效状态' });
  const prev = db.get('SELECT status, student_name FROM intake_cases WHERE id=?', [req.params.id]);
  if (!prev) return res.status(404).json({ error: 'Case 不存在' });
  // BUG-001: student_admin 仅可操作 arrived/oriented 阶段，与前端一致
  if (req.session.user.role === 'student_admin' && !['arrived','oriented'].includes(status)) {
    return res.status(403).json({ error: 'student_admin 仅可将案例标记为到校或已入学' });
  }
  // 状态机顺序：contract_signed → visa_in_progress → ipa_received → paid → arrived
  const ALLOWED_TRANSITIONS = {
    'registered':       ['collecting_docs'],
    'collecting_docs':  ['registered','contract_signed'],
    'contract_signed':  ['collecting_docs','visa_in_progress'],   // 签合同 → 签证办理
    'visa_in_progress': ['contract_signed','ipa_received'],       // 签证办理 → IPA
    'ipa_received':     ['visa_in_progress','paid'],              // IPA → 付款
    'paid':             ['ipa_received','arrived'],               // 付款 → 到校
    'arrived':          ['paid','oriented'],
    'oriented':         ['arrived','closed'],
    'closed':           [],
  };
  const allowed = ALLOWED_TRANSITIONS[prev.status] || [];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `状态流转不合法：${prev.status} → ${status}，允许跳转至：${allowed.join('、') || '（终态，不可变更）'}` });
  }
  db.run(`UPDATE intake_cases SET status=?,updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
  audit(req, 'UPDATE_STATUS', 'intake_cases', req.params.id, { from: prev.status, to: status });
  // 自动创建任务
  const autoTasks = [];
  const now = new Date();
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r.toISOString().slice(0,10); };
  if (status === 'contract_signed') {
    autoTasks.push({ title: '收集护照及入学材料', category: '材料', priority: 'high', due_date: addDays(now, 14) });
  } else if (status === 'visa_in_progress') {
    autoTasks.push({ title: '提交签证申请（Student Pass）', category: '签证', priority: 'high', due_date: addDays(now, 14) });
  } else if (status === 'paid') {
    autoTasks.push({ title: '跟进首期学费缴纳', category: '财务', priority: 'high', due_date: addDays(now, 7) });
    autoTasks.push({ title: '确认学费收据并发送给学生', category: '财务', priority: 'normal', due_date: addDays(now, 14) });
  } else if (status === 'ipa_received') {
    autoTasks.push({ title: '提醒学生确认到校日期及航班', category: '到校', priority: 'high', due_date: addDays(now, 7) });
    autoTasks.push({ title: '安排接机与住宿', category: '到校', priority: 'high', due_date: addDays(now, 14) });
    // IPA到期前30/14/3天提醒（从visa_cases获取到期日）
    const vc = db.get('SELECT ipa_expiry_date FROM visa_cases WHERE case_id=?', [req.params.id]);
    if (vc && vc.ipa_expiry_date) {
      const exp = new Date(vc.ipa_expiry_date);
      [30,14,3].forEach(d => {
        const due = new Date(exp); due.setDate(due.getDate()-d);
        if (due > now) autoTasks.push({ title: `⚠️ IPA 将在 ${d} 天后到期（${vc.ipa_expiry_date}）`, category: '签证', priority: d<=3?'high':'normal', due_date: due.toISOString().slice(0,10) });
      });
    }
  } else if (status === 'arrived') {
    autoTasks.push({ title: '完成到校登记与Orientation', category: '入学', priority: 'high', due_date: addDays(now, 3) });
    autoTasks.push({ title: '确认学生准证办理', category: '签证', priority: 'high', due_date: addDays(now, 7) });
    // 通知所有 student_admin：学生已到校
    try {
      const studentName = prev.student_name || '学生';
      const adminUsers = db.all(`SELECT id FROM users WHERE role='student_admin'`);
      if (adminUsers.length > 0) {
        const vals = adminUsers.map(() => `(?,?,?,?,?,?,?,datetime('now'))`).join(',');
        const args = adminUsers.flatMap(u => [uuidv4(), null, 'system',
          '学生已到校', `${studentName} 已到校，请开始跟进 Orientation 流程`, 'student_admin', u.id]);
        db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_role,target_user_id,created_at) VALUES ${vals}`, args);
      }
    } catch(e) { console.error('student_admin 通知创建失败:', e.message); }
  } else if (status === 'oriented') {
    autoTasks.push({ title: '发送到校后满意度问卷', category: '回访', priority: 'normal', due_date: addDays(now, 14) });
    // 通知 intake_staff：学生已入学，案例已移交学管
    try {
      const studentName = prev.student_name || '学生';
      const intakeUsers = db.all(`SELECT id FROM users WHERE role='intake_staff'`);
      if (intakeUsers.length > 0) {
        const vals2 = intakeUsers.map(() => `(?,?,?,?,?,?,?,datetime('now'))`).join(',');
        const args2 = intakeUsers.flatMap(u => [uuidv4(), null, 'system', '案例已顺利移交',
          `${studentName} 已完成入学登记，案例已移交学管老师跟进，你的前期工作已完成。`, 'intake_staff', u.id]);
        db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_role,target_user_id,created_at) VALUES ${vals2}`, args2);
      }
    } catch(e) { console.error('intake_staff 移交通知失败:', e.message); }
  }
  let autoTasksCreated = 0;
  autoTasks.forEach(t => {
    try {
      const dup = db.get('SELECT id FROM milestone_tasks WHERE intake_case_id=? AND title=?', [req.params.id, t.title]);
      if (dup) return; // 已存在同名任务，跳过
      const tid = uuidv4(); const tnow = new Date().toISOString();
      db.run(`INSERT INTO milestone_tasks (id,student_id,intake_case_id,title,category,priority,status,due_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [tid, null, req.params.id, t.title, t.category||'其他', t.priority||'normal', 'pending', t.due_date||null, tnow, tnow]);
      autoTasksCreated++;
    } catch(e) { console.error('自动任务创建失败:', e.message); }
  });
  res.json({ ok: true, status, autoTasksCreated });
});

app.put('/api/intake-cases/:id', requireRole('principal','intake_staff'), (req, res) => {
  // BUG-006: 404 check
  const existing = db.get('SELECT id FROM intake_cases WHERE id=?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Case 不存在' });
  const { program_name, case_owner_staff_id, offer_issued_at, contract_signed_at, contract_signed_by, notes } = req.body;
  db.run(`UPDATE intake_cases SET program_name=COALESCE(?,program_name), case_owner_staff_id=COALESCE(?,case_owner_staff_id), offer_issued_at=?, contract_signed_at=?, contract_signed_by=?, notes=COALESCE(?,notes), updated_at=datetime('now') WHERE id=?`,
    [program_name||null, case_owner_staff_id||null, offer_issued_at||null, contract_signed_at||null, contract_signed_by||null, notes||null, req.params.id]);
  audit(req, 'UPDATE', 'intake_cases', req.params.id, req.body);
  res.json({ ok: true });
});

app.delete('/api/intake-cases/:id', requireRole('principal','intake_staff'), (req, res) => {
  const ic = db.get('SELECT id, student_name FROM intake_cases WHERE id=?', [req.params.id]);
  if (!ic) return res.status(404).json({ error: 'Case 不存在' });
  // Collect physical file paths before deletion
  const exchangeFiles = db.all('SELECT file_path FROM file_exchange_records WHERE case_id=? AND file_path IS NOT NULL', [req.params.id]);
  const caseFiles = db.all('SELECT filename FROM case_files WHERE case_id=? AND filename IS NOT NULL', [req.params.id]);
  const materialFiles = db.all('SELECT file_path FROM material_items WHERE intake_case_id=? AND file_path IS NOT NULL', [req.params.id]);
  // 材料收集相关文件
  const matRequests = db.all('SELECT id FROM mat_requests WHERE intake_case_id=?', [req.params.id]);
  const matReqIds = matRequests.map(r => r.id);
  const matUploadFiles = matReqIds.length ? db.all(`SELECT file_id FROM mat_request_items WHERE request_id IN (${matReqIds.map(()=>'?').join(',')}) AND file_id IS NOT NULL`, matReqIds) : [];
  const matVersionFiles = matReqIds.length ? db.all(`SELECT file_id FROM mat_item_versions WHERE request_id IN (${matReqIds.map(()=>'?').join(',')}) AND file_id IS NOT NULL`, matReqIds) : [];
  // ADM 生成的 PDF 文件
  const profileId = ic.adm_profile_id || db.get('SELECT adm_profile_id FROM intake_cases WHERE id=?', [req.params.id])?.adm_profile_id;
  const admDocFiles = profileId ? db.all('SELECT file_id FROM adm_generated_documents WHERE profile_id=? AND file_id IS NOT NULL', [profileId]) : [];
  const admSigFiles = profileId ? db.all('SELECT file_id FROM adm_signatures WHERE profile_id=? AND file_id IS NOT NULL', [profileId]) : [];
  try {
    db.transaction((run) => {
      run(`DELETE FROM post_arrival_surveys WHERE case_id=?`, [req.params.id]);
      run(`DELETE FROM survey_links WHERE case_id=?`, [req.params.id]);
      run(`DELETE FROM milestone_tasks WHERE intake_case_id=?`, [req.params.id]);
      run(`DELETE FROM material_items WHERE intake_case_id=?`, [req.params.id]);
      run(`DELETE FROM commission_payouts WHERE invoice_id IN (SELECT id FROM finance_invoices WHERE case_id=?)`, [req.params.id]);
      run(`DELETE FROM finance_payments WHERE invoice_id IN (SELECT id FROM finance_invoices WHERE case_id=?)`, [req.params.id]);
      run(`DELETE FROM finance_invoices WHERE case_id=?`, [req.params.id]);
      run(`DELETE FROM arrival_records WHERE case_id=?`, [req.params.id]);
      run(`DELETE FROM visa_cases WHERE case_id=?`, [req.params.id]);
      run(`DELETE FROM case_signatures WHERE case_id=?`, [req.params.id]);
      run(`DELETE FROM case_file_sends WHERE case_id=?`, [req.params.id]);
      run(`DELETE FROM case_files WHERE case_id=?`, [req.params.id]);
      run(`DELETE FROM file_exchange_logs WHERE case_id=?`, [req.params.id]);
      run(`DELETE FROM file_exchange_records WHERE case_id=?`, [req.params.id]);
      // 材料收集相关
      for (const rid of matReqIds) {
        run(`DELETE FROM mat_item_versions WHERE request_id=?`, [rid]);
        run(`DELETE FROM mat_request_items WHERE request_id=?`, [rid]);
        run(`DELETE FROM mat_uif_versions WHERE request_id=?`, [rid]);
        run(`DELETE FROM mat_uif_submissions WHERE request_id=?`, [rid]);
        run(`DELETE FROM mat_magic_tokens WHERE request_id=?`, [rid]);
        run(`DELETE FROM mat_review_actions WHERE request_id=?`, [rid]);
      }
      run(`DELETE FROM mat_requests WHERE intake_case_id=?`, [req.params.id]);
      // ADM Profile 相关
      if (profileId) {
        run(`DELETE FROM adm_generated_documents WHERE profile_id=?`, [profileId]);
        run(`DELETE FROM adm_signatures WHERE profile_id=?`, [profileId]);
        run(`DELETE FROM adm_family_members WHERE profile_id=?`, [profileId]);
        run(`DELETE FROM adm_education_history WHERE profile_id=?`, [profileId]);
        run(`DELETE FROM adm_employment_history WHERE profile_id=?`, [profileId]);
        run(`DELETE FROM adm_residence_history WHERE profile_id=?`, [profileId]);
        run(`DELETE FROM adm_guardian_info WHERE profile_id=?`, [profileId]);
        run(`DELETE FROM adm_parent_pr_additional WHERE profile_id=?`, [profileId]);
        run(`DELETE FROM adm_spouse_pr_additional WHERE profile_id=?`, [profileId]);
        run(`DELETE FROM adm_profiles WHERE id=?`, [profileId]);
      }
      run(`DELETE FROM intake_cases WHERE id=?`, [req.params.id]);
    });
  } catch(e) {
    return res.status(500).json({ error: '删除失败: ' + e.message });
  }
  // Clean up physical files after successful DB deletion
  for (const f of exchangeFiles) { fileStorage.deleteFile(f.file_path); }
  for (const f of caseFiles) { fileStorage.deleteFile(f.filename); }
  for (const f of materialFiles) { fileStorage.deleteFile(f.file_path); }
  for (const f of matUploadFiles.concat(matVersionFiles)) { fileStorage.deleteFile(f.file_id); }
  for (const f of admDocFiles.concat(admSigFiles)) { fileStorage.deleteFile(f.file_id); }
  audit(req, 'DELETE', 'intake_cases', req.params.id, { student_name: ic.student_name });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  PASSPORT PROFILES
// ═══════════════════════════════════════════════════════

app.get('/api/students/:id/passport', requireRole('principal','intake_staff'), (req, res) => {
  const profiles = db.all('SELECT * FROM passport_profiles WHERE student_id=? ORDER BY created_at DESC', [req.params.id]);
  res.json(profiles);
});

app.post('/api/students/:id/passport', requireRole('principal','intake_staff'), (req, res) => {
  const { passport_no, nationality, date_of_birth, expiry_date, issued_at } = req.body;
  if (!passport_no || !nationality || !expiry_date) return res.status(400).json({ error: '缺少必填字段' });
  // R12: 护照日期格式校验
  if (isNaN(Date.parse(expiry_date))) return res.status(400).json({ error: 'expiry_date 日期格式无效' });
  if (date_of_birth && isNaN(Date.parse(date_of_birth))) return res.status(400).json({ error: 'date_of_birth 日期格式无效' });
  if (issued_at && isNaN(Date.parse(issued_at))) return res.status(400).json({ error: 'issued_at 日期格式无效' });
  const id = uuidv4();
  db.run(`INSERT INTO passport_profiles (id,student_id,passport_no,nationality,date_of_birth,expiry_date,issued_at) VALUES (?,?,?,?,?,?,?)`,
    [id, req.params.id, passport_no, nationality, date_of_birth||null, expiry_date, issued_at||null]);
  audit(req, 'CREATE', 'passport_profiles', id, { student_id: req.params.id, nationality });
  res.json({ id, passport_no, nationality, expiry_date });
});

// ═══════════════════════════════════════════════════════
//  FINANCE — INVOICES
// ═══════════════════════════════════════════════════════

app.post('/api/intake-cases/:id/invoices', requireRole('principal','intake_staff'), (req, res) => {
  // F-04: 验证 case 存在性
  const caseExists = db.get('SELECT id FROM intake_cases WHERE id=?', [req.params.id]);
  if (!caseExists) return res.status(404).json({ error: '案例不存在' });
  const { currency, items, due_at } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items 不能为空' });
  // R16: 校验每项金额必须 > 0
  for (const item of items) {
    if (!item.name || !item.name.trim()) return res.status(400).json({ error: '每个费用项目必须有名称' });
    if (!item.amount || item.amount <= 0) return res.status(400).json({ error: `费用项目 "${item.name}" 的金额必须大于 0` });
  }
  const amount_total = items.reduce((s, i) => s + (i.amount || 0), 0);
  const year = new Date().getFullYear();
  const maxRow = db.get(`SELECT MAX(CAST(SUBSTR(invoice_no,10) AS INTEGER)) as mx FROM finance_invoices WHERE invoice_no LIKE ?`, [`INV-${year}-%`]);
  const invoice_no = `INV-${year}-${String((maxRow?.mx || 0) + 1).padStart(4, '0')}`;
  const id = uuidv4();
  db.run(`INSERT INTO finance_invoices (id,case_id,invoice_no,currency,amount_total,items_json,due_at,created_by) VALUES (?,?,?,?,?,?,?,?)`,
    [id, req.params.id, invoice_no, currency||'SGD', amount_total, JSON.stringify(items), due_at||null, req.session.user.id]);
  audit(req, 'CREATE', 'finance_invoices', id, { case_id: req.params.id, amount_total, invoice_no });
  res.json({ id, invoice_no, amount_total, currency: currency||'SGD', status: 'unpaid' });
});

app.get('/api/invoices', requireRole('principal','intake_staff'), (req, res) => {
  const { status, case_id } = req.query;
  let where = ['1=1'];
  let params = [];
  if (status) { where.push('fi.status=?'); params.push(status); }
  if (case_id) { where.push('fi.case_id=?'); params.push(case_id); }
  const invoices = db.all(`
    SELECT fi.*, ic.program_name, s.name as student_name,
      COALESCE((SELECT SUM(fp.paid_amount) FROM finance_payments fp WHERE fp.invoice_id=fi.id), 0) as paid_amount
    FROM finance_invoices fi
    LEFT JOIN intake_cases ic ON ic.id=fi.case_id
    LEFT JOIN students s ON s.id=ic.student_id
    WHERE ${where.join(' AND ')}
    ORDER BY fi.created_at DESC
  `, params);
  res.json(invoices);
});

app.put('/api/invoices/:id/void', requireRole('principal'), (req, res) => {
  const invoice = db.get('SELECT * FROM finance_invoices WHERE id=?', [req.params.id]);
  if (!invoice) return res.status(404).json({ error: '账单不存在' });
  if (invoice.status === 'paid') return res.status(400).json({ error: '账单已付清，不可直接作废。如需作废请先退款并联系管理员处理佣金' });
  if (invoice.status === 'void') return res.status(400).json({ error: '账单已是作废状态' });
  const { void_reason } = req.body;
  db.run(`UPDATE finance_invoices SET status='void',void_reason=?,updated_at=datetime('now') WHERE id=?`, [void_reason||null, req.params.id]);
  // Void all pending/approved commission payouts linked to this invoice
  db.run(`UPDATE commission_payouts SET status='void',updated_at=datetime('now') WHERE invoice_id=? AND status IN ('pending','approved')`, [req.params.id]);
  audit(req, 'VOID', 'finance_invoices', req.params.id, { void_reason });
  res.json({ ok: true });
});

app.delete('/api/invoices/:id', requireRole('principal'), (req, res) => {
  const invoice = db.get('SELECT * FROM finance_invoices WHERE id=?', [req.params.id]);
  if (!invoice) return res.status(404).json({ error: '账单不存在' });
  try {
    db.transaction((run) => {
      run(`DELETE FROM commission_payouts WHERE invoice_id=?`, [req.params.id]);
      run(`DELETE FROM finance_payments WHERE invoice_id=?`, [req.params.id]);
      run(`DELETE FROM finance_invoices WHERE id=?`, [req.params.id]);
    });
  } catch(e) {
    return res.status(500).json({ error: '删除失败: ' + e.message });
  }
  audit(req, 'DELETE', 'finance_invoices', req.params.id, { invoice_no: invoice.invoice_no, amount_total: invoice.amount_total });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  FINANCE — PAYMENTS
// ═══════════════════════════════════════════════════════

app.post('/api/invoices/:id/payments', requireRole('principal','intake_staff'), (req, res) => {
  const { paid_amount, method, paid_at, reference_no, notes } = req.body;
  if (!paid_amount || paid_amount <= 0) return res.status(400).json({ error: 'paid_amount 必须 > 0' });
  const invoice = db.get('SELECT * FROM finance_invoices WHERE id=?', [req.params.id]);
  if (!invoice) return res.status(404).json({ error: '账单不存在' });
  if (invoice.status === 'void') return res.status(400).json({ error: '账单已作废' });
  if (invoice.status === 'paid') return res.status(400).json({ error: '账单已付清，无需继续收款' });
  // 校验付款金额不超过账单未付余额（使用整数分运算避免浮点精度问题）
  const alreadyPaid = (db.get('SELECT COALESCE(SUM(paid_amount),0) as total FROM finance_payments WHERE invoice_id=?', [req.params.id]).total) || 0;
  const remainingCents = Math.round(invoice.amount_total * 100) - Math.round(alreadyPaid * 100);
  const paidCents = Math.round(paid_amount * 100);
  if (paidCents > remainingCents) {
    const remaining = remainingCents / 100;
    return res.status(400).json({ error: `付款金额（${paid_amount}）超过账单未付余额（${remaining.toFixed(2)}）` });
  }
  const payId = uuidv4();
  db.run(`INSERT INTO finance_payments (id,invoice_id,paid_amount,method,paid_at,reference_no,notes,created_by) VALUES (?,?,?,?,?,?,?,?)`,
    [payId, req.params.id, paid_amount, method||'bank_transfer', paid_at||new Date().toISOString(), reference_no||null, notes||null, req.session.user.id]);
  const totalPaid = db.get('SELECT SUM(paid_amount) as total FROM finance_payments WHERE invoice_id=?', [req.params.id]).total || 0;
  const newStatus = totalPaid >= invoice.amount_total ? 'paid' : 'partial';
  db.run(`UPDATE finance_invoices SET status=?,updated_at=datetime('now') WHERE id=?`, [newStatus, req.params.id]);
  audit(req, 'CREATE', 'finance_payments', payId, { invoice_id: req.params.id, paid_amount, method });
  res.json({ id: payId, paid_amount, status: newStatus });
});

app.put('/api/payments/:id/reconcile', requireRole('principal'), (req, res) => {
  const payment = db.get('SELECT id FROM finance_payments WHERE id=?', [req.params.id]);
  if (!payment) return res.status(404).json({ error: '收款记录不存在' });
  db.run(`UPDATE finance_payments SET reconciled=1, reconciled_by=?, reconciled_at=datetime('now') WHERE id=?`,
    [req.session.user.id, req.params.id]);
  audit(req, 'RECONCILE', 'finance_payments', req.params.id, null);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  AGENTS & REFERRALS
// ═══════════════════════════════════════════════════════

app.get('/api/agents', requireRole('principal'), (req, res) => {
  const agents = db.all(`
    SELECT a.*, cr.name as rule_name, cr.rate, cr.type as rule_type,
      COUNT(DISTINCT r.id) as referral_count,
      (SELECT COUNT(*) FROM students s2 WHERE s2.agent_id=a.id AND s2.status!='deleted') as student_count,
      SUM(CASE WHEN ic.status IN ('contract_signed','paid','visa_in_progress','ipa_received','arrived','oriented') THEN 1 ELSE 0 END) as signed_count,
      COALESCE(SUM(CASE WHEN cp.status='pending' THEN cp.commission_amount ELSE 0 END),0) as pending_commission,
      COALESCE(SUM(CASE WHEN cp.status='paid' THEN cp.commission_amount ELSE 0 END),0) as paid_commission
    FROM agents a
    LEFT JOIN commission_rules cr ON cr.id=a.commission_rule_id
    LEFT JOIN referrals r ON r.agent_id=a.id
    LEFT JOIN intake_cases ic ON ic.referral_id=r.id
    LEFT JOIN commission_payouts cp ON cp.referral_id=r.id
    GROUP BY a.id
    ORDER BY a.created_at DESC
  `);
  res.json(agents);
});

app.get('/api/agents/:id/students', requireRole('principal'), (req, res) => {
  // 双路径查询：直接 agent_id 字段 + referral 链路（UNION 合并去重）
  const students = db.all(`
    SELECT s.id, s.name, s.grade_level, s.status as student_status, s.exam_board,
      (SELECT ic2.id FROM intake_cases ic2 WHERE ic2.student_id=s.id ORDER BY ic2.created_at DESC LIMIT 1) as case_id,
      (SELECT ic2.program_name FROM intake_cases ic2 WHERE ic2.student_id=s.id ORDER BY ic2.created_at DESC LIMIT 1) as program_name,
      (SELECT ic2.intake_year FROM intake_cases ic2 WHERE ic2.student_id=s.id ORDER BY ic2.created_at DESC LIMIT 1) as intake_year,
      (SELECT ic2.status FROM intake_cases ic2 WHERE ic2.student_id=s.id ORDER BY ic2.created_at DESC LIMIT 1) as case_status,
      s.created_at as enrolled_at
    FROM students s WHERE s.agent_id=? AND s.status != 'deleted'
    UNION
    SELECT DISTINCT s.id, s.name, s.grade_level, s.status as student_status, s.exam_board,
      ic.id as case_id, ic.program_name, ic.intake_year, ic.status as case_status,
      ic.created_at as enrolled_at
    FROM agents a
    JOIN referrals r ON r.agent_id=a.id
    JOIN intake_cases ic ON ic.referral_id=r.id
    JOIN students s ON s.id=ic.student_id
    WHERE a.id=? AND s.status != 'deleted'
    ORDER BY enrolled_at DESC
  `, [req.params.id, req.params.id]);
  res.json(students);
});

app.post('/api/agents', requireRole('principal'), (req, res) => {
  const { name, type, contact, email, phone, commission_rule_id, notes } = req.body;
  if (!name || !type) return res.status(400).json({ error: '缺少 name 或 type' });
  const id = uuidv4();
  db.run(`INSERT INTO agents (id,name,type,contact,email,phone,commission_rule_id,notes) VALUES (?,?,?,?,?,?,?,?)`,
    [id, name, type, contact||null, email||null, phone||null, commission_rule_id||null, notes||null]);
  audit(req, 'CREATE', 'agents', id, { name, type });
  res.json({ id, name, type });
});

app.put('/api/agents/:id', requireRole('principal'), (req, res) => {
  const { name, status, contact, email, phone, commission_rule_id, notes } = req.body;
  db.run(`UPDATE agents SET name=COALESCE(?,name),status=COALESCE(?,status),contact=COALESCE(?,contact),email=COALESCE(?,email),phone=COALESCE(?,phone),commission_rule_id=COALESCE(?,commission_rule_id),notes=COALESCE(?,notes),updated_at=datetime('now') WHERE id=?`,
    [name||null, status||null, contact||null, email||null, phone||null, commission_rule_id||null, notes||null, req.params.id]);
  audit(req, 'UPDATE', 'agents', req.params.id, req.body);
  res.json({ ok: true });
});

app.post('/api/referrals', requireRole('principal'), (req, res) => {
  const { source_type, agent_id, anonymous_label, referrer_name, notes } = req.body;
  if (!source_type) return res.status(400).json({ error: '缺少 source_type' });
  const id = uuidv4();
  db.run(`INSERT INTO referrals (id,source_type,agent_id,anonymous_label,referrer_name,notes) VALUES (?,?,?,?,?,?)`,
    [id, source_type, agent_id||null, anonymous_label||null, referrer_name||null, notes||null]);
  audit(req, 'CREATE', 'referrals', id, { source_type });
  res.json({ id, source_type, agent_id, anonymous_label });
});

app.get('/api/referrals', requireRole('principal'), (req, res) => {
  const referrals = db.all(`
    SELECT r.*, a.name as agent_name,
      COUNT(DISTINCT ic.id) as case_count
    FROM referrals r
    LEFT JOIN agents a ON a.id=r.agent_id
    LEFT JOIN intake_cases ic ON ic.referral_id=r.id
    GROUP BY r.id ORDER BY r.created_at DESC
  `);
  res.json(referrals);
});

// ═══════════════════════════════════════════════════════
//  COMMISSION RULES & PAYOUTS
// ═══════════════════════════════════════════════════════

app.get('/api/commission-rules', requireRole('principal'), (req, res) => {
  res.json(db.all('SELECT * FROM commission_rules ORDER BY created_at DESC'));
});

app.post('/api/commission-rules', requireRole('principal'), (req, res) => {
  const { name, type, rate, fixed_amount, currency, applies_to, notes } = req.body;
  if (!name || !type) return res.status(400).json({ error: '缺少 name 或 type' });
  if (!['percent','fixed'].includes(type)) return res.status(400).json({ error: 'type 必须为 percent 或 fixed' });
  if (type === 'percent') {
    const r = parseFloat(rate);
    if (isNaN(r) || r <= 0 || r > 1) return res.status(400).json({ error: 'percent 类型的 rate 必须在 (0, 1] 之间（例如 0.10 表示10%）' });
  }
  if (type === 'fixed') {
    const fa = parseFloat(fixed_amount);
    if (isNaN(fa) || fa <= 0) return res.status(400).json({ error: 'fixed 类型的 fixed_amount 必须 > 0' });
  }
  const id = uuidv4();
  db.run(`INSERT INTO commission_rules (id,name,type,rate,fixed_amount,currency,applies_to,notes) VALUES (?,?,?,?,?,?,?,?)`,
    [id, name, type, rate||null, fixed_amount||null, currency||'SGD', applies_to||'all', notes||null]);
  audit(req, 'CREATE', 'commission_rules', id, { name, type });
  res.json({ id, name, type });
});

app.post('/api/commissions/apply', requireRole('principal'), (req, res) => {
  const { referral_id, invoice_id, rule_id } = req.body;
  if (!referral_id || !invoice_id || !rule_id) return res.status(400).json({ error: '缺少必填字段' });
  // Prevent duplicate commission for same referral + invoice
  const duplicate = db.get('SELECT id FROM commission_payouts WHERE referral_id=? AND invoice_id=? AND status != "void"', [referral_id, invoice_id]);
  if (duplicate) return res.status(409).json({ error: '该推荐人和账单已存在有效佣金记录，不能重复创建' });
  const rule = db.get('SELECT * FROM commission_rules WHERE id=?', [rule_id]);
  if (!rule) return res.status(404).json({ error: '规则不存在' });
  const reconResult = db.get('SELECT COALESCE(SUM(paid_amount),0) as total FROM finance_payments WHERE invoice_id=? AND reconciled=1', [invoice_id]);
  const base_amount = reconResult.total;
  if (base_amount <= 0) return res.status(400).json({ error: '无已对账收款，无法计算佣金' });
  if (rule.type === 'percent' && (rule.rate == null)) return res.status(400).json({ error: '佣金规则缺少 rate 字段' });
  if (rule.type !== 'percent' && (rule.fixed_amount == null)) return res.status(400).json({ error: '佣金规则缺少 fixed_amount 字段' });
  const commission_amount = rule.type === 'percent' ? base_amount * rule.rate : rule.fixed_amount;
  const id = uuidv4();
  db.run(`INSERT INTO commission_payouts (id,referral_id,invoice_id,rule_id,base_amount,commission_amount,currency) VALUES (?,?,?,?,?,?,?)`,
    [id, referral_id, invoice_id, rule_id, base_amount, commission_amount, rule.currency||'SGD']);
  audit(req, 'CREATE', 'commission_payouts', id, { referral_id, base_amount, commission_amount });
  res.json({ id, base_amount, commission_amount, status: 'pending' });
});

app.get('/api/commissions', requireRole('principal'), (req, res) => {
  const { status } = req.query;
  let where = status ? 'WHERE cp.status=?' : '';
  const payouts = db.all(`
    SELECT cp.*, r.source_type, r.anonymous_label, a.name as agent_name,
      cr.name as rule_name, fi.invoice_no
    FROM commission_payouts cp
    LEFT JOIN referrals r ON r.id=cp.referral_id
    LEFT JOIN agents a ON a.id=r.agent_id
    LEFT JOIN commission_rules cr ON cr.id=cp.rule_id
    LEFT JOIN finance_invoices fi ON fi.id=cp.invoice_id
    ${where} ORDER BY cp.created_at DESC
  `, status ? [status] : []);
  res.json(payouts);
});

app.put('/api/commissions/:id/approve', requireRole('principal'), (req, res) => {
  const cp = db.get('SELECT status FROM commission_payouts WHERE id=?', [req.params.id]);
  if (!cp) return res.status(404).json({ error: '佣金记录不存在' });
  if (cp.status === 'void') return res.status(400).json({ error: '已作废的佣金记录无法审批' });
  if (cp.status !== 'pending') return res.status(400).json({ error: `当前状态 "${cp.status}" 不可审批` });
  db.run(`UPDATE commission_payouts SET status='approved',approved_by=?,approved_at=datetime('now'),updated_at=datetime('now') WHERE id=?`,
    [req.session.user.id, req.params.id]);
  audit(req, 'APPROVE', 'commission_payouts', req.params.id, null);
  res.json({ ok: true });
});

app.put('/api/commissions/:id/pay', requireRole('principal'), (req, res) => {
  const cp = db.get('SELECT status FROM commission_payouts WHERE id=?', [req.params.id]);
  if (!cp) return res.status(404).json({ error: '佣金记录不存在' });
  if (cp.status === 'void') return res.status(400).json({ error: '已作废的佣金记录无法标记已付' });
  if (cp.status !== 'approved') return res.status(400).json({ error: `请先审批再付款（当前状态: "${cp.status}"）` });
  db.run(`UPDATE commission_payouts SET status='paid',paid_at=datetime('now'),updated_at=datetime('now') WHERE id=?`, [req.params.id]);
  audit(req, 'PAY', 'commission_payouts', req.params.id, null);
  res.json({ ok: true });
});

app.put('/api/commissions/:id/void', requireRole('principal'), (req, res) => {
  // R8: 404 check
  const cp = db.get('SELECT id FROM commission_payouts WHERE id=?', [req.params.id]);
  if (!cp) return res.status(404).json({ error: '佣金记录不存在' });
  const { void_reason } = req.body;
  db.run(`UPDATE commission_payouts SET status='void',void_reason=?,updated_at=datetime('now') WHERE id=?`, [void_reason||null, req.params.id]);
  audit(req, 'VOID', 'commission_payouts', req.params.id, { void_reason });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  VISA CASES
// ═══════════════════════════════════════════════════════

app.get('/api/visa-cases/:id', requireAdmissionModule, (req, res) => {
  const vc = db.get('SELECT * FROM visa_cases WHERE id=?', [req.params.id]);
  if (!vc) return res.status(404).json({ error: '签证案例不存在' });
  res.json(vc);
});

app.put('/api/visa-cases/:id', requireRole('principal','intake_staff'), (req, res) => {
  if (!db.get('SELECT id FROM visa_cases WHERE id=?', [req.params.id])) {
    return res.status(404).json({ error: '签证案例不存在' });
  }
  const { status, submission_date, additional_docs_due, medical_due, notes, ipa_issue_date, ipa_expiry_date } = req.body;
  if (status) {
    const validVisaStatuses = ['not_started','submitted','ipa_received','additional_docs','medical','complete_formalities','approved','rejected','reapply'];
    if (!validVisaStatuses.includes(status)) return res.status(400).json({ error: '无效的签证状态值' });
  }
  if (ipa_expiry_date && ipa_issue_date && ipa_expiry_date <= ipa_issue_date) {
    return res.status(400).json({ error: 'IPA 到期日期必须晚于签发日期' });
  }
  db.run(`UPDATE visa_cases SET
    status=COALESCE(?,status),
    submission_date=COALESCE(?,submission_date),
    additional_docs_due=COALESCE(?,additional_docs_due),
    medical_due=COALESCE(?,medical_due),
    notes=COALESCE(?,notes),
    ipa_issue_date=COALESCE(?,ipa_issue_date),
    ipa_expiry_date=COALESCE(?,ipa_expiry_date),
    updated_at=datetime('now') WHERE id=?`,
    [status||null, submission_date||null, additional_docs_due||null, medical_due||null, notes||null,
     ipa_issue_date||null, ipa_expiry_date||null, req.params.id]);
  audit(req, 'UPDATE', 'visa_cases', req.params.id, req.body);
  res.json({ ok: true });
});

app.put('/api/visa-cases/:id/ipa', requireRole('principal','intake_staff'), (req, res) => {
  const { ipa_issue_date, ipa_expiry_date, notes } = req.body;
  if (!ipa_issue_date || !ipa_expiry_date) return res.status(400).json({ error: '缺少 ipa_issue_date 或 ipa_expiry_date' });
  if (ipa_expiry_date <= ipa_issue_date) return res.status(400).json({ error: 'IPA 到期日期必须晚于签发日期' });
  // F-01: 检查是否已有 IPA 记录，避免重复创建任务和日历事件
  const existingVc = db.get('SELECT ipa_issue_date FROM visa_cases WHERE id=?', [req.params.id]);
  if (!existingVc) return res.status(404).json({ error: '签证案例不存在' });
  const isFirstIpa = !existingVc?.ipa_issue_date;
  db.run(`UPDATE visa_cases SET status='ipa_received',ipa_issue_date=?,ipa_expiry_date=?,notes=COALESCE(?,notes),updated_at=datetime('now') WHERE id=?`,
    [ipa_issue_date, ipa_expiry_date, notes||null, req.params.id]);
  const vc = db.get('SELECT * FROM visa_cases WHERE id=?', [req.params.id]);
  if (vc) {
    const ic = db.get('SELECT * FROM intake_cases WHERE id=?', [vc.case_id]);
    if (ic) {
      if (isFirstIpa) {
        // 仅首次标记 IPA 时创建日历事件和提醒任务
        const anchorId = uuidv4();
        db.run(`INSERT INTO calendar_anchor_events (id,name,event_type,event_date,notes,is_system,created_at) VALUES (?,?,?,?,?,0,?)`,
          [anchorId, `IPA 有效期到期 - ${ic.program_name||''}`, 'ipa_expiry', ipa_expiry_date, `IPA for case ${vc.case_id}，学生: ${ic.student_name||''}`, new Date().toISOString()]);
        const taskId = uuidv4();
        db.run(`INSERT INTO milestone_tasks (id,student_id,intake_case_id,title,description,category,due_date,status,priority,assigned_to) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [taskId, null, vc.case_id, 'IPA 有效期提醒 - 须在此前完成所有入境手续', `IPA 有效期至 ${ipa_expiry_date}，请确保在此日期前入境并完成所有 Student's Pass 手续`, '签证', ipa_expiry_date, 'pending', 'high', ic.case_owner_staff_id||null]);
      }
      // BUG-002b: 只在合法前驱状态下推进案例状态，避免跳过中间流程
      if (['visa_in_progress','paid'].includes(ic.status)) {
        db.run(`UPDATE intake_cases SET status='ipa_received',updated_at=datetime('now') WHERE id=?`, [vc.case_id]);
      }
    }
  }
  audit(req, 'IPA_RECEIVED', 'visa_cases', req.params.id, { ipa_issue_date, ipa_expiry_date });
  res.json({ ok: true, ipa_issue_date, ipa_expiry_date });
});

// ═══════════════════════════════════════════════════════
//  ARRIVAL RECORDS
// ═══════════════════════════════════════════════════════

app.get('/api/arrival-records/:id', requireAdmissionModule, (req, res) => {
  const ar = db.get('SELECT * FROM arrival_records WHERE id=?', [req.params.id]);
  if (!ar) return res.status(404).json({ error: '记录不存在' });
  res.json(ar);
});

app.put('/api/arrival-records/:id', requireRole('principal','intake_staff','student_admin'), (req, res) => {
  if (!db.get('SELECT id FROM arrival_records WHERE id=?', [req.params.id])) {
    return res.status(404).json({ error: '到校记录不存在' });
  }
  const { expected_arrival, actual_arrival, flight_no, accommodation, insurance_provider, pickup_arranged, orientation_date, orientation_done, student_pass_issued, notes,
    accommodation_address, emergency_contact_name, emergency_contact_phone,
    student_pass_no, student_pass_expiry, local_bank_account, orientation_notes } = req.body;
  // F-02/H-01: 直接赋值（不用COALESCE），允许前端明确清空字段（发送null即可置空）
  db.run(`UPDATE arrival_records SET
    expected_arrival=?,
    actual_arrival=?,
    flight_no=?,
    accommodation=?,
    insurance_provider=?,
    pickup_arranged=?,
    orientation_date=?,
    orientation_done=?,
    student_pass_issued=?,
    notes=?,
    accommodation_address=?,
    emergency_contact_name=?,
    emergency_contact_phone=?,
    student_pass_no=?,
    student_pass_expiry=?,
    local_bank_account=?,
    orientation_notes=?,
    updated_at=datetime('now') WHERE id=?`,
    [expected_arrival||null, actual_arrival||null, flight_no||null, accommodation||null, insurance_provider||null,
     pickup_arranged!=null?pickup_arranged:null, orientation_date||null, orientation_done!=null?orientation_done:null,
     student_pass_issued!=null?student_pass_issued:null, notes||null,
     accommodation_address||null, emergency_contact_name||null, emergency_contact_phone||null,
     student_pass_no||null, student_pass_expiry||null, local_bank_account||null, orientation_notes||null,
     req.params.id]);
  // BUG-002a: 到校记录变更只在合法前驱状态下推进案例状态，避免绕过状态机
  if (actual_arrival) {
    const ar = db.get('SELECT case_id FROM arrival_records WHERE id=?', [req.params.id]);
    if (ar) db.run(`UPDATE intake_cases SET status='arrived',updated_at=datetime('now') WHERE id=? AND status IN ('ipa_received')`, [ar.case_id]);
  }
  if (orientation_done) {
    const ar = db.get('SELECT case_id FROM arrival_records WHERE id=?', [req.params.id]);
    if (ar) db.run(`UPDATE intake_cases SET status='oriented',updated_at=datetime('now') WHERE id=? AND status IN ('arrived')`, [ar.case_id]);
  }
  audit(req, 'UPDATE', 'arrival_records', req.params.id, req.body);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  POST-ARRIVAL SURVEYS
// ═══════════════════════════════════════════════════════

app.post('/api/intake-cases/:id/surveys', requireAuth, (req, res) => {
  const u = req.session.user;
  // BUG-006: 阻止无关角色（agent/mentor/parent）提交问卷
  const allowedRoles = ['principal','counselor','intake_staff','student_admin','student'];
  if (!allowedRoles.includes(u.role)) return res.status(403).json({ error: '无权提交到校问卷' });
  // 验证案例存在
  if (!db.get('SELECT id FROM intake_cases WHERE id=?', [req.params.id])) {
    return res.status(404).json({ error: 'Case 不存在' });
  }
  // 学生只能提交自己案例的问卷
  if (u.role === 'student') {
    const caseOwner = db.get('SELECT student_id FROM intake_cases WHERE id=?', [req.params.id]);
    if (!caseOwner || caseOwner.student_id !== u.linked_id) {
      return res.status(403).json({ error: '无权提交该案例的问卷' });
    }
  }
  // BUG-003: 重复提交检查
  const existing = db.get('SELECT id FROM post_arrival_surveys WHERE case_id=?', [req.params.id]);
  if (existing) return res.status(409).json({ error: '该案例已有问卷记录，不可重复提交' });
  const { survey_date, overall_satisfaction, accommodation_ok, orientation_helpful, support_needed, comments, filled_by } = req.body;
  const id = uuidv4();
  db.run(`INSERT INTO post_arrival_surveys (id,case_id,survey_date,overall_satisfaction,accommodation_ok,orientation_helpful,support_needed,comments,filled_by) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, req.params.id, survey_date||new Date().toISOString().slice(0,10), overall_satisfaction||null, accommodation_ok?1:0, orientation_helpful?1:0, support_needed||null, comments||null, filled_by||'student']);
  // Only counselor/principal can close the case; student submission does NOT auto-close
  if (u.role === 'principal' || u.role === 'counselor') {
    db.run(`UPDATE intake_cases SET status='closed',updated_at=datetime('now') WHERE id=? AND status='oriented'`, [req.params.id]);
  }
  audit(req, 'CREATE', 'post_arrival_surveys', id, { case_id: req.params.id });
  res.json({ id, case_id: req.params.id });
});

app.get('/api/intake-cases/:id/docs', requireAdmissionModule, (req, res) => {
  const materials = db.all('SELECT * FROM material_items WHERE intake_case_id=? ORDER BY created_at DESC', [req.params.id]);
  res.json(materials);
});

app.post('/api/intake-cases/:id/docs', requireRole('principal','intake_staff'), (req, res) => {
  const { material_type, title, status, notes, doc_tag } = req.body;
  if (!material_type) return res.status(400).json({ error: '缺少 material_type' });
  if (!db.get('SELECT id FROM intake_cases WHERE id=?', [req.params.id])) return res.status(404).json({ error: 'Case 不存在' });
  const id = uuidv4();
  db.run(`INSERT INTO material_items (id,student_id,intake_case_id,material_type,title,status,notes,doc_tag) VALUES (?,?,?,?,?,?,?,?)`,
    [id, null, req.params.id, material_type, title||material_type, status||'未开始', notes||null, doc_tag||null]);
  audit(req, 'CREATE', 'material_items', id, { intake_case_id: req.params.id, material_type });
  res.json({ id, material_type, title: title||material_type, status: status||'未开始' });
});

app.post('/api/intake-cases/:id/tasks', requireRole('principal','intake_staff'), (req, res) => {
  const { title, description, category, due_date, priority, assigned_to } = req.body;
  if (!title) return res.status(400).json({ error: '缺少 title' });
  const ic = db.get('SELECT id, student_id FROM intake_cases WHERE id=?', [req.params.id]);
  if (!ic) return res.status(404).json({ error: 'Case 不存在' });
  const id = uuidv4();
  db.run(`INSERT INTO milestone_tasks (id,student_id,intake_case_id,title,description,category,due_date,status,priority,assigned_to) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, ic.student_id || '', req.params.id, title, description||null, category||'其他', due_date||null, 'pending', priority||'normal', assigned_to||null]);
  audit(req, 'CREATE', 'milestone_tasks', id, { intake_case_id: req.params.id, title });
  res.json({ id, title, status: 'pending' });
});

// ═══════════════════════════════════════════════════════
//  合同前文件打包发送
// ═══════════════════════════════════════════════════════

app.post('/api/intake-cases/:id/send-docs', requireRole('principal','intake_staff'), async (req, res) => {
  try {
  const { email, material_ids } = req.body;
  if (!email) return res.status(400).json({ error: '请提供收件人邮箱' });
  const ic = db.get('SELECT id, student_name FROM intake_cases WHERE id=?', [req.params.id]);
  if (!ic) return res.status(404).json({ error: 'Case 不存在' });

  // 1. 查询文件（无论有没有都继续）
  let files = [];
  try {
    if (material_ids && material_ids.length) {
      files = db.all(`SELECT * FROM material_items WHERE id IN (${material_ids.map(()=>'?').join(',')}) AND file_path IS NOT NULL`, material_ids);
    } else {
      files = db.all(`SELECT * FROM material_items WHERE intake_case_id=? AND file_path IS NOT NULL`, [req.params.id]);
    }
  } catch(e) { console.error('查询文件失败:', e.message); }

  // 2. 立即记录 docs_sent_at（无论邮件是否成功）
  db.run(`UPDATE intake_cases SET docs_sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [req.params.id]);

  // 3. 尝试发送邮件，失败只记录日志不报错
  try {
    if (files.length > 0) {
      const zipBuffer = await new Promise((resolve, reject) => {
        const arc = archiver('zip', { zlib: { level: 6 } });
        const chunks = [];
        arc.on('data', d => chunks.push(d));
        arc.on('end', () => resolve(Buffer.concat(chunks)));
        arc.on('error', reject);
        files.forEach(f => {
          const filePath = fileStorage.getFilePath(f.file_path);
          if (fs.existsSync(filePath)) {
            const ext = path.extname(f.file_path);
            arc.file(filePath, { name: (f.title || f.material_type) + ext });
          }
        });
        arc.finalize();
      });
      await sendMail(email, '入学材料包',
        `<p>您好，请查收附件中的入学相关文件（共 ${files.length} 份）。</p><p>如有疑问请联系我们。</p>`,
        [{ filename: 'intake_documents.zip', content: zipBuffer }]
      );
    } else {
      await sendMail(email, '入学通知',
        `<p>您好，顾问已与您取得联系，请关注后续材料。</p><p>如有疑问请联系我们。</p>`
      );
    }
  } catch(e) {
    console.error('send-docs 邮件发送失败（已记录发送时间）:', e.message);
  }

  audit(req, 'SEND_DOCS', 'intake_cases', req.params.id, { email, file_count: files.length });
  res.json({ ok: true, file_count: files.length, docs_sent_at: new Date().toISOString() });
  } catch(e) { console.error('send-docs error:', e.message); if(!res.headersSent) res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════
//  FILE EXCHANGE CENTER — 文件收发中心
// ═══════════════════════════════════════════════════════

function fxLog(recordId, caseId, action, actorType, actorName, notes, ip) {
  try {
    db.run(`INSERT INTO file_exchange_logs (id,record_id,case_id,action,actor_type,actor_name,notes,ip_address) VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), recordId, caseId, action, actorType||'admin', actorName||null, notes||null, ip||null]);
  } catch(e) { console.error('fxLog失败:', e.message); }
}

// 创建文件记录（上传文件）
app.post('/api/intake-cases/:id/file-exchange', requireRole('principal','intake_staff'), upload.single('file'), (req, res) => {
  const ic = db.get('SELECT id, student_name FROM intake_cases WHERE id=?', [req.params.id]);
  if (!ic) return res.status(404).json({ error: 'Case 不存在' });
  const { title, description, category, request_reply, reply_instruction, deadline_at, student_email, student_name, direction, related_stage, upload_items } = req.body;
  if (!title) return res.status(400).json({ error: '请填写文件标题' });
  const isRequestMode = parseInt(request_reply, 10) === 1;
  if (!req.file && !isRequestMode) return res.status(400).json({ error: '请上传文件（或勾选要求回传模式）' });
  const dir = direction || 'admin_to_student';
  const id = uuidv4();
  const caseStatus = db.get('SELECT status FROM intake_cases WHERE id=?', [req.params.id])?.status || '';
  const stage = related_stage || caseStatus;
  // 解析上传清单 JSON
  let itemsJson = null;
  if (upload_items) {
    try { const arr = JSON.parse(upload_items); if (Array.isArray(arr) && arr.length) itemsJson = upload_items; } catch(e) {}
  }
  db.run(`INSERT INTO file_exchange_records
    (id,case_id,title,description,direction,file_path,original_name,file_size,related_stage,category,status,request_reply,reply_instruction,deadline_at,student_email,student_name,created_by,created_by_name,upload_items)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, req.params.id, title, description||null, dir,
     req.file ? (moveUploadedFile(req.file.filename, 'exchange'), req.file.filename) : null,
     req.file ? req.file.originalname : null,
     req.file ? req.file.size : null,
     stage, category||null, 'draft',
     isRequestMode ? 1 : 0, reply_instruction||null, deadline_at||null,
     student_email||null, student_name||ic.student_name||null,
     req.session.user.id, req.session.user.name||req.session.user.username, itemsJson]);
  fxLog(id, req.params.id, 'uploaded', 'admin', req.session.user.name||req.session.user.username, `文件：${title}`, req.ip);
  audit(req, 'FX_CREATE', 'file_exchange_records', id, { title, direction: dir });
  res.json({ id, title, status: 'draft', direction: dir });
});

// 列出所有文件记录（含日志）
app.get('/api/intake-cases/:id/file-exchange', requireAdmissionModule, (req, res) => {
  const records = db.all(`SELECT * FROM file_exchange_records WHERE case_id=? AND is_deleted=0 AND direction='admin_to_student' ORDER BY created_at DESC`, [req.params.id]);
  const logs    = db.all(`SELECT * FROM file_exchange_logs WHERE case_id=? ORDER BY created_at DESC`, [req.params.id]);
  res.json({ records, logs });
});

// 发送文件给学生（生成 token，可选邮件）
app.put('/api/file-exchange/:id/send', requireRole('principal','intake_staff'), async (req, res) => {
  try {
  const rec = db.get('SELECT * FROM file_exchange_records WHERE id=? AND is_deleted=0', [req.params.id]);
  if (!rec) return res.status(404).json({ error: '记录不存在' });
  const accessToken = rec.access_token || uuidv4();
  const uploadToken = (rec.request_reply && !rec.upload_token) ? uuidv4() : (rec.upload_token || null);
  const { student_email, student_name } = req.body;
  const email = student_email || rec.student_email;
  const sname = student_name || rec.student_name;
  db.run(`UPDATE file_exchange_records SET status='sent', access_token=?, upload_token=?, sent_at=datetime('now'), student_email=COALESCE(?,student_email), student_name=COALESCE(?,student_name), updated_at=datetime('now') WHERE id=?`,
    [accessToken, uploadToken, email||null, sname||null, req.params.id]);
  const ic = db.get('SELECT student_name, program_name FROM intake_cases WHERE id=?', [rec.case_id]);
  const host = `${req.protocol}://${req.get('host')}`;
  const viewUrl = `${host}/s/fx/${accessToken}`;
  fxLog(req.params.id, rec.case_id, 'sent', 'admin', req.session.user.name||req.session.user.username, `发送给 ${sname||'—'} (${email||'无邮件'})`, req.ip);
  audit(req, 'FX_SEND', 'file_exchange_records', req.params.id, { email, request_reply: rec.request_reply });
  // 先返回响应，邮件在后台发——避免 SMTP 延迟阻塞前端
  res.json({ ok: true, access_token: accessToken, upload_token: uploadToken, view_url: viewUrl });
  if (email) {
    const _em1 = brandedEmail(
      `<p style="font-size:15px;color:#333;">顾问老师已向您发送文件：<strong>${escHtml(rec.title)}</strong></p>
      ${rec.description ? `<p style="color:#555;">${escHtml(rec.description)}</p>` : ''}
      ${rec.request_reply ? `<div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin:16px 0;">
        <strong style="color:#d97706;">⚠ 需要您上传文件</strong>
        ${rec.reply_instruction ? `<p style="margin:4px 0 0;color:#92400e;font-size:14px;">${escHtml(rec.reply_instruction)}</p>` : ''}
        ${rec.deadline_at ? `<p style="margin:4px 0 0;color:#dc2626;font-size:13px;">截止日期：${rec.deadline_at}</p>` : ''}
      </div>` : ''}`,
      { greeting: `您好 ${escHtml(sname||'同学')}，`, buttonUrl: viewUrl, buttonText: rec.request_reply ? '打开链接上传文件 →' : '查看文件 →', footerExtra: '如有疑问请联系您的顾问老师' }
    );
    sendMail(email, `文件通知：${rec.title} — ${ic?.student_name||''}`, _em1.html, _em1.attachments
    ).then(() => {
      fxLog(req.params.id, rec.case_id, 'email_sent', 'system', 'system', `邮件已发送至 ${email}`, null);
    }).catch(e => { console.error('fx send mail failed:', e.message); });
  }
  } catch(e) { console.error('fx send error:', e.message); res.status(500).json({ error: e.message }); }
});

// 关闭记录
app.put('/api/file-exchange/:id/close', requireRole('principal','intake_staff'), (req, res) => {
  const rec = db.get('SELECT id, case_id, title FROM file_exchange_records WHERE id=? AND is_deleted=0', [req.params.id]);
  if (!rec) return res.status(404).json({ error: '记录不存在' });
  db.run(`UPDATE file_exchange_records SET status='closed', updated_at=datetime('now') WHERE id=?`, [req.params.id]);
  fxLog(req.params.id, rec.case_id, 'closed', 'admin', req.session.user.name||req.session.user.username, null, req.ip);
  res.json({ ok: true });
});

// 软删除
app.delete('/api/file-exchange/:id', requireRole('principal','intake_staff'), (req, res) => {
  const rec = db.get('SELECT id, case_id, file_path, title FROM file_exchange_records WHERE id=?', [req.params.id]);
  if (!rec) return res.status(404).json({ error: '记录不存在' });
  db.run(`UPDATE file_exchange_records SET is_deleted=1, updated_at=datetime('now') WHERE id=?`, [req.params.id]);
  fxLog(req.params.id, rec.case_id, 'deleted', 'admin', req.session.user.name||req.session.user.username, `删除：${rec.title}`, req.ip);
  res.json({ ok: true });
});

// 编辑文件记录（标题/说明/邮箱/姓名，已发送状态也可修改）
app.patch('/api/file-exchange/:id', requireRole('principal','intake_staff'), (req, res) => {
  const rec = db.get('SELECT id, case_id, title FROM file_exchange_records WHERE id=? AND is_deleted=0', [req.params.id]);
  if (!rec) return res.status(404).json({ error: '记录不存在' });
  const { title, description, student_email, student_name } = req.body;
  if (title !== undefined && !String(title).trim()) return res.status(400).json({ error: '标题不能为空' });
  const updates = [];
  const params = [];
  if (title       !== undefined) { updates.push('title=?');         params.push(String(title).trim()); }
  if (description !== undefined) { updates.push('description=?');   params.push(description || null); }
  if (student_email !== undefined) { updates.push('student_email=?'); params.push(student_email || null); }
  if (student_name  !== undefined) { updates.push('student_name=?');  params.push(student_name  || null); }
  if (!updates.length) return res.status(400).json({ error: '无可更新字段' });
  updates.push("updated_at=datetime('now')");
  params.push(req.params.id);
  db.run(`UPDATE file_exchange_records SET ${updates.join(',')} WHERE id=?`, params);
  fxLog(req.params.id, rec.case_id, 'edited', 'admin', req.session.user.name||req.session.user.username, `编辑：${title||rec.title}`, req.ip);
  audit(req, 'FX_EDIT', 'file_exchange_records', req.params.id, { title, description });
  res.json({ ok: true });
});

// 催办（发送提醒邮件）
app.post('/api/file-exchange/:id/remind', requireRole('principal','intake_staff'), async (req, res) => {
  const rec = db.get('SELECT * FROM file_exchange_records WHERE id=? AND is_deleted=0', [req.params.id]);
  if (!rec) return res.status(404).json({ error: '记录不存在' });
  if (!rec.access_token) return res.status(400).json({ error: '请先发送文件给学生' });
  const email = req.body.email || rec.student_email;
  if (!email) return res.status(400).json({ error: '学生邮箱未填写' });
  // 24小时冷却：防止频繁催办骚扰学生
  const lastRemind = db.get(`SELECT created_at FROM file_exchange_logs WHERE record_id=? AND action='reminded' ORDER BY created_at DESC LIMIT 1`, [req.params.id]);
  if (lastRemind) {
    const elapsed = Date.now() - new Date(lastRemind.created_at).getTime();
    if (elapsed < 24 * 3600 * 1000) {
      const nextTime = new Date(new Date(lastRemind.created_at).getTime() + 24 * 3600 * 1000);
      return res.status(429).json({ error: `催办过于频繁，下次可催办时间：${nextTime.toLocaleString('zh-CN')}` });
    }
  }
  const host = `${req.protocol}://${req.get('host')}`;
  const viewUrl = `${host}/s/fx/${rec.access_token}`;
  fxLog(req.params.id, rec.case_id, 'reminded', 'admin', req.session.user.name||req.session.user.username, `催办邮件已发至 ${email}`, req.ip);
  res.json({ ok: true });
  const _em2 = brandedEmail(
    `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:14px;margin:0 0 16px;">
      <strong style="color:#dc2626;">⏰ 催办提醒</strong>
      <p style="margin:4px 0 0;color:#333;">请尽快查看并回传文件：<strong>${escHtml(rec.title)}</strong></p>
      ${rec.deadline_at ? `<p style="margin:4px 0 0;color:#dc2626;font-weight:600;">截止日期：${rec.deadline_at}</p>` : ''}
    </div>`,
    { greeting: `您好 ${escHtml(rec.student_name||'同学')}，`, buttonUrl: viewUrl, buttonText: '打开链接处理 →', footerExtra: '请及时处理，如有疑问请联系顾问老师' }
  );
  sendMail(email, `【催办】请查看/上传文件：${rec.title}`, _em2.html, _em2.attachments
  ).catch(e => { console.error('fx remind mail failed:', e.message); });
});

// 管理员下载文件
app.get('/api/file-exchange/:id/download', requireAdmissionModule, (req, res) => {
  const rec = db.get('SELECT * FROM file_exchange_records WHERE id=? AND is_deleted=0', [req.params.id]);
  if (!rec) return res.status(404).json({ error: '记录不存在' });
  const fp = fileStorage.getFilePath(rec.file_path || '');
  if (!rec.file_path || !fs.existsSync(fp)) return res.status(404).json({ error: '文件不存在' });
  fxLog(req.params.id, rec.case_id, 'admin_downloaded', 'admin', req.session.user.name||req.session.user.username, null, req.ip);
  const ext = path.extname(rec.file_path);
  const safeName = (rec.original_name || rec.title).replace(/[^\w.\u4e00-\u9fa5-]/g,'_') + (rec.original_name ? '' : ext);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}"`);
  res.sendFile(fp);
});

// 管理员下载学生回传文件
app.get('/api/file-exchange/:id/reply-download', requireAdmissionModule, (req, res) => {
  const reply = db.get('SELECT * FROM file_exchange_records WHERE parent_id=? AND direction=? AND is_deleted=0 ORDER BY created_at DESC LIMIT 1', [req.params.id, 'student_to_admin']);
  if (!reply || !reply.file_path) return res.status(404).json({ error: '学生尚未上传回传文件' });
  const fp = fileStorage.getFilePath(reply.file_path);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: '文件不存在' });
  fxLog(req.params.id, reply.case_id, 'admin_reviewed_reply', 'admin', req.session.user.name||req.session.user.username, null, req.ip);
  db.run(`UPDATE file_exchange_records SET reviewed_by=?, reviewed_at=datetime('now') WHERE id=?`, [req.session.user.id, reply.id]);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(reply.original_name || '学生回传文件')}"`);
  res.sendFile(fp);
});

// ── 学生端公开路由 ─────────────────────────────────────

// 学生查看文件页
app.get('/s/fx/:token', (req, res) => {
  const rec = db.get('SELECT * FROM file_exchange_records WHERE access_token=? AND is_deleted=0', [req.params.token]);
  if (!rec) return res.status(404).send('<h2>链接无效或已失效</h2>');
  // 标记已查看（deadline_at 是上传截止日，非访问过期；无单独 expires_at 字段）
  if (!rec.viewed_at) {
    db.run(`UPDATE file_exchange_records SET viewed_at=datetime('now'), status=CASE WHEN status='sent' AND request_reply=1 THEN 'awaiting_upload' WHEN status='sent' THEN 'viewed' ELSE status END, updated_at=datetime('now') WHERE id=?`, [rec.id]);
    fxLog(rec.id, rec.case_id, 'student_viewed', 'student', rec.student_name||'学生', null, req.ip);
  }
  // 检查是否已逾期
  const isOverdue = rec.deadline_at && new Date(rec.deadline_at) < new Date() && rec.status !== 'replied' && rec.status !== 'closed';
  if (isOverdue && rec.status === 'awaiting_upload') {
    db.run(`UPDATE file_exchange_records SET status='overdue', updated_at=datetime('now') WHERE id=?`, [rec.id]);
  }
  // 查找已有回传件
  const replies = db.all(`SELECT * FROM file_exchange_records WHERE parent_id=? AND direction='student_to_admin' AND is_deleted=0 ORDER BY created_at DESC`, [rec.id]);
  const isPdf = rec.file_path && /\.pdf$/i.test(rec.file_path);
  const isImage = rec.file_path && /\.(jpg|jpeg|png|gif)$/i.test(rec.file_path);
  const statusMap = { draft:'草稿', sent:'已发送', viewed:'已查看', awaiting_upload:'待上传', overdue:'已逾期', replied:'已回传', closed:'已完成' };
  // ── 计算上传清单数据 ──
  let uploadItems = [];
  try { if (rec.upload_items) uploadItems = JSON.parse(rec.upload_items); } catch(e) {}
  const replyMap = {};
  replies.forEach(r => { const key = (r.title||'').replace('【回传】','').replace('【上传】','').trim(); replyMap[key] = r; });
  const hasItems = uploadItems.length > 0;
  const doneCount = hasItems ? uploadItems.filter(i => replyMap[i.name]).length : replies.length;
  const totalCount = hasItems ? uploadItems.length : (doneCount || 1);
  const reqCount = uploadItems.filter(i => i.required).length;
  const reqDone = uploadItems.filter(i => i.required && replyMap[i.name]).length;
  const allComplete = hasItems ? (reqCount > 0 ? reqDone >= reqCount : doneCount >= totalCount) : replies.length > 0;
  const pct = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;

  // ── 状态相关 ──
  const statusColor = allComplete ? '#16a34a' : isOverdue ? '#dc2626' : rec.status==='awaiting_upload' ? '#d97706' : rec.status==='replied'||rec.status==='closed' ? '#16a34a' : '#A51C30';
  const statusLabel = allComplete ? '已完成' : (statusMap[rec.status]||rec.status);
  const deadlineDays = rec.deadline_at ? Math.ceil((new Date(rec.deadline_at) - new Date()) / 86400000) : null;

  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(rec.title)} — Equistar International College</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
  <style>
    :root{--brand:#A51C30;--brand-dark:#8B1425;--brand-light:#FBF0F1;--brand-lighter:#fdf7f8;--green:#16a34a;--green-light:#f0fdf4;--green-border:#bbf7d0;--warn:#d97706;--warn-light:#fffbeb;--red:#dc2626;--gray-50:#f9fafb;--gray-100:#f3f4f6;--gray-200:#e5e7eb;--gray-400:#9ca3af;--gray-600:#4b5563;--gray-800:#1f2937;--radius:12px;--shadow:0 4px 24px rgba(0,0,0,.06);--shadow-lg:0 8px 40px rgba(0,0,0,.1)}
    *{box-sizing:border-box}
    body{margin:0;background:var(--gray-50);min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--gray-800)}

    /* ── Header ── */
    .page-header{background:#fff;border-bottom:1px solid var(--gray-200);padding:16px 0;text-align:center}
    .page-header .logo-wrap{display:inline-flex;align-items:center;gap:12px}
    .page-header img{height:42px}
    .page-header .school-name{font-size:17px;font-weight:700;color:var(--gray-800);letter-spacing:.3px}
    .page-header .school-url{font-size:11px;color:var(--gray-400);margin-top:1px}

    /* ── Accent bar ── */
    .accent-bar{height:4px;background:linear-gradient(90deg,var(--brand) 0%,#d4424f 50%,var(--brand-dark) 100%)}

    /* ── Container ── */
    .page-wrap{max-width:640px;margin:0 auto;padding:24px 16px 40px}

    /* ── Welcome banner ── */
    .welcome{background:#fff;border:1px solid var(--gray-200);border-radius:var(--radius);padding:20px 24px;margin-bottom:20px;box-shadow:var(--shadow)}
    .welcome h1{font-size:20px;font-weight:700;margin:0 0 4px;color:var(--gray-800)}
    .welcome .sub{font-size:14px;color:var(--gray-600);margin:0}

    /* ── Status strip ── */
    .status-strip{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px}
    .status-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600;color:#fff}
    .deadline-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:500;border:1px solid var(--gray-200);background:#fff;color:var(--gray-600)}
    .deadline-chip.urgent{border-color:#fca5a5;background:#fef2f2;color:var(--red);font-weight:600}
    .deadline-chip.soon{border-color:#fde68a;background:var(--warn-light);color:var(--warn)}

    /* ── Card ── */
    .fx-card{background:#fff;border:1px solid var(--gray-200);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;margin-bottom:20px}
    .fx-card-head{padding:16px 20px;border-bottom:1px solid var(--gray-100);display:flex;align-items:center;justify-content:space-between}
    .fx-card-head h3{font-size:15px;font-weight:700;margin:0;display:flex;align-items:center;gap:8px}
    .fx-card-body{padding:20px}

    /* ── Progress ── */
    .progress-wrap{margin-bottom:20px}
    .progress-label{display:flex;justify-content:space-between;font-size:13px;color:var(--gray-600);margin-bottom:6px}
    .progress-bar-outer{height:8px;background:var(--gray-100);border-radius:4px;overflow:hidden}
    .progress-bar-inner{height:100%;border-radius:4px;transition:width .4s ease}

    /* ── File item ── */
    .file-item{border:1px solid var(--gray-200);border-radius:10px;padding:16px;margin-bottom:12px;transition:all .2s}
    .file-item:hover{border-color:#d1d5db;box-shadow:0 2px 8px rgba(0,0,0,.04)}
    .file-item.done{background:var(--green-light);border-color:var(--green-border)}
    .file-item .fi-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
    .file-item .fi-name{font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px}
    .file-item .fi-name i{font-size:18px}
    .fi-badge{font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600}
    .fi-badge.req{background:#fef2f2;color:var(--red)}
    .fi-badge.opt{background:var(--gray-100);color:var(--gray-400)}
    .fi-status{font-size:12px;padding:3px 10px;border-radius:12px;font-weight:600}
    .fi-status.pending{background:var(--warn-light);color:var(--warn)}
    .fi-status.uploaded{background:var(--green-light);color:var(--green)}
    .fi-uploaded-info{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--green);margin-bottom:8px}
    .fi-uploaded-info i{font-size:16px}

    /* ── Upload zone ── */
    .upload-zone{border:2px dashed var(--gray-200);border-radius:10px;padding:16px;text-align:center;transition:all .2s;cursor:pointer;position:relative}
    .upload-zone:hover{border-color:var(--brand);background:var(--brand-lighter)}
    .upload-zone i{font-size:28px;color:var(--brand);opacity:.6}
    .upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer}
    .upload-zone .file-name{margin-top:6px;font-size:13px;color:var(--brand);font-weight:500;display:none}
    .upload-zone.has-file{border-color:var(--brand);background:var(--brand-lighter)}
    .upload-zone.has-file .file-name{display:block}
    .upload-zone.has-file .uz-hint{display:none}

    /* ── Buttons ── */
    .btn-brand{background:var(--brand);color:#fff;border:none;font-weight:600;padding:10px 24px;border-radius:8px;font-size:14px;transition:all .15s}
    .btn-brand:hover{background:var(--brand-dark);color:#fff;transform:translateY(-1px);box-shadow:0 4px 12px rgba(165,28,48,.3)}
    .btn-brand:active{transform:translateY(0)}
    .btn-brand-outline{background:#fff;color:var(--brand);border:1.5px solid var(--brand);font-weight:600;padding:8px 20px;border-radius:8px;font-size:13px;transition:all .15s}
    .btn-brand-outline:hover{background:var(--brand-light);color:var(--brand-dark)}

    /* ── Preview ── */
    .preview-frame{border:1px solid var(--gray-200);border-radius:10px;overflow:hidden;margin-bottom:12px}

    /* ── All done ── */
    .all-done{text-align:center;padding:24px;background:var(--green-light);border:1px solid var(--green-border);border-radius:var(--radius)}
    .all-done i{font-size:40px;color:var(--green)}
    .all-done h4{margin:8px 0 4px;color:var(--green)}

    /* ── Footer ── */
    .page-footer{text-align:center;padding:20px 16px 32px;font-size:12px;color:var(--gray-400)}
    .page-footer a{color:var(--brand);text-decoration:none}
    .page-footer .divider{display:inline-block;width:3px;height:3px;border-radius:50%;background:var(--gray-400);margin:0 8px;vertical-align:middle}

    /* ── Responsive ── */
    @media(max-width:576px){
      .page-wrap{padding:16px 12px 32px}
      .fx-card-body{padding:16px}
      .file-item{padding:12px}
      .welcome{padding:16px}
      .welcome h1{font-size:18px}
    }
  </style>
</head>
<body>
<!-- Header -->
<div class="page-header">
  <div class="logo-wrap">
    <img src="/esic-logo.jpg" alt="ESIC" onerror="this.style.display='none'">
    <div>
      <div class="school-name">Equistar International College</div>
      <div class="school-url">www.esic.edu.sg</div>
    </div>
  </div>
</div>
<div class="accent-bar"></div>

<div class="page-wrap">
  <!-- Welcome -->
  <div class="welcome">
    <h1>${escHtml(rec.title)}</h1>
    <p class="sub">${rec.description ? escHtml(rec.description) : (rec.request_reply ? 'Please complete your document submission below.' : 'The following document has been shared with you.')}</p>
  </div>

  <!-- Status + Deadline -->
  <div class="status-strip">
    <span class="status-chip" style="background:${statusColor}">${statusLabel}</span>
    ${rec.deadline_at ? `<span class="deadline-chip ${isOverdue?'urgent':deadlineDays!==null&&deadlineDays<=3?'soon':''}">
      <i class="bi bi-calendar3"></i>
      ${isOverdue ? '已逾期' : deadlineDays!==null&&deadlineDays<=0 ? '今日截止' : deadlineDays!==null&&deadlineDays<=3 ? '剩余 '+deadlineDays+' 天' : '截止 '+rec.deadline_at}
    </span>` : ''}
    ${rec.reply_instruction ? `<span class="deadline-chip"><i class="bi bi-info-circle"></i>${escHtml(rec.reply_instruction)}</span>` : ''}
  </div>

  ${allComplete && rec.request_reply ? `
  <!-- All done banner -->
  <div class="all-done mb-4">
    <i class="bi bi-check-circle-fill"></i>
    <h4>材料已提交完成</h4>
    <p class="small text-muted mb-0">感谢您的配合，老师会尽快审核您的材料。</p>
  </div>` : ''}

  <!-- Attached file preview -->
  ${rec.file_path ? `
  <div class="fx-card">
    <div class="fx-card-head">
      <h3><i class="bi bi-paperclip" style="color:var(--brand)"></i>附件文件</h3>
      <a href="/s/fx/${escHtml(rec.access_token)}/dl" class="btn-brand-outline" download><i class="bi bi-download me-1"></i>下载</a>
    </div>
    <div class="fx-card-body" style="padding:0">
      ${isPdf ? `<div class="preview-frame" style="margin:0;border:none;border-radius:0"><iframe src="/s/fx/${escHtml(rec.access_token)}/dl" style="width:100%;height:500px;border:none"></iframe></div>` : ''}
      ${isImage ? `<div class="p-3"><img src="/s/fx/${escHtml(rec.access_token)}/dl" class="img-fluid rounded"></div>` : ''}
      ${!isPdf && !isImage ? `<div class="p-4 text-center"><i class="bi bi-file-earmark fs-1" style="color:var(--gray-400)"></i><div class="mt-2 text-muted">${escHtml(rec.original_name||rec.title)}</div></div>` : ''}
    </div>
  </div>` : ''}

  <!-- Upload section -->
  ${rec.request_reply && rec.upload_token ? (() => {
    if (hasItems) {
      // ── 多项清单模式 ──
      const itemsHtml = uploadItems.map((item, idx) => {
        const uploaded = replyMap[item.name];
        return '<div class="file-item '+(uploaded?'done':'')+'">'
          + '<div class="fi-top">'
          + '<div class="fi-name">'
          + '<i class="bi '+(uploaded?'bi-file-earmark-check':'bi-file-earmark-arrow-up')+'" style="color:'+(uploaded?'var(--green)':'var(--brand)')+'"></i>'
          + escHtml(item.name)
          + ' <span class="fi-badge '+(item.required?'req':'opt')+'">'+(item.required?'必交':'选交')+'</span>'
          + '</div>'
          + '<span class="fi-status '+(uploaded?'uploaded':'pending')+'">'
          + (uploaded ? '<i class="bi bi-check-circle me-1"></i>已上传' : '<i class="bi bi-clock me-1"></i>待上传')
          + '</span>'
          + '</div>'
          + (uploaded
            ? '<div class="fi-uploaded-info"><i class="bi bi-check-circle-fill"></i>'+escHtml(uploaded.original_name||uploaded.title)+' <span class="text-muted" style="font-size:12px">'+uploaded.created_at.slice(0,16)+'</span></div>'
              + '<details><summary class="small" style="color:var(--brand);cursor:pointer;font-weight:500">替换文件</summary>'
              + '<form method="POST" action="/s/fx/'+escHtml(rec.upload_token)+'/reply-item" enctype="multipart/form-data" class="mt-2">'
              + '<input type="hidden" name="item_name" value="'+escHtml(item.name)+'">'
              + '<div class="d-flex gap-2"><input class="form-control form-control-sm" type="file" name="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" required>'
              + '<button type="submit" class="btn-brand-outline" style="white-space:nowrap">重新上传</button></div></form></details>'
            : '<form method="POST" action="/s/fx/'+escHtml(rec.upload_token)+'/reply-item" enctype="multipart/form-data" onsubmit="this.querySelector(\'button\').disabled=true;this.querySelector(\'button\').innerHTML=\'<i class=bi-arrow-repeat></i> 上传中...\'">'
              + '<input type="hidden" name="item_name" value="'+escHtml(item.name)+'">'
              + '<div class="upload-zone" id="uz'+idx+'">'
              + '<i class="bi bi-cloud-arrow-up"></i>'
              + '<div class="uz-hint small text-muted mt-1">点击选择文件或拖拽到此处</div>'
              + '<div class="file-name"></div>'
              + '<input type="file" name="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" required onchange="var z=this.closest(\'.upload-zone\'),n=z.querySelector(\'.file-name\');if(this.files[0]){n.textContent=this.files[0].name;z.classList.add(\'has-file\')}else{z.classList.remove(\'has-file\');n.textContent=\'\'}">'
              + '</div>'
              + '<button type="submit" class="btn-brand w-100 mt-3"><i class="bi bi-upload me-1"></i>确认上传</button>'
              + '</form>'
          )
          + '</div>';
      }).join('');

      return `
      <div class="fx-card">
        <div class="fx-card-head" style="background:var(--brand-lighter)">
          <h3 style="color:var(--brand)"><i class="bi bi-cloud-arrow-up"></i>文件上传</h3>
          <span class="small fw-semibold" style="color:var(--brand)">${doneCount} / ${totalCount}</span>
        </div>
        <div class="fx-card-body">
          <div class="progress-wrap">
            <div class="progress-label"><span>${reqCount?'必交项 '+reqDone+'/'+reqCount:'上传进度'}</span><span>${pct}%</span></div>
            <div class="progress-bar-outer"><div class="progress-bar-inner" style="width:${pct}%;background:${pct>=100?'var(--green)':'var(--brand)'}"></div></div>
          </div>
          ${itemsHtml}
        </div>
      </div>`;
    } else {
      // ── 通用上传模式 ──
      return `
      <div class="fx-card">
        <div class="fx-card-head" style="background:var(--brand-lighter)">
          <h3 style="color:var(--brand)"><i class="bi bi-upload"></i>上传文件</h3>
        </div>
        <div class="fx-card-body">
          ${replies.length ? `<div style="background:var(--green-light);border:1px solid var(--green-border);border-radius:10px;padding:14px 16px;margin-bottom:16px;">
            <div class="fw-semibold" style="color:var(--green)"><i class="bi bi-check-circle-fill me-1"></i>已上传 ${replies.length} 个文件</div>
            ${replies.map(r=>'<div class="small mt-1" style="color:var(--gray-600)"><i class="bi bi-file-earmark me-1"></i>'+escHtml(r.original_name||r.title)+' · '+r.created_at.slice(0,16)+'</div>').join('')}
          </div>` : ''}
          <form method="POST" action="/s/fx/${escHtml(rec.upload_token)}/reply" enctype="multipart/form-data" onsubmit="this.querySelector('button[type=submit]').disabled=true;this.querySelector('button[type=submit]').innerHTML='<i class=bi-arrow-repeat></i> 上传中...'">
            <div class="upload-zone" id="uzMain">
              <i class="bi bi-cloud-arrow-up"></i>
              <div class="uz-hint small text-muted mt-1">点击选择文件或拖拽到此处</div>
              <div class="file-name"></div>
              <input type="file" name="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" required onchange="var z=this.closest('.upload-zone'),n=z.querySelector('.file-name');if(this.files[0]){n.textContent=this.files[0].name;z.classList.add('has-file')}else{z.classList.remove('has-file');n.textContent=''}">
            </div>
            <div class="form-text small text-center mt-1 mb-3" style="color:var(--gray-400)">支持 PDF / Word / 图片 / ZIP，最大 10MB</div>
            <button type="submit" class="btn-brand w-100"><i class="bi bi-upload me-1"></i>${replies.length ? '补充上传' : '确认上传'}</button>
          </form>
        </div>
      </div>`;
    }
  })() : ''}
</div>

<!-- Footer -->
<div class="page-footer">
  <div>Equistar International College</div>
  <div style="margin-top:4px">
    <span>1 Selegie Rd #07-02, Singapore</span>
    <span class="divider"></span>
    <a href="https://www.esic.edu.sg">www.esic.edu.sg</a>
  </div>
</div>
</body></html>`);
});

// 学生下载文件
app.get('/s/fx/:token/dl', (req, res) => {
  const rec = db.get('SELECT * FROM file_exchange_records WHERE access_token=? AND is_deleted=0', [req.params.token]);
  if (!rec || !rec.file_path) return res.status(404).send('文件不存在');
  const fp = fileStorage.getFilePath(rec.file_path);
  if (!fs.existsSync(fp)) return res.status(404).send('文件不存在');
  fxLog(rec.id, rec.case_id, 'student_downloaded', 'student', rec.student_name||'学生', null, req.ip);
  const isPdfDl = rec.file_path && /\.pdf$/i.test(rec.file_path);
  const isImgDl = rec.file_path && /\.(jpg|jpeg|png|gif)$/i.test(rec.file_path);
  const dispDl = (isPdfDl || isImgDl) ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${dispDl}; filename="${encodeURIComponent(rec.original_name||rec.title)}"`);
  res.sendFile(fp);
});

// 学生上传回传件
app.post('/s/fx/:token/reply', upload.single('file'), (req, res) => {
  const rec = db.get('SELECT * FROM file_exchange_records WHERE upload_token=? AND is_deleted=0', [req.params.token]);
  if (!rec) return res.status(404).send('<h2>链接无效或已失效</h2>');
  if (rec.status === 'closed') return res.redirect(`/s/fx/${rec.access_token}`);
  if (!req.file) return res.redirect(`/s/fx/${rec.access_token}`);
  moveUploadedFile(req.file.filename, 'exchange');
  // 软删除之前的回传件（允许替换）
  db.run(`UPDATE file_exchange_records SET is_deleted=1, updated_at=datetime('now') WHERE parent_id=? AND direction='student_to_admin'`, [rec.id]);
  // 创建新回传记录
  const replyId = uuidv4();
  db.run(`INSERT INTO file_exchange_records (id,case_id,title,direction,file_path,original_name,file_size,status,parent_id,created_by,created_by_name,related_stage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [replyId, rec.case_id, `【回传】${rec.title}`, 'student_to_admin', req.file.filename, req.file.originalname, req.file.size, 'uploaded_by_student', rec.id, 'student', rec.student_name||'学生', rec.related_stage]);
  db.run(`UPDATE file_exchange_records SET status='replied', replied_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [rec.id]);
  fxLog(rec.id, rec.case_id, 'student_uploaded_reply', 'student', rec.student_name||'学生', `上传：${req.file.originalname}`, req.ip);
  // 通知 intake_staff / principal
  try {
    const ic = db.get('SELECT student_name FROM intake_cases WHERE id=?', [rec.case_id]);
    db.all(`SELECT id FROM users WHERE role IN ('principal','intake_staff')`).forEach(u => {
      db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_user_id,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`,
        [uuidv4(), null, 'system', '学生已上传回传文件',
         `${ic?.student_name||rec.student_name||'学生'} 已上传文件《${rec.title}》的回传件，请查看。`, u.id]);
    });
  } catch(e) { console.error('回传通知失败:', e.message); }
  res.redirect(`/s/fx/${rec.access_token}`);
});

// 按清单项上传（多文件逐项上传）
app.post('/s/fx/:token/reply-item', upload.single('file'), (req, res) => {
  const rec = db.get('SELECT * FROM file_exchange_records WHERE upload_token=? AND is_deleted=0', [req.params.token]);
  if (!rec) return res.status(404).send('<h2>链接无效或已失效</h2>');
  if (rec.status === 'closed') return res.redirect(`/s/fx/${rec.access_token}`);
  if (!req.file) return res.redirect(`/s/fx/${rec.access_token}`);
  moveUploadedFile(req.file.filename, 'exchange');
  const itemName = req.body.item_name || rec.title;
  // 软删除同名旧回传件（允许替换）
  db.run(`UPDATE file_exchange_records SET is_deleted=1, updated_at=datetime('now') WHERE parent_id=? AND direction='student_to_admin' AND title=? AND is_deleted=0`, [rec.id, `【上传】${itemName}`]);
  // 创建新回传记录（标题带项目名）
  const replyId = uuidv4();
  db.run(`INSERT INTO file_exchange_records (id,case_id,title,direction,file_path,original_name,file_size,status,parent_id,created_by,created_by_name,related_stage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [replyId, rec.case_id, `【上传】${itemName}`, 'student_to_admin', req.file.filename, req.file.originalname, req.file.size, 'uploaded_by_student', rec.id, 'student', rec.student_name||'学生', rec.related_stage]);
  // 检查是否所有必须项都已上传
  let allDone = true;
  try {
    const items = JSON.parse(rec.upload_items || '[]');
    const replies = db.all(`SELECT title FROM file_exchange_records WHERE parent_id=? AND direction='student_to_admin' AND is_deleted=0`, [rec.id]);
    const replyNames = new Set(replies.map(r => r.title.replace('【上传】','').replace('【回传】','').trim()));
    const reqItems = items.filter(i => i.required);
    allDone = reqItems.every(i => replyNames.has(i.name));
  } catch(e) { allDone = true; }
  db.run(`UPDATE file_exchange_records SET status=?, replied_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
    [allDone ? 'replied' : 'awaiting_upload', rec.id]);
  fxLog(rec.id, rec.case_id, 'student_uploaded_item', 'student', rec.student_name||'学生', `上传：${itemName} (${req.file.originalname})`, req.ip);
  // 通知 staff
  try {
    const ic = db.get('SELECT student_name FROM intake_cases WHERE id=?', [rec.case_id]);
    db.all(`SELECT id FROM users WHERE role IN ('principal','intake_staff')`).forEach(u => {
      db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_user_id,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`,
        [uuidv4(), null, 'system', '学生已上传文件',
         `${ic?.student_name||rec.student_name||'学生'} 已上传「${itemName}」(${req.file.originalname})`, u.id]);
    });
  } catch(e) {}
  res.redirect(`/s/fx/${rec.access_token}`);
});

// ═══════════════════════════════════════════════════════
//  CASE FILES — 案例文件上传 / 发送 / 学生端链接
// ═══════════════════════════════════════════════════════

// 上传案例文件
app.post('/api/intake-cases/:id/case-files', requireRole('principal','intake_staff'), upload.single('file'), (req, res) => {
  const ic = db.get('SELECT id, student_name FROM intake_cases WHERE id=?', [req.params.id]);
  if (!ic) return res.status(404).json({ error: 'Case 不存在' });
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  const { file_type, display_name, notes } = req.body;
  if (!file_type || !display_name) return res.status(400).json({ error: '请填写文件类型和名称' });
  moveUploadedFile(req.file.filename, 'case');
  const id = uuidv4();
  db.run(`INSERT INTO case_files (id,case_id,file_type,display_name,filename,original_name,file_size,uploaded_by,uploaded_by_name,notes) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, req.params.id, file_type, display_name, req.file.filename, req.file.originalname, req.file.size,
     req.session.user.id, req.session.user.name || req.session.user.username, notes || null]);
  audit(req, 'UPLOAD_CASE_FILE', 'case_files', id, { case_id: req.params.id, file_type, display_name });
  res.json({ id, file_type, display_name, filename: req.file.filename, created_at: new Date().toISOString() });
});

// 列出案例文件（含发送记录和签字结果）
app.get('/api/intake-cases/:id/case-files', requireAdmissionModule, (req, res) => {
  const files = db.all('SELECT * FROM case_files WHERE case_id=? ORDER BY created_at DESC', [req.params.id]);
  const sends = db.all('SELECT * FROM case_file_sends WHERE case_id=? ORDER BY sent_at DESC', [req.params.id]);
  const sigs  = db.all('SELECT * FROM case_signatures WHERE case_id=? ORDER BY signed_at DESC', [req.params.id]);
  // 为每个文件附加最近发送记录
  const filesWithSends = files.map(f => ({
    ...f,
    sends: sends.filter(s => s.file_id === f.id),
  }));
  res.json({ files: filesWithSends, sends, signatures: sigs });
});

// 删除案例文件
app.delete('/api/case-files/:id', requireRole('principal','intake_staff'), (req, res) => {
  const f = db.get('SELECT * FROM case_files WHERE id=?', [req.params.id]);
  if (!f) return res.status(404).json({ error: '文件不存在' });
  try {
    const fp = fileStorage.getFilePath(f.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch(e) { console.error('删除文件失败:', e.message); }
  db.run('DELETE FROM case_file_sends WHERE file_id=?', [req.params.id]);
  db.run('DELETE FROM case_files WHERE id=?', [req.params.id]);
  audit(req, 'DELETE_CASE_FILE', 'case_files', req.params.id, { display_name: f.display_name });
  res.json({ ok: true });
});

// 生成文件查看/下载链接（发给学生）
app.post('/api/case-files/:id/send', requireRole('principal','intake_staff'), async (req, res) => {
  const f = db.get('SELECT * FROM case_files WHERE id=?', [req.params.id]);
  if (!f) return res.status(404).json({ error: '文件不存在' });
  const { student_email, student_name, with_watermark, watermark_text } = req.body;
  const token = uuidv4();
  const sendId = uuidv4();
  const watermark = with_watermark ? 1 : 0;
  const wmText = watermark_text || '仅供查看';
  db.run(`INSERT INTO case_file_sends (id,file_id,case_id,send_type,token,student_email,student_name,sent_by,sent_by_name,with_watermark,watermark_text) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [sendId, f.id, f.case_id, 'file_view', token, student_email||null, student_name||null,
     req.session.user.id, req.session.user.name || req.session.user.username, watermark, wmText]);
  const fileUrl = `${req.protocol}://${req.get('host')}/s/file/${token}`;
  if (student_email) {
    const ic = db.get('SELECT student_name, program_name FROM intake_cases WHERE id=?', [f.case_id]);
    sendMail(student_email,
      `文件通知 - ${ic?.student_name || ''} - ${f.display_name}`,
      `<p>您好 ${student_name||'同学'}，</p><p>请点击以下链接查看文件：<strong>${f.display_name}</strong></p>
      <p><a href="${fileUrl}" style="font-size:1.1em;font-weight:bold;">${fileUrl}</a></p>
      ${watermark ? `<p style="color:#888;font-size:0.9em;">注：该文件为${wmText}版本</p>` : ''}
      <p>如有疑问请联系顾问老师。</p>`
    ).catch(e => { console.error('send file email failed:', e.message); });
  }
  audit(req, 'SEND_CASE_FILE', 'case_file_sends', sendId, { file_id: f.id, student_email, with_watermark: watermark });
  res.json({ ok: true, token, url: fileUrl, send_id: sendId });
});

// 生成学生上传已签合同链接
app.post('/api/intake-cases/:id/contract-upload-link', requireRole('principal','intake_staff'), async (req, res) => {
  const ic = db.get('SELECT id, student_name FROM intake_cases WHERE id=?', [req.params.id]);
  if (!ic) return res.status(404).json({ error: 'Case 不存在' });
  const { student_email, student_name } = req.body;
  const token = uuidv4();
  const sendId = uuidv4();
  db.run(`INSERT INTO case_file_sends (id,file_id,case_id,send_type,token,student_email,student_name,sent_by,sent_by_name) VALUES (?,?,?,?,?,?,?,?,?)`,
    [sendId, null, req.params.id, 'contract_upload', token, student_email||null, student_name||ic.student_name,
     req.session.user.id, req.session.user.name || req.session.user.username]);
  const uploadUrl = `${req.protocol}://${req.get('host')}/s/upload/${token}`;
  if (student_email) {
    sendMail(student_email,
      `请上传已签合同 - ${ic.student_name}`,
      `<p>您好 ${student_name||ic.student_name}，</p>
      <p>请点击以下链接，上传您签署好的合同：</p>
      <p><a href="${uploadUrl}" style="font-size:1.1em;font-weight:bold;">${uploadUrl}</a></p>
      <p>上传后我们将尽快确认，如有疑问请联系顾问老师。</p>`
    ).catch(e => { console.error('contract upload email failed:', e.message); });
  }
  audit(req, 'GEN_UPLOAD_LINK', 'case_file_sends', sendId, { case_id: req.params.id, student_email });
  res.json({ ok: true, token, url: uploadUrl, send_id: sendId });
});

// 创建签字请求（发签字链接给学生）
app.post('/api/intake-cases/:id/signature-requests', requireRole('principal','intake_staff'), async (req, res) => {
  const ic = db.get('SELECT id, student_name FROM intake_cases WHERE id=?', [req.params.id]);
  if (!ic) return res.status(404).json({ error: 'Case 不存在' });
  const { student_email, student_name, title, description } = req.body;
  const token = uuidv4();
  const sendId = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.run(`INSERT INTO case_file_sends (id,file_id,case_id,send_type,token,student_email,student_name,sent_by,sent_by_name,title,description,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [sendId, null, req.params.id, 'signature', token, student_email||null, student_name||ic.student_name,
     req.session.user.id, req.session.user.name || req.session.user.username,
     title||'签字确认', description||null, expiresAt]);
  const signUrl = `${req.protocol}://${req.get('host')}/s/sign/${token}`;
  if (student_email) {
    sendMail(student_email,
      `请签字确认 - ${title||'签字确认'} - ${ic.student_name}`,
      `<p>您好 ${student_name||ic.student_name}，</p>
      <p>请点击以下链接完成签字：<strong>${title||'签字确认'}</strong></p>
      ${description ? `<p>${description}</p>` : ''}
      <p><a href="${signUrl}" style="font-size:1.1em;font-weight:bold;">${signUrl}</a></p>
      <p>如有疑问请联系顾问老师。</p>`
    ).catch(e => { console.error('signature email failed:', e.message); });
  }
  audit(req, 'GEN_SIGN_LINK', 'case_file_sends', sendId, { case_id: req.params.id, student_email, title });
  res.json({ ok: true, token, url: signUrl, send_id: sendId });
});

// 删除发送记录
app.delete('/api/case-file-sends/:id', requireRole('principal','intake_staff'), (req, res) => {
  const s = db.get('SELECT id FROM case_file_sends WHERE id=?', [req.params.id]);
  if (!s) return res.status(404).json({ error: '记录不存在' });
  db.run('DELETE FROM case_signatures WHERE send_id=?', [req.params.id]);
  db.run('DELETE FROM case_file_sends WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ── 公开学生端路由（无需登录） ─────────────────────────

// 学生查看/下载文件
app.get('/s/file/:token', (req, res) => {
  const send = db.get('SELECT cfs.*, cf.filename, cf.display_name, cf.original_name FROM case_file_sends cfs JOIN case_files cf ON cf.id=cfs.file_id WHERE cfs.token=? AND cfs.send_type=?', [req.params.token, 'file_view']);
  if (!send) return res.status(404).send('<h2>链接无效或已失效</h2>');
  if (send.expires_at && new Date(send.expires_at) < new Date()) return res.status(410).send('<h2>此文件链接已过期，请联系顾问重新发送</h2>');
  if (!send.viewed_at) db.run(`UPDATE case_file_sends SET viewed_at=datetime('now') WHERE token=?`, [req.params.token]);
  const filePath = fileStorage.getFilePath(send.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('<h2>文件不存在</h2>');
  const isImage = /\.(jpg|jpeg|png|gif)$/i.test(send.filename);
  const isPdf = /\.pdf$/i.test(send.filename);
  const wmText = send.watermark_text || '仅供查看';
  const pageHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(send.display_name)}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    .watermark-wrap { position:relative; }
    .watermark-overlay { position:fixed; top:0; left:0; right:0; bottom:0; pointer-events:none; z-index:999;
      display:flex; align-items:center; justify-content:center; }
    .watermark-text { color:rgba(180,0,0,0.15); font-size:4rem; font-weight:900; transform:rotate(-30deg);
      user-select:none; white-space:nowrap; letter-spacing:.3em; }
  </style>
</head>
<body class="bg-light">
  <div class="container py-3">
    <div class="d-flex align-items-center gap-2 mb-3">
      <h5 class="mb-0">${escHtml(send.display_name)}</h5>
      ${send.with_watermark ? `<span class="badge bg-warning text-dark">${escHtml(wmText)}</span>` : ''}
      <a class="btn btn-sm btn-outline-primary ms-auto" href="/s/file/${escHtml(req.params.token)}/download">
        <i class="bi bi-download me-1"></i>下载
      </a>
    </div>
    ${isPdf ? `<iframe src="/s/file/${escHtml(req.params.token)}/download" style="width:100%;height:80vh;border:none;border-radius:8px"></iframe>` : ''}
    ${isImage ? `<img src="/s/file/${escHtml(req.params.token)}/download" class="img-fluid rounded shadow">` : ''}
    ${!isPdf && !isImage ? `<div class="alert alert-info">请点击上方"下载"按钮查看该文件。</div>` : ''}
  </div>
  ${send.with_watermark ? `<div class="watermark-overlay"><div class="watermark-text">${escHtml(wmText)}</div></div>` : ''}
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
</body></html>`;
  res.send(pageHtml);
});

// 学生下载文件（实际流式传输）
app.get('/s/file/:token/download', (req, res) => {
  const send = db.get('SELECT cfs.*, cf.filename, cf.display_name, cf.original_name FROM case_file_sends cfs JOIN case_files cf ON cf.id=cfs.file_id WHERE cfs.token=? AND cfs.send_type=?', [req.params.token, 'file_view']);
  if (!send) return res.status(404).send('链接无效');
  if (send.expires_at && new Date(send.expires_at) < new Date()) return res.status(410).send('链接已过期');
  const filePath = fileStorage.getFilePath(send.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('文件不存在');
  if (!send.downloaded_at) db.run(`UPDATE case_file_sends SET downloaded_at=datetime('now') WHERE token=?`, [req.params.token]);
  const ext = path.extname(send.filename);
  const safeOriginal = (send.original_name || send.display_name).replace(/[^\w.\u4e00-\u9fa5-]/g, '_') + (send.original_name ? '' : ext);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(safeOriginal)}"`);
  res.sendFile(filePath);
});

// 学生上传已签合同 — 查看页
app.get('/s/upload/:token', (req, res) => {
  const send = db.get('SELECT * FROM case_file_sends WHERE token=? AND send_type=?', [req.params.token, 'contract_upload']);
  if (!send) return res.status(404).send('<h2>链接无效或已失效</h2>');
  if (send.expires_at && new Date(send.expires_at) < new Date()) return res.status(410).send('<h2>此上传链接已过期，请联系顾问重新发送</h2>');
  const done = !!send.completed_at;
  if (!send.viewed_at) db.run(`UPDATE case_file_sends SET viewed_at=datetime('now') WHERE token=?`, [req.params.token]);
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>上传已签合同</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
<div class="container py-5">
  <div class="card shadow-sm mx-auto" style="max-width:560px">
    <div class="card-body p-4">
      <h5 class="mb-1"><i class="bi bi-file-earmark-check me-2"></i>上传已签合同</h5>
      <p class="text-muted small mb-4">学生：${escHtml(send.student_name||'')}</p>
      ${done ? `<div class="alert alert-success"><i class="bi bi-check-circle me-1"></i>已成功上传，感谢您！</div>` : `
      <form method="POST" action="/s/upload/${escHtml(req.params.token)}" enctype="multipart/form-data">
        <div class="mb-3">
          <label class="form-label fw-semibold">选择已签合同文件 <span class="text-danger">*</span></label>
          <input class="form-control" type="file" name="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" required>
          <div class="form-text">支持 PDF / Word / 图片，最大 10MB</div>
        </div>
        <button type="submit" class="btn btn-success w-100"><i class="bi bi-upload me-1"></i>确认上传</button>
      </form>`}
    </div>
  </div>
</div>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
</body></html>`);
});

// 学生上传已签合同 — 处理 POST
app.post('/s/upload/:token', upload.single('file'), (req, res) => {
  const send = db.get('SELECT * FROM case_file_sends WHERE token=? AND send_type=?', [req.params.token, 'contract_upload']);
  if (!send) return res.status(404).send('<h2>链接无效或已失效</h2>');
  if (send.completed_at) return res.send('<h2>您已经上传过了，无需重复提交。</h2>');
  if (!req.file) return res.status(400).send('<h2>请选择文件</h2>');
  moveUploadedFile(req.file.filename, 'case');
  // 保存文件记录
  const fileId = uuidv4();
  db.run(`INSERT INTO case_files (id,case_id,file_type,display_name,filename,original_name,file_size,uploaded_by,uploaded_by_name) VALUES (?,?,?,?,?,?,?,?,?)`,
    [fileId, send.case_id, 'signed_contract', `已签合同（${send.student_name||'学生'}）`, req.file.filename, req.file.originalname, req.file.size, 'student', send.student_name||'学生']);
  db.run(`UPDATE case_file_sends SET completed_at=datetime('now'), result_file_id=? WHERE token=?`, [fileId, req.params.token]);
  // 通知 intake_staff
  try {
    const ic = db.get('SELECT student_name FROM intake_cases WHERE id=?', [send.case_id]);
    const staffUsers = db.all(`SELECT id FROM users WHERE role IN ('principal','intake_staff')`);
    staffUsers.forEach(u => {
      db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_role,target_user_id,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))`,
        [uuidv4(), null, 'system', '学生已上传已签合同',
         `${ic?.student_name||send.student_name||'学生'} 已通过链接上传了已签合同，请查看。`,
         u.role || 'intake_staff', u.id]);
    });
  } catch(e) { console.error('合同上传通知失败:', e.message); }
  res.redirect(`/s/upload/${req.params.token}`);
});

// 学生签字页 — 查看/提交
app.get('/s/sign/:token', (req, res) => {
  const send = db.get('SELECT * FROM case_file_sends WHERE token=? AND send_type=?', [req.params.token, 'signature']);
  if (!send) return res.status(404).send('<h2>链接无效或已失效</h2>');
  const sig = db.get('SELECT * FROM case_signatures WHERE send_id=?', [send.id]);
  const done = !!sig;
  if (!send.viewed_at) db.run(`UPDATE case_file_sends SET viewed_at=datetime('now') WHERE token=?`, [req.params.token]);
  // 优先用新字段，fallback 兼容旧记录存在 watermark_text JSON 的情况
  let titleInfo = { title: send.title || '签字确认', description: send.description || '' };
  if (!send.title) { try { const p = JSON.parse(send.watermark_text || '{}'); titleInfo = { title: p.title||'签字确认', description: p.description||'' }; } catch(e) {} }
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(titleInfo.title||'签字确认')}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    #sig-canvas { border:2px dashed #ced4da; border-radius:8px; cursor:crosshair; touch-action:none; background:#fff; }
    body { background:#f8f9fa; }
  </style>
</head>
<body>
<div class="container py-5">
  <div class="card shadow-sm mx-auto" style="max-width:600px">
    <div class="card-body p-4">
      <h5 class="mb-1"><i class="bi bi-pen me-2"></i>${escHtml(titleInfo.title||'签字确认')}</h5>
      <p class="text-muted small mb-1">学生：${escHtml(send.student_name||'')}</p>
      ${titleInfo.description ? `<p class="small mb-3">${escHtml(titleInfo.description)}</p>` : '<div class="mb-3"></div>'}
      ${done ? `<div class="alert alert-success"><i class="bi bi-check-circle me-1"></i>您已完成签字，感谢！</div>
        <div class="text-center mt-2"><img src="${sig.signature_data}" style="max-width:100%;border:1px solid #dee2e6;border-radius:8px"></div>`
      : `
      <div class="mb-3">
        <label class="form-label fw-semibold">请在下方空白处签名 <span class="text-danger">*</span></label>
        <canvas id="sig-canvas" width="520" height="200" style="width:100%;max-width:520px"></canvas>
        <div class="d-flex gap-2 mt-1">
          <button class="btn btn-outline-secondary btn-sm" onclick="clearSig()"><i class="bi bi-eraser me-1"></i>清除</button>
          <span class="text-muted small ms-auto">用鼠标或手指在上方签名</span>
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">姓名确认</label>
        <input type="text" class="form-control" id="signer-name" placeholder="请输入您的姓名" value="${escHtml(send.student_name||'')}">
      </div>
      <button class="btn btn-success w-100" onclick="submitSig()"><i class="bi bi-check-lg me-1"></i>确认签字</button>`}
    </div>
  </div>
</div>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
<script>
${!done ? `
const canvas = document.getElementById('sig-canvas');
const ctx = canvas.getContext('2d');
let drawing = false, lastX = 0, lastY = 0;
function getPos(e) {
  const r = canvas.getBoundingClientRect();
  const scaleX = canvas.width / r.width;
  const scaleY = canvas.height / r.height;
  if (e.touches) return { x: (e.touches[0].clientX - r.left) * scaleX, y: (e.touches[0].clientY - r.top) * scaleY };
  return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
}
canvas.addEventListener('mousedown', e => { drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; });
canvas.addEventListener('mousemove', e => { if (!drawing) return; const p = getPos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); lastX = p.x; lastY = p.y; });
canvas.addEventListener('mouseup', () => drawing = false);
canvas.addEventListener('mouseleave', () => drawing = false);
canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; }, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); lastX = p.x; lastY = p.y; }, { passive: false });
canvas.addEventListener('touchend', () => drawing = false);
function clearSig() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
function submitSig() {
  const pix = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  if (!Array.from(pix).some((v, i) => i % 4 === 3 && v > 0)) { alert('请先在上方完成签名'); return; }
  const name = document.getElementById('signer-name').value.trim();
  if (!name) { alert('请填写您的姓名'); return; }
  fetch('/s/sign/${escHtml(req.params.token)}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature_data: canvas.toDataURL('image/png'), signer_name: name })
  }).then(r => r.json()).then(d => { if (d.ok) location.reload(); else alert(d.error || '提交失败'); });
}` : ''}
</script>
</body></html>`);
});

// 学生签字 — 接收 POST
app.post('/s/sign/:token', express.json(), (req, res) => {
  const send = db.get('SELECT * FROM case_file_sends WHERE token=? AND send_type=?', [req.params.token, 'signature']);
  if (!send) return res.status(404).json({ error: '链接无效' });
  const existing = db.get('SELECT id FROM case_signatures WHERE send_id=?', [send.id]);
  if (existing) return res.status(400).json({ error: '您已完成签字' });
  const { signature_data, signer_name } = req.body;
  if (!signature_data) return res.status(400).json({ error: '请先完成签名' });
  const sigId = uuidv4();
  db.run(`INSERT INTO case_signatures (id,case_id,send_id,signer_name,signature_data,ip_address) VALUES (?,?,?,?,?,?)`,
    [sigId, send.case_id, send.id, signer_name||send.student_name, signature_data, req.ip]);
  db.run(`UPDATE case_file_sends SET completed_at=datetime('now') WHERE token=?`, [req.params.token]);
  // 通知 intake_staff
  try {
    const ic = db.get('SELECT student_name FROM intake_cases WHERE id=?', [send.case_id]);
    const staffUsers = db.all(`SELECT id FROM users WHERE role IN ('principal','intake_staff')`);
    staffUsers.forEach(u => {
      db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_role,target_user_id,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))`,
        [uuidv4(), null, 'system', '学生已完成签字',
         `${ic?.student_name||signer_name||'学生'} 已通过链接完成签字。`,
         'intake_staff', u.id]);
    });
  } catch(e) { console.error('签字通知失败:', e.message); }
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  Orientation 表格导出 (Excel) & 发送给关老师
// ═══════════════════════════════════════════════════════

app.get('/api/intake-cases/:id/orientation-export', requireAdmissionModule, (req, res) => {
  try {
    const c = db.get(`
      SELECT ic.*, s.name as student_name,
             ar.expected_arrival, ar.actual_arrival, ar.flight_no, ar.accommodation,
             ar.orientation_date, ar.orientation_done, ar.student_pass_issued,
             ar.accommodation_address, ar.emergency_contact_name, ar.emergency_contact_phone,
             ar.student_pass_no, ar.student_pass_expiry, ar.local_bank_account, ar.orientation_notes
      FROM intake_cases ic
      JOIN students s ON s.id = ic.student_id
      LEFT JOIN arrival_records ar ON ar.case_id = ic.id
      WHERE ic.id=?`, [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Case 不存在' });
    const rows = [
      ['Orientation 记录表', ''],
      ['', ''],
      ['学生姓名', c.student_name || ''],
      ['课程/项目', c.program_name || ''],
      ['入学年份', c.intake_year || ''],
      ['', ''],
      ['到校信息', ''],
      ['预计到校日期', c.expected_arrival || ''],
      ['实际到校日期', c.actual_arrival || ''],
      ['航班号', c.flight_no || ''],
      ['Orientation 日期', c.orientation_date || ''],
      ['住宿安排', c.accommodation || ''],
      ['住宿地址', c.accommodation_address || ''],
      ['', ''],
      ['紧急联系人信息', ''],
      ['紧急联系人姓名', c.emergency_contact_name || ''],
      ['紧急联系人电话', c.emergency_contact_phone || ''],
      ['', ''],
      ['证件与账户', ''],
      ['学生证号 (Student Pass)', c.student_pass_no || ''],
      ['学生证有效期', c.student_pass_expiry || ''],
      ['本地银行账户', c.local_bank_account || ''],
      ['', ''],
      ['完成状态', ''],
      ['Orientation 已完成', c.orientation_done ? '是' : '否'],
      ['学生准证已办理', c.student_pass_issued ? '是' : '否'],
      ['', ''],
      ['备注', c.orientation_notes || ''],
    ];
    const ws = xlsx.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 24 }, { wch: 36 }];
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Orientation');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `orientation_${(c.student_name||'student').replace(/\s+/g,'_')}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch(e) {
    console.error('orientation-export 失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/intake-cases/:id/orientation-send', requireRole('principal','student_admin','intake_staff'), async (req, res) => {
  try {
    const c = db.get(`
      SELECT ic.*, s.name as student_name,
             ar.expected_arrival, ar.actual_arrival, ar.flight_no, ar.accommodation,
             ar.orientation_date, ar.orientation_done, ar.student_pass_issued,
             ar.accommodation_address, ar.emergency_contact_name, ar.emergency_contact_phone,
             ar.student_pass_no, ar.student_pass_expiry, ar.local_bank_account, ar.orientation_notes
      FROM intake_cases ic
      JOIN students s ON s.id = ic.student_id
      LEFT JOIN arrival_records ar ON ar.case_id = ic.id
      WHERE ic.id=?`, [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Case 不存在' });
    // 生成 Excel buffer
    const rows = [
      ['Orientation 记录表', ''],
      ['学生姓名', c.student_name || ''],
      ['课程/项目', c.program_name || ''],
      ['入学年份', c.intake_year || ''],
      ['预计到校日期', c.expected_arrival || ''],
      ['实际到校日期', c.actual_arrival || ''],
      ['航班号', c.flight_no || ''],
      ['Orientation 日期', c.orientation_date || ''],
      ['住宿安排', c.accommodation || ''],
      ['住宿地址', c.accommodation_address || ''],
      ['紧急联系人姓名', c.emergency_contact_name || ''],
      ['紧急联系人电话', c.emergency_contact_phone || ''],
      ['学生证号', c.student_pass_no || ''],
      ['学生证有效期', c.student_pass_expiry || ''],
      ['本地银行账户', c.local_bank_account || ''],
      ['Orientation 已完成', c.orientation_done ? '是' : '否'],
      ['学生准证已办理', c.student_pass_issued ? '是' : '否'],
      ['备注', c.orientation_notes || ''],
    ];
    const ws = xlsx.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 24 }, { wch: 36 }];
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Orientation');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    // 查找关老师邮箱
    const guanUser = db.get(`SELECT s.email, s.name FROM users u JOIN staff s ON s.id=u.linked_id WHERE u.username='guan'`);
    const toEmail = (guanUser && guanUser.email) ? guanUser.email : req.body.to_email;
    if (!toEmail) return res.status(400).json({ error: '无法找到关老师邮箱，请手动提供 to_email' });
    const filename = `orientation_${(c.student_name||'student').replace(/\s+/g,'_')}.xlsx`;
    await sendMail(toEmail,
      `Orientation 表格 - ${c.student_name}`,
      `<p>您好，请查收 ${c.student_name} 的 Orientation 记录表。</p>`,
      [{ filename, content: buf }]
    );
    res.json({ ok: true, sent_to: toEmail });
  } catch(e) {
    console.error('orientation-send 失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════
//  满意度调查外链
// ═══════════════════════════════════════════════════════

// 邮件发送调查链接给学生
app.post('/api/intake-cases/:id/send-survey-link', requireAdmissionModule, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: '请提供收件人邮箱' });
    // 获取或生成 token
    let link = db.get('SELECT token FROM survey_links WHERE case_id=?', [req.params.id]);
    if (!link) {
      const token = uuidv4();
      db.run(`INSERT INTO survey_links (id,case_id,token) VALUES (?,?,?)`, [uuidv4(), req.params.id, token]);
      link = { token };
    }
    const surveyUrl = `${req.protocol}://${req.get('host')}/survey/${link.token}`;
    const ic = db.get(`SELECT program_name, student_name FROM intake_cases WHERE id=?`, [req.params.id]);
    res.json({ ok: true, survey_url: surveyUrl });
    sendMail(email,
      `满意度调查邀请 - ${ic?.student_name || ''}`,
      `<p>您好，</p><p>感谢您选择我们！请花几分钟填写入学满意度调查：</p><p><a href="${surveyUrl}" style="font-size:1.1em;font-weight:bold;">${surveyUrl}</a></p><p>您的反馈对我们非常重要。</p>`
    ).catch(e => { console.error('send-survey-link 失败:', e.message); });
  } catch(e) {
    console.error('send-survey-link 失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 生成或获取调查链接
app.post('/api/intake-cases/:id/survey-link', requireAdmissionModule, (req, res) => {
  const existing = db.get('SELECT * FROM survey_links WHERE case_id=?', [req.params.id]);
  if (existing) {
    const url = `${req.protocol}://${req.get('host')}/survey/${existing.token}`;
    return res.json({ url, token: existing.token, existing: true });
  }
  const token = uuidv4();
  db.run(`INSERT INTO survey_links (id,case_id,token) VALUES (?,?,?)`, [uuidv4(), req.params.id, token]);
  const url = `${req.protocol}://${req.get('host')}/survey/${token}`;
  res.json({ url, token, existing: false });
});

// 公开路由：渲染问卷页面（无需登录）
app.get('/survey/:token', (req, res) => {
  const link = db.get('SELECT sl.*, ic.program_name, ic.student_name FROM survey_links sl JOIN intake_cases ic ON ic.id=sl.case_id WHERE sl.token=?', [req.params.token]);
  if (!link) return res.status(404).send('<h2>链接无效或已失效</h2>');
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return res.status(410).send('<h2>此调查链接已过期</h2>');
  }
  const submitted = db.get('SELECT id FROM post_arrival_surveys WHERE case_id=?', [link.case_id]);
  if (submitted) {
    return res.send(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>调查问卷</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet"></head><body class="bg-light"><div class="container py-5 text-center"><div class="card shadow-sm mx-auto" style="max-width:500px"><div class="card-body p-5"><h3 class="text-success mb-3">✅ 已提交</h3><p class="text-muted">您已提交过满意度调查，感谢您的反馈！</p></div></div></div></body></html>`);
  }
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>满意度调查 - ${escHtml(link.student_name)}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background: #f8f9fa; }
    .star-rating { display:flex; flex-direction:row-reverse; justify-content:flex-end; gap:4px; }
    .star-rating input { display:none; }
    .star-rating label { font-size:2rem; cursor:pointer; color:#dee2e6; transition:color .2s; }
    .star-rating input:checked ~ label,
    .star-rating label:hover,
    .star-rating label:hover ~ label { color:#ffc107; }
  </style>
</head>
<body>
  <div class="container py-5">
    <div class="card shadow-sm mx-auto" style="max-width:600px">
      <div class="card-body p-4">
        <h4 class="mb-1">入学满意度调查</h4>
        <p class="text-muted small mb-4">学生：${escHtml(link.student_name)} · 课程：${escHtml(link.program_name)}</p>
        <form method="POST" action="/survey/${escHtml(req.params.token)}">
          <div class="mb-4">
            <label class="form-label fw-semibold">整体满意度 <span class="text-danger">*</span></label>
            <div class="star-rating">
              <input type="radio" name="overall_satisfaction" id="s5" value="5" required><label for="s5">★</label>
              <input type="radio" name="overall_satisfaction" id="s4" value="4"><label for="s4">★</label>
              <input type="radio" name="overall_satisfaction" id="s3" value="3"><label for="s3">★</label>
              <input type="radio" name="overall_satisfaction" id="s2" value="2"><label for="s2">★</label>
              <input type="radio" name="overall_satisfaction" id="s1" value="1"><label for="s1">★</label>
            </div>
            <div class="d-flex justify-content-between small text-muted mt-1"><span>非常不满意</span><span>非常满意</span></div>
          </div>
          <div class="mb-3">
            <label class="form-label fw-semibold">住宿安排是否满意？</label>
            <div class="d-flex gap-3">
              <div class="form-check"><input class="form-check-input" type="radio" name="accommodation_ok" id="acc1" value="1"><label class="form-check-label" for="acc1">满意</label></div>
              <div class="form-check"><input class="form-check-input" type="radio" name="accommodation_ok" id="acc0" value="0"><label class="form-check-label" for="acc0">不满意</label></div>
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label fw-semibold">Orientation 对您是否有帮助？</label>
            <div class="d-flex gap-3">
              <div class="form-check"><input class="form-check-input" type="radio" name="orientation_helpful" id="ori1" value="1"><label class="form-check-label" for="ori1">有帮助</label></div>
              <div class="form-check"><input class="form-check-input" type="radio" name="orientation_helpful" id="ori0" value="0"><label class="form-check-label" for="ori0">帮助不大</label></div>
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label fw-semibold">您还需要哪些支持？</label>
            <input type="text" class="form-control" name="support_needed" placeholder="请简要描述（可留空）">
          </div>
          <div class="mb-4">
            <label class="form-label fw-semibold">总体评价与建议</label>
            <textarea class="form-control" name="comments" rows="3" placeholder="请填写您的意见与建议（可留空）"></textarea>
          </div>
          <button type="submit" class="btn btn-primary w-100">提交调查</button>
        </form>
      </div>
    </div>
  </div>
</body>
</html>`);
});

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── 品牌邮件模板（返回 {html, attachments}）──
const _logoPath = path.join(__dirname, 'public', 'esic-logo.jpg');
function brandedEmail(bodyHtml, options = {}) {
  const { buttonText, buttonUrl, greeting, footerExtra } = options;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <!-- Logo strip (white bg) -->
  <tr><td style="background:#fff;padding:20px 32px 12px;border-radius:8px 8px 0 0;text-align:center;border-bottom:none;">
    <img src="cid:esic-logo" alt="Equistar International College" style="height:56px;">
  </td></tr>
  <!-- Brand bar (red) -->
  <tr><td style="background:#A51C30;padding:14px 32px;text-align:center;">
    <div style="color:#fff;font-size:17px;font-weight:700;letter-spacing:1px;">Equistar International College</div>
    <div style="color:rgba(255,255,255,.7);font-size:12px;margin-top:2px;">www.esic.edu.sg</div>
  </td></tr>
  <!-- Body -->
  <tr><td style="background:#fff;padding:32px;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;">
    ${greeting ? `<p style="font-size:15px;color:#333;margin:0 0 16px;">${greeting}</p>` : ''}
    ${bodyHtml}
    ${buttonUrl ? `<div style="text-align:center;margin:24px 0;"><a href="${buttonUrl}" style="display:inline-block;background:#A51C30;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:15px;">${buttonText || 'Open Link →'}</a></div>` : ''}
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#fafafa;padding:20px 32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
    ${footerExtra ? `<p style="font-size:13px;color:#666;margin:0 0 8px;">${footerExtra}</p>` : ''}
    <p style="font-size:12px;color:#999;margin:0;">Equistar International College · 1 Selegie Rd #07-02 · Singapore</p>
    <p style="font-size:12px;color:#999;margin:4px 0 0;"><a href="https://www.esic.edu.sg" style="color:#A51C30;text-decoration:none;">www.esic.edu.sg</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  // 内嵌 logo 作为 CID 附件
  const attachments = [];
  try {
    if (fs.existsSync(_logoPath)) {
      attachments.push({ filename: 'esic-logo.jpg', path: _logoPath, cid: 'esic-logo' });
    }
  } catch(e) {}
  return { html, attachments };
}

// 公开路由：接收问卷提交
app.post('/survey/:token', express.urlencoded({ extended: false }), async (req, res) => {
  const link = db.get('SELECT * FROM survey_links WHERE token=?', [req.params.token]);
  if (!link) return res.status(404).send('<h2>链接无效</h2>');
  const existing = db.get('SELECT id FROM post_arrival_surveys WHERE case_id=?', [link.case_id]);
  if (existing) return res.redirect(`/survey/${req.params.token}`);
  const { overall_satisfaction, accommodation_ok, orientation_helpful, support_needed, comments } = req.body;
  if (!overall_satisfaction) return res.status(400).send('<p>请填写整体满意度评分</p>');
  const id = uuidv4();
  db.run(`INSERT INTO post_arrival_surveys (id,case_id,survey_date,overall_satisfaction,accommodation_ok,orientation_helpful,support_needed,comments,filled_by)
    VALUES (?,?,date('now'),?,?,?,?,?,?)`,
    [id, link.case_id, parseInt(overall_satisfaction),
     accommodation_ok?1:0, orientation_helpful?1:0,
     support_needed||null, comments||null, 'student_external']);
  // 通知所有 student_admin
  try {
    const ic = db.get(`SELECT * FROM intake_cases WHERE id=?`, [link.case_id]);
    const adminUsers = db.all(`SELECT u.id, s.email FROM users u JOIN staff s ON s.id=u.linked_id WHERE u.role='student_admin'`);
    for (const u of adminUsers) {
      db.run(`INSERT INTO notification_logs(id,student_id,type,title,message,target_role,target_user_id,created_at)
        VALUES(?,?,?,?,?,?,?,datetime('now'))`,
        [uuidv4(), null, 'system',
         '满意度调查已提交',
         `${ic?.student_name || '学生'} 已完成满意度调查（${overall_satisfaction}星）`,
         'student_admin', u.id]);
      if (u.email) {
        try {
          await sendMail(u.email, `满意度调查已提交 - ${ic?.student_name}`,
            `<p>${ic?.student_name || '学生'} 已完成满意度调查，整体评分 ${overall_satisfaction} 星。</p><p>请登录系统查看详情。</p>`
          );
        } catch(e) { console.error('调查通知邮件失败:', e.message); }
      }
    }
  } catch(e) { console.error('调查通知失败:', e.message); }
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>感谢您的反馈</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
  <div class="container py-5 text-center">
    <div class="card shadow-sm mx-auto" style="max-width:500px">
      <div class="card-body p-5">
        <div class="display-3 mb-3">🎉</div>
        <h3 class="text-success mb-2">感谢您的反馈！</h3>
        <p class="text-muted">您的满意度调查已成功提交。<br>我们会认真参考您的意见，持续改善服务。</p>
      </div>
    </div>
  </div>
</body>
</html>`);
});

app.get('/api/intake-dashboard', requireAdmissionModule, (req, res) => {
  const role = req.session.user.role;
  const isPrincipal = role === 'principal';
  const isStudentAdmin = role === 'student_admin';

  let payload = {};

  if (isPrincipal) {
    // ── Principal：全局视图 ──
    payload.total = db.get('SELECT COUNT(*) as cnt FROM intake_cases WHERE status != "closed"').cnt;
    payload.byStatus = db.all('SELECT status, COUNT(*) as cnt FROM intake_cases GROUP BY status');
    payload.overdueTasks = db.get(`SELECT COUNT(*) as cnt FROM milestone_tasks WHERE intake_case_id IS NOT NULL AND status != 'done' AND due_date < date('now')`).cnt;
    payload.unpaidInvoices = db.get(`SELECT COUNT(*) as cnt, COALESCE(SUM(amount_total),0) as total FROM finance_invoices WHERE status IN ('unpaid','partial')`);
    payload.ipaExpiringSoon = db.all(`SELECT vc.*, ic.program_name, ic.id as case_id, ic.student_name FROM visa_cases vc JOIN intake_cases ic ON ic.id=vc.case_id WHERE vc.ipa_expiry_date BETWEEN date('now') AND date('now','+30 days') AND vc.status='ipa_received'`);
    payload.pendingCommissions = db.get(`SELECT COUNT(*) as cnt, COALESCE(SUM(commission_amount),0) as total FROM commission_payouts WHERE status='pending'`);
    payload.agentPerformance = db.all(`
      SELECT a.id, a.name, a.type, a.status,
        COUNT(DISTINCT ic.id) as total_cases,
        SUM(CASE WHEN ic.status IN ('contract_signed','paid','visa_in_progress','ipa_received','arrived','oriented') THEN 1 ELSE 0 END) as signed_cases,
        SUM(CASE WHEN ic.status IN ('paid','visa_in_progress','ipa_received','arrived','oriented') THEN 1 ELSE 0 END) as paid_cases,
        COALESCE(SUM(CASE WHEN cp.status='pending' THEN cp.commission_amount ELSE 0 END),0) as pending_commission,
        COALESCE(SUM(CASE WHEN cp.status='paid' THEN cp.commission_amount ELSE 0 END),0) as paid_commission
      FROM agents a LEFT JOIN referrals r ON r.agent_id=a.id
      LEFT JOIN intake_cases ic ON ic.referral_id=r.id
      LEFT JOIN commission_payouts cp ON cp.referral_id=r.id
      WHERE a.status='active' GROUP BY a.id ORDER BY total_cases DESC`);
    payload.channelFunnel = db.all(`
      SELECT r.source_type, COUNT(DISTINCT ic.id) as total,
        SUM(CASE WHEN ic.status NOT IN ('registered','collecting_docs') THEN 1 ELSE 0 END) as converted
      FROM referrals r JOIN intake_cases ic ON ic.referral_id=r.id GROUP BY r.source_type`);

  } else if (isStudentAdmin) {
    // ── 学管（student_admin）：到校后视图 ──
    payload.arrivedCount   = db.get(`SELECT COUNT(*) as cnt FROM intake_cases WHERE status='arrived'`).cnt;
    payload.orientedCount  = db.get(`SELECT COUNT(*) as cnt FROM intake_cases WHERE status='oriented'`).cnt;
    payload.closedCount    = db.get(`SELECT COUNT(*) as cnt FROM intake_cases WHERE status='closed'`).cnt;
    payload.overdueMyTasks = db.get(`SELECT COUNT(*) as cnt FROM milestone_tasks WHERE intake_case_id IS NOT NULL AND category IN ('入学','回访') AND status != 'done' AND due_date < date('now')`).cnt;
    // 7天内到期的入学/回访任务
    payload.upcomingTasks = db.all(`
      SELECT mt.id, mt.title, mt.due_date, mt.category, mt.priority,
             ic.student_name, ic.id as case_id, ic.program_name
      FROM milestone_tasks mt JOIN intake_cases ic ON ic.id=mt.intake_case_id
      WHERE mt.intake_case_id IS NOT NULL AND mt.status != 'done'
        AND mt.category IN ('入学','回访')
        AND mt.due_date BETWEEN date('now') AND date('now','+7 days')
      ORDER BY mt.due_date ASC LIMIT 10`);
    // 已到校但尚未完成入学的学生（待跟进列表）
    payload.pendingOrientation = db.all(`
      SELECT ic.id, ic.student_name, ic.program_name, ic.updated_at
      FROM intake_cases ic WHERE ic.status='arrived'
      ORDER BY ic.updated_at ASC LIMIT 10`);
    // 本月已完成入学
    payload.thisMonthOriented = db.get(`SELECT COUNT(*) as cnt FROM intake_cases WHERE status IN ('oriented','closed') AND strftime('%Y-%m',updated_at)=strftime('%Y-%m','now')`).cnt;

  } else {
    // ── 入学顾问（intake_staff）：入学前视图 ──
    payload.total = db.get(`SELECT COUNT(*) as cnt FROM intake_cases WHERE status NOT IN ('oriented','closed')`).cnt;
    payload.byStatus = db.all(`SELECT status, COUNT(*) as cnt FROM intake_cases WHERE status NOT IN ('oriented','closed') GROUP BY status`);
    payload.overdueTasks = db.get(`SELECT COUNT(*) as cnt FROM milestone_tasks WHERE intake_case_id IS NOT NULL AND status != 'done' AND due_date < date('now') AND category NOT IN ('入学','回访')`).cnt;
    payload.ipaExpiringSoon = db.all(`SELECT vc.*, ic.program_name, ic.id as case_id, ic.student_name FROM visa_cases vc JOIN intake_cases ic ON ic.id=vc.case_id WHERE vc.ipa_expiry_date BETWEEN date('now') AND date('now','+30 days') AND vc.status='ipa_received'`);
    // 7天内到期的前置任务（排除入学/回访类）
    payload.upcomingTasks = db.all(`
      SELECT mt.id, mt.title, mt.due_date, mt.category, mt.priority,
             ic.student_name, ic.id as case_id, ic.program_name
      FROM milestone_tasks mt JOIN intake_cases ic ON ic.id=mt.intake_case_id
      WHERE mt.intake_case_id IS NOT NULL AND mt.status != 'done'
        AND mt.category NOT IN ('入学','回访')
        AND mt.due_date BETWEEN date('now') AND date('now','+7 days')
      ORDER BY mt.due_date ASC LIMIT 10`);
    payload.thisMonthNew = db.get(`SELECT COUNT(*) as cnt FROM intake_cases WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`).cnt;
  }

  res.json({ ...payload, role });
});

// ═══════════════════════════════════════════════════════
//  AGENT 自助门户（仅 agent 角色访问自身数据）
// ═══════════════════════════════════════════════════════

// 代理查看自己的基本信息
app.get('/api/agent/me', requireRole('agent'), (req, res) => {
  const agentId = req.session.user.linked_id;
  if (!agentId) return res.status(404).json({ error: '代理账号未关联代理档案' });
  const agent = db.get('SELECT id, name, type, contact, email, phone, status, notes, created_at FROM agents WHERE id=?', [agentId]);
  if (!agent) return res.status(404).json({ error: '代理档案不存在' });
  res.json(agent);
});

// 代理查看自己名下的转介记录（不含其他代理数据）
app.get('/api/agent/my-referrals', requireRole('agent'), (req, res) => {
  const agentId = req.session.user.linked_id;
  if (!agentId) return res.status(403).json({ error: '未关联代理档案' });
  const referrals = db.all(`
    SELECT r.id, r.source_type, r.anonymous_label, r.referrer_name, r.notes, r.created_at,
      COUNT(DISTINCT ic.id) as case_count
    FROM referrals r
    LEFT JOIN intake_cases ic ON ic.referral_id=r.id
    WHERE r.agent_id=?
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `, [agentId]);
  res.json(referrals);
});

// 代理查看自己名下学生的入学进度（仅状态摘要，不含升学规划内部信息）
app.get('/api/agent/my-students', requireRole('agent'), (req, res) => {
  const agentId = req.session.user.linked_id;
  if (!agentId) return res.status(403).json({ error: '未关联代理档案' });
  const students = db.all(`
    SELECT DISTINCT s.id, s.name, s.grade_level,
      ic.id as case_id, ic.program_name, ic.intake_year, ic.status as case_status,
      ic.created_at as case_created_at
    FROM referrals r
    JOIN intake_cases ic ON ic.referral_id=r.id
    JOIN students s ON s.id=ic.student_id
    WHERE r.agent_id=? AND s.status != 'deleted'
    ORDER BY ic.created_at DESC, ic.rowid DESC
  `, [agentId]);
  res.json(students);
});

// 代理查看自己的佣金记录（仅自身）
app.get('/api/agent/my-commissions', requireRole('agent'), (req, res) => {
  const agentId = req.session.user.linked_id;
  if (!agentId) return res.status(403).json({ error: '未关联代理档案' });
  const commissions = db.all(`
    SELECT cp.id, cp.base_amount, cp.commission_amount, cp.currency, cp.status,
      cp.approved_at, cp.paid_at, cp.created_at,
      cr.name as rule_name, fi.invoice_no
    FROM commission_payouts cp
    JOIN referrals r ON r.id=cp.referral_id
    LEFT JOIN commission_rules cr ON cr.id=cp.rule_id
    LEFT JOIN finance_invoices fi ON fi.id=cp.invoice_id
    WHERE r.agent_id=?
    ORDER BY cp.created_at DESC
  `, [agentId]);
  res.json(commissions);
});

// ═══════════════════════════════════════════════════════
//  启动辅助
// ═══════════════════════════════════════════════════════

function _ensureAgentDemoAccount() {
  // 幂等：检查 agent01 是否存在，不存在则创建演示代理档案 + 登录账号
  const exists = db.get('SELECT id FROM users WHERE username=?', ['agent01']);
  if (exists) return;

  let agentId = null;
  const existingAgent = db.get("SELECT id FROM agents WHERE name LIKE '%test03%' OR name LIKE '%Demo%' LIMIT 1");
  if (existingAgent) {
    agentId = existingAgent.id;
  } else {
    agentId = uuidv4();
    db.run(`INSERT INTO agents (id,name,type,contact,email,phone,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [agentId, 'Demo Agency (agent01)', '代理机构', 'demo', 'agent01@demo.com', '13800000099', 'active', '系统自动创建的演示代理账号']);
  }
  db.run(`INSERT INTO users (id,username,password,role,linked_id,name,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
    [uuidv4(), 'agent01', bcrypt.hashSync('123456', 10), 'agent', agentId, 'Demo Agency']);
  console.log('✅ 演示代理账号 agent01 已创建（密码: 123456）');
}

function _ensureIntakeStaffDemoAccount() {
  // 幂等：创建入学管理员 demo 账号（关老师）
  const exists = db.get('SELECT id FROM users WHERE username=?', ['guan']);
  if (exists) return;

  // intake_staff 不需要关联 staff 表，linked_id 留空或自建一条 staff 记录
  const staffId = uuidv4();
  db.run(`INSERT INTO staff (id,name,role,subjects,exam_board_exp,capacity_students,email,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    [staffId, '关老师', 'counselor', '[]', '[]', 50, 'guan@school.edu']);
  db.run(`INSERT INTO users (id,username,password,role,linked_id,name,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
    [uuidv4(), 'guan', bcrypt.hashSync('123456', 10), 'intake_staff', staffId, '关老师']);
  console.log('✅ 入学管理员账号 guan 已创建（密码: 123456）');
}

function _ensureStudentAdminDemoAccount() {
  const bcrypt = require('bcryptjs');
  const { v4: uuidv4 } = require('uuid');
  const exists = db.get(`SELECT id FROM users WHERE username='xiaoming'`);
  if (exists) return;
  const staffId = uuidv4();
  db.run(`INSERT INTO staff (id,name,role,subjects,exam_board_exp,capacity_students,email,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    [staffId, '小明老师', 'student_admin', '[]', '[]', 50, 'xiaoming@school.edu']);
  db.run(`INSERT INTO users (id,username,password,role,linked_id,name,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
    [uuidv4(), 'xiaoming', bcrypt.hashSync('123456', 10), 'student_admin', staffId, '小明老师']);
  console.log('✅ 学生管理员账号 xiaoming 已创建（密码: 123456）');
}

// ═══════════════════════════════════════════════════════
//  中介材料收集系统 (Mat Collection Portal)
// ═══════════════════════════════════════════════════════

// ── Magic Link 辅助函数 ───────────────────────────────
function _matGenerateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function _matCreateMagicLink(requestId, contactId) {
  // 作废旧 token
  db.run(`UPDATE mat_magic_tokens SET status='REVOKED' WHERE request_id=? AND status='ACTIVE'`, [requestId]);
  const token = _matGenerateToken();
  const id = uuidv4();
  const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  db.run(`INSERT INTO mat_magic_tokens (id,token,request_id,contact_id,status,expires_at) VALUES (?,?,?,?,?,?)`,
    [id, token, requestId, contactId, 'ACTIVE', expiresAt]);
  const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  return { token, link: `${baseUrl}/agent.html?token=${token}` };
}

function _matValidateToken(token, ip) {
  const rec = db.get(`SELECT * FROM mat_magic_tokens WHERE token=?`, [token]);
  if (!rec) return { error: 'TOKEN_INVALID', status: 401 };
  if (rec.status === 'REVOKED') return { error: 'TOKEN_REVOKED', status: 401 };
  if (rec.status === 'EXPIRED' || new Date(rec.expires_at) < new Date()) {
    db.run(`UPDATE mat_magic_tokens SET status='EXPIRED' WHERE id=?`, [rec.id]);
    return { error: 'TOKEN_EXPIRED', status: 401 };
  }
  db.run(`UPDATE mat_magic_tokens SET last_used_at=datetime('now'), access_ip=? WHERE id=?`, [ip, rec.id]);
  return { rec };
}

function _matAudit(requestId, actorType, actorId, actorName, action, detail, ip) {
  try {
    db.run(`INSERT INTO mat_audit_logs (id,request_id,actor_type,actor_id,actor_name,action,detail,ip) VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), requestId, actorType, actorId, actorName, action, typeof detail === 'object' ? JSON.stringify(detail) : detail, ip]);
  } catch(e) { /* non-blocking */ }
}

async function _matSendInviteEmail(req2, contact, link, type = 'invite') {
  const subjects = {
    invite:   `[材料收集] 请提交 ${req2.title} 所需材料`,
    upcoming: `[提醒] ${req2.title} 材料截止日临近`,
    due:      `[今日截止] ${req2.title} 材料请求`,
    overdue:  `[逾期催件] ${req2.title} 材料请求`,
    rejected: `[重新提交] ${req2.title} 有材料需要重传`,
  };
  const subjectLine = subjects[type] || subjects.invite;

  // Count items
  const items = db.all(`SELECT * FROM mat_request_items WHERE request_id=?`, [req2.id]);
  const pending = items.filter(i => ['PENDING','REJECTED'].includes(i.status)).length;
  const total = items.length;

  const _em3 = brandedEmail(
    `<p style="font-size:15px;color:#333;">${type === 'invite' ? '我们需要您协助提交以下学生的入学申请材料：' : '提醒您尽快完成材料提交：'}</p>
    <div style="background:#f8f9fa;border:1px solid #e5e5e5;border-radius:6px;padding:16px;margin:16px 0;">
      <div style="margin-bottom:6px;"><strong>案件：</strong>${escHtml(req2.title)}</div>
      <div style="margin-bottom:6px;"><strong>截止日期：</strong>${req2.deadline || '未设置'}</div>
      <div><strong>待提交：</strong>${pending} / ${total} 项</div>
    </div>`,
    { greeting: `您好 <strong>${escHtml(contact.name)}</strong>，`, buttonUrl: link, buttonText: '进入提交工作台 →', footerExtra: '此链接有效期 72 小时。如有问题请联系顾问。' }
  );

  sendMail(contact.email, subjectLine, _em3.html, _em3.attachments).catch(e =>
    console.error('[MAT MAIL]', e.message));
}

// ── 中介公司管理 ──────────────────────────────────────
app.get('/api/mat-companies', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const rows = db.all(`SELECT mc.*,
    (SELECT count(*) FROM mat_contacts WHERE company_id=mc.id AND is_active=1) as contact_count,
    (SELECT count(*) FROM mat_requests WHERE company_id=mc.id AND status NOT IN ('CANCELLED','COMPLETED')) as active_requests
    FROM mat_companies mc WHERE mc.is_active=1 ORDER BY mc.name`);
  res.json(rows);
});

app.post('/api/mat-companies', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const { name, city, country, agreement_date, notes } = req.body;
  if (!name) return res.status(400).json({ error: '公司名称必填' });
  const id = uuidv4();
  db.run(`INSERT INTO mat_companies (id,name,city,country,agreement_date,notes,created_by) VALUES (?,?,?,?,?,?,?)`,
    [id, name, city||null, country||null, agreement_date||null, notes||null, req.session.user.id]);
  res.json({ id });
});

app.put('/api/mat-companies/:id', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const { name, city, country, agreement_date, notes, is_active } = req.body;
  db.run(`UPDATE mat_companies SET name=?,city=?,country=?,agreement_date=?,notes=?,is_active=?,updated_at=datetime('now') WHERE id=?`,
    [name, city||null, country||null, agreement_date||null, notes||null, is_active !== undefined ? is_active : 1, req.params.id]);
  res.json({ ok: true });
});

app.get('/api/mat-companies/:id/contacts', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const rows = db.all(`SELECT * FROM mat_contacts WHERE company_id=? AND is_active=1 ORDER BY name`, [req.params.id]);
  res.json(rows);
});

app.post('/api/mat-companies/:id/contacts', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const { name, email, phone, wechat, is_admin } = req.body;
  if (!name || !email) return res.status(400).json({ error: '姓名和邮箱必填' });
  const id = uuidv4();
  db.run(`INSERT INTO mat_contacts (id,company_id,name,email,phone,wechat,is_admin) VALUES (?,?,?,?,?,?,?)`,
    [id, req.params.id, name, email, phone||null, wechat||null, is_admin ? 1 : 0]);
  res.json({ id });
});

app.put('/api/mat-contacts/:id', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const { name, email, phone, wechat, is_admin, is_active } = req.body;
  db.run(`UPDATE mat_contacts SET name=?,email=?,phone=?,wechat=?,is_admin=?,is_active=? WHERE id=?`,
    [name, email, phone||null, wechat||null, is_admin ? 1 : 0, is_active !== undefined ? is_active : 1, req.params.id]);
  res.json({ ok: true });
});

// ── 材料请求 ──────────────────────────────────────────
app.get('/api/mat-requests', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const { status, company_id } = req.query;
  let sql = `SELECT mr.*,
    mc.name as company_name, ct.name as contact_name, ct.email as contact_email,
    s.name as student_name,
    (SELECT count(*) FROM mat_request_items WHERE request_id=mr.id) as item_total,
    (SELECT count(*) FROM mat_request_items WHERE request_id=mr.id AND status='APPROVED') as item_approved
    FROM mat_requests mr
    JOIN mat_companies mc ON mr.company_id=mc.id
    JOIN mat_contacts ct ON mr.contact_id=ct.id
    LEFT JOIN students s ON mr.student_id=s.id
    WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND mr.status=?'; params.push(status); }
  if (company_id) { sql += ' AND mr.company_id=?'; params.push(company_id); }
  sql += ' ORDER BY mr.created_at DESC';
  res.json(db.all(sql, params));
});

app.post('/api/mat-requests', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const { student_id, company_id, contact_id, title, deadline, notes,
          remind_days_before, overdue_interval_days, max_overdue_reminders, items } = req.body;
  if (!company_id || !contact_id || !title || !deadline)
    return res.status(400).json({ error: '中介公司、联系人、标题、截止日期必填' });
  if (!items || items.length === 0)
    return res.status(400).json({ error: '至少需要一个材料项目' });

  const id = uuidv4();
  db.run(`INSERT INTO mat_requests (id,student_id,company_id,contact_id,counselor_id,title,deadline,notes,
    remind_days_before,overdue_interval_days,max_overdue_reminders,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, student_id||null, company_id, contact_id,
     req.session.user.id, title, deadline, notes||null,
     remind_days_before || 3, overdue_interval_days || 2, max_overdue_reminders || 5,
     req.session.user.id]);

  // Insert items
  (items || []).forEach((item, idx) => {
    db.run(`INSERT INTO mat_request_items (id,request_id,name,description,is_required,sort_order) VALUES (?,?,?,?,?,?)`,
      [uuidv4(), id, item.name, item.description||null, item.is_required !== false ? 1 : 0, idx]);
  });

  // Create magic link and send email
  const contact = db.get(`SELECT * FROM mat_contacts WHERE id=?`, [contact_id]);
  const { link } = _matCreateMagicLink(id, contact_id);
  const req2 = db.get(`SELECT * FROM mat_requests WHERE id=?`, [id]);
  _matSendInviteEmail(req2, contact, link, 'invite');

  _matAudit(id, 'internal', req.session.user.id, req.session.user.username, 'REQUEST_CREATED', { title, deadline }, req.ip);
  res.json({ id });
});

app.get('/api/mat-requests/:id', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const r = db.get(`SELECT mr.*,
    mc.name as company_name, ct.name as contact_name, ct.email as contact_email, ct.phone as contact_phone,
    s.name as student_name
    FROM mat_requests mr
    JOIN mat_companies mc ON mr.company_id=mc.id
    JOIN mat_contacts ct ON mr.contact_id=ct.id
    LEFT JOIN students s ON mr.student_id=s.id
    WHERE mr.id=?`, [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Not found' });
  r.items = db.all(`SELECT * FROM mat_request_items WHERE request_id=? ORDER BY sort_order`, [req.params.id]);
  r.uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [req.params.id]);
  r.reminders = db.all(`SELECT * FROM mat_reminder_logs WHERE request_id=? ORDER BY sent_at DESC LIMIT 20`, [req.params.id]);
  res.json(r);
});

app.put('/api/mat-requests/:id', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const { deadline, notes, auto_remind_paused, status } = req.body;
  const existing = db.get(`SELECT * FROM mat_requests WHERE id=?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.run(`UPDATE mat_requests SET deadline=?,notes=?,auto_remind_paused=?,status=?,updated_at=datetime('now') WHERE id=?`,
    [deadline || existing.deadline, notes !== undefined ? notes : existing.notes,
     auto_remind_paused !== undefined ? auto_remind_paused : existing.auto_remind_paused,
     status || existing.status, req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/mat-requests/:id', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  db.run(`UPDATE mat_requests SET status='CANCELLED', updated_at=datetime('now') WHERE id=?`, [req.params.id]);
  db.run(`UPDATE mat_magic_tokens SET status='REVOKED' WHERE request_id=? AND status='ACTIVE'`, [req.params.id]);
  res.json({ ok: true });
});

// 手动催件
app.post('/api/mat-requests/:id/remind', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const r = db.get(`SELECT mr.*,ct.name as contact_name,ct.email as contact_email
    FROM mat_requests mr JOIN mat_contacts ct ON mr.contact_id=ct.id WHERE mr.id=?`, [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Not found' });
  const contact = { name: r.contact_name, email: r.contact_email };
  const { link } = _matCreateMagicLink(r.id, r.contact_id);
  _matSendInviteEmail(r, contact, link, 'overdue');
  db.run(`INSERT INTO mat_reminder_logs (id,request_id,type,sent_to,status) VALUES (?,?,?,?,?)`,
    [uuidv4(), r.id, 'manual', contact.email, 'sent']);
  _matAudit(r.id, 'internal', req.session.user.id, req.session.user.username, 'MANUAL_REMIND', {}, req.ip);
  res.json({ ok: true });
});

// 审核材料项
app.put('/api/mat-request-items/:id/review', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const { action, reason } = req.body; // action: 'approve' | 'reject'
  if (!['approve','reject'].includes(action)) return res.status(400).json({ error: '无效操作' });
  const item = db.get(`SELECT * FROM mat_request_items WHERE id=?`, [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
  db.run(`UPDATE mat_request_items SET status=?,reject_reason=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=?`,
    [status, reason||null, req.session.user.id, req.params.id]);

  // 单个文件退回不发邮件（邮件只通过统一退回弹窗发送）
  // 单个文件审核也不自动改 request 状态（避免 request/UIF 状态不同步）
  // 只在全部通过时自动更新
  const allItems = db.all(`SELECT * FROM mat_request_items WHERE request_id=?`, [item.request_id]);
  const allApproved = allItems.every(i => i.id === req.params.id ? status === 'APPROVED' : i.status === 'APPROVED');
  if (allApproved) {
    db.run(`UPDATE mat_requests SET status='APPROVED',updated_at=datetime('now') WHERE id=?`, [item.request_id]);
  }
  // 不全部通过时不改 request 状态——由统一退回操作处理

  res.json({ ok: true });
});

// UIF 操作
app.get('/api/mat-uif/:requestId', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [req.params.requestId]);
  res.json(uif || { request_id: req.params.requestId, data: '{}', status: 'DRAFT' });
});
// 别名路由（兼容前端缓存）
app.get('/api/mat-requests/:id/uif', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [req.params.id]);
  res.json(uif || { request_id: req.params.id, data: '{}', status: 'DRAFT' });
});

// 保存表单字段审核标注（不改状态，只更新 field_notes）
app.put('/api/mat-uif/:requestId/field-notes', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const { field_notes } = req.body;
  db.run(`UPDATE mat_uif_submissions SET field_notes=? WHERE request_id=?`,
    [field_notes ? JSON.stringify(field_notes) : null, req.params.requestId]);
  res.json({ ok: true });
});

app.post('/api/mat-uif/:requestId/merge', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const { fields } = req.body; // { uif_field: value, ... } — only selected fields
  const uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [req.params.requestId]);
  if (!uif) return res.status(404).json({ error: 'UIF not found' });
  const r = db.get(`SELECT * FROM mat_requests WHERE id=?`, [req.params.requestId]);
  if (!r?.student_id) return res.status(400).json({ error: '该请求未关联学生档案' });

  // UIF field → student column (direct updates)
  // en_name intentionally excluded: students table `name` stores Chinese name; English name goes to notes
  const directMap = {
    dob:   'date_of_birth',
    grade: 'grade_level',
  };

  const fieldLabels = {
    cn_name:'中文姓名', en_name:'英文姓名', gender:'性别', dob:'出生日期',
    nationality:'国籍', passport_no:'护照号码', passport_expiry:'护照有效期',
    phone:'手机号码', email:'电子邮箱', wechat:'微信号', emergency_name:'紧急联系人',
    emergency_rel:'关系', emergency_phone:'紧急联系电话',
    school:'就读学校', grade:'年级', grad_date:'预计毕业日期', grades_notes:'成绩情况',
    ielts:'雅思成绩', toefl:'托福成绩', other_lang:'其他语言成绩',
    target_countries:'目标国家', target_major:'目标专业', intake_season:'申请轮次',
    budget:'留学预算', scholarship:'奖学金需求', activities:'课外活动',
    ps_draft:'个人陈述草稿', agent_notes:'中介备注',
  };

  const applied = [];
  const notesLines = [];

  for (const [field, value] of Object.entries(fields || {})) {
    if (!value) continue;
    const col = directMap[field];
    if (col) {
      db.run(`UPDATE students SET ${col}=?, updated_at=datetime('now') WHERE id=?`, [value, r.student_id]);
    } else {
      notesLines.push(`${fieldLabels[field] || field}: ${value}`);
    }
    applied.push(field);
  }

  // Append non-direct fields to student notes
  if (notesLines.length > 0) {
    const student = db.get(`SELECT notes FROM students WHERE id=?`, [r.student_id]);
    const existing = student?.notes || '';
    const dateStr = new Date().toLocaleDateString('zh-CN');
    const block = `\n\n== UIF 信息（${dateStr}）==\n` + notesLines.join('\n');
    db.run(`UPDATE students SET notes=?, updated_at=datetime('now') WHERE id=?`,
      [(existing + block).trim(), r.student_id]);
  }

  db.run(`UPDATE mat_uif_submissions SET status='MERGED', merged_at=datetime('now'),
    merge_diff=?, reviewed_by=?, reviewed_at=datetime('now') WHERE request_id=?`,
    [JSON.stringify({ applied, fields }), req.session.user.id, req.params.requestId]);
  db.run(`UPDATE mat_requests SET status='COMPLETED', updated_at=datetime('now') WHERE id=?`, [req.params.requestId]);
  _matAudit(req.params.requestId, 'internal', req.session.user.id, req.session.user.username, 'UIF_MERGED', { applied }, req.ip);
  res.json({ ok: true, applied });
});

// ── 外部 Agent Workspace API (Magic Link 鉴权) ────────

// Agent 限流辅助
function _agentRateLimit(token, res) {
  const now = Date.now();
  const key = token ? token.slice(0, 16) : 'anon';
  let r = agentCallAttempts.get(key);
  if (!r || now > r.resetAt) { r = { count: 0, resetAt: now + AGENT_CALL_WINDOW_MS }; agentCallAttempts.set(key, r); }
  r.count++;
  if (r.count > AGENT_CALL_MAX) {
    res.status(429).json({ error: 'TOO_MANY_REQUESTS' });
    return false;
  }
  return true;
}

app.get('/api/agent/auth', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Missing token' });
  if (!_agentRateLimit(token, res)) return;
  const v = _matValidateToken(token, req.ip);
  if (v.error) return res.status(v.status).json({ error: v.error });
  const contact = db.get(`SELECT id,name,email,phone FROM mat_contacts WHERE id=?`, [v.rec.contact_id]);
  const r = db.get(`SELECT mr.*,mc.name as company_name FROM mat_requests mr
    JOIN mat_companies mc ON mr.company_id=mc.id WHERE mr.id=?`, [v.rec.request_id]);
  if (!r) return res.status(404).json({ error: 'Request not found' });
  if (['CANCELLED', 'COMPLETED'].includes(r.status)) return res.status(403).json({ error: `REQUEST_${r.status}` });
  // 附加打回信息
  r.return_reason = r.return_reason || null;
  r.editable = ['PENDING','IN_PROGRESS','REVISION_NEEDED'].includes(r.status);
  res.json({ request: r, contact, token });
});

app.get('/api/agent/workspace', (req, res) => {
  const { token } = req.query;
  if (!_agentRateLimit(token, res)) return;
  const v = _matValidateToken(token, req.ip);
  if (v.error) return res.status(v.status).json({ error: v.error });
  const r = db.get(`SELECT mr.*,mc.name as company_name,ct.name as contact_name
    FROM mat_requests mr JOIN mat_companies mc ON mr.company_id=mc.id
    JOIN mat_contacts ct ON mr.contact_id=ct.id WHERE mr.id=?`, [v.rec.request_id]);
  if (['CANCELLED', 'COMPLETED'].includes(r?.status)) return res.status(403).json({ error: `REQUEST_${r.status}` });
  r.items = db.all(`SELECT * FROM mat_request_items WHERE request_id=? ORDER BY sort_order`, [v.rec.request_id]);
  r.uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [v.rec.request_id])
           || { data: '{}', status: 'DRAFT' };
  // 附加打回信息：字段级备注和退回原因
  r.return_reason = r.return_reason || null;
  r.field_notes = null;
  try { r.field_notes = r.uif.field_notes ? JSON.parse(r.uif.field_notes) : null; } catch(e) {}
  // 版本历史
  r.versions = db.all(`SELECT id, version_no, status, submitted_at, reviewed_at, return_reason FROM mat_uif_versions WHERE request_id=? ORDER BY version_no DESC`, [v.rec.request_id]);
  // 当前是否可编辑（PENDING/IN_PROGRESS/REVISION_NEEDED 状态下可编辑）
  r.editable = ['PENDING','IN_PROGRESS','REVISION_NEEDED'].includes(r.status);
  res.json(r);
});

app.post('/api/agent/upload/:itemId', upload.single('file'), (req, res) => {
  const { token } = req.query;
  if (!_agentRateLimit(token, res)) return;
  const v = _matValidateToken(token, req.ip);
  if (v.error) return res.status(v.status).json({ error: v.error });
  const reqStatus = db.get(`SELECT status FROM mat_requests WHERE id=?`, [v.rec.request_id]);
  if (reqStatus && ['CANCELLED', 'COMPLETED'].includes(reqStatus.status)) {
    return res.status(403).json({ error: `REQUEST_${reqStatus.status}` });
  }

  const item = db.get(`SELECT mi.* FROM mat_request_items mi
    JOIN mat_requests mr ON mi.request_id=mr.id
    WHERE mi.id=? AND mr.id=?`, [req.params.itemId, v.rec.request_id]);
  if (!item) return res.status(403).json({ error: 'FORBIDDEN' });
  if (item.status === 'APPROVED') return res.status(403).json({ error: 'ITEM_ALREADY_APPROVED' });
  if (!req.file) return res.status(400).json({ error: '未收到文件' });

  const fileId = req.file.filename;
  moveUploadedFile(fileId, 'material');
  // 计算文件版本号
  const curFileVer = db.get(`SELECT MAX(version_no) as mv FROM mat_item_versions WHERE item_id=?`, [req.params.itemId]);
  const fileVersionNo = (curFileVer?.mv || 0) + 1;
  // 标记旧版本为 superseded
  db.run(`UPDATE mat_item_versions SET is_current=0 WHERE item_id=? AND is_current=1`, [req.params.itemId]);
  // 创建新文件版本记录
  db.run(`INSERT INTO mat_item_versions (id,item_id,request_id,version_no,file_id,file_name,file_size,status,uploaded_at,is_current) VALUES (?,?,?,?,?,?,?,?,datetime('now'),1)`,
    [uuidv4(), req.params.itemId, v.rec.request_id, fileVersionNo, fileId, req.file.originalname, req.file.size, 'UPLOADED']);
  // 更新主记录
  db.run(`UPDATE mat_request_items SET status='UPLOADED',file_id=?,file_name=?,file_size=?,uploaded_at=datetime('now'),
    reject_reason=NULL,version_no=? WHERE id=?`,
    [fileId, req.file.originalname, req.file.size, fileVersionNo, req.params.itemId]);

  // Update request status to IN_PROGRESS if still PENDING
  const r = db.get(`SELECT status FROM mat_requests WHERE id=?`, [v.rec.request_id]);
  if (r && r.status === 'PENDING') {
    db.run(`UPDATE mat_requests SET status='IN_PROGRESS',updated_at=datetime('now') WHERE id=?`, [v.rec.request_id]);
  }

  // Check if all required items submitted → SUBMITTED
  const allItems = db.all(`SELECT * FROM mat_request_items WHERE request_id=?`, [v.rec.request_id]);
  const requiredPending = allItems.filter(i => i.is_required && (i.id === req.params.itemId ? false : i.status === 'PENDING'));
  if (requiredPending.length === 0) {
    db.run(`UPDATE mat_requests SET status='SUBMITTED',updated_at=datetime('now') WHERE id=?`, [v.rec.request_id]);
  }

  _matAudit(v.rec.request_id, 'agent', v.rec.contact_id, '', 'FILE_UPLOAD', { item: item.name, file: req.file.originalname }, req.ip);
  res.json({ ok: true, file_id: fileId, file_name: req.file.originalname, file_size: req.file.size });
});

app.get('/api/agent/uif', (req, res) => {
  const { token } = req.query;
  if (!_agentRateLimit(token, res)) return;
  const v = _matValidateToken(token, req.ip);
  if (v.error) return res.status(v.status).json({ error: v.error });
  const uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=?`, [v.rec.request_id])
              || { data: '{}', status: 'DRAFT' };
  res.json(uif);
});

app.put('/api/agent/uif', (req, res) => {
  const { token } = req.query;
  if (!_agentRateLimit(token, res)) return;
  const v = _matValidateToken(token, req.ip);
  if (v.error) return res.status(v.status).json({ error: v.error });
  const reqStatus = db.get(`SELECT status FROM mat_requests WHERE id=?`, [v.rec.request_id]);
  if (reqStatus && ['CANCELLED', 'COMPLETED'].includes(reqStatus.status)) {
    return res.status(403).json({ error: `REQUEST_${reqStatus.status}` });
  }
  // SUBMITTED/APPROVED 状态下不允许修改（除非被打回）
  if (reqStatus && ['SUBMITTED','APPROVED'].includes(reqStatus.status)) {
    return res.status(403).json({ error: '已提交审核中，不能修改' });
  }
  const { data } = req.body;
  const existing = db.get(`SELECT id, data AS old_data FROM mat_uif_submissions WHERE request_id=?`, [v.rec.request_id]);
  if (existing) {
    // 合并保存：保护已有的签名和证件照数据不被空覆盖
    let merged = data;
    if (existing.old_data) {
      try {
        const old = JSON.parse(existing.old_data);
        if (!merged._id_photo_data && old._id_photo_data) merged._id_photo_data = old._id_photo_data;
        if (!merged._id_photo_file && old._id_photo_file) merged._id_photo_file = old._id_photo_file;
        if ((!merged._signatures || !Object.keys(merged._signatures).length) && old._signatures && Object.keys(old._signatures).length) {
          merged._signatures = old._signatures;
        }
      } catch(e) {}
    }
    db.run(`UPDATE mat_uif_submissions SET data=? WHERE request_id=?`, [JSON.stringify(merged), v.rec.request_id]);
  } else {
    db.run(`INSERT INTO mat_uif_submissions (id,request_id,data,status) VALUES (?,?,?,?)`,
      [uuidv4(), v.rec.request_id, JSON.stringify(data), 'DRAFT']);
  }
  res.json({ ok: true });
});

app.post('/api/agent/uif/submit', (req, res) => {
  console.log('[SUBMIT] called, token:', (req.query.token||'').slice(0,8));
  const { token } = req.query;
  if (!_agentRateLimit(token, res)) { console.log('[SUBMIT] rate limited'); return; }
  const v = _matValidateToken(token, req.ip);
  if (v.error) { console.log('[SUBMIT] token error:', v.error); return res.status(v.status).json({ error: v.error }); }
  console.log('[SUBMIT] request_id:', v.rec.request_id.slice(0,8));
  const mr = db.get(`SELECT status, current_version FROM mat_requests WHERE id=?`, [v.rec.request_id]);
  console.log('[SUBMIT] mr.status:', mr?.status, 'version:', mr?.current_version);
  if (mr && ['CANCELLED', 'COMPLETED'].includes(mr.status)) {
    console.log('[SUBMIT] BLOCKED: request cancelled/completed');
    return res.status(403).json({ error: `REQUEST_${mr.status}` });
  }
  // 不允许已提交后重复提交（除非被打回或 UIF 状态不一致）
  if (mr && mr.status === 'SUBMITTED') {
    const uifCheck = db.get(`SELECT status FROM mat_uif_submissions WHERE request_id=?`, [v.rec.request_id]);
    console.log('[SUBMIT] duplicate check: uif.status=', uifCheck?.status);
    if (uifCheck && uifCheck.status === 'SUBMITTED') {
      console.log('[SUBMIT] BLOCKED: already submitted');
      return res.status(400).json({ error: '已提交，请等待审核' });
    }
    console.log('[SUBMIT] ALLOWED: uif not SUBMITTED, proceeding to fix');
  }

  const { data } = req.body;
  const dataStr = JSON.stringify(data);
  const newVersion = (mr?.current_version || 0) + 1;

  // 更新 mat_uif_submissions（主记录）
  const existing = db.get(`SELECT id, status FROM mat_uif_submissions WHERE request_id=?`, [v.rec.request_id]);
  console.log('[UIF SUBMIT]', v.rec.request_id.slice(0,8), 'existing:', existing ? 'id='+existing.id.slice(0,8)+' status='+existing.status : 'NONE', '→ newVersion:', newVersion);
  if (existing) {
    db.run(`UPDATE mat_uif_submissions SET data=?,status='SUBMITTED',submitted_at=datetime('now'),version_no=?,return_reason=NULL,field_notes=NULL WHERE request_id=?`,
      [dataStr, newVersion, v.rec.request_id]);
  } else {
    db.run(`INSERT INTO mat_uif_submissions (id,request_id,data,status,submitted_at,version_no) VALUES (?,?,?,?,datetime('now'),?)`,
      [uuidv4(), v.rec.request_id, dataStr, 'SUBMITTED', newVersion]);
  }
  // 验证
  const verify = db.get(`SELECT status FROM mat_uif_submissions WHERE request_id=?`, [v.rec.request_id]);
  console.log('[UIF SUBMIT] after update:', verify?.status);

  // 创建版本快照
  db.run(`UPDATE mat_uif_versions SET is_current=0 WHERE request_id=?`, [v.rec.request_id]);
  db.run(`INSERT INTO mat_uif_versions (id,request_id,version_no,data,status,submitted_at,is_current) VALUES (?,?,?,?,?,datetime('now'),1)`,
    [uuidv4(), v.rec.request_id, newVersion, dataStr, 'SUBMITTED']);

  // 更新请求状态和版本号
  db.run(`UPDATE mat_requests SET status='SUBMITTED',current_version=?,updated_at=datetime('now'),return_reason=NULL,returned_at=NULL WHERE id=?`,
    [newVersion, v.rec.request_id]);

  // 若已有 PDF，标记为 outdated
  const caseId = db.get(`SELECT intake_case_id FROM mat_requests WHERE id=?`, [v.rec.request_id])?.intake_case_id;
  if (caseId) {
    const profileId = db.get(`SELECT adm_profile_id FROM intake_cases WHERE id=?`, [caseId])?.adm_profile_id;
    if (profileId) {
      db.run(`UPDATE adm_generated_documents SET is_outdated=1 WHERE profile_id=? AND is_latest=1`, [profileId]);
    }
  }

  _matAudit(v.rec.request_id, 'agent', v.rec.contact_id, '', 'UIF_SUBMITTED', { version: newVersion }, req.ip);
  res.json({ ok: true, version: newVersion });
});

// ── POST /api/mat-requests/:id/approve — 审核通过 UIF ──
app.post('/api/mat-requests/:id/approve', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const mr = db.get(`SELECT * FROM mat_requests WHERE id=?`, [req.params.id]);
  if (!mr) return res.status(404).json({ error: '请求不存在' });
  if (!['SUBMITTED','REVISION_NEEDED'].includes(mr.status)) return res.status(400).json({ error: '当前状态不允许审核通过: ' + mr.status });

  db.run(`UPDATE mat_requests SET status='APPROVED',approved_at=datetime('now'),return_reason=NULL,updated_at=datetime('now') WHERE id=?`, [req.params.id]);
  db.run(`UPDATE mat_uif_submissions SET status='APPROVED',return_reason=NULL,field_notes=NULL,reviewed_by=?,reviewed_at=datetime('now') WHERE request_id=?`,
    [req.session.user.id, req.params.id]);
  // 更新版本记录
  db.run(`UPDATE mat_uif_versions SET status='APPROVED',reviewed_by=?,reviewed_at=datetime('now') WHERE request_id=? AND is_current=1`,
    [req.session.user.id, req.params.id]);

  _matAudit(req.params.id, 'internal', req.session.user.id, req.session.user.name||'', 'UIF_APPROVED', { version: mr.current_version }, req.ip);
  db.run(`INSERT INTO mat_review_actions (id,request_id,action_type,actor_id,actor_name,version_no,ip_address) VALUES (?,?,?,?,?,?,?)`,
    [uuidv4(), req.params.id, 'APPROVE', req.session.user.id, req.session.user.name||'', mr.current_version, req.ip]);
  res.json({ ok: true });
});

// ── POST /api/mat-requests/:id/return — 打回修改 ──
app.post('/api/mat-requests/:id/return', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const mr = db.get(`SELECT * FROM mat_requests WHERE id=?`, [req.params.id]);
  if (!mr) return res.status(404).json({ error: '请求不存在' });
  if (!['SUBMITTED','APPROVED','MERGED','REVISION_NEEDED'].includes(mr.status)) return res.status(400).json({ error: '当前状态不允许打回: ' + mr.status });

  const { reason, field_notes, file_rejects, add_items } = req.body;
  if (!reason) return res.status(400).json({ error: '请填写退回原因' });

  // 1. 更新请求状态
  db.run(`UPDATE mat_requests SET status='REVISION_NEEDED',return_reason=?,returned_at=datetime('now'),updated_at=datetime('now') WHERE id=?`,
    [reason, req.params.id]);

  // 2. 更新 UIF 表单状态
  db.run(`UPDATE mat_uif_submissions SET status='RETURNED',return_reason=?,field_notes=?,reviewed_by=?,reviewed_at=datetime('now') WHERE request_id=?`,
    [reason, field_notes ? JSON.stringify(field_notes) : null, req.session.user.id, req.params.id]);
  db.run(`UPDATE mat_uif_versions SET status='RETURNED',return_reason=?,reviewed_by=?,reviewed_at=datetime('now') WHERE request_id=? AND is_current=1`,
    [reason, req.session.user.id, req.params.id]);

  // 3. 处理文件退回（批量标记指定文件为 REJECTED）
  const rejectedFiles = [];
  if (file_rejects && file_rejects.length) {
    for (const fr of file_rejects) {
      const item = db.get(`SELECT id, name FROM mat_request_items WHERE id=? AND request_id=?`, [fr.item_id, req.params.id]);
      if (item) {
        db.run(`UPDATE mat_request_items SET status='REJECTED',reject_reason=? WHERE id=?`, [fr.reason || '需要重新上传', item.id]);
        rejectedFiles.push({ name: item.name, reason: fr.reason || '需要重新上传' });
      }
    }
  }

  // 3b. 追加新文件项
  const addedItems = [];
  if (add_items && add_items.length) {
    for (const item of add_items) {
      if (!item.name || !item.name.trim()) continue;
      const itemId = uuidv4();
      db.run(`INSERT INTO mat_request_items (id, request_id, name, is_required, status) VALUES (?,?,?,?,?)`,
        [itemId, req.params.id, item.name.trim(), item.is_required ? 1 : 0, 'PENDING']);
      addedItems.push({ name: item.name.trim(), is_required: !!item.is_required });
    }
  }

  // 4. 标记已有 PDF 为 outdated
  if (mr.intake_case_id) {
    const profileId = db.get(`SELECT adm_profile_id FROM intake_cases WHERE id=?`, [mr.intake_case_id])?.adm_profile_id;
    if (profileId) db.run(`UPDATE adm_generated_documents SET is_outdated=1 WHERE profile_id=? AND is_latest=1`, [profileId]);
  }

  // 5. 审计记录 + 退回动作记录
  _matAudit(req.params.id, 'internal', req.session.user.id, req.session.user.name||'', 'RETURNED', {
    reason, field_notes: field_notes || null, rejected_files: rejectedFiles.length ? rejectedFiles : null,
    version: mr.current_version
  }, req.ip);
  db.run(`INSERT INTO mat_review_actions (id,request_id,action_type,actor_id,actor_name,reason,field_notes,file_rejects,add_items,version_no,ip_address) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [uuidv4(), req.params.id, 'RETURN', req.session.user.id, req.session.user.name||'',
     reason, field_notes ? JSON.stringify(field_notes) : null,
     rejectedFiles.length ? JSON.stringify(rejectedFiles) : null,
     addedItems.length ? JSON.stringify(addedItems) : null,
     mr.current_version, req.ip]);

  // 6. 发送 1 封汇总邮件
  try {
    const contact = db.get(`SELECT name,email FROM mat_contacts WHERE id=?`, [mr.contact_id]);
    const tk = db.get(`SELECT token FROM mat_magic_tokens WHERE request_id=? AND status='ACTIVE'`, [req.params.id]);
    if (contact?.email && tk) {
      const link = `${req.protocol}://${req.get('host')}/agent.html?token=${tk.token}`;

      // 构建邮件分区内容
      let sections = '';

      // 退回原因
      sections += `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:14px;margin:0 0 16px;">
        <strong style="color:#dc2626;">⚠ 您的材料需要修改</strong>
        <p style="margin:8px 0 0;color:#333;white-space:pre-line">${escHtml(reason)}</p>
      </div>`;

      // 追加文件项
      if (addedItems.length) {
        sections += `<div style="margin:0 0 16px;padding:12px 16px;background:#f5f3ff;border-radius:6px;border:1px solid #c4b5fd;">
          <strong style="color:#7c3aed;">📎 需要额外上传的文件</strong>
          <ul style="margin:8px 0 0;padding-left:20px">
            ${addedItems.map(a => `<li style="margin:4px 0"><strong>${escHtml(a.name)}</strong>${a.is_required ? ' <span style="color:#dc2626">(必须)</span>' : ' (可选)'}</li>`).join('')}
          </ul>
        </div>`;
      }

      sections += `<div style="margin:16px 0 0;padding:12px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0;">
        <p style="margin:0;color:#166534;font-size:14px"><strong>操作说明：</strong></p>
        <p style="margin:4px 0 0;color:#333;font-size:13px">请点击下方链接进入材料收集页面。系统会保留您之前填写的内容。</p>
      </div>`;

      const _emRet = brandedEmail(sections, {
        greeting: `您好 ${escHtml(contact.name)}，`,
        buttonUrl: link,
        buttonText: '修改并重新提交 →',
        footerExtra: '如有疑问请联系顾问。'
      });
      sendMail(contact.email, `【修改通知】${mr.title} 需要修改`, _emRet.html, _emRet.attachments).catch(e => console.error('[MAT RETURN MAIL]', e.message));
    }
  } catch(e) { console.error('Return email failed:', e.message); }

  res.json({ ok: true });
});

// ── POST /api/mat-requests/:id/add-items — 追加文件项（要求补充材料）──
app.post('/api/mat-requests/:id/add-items', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const mr = db.get(`SELECT * FROM mat_requests WHERE id=?`, [req.params.id]);
  if (!mr) return res.status(404).json({ error: '请求不存在' });
  if (['CANCELLED','COMPLETED'].includes(mr.status)) return res.status(400).json({ error: '请求已结束' });

  const { items, notify } = req.body; // items: [{name, is_required}], notify: boolean
  if (!items || !items.length) return res.status(400).json({ error: '请添加至少一个文件项' });

  const added = [];
  for (const item of items) {
    if (!item.name || !item.name.trim()) continue;
    const itemId = uuidv4();
    db.run(`INSERT INTO mat_request_items (id, request_id, name, is_required, status) VALUES (?,?,?,?,?)`,
      [itemId, mr.id, item.name.trim(), item.is_required ? 1 : 0, 'PENDING']);
    added.push({ id: itemId, name: item.name.trim(), is_required: !!item.is_required });
  }

  // 如果请求已经是 APPROVED/MERGED，改回 REVISION_NEEDED 让代理可以补传
  if (['APPROVED','MERGED','SUBMITTED'].includes(mr.status)) {
    db.run(`UPDATE mat_requests SET status='REVISION_NEEDED',return_reason=?,updated_at=datetime('now') WHERE id=?`,
      ['需要补充材料: ' + added.map(a => a.name).join(', '), mr.id]);
  }

  // 记录审计
  _matAudit(mr.id, 'internal', req.session.user.id, req.session.user.name||'', 'ITEMS_ADDED',
    { items: added.map(a => a.name) }, req.ip);

  // 发邮件通知代理
  if (notify) {
    try {
      const tk = db.get(`SELECT token FROM mat_magic_tokens WHERE request_id=? AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`, [mr.id]);
      const contact = db.get(`SELECT c.name, c.email FROM mat_contacts c JOIN mat_requests mr ON mr.contact_id=c.id WHERE mr.id=?`, [mr.id]);
      if (tk && contact) {
        const link = `${req.protocol}://${req.get('host')}/agent.html?token=${tk.token}`;
        const itemList = added.map(a => `<li>${escHtml(a.name)}${a.is_required ? ' <span style="color:#dc2626">(必须)</span>' : ' (可选)'}</li>`).join('');
        const _em = brandedEmail(
          `<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;padding:14px;margin:0 0 16px;">
            <strong style="color:#1d4ed8;">📎 需要补充材料</strong>
            <p style="margin:8px 0 0;color:#333;">请补充上传以下文件：</p>
            <ul style="margin:8px 0 0;padding-left:20px">${itemList}</ul>
          </div>
          <p style="color:#555;">请通过以下链接上传补充材料：</p>`,
          { greeting: `您好 ${escHtml(contact.name)}，`, buttonUrl: link, buttonText: '上传补充材料 →', footerExtra: '如有疑问请联系顾问。' }
        );
        sendMail(contact.email, `【补充材料】${mr.title}`, _em.html, _em.attachments).catch(e => console.error('[ADD ITEMS MAIL]', e.message));
      }
    } catch(e) { console.error('Add items email failed:', e.message); }
  }

  res.json({ ok: true, added });
});

// ── GET /api/mat-requests/:id/versions — 版本历史 ──
app.get('/api/mat-requests/:id/versions', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const versions = db.all(`SELECT id, version_no, status, submitted_at, reviewed_at, return_reason, field_notes, reviewed_by FROM mat_uif_versions WHERE request_id=? ORDER BY version_no DESC`, [req.params.id]);
  // 文件版本历史
  const itemVersions = db.all(`SELECT iv.*, mi.name as item_name FROM mat_item_versions iv JOIN mat_request_items mi ON iv.item_id=mi.id WHERE iv.request_id=? ORDER BY iv.version_no DESC`, [req.params.id]);
  res.json({ uifVersions: versions, itemVersions });
});

// ── GET /api/mat-request-items/:id/versions — 单项文件版本历史 ──
app.get('/api/mat-request-items/:id/versions', requireAuth, (req, res) => {
  const versions = db.all(`SELECT * FROM mat_item_versions WHERE item_id=? ORDER BY version_no DESC`, [req.params.id]);
  res.json(versions);
});

// ── POST /api/mat-requests/:id/generate-documents — 从 UIF 数据生成 3 份申请文件 ──
app.post('/api/mat-requests/:id/generate-documents', requireAuth, requireRole('principal','counselor','intake_staff','student_admin'), (req, res) => {
  const requestId = req.params.id;
  const request = db.get(`SELECT * FROM mat_requests WHERE id=?`, [requestId]);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const uif = db.get(`SELECT * FROM mat_uif_submissions WHERE request_id=? AND status IN ('SUBMITTED','APPROVED','MERGED')`, [requestId]);
  if (!uif) return res.status(400).json({ error: 'UIF 尚未提交或未通过审核' });
  // 警告：仅 APPROVED 状态才能生成正式 PDF（SUBMITTED 允许但会提示）
  if (uif.status === 'SUBMITTED' && !req.body.force) {
    // 允许但记录警告
    _matAudit(requestId, 'internal', req.session.user.id, req.session.user.name||'', 'PDF_GENERATED_WITHOUT_APPROVAL', { version: uif.version_no }, req.ip);
  }

  let data;
  try { data = JSON.parse(uif.data || '{}'); } catch(e) { return res.status(400).json({ error: 'Invalid UIF data' }); }

  // Check if already has an adm_profile linked to this request
  // 找到关联的 intake_case_id（从 mat_request 获取）
  const intakeCaseId = request.intake_case_id || null;

  // 查找已有 profile：优先通过 intake_case_id，其次通过 mat_request_id
  let profile = intakeCaseId
    ? db.get(`SELECT * FROM adm_profiles WHERE intake_case_id=?`, [intakeCaseId])
    : db.get(`SELECT * FROM adm_profiles WHERE intake_case_id=?`, [requestId]); // legacy fallback
  const profileId = profile ? profile.id : uuidv4();

  // Map UIF flat fields to adm_profiles columns
  const profileFields = [
    'course_name','course_code','intake_year','intake_month','study_mode','campus','school_name',
    'surname','given_name','chinese_name','alias','gender','dob','birth_certificate_no',
    'nationality','birth_country','birth_city','race','religion','occupation','marital_status',
    'email','phone_mobile','phone_home',
    'passport_type','passport_no','passport_issue_date','passport_expiry','passport_issue_country','passport_issue_place',
    'foreign_identification_no','malaysian_id_no',
    'sg_pass_type','sg_nric_fin','sg_pass_expiry','was_ever_sg_citizen_or_pr','requires_student_pass',
    'prior_sg_study','prior_sg_school','prior_sg_year',
    'address_line1','address_line2','city','state_province','postal_code','country_of_residence',
    'sg_address','sg_tel_no','hometown_address',
    'native_language','english_proficiency','ielts_score','toefl_score','other_lang_test','other_lang_score',
    'highest_lang_proficiency','need_english_placement_test',
    'financial_source','annual_income','sponsor_name','sponsor_relation','bank_statement_available',
    'applicant_monthly_income','applicant_current_saving','spouse_monthly_income','spouse_current_saving',
    'father_monthly_income','father_current_saving','mother_monthly_income','mother_current_saving',
    'other_financial_support','other_financial_details','other_financial_amount',
    'antecedent_q1','antecedent_q2','antecedent_q3','antecedent_q4','antecedent_remarks',
    'pdpa_consent','pdpa_marketing','pdpa_photo_video','remarks',
    'period_applied_from','period_applied_to',
    'f16_declaration_agreed','v36_declaration_agreed',
    'no_education_info','no_employment_info',
  ];

  // Coerce boolean string values ('1'/'0') to integers for DB
  const boolFields = ['antecedent_q1','antecedent_q2','antecedent_q3','antecedent_q4',
    'was_ever_sg_citizen_or_pr','requires_student_pass','prior_sg_study',
    'need_english_placement_test','other_financial_support','bank_statement_available',
    'pdpa_consent','pdpa_marketing','pdpa_photo_video','f16_declaration_agreed','v36_declaration_agreed',
    'no_education_info','no_employment_info'];
  boolFields.forEach(f => { if (data[f] !== undefined) data[f] = (data[f] === '1' || data[f] === true || data[f] === 1) ? 1 : 0; });

  if (!profile) {
    // Create new adm_profile
    const cols = ['id','intake_case_id','created_by','source_type','status','step_completed','created_at','updated_at'];
    const vals = [profileId, intakeCaseId || requestId, req.session.user.id, 'agent', 'submitted', 11, new Date().toISOString(), new Date().toISOString()];
    profileFields.forEach(f => { if (data[f] !== undefined) { cols.push(f); vals.push(data[f]); } });
    db.run(`INSERT INTO adm_profiles (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`, vals);
  } else {
    // Update existing
    const sets = ['updated_at=?','status=?'];
    const vals = [new Date().toISOString(), 'submitted'];
    profileFields.forEach(f => { if (data[f] !== undefined) { sets.push(`${f}=?`); vals.push(data[f]); } });
    vals.push(profileId);
    db.run(`UPDATE adm_profiles SET ${sets.join(',')} WHERE id=?`, vals);
  }

  // Save ID photo from base64 data
  if (data._id_photo_data && data._id_photo_data.startsWith('data:image/')) {
    try {
      const fs = require('fs');
      const path = require('path');
      const base64 = data._id_photo_data.replace(/^data:image\/\w+;base64,/, '');
      const ext = data._id_photo_data.match(/^data:image\/(\w+)/)?.[1] || 'jpg';
      const photoFileId = uuidv4() + '.' + ext;
      fileStorage.saveFile('photo', photoFileId, Buffer.from(base64, 'base64'));
      db.run(`UPDATE adm_profiles SET id_photo=? WHERE id=?`, [photoFileId, profileId]);
    } catch(e) { console.error('[ADM] Photo save error:', e.message); }
  }

  // Clean and filter empty array records
  const _cleanArr = (arr) => (arr||[]).filter(item => Object.values(item).some(v => v && v !== ''));

  // Write family members
  const familyArr = _cleanArr(data._family);
  if (familyArr.length > 0) {
    db.run(`DELETE FROM adm_family_members WHERE profile_id=?`, [profileId]);
    familyArr.forEach((m, idx) => {
      db.run(`INSERT INTO adm_family_members (id,profile_id,member_type,surname,given_name,dob,nationality,sg_status,nric_fin,occupation,sex,sg_mobile,email,contact_number,passport_no,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), profileId, m.member_type||'', m.surname||'', m.given_name||'', m.dob||null, m.nationality||'', m.sg_status||'', m.nric_fin||m.passport_no||'', m.occupation||'', m.sex||'', m.sg_mobile||'', m.email||'', m.contact_number||m.sg_mobile||'', m.passport_no||'', idx]);
    });
  }

  // Write residence history
  const resArr = _cleanArr(data._residence);
  if (resArr.length > 0) {
    db.run(`DELETE FROM adm_residence_history WHERE profile_id=?`, [profileId]);
    resArr.forEach((r, idx) => {
      db.run(`INSERT INTO adm_residence_history (id,profile_id,country,address,date_from,date_to,sort_order) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(), profileId, r.country||'', r.address||'', r.date_from||null, r.date_to||null, idx]);
    });
  }

  // Write education history
  const eduArr = _cleanArr(data._education);
  if (eduArr.length > 0) {
    db.run(`DELETE FROM adm_education_history WHERE profile_id=?`, [profileId]);
    eduArr.forEach((e, idx) => {
      db.run(`INSERT INTO adm_education_history (id,profile_id,institution_name,country,state_province,language_of_instruction,date_from,date_to,qualification,educational_cert_no,obtained_pass_english,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), profileId, e.institution_name||'', e.country||'', e.state_province||'', e.language_of_instruction||'', e.date_from||null, e.date_to||null, e.qualification||'', e.educational_cert_no||'', e.obtained_pass_english==='1'||e.obtained_pass_english===true?1:0, idx]);
    });
  }

  // Write employment history
  const empArr = _cleanArr(data._employment);
  if (empArr.length > 0) {
    db.run(`DELETE FROM adm_employment_history WHERE profile_id=?`, [profileId]);
    empArr.forEach((e, idx) => {
      db.run(`INSERT INTO adm_employment_history (id,profile_id,employer,country,position,date_from,date_to,nature_of_duties,is_current,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), profileId, e.employer||'', e.country||'', e.position||'', e.date_from||null, e.date_to||null, e.nature_of_duties||'', e.is_current==='1'||e.is_current===true?1:0, idx]);
    });
  }

  // Fix field mappings: UIF field names → adm_profiles column names
  // birth_city → birth_province_state (profile column uses this name for SAF "Province/State")
  if (data.birth_city && !data.birth_province_state) {
    db.run(`UPDATE adm_profiles SET birth_province_state=? WHERE id=?`, [data.birth_city, profileId]);
  }
  // passport_issue_place fallback to passport_issue_country
  if (data.passport_issue_country && !data.passport_issue_place) {
    db.run(`UPDATE adm_profiles SET passport_issue_place=? WHERE id=? AND (passport_issue_place IS NULL OR passport_issue_place='')`, [data.passport_issue_country, profileId]);
  }
  // Derive commencement_date from intake_month + intake_year
  if (data.intake_year && data.intake_month) {
    const monthMap = {January:'01',February:'02',March:'03',April:'04',May:'05',June:'06',July:'07',August:'08',September:'09',October:'10',November:'11',December:'12'};
    const mm = monthMap[data.intake_month] || '01';
    const comDate = `${data.intake_year}-${mm}-01`;
    db.run(`UPDATE adm_profiles SET commencement_date=?, period_applied_from=? WHERE id=?`, [comDate, comDate, profileId]);
    // period_applied_to: default +2 years
    // Use last valid day of month (avoid Feb 30 etc.)
    const endYear = parseInt(data.intake_year) + 2;
    const lastDay = new Date(endYear, parseInt(mm), 0).getDate(); // day 0 of next month = last day
    const toDate = `${endYear}-${mm}-${String(lastDay).padStart(2,'0')}`;
    db.run(`UPDATE adm_profiles SET period_applied_to=? WHERE id=? AND (period_applied_to IS NULL OR period_applied_to='')`, [toDate, profileId]);
  }
  // school_name default
  if (!data.school_name) {
    db.run(`UPDATE adm_profiles SET school_name='Equistar International College' WHERE id=? AND (school_name IS NULL OR school_name='')`, [profileId]);
  }

  // Write guardian info (guardian_* fields → adm_guardian_info table)
  const guardianFields = ['surname','given_name','relation','nationality','phone','email','address','passport_no','occupation'];
  const hasGuardian = guardianFields.some(f => data['guardian_' + f]);
  if (hasGuardian) {
    db.run(`DELETE FROM adm_guardian_info WHERE profile_id=?`, [profileId]);
    db.run(`INSERT INTO adm_guardian_info (id,profile_id,surname,given_name,relation,nationality,phone,email,address,passport_no,occupation) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), profileId,
       data.guardian_surname||'', data.guardian_given_name||'', data.guardian_relation||'',
       data.guardian_nationality||'', data.guardian_phone||'', data.guardian_email||'',
       data.guardian_address||'', data.guardian_passport_no||'', data.guardian_occupation||'']);
  }

  // Write signatures (from canvas data)
  const sigs = data._signatures || {};
  db.run(`DELETE FROM adm_signatures WHERE profile_id=?`, [profileId]);
  for (const sigType of ['applicant', 'guardian']) {
    const sig = sigs[sigType];
    if (sig && (sig.sig_data || sig.signer_name)) {
      let fileId = null;
      // Save signature image if present
      if (sig.sig_data && sig.sig_data.startsWith('data:image/png;base64,')) {
        const base64 = sig.sig_data.replace('data:image/png;base64,', '');
        fileId = uuidv4() + '.png';
        try {
          const fs = require('fs');
          const sigPath = require('path').join(UPLOAD_DIR, fileId);
          fs.writeFileSync(sigPath, Buffer.from(base64, 'base64'));
        } catch(e) { console.error('[ADM] Signature save error:', e.message); fileId = null; }
      }
      db.run(`INSERT INTO adm_signatures (id,profile_id,sig_type,signer_name,file_id,sig_date) VALUES (?,?,?,?,?,?)`,
        [uuidv4(), profileId, sigType, sig.signer_name||'', fileId, sig.sig_date||new Date().toISOString().slice(0,10)]);
    }
  }
  // If no signature data but sig_date exists, create a minimal record
  if (!sigs.applicant && data.sig_date) {
    const sigName = (data.surname||'') + ' ' + (data.given_name||'');
    db.run(`INSERT INTO adm_signatures (id,profile_id,sig_type,signer_name,sig_date) VALUES (?,?,?,?,?)`,
      [uuidv4(), profileId, 'applicant', sigName.trim(), data.sig_date]);
  }

  // Write parent PR additional info (from family members with SC/PR status)
  const scPrParents = familyArr.filter(m => ['father','mother','step_father','step_mother'].includes(m.member_type) && ['SC','PR'].includes(m.sg_status));
  if (scPrParents.length > 0) {
    db.run(`DELETE FROM adm_parent_pr_additional WHERE profile_id=?`, [profileId]);
    // Get the family_member DB IDs we just inserted
    const dbFamily = db.all(`SELECT id, member_type FROM adm_family_members WHERE profile_id=?`, [profileId]);
    scPrParents.forEach(par => {
      const dbMem = dbFamily.find(f => f.member_type === par.member_type);
      if (dbMem) {
        db.run(`INSERT INTO adm_parent_pr_additional (id,profile_id,family_member_id,marital_status,marriage_certificate_no,marriage_date,divorce_certificate_no,divorce_date,custody_of_applicant,school_name,school_country,highest_qualification,educational_cert_no,company_name,monthly_income,annual_income,avg_monthly_cpf) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), profileId, dbMem.id, par.pr_marital_status||'', par.pr_marriage_cert||'', par.pr_marriage_date||null, par.pr_divorce_cert||'', par.pr_divorce_date||null, par.pr_custody?1:0, par.pr_school||'', par.pr_school_country||'', par.pr_qualification||'', par.pr_edu_cert||'', par.pr_company||'', par.pr_monthly_income||null, par.pr_annual_income||null, par.pr_cpf||null]);
      }
    });
  }

  // Write spouse PR additional info
  const spouseMem = familyArr.find(m => m.member_type === 'spouse' && ['SC','PR'].includes(m.sg_status));
  if (spouseMem) {
    db.run(`DELETE FROM adm_spouse_pr_additional WHERE profile_id=?`, [profileId]);
    const dbSpouse = db.get(`SELECT id FROM adm_family_members WHERE profile_id=? AND member_type='spouse'`, [profileId]);
    if (dbSpouse) {
      db.run(`INSERT INTO adm_spouse_pr_additional (id,profile_id,family_member_id,marriage_certificate_no,marriage_date,school_name,school_country,highest_qualification,educational_cert_no,company_name,monthly_income,annual_income,avg_monthly_cpf) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), profileId, dbSpouse.id, spouseMem.sp_marriage_cert||'', spouseMem.sp_marriage_date||null, spouseMem.sp_school||'', spouseMem.sp_school_country||'', spouseMem.sp_qualification||'', spouseMem.sp_edu_cert||'', spouseMem.sp_company||'', spouseMem.sp_monthly_income||null, spouseMem.sp_annual_income||null, spouseMem.sp_cpf||null]);
    }
  }

  // Link adm_profile back to intake_case (bidirectional)
  if (intakeCaseId) {
    db.run(`UPDATE intake_cases SET adm_profile_id=?, review_status='generating_documents' WHERE id=? AND (adm_profile_id IS NULL OR adm_profile_id='')`,
      [profileId, intakeCaseId]);
  }

  // Trigger PDF generation
  _admTriggerGeneration(profileId);

  // Mark UIF as processed
  db.run(`UPDATE mat_uif_submissions SET status='MERGED' WHERE request_id=?`, [requestId]);

  res.json({ ok: true, profileId });
});

// Serve uploaded file (agent can download own file for preview)
app.get('/api/agent/file/:fileId', (req, res) => {
  const { token } = req.query;
  const v = _matValidateToken(token, req.ip);
  if (v.error) return res.status(v.status).json({ error: v.error });
  // Verify file belongs to this request
  const item = db.get(`SELECT mi.* FROM mat_request_items mi
    JOIN mat_requests mr ON mi.request_id=mr.id
    WHERE mi.file_id=? AND mr.id=?`, [req.params.fileId, v.rec.request_id]);
  // 也允许访问照片和签名文件（非 mat_request_items）
  const filePath = fileStorage.getFilePath(req.params.fileId);
  if (!item && !fs.existsSync(filePath)) return res.status(403).json({ error: 'FORBIDDEN' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.download(filePath, item?.file_name || req.params.fileId);
});

// Counselor downloads agent-uploaded file
app.get('/api/mat-request-items/:id/download', requireAuth, requireRole('principal','counselor','intake_staff'), (req, res) => {
  const item = db.get(`SELECT * FROM mat_request_items WHERE id=?`, [req.params.id]);
  if (!item || !item.file_id) return res.status(404).json({ error: 'File not found' });
  const filePath = fileStorage.getFilePath(item.file_id);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
  res.download(filePath, item.file_name || item.file_id);
});

// ── 自动催件引擎 (每小时检查，每天仅发一次) ─────────
let _matLastReminderDate = '';
setInterval(async () => {
  const today = new Date().toISOString().split('T')[0];
  if (today === _matLastReminderDate) return;
  _matLastReminderDate = today;
  try {
    const activeRequests = db.all(`SELECT mr.*,ct.name as contact_name,ct.email as contact_email
      FROM mat_requests mr JOIN mat_contacts ct ON mr.contact_id=ct.id
      WHERE mr.status IN ('PENDING','IN_PROGRESS') AND mr.auto_remind_paused=0`);

    for (const r of activeRequests) {
      const contact = { name: r.contact_name, email: r.contact_email };
      const deadline = new Date(r.deadline);
      const now = new Date();
      const daysUntil = Math.ceil((deadline - now) / 86400000);
      const daysOverdue = Math.floor((now - deadline) / 86400000);
      let reminderType = null;

      if (daysUntil > 0 && daysUntil <= (r.remind_days_before || 3)) {
        // Upcoming reminder — check not already sent today
        const sent = db.get(`SELECT id FROM mat_reminder_logs WHERE request_id=? AND type='upcoming' AND date(sent_at)=?`,
          [r.id, today]);
        if (!sent) reminderType = 'upcoming';
      } else if (daysUntil <= 0) {
        if (!r.is_overdue) {
          db.run(`UPDATE mat_requests SET is_overdue=1,updated_at=datetime('now') WHERE id=?`, [r.id]);
        }
        if (daysOverdue === 0) {
          const sent = db.get(`SELECT id FROM mat_reminder_logs WHERE request_id=? AND type='due' AND date(sent_at)=?`,
            [r.id, today]);
          if (!sent) reminderType = 'due';
        } else {
          // Check overdue interval
          const overdueLogs = db.all(`SELECT * FROM mat_reminder_logs WHERE request_id=? AND type='overdue'`, [r.id]);
          if (overdueLogs.length < (r.max_overdue_reminders || 5)) {
            if (daysOverdue % (r.overdue_interval_days || 2) === 0) {
              reminderType = 'overdue';
            }
          }
        }
      }

      if (reminderType) {
        const { link } = _matCreateMagicLink(r.id, r.contact_id);
        _matSendInviteEmail(r, contact, link, reminderType);
        db.run(`INSERT INTO mat_reminder_logs (id,request_id,type,sent_to,status) VALUES (?,?,?,?,?)`,
          [uuidv4(), r.id, reminderType, contact.email, 'sent']);
        console.log(`[MAT REMIND] ${reminderType} → ${contact.email} (${r.title})`);
      }
    }
  } catch(e) {
    console.error('[MAT REMIND JOB]', e.message);
  }
}, 60 * 60 * 1000); // check every hour

// ══════════════════════════════════════════════════════════════════════════
//  ADM MODULE — Admission Application Form + Document Generation
// ══════════════════════════════════════════════════════════════════════════

const ADM_ROLES = ['principal', 'counselor', 'intake_staff'];

// ── 助手：加载 profile 完整数据 ───────────────────────────────────────────
function _admLoadFull(profileId) {
  const profile = db.get('SELECT * FROM adm_profiles WHERE id=?', [profileId]);
  if (!profile) return null;
  profile.family             = db.all('SELECT * FROM adm_family_members WHERE profile_id=? ORDER BY sort_order', [profileId]);
  profile.residence          = db.all('SELECT * FROM adm_residence_history WHERE profile_id=? ORDER BY sort_order', [profileId]);
  profile.education          = db.all('SELECT * FROM adm_education_history WHERE profile_id=? ORDER BY sort_order', [profileId]);
  profile.employment         = db.all('SELECT * FROM adm_employment_history WHERE profile_id=? ORDER BY sort_order', [profileId]);
  profile.guardian           = db.get('SELECT * FROM adm_guardian_info WHERE profile_id=?', [profileId]);
  profile.parentPrAdditional = db.all('SELECT * FROM adm_parent_pr_additional WHERE profile_id=?', [profileId]);
  profile.spousePrAdditional = db.get('SELECT * FROM adm_spouse_pr_additional WHERE profile_id=?', [profileId]);
  profile.signatures         = db.all('SELECT * FROM adm_signatures WHERE profile_id=?', [profileId]);
  profile.documents          = db.all(
    'SELECT * FROM adm_generated_documents WHERE profile_id=? ORDER BY doc_type, version_no DESC', [profileId]
  );
  return profile;
}

// ── 触发异步文档生成 ────────────────────────────────────────────────────────
const _generatingProfiles = new Set();
function _admTriggerGeneration(profileId) {
  if (!pdfGenerator) {
    console.warn('[ADM] pdf-generator not loaded, skipping document generation');
    db.run(`UPDATE intake_cases SET review_status='pending_review' WHERE adm_profile_id=?`, [profileId]);
    return;
  }
  // Prevent duplicate concurrent generation
  if (_generatingProfiles.has(profileId)) {
    console.log(`[ADM] Generation already in progress for ${profileId}, skipping`);
    return;
  }
  _generatingProfiles.add(profileId);
  // Fire-and-forget
  pdfGenerator.generateAllDocuments(profileId, db, UPLOAD_DIR)
    .then(results => {
      _generatingProfiles.delete(profileId);
      const allOk = results.every(r => r.status === 'done');
      const newStatus = allOk ? 'pending_review' : 'generation_failed';
      db.run(`UPDATE intake_cases SET review_status=? WHERE adm_profile_id=?`, [newStatus, profileId]);
      console.log(`[ADM] Document generation ${newStatus} for profile ${profileId}`);
    })
    .catch(err => {
      _generatingProfiles.delete(profileId);
      db.run(`UPDATE intake_cases SET review_status='generation_failed' WHERE adm_profile_id=?`, [profileId]);
      console.error('[ADM] Document generation error:', err.message);
    });
}

// ── POST /api/adm-profiles — 创建草稿 ────────────────────────────────────
app.post('/api/adm-profiles', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
  const id = uuidv4();
  const { source_type = 'staff', agent_id, course_name, intake_year } = req.body;
  db.run(`INSERT INTO adm_profiles (id, created_by, source_type, agent_id, course_name, intake_year, status)
          VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
    [id, req.session.user.id, source_type, agent_id || null, course_name || null, intake_year || null]);
  audit(req, 'ADM_PROFILE_CREATE', 'adm_profiles', id, { source_type });
  res.json({ id });
});

// ── GET /api/adm-profiles — 列表 ────────────────────────────────────────
app.get('/api/adm-profiles', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
  const { status, source_type, intake_year } = req.query;
  let sql = `SELECT p.*, ic.review_status, ic.id as intake_case_id_linked
             FROM adm_profiles p
             LEFT JOIN intake_cases ic ON ic.adm_profile_id = p.id
             WHERE 1=1`;
  const params = [];
  if (status)      { sql += ' AND p.status=?';       params.push(status); }
  if (source_type) { sql += ' AND p.source_type=?';  params.push(source_type); }
  if (intake_year) { sql += ' AND p.intake_year=?';  params.push(intake_year); }
  sql += ' ORDER BY p.created_at DESC';
  res.json(db.all(sql, params));
});

// ── GET /api/adm-profiles/:id — 完整详情 ────────────────────────────────
app.get('/api/adm-profiles/:id', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
  const profile = _admLoadFull(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Not found' });
  res.json(profile);
});

// ── PUT /api/adm-profiles/:id — 更新主数据 ──────────────────────────────
app.put('/api/adm-profiles/:id', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
  const p = db.get('SELECT id, status FROM adm_profiles WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (p.status === 'submitted') return res.status(400).json({ error: '已提交的表单不可修改，请重新生成文件' });

  const allowed = [
    'course_name','course_code','intake_year','intake_month','study_mode','campus',
    'surname','given_name','chinese_name','gender','dob','birth_country','birth_city',
    'nationality','race','religion','marital_status',
    'passport_type','passport_no','passport_issue_date','passport_expiry','passport_issue_country','passport_issue_place',
    'sg_pass_type','sg_nric_fin','sg_pass_expiry','prior_sg_study','prior_sg_school','prior_sg_year',
    'phone_home','phone_mobile','email','address_line1','address_line2','city','state_province',
    'postal_code','country_of_residence',
    'native_language','english_proficiency','ielts_score','toefl_score','other_lang_test','other_lang_score',
    'financial_source','annual_income','sponsor_name','sponsor_relation','bank_statement_available',
    'antecedent_q1','antecedent_q2','antecedent_q3','antecedent_q4','antecedent_remarks',
    'pdpa_consent','pdpa_marketing','pdpa_photo_video',
    'step_completed', 'source_type', 'agent_id',
    // ── 审计补全字段 ──
    'period_applied_from','period_applied_to','school_name','id_photo',
    'alias','birth_certificate_no','occupation','birth_province_state',
    'foreign_identification_no','malaysian_id_no',
    'was_ever_sg_citizen_or_pr','requires_student_pass',
    'sg_address','sg_tel_no','hometown_address',
    'language_proof_file','highest_lang_proficiency','need_english_placement_test',
    'applicant_monthly_income','applicant_current_saving',
    'spouse_monthly_income','spouse_current_saving',
    'father_monthly_income','father_current_saving',
    'mother_monthly_income','mother_current_saving',
    'other_financial_support','other_financial_details','other_financial_amount',
    'bank_statement_file','antecedent_explanation_file',
    'f16_declaration_agreed','v36_declaration_agreed','remarks','commencement_date',
  ];
  const sets = [], vals = [];
  for (const key of allowed) {
    if (key in req.body) { sets.push(`${key}=?`); vals.push(req.body[key]); }
  }
  if (sets.length === 0) return res.json({ ok: true });
  sets.push("updated_at=datetime('now')");
  vals.push(req.params.id);
  db.run(`UPDATE adm_profiles SET ${sets.join(',')} WHERE id=?`, vals);
  res.json({ ok: true });
});

// ── POST /api/adm-profiles/:id/submit — 正式提交 ────────────────────────
app.post('/api/adm-profiles/:id/submit', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
  const profile = db.get('SELECT * FROM adm_profiles WHERE id=?', [req.params.id]);
  if (!profile) return res.status(404).json({ error: 'Not found' });
  if (profile.status === 'submitted') return res.status(400).json({ error: '已提交，请勿重复提交' });

  // 基础必填校验
  if (!profile.surname || !profile.given_name)
    return res.status(400).json({ error: '缺少申请人姓名 (surname / given_name)' });
  if (!profile.dob)
    return res.status(400).json({ error: '缺少出生日期' });
  if (!profile.course_name)
    return res.status(400).json({ error: '缺少课程名称' });

  // 创建或关联 intake_case
  let caseId = profile.intake_case_id;
  if (!caseId) {
    caseId = uuidv4();
    db.run(`INSERT INTO intake_cases
      (id, student_name, intake_year, program_name, case_owner_staff_id, source_type, adm_profile_id,
       review_status, submit_mode, submitted_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, datetime('now'), 'registered')`,
      [caseId,
       `${profile.surname} ${profile.given_name}`,
       profile.intake_year || '',
       profile.course_name || '',
       req.session.user.id,
       profile.source_type || 'staff',
       profile.id,
       req.body.submit_mode || 'manual'
      ]);
    db.run('UPDATE adm_profiles SET intake_case_id=? WHERE id=?', [caseId, profile.id]);
  }

  db.run(`UPDATE adm_profiles SET status='submitted', updated_at=datetime('now') WHERE id=?`, [profile.id]);
  db.run(`UPDATE intake_cases SET review_status='generating_documents', submitted_at=datetime('now') WHERE id=?`, [caseId]);

  audit(req, 'ADM_PROFILE_SUBMIT', 'adm_profiles', profile.id, { caseId });
  // Trigger PDF generation asynchronously
  _admTriggerGeneration(profile.id);
  res.json({ ok: true, intake_case_id: caseId });
});

// ── POST /api/adm-profiles/:id/regenerate-doc — 重新生成文件 ─────────────
app.post('/api/adm-profiles/:id/regenerate-doc', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
  const profile = db.get('SELECT id FROM adm_profiles WHERE id=?', [req.params.id]);
  if (!profile) return res.status(404).json({ error: 'Not found' });
  db.run(`UPDATE intake_cases SET review_status='generating_documents' WHERE adm_profile_id=?`, [req.params.id]);
  _admTriggerGeneration(req.params.id);
  audit(req, 'ADM_REGENERATE_DOCS', 'adm_profiles', req.params.id, {});
  res.json({ ok: true, message: '文件重新生成已触发' });
});

// ── GET /api/adm-profiles/:id/documents — 文档列表 ──────────────────────
app.get('/api/adm-profiles/:id/documents', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
  const docs = db.all(
    'SELECT * FROM adm_generated_documents WHERE profile_id=? ORDER BY doc_type, version_no DESC',
    [req.params.id]
  );
  res.json(docs);
});

// ── GET /api/adm-docs/:docId/download — 下载生成文件 ────────────────────
app.get('/api/adm-docs/:docId/download', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
  const doc = db.get('SELECT * FROM adm_generated_documents WHERE id=?', [req.params.docId]);
  if (!doc || !doc.file_id) return res.status(404).json({ error: 'File not found' });
  const filePath = fileStorage.getFilePath(doc.file_id);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not on disk' });
  const names = { SAF: 'Student_Application_Form', FORM16: 'Form_16', V36: 'V36' };
  const profile = db.get('SELECT surname, given_name FROM adm_profiles WHERE id=?', [doc.profile_id]);
  const nameStr = profile ? `${profile.surname}_${profile.given_name}`.replace(/\s/g,'_') : 'Unknown';
  res.download(filePath, `${names[doc.doc_type] || doc.doc_type}_${nameStr}_v${doc.version_no}.pdf`);
});

// ── POST /api/adm-profiles/:id/signature — 上传签字图片 ─────────────────
app.post('/api/adm-profiles/:id/signature', requireAuth, upload.single('file'), (req, res) => {
  const profile = db.get('SELECT id FROM adm_profiles WHERE id=?', [req.params.id]);
  if (!profile) return res.status(404).json({ error: 'Not found' });
  const { sig_type, signer_name, sig_date, stroke_json } = req.body;
  if (!sig_type) return res.status(400).json({ error: 'sig_type required' });

  if (req.file) moveUploadedFile(req.file.filename, 'signature');
  const existing = db.get('SELECT id FROM adm_signatures WHERE profile_id=? AND sig_type=?', [req.params.id, sig_type]);
  const fileId = req.file ? req.file.filename : (existing?.file_id || null);

  if (existing) {
    db.run(`UPDATE adm_signatures SET signer_name=?, signed_at=datetime('now'), file_id=?, stroke_json=?, sig_date=? WHERE id=?`,
      [signer_name || null, fileId, stroke_json || null, sig_date || null, existing.id]);
  } else {
    db.run(`INSERT INTO adm_signatures (id, profile_id, sig_type, signer_name, signed_at, file_id, stroke_json, sig_date)
            VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?)`,
      [uuidv4(), req.params.id, sig_type, signer_name || null, fileId, stroke_json || null, sig_date || null]);
  }
  res.json({ ok: true, file_id: fileId });
});

// ── PUT /api/adm-profiles/:id/review — 审核决定 ─────────────────────────
app.put('/api/adm-profiles/:id/review', requireAuth, requireRole('principal', 'intake_staff'), (req, res) => {
  const { decision, note } = req.body; // decision: approve | reject | request_docs
  const profile = db.get('SELECT id, intake_case_id FROM adm_profiles WHERE id=?', [req.params.id]);
  if (!profile) return res.status(404).json({ error: 'Not found' });

  const statusMap = {
    approve:      'approved',
    reject:       'pending_additional_docs',
    request_docs: 'pending_additional_docs',
  };
  const newStatus = statusMap[decision];
  if (!newStatus) return res.status(400).json({ error: 'Invalid decision' });

  if (profile.intake_case_id) {
    db.run(`UPDATE intake_cases SET review_status=?, reviewed_by=?, reviewed_at=datetime('now'), review_note=? WHERE id=?`,
      [newStatus, req.session.user.id, note || null, profile.intake_case_id]);
  }
  audit(req, 'ADM_REVIEW', 'adm_profiles', profile.id, { decision, note });
  res.json({ ok: true, review_status: newStatus });
});

// ── POST /api/adm-profiles/:id/create-case — 从 profile 创建正式入学案例 ──
app.post('/api/adm-profiles/:id/create-case', requireAuth, requireRole('principal', 'intake_staff'), (req, res) => {
  const profile = db.get('SELECT * FROM adm_profiles WHERE id=?', [req.params.id]);
  if (!profile) return res.status(404).json({ error: 'Not found' });

  const ic = profile.intake_case_id
    ? db.get('SELECT * FROM intake_cases WHERE id=?', [profile.intake_case_id])
    : null;
  if (!ic) return res.status(400).json({ error: '未找到关联案例，请先提交申请表' });
  if (ic.review_status !== 'approved') return res.status(400).json({ error: '案例未审核通过，无法创建入学案例' });

  db.run(`UPDATE intake_cases SET review_status='case_created', status='processing', updated_at=datetime('now') WHERE id=?`,
    [ic.id]);
  audit(req, 'ADM_CASE_CREATED', 'intake_cases', ic.id, {});
  res.json({ ok: true, intake_case_id: ic.id });
});

// ── 数组子数据 CRUD (family / residence / education / employment) ──────────

function _admArrayRoutes(entity, table, sortField = 'sort_order') {
  // GET list
  app.get(`/api/adm-profiles/:id/${entity}`, requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    res.json(db.all(`SELECT * FROM ${table} WHERE profile_id=? ORDER BY ${sortField}`, [req.params.id]));
  });

  // POST create
  app.post(`/api/adm-profiles/:id/${entity}`, requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const profile = db.get('SELECT id FROM adm_profiles WHERE id=?', [req.params.id]);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    const newId = uuidv4();
    const body  = req.body;

    const cols  = Object.keys(body).filter(k => k !== 'id' && k !== 'profile_id' && k !== 'created_at');
    const vals  = cols.map(k => body[k]);
    const placeholders = cols.map(() => '?').join(',');
    db.run(
      `INSERT INTO ${table} (id, profile_id, ${cols.join(',')}) VALUES (?, ?, ${placeholders})`,
      [newId, req.params.id, ...vals]
    );
    res.json({ id: newId });
  });

  // PUT update
  app.put(`/api/adm-${entity}/:id`, requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const body = req.body;
    const cols = Object.keys(body).filter(k => !['id','profile_id','created_at'].includes(k));
    if (cols.length === 0) return res.json({ ok: true });
    const sets = cols.map(k => `${k}=?`).join(',');
    const vals = [...cols.map(k => body[k]), req.params.id];
    db.run(`UPDATE ${table} SET ${sets} WHERE id=?`, vals);
    res.json({ ok: true });
  });

  // DELETE
  app.delete(`/api/adm-${entity}/:id`, requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    db.run(`DELETE FROM ${table} WHERE id=?`, [req.params.id]);
    res.json({ ok: true });
  });
}

_admArrayRoutes('family',     'adm_family_members');
_admArrayRoutes('residence',  'adm_residence_history');
_admArrayRoutes('education',  'adm_education_history');
_admArrayRoutes('employment', 'adm_employment_history');

// Guardian (single record per profile)
app.put('/api/adm-profiles/:id/guardian', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
  const existing = db.get('SELECT id FROM adm_guardian_info WHERE profile_id=?', [req.params.id]);
  const body = req.body;
  const fields = ['surname','given_name','relation','dob','nationality','sg_status','nric_fin','phone','email','address','occupation','employer'];
  if (existing) {
    const sets = fields.map(f => `${f}=?`).join(',');
    db.run(`UPDATE adm_guardian_info SET ${sets} WHERE profile_id=?`, [...fields.map(f => body[f]||null), req.params.id]);
  } else {
    db.run(`INSERT INTO adm_guardian_info (id, profile_id, ${fields.join(',')}) VALUES (?, ?, ${fields.map(()=>'?').join(',')})`,
      [uuidv4(), req.params.id, ...fields.map(f => body[f]||null)]);
  }
  res.json({ ok: true });
});

// Parent PR Additional
app.post('/api/adm-profiles/:id/parent-pr', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
  const id = uuidv4();
  const { family_member_id, arrival_date, pr_cert_no, sc_cert_no, last_departure, is_residing_sg, address_sg } = req.body;
  db.run(`INSERT INTO adm_parent_pr_additional (id, profile_id, family_member_id, arrival_date, pr_cert_no, sc_cert_no, last_departure, is_residing_sg, address_sg)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, family_member_id, arrival_date||null, pr_cert_no||null, sc_cert_no||null, last_departure||null, is_residing_sg?1:0, address_sg||null]);
  res.json({ id });
});
app.put('/api/adm-parent-pr/:id', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
  const { arrival_date, pr_cert_no, sc_cert_no, last_departure, is_residing_sg, address_sg } = req.body;
  db.run(`UPDATE adm_parent_pr_additional SET arrival_date=?,pr_cert_no=?,sc_cert_no=?,last_departure=?,is_residing_sg=?,address_sg=? WHERE id=?`,
    [arrival_date||null, pr_cert_no||null, sc_cert_no||null, last_departure||null, is_residing_sg?1:0, address_sg||null, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/adm-parent-pr/:id', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
  db.run('DELETE FROM adm_parent_pr_additional WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// Spouse PR Additional
app.put('/api/adm-profiles/:id/spouse-pr', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
  const existing = db.get('SELECT id FROM adm_spouse_pr_additional WHERE profile_id=?', [req.params.id]);
  const { family_member_id, arrival_date, pr_cert_no, sc_cert_no, last_departure, is_residing_sg, address_sg } = req.body;
  if (existing) {
    db.run(`UPDATE adm_spouse_pr_additional SET family_member_id=?,arrival_date=?,pr_cert_no=?,sc_cert_no=?,last_departure=?,is_residing_sg=?,address_sg=? WHERE id=?`,
      [family_member_id||null, arrival_date||null, pr_cert_no||null, sc_cert_no||null, last_departure||null, is_residing_sg?1:0, address_sg||null, existing.id]);
  } else {
    db.run(`INSERT INTO adm_spouse_pr_additional (id, profile_id, family_member_id, arrival_date, pr_cert_no, sc_cert_no, last_departure, is_residing_sg, address_sg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), req.params.id, family_member_id||null, arrival_date||null, pr_cert_no||null, sc_cert_no||null, last_departure||null, is_residing_sg?1:0, address_sg||null]);
  }
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
//  启动
// ═══════════════════════════════════════════════════════

db.init().then(() => {
  db.seedData();
  // Schema migrations — safe to run on every startup
  try { db.run("ALTER TABLE admission_evaluations ADD COLUMN ai_result TEXT"); } catch(e) { /* column exists */ }
  try { db.run("ALTER TABLE intake_cases ADD COLUMN student_name TEXT"); } catch(e) { /* column exists */ }
  try { db.run("ALTER TABLE intake_cases ADD COLUMN docs_sent_at TEXT"); } catch(e) { /* column exists */ }
  try { db.run("ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0"); } catch(e) { /* column exists */ }
  // case_files / case_file_sends / case_signatures 通过 CREATE TABLE IF NOT EXISTS 自动创建

  // ── 确保 demo 账号存在（每次启动检查，幂等）──────────────
  _ensureAgentDemoAccount();
  _ensureIntakeStaffDemoAccount();
  _ensureStudentAdminDemoAccount();

  sessionStore.setDb(db); // 注入已初始化的 sql.js db 实例
  app.listen(PORT, () => {
    console.log(`\n✅ 学生升学与学业规划管理系统已启动`);
    console.log(`📍 访问地址: http://localhost:${PORT}`);
    console.log(`\n默认账户 (密码均为 123456):`);
    console.log(`  校长:        principal  → 全模块访问`);
    console.log(`  规划师:      counselor  → 升学规划模块（不可见入学管理/代理）`);
    console.log(`  导师:        mentor     → 学生管理（不可见入学管理/代理）`);
    console.log(`  入学管理员:  guan       → 入学管理模块（不可见升学规划/代理）`);
    console.log(`  学生管理员:  xiaoming   → 入学管理（只读+到校跟进）`);
    console.log(`  学生:        student1   → 仅自身数据`);
    console.log(`  家长:        parent1    → 仅子女数据`);
    console.log(`  代理:        agent01    → 代理门户（仅自身数据）`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
