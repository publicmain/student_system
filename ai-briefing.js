/**
 * ai-briefing.js — 规划师日报 Daily Briefing
 *
 * 每天早上汇总规划师负责的学生 24 小时内动态（新任务、即将截止、Offer、逾期、
 * 新沟通记录），让 AI 生成一封简短邮件："今天你需要关注的 3 件事"。
 *
 * 使用 medium tier（Sonnet 4.6，速度优先）。
 */
'use strict';
const { callClaudeJSON, hasAnthropic, hasOpenAI } = require('./ai-client');

const SYSTEM_PROMPT = `你是一位高效的升学规划团队的助理，每天早上给每位规划师发一份日报。

输入：规划师的 caseload（负责的所有学生）以及过去 24-72 小时内这些学生的动态事件。

输出要求：
1. 用简洁中文，像一封给老板的备忘录
2. 开头一句话总结大局（"今天 X 位学生有动作，其中 Y 个需要你今天处理"）
3. 按**紧急程度**列出最多 5 项需要规划师关注的事项：
   - 逾期任务（最紧急）
   - 今天/明天截止的申请或材料
   - 新收到的 Offer / Rejection
   - 考试成绩有落差（预测 vs 实际）
   - 超 7 天未联系的学生
4. 每项：学生名 + 具体事件 + 建议动作（"今天给 X 打电话，确认 Y"）
5. 结尾可选一句鼓励或整体趋势提醒

不要写"尊敬的老师您好"之类的客套话。不要使用 emoji。直接上内容。输出必须是合法 JSON。`;

const BRIEFING_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['headline', 'items', 'encouragement'],
  properties: {
    headline: { type: 'string', description: '一句话总览，不超过 60 字' },
    items: {
      type: 'array',
      maxItems: 7,
      items: {
        type: 'object', additionalProperties: false,
        required: ['student_name', 'urgency', 'event', 'recommended_action'],
        properties: {
          student_name: { type: 'string' },
          urgency: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          event: { type: 'string' },
          recommended_action: { type: 'string' },
        }
      }
    },
    encouragement: { type: 'string', description: '可选，不超过 60 字；无则留空字符串' },
  }
};

/**
 * 为单个规划师生成日报。
 *
 * @param {Database} db
 * @param {string} counselorStaffId  staff.id
 * @param {object} [options]
 * @param {number} [options.lookbackHours=72]
 * @returns {Promise<{data: object, events_considered: number, skipped: boolean}>}
 */
