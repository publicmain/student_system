/**
 * ai-command.js — 申请指挥中心 AI 引擎
 */
'use strict';
const { callClaudeJSON, hasAnthropic, hasOpenAI } = require('./ai-client');

// ── Fix 2: NLQ 结果内存 LRU 缓存 ──────────────────────────────
// key = role + ':' + normalized_query，容量 1000，TTL 10 分钟
const NLQ_CACHE_MAX = 1000;
const NLQ_CACHE_TTL = 10 * 60 * 1000; // 10 min
const _nlqCache = new Map();
const _nlqOrder = []; // insertion order for LRU eviction

function nlqCacheKey(role, query) {
  return `${role}:${query.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}
function nlqCacheGet(key) {
  const entry = _nlqCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > NLQ_CACHE_TTL) { _nlqCache.delete(key); return null; }
  // LRU: move to end
  const pos = _nlqOrder.indexOf(key);
  if (pos >= 0) { _nlqOrder.splice(pos, 1); _nlqOrder.push(key); }
  return entry.value;
}
function nlqCacheSet(key, value) {
  if (_nlqCache.has(key)) {
    const pos = _nlqOrder.indexOf(key);
    if (pos >= 0) _nlqOrder.splice(pos, 1);
  } else if (_nlqCache.size >= NLQ_CACHE_MAX) {
    // evict oldest
    const oldest = _nlqOrder.shift();
    if (oldest) _nlqCache.delete(oldest);
  }
  _nlqCache.set(key, { value, ts: Date.now() });
  _nlqOrder.push(key);
}

function _ensureConfigured() {
  if (!hasAnthropic() && !hasOpenAI()) {
    const err = new Error('未配置 ANTHROPIC_API_KEY 或 OPENAI_API_KEY，AI 功能不可用。');
    err.isConfigError = true;
    throw err;
  }
}

// ═══════════════════════════════════════════════════════
//  1. 风险分析
// ═══════════════════════════════════════════════════════

const RISK_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['alerts'],
  properties: {
    alerts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['application_id', 'severity', 'reason', 'suggestion'],
        properties: {
          application_id: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          reason: { type: 'string', description: '风险原因，中文，1-2句' },
          suggestion: { type: 'string', description: '建议采取的行动，中文' }
        }
      }
    }
  }
};

exports.analyzeRisks = async function(db, user) {
  let roleWhere = '', roleParams = [];
  if (user.role === 'counselor' || user.role === 'mentor') {
    roleWhere = 'AND a.student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)';
    roleParams.push(user.linked_id);
  } else if (user.role === 'parent') {
    roleWhere = 'AND a.student_id IN (SELECT student_id FROM student_parents WHERE parent_id=?)';
    roleParams.push(user.linked_id);
  } else if (user.role === 'student') {
    roleWhere = 'AND a.student_id=?';
    roleParams.push(user.linked_id);
  }
  // principal: no filter

  // Fix 15: 先用规则预筛 Top N 个最需关注的申请，避免全量 snapshot token 爆炸
  const AI_COMMAND_MAX_APPS = parseInt(process.env.AI_COMMAND_MAX_APPS || '20');
  const apps = db.all(`
    SELECT a.id, a.uni_name, a.department, a.tier, a.status, a.submit_deadline, a.route,
           s.name as student_name,
           -- 风险评分：逾期任务数 + 截止日紧迫度（越近越高）
           (SELECT COUNT(*) FROM milestone_tasks mt
            WHERE mt.application_id=a.id AND mt.status!='done' AND mt.due_date < date('now')) AS overdue_task_count,
           CASE
             WHEN a.submit_deadline IS NULL THEN 999
             ELSE CAST(julianday(a.submit_deadline) - julianday('now') AS INTEGER)
           END AS days_to_deadline
    FROM applications a JOIN students s ON s.id=a.student_id
    WHERE a.status IN ('pending','applied') AND s.status='active'
    ${roleWhere}
    ORDER BY overdue_task_count DESC, days_to_deadline ASC
    LIMIT ?`, [...roleParams, AI_COMMAND_MAX_APPS]);

  // 批量查询避免 N+1：一次获取所有 tasks/materials/ps
  const appIds = apps.map(a => a.id);
  const allTasks = appIds.length ? db.all(`SELECT application_id, title, status, due_date, category FROM milestone_tasks WHERE application_id IN (${appIds.map(()=>'?').join(',')}) ORDER BY due_date`, appIds) : [];
  const allMaterials = appIds.length ? db.all(`SELECT application_id, title, status, material_type FROM material_items WHERE application_id IN (${appIds.map(()=>'?').join(',')})`, appIds) : [];
  const allPS = appIds.length ? db.all(`SELECT application_id, status, word_count FROM personal_statements WHERE application_id IN (${appIds.map(()=>'?').join(',')}) ORDER BY version DESC`, appIds) : [];

  const tasksByApp = new Map(), matsByApp = new Map(), psByApp = new Map();
  allTasks.forEach(t => { if (!tasksByApp.has(t.application_id)) tasksByApp.set(t.application_id, []); tasksByApp.get(t.application_id).push(t); });
  allMaterials.forEach(m => { if (!matsByApp.has(m.application_id)) matsByApp.set(m.application_id, []); matsByApp.get(m.application_id).push(m); });
  allPS.forEach(p => { if (!psByApp.has(p.application_id)) psByApp.set(p.application_id, p); }); // first = latest version

  // 匿名化：用索引代替真实 ID 发送给 AI
  const idMap = new Map(); // ref -> real id
  const snapshot = apps.map((a, i) => {
    const ref = `APP_${i}`;
    idMap.set(ref, a.id);
    return {
      ref, uni_name: a.uni_name, department: a.department, tier: a.tier,
      status: a.status, submit_deadline: a.submit_deadline, route: a.route,
      student_ref: `学生${i}`,
      tasks: (tasksByApp.get(a.id) || []).map(t => ({ title: t.title, status: t.status, due_date: t.due_date, category: t.category })),
      materials: (matsByApp.get(a.id) || []).map(m => ({ title: m.title, status: m.status, material_type: m.material_type })),
      ps: psByApp.get(a.id) || null,
    };
  });

  _ensureConfigured();
  const result = await callClaudeJSON({
    tier: 'heavy',
    system: '你是一位资深升学规划顾问，擅长识别申请流程中的风险。根据提供的申请数据，识别最需要关注的风险项。只基于提供的数据分析，不要臆测。用中文回复。',
    user: JSON.stringify({ task: 'risk_analysis', today: new Date().toISOString().split('T')[0], applications: snapshot }),
    schema: RISK_SCHEMA,
    maxTokens: 4000,
  });
  // 将匿名 ref 映射回真实 application_id
  if (result.alerts) {
    result.alerts.forEach(a => {
      if (idMap.has(a.application_id)) a.application_id = idMap.get(a.application_id);
    });
  }
  return result;
};

// ═══════════════════════════════════════════════════════
//  2. 行动建议
// ═══════════════════════════════════════════════════════

const ACTION_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['actions'],
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['student_id', 'action', 'urgency', 'reasoning'],
        properties: {
          student_id: { type: 'string' },
          action: { type: 'string', description: '建议的具体行动，中文' },
          urgency: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          reasoning: { type: 'string', description: '为什么这是最紧急的事，中文，1句' }
        }
      }
    }
  }
};

exports.suggestNextActions = async function(db, user) {
  let roleWhere = '', roleParams = [];
  if (user.role === 'counselor' || user.role === 'mentor') {
    roleWhere = 'AND a.student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)';
    roleParams.push(user.linked_id);
  } else if (user.role === 'parent') {
    roleWhere = 'AND a.student_id IN (SELECT student_id FROM student_parents WHERE parent_id=?)';
    roleParams.push(user.linked_id);
  } else if (user.role === 'student') {
    roleWhere = 'AND a.student_id=?';
    roleParams.push(user.linked_id);
  }
  // principal: no filter

  const students = db.all(`
    SELECT DISTINCT s.id, s.name, s.grade_level
    FROM students s JOIN applications a ON a.student_id=s.id
    WHERE s.status='active' AND a.status IN ('pending','applied')
    ${roleWhere}
    LIMIT 30`, [...roleParams]);

  // 匿名化：用索引 ref 代替真实 student_id
  const studentIdMap = new Map(); // ref -> real student
  const snapshot = students.map((s, i) => {
    const ref = `STU_${i}`;
    studentIdMap.set(ref, s);
    const apps = db.all('SELECT uni_name, status, submit_deadline, tier FROM applications WHERE student_id=? AND status IN (\'pending\',\'applied\') ORDER BY submit_deadline', [s.id]);
    const pendingTasks = db.all('SELECT title, due_date, status, category FROM milestone_tasks WHERE student_id=? AND status NOT IN (\'done\',\'cancelled\') ORDER BY due_date LIMIT 10', [s.id]);
    return { student_id: ref, student_ref: `[学生${i}]`, grade_level: s.grade_level, applications: apps, pending_tasks: pendingTasks };
  });

  _ensureConfigured();
  const result = await callClaudeJSON({
    tier: 'medium',
    system: '你是一位资深升学规划顾问。根据每个学生的申请进度和待办任务，为每个学生推荐最紧急的一项行动。只基于提供的数据推荐，用中文回复。student_id 请原样返回。',
    user: JSON.stringify({ task: 'next_best_action', today: new Date().toISOString().split('T')[0], students: snapshot }),
    schema: ACTION_SCHEMA,
    maxTokens: 4000,
  });
  // 映射匿名 ref 回真实 student_id + 注入姓名
  result.actions.forEach(a => {
    const s = studentIdMap.get(a.student_id);
    if (s) {
      a.student_id = s.id;
      a.student_name = s.name;
    }
  });
  return result;
};

// ═══════════════════════════════════════════════════════
//  3. 自然语言查询
// ═══════════════════════════════════════════════════════

const NLQ_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['filters', 'explanation'],
  properties: {
    filters: {
      type: 'object', additionalProperties: false,
      required: ['search', 'status', 'cycle_year', 'tier', 'route', 'uni_names'],
      properties: {
        search: { type: ['string', 'null'], description: '搜索关键词' },
        status: { type: ['string', 'null'], description: '申请状态: pending/applied/offer/firm/declined/enrolled' },
        cycle_year: { type: ['integer', 'null'], description: '申请周期年份' },
        tier: { type: ['string', 'null'], description: '梯度: 冲刺/意向/保底' },
        route: { type: ['string', 'null'], description: '路线: UK-UG/UK-PG/US/SG/HK/AU' },
        uni_names: { type: 'array', items: { type: 'string' }, description: '大学名称列表（如G5、Russell Group等可展开为具体校名）' }
      }
    },
    explanation: { type: 'string', description: '解释查询意图和应用的筛选条件，中文' }
  }
};

exports.parseNLQuery = async function(query, role) {
  _ensureConfigured();
  const cacheKey = nlqCacheKey(role || 'unknown', query);
  const cached = nlqCacheGet(cacheKey);
  if (cached) {
    console.log(`[ai-command] NLQ cache hit key=${cacheKey.slice(0,60)}`);
    return cached;
  }
  // Haiku 4.5：NLQ 解析很轻，用便宜快的模型即可
  const result = await callClaudeJSON({
    tier: 'light',
    system: `你是一个升学申请查询解析器。将用户的自然语言查询转换为结构化的筛选参数。
已知大学分组：
- G5: Cambridge, Oxford, Imperial College London, UCL, LSE
- Russell Group: 包含G5 + King's College London, Edinburgh, Manchester, Bristol, Warwick 等24所
- 常见缩写: Oxbridge=Oxford+Cambridge, IC=Imperial College London

状态值: pending(准备中), applied(已提交), offer(收到Offer), firm(确认选择), declined(已拒绝/撤回), enrolled(已入学)
梯度: 冲刺, 意向, 保底
路线: UK-UG, UK-PG, US, SG, HK, AU

不确定的字段设为 null。用中文解释。`,
    user: query,
    schema: NLQ_SCHEMA,
    maxTokens: 1000,
  });
  nlqCacheSet(cacheKey, result);
  return result;
};

// ═══════════════════════════════════════════════════════
//  4. 选校方案评分
// ═══════════════════════════════════════════════════════

const LIST_SCORE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['score', 'distribution', 'ideal_distribution', 'assessment', 'suggestions'],
  properties: {
    score: { type: 'integer', description: '选校方案综合评分 0-100' },
    distribution: {
      type: 'object', additionalProperties: false,
      required: ['reach', 'target', 'safety'],
      properties: {
        reach: { type: 'integer' },
        target: { type: 'integer' },
        safety: { type: 'integer' }
      }
    },
    ideal_distribution: {
      type: 'object', additionalProperties: false,
      required: ['reach', 'target', 'safety'],
      properties: {
        reach: { type: 'integer' },
        target: { type: 'integer' },
        safety: { type: 'integer' }
      }
    },
    assessment: { type: 'string', description: '总体评价，中文，2-3句' },
    suggestions: { type: 'array', items: { type: 'string' }, description: '改进建议，中文，2-4条' }
  }
};

exports.evaluateListScore = async function(db, studentId) {
  const student = db.get('SELECT id, name, grade_level, exam_board FROM students WHERE id=?', [studentId]);
  if (!student) throw new Error('学生不存在');

  const apps = db.all('SELECT uni_name, department, tier, route, status, submit_deadline FROM applications WHERE student_id=? AND status NOT IN (\'declined\') ORDER BY tier', [studentId]);
  if (!apps.length) throw new Error('该学生暂无申请记录');

  _ensureConfigured();
  const result = await callClaudeJSON({
    tier: 'heavy',
    system: '你是一位资深升学规划顾问，擅长评估学生的选校方案。根据学生的申请列表，评估其冲刺/匹配/保底分布是否合理。一般建议至少2个冲刺、3个匹配、2个保底。根据具体申请的院校水平和学生背景给出建议。用中文回复。',
    user: JSON.stringify({ task: 'list_score', student_ref: `[学生${studentId.slice(-4)}]`, grade_level: student.grade_level, exam_board: student.exam_board, applications: apps }),
    schema: LIST_SCORE_SCHEMA,
    maxTokens: 3000,
  });
  result.student_name = student.name;
  result.total_applications = apps.length;
  return result;
};
