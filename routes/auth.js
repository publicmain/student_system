/**
 * routes/auth.js — 认证路由（登录/登出/会话/密码修改）
 */
const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = function({ db, uuidv4, audit, requireAuth, loginAttempts, pwdChangeAttempts, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS, PWD_CHANGE_MAX, BCRYPT_COST }) {
  const router = express.Router();

  // POST /api/auth/login
  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    const ip = req.ip;
    const now = Date.now();
    const record = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    if (now > record.resetAt) { record.count = 0; record.resetAt = now + LOGIN_WINDOW_MS; }
    if (record.count >= LOGIN_MAX_ATTEMPTS) {
      const wait = Math.ceil((record.resetAt - now) / 1000);
      return res.status(429).json({ error: `登录尝试过于频繁，请 ${wait} 秒后再试` });
    }
    const user = db.get('SELECT * FROM users WHERE username=?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      record.count++;
      loginAttempts.set(ip, record);
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    loginAttempts.delete(ip);
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: '会话初始化失败' });
      req.session.user = { id: user.id, username: user.username, role: user.role, linked_id: user.linked_id, name: user.name };
      req.session.save((err2) => {
        if (err2) return res.status(500).json({ error: '会话保存失败' });
        audit(req, 'LOGIN', 'users', user.id, null);
        res.json({ user: req.session.user, must_change_password: user.must_change_password === 1 });
      });
    });
  });

  // POST /api/auth/logout
  router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
  });

  // GET /api/auth/me
  router.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '未登录' });
    res.json({ user: req.session.user });
  });

  // PUT /api/auth/password
  router.put('/password', requireAuth, (req, res) => {
    const userId = req.session.user.id;
    const now = Date.now();
    const pr = pwdChangeAttempts.get(userId) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    if (now > pr.resetAt) { pr.count = 0; pr.resetAt = now + LOGIN_WINDOW_MS; }
    if (pr.count >= PWD_CHANGE_MAX) {
      return res.status(429).json({ error: `密码修改失败次数过多，请 ${Math.ceil((pr.resetAt - now) / 60000)} 分钟后重试` });
    }
    const { old_password, new_password } = req.body;
    const _pwdMin = (() => { try { const r = db.exec("SELECT value FROM settings WHERE key='password_min_length'"); return r.length ? parseInt(r[0].values[0][0]) : 6; } catch(e) { return 6; } })();
    const _pwdMax = (() => { try { const r = db.exec("SELECT value FROM settings WHERE key='password_max_length'"); return r.length ? parseInt(r[0].values[0][0]) : 128; } catch(e) { return 128; } })();
    if (!new_password || new_password.length < _pwdMin || new_password.length > _pwdMax) {
      return res.status(400).json({ error: `新密码长度须在 ${_pwdMin}-${_pwdMax} 位之间` });
    }
    const user = db.get('SELECT * FROM users WHERE id=?', [userId]);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (!bcrypt.compareSync(old_password, user.password)) {
      pr.count++;
      pwdChangeAttempts.set(userId, pr);
      return res.status(400).json({ error: `原密码错误（剩余尝试次数：${PWD_CHANGE_MAX - pr.count}）` });
    }
    pwdChangeAttempts.delete(userId);
    db.run('UPDATE users SET password=?,must_change_password=0 WHERE id=?', [bcrypt.hashSync(new_password, BCRYPT_COST), user.id]);
    // 注销该用户所有 session
    try {
      const allSessions = db.all('SELECT sid, sess FROM sessions');
      for (const s of allSessions) {
        try { const d = JSON.parse(s.sess); if (d.user?.id === user.id) db.run('DELETE FROM sessions WHERE sid=?', [s.sid]); } catch(e) {}
      }
    } catch(e) {}
    res.json({ ok: true, message: '密码已修改，请重新登录' });
  });

  return router;
};
