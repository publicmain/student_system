/**
 * routes/ai-essay.js — 文书批改接口
 *
 * Fix 11: 支持流式 SSE（Accept: text/event-stream）+ token 记账。
 * 非流式模式保持向后兼容（普通 JSON 响应）。
 */
'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
let aiEssay = null;
try { aiEssay = require('../ai-essay'); } catch(e) {}
let aiStream = null;
try { aiStream = require('../ai-stream'); } catch(e) {}
const { logAiCall, checkRateLimit } = require('../ai-rate-limit');
const { ESSAY_SCHEMA } = aiEssay || {};

module.exports = function({ db, audit, requireAuth, requireRole }) {
  const router = express.Router();

  // POST /api/students/:id/ai-essay/critique
  // body: { essay_text, target_program?, program_type? }
  // Header Accept: text/event-stream → SSE 流式
  router.post('/students/:id/ai-essay/critique', requireRole('principal','counselor','mentor'), async (req, res) => {
    if (!aiEssay) return res.status(503).json({ error: 'AI 文书模块未加载' });
    const u = req.session.user;
    const { id } = req.params;
    const { essay_text, target_program, program_type } = req.body || {};
    if (!essay_text) return res.status(400).json({ error: 'essay_text 必填' });

    // Fix 6: 分层限流
    const rl = checkRateLimit(db, u.id, 'essay_critique');
    if (!rl.ok) return res.status(429).json({ error: `AI 调用频次超限（${rl.tier} 档 ${rl.limit}/hr）`, tier: rl.tier });

    const s = db.get(`SELECT id, name, grade_level, exam_board, target_major, target_countries FROM students WHERE id=?`, [id]);
    if (!s) return res.status(404).json({ error: '学生不存在' });
    let subjects = [];
    try { subjects = db.all(`SELECT sub.code, sub.name, se.level FROM subject_enrollments se JOIN subjects sub ON sub.id=se.subject_id WHERE se.student_id=?`, [id]); } catch(e) {}
    let sittings = [];
    try { sittings = db.all(`SELECT subject, predicted_grade, actual_grade FROM exam_sittings WHERE student_id=?`, [id]); } catch(e) {}

    const onUsage = (usage, tier, model, provider) => {
      logAiCall(db, { userId: u.id, action: 'essay_critique', studentId: id, usage, tier, provider, feature: 'essay_critique' });
    };

    const wantStream = req.headers.accept === 'text/event-stream' && aiStream;

    if (wantStream) {
      // Fix 11: SSE 流式
      const { SYSTEM_PROMPT } = aiEssay._internals || {};
      const userMsg = JSON.stringify({
        program_type: program_type || 'UK-UG',
        target_program: target_program || null,
        student_context: { grade_level: s.grade_level, exam_board: s.exam_board,
          target_major: s.target_major, target_countries: s.target_countries,
          subjects, exam_sittings: sittings },
        essay: `[DATA: ${essay_text}]`,
      }, null, 2);
      audit(req, 'AI_ESSAY_CRITIQUE_STREAM', 'students', id, { program_type });
      await aiStream.streamAIFeature(req, res, {
        tier: 'heavy',
        system: aiEssay._internals?.SYSTEM_PROMPT || '你是资深文书导师，请批改此文书并以 JSON 返回。',
        user: userMsg,
        schema: ESSAY_SCHEMA,
        onUsage,
      });
      return;
    }

    // 非流式（向后兼容）
    try {
      const result = await aiEssay.critiqueEssay({
        essay_text, target_program, program_type,
        student_context: {
          grade_level: s.grade_level, exam_board: s.exam_board,
          target_major: s.target_major, target_countries: s.target_countries,
          subjects: subjects.map(x => ({ code: x.code, name: x.name, level: x.level })),
          exam_sittings: sittings,
        },
        _onUsage: onUsage,
      });
      audit(req, 'AI_ESSAY_CRITIQUE', 'students', id, { program_type, word_count: String(essay_text).split(/\s+/).length });
      res.json(result);
    } catch (e) {
      console.error('[ai-essay]', e);
      res.status(500).json({ error: e.message || 'AI 批改失败' });
    }
  });

  return router;
};
