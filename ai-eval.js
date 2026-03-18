/**
 * ai-eval.js — AI 录取概率增强引擎
 * 使用 OpenAI gpt-4o，基于大模型训练数据（含真实录取案例）
 * 对已有系统评分进行 AI 增强分析，输出概率区间 + 推理依据。
 */
'use strict';
const { OpenAI } = require('openai');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

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
 * @param {object} ev - The eval record from admission_evaluations
 * @param {object} student - The student record
 * @param {object} program - The uni_programs record
 * @param {Array}  examSittings - The student's exam_sittings
 * @param {Array}  assessments - The student's admission_assessments
 * @returns {object} AI result object
 */
async function enhanceEval(ev, student, program, examSittings, assessments) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY 未配置，请在服务器环境变量中设置后重试。');

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

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: buildEvalPrompt(studentInfo, programInfo, ev) }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'admission_probability_estimate',
        strict: true,
        schema: AI_EVAL_SCHEMA
      }
    }
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('AI 返回内容为空，请稍后重试。');

  const result = JSON.parse(raw);

  // Validate ranges
  result.prob_low  = Math.max(0, Math.min(99, result.prob_low));
  result.prob_mid  = Math.max(0, Math.min(99, result.prob_mid));
  result.prob_high = Math.max(0, Math.min(99, result.prob_high));
  // Ensure low <= mid <= high
  if (result.prob_low > result.prob_mid)  result.prob_low  = result.prob_mid;
  if (result.prob_high < result.prob_mid) result.prob_high = result.prob_mid;

  return result;
}

module.exports = { enhanceEval };
