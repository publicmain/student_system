/**
 * routes/notifications.js — 通知、升级策略、审计日志与合规导出
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole }) {
  const router = express.Router();

  function _getSetting(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? JSON.parse(r[0].values[0][0]) : fallback; } catch(e) { return fallback; }
  }
  function _getSettingRaw(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? r[0].values[0][0] : fallback; } catch(e) { return fallback; }
  }

  // ═══════════════════════════════════════════════════════
  //  P1.4 NOTIFICATIONS（通知与升级）
  // ═══════════════════════════════════════════════════════

  // 生成通知（按需触发，检查即将到期/已逾期任务和申请）
  router.post('/notifications/generate', requireRole('principal','counselor','mentor'), (req, res) => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const policies = db.all('SELECT * FROM escalation_policies');
    let created = 0;

    // ── 1. 扫描 milestone_tasks ──
    const tasks = db.all(`SELECT mt.*, s.name as student_name FROM milestone_tasks mt JOIN students s ON s.id=mt.student_id WHERE mt.status NOT IN ('done') AND mt.due_date IS NOT NULL`);
    for (const task of tasks) {
      const due = new Date(task.due_date);
      const diffDays = Math.round((due - now) / (1000 * 60 * 60 * 24));
      for (const policy of policies) {
        const triggerDays = JSON.parse(policy.trigger_days || '[]');
        for (const td of triggerDays) {
          // N5修复: 用范围匹配替代精确匹配
          // 正数 trigger (提前提醒): diffDays <= td 且 diffDays > 前一个更小的 trigger
          // 负数 trigger (逾期提醒): diffDays <= td
          const shouldTrigger = (td >= 0)
            ? (diffDays <= td && diffDays >= 0)   // 距截止 td 天内
            : (diffDays <= td);                    // 已逾期超过 |td| 天
          if (shouldTrigger) {
            const existing = db.get('SELECT id FROM notification_logs WHERE task_id=? AND trigger_days=?', [task.id, td]);
            if (!existing) {
              const title = td > 0 ? `距截止还有 ${Math.max(diffDays,0)} 天` : (td === 0 ? '今日截止！' : `已逾期 ${Math.abs(diffDays)} 天`);
              db.run(`INSERT INTO notification_logs (id,student_id,task_id,type,trigger_days,title,message,target_role,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
                [uuidv4(), task.student_id, task.id,
                 diffDays < 0 ? 'overdue' : 'deadline_reminder', td,
                 `${task.student_name}·${task.title}｜${title}`,
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
      const apps = db.all(`SELECT a.*, s.name as student_name FROM applications a JOIN students s ON s.id=a.student_id WHERE a.status IN ('pending','in_progress','待提交','已提交','申请中') AND a.submit_deadline IS NOT NULL`);
      for (const app of apps) {
        const due = new Date(app.submit_deadline);
        const diffDays = Math.round((due - now) / (1000 * 60 * 60 * 24));
        // 7天内到期或已逾期
        if (diffDays <= 7) {
          const type = diffDays < 0 ? 'overdue' : 'deadline_reminder';
          const existing = db.get(`SELECT id FROM notification_logs WHERE student_id=? AND type=? AND message LIKE ? AND created_at > datetime('now', '-1 day')`,
            [app.student_id, type, `%${app.uni_name || app.id}%`]);
          if (!existing) {
            const title = diffDays < 0
              ? `${app.student_name}·${app.uni_name || '院校'}申请已逾期 ${Math.abs(diffDays)} 天`
              : `${app.student_name}·${app.uni_name || '院校'}申请距截止还有 ${diffDays} 天`;
            db.run(`INSERT INTO notification_logs (id,student_id,type,title,message,target_role,created_at) VALUES (?,?,?,?,?,?,?)`,
              [uuidv4(), app.student_id, type, title,
               `院校：${app.uni_name || '未知'}，截止日：${app.submit_deadline}`,
               'counselor', new Date().toISOString()]);
            created++;
          }
        }
      }
    } catch(e) { /* applications table might not have submit_deadline */ }

    res.json({ created });
  });

  // ── 获取通知列表 ──
  router.get('/notifications', requireAuth, (req, res) => {
    const u = req.session.user;
    // agent 无权查看系统通知
    if (u.role === 'agent') return res.status(403).json({ error: '权限不足' });
    let where = [];
    let params = [];
    if (u.role === 'student') {
      where.push('n.student_id=?'); params.push(u.linked_id);
    } else if (u.role === 'parent') {
      where.push('n.student_id IN (SELECT student_id FROM student_parents WHERE parent_id=?)');
      params.push(u.linked_id);
    } else if (u.role === 'mentor') {
      // N3修复: mentor 看自己管理的学生通知 + 直接点名 + 角色广播
      where.push('(n.student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?) OR n.target_user_id=? OR n.target_role=?)');
      params.push(u.linked_id, u.id, 'mentor');
    } else if (u.role === 'intake_staff' || u.role === 'student_admin') {
      where.push('(n.target_user_id=? OR n.target_role=?)');
      params.push(u.id, u.role);
    } else if (u.role === 'finance') {
      where.push('(n.target_user_id=? OR n.target_role=?)');
      params.push(u.id, 'finance');
    } else {
      // principal/counselor：自己被直接点名 OR 按角色广播 OR 全局通知(无指定对象)
      where.push('(n.target_user_id=? OR n.target_role=? OR (n.target_role IS NULL AND n.target_user_id IS NULL))');
      params.push(u.id, u.role);
    }
    const whereStr = `WHERE ${where.join(' AND ')}`;
    const notifs = db.all(`SELECT n.*, s.name as student_name FROM notification_logs n LEFT JOIN students s ON s.id=n.student_id ${whereStr} ORDER BY n.created_at DESC LIMIT 100`, params);
    res.json(notifs);
  });

  // ── N2修复: 标记已读 — 放宽权限，只要能看到就能标记已读 ──
  router.put('/notifications/:id/read', requireAuth, (req, res) => {
    const notification = db.get('SELECT * FROM notification_logs WHERE id=?', [req.params.id]);
    if (!notification) return res.status(404).json({ error: '通知不存在' });
    const u = req.session.user;

    // 权限检查：能看到这条通知就能标记已读
    let canRead = false;
    if (u.role === 'principal' || u.role === 'counselor') {
      // principal/counselor 可以看到所有匹配的通知
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

    if (!canRead) {
      return res.status(403).json({ error: '无权操作此通知' });
    }
    db.run('UPDATE notification_logs SET is_read=1, read_at=? WHERE id=?', [new Date().toISOString(), req.params.id]);
    res.json({ ok: true });
  });

  // ── N3修复: 全部已读 — 按角色动态构建 WHERE 条件 ──
  router.put('/notifications/read-all', requireAuth, (req, res) => {
    const now = new Date().toISOString();
    const u = req.session.user;
    if (u.role === 'student') {
      db.run('UPDATE notification_logs SET is_read=1, read_at=? WHERE student_id=? AND is_read=0', [now, u.linked_id]);
    } else if (u.role === 'mentor') {
      db.run(`UPDATE notification_logs SET is_read=1, read_at=? WHERE is_read=0
        AND (student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?) OR target_user_id=? OR target_role='mentor')`,
        [now, u.linked_id, u.id]);
    } else if (u.role === 'parent') {
      db.run(`UPDATE notification_logs SET is_read=1, read_at=? WHERE is_read=0
        AND student_id IN (SELECT student_id FROM student_parents WHERE parent_id=?)`,
        [now, u.linked_id]);
    } else if (u.role === 'finance') {
      db.run(`UPDATE notification_logs SET is_read=1, read_at=? WHERE is_read=0
        AND (target_user_id=? OR target_role='finance')`, [now, u.id]);
    } else if (u.role === 'intake_staff' || u.role === 'student_admin') {
      db.run(`UPDATE notification_logs SET is_read=1, read_at=? WHERE is_read=0
        AND (target_user_id=? OR target_role=?)`, [now, u.id, u.role]);
    } else {
      // principal/counselor
      db.run(`UPDATE notification_logs SET is_read=1, read_at=? WHERE is_read=0
        AND (target_user_id=? OR target_role=? OR (target_role IS NULL AND target_user_id IS NULL))`,
        [now, u.id, u.role]);
    }
    res.json({ ok: true });
  });

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
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  });

  return router;
};
