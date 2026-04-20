/**
 * routes/ai-interview.js — 牛剑 / A-Level 面试题生成
 */
'use strict';
const express = require('express');
let aiInterview = null;
try { aiInterview = require('../ai-interview'); } catch(e) {}

module.exports = function({ db, audit, requireAuth, requireRole }) {
  const router = express.Router();

  // POST /api/students/:id/ai-interview/generate
  // body: { target_program (required), university? }
  router.post('/students/:id/ai-interview/generate', requireRole('principal','counselor','mentor'), async (req, res) => {
    if (!aiInterview) return res.status(503).json({ error: 'AI 面试模块未加载' });
    const { id } = req.params;
    const { target_program, university } = req.body || {};
    if (!target_program) return res.status(400).json({ error: 'target_program 必填' });

    try {
      const s = db.get(`SELECT id, name, grade_level, exam_board, target_major, target_countries FROM students WHERE id=?`, [id]);
      if (!s) return res.status(404).json({ error: '学生不存在' });
      let subjects = [];
      try { subjects = db.all(`SELECT sub.code, sub.name, se.level FROM subject_enrollments se JOIN subjects sub ON sub.id=se.subject_id WHERE se.student_id=?`, [id]); } catch(e) {}
      let sittings = [];
      try { sittings = db.all(`SELECT subject, predicted_grade, actual_grade FROM exam_sittings WHERE student_id=?`, [id]); } catch(e) {}
      let activities = [];
      try { activities = db.all(`SELECT title, activity_type, description FROM student_activities WHERE student_id=? LIMIT 8`, [id]); } catch(e) {}

      const result = await aiInterview.generateInterviewQuestions({
        target_program, university,
        student_snapshot: {
          grade_level: s.grade_level, exam_board: s.exam_board,
          target_major: s.target_major, target_countries: s.target_countries,
          subjects, exam_sittings: sittings, activities,
        }
      });

      try { db.run(`INSERT INTO ai_call_logs (id, user_id, action, student_id, tokens_used, created_at) VALUES (?,?,?,?,?,datetime('now'))`,
        [require('uuid').v4(), req.session.user.id, 'interview_gen', id, 0]); } catch(e) {}

      audit(req, 'AI_INTERVIEW_GEN', 'students', id, { target_program, university });
      res.json(result);
    } catch (e) {
      console.error('[ai-interview]', e);
      res.status(500).json({ error: e.message || '生成面试题失败' });
    }
  });

  return router;
};