async function generateCounselorBriefing(db, counselorStaffId, options = {}) {
  const lookbackHours = options.lookbackHours || 72;
  const lookbackIso = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
  const todayIso = new Date().toISOString().slice(0, 10);
  const plusWeekIso = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // 1) 找出这位规划师负责的学生
  const students = db.all(`
    SELECT DISTINCT s.id, s.name, s.grade_level
    FROM students s
    JOIN mentor_assignments ma ON ma.student_id = s.id
    WHERE ma.staff_id=? AND s.status='active' AND (ma.end_date IS NULL OR ma.end_date='')
  `, [counselorStaffId]);

  if (students.length === 0) {
    return { data: null, events_considered: 0, skipped: true, reason: 'no_caseload' };
  }

  const studentIds = students.map(s => s.id);
  const inClause = studentIds.map(()=>'?').join(',');

  // 2) 汇总动态
  const events = {};
  // 逾期任务
  try {
    events.overdue_tasks = db.all(`
      SELECT mt.student_id, s.name AS student_name, mt.title, mt.due_date
      FROM milestone_tasks mt JOIN students s ON s.id=mt.student_id
      WHERE mt.student_id IN (${inClause}) AND mt.status != 'done'
        AND mt.due_date < ? AND mt.due_date >= date('now','-30 day')
      ORDER BY mt.due_date`, [...studentIds, todayIso]);
  } catch(e) { events.overdue_tasks = []; }

  // 近 7 天到期
  try {
    events.upcoming_tasks = db.all(`
      SELECT mt.student_id, s.name AS student_name, mt.title, mt.due_date
      FROM milestone_tasks mt JOIN students s ON s.id=mt.student_id
      WHERE mt.student_id IN (${inClause}) AND mt.status != 'done'
        AND mt.due_date >= ? AND mt.due_date <= ?
      ORDER BY mt.due_date LIMIT 20`, [...studentIds, todayIso, plusWeekIso]);
  } catch(e) { events.upcoming_tasks = []; }

  // 新 Offer / Rejection
  try {
    events.offer_status_changes = db.all(`
      SELECT a.student_id, s.name AS student_name, a.uni_name, a.department, a.status, a.updated_at
      FROM applications a JOIN students s ON s.id=a.student_id
      WHERE a.student_id IN (${inClause})
        AND a.status IN ('offer','conditional_offer','unconditional_offer','rejected','accepted','firm','insurance')
        AND a.updated_at >= ?
      ORDER BY a.updated_at DESC LIMIT 15`, [...studentIds, lookbackIso]);
  } catch(e) { events.offer_status_changes = []; }

  // 考试成绩落差（actual 比 predicted 低 1 档以上）
  try {
    events.grade_surprises = db.all(`
      SELECT es.student_id, s.name AS student_name, es.subject, es.predicted_grade, es.actual_grade, es.sitting_date
      FROM exam_sittings es JOIN students s ON s.id=es.student_id
      WHERE es.student_id IN (${inClause}) AND es.actual_grade IS NOT NULL AND es.actual_grade != ''
        AND es.sitting_date >= date('now','-30 day')
      ORDER BY es.sitting_date DESC LIMIT 10`, [...studentIds]);
  } catch(e) { events.grade_surprises = []; }

  // 长时间未联系的学生
  try {
    events.stale_contacts = db.all(`
      SELECT s.id AS student_id, s.name AS student_name,
             COALESCE(MAX(cl.created_at), 'never') AS last_contact
      FROM students s
      LEFT JOIN communication_logs cl ON cl.student_id=s.id
      WHERE s.id IN (${inClause})
      GROUP BY s.id
      HAVING last_contact = 'never' OR last_contact < date('now','-7 day')
      ORDER BY last_contact ASC LIMIT 10`, studentIds);
  } catch(e) { events.stale_contacts = []; }

  // 新收到的反馈
  try {
    events.recent_feedback = db.all(`
      SELECT f.student_id, s.name AS student_name, f.from_role, f.feedback_type, f.rating, f.content, f.created_at
      FROM feedback f JOIN students s ON s.id=f.student_id
      WHERE f.student_id IN (${inClause}) AND f.created_at >= ?
      ORDER BY f.created_at DESC LIMIT 10`, [...studentIds, lookbackIso]);
  } catch(e) { events.recent_feedback = []; }

  const totalEvents =
    (events.overdue_tasks||[]).length +
    (events.upcoming_tasks||[]).length +
    (events.offer_status_changes||[]).length +
    (events.grade_surprises||[]).length +
    (events.stale_contacts||[]).length +
    (events.recent_feedback||[]).length;

  if (totalEvents === 0) {
    return { data: {
      headline: `今日无动态 — ${students.length} 位学生档案稳定。`,
      items: [], encouragement: ''
    }, events_considered: 0, skipped: false };
  }

  if (!hasAnthropic() && !hasOpenAI()) {
    // 无 AI 时走纯规则摘要（不报错，给基础版日报）
    return { data: buildRuleBriefing(students.length, events), events_considered: totalEvents, skipped: false, fallback: 'rules' };
  }

  const userMsg = JSON.stringify({
    caseload_size: students.length,
    date: todayIso,
    lookback_hours: lookbackHours,
    events,
  }, null, 2);

  const data = await callClaudeJSON({
    tier: 'medium',
    system: SYSTEM_PROMPT,
    user: userMsg,
    schema: BRIEFING_SCHEMA,
    maxTokens: 3000,
  });

  return { data, events_considered: totalEvents, skipped: false };
}

// 无 AI 时的规则版日报（防回退到 "AI 未配置" 错误）
function buildRuleBriefing(caseloadSize, events) {
  const items = [];
  for (const t of (events.overdue_tasks || []).slice(0, 3)) {
    items.push({ student_name: t.student_name, urgency: 'critical',
      event: `任务逾期：${t.title}（截止 ${t.due_date}）`,
      recommended_action: '今天联系学生推进或调整截止时间' });
  }
  for (const o of (events.offer_status_changes || []).slice(0, 2)) {
    items.push({ student_name: o.student_name, urgency: 'high',
      event: `申请状态变更：${o.uni_name} ${o.department} → ${o.status}`,
      recommended_action: '确认学生是否需要决策支持' });
  }
  for (const t of (events.upcoming_tasks || []).slice(0, 2)) {
    items.push({ student_name: t.student_name, urgency: 'medium',
      event: `任务临近截止：${t.title}（${t.due_date}）`,
      recommended_action: '提醒学生 / 确认材料齐备' });
  }
  return {
    headline: `今日 ${caseloadSize} 位学生 caseload；以下事项需关注（规则版，未启用 AI）。`,
    items: items.slice(0, 5),
    encouragement: '',
  };
}

/**
 * 为所有有 caseload 的规划师批量生成日报。
 * @returns {Promise<Array<{staff_id, staff_name, staff_email, briefing}>>}
 */
async function generateAllBriefings(db, options = {}) {
  const counselors = db.all(`
    SELECT DISTINCT s.id, s.name, s.email
    FROM staff s JOIN mentor_assignments ma ON ma.staff_id=s.id
    WHERE s.role IN ('counselor','mentor') AND s.email IS NOT NULL AND s.email != ''
  `);
  const results = [];
  for (const c of counselors) {
    try {
      const r = await generateCounselorBriefing(db, c.id, options);
      if (!r.skipped) {
        results.push({ staff_id: c.id, staff_name: c.name, staff_email: c.email, briefing: r.data });
      }
    } catch(e) {
      console.error(`[ai-briefing] 生成失败 ${c.name}:`, e.message);
    }
  }
  return results;
}

module.exports = { generateCounselorBriefing, generateAllBriefings, BRIEFING_SCHEMA };
