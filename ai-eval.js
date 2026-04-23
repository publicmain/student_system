/**
 * ai-eval.js — AI 录取概率增强引擎
 * 基于大模型训练数据（含真实录取案例）对已有系统评分进行 AI 增强分析。
 * Fix 9: 加 ai_eval_cache 缓存，key=sha256(student_stable_hash+program_id+prompt_version)
 */
'use strict';
const crypto = require('crypto');
const { callClaudeJSON, hasAnthropic, hasOpenAI } = require('./ai-client');

// prompt version — 改动后更新此值可使全部缓存自动失效
const EVAL_PROMPT_VERSION = '1.0';

// 学生"稳定字段" hash：关键学术数据变化时 miss 缓存
function buildStudentStableHash(studentInfo) {
  const stable = {
    grade_level: studentInfo.grade_level,
    exam_board: studentInfo.exam_board,
    sittings: (studentInfo.exam_sittings || []).map(s => ({
      board: s.exam_board, subject: s.subject,
      pred: s.predicted_grade, actual: s.actual_grade, year: s.year,
    })),
    assessments: (studentInfo.assessments || []).map(a => ({ type: a.type, score: a.score, max: a.max_score })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 16);
}

const SYSTEM_PROMPT = `You are an expert international university admissions consultant with 15+ years of experience.
You have deep knowledge of admission statistics, trends, and requirements for universities in the UK, US, Singapore, Hong Kong, and other countries.
You are given a student's academic profile and a target university program.
Your task is to provide a calibrated admission probability estimate based on your knowledge of:
- Historical acceptance rates for these programs
- Typical academic requirements and grade standards
- Competitive landscape and applicant profiles
- How the student's specific grades and subjects match program requirements

Be realistic but fair. Distinguish between programs with very different selectivity levels.
Respond ONLY with the JSON structure specified — no extra text.`;

const AI_EVAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['prob_low', 'prob_mid', 'prob_high', 'confidence', 'reasoning', 'strengths', 'concerns', 'recommendation', 'data_note'],
  properties: {
    prob_low:       { type: 'integer', description: '保守录取概率估计 (0-99整数)' },
    prob_mid:       { type: 'integer', description: '中位录取概率估计 (0-99整数)' },
    prob_high:      { type: 'integer', description: '乐观录取概率估计 (0-99整数)' },
    confidence:     { type: 'string', enum: ['low', 'medium', 'high'], description: '此概率估计的置信度' },
    reasoning:      { type: 'string', description: '概率估计的核心推理，2-4句话，中文' },
    strengths:      { type: 'array', items: { type: 'string' }, description: '学生相对该项目的优势，2-4条，中文' },
    concerns:       { type: 'array', items: { type: 'string' }, description: '申请风险或不确定因素，2-4条，中文' },
    recommendation: { type: 'string', description: '针对该申请的一句话关键建议，中文' },
    data_note:      { type: 'string', description: '说明AI概率来源（训练数据截止时间、数据局限性等），中文，1-2句' }
  }
};

/**
 * Build the user prompt from student + program + system eval data.
 */
function buildEvalPrompt(studentInfo, programInfo, systemEval) {
  return JSON.stringify({
    task: 'admission_probability_estimate',
    student_profile: studentInfo,
    target_program: programInfo,
    system_eval_reference: {
      score_academic: systemEval.score_academic,
      score_language: systemEval.score_language,
      score_total: systemEval.score_total,
      hard_pass: systemEval.hard_pass === 1,
      hard_fails: (() => { try { return JSON.parse(systemEval.hard_fails||'[]'); } catch(e) { return []; } })(),
      system_prob_mid: systemEval.prob_mid,
      note: 'The system probability is rule-based. Use it as context but provide your own AI-based estimate.'
    }
  }, null, 2);
}

/**
 * Enhance an existing admission evaluation with AI probability analysis.
 * Fix 9: 先查 ai_eval_cache，miss 再调 Opus。
 *
 * @param {object} ev - The eval record from admission_evaluations
 * @param {object} student - The student record
 * @param {object} program - The uni_programs record
 * @param {Array}  examSittings - The student's exam_sittings
 * @param {Array}  assessments - The student's admission_assessments
 * @param {object} [db] - 可选 db 实例，有则读写缓存
 * @returns {object} AI result object
 */
async function enhanceEval(ev, student, program, examSittings, assessments, db) {
  if (!hasAnthropic() && !hasOpenAI()) throw new Error('未配置 AI Key。');

  const studentInfo = {
    grade_level: student.grade_level,
    exam_board: student.exam_board,
    exam_sittings: examSittings.map(s => ({
      exam_board: s.exam_board,
      subject: s.subject,
      component: s.component,
      predicted_grade: s.predicted_grade,
      actual_grade: s.actual_grade,
      year: s.year,
      series: s.series
    })),
    assessments: assessments.map(a => ({
      type: a.assess_type,
      score: a.score,
      max_score: a.max_score,
      date: a.assess_date
    }))
  };

  // Fix 9: 查 ai_eval_cache
  const cacheKey = buildStudentStableHash(studentInfo) + ':' + program.id + ':' + EVAL_PROMPT_VERSION;
  if (db) {
    try {
      const cached = db.get('SELECT result_json FROM ai_eval_cache WHERE key=?', [cacheKey]);
      if (cached) {
        console.log(`[ai-eval] cache hit key=${cacheKey}`);
        return JSON.parse(cached.result_json);
      }
    } catch(e) {}
  }

  const gradeReqs = (() => { try { return JSON.parse(program.grade_requirements||'[]'); } catch(e) { return []; } })();
  const extraTests = (() => { try { return JSON.parse(program.extra_tests||'[]'); } catch(e) { return []; } })();

  const programInfo = {
    university: program.uni_name,
    program: program.program_name,
    department: program.department,
    country: program.country,
    route: program.route,
    grade_type: program.grade_type,
    ielts_required: program.ielts_overall || null,
    toefl_required: program.toefl_overall || null,
    grade_requirements: gradeReqs,
    extra_tests: extraTests,
    historical_offer_rate: program.hist_offer_rate != null ? `${Math.round(parseFloat(program.hist_offer_rate)*100)}%` : 'unknown',
    historical_applicants: program.hist_applicants || 0
  };

  const result = await callClaudeJSON({
    tier: 'heavy',
    system: SYSTEM_PROMPT,
    user: buildEvalPrompt(studentInfo, programInfo, ev),
    schema: AI_EVAL_SCHEMA,
    maxTokens: 4000,
  });

  // Validate ranges
  result.prob_low  = Math.max(0, Math.min(99, result.prob_low));
  result.prob_mid  = Math.max(0, Math.min(99, result.prob_mid));
  result.prob_high = Math.max(0, Math.min(99, result.prob_high));
  // Ensure low <= mid <= high
  if (result.prob_low > result.prob_mid)  result.prob_low  = result.prob_mid;
  if (result.prob_high < result.prob_mid) result.prob_high = result.prob_mid;

  // Fix 9: 写缓存
  if (db) {
    try {
      db.run(
        `INSERT OR REPLACE INTO ai_eval_cache (key, result_json, created_at, prompt_version)
         VALUES (?, ?, datetime('now'), ?)`,
        [cacheKey, JSON.stringify(result), EVAL_PROMPT_VERSION]
      );
    } catch(e) { console.error('[ai-eval] cache write failed:', e.message); }
  }

  return result;
}

module.exports = { enhanceEval };
