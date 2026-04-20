/**
 * ai-interview.js — AI 牛剑 / A-Level 面试题生成器
 *
 * 基于学生的目标专业 + 选课 + 已有成绩，生成模拟面试题 + 答题框架。
 * 使用 medium tier（Sonnet 4.6，质量/速度平衡）。
 */
'use strict';
const { callClaudeJSON, hasAnthropic, hasOpenAI } = require('./ai-client');

const SYSTEM_PROMPT = `你是剑桥/牛津大学面试官兼资深 A-Level 教师，精通 Mathematics / Physics / Chemistry / Biology / Economics / Computer Science / Engineering 等专业的本科入学面试。

你的任务：根据给定的学生画像 + 目标专业，生成 10 道模拟面试题。题目特点：
1. 遵循牛剑风格——考察的是思维过程而非既有知识储备（e.g. "What happens when you push a pendulum sideways instead of down?" 比 "State Newton's second law" 好）。
2. 难度应略高于学生当前水平的舒适区（stretch but not impossible）。
3. 涵盖多种题型：
   - 基础概念延伸题（probing understanding of A-Level topic）
   - 跨学科题（数学与物理交叉、经济与数学交叉等）
   - 开放式估算题（Fermi estimation，例如 "How many piano tuners in London?"）
   - 伦理 / 哲学题（对于 Social Sciences / Humanities 方向）
   - 数学推导题（对于 STEM 方向）
4. 每道题给出：
   - question（题目中文+英文双语）
   - topic（所属知识点）
   - difficulty（easy/medium/hard）
   - purpose（考察学生什么能力）
   - ideal_answer_framework（不是标准答案，而是优秀学生的思考路径）
   - common_pitfalls（学生易犯的错）
   - followup_prompts（面试官可能追问的 2-3 个后续问题）

输出必须是完整合法 JSON。`;

const INTERVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['profile_summary', 'questions', 'preparation_tips'],
  properties: {
    profile_summary: {
      type: 'string',
      description: '对学生画像的一句话总结（确认 AI 理解学生背景）',
    },
    questions: {
      type: 'array',
      minItems: 8, maxItems: 12,
      items: {
        type: 'object', additionalProperties: false,
        required: ['question_zh', 'question_en', 'topic', 'difficulty', 'purpose', 'ideal_answer_framework', 'common_pitfalls', 'followup_prompts'],
        properties: {
          question_zh: { type: 'string' },
          question_en: { type: 'string' },
          topic: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          purpose: { type: 'string' },
          ideal_answer_framework: { type: 'string' },
          common_pitfalls: { type: 'array', items: { type: 'string' } },
          followup_prompts: { type: 'array', items: { type: 'string' } },
        }
      }
    },
    preparation_tips: {
      type: 'array',
      items: { type: 'string' },
      description: '面向这位学生的备考建议（3-5 条）',
    }
  }
};

/**
 * 生成面试题集。
 *
 * @param {object} input
 * @param {string} input.target_program    'Cambridge Mathematics' 之类
 * @param {string} [input.university]      'Oxford' | 'Cambridge' | 'Imperial' | 'LSE' ...
 * @param {object} [input.student_snapshot] 学生学术快照
 * @returns {Promise<{questions: object, model: string}>}
 */
async function generateInterviewQuestions(input) {
  if (!hasAnthropic() && !hasOpenAI()) {
    throw new Error('未配置 AI Key。');
  }
  if (!input.target_program) throw new Error('target_program 必填');

  const userMsg = JSON.stringify({
    target_program: input.target_program,
    university: input.university || null,
    student: input.student_snapshot || null,
    n_questions: input.n_questions || 10,
  }, null, 2);

  const questions = await callClaudeJSON({
    tier: 'medium',
    system: SYSTEM_PROMPT,
    user: userMsg,
    schema: INTERVIEW_SCHEMA,
    maxTokens: 8000,
    stream: true,
  });

  return { questions };
}

module.exports = { generateInterviewQuestions, INTERVIEW_SCHEMA };
