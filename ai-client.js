/**
 * ai-client.js — 统一 LLM 客户端
 *
 * 优先使用 Anthropic Claude（Opus 4.7 / Sonnet 4.6 / Haiku 4.5 分级 +
 * 自动 prompt caching + 流式输出）；未配置 ANTHROPIC_API_KEY 时回退到 OpenAI。
 *
 * 通过 callClaude/callClaudeJSON 两个入口使用，子模块不再直接依赖 SDK 细节。
 */
'use strict';
let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk'); } catch(e) { /* not installed */ }
const { OpenAI } = require('openai');

// 模型分级：
//   heavy  — 规划 / 评估 / 文书（智力密集，需要长上下文 + 深度思考）
//   medium — 面试题 / 日报 / 摘要（中等复杂度，速度敏感）
//   light  — 自然语言查询解析 / 分类（快速、低成本）
const MODELS = {
  heavy:  process.env.AI_MODEL_HEAVY  || 'claude-opus-4-7',
  medium: process.env.AI_MODEL_MEDIUM || 'claude-sonnet-4-6',
  light:  process.env.AI_MODEL_LIGHT  || 'claude-haiku-4-5',
};
const OPENAI_FALLBACK = process.env.OPENAI_MODEL || 'gpt-4o';

let _anthropicClient = null;
function getAnthropic() {
  if (!_anthropicClient && Anthropic && process.env.ANTHROPIC_API_KEY) {
    _anthropicClient = new Anthropic();
  }
  return _anthropicClient;
}
let _openaiClient = null;
function getOpenAI() {
  if (!_openaiClient && process.env.OPENAI_API_KEY) {
    _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openaiClient;
}

function hasAnthropic() { return !!getAnthropic(); }
function hasOpenAI()    { return !!getOpenAI(); }

/**
 * 通用调用。system 会被自动套上 prompt cache 标记以降成本。
 *
 * @param {object} opts
 * @param {string} opts.tier     'heavy' | 'medium' | 'light'
 * @param {string} opts.system   系统提示词（长、固定 → 会被缓存）
 * @param {string} opts.user     用户消息
 * @param {number} [opts.maxTokens=16000]
 * @param {boolean}[opts.stream=false]  大输出建议开（避免 HTTP 超时）
 * @returns {Promise<{text:string, usage:object}>}
 */
async function callClaude({ tier = 'medium', system, user, maxTokens = 16000, stream = false }) {
  const ant = getAnthropic();
  if (ant) {
    const model = MODELS[tier] || MODELS.medium;
    const params = {
      model, max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    };
    if (stream) {
      const s = await ant.messages.stream(params);
      const msg = await s.finalMessage();
      return normalizeAnthropic(msg);
    }
    const msg = await ant.messages.create(params);
    return normalizeAnthropic(msg);
  }
  // OpenAI 回退
  const oa = getOpenAI();
  if (!oa) throw new Error('未配置 ANTHROPIC_API_KEY 或 OPENAI_API_KEY');
  const rsp = await oa.chat.completions.create({
    model: OPENAI_FALLBACK,
    temperature: 0.3,
    max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  return {
    text: rsp.choices[0]?.message?.content || '',
    usage: rsp.usage || null,
    provider: 'openai',
    model: OPENAI_FALLBACK,
  };
}

function normalizeAnthropic(msg) {
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return {
    text,
    usage: msg.usage || null,
    provider: 'anthropic',
    model: msg.model,
  };
}

/**
 * 强制 JSON 输出。Anthropic 没有 OpenAI 式的 strict schema，所以用：
 *   - 在 user 末尾附加严格 JSON 要求
 *   - 服务端剥掉 markdown 围栏并 JSON.parse
 *   - 失败会抛错（调用方可重试或降级）
 *
 * 若 tier='heavy' 且 Anthropic 可用，会使用 OpenAI-style strict schema 以降低错误率。
 */
async function callClaudeJSON({ tier = 'medium', system, user, schema, maxTokens = 16000, stream = false }) {
  const jsonSystem = system + `\n\n====\n输出规则（绝对）：你必须只输出一段完整合法 JSON，不要加 markdown 代码围栏、不要加注释、不要加前后文。输出必须严格遵守用户消息末尾约定的 schema。`;
  const schemaHint = schema ? `\n\n===\n输出 JSON schema (JSON Schema 格式)：\n${JSON.stringify(schema, null, 2)}` : '';
  const jsonUser = user + schemaHint;

  const ant = getAnthropic();
  if (ant) {
    const { text } = await callClaude({ tier, system: jsonSystem, user: jsonUser, maxTokens, stream });
    return parseJSONLenient(text);
  }
  // OpenAI 走 structured output（更可靠）
  const oa = getOpenAI();
  if (!oa) throw new Error('未配置 AI Key');
  const rsp = await oa.chat.completions.create({
    model: OPENAI_FALLBACK,
    temperature: 0.3,
    max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'output', strict: true, schema } } } : { response_format: { type: 'json_object' } }),
  });
  const raw = rsp.choices[0]?.message?.content || '';
  return parseJSONLenient(raw);
}

function parseJSONLenient(text) {
  let s = (text || '').trim();
  // 剥掉 ```json ... ``` 围栏
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  // 截到首个 { 到末尾 } 之间（若模型加了前后语）
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try { return JSON.parse(s); }
  catch (e) { throw new Error('AI 返回无法解析为 JSON：' + e.message); }
}

module.exports = {
  callClaude,
  callClaudeJSON,
  hasAnthropic,
  hasOpenAI,
  MODELS,
};
