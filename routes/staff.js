/**
 * routes/staff.js — 教职工CRUD及资质管理
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, bcrypt, BCRYPT_COST }) {
  const router = express.Router();

  router.get('/staff', requireAuth, (req, res) => {
    const staff = db.all(`
      SELECT st.*,
        COUNT(DISTINCT ma.student_id) as current_students
      FROM staff st
      LEFT JOIN mentor_assignments ma ON ma.staff_id=st.id AND ma.end_date IS NULL
      GROUP BY st.id
      ORDER BY st.role, st.name
    `);
    res.json(staff);
  });

  router.post('/staff', requireRole('principal'), (req, res) => {
    const { name, role, subjects, exam_board_exp, capacity_students, email, phone } = req.body;
    const id = uuidv4();
    const now = new Date().toISOString();
    db.run(`INSERT INTO staff VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, name, role, JSON.stringify(subjects||[]), JSON.stringify(exam_board_exp||[]), capacity_students||20, email||'', phone||'', now, now]);
    // 创建用户账号（must_change_password=1 强制首次登录修改密码）
    const username = `staff_${name.replace(/\s/g,'')}_${Date.now()}`.substring(0,20);
    const pw = bcrypt.hashSync('123456', BCRYPT_COST);
    db.run(`INSERT INTO users (id,username,password,role,linked_id,name,created_at,must_change_password) VALUES (?,?,?,?,?,?,?,1)`,
      [uuidv4(), username, pw, role, id, name, now]);
    audit(req, 'CREATE', 'staff', id, { name, role });
    res.json({ id, username, message: '账号已创建，初始密码为 123456，首次登录后系统将强制修改密码' });
  });

  router.get('/staff/:id', requireAuth, (req, res) => {
    const staff = db.get('SELECT * FROM staff WHERE id=?', [req.params.id]);
    if (!staff) return res.status(404).json({ error: '教职工不存在' });
    const credentials = db.all('SELECT * FROM staff_credentials WHERE staff_id=?', [req.params.id]);
    const students = db.all(`
      SELECT s.id, s.name, s.grade_level, ma.role as assignment_role FROM mentor_assignments ma
      JOIN students s ON s.id=ma.student_id WHERE ma.staff_id=? AND ma.end_date IS NULL`, [req.params.id]);
    res.json({ staff, credentials, students });
  });

  router.put('/staff/:id', requireRole('principal','counselor'), (req, res) => {
    if (!db.get('SELECT id FROM staff WHERE id=?', [req.params.id])) {
      return res.status(404).json({ error: '员工不存在' });
    }
    const { name, subjects, exam_board_exp, capacity_students, email, phone } = req.body;
    db.run('UPDATE staff SET name=?,subjects=?,exam_board_exp=?,capacity_students=?,email=?,phone=?,updated_at=? WHERE id=?',
      [name, JSON.stringify(subjects||[]), JSON.stringify(exam_board_exp||[]), capacity_students, email, phone, new Date().toISOString(), req.params.id]);
    res.json({ ok: true });
  });

  router.post('/staff/:id/credentials', requireRole('principal','counselor'), (req, res) => {
    const { credential_type, issuer, issue_date, valid_until, description } = req.body;
    const cid = uuidv4();
    db.run(`INSERT INTO staff_credentials VALUES (?,?,?,?,?,?,?,?)`,
      [cid, req.params.id, credential_type, issuer||'', issue_date||'', valid_until||'', description||'', new Date().toISOString()]);
    res.json({ id: cid });
  });

  return router;
};
