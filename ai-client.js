/**
 * ai-client.js — 统一 LLM 客户端
 *
 * 优先使用 Anthropic Claude（Opus 4.7 / Sonnet 4.6 / Haiku 4.5 分级 +
 * 自动 prompt caching + 流式输出 + tool_use 结构化输出）；
 * 未配置 ANTHROPIC_API_KEY 时回退到 OpenAI。
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

// ── 成本估算（每 token，基于 Anthropic 2025 定价） ──────────
// heavy  = Opus 4.x   medium = Sonnet 4.x   light = Haiku 4.5
const COST_TABLE = {
  heavy:  { input: 15e-6, output: 75e-6,  cache_write: 18.75e-6, cache_read: 1.875e-6 },
  medium: { input: 3e-6,  output: 15e-6,  cache_write: 3.75e-6,  cache_read: 0.3e-6   },
  light:  { input: 0.8e-6, output: 4e-6,  cache_write: 1e-6,     cache_read: 0.08e-6  },
};
// OpenAI gpt-4o 近似定价
const OPENAI_COST = { input: 2.5e-6, output: 10e-6 };

function calcCost(usage, tier, provider) {
  if (!usage) return 0;
  if (provider === 'openai') {
    return (usage.prompt_tokens || 0) * OPENAI_COST.input
         + (usage.completion_tokens || 0) * OPENAI_COST.output;
  }
  const t = COST_TABLE[tier] || COST_TABLE.medium;
  return (usage.input_tokens || 0) * t.input
       + (usage.output_tokens || 0) * t.output
       + (usage.cache_creation_input_tokens || 0) * t.cache_write
       + (usage.cache_read_input_tokens || 0) * t.cache_read;
}

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
 * @param {string|Array} opts.user  用户消息（字符串或 messages 数组）
 * @param {number} [opts.maxTokens=16000]
 * @param {boolean}[opts.stream=false]  大输出建议开（避免 HTTP 超时）
 * @param {function}[opts.onUsage]  (usage, tier, model, provider) => void
 * @returns {Promise<{text:string, usage:object, provider:string, model:string}>}
 */
/**
 * Normalize the `system` param to an Anthropic system-block array.
 * Accepts: string | string[] | Anthropic block object[] (passthrough)
 */
function buildSystemBlocks(system) {
  if (!system) return [];
  if (Array.isArray(system)) {
    // Already an array of block objects or strings
    return system.map(s =>
      typeof s === 'string'
        ? { type: 'text', text: s, cache_control: { type: 'ephemeral' } }
        : s
    );
  }
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
}

async function callClaude({ tier = 'medium', system, user, maxTokens = 16000, stream = false, onUsage }) {
  const ant = getAnthropic();
  if (ant) {
    const model = MODELS[tier] || MODELS.medium;
    const messages = Array.isArray(user)
      ? user
      : [{ role: 'user', content: user }];
    const params = {
      model, max_tokens: maxTokens,
      system: buildSystemBlocks(system),
      messages,
    };
    let msg;
    if (stream) {
      const s = await ant.messages.stream(params);
      msg = await s.finalMessage();
    } else {
      msg = await ant.messages.create(params);
    }
    const result = normalizeAnthropic(msg, tier);
    if (onUsage) onUsage(result.usage, tier, result.model, 'anthropic');
    return result;
  }
  // OpenAI 回退
  const oa = getOpenAI();
  if (!oa) throw new Error('未配置 ANTHROPIC_API_KEY 或 OPENAI_API_KEY');
  // 把 Anthropic block 数组转成纯文本（OpenAI 不理解 block 格式）
  const systemText = Array.isArray(system)
    ? system.map(b => (typeof b === 'string' ? b : b.text || '')).join('\n\n')
    : (system || '');
  const msgs = Array.isArray(user)
    ? [{ role: 'system', content: systemText }, ...user]
    : [{ role: 'system', content: systemText }, { role: 'user', content: user }];
  const rsp = await oa.chat.completions.create({
    model: OPENAI_FALLBACK, temperature: 0.3, max_tokens: maxTokens,
    messages: msgs,
  });
  const usage = rsp.usage || null;
  const result = {
    text: rsp.choices[0]?.message?.content || '',
    usage, provider: 'openai', model: OPENAI_FALLBACK,
  };
  if (onUsage) onUsage(usage, tier, OPENAI_FALLBACK, 'openai');
  return result;
}

