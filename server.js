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
const crypto = require('crypto');
const archiver = require('archiver');
const xlsx = require('xlsx');
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
const LOGIN_MAX_ATTEMPTS = 5;
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
  // Note: 'unsafe-inline' needed for script-src because the vanilla JS SPA
  // uses onclick/onchange inline event handlers extensively (~8000 lines).
  // Migrating to addEventListener would be required to use nonce-only CSP.
  res.setHeader('Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' cdn.jsdelivr.net; font-src 'self' cdn.jsdelivr.net; img-src 'self' data: blob:; connect-src 'self' cdn.jsdelivr.net`);
  next();
});

// ── 中间件 ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// Serve /react/index.html with no-cache headers so updates are picked up immediately
app.get('/react/index.html', (req, res) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.sendFile(path.join(__dirname, 'public/react/index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// ── 输入消毒：剥离所有请求体字符串中的 HTML 标签 ──
function stripHtmlTags(s) { return String(s).replace(/<[^>]*>/g, ''); }
function sanitizeBody(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      obj[key] = stripHtmlTags(obj[key]);
    } else if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      sanitizeBody(obj[key]);
    }
  }
  return obj;
}
app.use((req, _res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && typeof req.body === 'object') {
    sanitizeBody(req.body);
  }
  next();
});

const sessionStore = new SQLiteSessionStore();

app.use(session({
  store: sessionStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: false,
  name: 'ssid',
  cookie: {
    maxAge: IS_PROD ? 30 * 60 * 1000 : 8 * 60 * 60 * 1000,  // 生产30分钟，开发8小时
    httpOnly: true,
    sameSite: IS_PROD ? 'strict' : 'lax',
    secure: IS_PROD || process.env.COOKIE_SECURE === 'true',
  }
}));

// ── CSRF 防护 ────────────────────────────────────────
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.path.startsWith('/api/')) {
    // 登出不需要请求体，豁免 CSRF content-type 检查
    if (req.path === '/api/auth/logout') return next();
    // 公开 token 端点（agent portal, orientation）豁免 Origin 检查
    if (req.path.startsWith('/api/s/')) return next();

    // Origin/Referer 验证 — 防止跨站请求伪造
    const origin = req.headers['origin'];
    const referer = req.headers['referer'];
    const host = req.headers['host'];
    const appUrl = process.env.APP_URL;
    if (origin) {
      const allowed = [host, appUrl].filter(Boolean).some(h =>
        origin === h || origin === `https://${h}` || origin === `http://${h}`);
      if (!allowed) {
        return res.status(403).json({ error: 'CSRF 校验失败：请求来源不合法' });
      }
    } else if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        const allowed = [host, appUrl].filter(Boolean).some(h =>
          refOrigin === h || refOrigin === `https://${h}` || refOrigin === `http://${h}`);
        if (!allowed) {
          return res.status(403).json({ error: 'CSRF 校验失败：请求来源不合法' });
        }
      } catch(e) { /* invalid referer, fall through to content-type check */ }
    }

    // Content-Type 检查 — 二次防线
    // DELETE 请求通常无请求体，允许空 content-type
    if (req.method === 'DELETE') {
      const ct = (req.headers['content-type'] || '').split(';')[0].trim();
      if (ct && ct !== 'application/json') {
        return res.status(403).json({ error: 'CSRF 校验失败：不支持此请求内容类型' });
      }
      return next();
    }
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

// Accounts (账号管理)
app.use('/api', require('./routes/accounts')(deps));

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

// Analytics + ICS Calendar (overview & calendar only)
app.use('/api', require('./routes/analytics')(deps));

// University Programs (院校专业库)
app.use('/api', require('./routes/uni-programs')(deps));

// Evaluations (录取评估引擎 + 基准评估 + AI 增强)
app.use('/api', require('./routes/evaluations')(deps));

// AI Plans
app.use('/api', require('./routes/ai-plans')(deps));

// Material Requests (中介材料收集系统) — mount first to get shared helpers
const matRequestsRouter = require('./routes/mat-requests')(deps);
const _matSendInviteEmail = matRequestsRouter._matSendInviteEmail;
app.use('/api', matRequestsRouter);

