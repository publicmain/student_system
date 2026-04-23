/**
 * ai-rate-limit.js — AI 调用限流 + 日志工具（供各路由复用）
 */
'use strict';
const { v4: uuidv4 } = require('uuid');
const { calcCost } = require('./ai-client');

// ── 分层限流配置 ──────────────────────────────────────────────
// heavy: plan_gen / essay_critique / eval_enhance (Opus)
// medium: agent_chat / interview_gen / briefing_gen (Sonnet)
// light: nlq / list_score (Haiku)
const RATE_TIERS = {
  heavy:  { actions: ['plan_gen','essay_critique','eval_enhance'], max: parseInt(process.env.AI_RATE_HEAVY  || '5'),  windowMs: parseInt(process.env.AI_CALL_WINDOW_MS || String(60*60*1000)) },
  medium: { actions: ['agent_chat','interview_gen','briefing_gen'], max: parseInt(process.env.AI_RATE_MEDIUM || '15'), windowMs: parseInt(process.env.AI_CALL_WINDOW_MS || String(60*60*1000)) },
  light:  { actions: ['nlq','list_score'],                          max: parseInt(process.env.AI_RATE_LIGHT  || '60'), windowMs: parseInt(process.env.AI_CALL_WINDOW_MS || String(60*60*1000)) },
};

function getTierForAction(action) {
  for (const [tier, cfg] of Object.entries(RATE_TIERS)) {
    if (cfg.actions.includes(action)) return tier;
  }
  return 'medium';
}

function checkRateLimit(db, userId, action) {
  try {
    const tier = getTierForAction(action);
    const cfg = RATE_TIERS[tier];
    const sinceIso = new Date(Date.now() - cfg.windowMs).toISOString();
    const cnt = db.get(
      `SELECT COUNT(*) c FROM ai_call_logs WHERE user_id=? AND tier=? AND created_at >= ?`,
      [userId, tier, sinceIso]
    );
    return { ok: !cnt || cnt.c < cfg.max, tier, limit: cfg.max, current: cnt?.c || 0 };
  } catch(e) {
    return { ok: true, tier: 'medium', limit: 15, current: 0 };
  }
}

function logAiCall(db, { userId, action, studentId, usage, tier, provider, feature }) {
  try {
    const inputTok    = usage?.input_tokens  || usage?.prompt_tokens    || 0;
    const outputTok   = usage?.output_tokens || usage?.completion_tokens || 0;
    const cacheCreate = usage?.cache_creation_input_tokens || 0;
    const cacheRead   = usage?.cache_read_input_tokens     || 0;
    const costUsd = calcCost(usage, tier, provider);
    db.run(
      `INSERT INTO ai_call_logs
         (id, user_id, action, student_id, tokens_used,
          input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
          cost_usd, tier, feature, provider, created_at)
       VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?,?,datetime('now'))`,
      [uuidv4(), userId, action, studentId || null, inputTok + outputTok,
       inputTok, outputTok, cacheCreate, cacheRead,
       costUsd, tier || getTierForAction(action), feature || action, provider || 'anthropic']
    );
  } catch(e) {
    console.error('[ai-rate-limit] logAiCall failed:', e.message);
  }
}

module.exports = { checkRateLimit, logAiCall, getTierForAction, RATE_TIERS };
