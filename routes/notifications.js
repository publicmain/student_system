/**
 * routes/notifications.js — 通知、升级策略、审计日志与合规导出
 *
 * S1修复: is_read 改为 per-user 跟踪（notification_reads 表）
 * S2修复: 统一去重逻辑（共享 _generateNotifications 函数）
 * S3修复: 任务/申请状态变更时自动清理过期通知
 * S4修复: 清理 orphan 通知
 * S5修复: 新增 /notifications/count 轻量端点
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole }) {
  const router = express.Router();

  function _getSettingRaw(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? r[0].values[0][0] : fallback; } catch(e) { return fallback; }
  }

  // ── 构建角色过滤 WHERE 子句 ──
  // N13修复: principal 作为超级管理员可看到所有通知
  function _buildNotifWhere(u) {
    let where = [];
    let params = [];
    if (u.role === 'principal') {
      // 校长看到所有通知（超管全局可见）
      where.push('1=1');
    } else if (u.role === 'student') {
      where.push('n.student_id=?'); params.push(u.linked_id);
    } else if (u.role === 'parent') {
      where.push('n.student_id IN (SELECT student_id FROM student_parents WHERE parent_id=?)');
      params.push(u.linked_id);
    } else if (u.role === 'counselor') {
      // 规划师看到：指向自己的、指向 counselor 角色的、全局的、以及有 student_id 的
      where.push('(n.target_user_id=? OR n.target_role=? OR (n.target_role IS NULL AND n.target_user_id IS NULL) OR n.student_id IS NOT NULL)');
      params.push(u.id, 'counselor');
    } else if (u.role === 'mentor') {
      where.push('(n.student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?) OR n.target_user_id=? OR n.target_role=?)');
      params.push(u.linked_id, u.id, 'mentor');
    } else if (u.role === 'intake_staff' || u.role === 'student_admin') {
      where.push('(n.target_user_id=? OR n.target_role=?)');
      params.push(u.id, u.role);
    } else if (u.role === 'finance') {
      where.push('(n.target_user_id=? OR n.target_role=?)');
      params.push(u.id, 'finance');
    } else {
      // 其他角色：只看到指向自己的
      where.push('(n.target_user_id=? OR n.target_role=?)');
      params.push(u.id, u.role);
    }
    return { whereStr: `WHERE ${where.join(' AND ')}`, params };
  }

  // ═══════════════════════════════════════════════════════
  //  S2修复: 统一通知生成逻辑
  // ═══════════════════════════════════════════════════════

  // 统一去重检查：同一 student_id + type + 关键词，24h 内不重复
  function _notifExists(studentId, type, keyword) {
    return db.get(
      `SELECT id FROM notification_logs WHERE student_id=? AND type=? AND title LIKE ? AND created_at > datetime('now', '-1 day')`,
      [studentId, type, `%${keyword}%`]
    );
  }

  router.post('/notifications/generate', requireRole('principal','counselor','mentor'), (req, res) => {
    const created = _generateNotifications();
    res.json({ created });
  });

  // 共享的生成函数（API 和自动定时都调用此函数）
  function _generateNotifications() {
    const now = new Date();
    const policies = db.all('SELECT * FROM escalation_policies');
    let created = 0;

    // ── 1. 扫描 milestone_tasks ──
    const tasks = db.all(`SELECT mt.*, s.name as student_name FROM milestone_tasks mt
      JOIN students s ON s.id=mt.student_id
      WHERE mt.status NOT IN ('done') AND mt.due_date IS NOT NULL`);

    for (const task of tasks) {
      const due = new Date(task.due_date);
      const diffDays = Math.round((due - now) / (1000 * 60 * 60 * 24));
      for (const policy of policies) {
        const triggerDays = JSON.parse(policy.trigger_days || '[]');
        for (const td of triggerDays) {
          const shouldTrigger = (td >= 0)
            ? (diffDays <= td && diffDays >= 0)
            : (diffDays <= td);
          if (shouldTrigger) {
            // 按 task_id + trigger_days 去重（永久去重，不按24h）
            const existing = db.get('SELECT id FROM notification_logs WHERE task_id=? AND trigger_days=?', [task.id, td]);
            if (!existing) {
              const label = td > 0 ? `距截止还有 ${Math.max(diffDays,0)} 天` : (td === 0 ? '今日截止！' : `已逾期 ${Math.abs(diffDays)} 天`);
              db.run(`INSERT INTO notification_logs (id,student_id,task_id,type,trigger_days,title,message,target_role,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
                [uuidv4(), task.student_id, task.id,
                 diffDays < 0 ? 'overdue' : 'deadline_reminder', td,
                 `${task.student_name}·${task.title}｜${label}`,
                 `任务"${task.title}"截止日：${task.due_date}，当前状态：${task.status}`,
                 policy.escalate_to_role, new Date().toISOString()]);
              created++;
            }
          }
        }
      }
    }

    // ── 2. 扫描 applications 截止日 ──
    try {
      const apps = db.all(`SELECT a.*, s.name as student_name FROM applications a
        JOIN students s ON s.id=a.student_id
        WHERE a.status IN ('pending','in_progress','待提交','已提交','申请中')
          AND a.submit_deadline IS NOT NULL`);

      for (const app of apps) {
        const due = new Date(app.submit_deadline);
        const diffDays = Math.round((due - now) / (1000 * 60 * 60 * 24));
        if (diffDays <= 7) {
          const type = diffDays < 0 ? 'overdue' : 'deadline_reminder';
          const keyword = app.uni_name || app.id;
          // 统一去重
          if (!_notifExists(app.student_id, type, keyword)) {
            const title = diffDays < 0
              ? `${app.student_name}·${keyword} 申请已逾期 ${Math.abs(diffDays)} 天`
              : `${app.student_name}·${keyword} 申请距截止还有 ${diffDays} 天`;
            db.run(`INSERT INTO notification_logs (id,student_id,type,title,message,target_role,created_at) VALUES (?,?,?,?,?,?,?)`,
              [uuidv4(), app.student_id, type, title,
               `院校：${keyword}，截止日：${app.submit_deadline}`,
               'counselor', new Date().toISOString()]);
            created++;
          }
        }
      }
    } catch(e) {}

    // ── S3: 清理已完成任务/申请的过期通知 ──
    try {
      // 任务已完成 → 标记相关通知为已过期（不删除，保留记录）
      db.run(`UPDATE notification_logs SET type='resolved'
        WHERE task_id IS NOT NULL AND type IN ('deadline_reminder','overdue')
        AND task_id IN (SELECT id FROM milestone_tasks WHERE status='done')`);
      // 申请已有结果 → 清理
      db.run(`UPDATE notification_logs SET type='resolved'
        WHERE student_id IS NOT NULL AND type IN ('deadline_reminder','overdue')
        AND task_id IS NULL
        AND student_id || title IN (
          SELECT a.student_id || s.name || '·' || a.uni_name
          FROM applications a JOIN students s ON s.id=a.student_id
          WHERE a.status IN ('offer','conditional_offer','unconditional_offer','accepted','enrolled','rejected','withdrawn','offer_received','firm','insurance')
        )`);
    } catch(e) {}

    // ── S4: 清理 orphan 通知（student 已被删除的） ──
    try {
      db.run(`DELETE FROM notification_logs WHERE student_id IS NOT NULL
        AND student_id NOT IN (SELECT id FROM students)`);
    } catch(e) {}

    return created;
  }

  // 导出供 server.js 自动定时调用
  router._generateNotifications = _generateNotifications;

  // ═══════════════════════════════════════════════════════
  //  S5修复: 轻量未读计数端点
  // ═══════════════════════════════════════════════════════

  router.get('/notifications/count', requireAuth, (req, res) => {
    const u = req.session.user;
    if (u.role === 'agent') return res.json({ unread: 0 });
    const { whereStr, params } = _buildNotifWhere(u);
    // N8修复: 同时考虑旧 is_read=1 和新 notification_reads 表
    const row = db.get(`SELECT COUNT(*) as cnt FROM notification_logs n
      ${whereStr}
      AND n.type != 'resolved'
      AND n.is_read = 0
      AND n.id NOT IN (SELECT notification_id FROM notification_reads WHERE user_id=?)`,
      [...params, u.id]);
    res.json({ unread: row?.cnt || 0 });
  });

  // ═══════════════════════════════════════════════════════
  //  通知列表（S1修复: per-user is_read）
  // ═══════════════════════════════════════════════════════

  router.get('/notifications', requireAuth, (req, res) => {
    const u = req.session.user;
    if (u.role === 'agent') return res.status(403).json({ error: '权限不足' });
    const { whereStr, params } = _buildNotifWhere(u);
    // S1: LEFT JOIN notification_reads 来判断当前用户是否已读
    // N8修复: 兼容旧 is_read=1 标记（迁移前已标记的全局已读）
    const notifs = db.all(`SELECT n.*, s.name as student_name,
        CASE WHEN nr.user_id IS NOT NULL OR n.is_read = 1 THEN 1 ELSE 0 END as is_read,
        nr.read_at
      FROM notification_logs n
      LEFT JOIN students s ON s.id=n.student_id
      LEFT JOIN notification_reads nr ON nr.notification_id=n.id AND nr.user_id=?
      ${whereStr}
      AND n.type != 'resolved'
      ORDER BY n.created_at DESC LIMIT 100`,
      [u.id, ...params]);
    res.json(notifs);
  });

  // ── 标记单条已读（S1: 写入 notification_reads） ──
  router.put('/notifications/:id/read', requireAuth, (req, res) => {
    const notification = db.get('SELECT * FROM notification_logs WHERE id=?', [req.params.id]);
    if (!notification) return res.status(404).json({ error: '通知不存在' });
    const u = req.session.user;

    // 权限检查
    let canRead = false;
    if (u.role === 'principal' || u.role === 'counselor') {
      canRead = true;
    } else if (notification.target_user_id === u.id) {
      canRead = true;
    } else if (notification.target_role === u.role) {
      canRead = true;
    } else if (u.role === 'student' && notification.student_id === u.linked_id) {
      canRead = true;
    } else if (u.role === 'mentor') {
      const assignment = db.get('SELECT 1 FROM mentor_assignments WHERE staff_id=? AND student_id=?', [u.linked_id, notification.student_id]);
      if (assignment) canRead = true;
    } else if (u.role === 'parent') {
      const link = db.get('SELECT 1 FROM student_parents WHERE parent_id=? AND student_id=?', [u.linked_id, notification.student_id]);
      if (link) canRead = true;
    }

    if (!canRead) return res.status(403).json({ error: '无权操作此通知' });

    // S1: INSERT OR IGNORE — 每用户独立已读状态
    db.run('INSERT OR IGNORE INTO notification_reads (notification_id, user_id, read_at) VALUES (?,?,?)',
      [req.params.id, u.id, new Date().toISOString()]);
    res.json({ ok: true });
  });

  // ── 全部已读（S1: 批量写入 notification_reads） ──
  router.put('/notifications/read-all', requireAuth, (req, res) => {
    const u = req.session.user;
    const { whereStr, params } = _buildNotifWhere(u);
    // 查出当前用户可见且未读的通知 id
    const unreadIds = db.all(`SELECT n.id FROM notification_logs n
      ${whereStr}
      AND n.type != 'resolved'
      AND n.id NOT IN (SELECT notification_id FROM notification_reads WHERE user_id=?)`,
      [...params, u.id]);

    const now = new Date().toISOString();
    for (const row of unreadIds) {
      db.run('INSERT OR IGNORE INTO notification_reads (notification_id, user_id, read_at) VALUES (?,?,?)',
        [row.id, u.id, now]);
    }
    res.json({ ok: true, marked: unreadIds.length });
  });

  // ═══════════════════════════════════════════════════════
  //  升级策略
  // ═══════════════════════════════════════════════════════

  router.get('/escalation-policies', requireRole('principal','counselor'), (req, res) => {
    res.json(db.all('SELECT * FROM escalation_policies ORDER BY created_at'));
  });

  router.put('/escalation-policies/:id', requireRole('principal','counselor'), (req, res) => {
    const { name, trigger_days, escalate_to_role, auto_escalate_overdue_hours, apply_to_categories } = req.body;
    const _defaultEscHours = parseInt(_getSettingRaw('auto_escalate_overdue_hours', '24'));
    db.run('UPDATE escalation_policies SET name=?,trigger_days=?,escalate_to_role=?,auto_escalate_overdue_hours=?,apply_to_categories=? WHERE id=?',
      [name, JSON.stringify(trigger_days||[]), escalate_to_role||'counselor', auto_escalate_overdue_hours||_defaultEscHours,
       apply_to_categories ? JSON.stringify(apply_to_categories) : null, req.params.id]);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  //  P1.5 ENHANCED AUDIT（增强审计与合规导出）
  // ═══════════════════════════════════════════════════════

  router.get('/audit', requireRole('principal'), (req, res) => {
    const { student_id, action, entity_type, start, end, limit } = req.query;
    let where = [];
    let params = [];
    if (student_id) { where.push('entity_id=?'); params.push(student_id); }
    if (action) { where.push('action=?'); params.push(action); }
    if (entity_type) { where.push('entity=?'); params.push(entity_type); }
    if (start) { where.push("created_at >= ?"); params.push(start); }
    if (end) { where.push("created_at <= ?"); params.push(end + 'T23:59:59'); }
    const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const _auditDefaultLimit = parseInt(_getSettingRaw('audit_query_default_limit', '200'));
    const _auditMaxLimit = parseInt(_getSettingRaw('audit_query_max_limit', '1000'));
    const safeLimit = Math.min(Math.max(parseInt(limit) || _auditDefaultLimit, 1), _auditMaxLimit);
    params.push(safeLimit);
    const rows = db.all(`SELECT al.*, u.username, u.name as user_name FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id ${whereStr} ORDER BY al.created_at DESC LIMIT ?`, params);
    res.json(rows);
  });

  router.get('/audit/export', requireRole('principal'), (req, res) => {
    const { student_id, start, end } = req.query;
    let where = [];
    let params = [];
    if (student_id) { where.push('al.entity_id=?'); params.push(student_id); }
    if (start) { where.push("al.created_at >= ?"); params.push(start); }
    if (end) { where.push("al.created_at <= ?"); params.push(end + 'T23:59:59'); }
    const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const _exportMax = parseInt(_getSettingRaw('audit_export_max_records', '5000'));
    params.push(_exportMax);
    const rows = db.all(`SELECT al.*, u.username, u.name as user_name FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id ${whereStr} ORDER BY al.created_at DESC LIMIT ?`, params);
    const csv = ['时间,操作者,操作,对象类型,对象ID,详情,IP'].concat(
      rows.map(r => [r.created_at, r.user_name||r.username||'', r.action, r.entity||'', r.entity_id||'', JSON.stringify(r.detail||'').replace(/,/g,'，'), r.ip||''].join(','))
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\uFEFF' + csv);
  });

  return router;
};
