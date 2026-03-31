/**
 * routes/notifications.js — 通知、升级策略、审计日志与合规导出
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole }) {
  const router = express.Router();

  // ═══════════════════════════════════════════════════════
  //  P1.4 NOTIFICATIONS（通知与升级）
  // ═══════════════════════════════════════════════════════

  // 生成通知（按需触发，检查即将到期/已逾期任务）
  router.post('/notifications/generate', requireRole('principal','counselor'), (req, res) => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const policies = db.all('SELECT * FROM escalation_policies');
    const tasks = db.all(`SELECT mt.*, s.name as student_name FROM milestone_tasks mt JOIN students s ON s.id=mt.student_id WHERE mt.status NOT IN ('done') AND mt.due_date IS NOT NULL`);
    let created = 0;
    for (const task of tasks) {
      const due = new Date(task.due_date);
      const diffDays = Math.round((due - now) / (1000 * 60 * 60 * 24));
      for (const policy of policies) {
        const triggerDays = JSON.parse(policy.trigger_days || '[]');
        for (const td of triggerDays) {
          if (diffDays === td) {
            const existing = db.get('SELECT id FROM notification_logs WHERE task_id=? AND trigger_days=?', [task.id, td]);
            if (!existing) {
              const title = td > 0 ? `距截止还有 ${td} 天` : (td === 0 ? '今日截止！' : `已逾期 ${Math.abs(td)} 天`);
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
    res.json({ created });
  });

  router.get('/notifications', requireAuth, (req, res) => {
    const u = req.session.user;
    let where = [];
    let params = [];
    if (u.role === 'student') {
      where.push('n.student_id=?'); params.push(u.linked_id);
    } else if (u.role === 'mentor') {
      where.push('n.student_id IN (SELECT student_id FROM mentor_assignments WHERE staff_id=?)');
      params.push(u.linked_id);
    } else if (u.role === 'intake_staff' || u.role === 'student_admin') {
      // 入学管理角色：只看入学相关通知（target_role 匹配或直接点名）
      where.push('(n.target_user_id=? OR n.target_role=?)');
      params.push(u.id, u.role);
    } else {
      // 其他角色(principal/counselor)：看自己被直接点名的通知 OR 按角色广播的通知
      where.push('(n.target_user_id=? OR (n.target_role=? AND n.target_user_id IS NULL) OR (n.target_role IS NULL AND n.target_user_id IS NULL))');
      params.push(u.id, u.role);
    }
    const whereStr = `WHERE ${where.join(' AND ')}`;
    const notifs = db.all(`SELECT n.*, s.name as student_name FROM notification_logs n LEFT JOIN students s ON s.id=n.student_id ${whereStr} ORDER BY n.created_at DESC LIMIT 100`, params);
    res.json(notifs);
  });

  router.put('/notifications/:id/read', requireAuth, (req, res) => {
    db.run('UPDATE notification_logs SET is_read=1, read_at=? WHERE id=?', [new Date().toISOString(), req.params.id]);
    res.json({ ok: true });
  });

  router.put('/notifications/read-all', requireAuth, (req, res) => {
    const now = new Date().toISOString();
    const u = req.session.user;
    if (u.role === 'student') {
      db.run('UPDATE notification_logs SET is_read=1, read_at=? WHERE student_id=? AND is_read=0', [now, u.linked_id]);
    } else {
      db.run(`UPDATE notification_logs SET is_read=1, read_at=? WHERE is_read=0
        AND (target_user_id=? OR (target_role=? AND target_user_id IS NULL) OR (target_role IS NULL AND target_user_id IS NULL))`,
        [now, u.id, u.role]);
    }
    res.json({ ok: true });
  });

  router.get('/escalation-policies', requireRole('principal','counselor'), (req, res) => {
    res.json(db.all('SELECT * FROM escalation_policies ORDER BY created_at'));
  });

  router.put('/escalation-policies/:id', requireRole('principal','counselor'), (req, res) => {
    const { name, trigger_days, escalate_to_role, auto_escalate_overdue_hours, apply_to_categories } = req.body;
    db.run('UPDATE escalation_policies SET name=?,trigger_days=?,escalate_to_role=?,auto_escalate_overdue_hours=?,apply_to_categories=? WHERE id=?',
      [name, JSON.stringify(trigger_days||[]), escalate_to_role||'counselor', auto_escalate_overdue_hours||24,
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
    const safeLimit = Math.min(Math.max(parseInt(limit) || 200, 1), 1000);
    const rows = db.all(`SELECT al.*, u.username, u.name as user_name FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id ${whereStr} ORDER BY al.created_at DESC LIMIT ${safeLimit}`, params);
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
    const rows = db.all(`SELECT al.*, u.username, u.name as user_name FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id ${whereStr} ORDER BY al.created_at DESC LIMIT 5000`, params);
    const csv = ['时间,操作者,操作,对象类型,对象ID,详情,IP'].concat(
      rows.map(r => [r.created_at, r.user_name||r.username||'', r.action, r.entity||'', r.entity_id||'', JSON.stringify(r.detail||'').replace(/,/g,'，'), r.ip||''].join(','))
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  });

  return router;
};
