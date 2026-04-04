/**
 * routes/essays.js — 文书管理与协作系统
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole }) {
  const router = express.Router();

  function _getSetting(key, fallback) {
    try { const r = db.exec("SELECT value FROM settings WHERE key=?", [key]); return r.length ? JSON.parse(r[0].values[0][0]) : fallback; } catch(e) { return fallback; }
  }

  function _getEssayTypes() { return _getSetting('essay_types', ['main','supplement','personal_statement','why_school','diversity','activity']); }
  function _getEssayStatuses() { return _getSetting('essay_statuses', ['collecting_material','draft','review','revision','final','submitted']); }
  function _getAnnotationStatuses() { return _getSetting('essay_annotation_statuses', ['open','accepted','rejected']); }

  // 权限检查（按角色隔离数据范围）
  function _checkAccess(req, sid) {
    const u = req.session.user;
    if (u.role === 'principal') return null; // 全局访问
    if (u.role === 'student' && u.linked_id !== sid) return '无权访问';
    if (u.role === 'parent') {
      const sp = db.get('SELECT student_id FROM student_parents WHERE student_id=? AND parent_id=?', [sid, u.linked_id]);
      if (!sp) return '无权访问';
    }
    if (u.role === 'counselor' || u.role === 'mentor') {
      const assigned = db.get('SELECT 1 FROM mentor_assignments WHERE student_id=? AND staff_id=? AND end_date IS NULL', [sid, u.linked_id]);
      if (!assigned) return '无权访问';
    }
    // intake_staff, student_admin, agent 无权访问文书
    if (['intake_staff','student_admin','agent'].includes(u.role)) return '无权访问';
    return null;
  }

  // 获取文书对应的 student_id（用于非 student-scoped 路由的权限检查）
  function _essayStudentId(essayId) {
    const e = db.get('SELECT student_id FROM essays WHERE id=?', [essayId]);
    return e ? e.student_id : null;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  文书 CRUD
  // ═══════════════════════════════════════════════════════════════════

  router.get('/students/:id/essays', requireAuth, (req, res) => {
    const err = _checkAccess(req, req.params.id);
    if (err) return res.status(403).json({ error: err });
    const essays = db.all(`SELECT e.*, ev.word_count as latest_word_count, ev.char_count as latest_char_count,
      u.name as reviewer_name, a.uni_name as app_uni_name
      FROM essays e
      LEFT JOIN essay_versions ev ON ev.essay_id=e.id AND ev.version_no=e.current_version
      LEFT JOIN users u ON u.id=e.assigned_reviewer_id
      LEFT JOIN applications a ON a.id=e.application_id
      WHERE e.student_id=? ORDER BY e.created_at DESC`, [req.params.id]);
    res.json(essays);
  });

  router.post('/students/:id/essays', requireAuth, requireRole('principal','counselor','mentor'), (req, res) => {
    const sid = req.params.id;
    const s = db.get('SELECT id FROM students WHERE id=?', [sid]);
    if (!s) return res.status(404).json({ error: '学生不存在' });
    const { application_id, essay_type, title, prompt, word_limit, assigned_reviewer_id, review_deadline, strategy_notes } = req.body;
    if (!essay_type) return res.status(400).json({ error: '文书类型必填' });
    const id = uuidv4();
    db.run(`INSERT INTO essays (id, student_id, application_id, essay_type, title, prompt, word_limit, assigned_reviewer_id, review_deadline, strategy_notes) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, sid, application_id||null, essay_type, title||null, prompt||null, word_limit||null, assigned_reviewer_id||null, review_deadline||null, strategy_notes||null]);
    audit(req, 'CREATE', 'essays', id, { essay_type, title, student_id: sid });
    res.json({ id });
  });

  router.put('/essays/:id', requireAuth, requireRole('principal','counselor','mentor'), (req, res) => {
    const essay = db.get('SELECT * FROM essays WHERE id=?', [req.params.id]);
    if (!essay) return res.status(404).json({ error: '文书不存在' });
    const { application_id, essay_type, title, prompt, word_limit, status, assigned_reviewer_id, review_deadline, strategy_notes, _expected_updated_at } = req.body;
    // 乐观锁
    if (_expected_updated_at && essay.updated_at && essay.updated_at !== _expected_updated_at) {
      return res.status(409).json({ error: '文书已被其他用户修改，请刷新后重试', current_updated_at: essay.updated_at });
    }
    if (status && !_getEssayStatuses().includes(status)) return res.status(400).json({ error: '无效状态' });
    db.run(`UPDATE essays SET application_id=?, essay_type=?, title=?, prompt=?, word_limit=?, status=?, assigned_reviewer_id=?, review_deadline=?, strategy_notes=?, updated_at=datetime('now') WHERE id=?`,
      [application_id??essay.application_id, essay_type||essay.essay_type, title??essay.title, prompt??essay.prompt, word_limit??essay.word_limit, status||essay.status, assigned_reviewer_id??essay.assigned_reviewer_id, review_deadline??essay.review_deadline, strategy_notes??essay.strategy_notes, req.params.id]);
    audit(req, 'UPDATE', 'essays', req.params.id, { title: title||essay.title, status });
    res.json({ ok: true });
  });

  router.delete('/essays/:id', requireAuth, requireRole('principal','counselor'), (req, res) => {
    const essay = db.get('SELECT * FROM essays WHERE id=?', [req.params.id]);
    if (!essay) return res.status(404).json({ error: '文书不存在' });
    db.transaction(runInTx => {
      runInTx('DELETE FROM essay_annotations WHERE essay_id=?', [req.params.id]);
      runInTx('DELETE FROM essay_versions WHERE essay_id=?', [req.params.id]);
      runInTx('DELETE FROM essays WHERE id=?', [req.params.id]);
    });
    audit(req, 'DELETE', 'essays', req.params.id, { title: essay.title });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  文书版本管理
  // ═══════════════════════════════════════════════════════════════════

  router.get('/essays/:id/versions', requireAuth, (req, res) => {
    const sid = _essayStudentId(req.params.id);
    if (!sid) return res.status(404).json({ error: '文书不存在' });
    const err = _checkAccess(req, sid);
    if (err) return res.status(403).json({ error: err });
    const versions = db.all(`SELECT ev.*, u.name as creator_name FROM essay_versions ev LEFT JOIN users u ON u.id=ev.created_by WHERE ev.essay_id=? ORDER BY ev.version_no DESC`, [req.params.id]);
    res.json(versions);
  });

  router.post('/essays/:id/versions', requireAuth, (req, res) => {
    const essay = db.get('SELECT * FROM essays WHERE id=?', [req.params.id]);
    if (!essay) return res.status(404).json({ error: '文书不存在' });
    // 学生只能编辑自己的文书
    const u = req.session.user;
    if (u.role === 'student' && u.linked_id !== essay.student_id) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') return res.status(403).json({ error: '家长无法编辑文书' });

    const { content, change_summary } = req.body;
    if (content === undefined || content === null) return res.status(400).json({ error: '文书内容必填' });

    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
    const charCount = content.length;

    // 强制字数限制检查
    if (essay.word_limit && wordCount > essay.word_limit) {
      return res.status(400).json({ error: `文书字数超限：当前 ${wordCount} 词，上限 ${essay.word_limit} 词` });
    }

    // 事务保护版本号（SELECT MAX + INSERT 必须在同一事务内防止竞态）
    const id = uuidv4();
    let versionNo;

    db.transaction(runInTx => {
      const curMax = db.get('SELECT MAX(version_no) as mv FROM essay_versions WHERE essay_id=?', [req.params.id]);
      versionNo = (curMax?.mv || 0) + 1;
      runInTx(`INSERT INTO essay_versions (id, essay_id, version_no, content, word_count, char_count, created_by, change_summary) VALUES (?,?,?,?,?,?,?,?)`,
        [id, req.params.id, versionNo, content, wordCount, charCount, u.id, change_summary||null]);
      runInTx(`UPDATE essays SET current_version=?, updated_at=datetime('now') WHERE id=?`, [versionNo, req.params.id]);
    });

    audit(req, 'CREATE', 'essay_versions', id, { essay_id: req.params.id, version_no: versionNo, word_count: wordCount });
    res.json({ id, version_no: versionNo, word_count: wordCount, char_count: charCount });
  });

  // 简单行级 diff
  router.get('/essays/:id/diff/:v1/:v2', requireAuth, (req, res) => {
    const sid = _essayStudentId(req.params.id);
    if (!sid) return res.status(404).json({ error: '文书不存在' });
    const err = _checkAccess(req, sid);
    if (err) return res.status(403).json({ error: err });

    const ver1 = db.get('SELECT content, version_no FROM essay_versions WHERE essay_id=? AND version_no=?', [req.params.id, parseInt(req.params.v1)]);
    const ver2 = db.get('SELECT content, version_no FROM essay_versions WHERE essay_id=? AND version_no=?', [req.params.id, parseInt(req.params.v2)]);
    if (!ver1 || !ver2) return res.status(404).json({ error: '版本不存在' });

    const lines1 = (ver1.content || '').split('\n');
    const lines2 = (ver2.content || '').split('\n');
    const diff = [];
    const maxLen = Math.max(lines1.length, lines2.length);
    for (let i = 0; i < maxLen; i++) {
      const l1 = lines1[i] ?? null;
      const l2 = lines2[i] ?? null;
      if (l1 === l2) {
        diff.push({ type: 'equal', content: l2 });
      } else {
        if (l1 !== null && l2 !== null) {
          diff.push({ type: 'removed', content: l1 });
          diff.push({ type: 'added', content: l2 });
        } else if (l1 === null) {
          diff.push({ type: 'added', content: l2 });
        } else {
          diff.push({ type: 'removed', content: l1 });
        }
      }
    }
    res.json({ v1: parseInt(req.params.v1), v2: parseInt(req.params.v2), diff });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  文书批注
  // ═══════════════════════════════════════════════════════════════════

  router.get('/essays/:id/annotations', requireAuth, (req, res) => {
    const sid = _essayStudentId(req.params.id);
    if (!sid) return res.status(404).json({ error: '文书不存在' });
    const err = _checkAccess(req, sid);
    if (err) return res.status(403).json({ error: err });
    res.json(db.all('SELECT * FROM essay_annotations WHERE essay_id=? ORDER BY created_at DESC', [req.params.id]));
  });

  router.post('/essays/:id/annotations', requireAuth, (req, res) => {
    const essay = db.get('SELECT * FROM essays WHERE id=?', [req.params.id]);
    if (!essay) return res.status(404).json({ error: '文书不存在' });
    const u = req.session.user;
    const { version_id, type, position_start, position_end, content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '批注内容必填' });
    // 若未提供 version_id，自动关联最新版本
    let resolvedVersionId = version_id || null;
    if (!resolvedVersionId && essay.current_version) {
      const latestVer = db.get('SELECT id FROM essay_versions WHERE essay_id=? AND version_no=?', [req.params.id, essay.current_version]);
      if (latestVer) resolvedVersionId = latestVer.id;
    }
    const id = uuidv4();
    db.run(`INSERT INTO essay_annotations (id, essay_id, version_id, annotator_id, annotator_name, type, position_start, position_end, content) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, req.params.id, resolvedVersionId, u.id, u.name||u.username, type||'general', position_start!=null?parseInt(position_start):null, position_end!=null?parseInt(position_end):null, content.trim()]);
    audit(req, 'CREATE', 'essay_annotations', id, { essay_id: req.params.id, version_id: resolvedVersionId });
    res.json({ id, version_id: resolvedVersionId });
  });

  router.put('/essay-annotations/:id', requireAuth, (req, res) => {
    const ann = db.get('SELECT * FROM essay_annotations WHERE id=?', [req.params.id]);
    if (!ann) return res.status(404).json({ error: '批注不存在' });
    const { status, content } = req.body;
    if (status && !_getAnnotationStatuses().includes(status)) return res.status(400).json({ error: '无效状态' });
    const sets = [], vals = [];
    if (status) { sets.push('status=?'); vals.push(status); }
    if (content) { sets.push('content=?'); vals.push(content.trim()); }
    if (!sets.length) return res.status(400).json({ error: '无可更新字段' });
    vals.push(req.params.id);
    db.run(`UPDATE essay_annotations SET ${sets.join(',')} WHERE id=?`, vals);
    audit(req, 'UPDATE', 'essay_annotations', req.params.id, { status });
    res.json({ ok: true });
  });

  router.delete('/essay-annotations/:id', requireAuth, requireRole('principal','counselor','mentor'), (req, res) => {
    const ann = db.get('SELECT * FROM essay_annotations WHERE id=?', [req.params.id]);
    if (!ann) return res.status(404).json({ error: '批注不存在' });
    db.run('DELETE FROM essay_annotations WHERE id=?', [req.params.id]);
    audit(req, 'DELETE', 'essay_annotations', req.params.id, {});
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  文书素材库（头脑风暴）
  // ═══════════════════════════════════════════════════════════════════

  router.get('/students/:id/essay-materials', requireAuth, (req, res) => {
    const err = _checkAccess(req, req.params.id);
    if (err) return res.status(403).json({ error: err });
    const materials = db.all(`SELECT em.*, a.name as activity_name FROM essay_materials em LEFT JOIN student_activities a ON em.related_activity_id=a.id WHERE em.student_id=? ORDER BY em.created_at DESC`, [req.params.id]);
    res.json(materials);
  });

  router.post('/students/:id/essay-materials', requireAuth, (req, res) => {
    const sid = req.params.id;
    const u = req.session.user;
    // 学生可以为自己添加素材
    if (u.role === 'student' && u.linked_id !== sid) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') return res.status(403).json({ error: '家长无法添加素材' });
    const { category, title, content, related_activity_id } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: '素材标题必填' });
    const id = uuidv4();
    db.run(`INSERT INTO essay_materials (id, student_id, category, title, content, related_activity_id) VALUES (?,?,?,?,?,?)`,
      [id, sid, category||null, title.trim(), content||null, related_activity_id||null]);
    audit(req, 'CREATE', 'essay_materials', id, { title, student_id: sid });
    res.json({ id });
  });

  router.put('/essay-materials/:id', requireAuth, (req, res) => {
    const mat = db.get('SELECT * FROM essay_materials WHERE id=?', [req.params.id]);
    if (!mat) return res.status(404).json({ error: '素材不存在' });
    const u = req.session.user;
    if (u.role === 'student' && u.linked_id !== mat.student_id) return res.status(403).json({ error: '无权访问' });
    const { category, title, content, related_activity_id } = req.body;
    db.run(`UPDATE essay_materials SET category=?, title=?, content=?, related_activity_id=?, updated_at=datetime('now') WHERE id=?`,
      [category??mat.category, title||mat.title, content??mat.content, related_activity_id??mat.related_activity_id, req.params.id]);
    audit(req, 'UPDATE', 'essay_materials', req.params.id, { title: title||mat.title });
    res.json({ ok: true });
  });

  router.delete('/essay-materials/:id', requireAuth, (req, res) => {
    const mat = db.get('SELECT * FROM essay_materials WHERE id=?', [req.params.id]);
    if (!mat) return res.status(404).json({ error: '素材不存在' });
    const u = req.session.user;
    if (u.role === 'student' && u.linked_id !== mat.student_id) return res.status(403).json({ error: '无权访问' });
    if (u.role === 'parent') return res.status(403).json({ error: '无权删除' });
    db.run('DELETE FROM essay_materials WHERE id=?', [req.params.id]);
    audit(req, 'DELETE', 'essay_materials', req.params.id, { title: mat.title });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  文书进度统计
  // ═══════════════════════════════════════════════════════════════════

  router.get('/students/:id/essay-stats', requireAuth, (req, res) => {
    const err = _checkAccess(req, req.params.id);
    if (err) return res.status(403).json({ error: err });
    const sid = req.params.id;
    const essays = db.all('SELECT status, essay_type FROM essays WHERE student_id=?', [sid]);
    const materials = db.all('SELECT id FROM essay_materials WHERE student_id=?', [sid]);

    const byStatus = {};
    const byType = {};
    essays.forEach(e => {
      byStatus[e.status] = (byStatus[e.status]||0) + 1;
      byType[e.essay_type] = (byType[e.essay_type]||0) + 1;
    });

    const total = essays.length;
    const completed = essays.filter(e => ['final','submitted'].includes(e.status)).length;
    const inReview = essays.filter(e => e.status === 'review').length;

    res.json({
      total,
      completed,
      in_review: inReview,
      completion_rate: total ? Math.round((completed / total) * 100) : 0,
      by_status: byStatus,
      by_type: byType,
      material_count: materials.length,
      statuses: _getEssayStatuses(),
      types: _getEssayTypes(),
    });
  });

  return router;
};