function normalizeAnthropic(msg, tier) {
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const usage = msg.usage ? {
    input_tokens:                  msg.usage.input_tokens || 0,
    output_tokens:                 msg.usage.output_tokens || 0,
    cache_creation_input_tokens:   msg.usage.cache_creation_input_tokens || 0,
    cache_read_input_tokens:       msg.usage.cache_read_input_tokens || 0,
  } : null;
  return { text, usage, provider: 'anthropic', model: msg.model, tier };
}

/**
 * 结构化 JSON 输出。
 *
 * Anthropic: 使用 tool_use 模式（比 "请输出JSON" 更可靠）。
 *   定义 return_output tool，input_schema = schema，tool_choice 强制调用。
 * OpenAI: 继续使用 strict JSON schema（已经很可靠）。
 *
 * 保留 _fallbackText 选项用于无 schema 时的旧式 JSON 提取。
 *
 * @param {object} opts
 * @param {function}[opts.onUsage]  (usage, tier, model, provider) => void
 * @returns {Promise<object>}
 */
async function callClaudeJSON({ tier = 'medium', system, user, schema, maxTokens = 16000, stream = false, onUsage }) {
  const ant = getAnthropic();
  if (ant) {
    const model = MODELS[tier] || MODELS.medium;
    const messages = Array.isArray(user) ? user : [{ role: 'user', content: user }];

    if (schema) {
      // tool_use 模式：Anthropic 把 tool input 直接解析为 JSON，无需手动 parseJSON
      const params = {
        model, max_tokens: maxTokens,
        system: buildSystemBlocks(system),
        messages,
        tools: [{ name: 'return_output', description: '返回结构化输出', input_schema: schema }],
        tool_choice: { type: 'tool', name: 'return_output' },
      };
      let msg;
      if (stream) {
        const s = await ant.messages.stream(params);
        msg = await s.finalMessage();
      } else {
        msg = await ant.messages.create(params);
      }
      const usage = msg.usage ? {
        input_tokens:                msg.usage.input_tokens || 0,
        output_tokens:               msg.usage.output_tokens || 0,
        cache_creation_input_tokens: msg.usage.cache_creation_input_tokens || 0,
        cache_read_input_tokens:     msg.usage.cache_read_input_tokens || 0,
      } : null;
      if (onUsage) onUsage(usage, tier, msg.model, 'anthropic');
      const toolBlock = (msg.content || []).find(b => b.type === 'tool_use');
      if (!toolBlock) throw new Error('AI 未调用 return_output tool，输出不符合预期');
      return toolBlock.input;
    }

    // 无 schema 时退回文本 + lenient parse
    const jsonSystem = system + `\n\n====\n输出规则：只输出一段完整合法 JSON，不加 markdown 围栏，不加前后文。`;
    const { text, usage, model: mdl } = await callClaude({ tier, system: jsonSystem, user: messages, maxTokens, stream, onUsage });
    return parseJSONLenient(text);
  }

  // OpenAI 回退 — structured output（更可靠）
  const oa = getOpenAI();
  if (!oa) throw new Error('未配置 AI Key');
  const _sysText = Array.isArray(system)
    ? system.map(b => (typeof b === 'string' ? b : b.text || '')).join('\n\n')
    : (system || '');
  const sysMsgs = Array.isArray(user)
    ? [{ role: 'system', content: _sysText }, ...user]
    : [{ role: 'system', content: _sysText }, { role: 'user', content: user }];
  const rsp = await oa.chat.completions.create({
    model: OPENAI_FALLBACK, temperature: 0.3, max_tokens: maxTokens,
    messages: sysMsgs,
    ...(schema
      ? { response_format: { type: 'json_schema', json_schema: { name: 'output', strict: true, schema } } }
      : { response_format: { type: 'json_object' } }),
  });
  const raw = rsp.choices[0]?.message?.content || '';
  const usage = rsp.usage || null;
  if (onUsage) onUsage(usage, tier, OPENAI_FALLBACK, 'openai');
  return parseJSONLenient(raw);
}

function parseJSONLenient(text) {
  let s = (text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
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
  calcCost,
};