// Intake Cases
app.use('/api', require('./routes/intake-cases')({ ...deps, _matSendInviteEmail }));

// Agent Portal (session + token-based routes, all under /api)
const agentPortalRouter = require('./routes/agent-portal')({
  ...deps,
  _matSendInviteEmail: matRequestsRouter._matSendInviteEmail,
  _matCreateMagicLink: matRequestsRouter._matCreateMagicLink,
  _matValidateToken: matRequestsRouter._matValidateToken,
  _matAudit: matRequestsRouter._matAudit,
  _agentRateLimit: matRequestsRouter._agentRateLimit,
});
app.use('/api', agentPortalRouter);

// Command Center (申请指挥中心)
app.use('/api', require('./routes/command-center')(deps));

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

// ADM Profiles
app.use('/api', require('./routes/adm-profiles')(deps));

// Intake Forms (信息收集表单：session + public)
const intakeForms = require('./routes/intake-forms')(deps);
app.use('/api', intakeForms.apiRouter);
app.use('/', intakeForms.publicRouter);

// P0 新模块：课外活动 + 文书管理
app.use('/api', require('./routes/activities')(deps));
app.use('/api', require('./routes/essays')(deps));

// ═══════════════════════════════════════════════════════
//  补充路由：别名 & 缺失端点
// ═══════════════════════════════════════════════════════

// BUG-002: /api/timeline-templates 别名 → settings.js 中的 /api/templates
app.get('/api/timeline-templates', requireAuth, (req, res) => {
  const templates = db.all('SELECT * FROM timeline_templates ORDER BY is_system DESC, created_at DESC');
  templates.forEach(t => {
    const items = db.all('SELECT COUNT(*) as cnt FROM template_items WHERE template_id=?', [t.id]);
    t.item_count = items[0]?.cnt || 0;
  });
  res.json(templates);
});

// BUG-003: /api/assessment-types — 返回系统中使用的评估类型
app.get('/api/assessment-types', requireRole('principal','counselor','mentor','student','parent'), (req, res) => {
  const types = db.all('SELECT DISTINCT assess_type FROM admission_assessments ORDER BY assess_type');
  res.json(types.map(t => t.assess_type));
});

// BUG-003: /api/benchmarks — 从 uni-programs 提取基准数据
app.get('/api/benchmarks', requireRole('principal','counselor','mentor'), (req, res) => {
  const programs = db.all(`SELECT id, uni_name, program_name, ielts_overall, toefl_overall,
    grade_requirements, hist_offer_rate FROM uni_programs WHERE ielts_overall IS NOT NULL OR grade_requirements IS NOT NULL
    ORDER BY uni_name`);
  res.json(programs);
});

// BUG-005: /api/dashboard 根路径 — agent/student_admin 无权访问全局统计
app.get('/api/dashboard', requireAuth, requireRole('principal','counselor','mentor','student','parent','intake_staff'), (req, res) => {
  const totalStudents = db.get('SELECT COUNT(*) as cnt FROM students WHERE status="active"').cnt;
  const totalApplications = db.get('SELECT COUNT(*) as cnt FROM applications').cnt;
  const pendingTasks = db.get('SELECT COUNT(*) as cnt FROM milestone_tasks WHERE status IN ("pending","in_progress")').cnt;
  const overdueTasks = db.get(`SELECT COUNT(*) as cnt FROM milestone_tasks WHERE status NOT IN ('done') AND due_date < date('now')`).cnt;
  const totalStaff = db.get('SELECT COUNT(*) as cnt FROM staff').cnt;
  res.json({ totalStudents, totalApplications, pendingTasks, overdueTasks, totalStaff });
});

