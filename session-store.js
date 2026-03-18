/**
 * session-store.js — 基于项目自身 sql.js 的持久化 Session 存储
 * 复用 db.js 中已初始化的 sql.js 实例，避免依赖 better-sqlite3 原生模块
 */
const session = require('express-session');

class SQLiteSessionStore extends session.Store {
  constructor() {
    super();
    this._db = null;
    this._ready = false;

    // 每 15 分钟清理一次过期 session
    this._interval = setInterval(() => {
      if (this._ready) {
        try { this._db.run('DELETE FROM sessions WHERE expired < ?', [Date.now()]); } catch(e) {}
      }
    }, 15 * 60 * 1000).unref();
  }

  // 由 server.js 在 db.init() 完成后调用，传入 db 模块本身
  setDb(dbModule) {
    this._db = dbModule;
    this._db.run(`CREATE TABLE IF NOT EXISTS sessions (
      sid     TEXT PRIMARY KEY,
      sess    TEXT NOT NULL,
      expired INTEGER NOT NULL
    )`);
    this._ready = true;
  }

  get(sid, callback) {
    if (!this._ready) return callback(null, null);
    try {
      const row = this._db.get('SELECT sess, expired FROM sessions WHERE sid=?', [sid]);
      if (!row || row.expired < Date.now()) return callback(null, null);
      callback(null, JSON.parse(row.sess));
    } catch(e) { callback(e); }
  }

  set(sid, sessionData, callback) {
    if (!this._ready) { if (callback) callback(null); return; }
    try {
      const maxAge = sessionData.cookie?.maxAge || (8 * 60 * 60 * 1000);
      const expired = Date.now() + maxAge;
      this._db.run(
        'INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)',
        [sid, JSON.stringify(sessionData), expired]
      );
      if (callback) callback(null);
    } catch(e) { if (callback) callback(e); }
  }

  destroy(sid, callback) {
    if (!this._ready) { if (callback) callback(null); return; }
    try {
      this._db.run('DELETE FROM sessions WHERE sid=?', [sid]);
      if (callback) callback(null);
    } catch(e) { if (callback) callback(e); }
  }

  touch(sid, sessionData, callback) {
    if (!this._ready) { if (callback) callback(null); return; }
    try {
      const maxAge = sessionData.cookie?.maxAge || (8 * 60 * 60 * 1000);
      const expired = Date.now() + maxAge;
      this._db.run('UPDATE sessions SET expired=? WHERE sid=?', [expired, sid]);
      if (callback) callback(null);
    } catch(e) { if (callback) callback(e); }
  }

  close() {
    clearInterval(this._interval);
  }
}

module.exports = SQLiteSessionStore;
