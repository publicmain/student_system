/**
 * routes/ai-essay.js — 文书批改接口
 */
'use strict';
const express = require('express');
let aiEssay = null;
try { aiEssay = require('../ai-essay'); } catch(e) {}

module.exports = function({ db, audit, requireAuth, requireRole }) {
  const router = express.Router();

  // POST /api/students/:id/ai-essay/critique
  // body: { essay_text, target_program?, program_type? }
  router.post('/students/:id/ai-essay/critique', requireRole('principal','counselor','mentor'), async (req, res) => {
    if (!aiEssay) return res.status(503).json({ error: 'AI 文书模块未加载' });
    const { id } = req.params;
    const { essay_text, target_program, program_type } = req.body || {};
    if (!essay_text) return res.status(400).json({ error: 'essay_text 必填' });

    // 速率限制（复用 ai_call_logs）
    try {
      const u = req.session.user;
      const winMs = parseInt(process.env.AI_CALL_WINDOW_MS || (60*60*1000));
      const maxCalls = parseInt(process.env.AI_CALL_MAX || '10');
      const sinceIso = new Date(Date.now() - winMs).toISOString();
      const cnt = db.get(`SELECT COUNT(*) c FROM ai_call_logs WHERE user_id=? AND created_at >= ?`, [u.id, sinceIso]);
      if (cnt && cnt.c >= maxCalls) return res.status(429).json({ error: 'AI 调用频次超限，请稍后再试' });
    } catch(e) {}

    try {
      // 收集学生学术上下文，提升批改准确度
      const s = db.get(`SELECT id, name, grade_level, exam_board, target_major, target_countries FROM students WHERE id=?`, [id]);
      if (!s) return res.status(404).json({ error: '学生不存在' });
      let subjects = [];
      try { subjects = db.all(`SELECT sub.code, sub.name, se.level FROM subject_enrollments se JOIN subjects sub ON sub.id=se.subject_id WHERE se.student_id=?`, [id]); } catch(e) {}
      let sittings = [];
      try { sittings = db.all(`SELECT subject, predicted_grade, actual_grade FROM exam_sittings WHERE student_id=?`, [id]); } catch(e) {}

      const result = await aiEssay.critiqueEssay({
        essay_text,
        target_program,
        program_type,
        student_context: {
          grade_level: s.grade_level, exam_board: s.exam_board,
          target_major: s.target_major, target_countries: s.target_countries,
          subjects: subjects.map(x => ({ code: x.code, name: x.name, level: x.level })),
          exam_sittings: sittings,
        },
      });

      try { db.run(`INSERT INTO ai_call_logs (id, user_id, action, student_id, tokens_used, created_at) VALUES (?,?,?,?,?,datetime('now'))`,
        [require('uuid').v4(), req.session.user.id, 'essay_critique', id, 0]); } catch(e) {}

      audit(req, 'AI_ESSAY_CRITIQUE', 'students', id, { program_type, word_count: String(essay_text).split(/\s+/).length });
      res.json(result);
    } catch (e) {
      console.error('[ai-essay]', e);
      res.status(500).json({ error: e.message || 'AI 批改失败' });
    }
  });

  return router;
};
