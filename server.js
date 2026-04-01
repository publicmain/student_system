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

if (IS_PROD) app.set('trust proxy', 1);

// ── 限流配置 ──────────────────────────────────────────
const loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const pwdChangeAttempts = new Map();
const PWD_CHANGE_MAX = 5;
const aiCallAttempts = new Map();
const AI_CALL_MAX = 20;
const AI_CALL_WINDOW_MS = 60 * 60 * 1000;
const agentCallAttempts = new Map();
const AGENT_CALL_MAX = 60;
const AGENT_CALL_WINDOW_MS = 60 * 1000;

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

const BCRYPT_COST = parseInt(process.env.BCRYPT_COST || '12');

// ── 上传目录 ──────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || __dirname;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const fileStorage = require('./file-storage');
fileStorage.initDirs();

function moveUploadedFile(fileId, category) {
  if (!fileId || !category) return;
  try { fileStorage.migrateFile(fileId, category); } catch(e) { console.error('[FILE MOVE]', e.message); }
}

const ALLOWED_EXTENSIONS = new Set(['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.jpg','.jpeg','.png','.gif','.zip','.rar','.txt']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

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
  'text/plain','application/octet-stream',
]);

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error(`不允许上传此类型文件（${ext}）。支持：PDF/Word/Excel/PPT/图片/ZIP`));
    }
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

const sessionStore = new SQLiteSessionStore();

app.use(session({
  store: sessionStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  rolling: true,
  name: 'ssid',
  cookie: {
    maxAge: 8 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
  }
}));

