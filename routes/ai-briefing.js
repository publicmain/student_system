/**
 * routes/ai-briefing.js — 规划师日报
 */
'use strict';
const express = require('express');
let aiBriefing = null;
try { aiBriefing = require('../ai-briefing'); } catch(e) {}

module.exports = function({ db, audit, requireAuth, requireRole }) {
  const router = express.Router();

  // GET /api/ai-briefing/me  — 当前登录规划师的日报
  router.get('/ai-briefing/me', requireAuth, async (req, res) => {
    if (!aiBriefing) return res.status(503).json({ error: 'AI 日报模块未加载' });
    const u = req.session.user;
    if (!u.linked_id) return res.status(400).json({ error: '当前账号未关联 staff 记录，无法生成日报' });
    try {
      const r = await aiBriefing.generateCounselorBriefing(db, u.linked_id, { lookbackHours: 72 });
      res.json(r);
    } catch (e) {
      console.error('[ai-briefing]', e);
      res.status(500).json({ error: e.message || '日报生成失败' });
    }
  });

  // POST /api/ai-briefing/run  — 手动触发全员日报（校长权限）
  router.post('/ai-briefing/run', requireRole('principal'), async (req, res) => {
    if (!aiBriefing) return res.status(503).json({ error: 'AI 日报模块未加载' });
    try {
      const results = await aiBriefing.generateAllBriefings(db);
      audit(req, 'AI_BRIEFING_RUN', 'system', 'daily_briefing', { count: results.length });
      res.json({ ok: true, count: results.length, results });
    } catch (e) {
      console.error('[ai-briefing-run]', e);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
