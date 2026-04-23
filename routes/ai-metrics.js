/**
 * routes/ai-metrics.js — AI 用量 / 成本 / 缓存命中率监控
 *
 *   GET /api/ai/metrics/cache-hit-rate   (仅 admin/principal 可见)
 *   GET /api/ai/metrics/cost-summary     (仅 admin/principal 可见)
 */
'use strict';
const express = require('express');

module.exports = function({ db, requireAuth, requireRole }) {
  const router = express.Router();

  /**
   * Fix 7: 近 7 天每个 feature 的 prompt cache 命中率。
   * cache_hit_rate = cache_read_tokens / (input_tokens + cache_read_tokens)
   */
  router.get('/ai/metrics/cache-hit-rate', requireAuth, requireRole('principal'), (req, res) => {
    const days = parseInt(req.query.days || '7');
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    try {
      const rows = db.all(`
        SELECT
          feature,
          COUNT(*) AS calls,
          SUM(input_tokens)          AS total_input,
          SUM(output_tokens)         AS total_output,
          SUM(cache_creation_tokens) AS total_cache_write,
          SUM(cache_read_tokens)     AS total_cache_read,
          SUM(cost_usd)              AS total_cost_usd,
          ROUND(
            CASE WHEN SUM(input_tokens) + SUM(cache_read_tokens) > 0
              THEN 100.0 * SUM(cache_read_tokens) / (SUM(input_tokens) + SUM(cache_read_tokens))
              ELSE 0
            END, 1
          ) AS cache_hit_rate_pct
        FROM ai_call_logs
        WHERE created_at >= ? AND provider = 'anthropic'
        GROUP BY feature
        ORDER BY total_cost_usd DESC
      `, [since]);

      const totals = db.get(`
        SELECT
          COUNT(*) AS calls,
          SUM(cost_usd) AS total_cost_usd,
          SUM(cache_read_tokens) AS total_cache_read,
          SUM(input_tokens) AS total_input
        FROM ai_call_logs WHERE created_at >= ?
      `, [since]);

      res.json({
        period_days: days,
        since,
        by_feature: rows,
        totals: {
          calls: totals?.calls || 0,
          total_cost_usd: +(totals?.total_cost_usd || 0).toFixed(4),
          overall_cache_hit_rate_pct: totals && (totals.total_input + totals.total_cache_read) > 0
            ? +((100 * totals.total_cache_read / (totals.total_input + totals.total_cache_read)).toFixed(1))
            : 0,
        },
      });
    } catch(e) {
      console.error('[ai-metrics]', e);
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/ai/metrics/cost-summary', requireAuth, requireRole('principal'), (req, res) => {
    const days = parseInt(req.query.days || '30');
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    try {
      const byTier = db.all(`
        SELECT tier, COUNT(*) calls, SUM(cost_usd) cost_usd,
               SUM(input_tokens) input_tok, SUM(output_tokens) output_tok
        FROM ai_call_logs WHERE created_at >= ?
        GROUP BY tier ORDER BY cost_usd DESC
      `, [since]);
      const byUser = db.all(`
        SELECT acl.user_id, u.name, u.role,
               COUNT(*) calls, ROUND(SUM(acl.cost_usd),4) cost_usd
        FROM ai_call_logs acl LEFT JOIN users u ON u.id=acl.user_id
        WHERE acl.created_at >= ?
        GROUP BY acl.user_id ORDER BY cost_usd DESC LIMIT 20
      `, [since]);
      res.json({ period_days: days, by_tier: byTier, top_users: byUser });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
