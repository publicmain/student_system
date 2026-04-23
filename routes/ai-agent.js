/**
 * routes/ai-agent.js — 学生 AI 助手接口
 *
 *   GET    /api/students/:id/agent/sessions          列出该学生我相关的会话
 *   POST   /api/students/:id/agent/sessions          新建会话（可空）
 *   GET    /api/students/:id/agent/sessions/:sid     获取会话详情（含历史消息）
 *   DELETE /api/students/:id/agent/sessions/:sid     删除会话
 *   POST   /api/students/:id/agent/chat              SSE 流式对话
 *
 *   鉴权：
 *     principal/counselor/mentor/intake_staff — 可访问任何学生
 *     parent — 只能访问其子女（student_parents 绑定）
 *     student — 只能访问自己（users.linked_id === student.id）
 */
'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { checkRateLimit, logAiCall, getTierForAction } = require('../ai-rate-limit');
let aiAgent = null;
try { aiAgent = require('../ai-agent'); } catch(e) {}

module.exports = function({ db, audit, requireAuth, requireRole }) {
  const router = express.Router();

  // ── 访问校验 ──────────────────────────────────────────
  function canAccess(user, studentId) {
    if (['principal','counselor','mentor','intake_staff'].includes(user.role)) return true;
    if (user.role === 'parent') {
      const ok = db.get('SELECT 1 AS ok FROM student_parents WHERE student_id=? AND parent_id=?', [studentId, user.linked_id]);
      return !!ok;
    }
    if (user.role === 'student') return user.linked_id === studentId;
    return false;
  }

  function requireAccess(req, res, next) {
    const u = req.session.user;
    if (!u) return res.status(401).json({ error: '未登录' });
    const studentId = req.params.id;
    if (!canAccess(u, studentId)) return res.status(403).json({ error: '无权访问该学生' });
    next();
  }

  // ── 会话 CRUD ──────────────────────────────────────────
  router.get('/students/:id/agent/sessions', requireAuth, requireAccess, (req, res) => {
    const u = req.session.user;
    const rows = db.all(`
      SELECT id, title, last_active_at, created_at
      FROM ai_agent_sessions
      WHERE student_id=? AND user_id=?
      ORDER BY last_active_at DESC LIMIT 50`, [req.params.id, u.id]);
    res.json(rows);
  });

  router.post('/students/:id/agent/sessions', requireAuth, requireAccess, (req, res) => {
    const u = req.session.user;
    const id = uuidv4();
    const title = (req.body?.title || '新对话').slice(0, 80);
    db.run(`INSERT INTO ai_agent_sessions (id, student_id, user_id, title) VALUES (?, ?, ?, ?)`,
      [id, req.params.id, u.id, title]);
    res.json({ id, title });
  });

  router.get('/students/:id/agent/sessions/:sid', requireAuth, requireAccess, (req, res) => {
    const u = req.session.user;
    const sess = db.get(`SELECT * FROM ai_agent_sessions WHERE id=? AND student_id=? AND user_id=?`,
      [req.params.sid, req.params.id, u.id]);
    if (!sess) return res.status(404).json({ error: '会话不存在或无权访问' });
    const messages = db.all(`SELECT role, content_json, created_at FROM ai_agent_messages WHERE session_id=? ORDER BY created_at ASC`, [req.params.sid]);
    const decoded = messages.map(m => {
      let content;
      try { content = JSON.parse(m.content_json); } catch(e) { content = m.content_json; }
      return { role: m.role, content, created_at: m.created_at };
    });
    res.json({ session: sess, messages: decoded });
  });

  router.delete('/students/:id/agent/sessions/:sid', requireAuth, requireAccess, (req, res) => {
    const u = req.session.user;
    const sess = db.get(`SELECT id FROM ai_agent_sessions WHERE id=? AND student_id=? AND user_id=?`,
      [req.params.sid, req.params.id, u.id]);
    if (!sess) return res.status(404).json({ error: '会话不存在' });
    db.run(`DELETE FROM ai_agent_messages WHERE session_id=?`, [req.params.sid]);
    db.run(`DELETE FROM ai_agent_sessions WHERE id=?`, [req.params.sid]);
    audit(req, 'DELETE', 'ai_agent_sessions', req.params.sid, {});
    res.json({ ok: true });
  });

  // ── 聊天（SSE） ──────────────────────────────────────
  router.post('/students/:id/agent/chat', requireAuth, requireAccess, async (req, res) => {
    if (!aiAgent) {
      console.error('[ai-agent/chat] 503: AI Agent 模块未加载 (ai-agent.js require failed)');
      return res.status(503).json({ error: 'AI Agent 模块未加载' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[ai-agent/chat] 503: 未配置 ANTHROPIC_API_KEY (env var missing)');
      return res.status(503).json({ error: '未配置 ANTHROPIC_API_KEY' });
    }

    const u = req.session.user;
    const studentId = req.params.id;
    const { session_id, message } = req.body || {};
    if (!message || !String(message).trim()) return res.status(400).json({ error: '消息不能为空' });

    // Fix 5: 消息长度上限 8000 字符
    if (String(message).length > 8000) return res.status(413).json({ error: '消息过长，单条消息不得超过 8000 字符' });

    // Fix 6: 分层限流
    const rl = checkRateLimit(db, u.id, 'agent_chat');
    if (!rl.ok) {
      return res.status(429).json({
        error: `AI 调用频次超限（${rl.tier} 档 ${rl.limit}/hr），请稍后再试`,
        tier: rl.tier, limit: rl.limit, current: rl.current,
      });
    }

    // 获取/创建会话
    let sess = null;
    if (session_id) {
      sess = db.get(`SELECT * FROM ai_agent_sessions WHERE id=? AND student_id=? AND user_id=?`, [session_id, studentId, u.id]);
      if (!sess) return res.status(404).json({ error: '会话不存在' });
    } else {
      const id = uuidv4();
      const title = String(message).slice(0, 80);
      db.run(`INSERT INTO ai_agent_sessions (id, student_id, user_id, title) VALUES (?, ?, ?, ?)`, [id, studentId, u.id, title]);
      sess = { id, student_id: studentId, user_id: u.id, title };
    }

    // 历史
    const historyRows = db.all(`SELECT role, content_json FROM ai_agent_messages WHERE session_id=? ORDER BY created_at ASC`, [sess.id]);
    const history = historyRows.map(r => {
      let content;
      try { content = JSON.parse(r.content_json); } catch(e) { content = r.content_json; }
      return { role: r.role, content };
    });
    const MAX_HIST = 40;
    const trimmedHistory = history.length > MAX_HIST ? history.slice(-MAX_HIST) : history;

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sessionIdHeader = `data: ${JSON.stringify({ type: 'session', id: sess.id, title: sess.title })}\n\n`;
    res.write(sessionIdHeader);

    const heartbeat = setInterval(() => { try { res.write(`: hb ${Date.now()}\n\n`); } catch(e) {} }, 30000);

    let aborted = false;
    res.on('close', () => { aborted = true; clearInterval(heartbeat); });

    const emit = (ev) => {
      if (aborted) return;
      try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch(e) {}
    };

    try {
      console.log(`[ai-agent/chat] ▶ 开始 runAgent session=${sess.id} user=${u.id} student=${studentId} history=${trimmedHistory.length} msg=${String(message).slice(0,60)}`);
      const _t0 = Date.now();
      const result = await aiAgent.runAgent({
        db, user: u, studentId,
        history: trimmedHistory,
        userMessage: String(message),
        emit, audit, req,
      });
      console.log(`[ai-agent/chat] ◀ runAgent 完成 耗时=${Date.now()-_t0}ms appended=${result.messagesAppended?.length}`);

      // 持久化追加的消息
      for (const m of result.messagesAppended) {
        const mid = uuidv4();
        try {
          db.run(`INSERT INTO ai_agent_messages (id, session_id, role, content_json) VALUES (?, ?, ?, ?)`,
            [mid, sess.id, m.role, JSON.stringify(m.content)]);
        } catch(e) { console.error('[ai-agent] persist message failed:', e.message); }
      }
      db.run(`UPDATE ai_agent_sessions SET last_active_at=datetime('now') WHERE id=?`, [sess.id]);

      // Fix 1: 记录真实 token + 成本
      const usage = result.usage || null;
      logAiCall(db, {
        userId: u.id,
        action: 'agent_chat',
        studentId,
        usage,
        tier: 'medium',
        provider: usage ? 'anthropic' : 'unknown',
        feature: 'agent_chat',
      });

      console.log(`[ai-agent/chat] 准备 emit end aborted=${aborted}`);
      emit({ type: 'end', session_id: sess.id });
      console.log(`[ai-agent/chat] emit end 完成`);
    } catch (e) {
      console.error('[ai-agent/chat]', e);
      emit({ type: 'error', message: e.message || 'Agent 运行失败' });
    } finally {
      clearInterval(heartbeat);
      try { res.end(); } catch(e) {}
    }
  });

  return router;
};
