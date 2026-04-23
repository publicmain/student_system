/**
 * ai-stream.js — 流式 AI 功能工具
 *
 * Fix 11: 抽取 SSE 流式包装，供 planner/essay/interview 路由复用。
 * 前端按 token 逐字渲染（text_delta 事件），结束后 complete 事件带完整 JSON。
 *
 * 非流式调用保留向后兼容（调用方未设 Accept: text/event-stream 时走普通 JSON 响应）。
 */
'use strict';
let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk'); } catch(e) {}
const { calcCost, MODELS, hasAnthropic } = require('./ai-client');

/**
 * 流式调用 AI 并通过 SSE 推事件。
 *
 * @param {object} req  Express request
 * @param {object} res  Express response
 * @param {object} options
 * @param {string}   options.tier         'heavy'|'medium'|'light'
 * @param {string|Array} options.system   系统提示词（字符串或 block 数组）
 * @param {string}   options.user         用户消息
 * @param {object}   options.schema       JSON schema（用于 tool_use 最终解析）
 * @param {number}   [options.maxTokens]
 * @param {function} [options.onUsage]    (usage) => void
 * @returns {Promise<void>}  发送完毕后 resolve
 */
async function streamAIFeature(req, res, options) {
  const { tier = 'medium', system, user, schema, maxTokens = 16000, onUsage } = options;

  if (!hasAnthropic()) {
    res.status(503).json({ error: '未配置 ANTHROPIC_API_KEY，流式模式仅支持 Anthropic' });
    return;
  }
  const ant = Anthropic ? new (require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk'))() : null;
  if (!ant) { res.status(503).json({ error: 'Anthropic SDK 未加载' }); return; }

  // SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const heartbeat = setInterval(() => { try { res.write(`: hb\n\n`); } catch(e) {} }, 25000);
  let aborted = false;
  res.on('close', () => { aborted = true; clearInterval(heartbeat); });

  const emit = (ev) => {
    if (aborted) return;
    try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch(e) {}
  };

  try {
    const model = MODELS[tier] || MODELS.medium;

    // 构建 system blocks
    const systemBlocks = Array.isArray(system)
      ? system.map(s => typeof s === 'string' ? { type: 'text', text: s, cache_control: { type: 'ephemeral' } } : s)
      : [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];

    // 如果有 schema，使用 tool_use 确保结构化；否则纯文本
    const params = {
      model,
      max_tokens: maxTokens,
      system: systemBlocks,
      messages: [{ role: 'user', content: user }],
      ...(schema ? {
        tools: [{ name: 'return_output', description: '返回结构化输出', input_schema: schema }],
        tool_choice: { type: 'tool', name: 'return_output' },
      } : {}),
    };

    const stream = ant.messages.stream(params);

    let accumText = '';
    let accumInputJson = '';

    for await (const event of stream) {
      if (aborted) break;
      if (event.type === 'content_block_delta') {
        if (event.delta?.type === 'text_delta') {
          accumText += event.delta.text;
          emit({ type: 'text_delta', text: event.delta.text });
        } else if (event.delta?.type === 'input_json_delta') {
          // tool_use 模式：把 JSON delta 也当 text_delta 推给前端（前端可选渲染进度）
          accumInputJson += event.delta.partial_json || '';
        }
      }
    }

    const finalMsg = await stream.finalMessage();
    const usage = finalMsg.usage ? {
      input_tokens:                finalMsg.usage.input_tokens || 0,
      output_tokens:               finalMsg.usage.output_tokens || 0,
      cache_creation_input_tokens: finalMsg.usage.cache_creation_input_tokens || 0,
      cache_read_input_tokens:     finalMsg.usage.cache_read_input_tokens || 0,
    } : null;

    if (onUsage && usage) onUsage(usage, tier, finalMsg.model, 'anthropic');

    // 解析最终结果
    let result = null;
    if (schema) {
      const toolBlock = (finalMsg.content || []).find(b => b.type === 'tool_use');
      if (toolBlock) result = toolBlock.input;
    } else {
      result = accumText || (finalMsg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    }

    emit({ type: 'complete', result });
  } catch(e) {
    console.error('[ai-stream] 流式失败:', e.message);
    emit({ type: 'error', message: e.message });
  } finally {
    clearInterval(heartbeat);
    try { res.end(); } catch(e) {}
  }
}

module.exports = { streamAIFeature };