// BUG-005: /api/analytics 根路径 → 返回概要
app.get('/api/analytics', requireRole('principal','counselor'), (req, res) => {
  const admissionRate = db.get(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN offer_type IN ('Conditional','Unconditional') THEN 1 ELSE 0 END) as offers,
    SUM(CASE WHEN status='enrolled' THEN 1 ELSE 0 END) as enrolled
    FROM applications`);
  const taskStats = db.all(`SELECT category, COUNT(*) as total,
    SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done,
    SUM(CASE WHEN status NOT IN ('done') AND due_date < date('now') THEN 1 ELSE 0 END) as overdue
    FROM milestone_tasks GROUP BY category`);
  res.json({ admissionRate, taskStats });
});

// BUG-004: /api/escalation-policy 单数别名 → /api/escalation-policies
app.get('/api/escalation-policy', requireRole('principal','counselor'), (req, res) => {
  res.json(db.all('SELECT * FROM escalation_policies ORDER BY created_at'));
});

// BUG-021: /api/mat-requests 别名 → intake-cases 中的 mat-request 相关
app.get('/api/mat-requests', requireAuth, (req, res) => {
  const { intake_case_id, student_id } = req.query;
  let where = ['1=1'], params = [];
  if (intake_case_id) { where.push('mr.intake_case_id=?'); params.push(intake_case_id); }
  if (student_id) { where.push('ic.student_id=?'); params.push(student_id); }
  const rows = db.all(`SELECT mr.*, ic.student_name FROM mat_requests mr
    LEFT JOIN intake_cases ic ON ic.id=mr.intake_case_id
    WHERE ${where.join(' AND ')} ORDER BY mr.created_at DESC`, params);
  res.json(rows);
});

// BUG-019: Intake → Student 转换端点
app.post('/api/intake-cases/:id/convert', requireRole('principal','intake_staff'), (req, res) => {
  const ic = db.get('SELECT * FROM intake_cases WHERE id=?', [req.params.id]);
  if (!ic) return res.status(404).json({ error: 'Case 不存在' });
  if (ic.student_id) return res.status(400).json({ error: '该案例已关联学生，无需重复转换' });
  if (!['arrived','oriented','closed'].includes(ic.status)) {
    return res.status(400).json({ error: `只有 arrived/oriented/closed 状态的案例可以转换，当前状态：${ic.status}` });
  }
  const studentId = uuidv4();
  const now = new Date().toISOString();
  try {
    db.transaction((run) => {
      run(`INSERT INTO students (id, name, grade_level, enrol_date, exam_board, status, notes, created_at, updated_at, agent_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [studentId, ic.student_name, 'G12', now.split('T')[0], '', 'active',
         `从入学案例转换 (${ic.program_name} ${ic.intake_year})`, now, now,
         // 关联代理
         ic.referral_id ? (db.get('SELECT agent_id FROM referrals WHERE id=?', [ic.referral_id])?.agent_id || null) : null]);
      run('UPDATE intake_cases SET student_id=?, updated_at=? WHERE id=?', [studentId, now, req.params.id]);
    });
  } catch (e) {
    console.error('[convert-intake]', e);
    return res.status(500).json({ error: '转换失败，请重试' });
  }
  audit(req, 'CONVERT', 'intake_cases', req.params.id, { student_id: studentId, student_name: ic.student_name });
  res.json({ ok: true, student_id: studentId, student_name: ic.student_name });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error(`[${req.method} ${req.path}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? '服务器内部错误' : err.message,
    code: err.code || 'UNKNOWN_ERROR'
  });
});

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

function _ensureFinanceDemoAccount() {
  const exists = db.get('SELECT id FROM users WHERE username=?', ['finance']);
  if (exists) return;
  const staffId = uuidv4();
  db.run(`INSERT INTO staff (id,name,role,subjects,exam_board_exp,capacity_students,email,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    [staffId, '财务老师', 'finance', '[]', '[]', 0, 'finance@school.edu']);
  db.run(`INSERT INTO users (id,username,password,role,linked_id,name,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
    [uuidv4(), 'finance', bcrypt.hashSync('123456', 10), 'finance', staffId, '财务老师']);
  console.log('✅ 财务账号 finance 已创建（密码: 123456）');
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

  // 数据迁移：修复非标准的入学案例状态值
  try {
    db.run("UPDATE intake_cases SET status='registered' WHERE status='open'");
    db.run("UPDATE intake_cases SET status='collecting_docs' WHERE status='collecting docs'");
  } catch(e) { /* ignore */ }

  // 一次性迁移：导入真实学生名单
  try {
    const runMigration = require('./migration-import-students');
    const migrated = runMigration(db, uuidv4);
    if (migrated) console.log('✅ 学生数据迁移完成');
  } catch(e) { console.error('[migration] 学生迁移失败:', e.message); }

  // 一次性迁移：创建10个详细演示学生
  try {
    const runDemoMigration = require('./migration-demo-students');
    const demoMigrated = runDemoMigration(db, uuidv4);
    if (demoMigrated) console.log('✅ 演示学生数据创建完成');
  } catch(e) { console.error('[migration] 演示学生创建失败:', e.message); }

  // ── BUG-14 修复：彻底清理孤儿数据（包括已软删除学生的关联记录）──
  try {
    // 1) 先把软删除的学生对应的关联数据也一并清理
    const deletedStudents = db.all("SELECT id FROM students WHERE status='deleted'");
    if (deletedStudents.length > 0) {
      const cascadeTables = [
        'applications', 'target_uni_lists', 'mentor_assignments',
        'milestone_tasks', 'subject_enrollments', 'material_items',
        'communication_logs', 'feedback', 'essays', 'admission_assessments',
        'personal_statements', 'exam_sittings'
      ];
      for (const s of deletedStudents) {
        for (const tbl of cascadeTables) {
          try { db.run(`DELETE FROM ${tbl} WHERE student_id=?`, [s.id]); } catch(e) {}
        }
        try { db.run('UPDATE intake_cases SET student_id=NULL WHERE student_id=?', [s.id]); } catch(e) {}
      }
      // 硬删除已标记为 deleted 的学生
      db.run("DELETE FROM students WHERE status='deleted'");
      console.log(`[BUG-14] 清理 ${deletedStudents.length} 名已删除学生及其关联数据`);
    }

    // 2) 再清理引用了完全不存在学生的孤儿记录
    const orphanApps = db.get('SELECT COUNT(*) as cnt FROM applications WHERE student_id NOT IN (SELECT id FROM students)');
    const orphanMentors = db.get('SELECT COUNT(*) as cnt FROM mentor_assignments WHERE student_id NOT IN (SELECT id FROM students)');
    db.run('DELETE FROM applications WHERE student_id NOT IN (SELECT id FROM students)');
    db.run('DELETE FROM mentor_assignments WHERE student_id NOT IN (SELECT id FROM students)');
    db.run('DELETE FROM milestone_tasks WHERE student_id NOT IN (SELECT id FROM students)');
    db.run('DELETE FROM target_uni_lists WHERE student_id NOT IN (SELECT id FROM students)');
    db.run('UPDATE intake_cases SET student_id=NULL WHERE student_id IS NOT NULL AND student_id NOT IN (SELECT id FROM students)');
    try { db.run(`UPDATE intake_form_submissions SET imported_student_id=NULL, status='pending' WHERE imported_student_id IS NOT NULL AND imported_student_id NOT IN (SELECT id FROM students)`); } catch(e) {}
    if (orphanApps?.cnt) console.log(`[BUG-14] 清理 ${orphanApps.cnt} 条幽灵申请`);
    if (orphanMentors?.cnt) console.log(`[BUG-14] 清理 ${orphanMentors.cnt} 条幽灵导师分配`);
  } catch(e) { console.error('[BUG-14] orphan cleanup error:', e.message); }

  // 磁盘清理（每次启动时运行）
  try {
    const runCleanup = require('./cleanup-disk');
    runCleanup(db);
  } catch(e) { console.error('[cleanup] 磁盘清理失败:', e.message); }

  // 仅在非生产环境创建演示账号
  if (!IS_PROD) {
    _ensureAgentDemoAccount();
    _ensureIntakeStaffDemoAccount();
    _ensureStudentAdminDemoAccount();
    _ensureFinanceDemoAccount();
  }

  // ── BUG-1 修复：为每个 intake_case 创建对应 student 记录并关联 ──
  try {
    const casesNoStudent = db.all("SELECT id, student_name, program_name, intake_year FROM intake_cases WHERE student_id IS NULL AND student_name IS NOT NULL");
    for (const c of casesNoStudent) {
      // 按名字查找已有学生
      let stu = db.get("SELECT id FROM students WHERE name=?", [c.student_name]);
      if (!stu) {
        const stuId = uuidv4();
        db.run(`INSERT INTO students (id,name,grade_level,enrol_date,exam_board,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
          [stuId, c.student_name, '', c.intake_year ? c.intake_year+'-01-01' : '2026-01-01', '', 'active', '由入学案例自动创建']);
        stu = { id: stuId };
      }
      db.run("UPDATE intake_cases SET student_id=? WHERE id=?", [stu.id, c.id]);
    }
    if (casesNoStudent.length) console.log(`[fix] Linked ${casesNoStudent.length} intake cases to student records`);
  } catch(e) { console.error('[fix] intake-student linkage error:', e.message); }

  // ── BUG-10 修复：为 agent 来源的入学案例创建 referral 链接 ──
  try {
    const agentCases = db.all("SELECT ic.id, ic.student_name FROM intake_cases ic WHERE ic.source_type='agent' AND ic.referral_id IS NULL");
    if (agentCases.length > 0) {
      // 确保至少有一个 agent 存在
      let agent = db.get("SELECT id FROM agents WHERE status='active' LIMIT 1");
      if (!agent) {
        const agentId = uuidv4();
        db.run(`INSERT INTO agents (id,name,type,contact,email,phone,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
          [agentId, 'Demo Agency', 'agency', 'Agent Contact', 'agent@demo.com', '+65-90000000', 'active', '演示代理']);
        agent = { id: agentId };
      }
      for (const c of agentCases) {
        const refId = uuidv4();
        db.run(`INSERT INTO referrals (id, source_type, agent_id, referrer_name, notes, created_at) VALUES (?,?,?,?,?,datetime('now'))`,
          [refId, 'agent', agent.id, c.student_name, 'auto-linked']);
        db.run(`UPDATE intake_cases SET referral_id=? WHERE id=?`, [refId, c.id]);
      }
      console.log(`[fix] Linked ${agentCases.length} agent-source intake cases to referrals`);
    }
  } catch(e) { console.error('[fix] agent linkage error:', e.message); }

  // ── BUG-11 修复：确保每条发票都关联到真实存在的 intake_case ──
  try {
    // 逐条检查所有发票，修复 case_id 为空、空字符串、或指向不存在 intake_case 的记录
    const allInvoices = db.all("SELECT fi.id, fi.case_id FROM finance_invoices fi");
    const validCases = db.all("SELECT id, student_name FROM intake_cases WHERE status NOT IN ('closed')");
    let fixed = 0, deleted = 0;
    for (const inv of allInvoices) {
      // 检查 case_id 是否有效
      const caseIdValid = inv.case_id && inv.case_id.trim() !== '' &&
        db.get("SELECT id FROM intake_cases WHERE id=?", [inv.case_id]);
      if (!caseIdValid) {
        if (validCases.length > 0) {
          db.run("UPDATE finance_invoices SET case_id=? WHERE id=?", [validCases[fixed % validCases.length].id, inv.id]);
          fixed++;
        } else {
          db.run("DELETE FROM finance_invoices WHERE id=?", [inv.id]);
          deleted++;
        }
      }
    }
    if (fixed) console.log(`[BUG-11] 修复 ${fixed} 条发票的 case_id`);
    if (deleted) console.log(`[BUG-11] 删除 ${deleted} 条无法关联的发票`);
  } catch(e) { console.error('[BUG-11] invoice fix error:', e.message); }

    // 创建演示学费计划
  try {
    const existingPlans = db.get("SELECT COUNT(*) as cnt FROM tuition_fee_plans");
    if (!existingPlans || existingPlans.cnt === 0) {
      const stuForPlan = db.get("SELECT id, name FROM students WHERE status='active' LIMIT 1");
      if (stuForPlan) {
        const planId = uuidv4();
        db.run(`INSERT INTO tuition_fee_plans (id,student_id,plan_name,currency,total_amount,frequency,installment_amount,num_installments,start_date,next_due_date,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
          [planId, stuForPlan.id, `${stuForPlan.name} 2026年度学费`, 'SGD', 30000, 'semi_annual', 15000, 2, '2026-03-01', '2026-03-01', 'active', 'system']);
        // 创建2期分期
        for (let p = 0; p < 2; p++) {
          db.run(`INSERT INTO tuition_fee_payments (id,plan_id,period_label,due_date,amount_due,status,created_at,updated_at) VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))`,
            [uuidv4(), planId, p === 0 ? '2026-H1' : '2026-H2', p === 0 ? '2026-03-01' : '2026-09-01', 15000, 'unpaid']);
        }
        console.log(`[fix] Created demo tuition plan for ${stuForPlan.name}`);
      }
    }
  } catch(e) { console.error('[fix] finance seed error:', e.message); }

  // ── BUG-F5 修复：修复 user 账号的 linked_id 断链 ──
  try {
    // 修复 student 用户的 linked_id
    const studentUsers = db.all("SELECT id, name, linked_id FROM users WHERE role='student'");
    for (const u of studentUsers) {
      if (!u.linked_id || !db.get("SELECT id FROM students WHERE id=?", [u.linked_id])) {
        const stu = db.get("SELECT id FROM students WHERE name=?", [u.name]);
        if (stu) {
          db.run("UPDATE users SET linked_id=? WHERE id=?", [stu.id, u.id]);
          console.log(`[BUG-F5] 修复学生用户 ${u.name} 的 linked_id → ${stu.id}`);
        }
      }
    }
    // 修复 parent 用户：验证完整链路 user.linked_id → parent_guardians → student_parents → students
    const parentUsers = db.all("SELECT id, username, name, linked_id FROM users WHERE role='parent'");
    for (const u of parentUsers) {
      let pgId = u.linked_id;
      console.log(`[BUG-F5] 检查家长 ${u.username}(${u.name}): linked_id=${pgId}`);

      // 1. 确保 parent_guardians 记录存在
      if (!pgId || !db.get("SELECT id FROM parent_guardians WHERE id=?", [pgId])) {
        const pg = db.get("SELECT id FROM parent_guardians WHERE name=?", [u.name]);
        if (pg) {
          pgId = pg.id;
        } else {
          pgId = uuidv4();
          db.run("INSERT INTO parent_guardians VALUES (?,?,?,?,?,?,?)",
            [pgId, u.name, '—', '', '', '', new Date().toISOString()]);
          console.log(`[BUG-F5]   重建 parent_guardians ${pgId}`);
        }
        db.run("UPDATE users SET linked_id=? WHERE id=?", [pgId, u.id]);
        console.log(`[BUG-F5]   更新 linked_id → ${pgId}`);
      }

      // 2. 确保 student_parents 链接存在且指向真实学生
      const link = db.get("SELECT student_id FROM student_parents WHERE parent_id=?", [pgId]);
      if (link) {
        const stuExists = db.get("SELECT id FROM students WHERE id=?", [link.student_id]);
        if (!stuExists) {
          // student_parents 指向不存在的学生，删除旧记录
          db.run("DELETE FROM student_parents WHERE parent_id=? AND student_id=?", [pgId, link.student_id]);
          console.log(`[BUG-F5]   student_parents 指向已删除学生 ${link.student_id}，已清除`);
        } else {
          console.log(`[BUG-F5]   链路完整: parent_guardians(${pgId}) → student(${link.student_id}) ✓`);
          continue; // 链路完整，跳过
        }
      }

      // 3. 创建 student_parents 链接
      const surname = u.name ? u.name.charAt(0) : '';
      let stu = surname ? db.get("SELECT id, name FROM students WHERE name LIKE ? AND status='active' LIMIT 1", [surname + '%']) : null;
      if (!stu) stu = db.get("SELECT id, name FROM students WHERE status='active' LIMIT 1");
      if (stu) {
        db.run("INSERT OR IGNORE INTO student_parents VALUES (?,?)", [stu.id, pgId]);
        console.log(`[BUG-F5]   创建 student_parents: ${u.name} → 学生 ${stu.name}(${stu.id})`);
      } else {
        console.log(`[BUG-F5]   ⚠ 无可用学生，无法创建链接`);
      }
    }
  } catch(e) { console.error('[BUG-F5] linked_id repair error:', e.message); }

  // ── BUG-18 修复：将 applications 通过 uni_name 关联到 uni_programs ──
  try {
    const unlinkedApps = db.all("SELECT a.id, a.uni_name, a.department FROM applications a WHERE a.program_id IS NULL AND a.uni_name IS NOT NULL");
    let linked = 0;
    for (const app of unlinkedApps) {
      // 尝试通过大学名 + 专业名匹配
      let prog = db.get("SELECT id, university_id FROM uni_programs WHERE uni_name LIKE ? AND program_name LIKE ?",
        [`%${(app.uni_name||'').replace(/[^a-zA-Z\u4e00-\u9fff]/g,' ').trim().split(/\s+/)[0]}%`,
         `%${(app.department||'').split(/\s+/)[0]}%`]);
      // 如果匹配不到，只按大学名匹配
      if (!prog) {
        prog = db.get("SELECT id, university_id FROM uni_programs WHERE uni_name LIKE ?",
          [`%${(app.uni_name||'').replace(/[^a-zA-Z\u4e00-\u9fff]/g,' ').trim().split(/\s+/)[0]}%`]);
      }
      if (prog) {
        db.run("UPDATE applications SET program_id=? WHERE id=?", [prog.id, app.id]);
        // 如果 application 的 university_id 也缺失，同步更新
        if (prog.university_id) {
          db.run("UPDATE applications SET university_id=COALESCE(university_id,?) WHERE id=? AND university_id IS NULL", [prog.university_id, app.id]);
        }
        linked++;
      }
    }
    if (linked) console.log(`[fix] Linked ${linked}/${unlinkedApps.length} applications to uni_programs`);
  } catch(e) { console.error('[fix] app-program linkage error:', e.message); }

  // ── 诊断端点：查看家长链路状态 ──
  app.get('/api/debug/parent-links', requireAuth, (req, res) => {
    if (req.session.user.role !== 'principal') return res.status(403).json({ error: '仅校长可用' });
    const parentUsers = db.all("SELECT id, username, name, linked_id FROM users WHERE role='parent'");
    const result = parentUsers.map(u => {
      const pg = u.linked_id ? db.get("SELECT id, name FROM parent_guardians WHERE id=?", [u.linked_id]) : null;
      const links = u.linked_id ? db.all("SELECT sp.student_id, s.name as student_name, s.status as student_status FROM student_parents sp LEFT JOIN students s ON s.id=sp.student_id WHERE sp.parent_id=?", [u.linked_id]) : [];
      const studentsViaQuery = u.linked_id ? db.all("SELECT s.id, s.name, s.status FROM students s WHERE s.status='active' AND s.id IN (SELECT student_id FROM student_parents WHERE parent_id=?)", [u.linked_id]) : [];
      return {
        username: u.username, name: u.name, linked_id: u.linked_id,
        parent_guardians_exists: !!pg, parent_guardians_name: pg?.name,
        student_parents_rows: links,
        students_via_api_query: studentsViaQuery,
        total_students_in_db: db.get("SELECT COUNT(*) as cnt FROM students WHERE status='active'")?.cnt,
        total_student_parents: db.get("SELECT COUNT(*) as cnt FROM student_parents")?.cnt,
      };
    });
    res.json(result);
  });

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
    console.log(`  财务:        finance    → 财务管理模块`);
    console.log(`  代理:        agent01    → 代理门户（仅自身数据）`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
