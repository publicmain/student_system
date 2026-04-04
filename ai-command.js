/**
 * ai-command.js — 申请指挥中心 AI 引擎
 * 复用 ai-eval.js 的 OpenAI 模式（JSON Schema strict mode）
 */
'use strict';
const { OpenAI } = require('openai');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

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
  const apps = db.all(`
    SELECT a.id, a.uni_name, a.department, a.tier, a.status, a.submit_deadline, a.route,
           s.name as student_name
    FROM applications a JOIN students s ON s.id=a.student_id
    WHERE a.status IN ('pending','applied') AND s.status='active'
    ORDER BY a.submit_deadline ASC LIMIT 50`);

  const snapshot = apps.map(a => {
    const tasks = db.all('SELECT title, status, due_date, category FROM milestone_tasks WHERE application_id=? ORDER BY due_date', [a.id]);
    const materials = db.all('SELECT title, status, material_type FROM material_items WHERE application_id=?', [a.id]);
    const ps = db.get('SELECT status, word_count FROM personal_statements WHERE application_id=? ORDER BY version DESC LIMIT 1', [a.id]);
    return { ...a, student_name: `[学生${a.id.slice(-4)}]`, tasks, materials, ps: ps || null };
  });

  const client = new OpenAI();
  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: '你是一位资深升学规划顾问，擅长识别申请流程中的风险。根据提供的申请数据，识别最需要关注的风险项。只基于提供的数据分析，不要臆测。用中文回复。' },
      { role: 'user', content: JSON.stringify({ task: 'risk_analysis', today: new Date().toISOString().split('T')[0], applications: snapshot }) }
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'risk_alerts', strict: true, schema: RISK_SCHEMA } },
    temperature: 0.3
  });

  return JSON.parse(resp.choices[0].message.content);
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
  const students = db.all(`
    SELECT DISTINCT s.id, s.name, s.grade_level
    FROM students s JOIN applications a ON a.student_id=s.id
    WHERE s.status='active' AND a.status IN ('pending','applied')
    LIMIT 30`);

  const snapshot = students.map(s => {
    const apps = db.all('SELECT id, uni_name, status, submit_deadline, tier FROM applications WHERE student_id=? AND status IN (\'pending\',\'applied\') ORDER BY submit_deadline', [s.id]);
    const pendingTasks = db.all('SELECT title, due_date, status, category FROM milestone_tasks WHERE student_id=? AND status NOT IN (\'done\',\'cancelled\') ORDER BY due_date LIMIT 10', [s.id]);
    return { student_id: s.id, student_ref: `[学生${s.id.slice(-4)}]`, grade_level: s.grade_level, applications: apps, pending_tasks: pendingTasks };
  });

  const client = new OpenAI();
  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: '你是一位资深升学规划顾问。根据每个学生的申请进度和待办任务，为每个学生推荐最紧急的一项行动。只基于提供的数据推荐，用中文回复。' },
      { role: 'user', content: JSON.stringify({ task: 'next_best_action', today: new Date().toISOString().split('T')[0], students: snapshot }) }
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'next_actions', strict: true, schema: ACTION_SCHEMA } },
    temperature: 0.3
  });

  const result = JSON.parse(resp.choices[0].message.content);
  // 注入学生真实姓名
  result.actions.forEach(a => {
    const s = students.find(st => st.id === a.student_id);
    if (s) a.student_name = s.name;
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

exports.parseNLQuery = async function(query) {
  const client = new OpenAI();
  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: `你是一个升学申请查询解析器。将用户的自然语言查询转换为结构化的筛选参数。
已知大学分组：
- G5: Cambridge, Oxford, Imperial College London, UCL, LSE
- Russell Group: 包含G5 + King's College London, Edinburgh, Manchester, Bristol, Warwick 等24所
- 常见缩写: Oxbridge=Oxford+Cambridge, IC=Imperial College London

状态值: pending(准备中), applied(已提交), offer(收到Offer), firm(确认选择), declined(已拒绝/撤回), enrolled(已入学)
梯度: 冲刺, 意向, 保底
路线: UK-UG, UK-PG, US, SG, HK, AU

不确定的字段设为 null。用中文解释。` },
      { role: 'user', content: query }
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'nlq_parse', strict: true, schema: NLQ_SCHEMA } },
    temperature: 0.2
  });

  return JSON.parse(resp.choices[0].message.content);
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

  const client = new OpenAI();
  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: '你是一位资深升学规划顾问，擅长评估学生的选校方案。根据学生的申请列表，评估其冲刺/匹配/保底分布是否合理。一般建议至少2个冲刺、3个匹配、2个保底。根据具体申请的院校水平和学生背景给出建议。用中文回复。' },
      { role: 'user', content: JSON.stringify({ task: 'list_score', student_ref: `[学生${studentId.slice(-4)}]`, grade_level: student.grade_level, exam_board: student.exam_board, applications: apps }) }
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'list_score', strict: true, schema: LIST_SCORE_SCHEMA } },
    temperature: 0.3
  });

  const result = JSON.parse(resp.choices[0].message.content);
  result.student_name = student.name;
  result.total_applications = apps.length;
  return result;
};