// ── CSRF 防护 ────────────────────────────────────────
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.path.startsWith('/api/')) {
    const ct = (req.headers['content-type'] || '').split(';')[0].trim();
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

function requireAgentModule(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  const role = req.session.user.role;
  if (!['principal', 'agent'].includes(role))
    return res.status(403).json({ error: '无权访问代理模块' });
  next();
}

function requireAdmissionModule(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  const role = req.session.user.role;
  if (!['principal', 'intake_staff', 'student_admin'].includes(role))
    return res.status(403).json({ error: '无权访问入学管理模块' });
  next();
}

function stripAgentFields(obj) {
  if (!obj) return obj;
  const safe = { ...obj };
  ['agent_name','agent_id','referral_id','referral_type','source_type',
   'agent_email','agent_phone','agent_status','commission_amount',
   'pending_commission','paid_commission','rule_name','rule_type'].forEach(k => delete safe[k]);
  return safe;
}

function audit(req, action, entity, entityId, detail) {
  try {
    db.run(`INSERT INTO audit_logs (id,user_id,action,entity,entity_id,detail,ip) VALUES (?,?,?,?,?,?,?)`, [
      uuidv4(), req.session.user?.id, action, entity, entityId,
      typeof detail === 'object' ? JSON.stringify(detail) : detail,
      req.ip
    ]);
  } catch (e) { /* 不阻塞主流程 */ }
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

const _logoPath = path.join(__dirname, 'public', 'esic-logo.jpg');
function brandedEmail(bodyHtml, options = {}) {
  const { buttonText, buttonUrl, greeting, footerExtra } = options;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#fff;padding:20px 32px 12px;border-radius:8px 8px 0 0;text-align:center;border-bottom:none;">
    <img src="cid:esic-logo" alt="Equistar International College" style="height:56px;">
  </td></tr>
  <tr><td style="background:#A51C30;padding:14px 32px;text-align:center;">
    <div style="color:#fff;font-size:17px;font-weight:700;letter-spacing:1px;">Equistar International College</div>
    <div style="color:rgba(255,255,255,.7);font-size:12px;margin-top:2px;">www.esic.edu.sg</div>
  </td></tr>
  <tr><td style="background:#fff;padding:32px;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;">
    ${greeting ? `<p style="font-size:15px;color:#333;margin:0 0 16px;">${greeting}</p>` : ''}
    ${bodyHtml}
    ${buttonUrl ? `<div style="text-align:center;margin:24px 0;"><a href="${buttonUrl}" style="display:inline-block;background:#A51C30;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:15px;">${buttonText || 'Open Link →'}</a></div>` : ''}
  </td></tr>
  <tr><td style="background:#fafafa;padding:20px 32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
    ${footerExtra ? `<p style="font-size:13px;color:#666;margin:0 0 8px;">${footerExtra}</p>` : ''}
    <p style="font-size:12px;color:#999;margin:0;">Equistar International College · 1 Selegie Rd #07-02 · Singapore</p>
    <p style="font-size:12px;color:#999;margin:4px 0 0;"><a href="https://www.esic.edu.sg" style="color:#A51C30;text-decoration:none;">www.esic.edu.sg</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  const attachments = [];
  try {
    if (fs.existsSync(_logoPath)) {
      attachments.push({ filename: 'esic-logo.jpg', path: _logoPath, cid: 'esic-logo' });
    }
  } catch(e) {}
  return { html, attachments };
}

// ═══════════════════════════════════════════════════════
//  共享依赖对象
// ═══════════════════════════════════════════════════════
const deps = {
  db, uuidv4, audit, requireAuth, requireRole, requireAgentModule, requireAdmissionModule,
  stripAgentFields, bcrypt, BCRYPT_COST, upload, fileStorage, moveUploadedFile,
  sendMail, escHtml, brandedEmail, fs, path, crypto, archiver, xlsx,
  aiPlanner, aiEval, pdfGenerator, UPLOAD_DIR,
  loginAttempts, pwdChangeAttempts, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS, PWD_CHANGE_MAX,
  aiCallAttempts, AI_CALL_MAX, AI_CALL_WINDOW_MS,
  agentCallAttempts, AGENT_CALL_MAX, AGENT_CALL_WINDOW_MS,
  ALLOWED_EXTENSIONS,
};

// ═══════════════════════════════════════════════════════
//  路由挂载
// ═══════════════════════════════════════════════════════

// Auth
app.use('/api/auth', require('./routes/auth')(deps));

// Dashboard
app.use('/api/dashboard', require('./routes/dashboard')(deps));

// Students
app.use('/api', require('./routes/students')(deps));

// Staff
app.use('/api', require('./routes/staff')(deps));

// Applications & Timeline
app.use('/api', require('./routes/applications')(deps));

// Milestone Tasks
app.use('/api', require('./routes/tasks')(deps));

// Materials, Personal Statement, Communications, Feedback
app.use('/api', require('./routes/materials')(deps));

// Settings / Consents / Subjects / Templates / Exams / Anchors / App-Ext
app.use('/api', require('./routes/settings')(deps));

// Notifications / Escalation / Audit
app.use('/api', require('./routes/notifications')(deps));

// Analytics + ICS Calendar + Admission Eval Engine
app.use('/api', require('./routes/analytics')(deps));

// AI Plans
app.use('/api', require('./routes/ai-plans')(deps));

// Intake Cases
// Agent portal needs _matSendInviteEmail — mount agent-portal first to get it
const agentPortalRouter = require('./routes/agent-portal')(deps);
const _matSendInviteEmail = agentPortalRouter._matSendInviteEmail;

app.use('/api', require('./routes/intake-cases')({ ...deps, _matSendInviteEmail }));

// Finance
app.use('/api', require('./routes/finance')(deps));

// Agents
app.use('/api', require('./routes/agents')(deps));

// Visa/Arrival
app.use('/api', require('./routes/visa-arrival')(deps));

// File Exchange (mixed: /api for session routes, root for public routes)
const fileExchange = require('./routes/file-exchange')(deps);
app.use('/api', fileExchange.apiRouter);
app.use('/', fileExchange.publicRouter);

// Orientation (mixed: /api for session routes, root for public survey routes)
const orientation = require('./routes/orientation')(deps);
app.use('/api', orientation.apiRouter);
app.use('/', orientation.publicRouter);

// Agent Portal (session + token-based routes, all under /api)
app.use('/api', agentPortalRouter);

// ADM Profiles
app.use('/api', require('./routes/adm-profiles')(deps));

// P0 新模块：课外活动 + 文书管理
app.use('/api', require('./routes/activities')(deps));
app.use('/api', require('./routes/essays')(deps));

// ═══════════════════════════════════════════════════════
//  启动辅助
// ═══════════════════════════════════════════════════════

function _ensureAgentDemoAccount() {
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
  const exists = db.get('SELECT id FROM users WHERE username=?', ['guan']);
  if (exists) return;
  const staffId = uuidv4();
  db.run(`INSERT INTO staff (id,name,role,subjects,exam_board_exp,capacity_students,email,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    [staffId, '关老师', 'counselor', '[]', '[]', 50, 'guan@school.edu']);
  db.run(`INSERT INTO users (id,username,password,role,linked_id,name,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
    [uuidv4(), 'guan', bcrypt.hashSync('123456', 10), 'intake_staff', staffId, '关老师']);
  console.log('✅ 入学管理员账号 guan 已创建（密码: 123456）');
}

function _ensureStudentAdminDemoAccount() {
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
//  启动
// ═══════════════════════════════════════════════════════

db.init().then(() => {
  db.seedData();
  try { db.run("ALTER TABLE admission_evaluations ADD COLUMN ai_result TEXT"); } catch(e) { /* column exists */ }
  try { db.run("ALTER TABLE intake_cases ADD COLUMN student_name TEXT"); } catch(e) { /* column exists */ }
  try { db.run("ALTER TABLE intake_cases ADD COLUMN docs_sent_at TEXT"); } catch(e) { /* column exists */ }
  try { db.run("ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0"); } catch(e) { /* column exists */ }

  _ensureAgentDemoAccount();
  _ensureIntakeStaffDemoAccount();
  _ensureStudentAdminDemoAccount();

  sessionStore.setDb(db);
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
